-- Newtown, part 102: faster at scale (docs/COSTS.md, "What's above budget and slows things down").
-- 1. Where each player is, kept as numbers (worked out from their home and where they are now),
--    with indexes, so "who's on this part of the map" and "who's nearest" stop reading every
--    player's row and pattern-matching it.
-- 2. Indexes for lookups that read whole tables (the round's ledger and events, the bank's day,
--    challenge wins, who came to an event, notices not swept away, who's online).
-- 3. notify_many: one notice to many players in one go (not one call each).
-- 4. notices_sweep: notices older than 30 days go (run daily, a batch at a time).
--
-- Safe to run more than once. Run after parts 86 and 101.

-- ============================================================ 1. positions
alter table public.lives add column if not exists home_x int
  generated always as ((regexp_match(home_unit, ':(-?[0-9]+),(-?[0-9]+)'))[1]::int) stored;
alter table public.lives add column if not exists home_z int
  generated always as ((regexp_match(home_unit, ':(-?[0-9]+),(-?[0-9]+)'))[2]::int) stored;
alter table public.lives add column if not exists at_x int
  generated always as ((regexp_match(coalesce(at_place, home_unit), ':(-?[0-9]+),(-?[0-9]+)'))[1]::int) stored;
alter table public.lives add column if not exists at_z int
  generated always as ((regexp_match(coalesce(at_place, home_unit), ':(-?[0-9]+),(-?[0-9]+)'))[2]::int) stored;
create index if not exists lives_home_xz_idx on public.lives (region, home_x, home_z);
create index if not exists lives_at_xz_idx on public.lives (region, at_x, at_z);
create index if not exists lives_region_seen_idx on public.lives (region, seen_at desc);

-- People on this part of the map: only players whose home or whereabouts fall in the box are
-- looked at (as part 86, otherwise the same).
create or replace function public.people_on_map(p_viewer uuid, p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  with hour as (select extract(hour from now() at time zone 'Africa/Lagos')::int as h),
  everyone as (
    select l.user_id, p.username, p.avatar, l.home_unit, l.at_place, l.seen_at,
      (l.seen_at > now() - interval '4 minutes') as online
    from public.lives l
    join public.profiles p on p.id = l.user_id and not p.is_bot
    where l.region = p_region and l.home_unit is not null and l.user_id <> p_viewer
      and ((l.home_x between p_x0 and p_x1 and l.home_z between p_z0 and p_z1)
        or (l.at_x between p_x0 and p_x1 and l.at_z between p_z0 and p_z1))
      and not exists (select 1 from public.blocks b where (b.blocker = p_viewer and b.blocked = l.user_id) or (b.blocker = l.user_id and b.blocked = p_viewer))
  ),
  placed as (
    select e.*,
      case when e.online then 'online'
           when (select h from hour) >= 23 or (select h from hour) < 6 then 'asleep'
           else 'away' end as status
    from everyone e
  ),
  spots as (
    select pl.*, case when pl.status = 'online' then coalesce(pl.at_place, pl.home_unit) else pl.home_unit end as spot
    from placed pl
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'name', coalesce(s.username, 'Someone'), 'avatar', s.avatar, 'status', s.status,
      'x', (public.spot_xz(s.spot))[1], 'z', (public.spot_xz(s.spot))[2], 'job', null, 'seenAt', s.seen_at,
      'friend', exists (select 1 from public.friendships f where f.accepted_at is not null
                         and ((f.requester = p_viewer and f.addressee = s.user_id) or (f.addressee = p_viewer and f.requester = s.user_id))))
    order by s.online desc, s.seen_at desc nulls last), '[]'::jsonb)
  from (select * from spots
        where (public.spot_xz(spot))[1] between p_x0 and p_x1 and (public.spot_xz(spot))[2] between p_z0 and p_z1
        order by online desc, seen_at desc nulls last
        limit least(greatest(coalesce(p_limit, 60), 1), 150)) s
$$;

-- Who hears about a new event (as part 101), from the kept positions.
create or replace function public.event_tell(p_region text, p_x int, p_z int, p_want int, p_tiles int, p_skip uuid[], p_body text)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_want int := least(greatest(coalesce(p_want, 0), 0), 20000);
  v_tiles int := least(greatest(coalesce(p_tiles, 40), 0), 200);
  v_told uuid[];
begin
  with d as (
    select l.user_id, (l.at_x - p_x)::bigint * (l.at_x - p_x) + (l.at_z - p_z)::bigint * (l.at_z - p_z) as d2
    from public.lives l
    join public.profiles p on p.id = l.user_id and not p.is_bot and not p.frozen
    where l.region = p_region and l.at_x is not null
      and not (l.user_id = any(coalesce(p_skip, '{}')))
  ), pick as (
    select user_id from d where d2 <= v_tiles * v_tiles
    union
    select user_id from (select user_id from d order by d2 limit v_want) n
  ), ins as (
    insert into public.notifications (user_id, round_id, kind, body)
    select user_id, null, 'event', left(p_body, 500) from pick
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_told from ins;
  return v_told;
end $$;
revoke all on function public.event_tell(text, int, int, int, int, uuid[], text) from public, anon, authenticated;
grant execute on function public.event_tell(text, int, int, int, int, uuid[], text) to service_role;

-- ============================================================ 2. indexes
create index if not exists ledger_round_idx on public.ledger (round_id, kind) where round_id is not null;
create index if not exists events_round_idx on public.events (round_id, id desc);
create index if not exists world_bank_ledger_at_idx on public.world_bank_ledger (created_at);
create index if not exists challenges_winner_idx on public.challenges (winner_id) where status = 'done';
create index if not exists hosted_event_guests_came_idx on public.hosted_event_guests (event_id) where entered_at is not null;
create index if not exists notifications_live_idx on public.notifications (user_id, id desc) where dismissed_at is null;
create index if not exists notifications_age_idx on public.notifications (created_at);

-- ============================================================ 3. one notice, many players
create or replace function public.notify_many(p_users uuid[], p_kind text, p_body text) returns int
language sql security definer set search_path = public as $$
  with ins as (
    insert into public.notifications (user_id, round_id, kind, body)
    select u, null, p_kind, left(p_body, 500)
    from (select distinct unnest(p_users) as u) x
    join public.profiles p on p.id = x.u and not p.is_bot
    returning 1
  )
  select count(*)::int from ins
$$;
revoke all on function public.notify_many(uuid[], text, text) from public, anon, authenticated;
grant execute on function public.notify_many(uuid[], text, text) to service_role;

-- ============================================================ 4. old notices go
-- Up to p_batch at a time (the daily job calls it until it says 0), so it never holds big locks.
create or replace function public.notices_sweep(p_days int default 30, p_batch int default 20000) returns int
language sql security definer set search_path = public as $$
  with old as (
    select id from public.notifications where created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 7))
    order by created_at limit least(greatest(coalesce(p_batch, 20000), 1), 100000)
  ), del as (
    delete from public.notifications n using old where n.id = old.id returning 1
  )
  select count(*)::int from del
$$;
revoke all on function public.notices_sweep(int, int) from public, anon, authenticated;
grant execute on function public.notices_sweep(int, int) to service_role;
