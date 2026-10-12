-- Newtown, part 51: a city full of people. See docs/PEOPLE.md.
--
-- Presence. Every player stands somewhere on the map: where they last went (or home), online
-- when they've been about in the last few minutes, otherwise asleep (at home, late at night in
-- Lagos), at work (in working hours, if they have a job) or away.
--
-- Profiles. Anyone can see a player's card: where they live, their job, their best car, what
-- they've invented, who they're friends with.
--
-- Doorsteps. Knock on someone's door, leave a note, or leave a wrapped gift (one of your things;
-- it's theirs at once, waiting to be opened). They see it when they come back and can say thanks.
--
-- While you were away. What happened since you were last here, in one go.
--
-- Push. Web push subscriptions (a phone or a browser), so the game can tell you someone's at your
-- door. The game sends the push; the message itself is read from the server when it arrives.
--
-- Safe to run more than once. Run after parts 1-50.

insert into public.game_settings (key, value, note) values
  ('doorstep_per_day',     40, 'Knocks, notes and gifts each player can leave a day'),
  ('doorstep_same_per_day', 6, 'Of those, at the same door a day')
on conflict (key) do update set note = excluded.note;

alter table public.lives add column if not exists seen_at timestamptz;
-- When "while you were away" was last shown (the next one starts here).
alter table public.lives add column if not exists away_shown_at timestamptz;

create table if not exists public.doorstep (
  id bigserial primary key,
  to_user uuid not null references public.profiles (id) on delete cascade,
  from_user uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('knock', 'note', 'gift')),
  body text check (body is null or char_length(body) <= 280),
  item_id bigint references public.items (id) on delete set null,
  item_name text check (item_name is null or char_length(item_name) <= 60),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  thanked_at timestamptz
);
create index if not exists doorstep_to_idx on public.doorstep (to_user, created_at desc);
create index if not exists doorstep_from_idx on public.doorstep (from_user, created_at desc);

create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text check (p256dh is null or char_length(p256dh) <= 200),
  auth text check (auth is null or char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

/** I'm here (called while the game is open): online for the next few minutes. */
create or replace function public.people_here(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.lives set seen_at = now() where user_id = p_user
$$;

/** "lagos:12,-40/3" or "lagos:12,-40" to its x and z. */
create or replace function public.spot_xz(p_id text) returns int[]
language sql immutable as $$
  select case when p_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+'
    then array[(regexp_match(p_id, ':(-?[0-9]+),(-?[0-9]+)'))[1]::int, (regexp_match(p_id, ':(-?[0-9]+),(-?[0-9]+)'))[2]::int] end
$$;

/**
 * Where each player is and what they're up to: online (about in the last 4 minutes) at the
 * place they last went; otherwise asleep at home (23:00-06:00 in Lagos), at work (in working
 * hours, with a job), or away at home. Only players within the box (tiles), most recent first.
 */
create or replace function public.people_on_map(p_viewer uuid, p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  with hour as (select extract(hour from now() at time zone 'Africa/Lagos')::int as h),
  everyone as (
    select l.user_id, p.username, p.avatar, l.home_unit, l.at_place, l.seen_at, j.place_id as work, j.title as job,
      (l.seen_at > now() - interval '4 minutes') as online
    from public.lives l
    join public.profiles p on p.id = l.user_id and not p.is_bot
    left join public.life_jobs j on j.user_id = l.user_id
    where l.region = p_region and l.home_unit is not null and l.user_id <> p_viewer
      and not exists (select 1 from public.blocks b where (b.blocker = p_viewer and b.blocked = l.user_id) or (b.blocker = l.user_id and b.blocked = p_viewer))
  ),
  placed as (
    select e.*,
      case when e.online then 'online'
           when (select h from hour) >= 23 or (select h from hour) < 6 then 'asleep'
           when e.work is not null and (select h from hour) between 8 and 17 then 'work'
           else 'away' end as status
    from everyone e
  ),
  spots as (
    select pl.*, case when pl.status = 'online' then coalesce(pl.at_place, pl.home_unit) when pl.status = 'work' then pl.work else pl.home_unit end as spot
    from placed pl
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'name', coalesce(s.username, 'Someone'), 'avatar', s.avatar, 'status', s.status,
      'x', (public.spot_xz(s.spot))[1], 'z', (public.spot_xz(s.spot))[2], 'job', s.job, 'seenAt', s.seen_at,
      'friend', exists (select 1 from public.friendships f where f.accepted_at is not null
                         and ((f.requester = p_viewer and f.addressee = s.user_id) or (f.addressee = p_viewer and f.requester = s.user_id))))
    order by s.online desc, s.seen_at desc nulls last), '[]'::jsonb)
  from (select * from spots
        where (public.spot_xz(spot))[1] between p_x0 and p_x1 and (public.spot_xz(spot))[2] between p_z0 and p_z1
        order by online desc, seen_at desc nulls last
        limit least(greatest(coalesce(p_limit, 60), 1), 150)) s
$$;

/** A player's card, as anyone sees it. */
create or replace function public.player_card(p_viewer uuid, p_target uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'name', coalesce(p.username, 'Someone'), 'avatar', p.avatar,
    'home', l.home_unit, 'at', l.at_place, 'seenAt', l.seen_at, 'online', coalesce(l.seen_at > now() - interval '4 minutes', false),
    'job', (select jsonb_build_object('title', title, 'place', place_name) from public.life_jobs where user_id = p.id),
    'car', (select name from public.items where owner = p.id and category = 'car' order by base_value desc limit 1),
    'things', (select count(*) from public.items where owner = p.id),
    'thingsRep', coalesce((select sum(coalesce((effect->>'rep')::numeric, 0)) from public.items where owner = p.id), 0),
    'property', coalesce((select sum(price) from public.property_units where owner_id = p.id), 0),
    'units', (select count(*) from public.property_units where owner_id = p.id),
    'inventions', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'sold', sold) order by sold desc) from (select name, sold from public.item_kinds where creator = p.id order by sold desc limit 5) k), '[]'::jsonb),
    'inventionsSold', coalesce((select sum(sold) from public.item_kinds where creator = p.id), 0),
    'penalty', coalesce(l.rep_penalty, 0),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.username)) from (
        select o.id, o.username from public.friendships f
        join public.profiles o on o.id = case when f.requester = p.id then f.addressee else f.requester end
        where f.accepted_at is not null and (f.requester = p.id or f.addressee = p.id) limit 6) q), '[]'::jsonb),
    'friend', exists (select 1 from public.friendships f where f.accepted_at is not null
                       and ((f.requester = p_viewer and f.addressee = p.id) or (f.addressee = p_viewer and f.requester = p.id))),
    'blocked', exists (select 1 from public.blocks b where b.blocker = p_viewer and b.blocked = p.id)
  )
  from public.profiles p left join public.lives l on l.user_id = p.id
  where p.id = p_target and not p.is_bot
$$;

/**
 * Leave something at someone's door: a knock, a note, or a gift (one of your things, wrapped:
 * it's theirs at once). A few a day, never to someone who blocked you.
 */
create or replace function public.doorstep_leave(p_from uuid, p_to uuid, p_kind text, p_body text, p_item bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
  v_id bigint;
  v_name text;
begin
  if p_from = p_to then raise exception 'self'; end if;
  if p_kind not in ('knock', 'note', 'gift') then raise exception 'bad_kind'; end if;
  if not exists (select 1 from public.lives where user_id = p_to and home_unit is not null) then raise exception 'no_home'; end if;
  if exists (select 1 from public.blocks where blocker = p_to and blocked = p_from) then raise exception 'blocked'; end if;
  if (select count(*) from public.doorstep where from_user = p_from and created_at > now() - interval '1 day') >= public.setting('doorstep_per_day') then raise exception 'too_many'; end if;
  if (select count(*) from public.doorstep where from_user = p_from and to_user = p_to and created_at > now() - interval '1 day') >= public.setting('doorstep_same_per_day') then raise exception 'too_many_here'; end if;
  if p_kind = 'note' and (p_body is null or char_length(btrim(p_body)) < 1) then raise exception 'empty'; end if;
  if p_kind = 'gift' then
    select * into i from public.items where id = p_item for update;
    if not found or i.owner <> p_from then raise exception 'not_yours'; end if;
    if (select count(*) from public.items where owner = p_to) >= public.setting('items_max') then raise exception 'their_items_full'; end if;
    update public.items set owner = p_to, how = 'gift', got_at = now(), list_price = null, listed_at = null where id = p_item;
  end if;
  insert into public.doorstep (to_user, from_user, kind, body, item_id, item_name)
    values (p_to, p_from, p_kind, nullif(left(btrim(coalesce(p_body, '')), 280), ''), case when p_kind = 'gift' then p_item end, case when p_kind = 'gift' then i.name end)
    returning id into v_id;
  select coalesce(username, 'Someone') into v_name from public.profiles where id = p_from;
  perform public.notify(p_to, null, 'doorstep',
    case p_kind when 'knock' then v_name || ' knocked on your door.'
                when 'note' then v_name || ' left a note at your door.'
                else v_name || ' left a gift at your door!' end, null);
  return v_id;
end $$;

/** What's at your door (newest first), and how many are new. */
create or replace function public.doorstep_list(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'body', d.body, 'item', d.item_name, 'at', d.created_at,
      'opened', d.opened_at is not null, 'thanked', d.thanked_at is not null, 'from', d.from_user, 'fromName', coalesce(p.username, 'Someone'), 'fromAvatar', p.avatar)
    order by d.created_at desc, d.id desc), '[]'::jsonb)
  from (select * from public.doorstep where to_user = p_user order by created_at desc, id desc limit 60) d
  left join public.profiles p on p.id = d.from_user
$$;

/** Open what's at your door (all of it, or one). */
create or replace function public.doorstep_open(p_user uuid, p_id bigint) returns void
language sql security definer set search_path = public as $$
  update public.doorstep set opened_at = now() where to_user = p_user and opened_at is null and (p_id is null or id = p_id)
$$;

/** Say thanks for something left at your door: they hear about it. */
create or replace function public.doorstep_thank(p_user uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d public.doorstep;
begin
  select * into d from public.doorstep where id = p_id and to_user = p_user for update;
  if not found then raise exception 'not_yours'; end if;
  if d.thanked_at is not null then raise exception 'already'; end if;
  update public.doorstep set thanked_at = now(), opened_at = coalesce(opened_at, now()) where id = p_id;
  if d.from_user is not null then
    perform public.notify(d.from_user, null, 'thanks',
      (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' says thank you for ' ||
      case d.kind when 'gift' then 'the ' || coalesce(d.item_name, 'gift') when 'note' then 'your note' else 'stopping by' end || '!', null);
  end if;
end $$;

/**
 * While you were away: since you were last shown it (or last here), what came to your door, what
 * you were told, and the money that moved. Then it starts again from now.
 */
create or replace function public.away_digest(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz;
  v_out jsonb;
begin
  select coalesce(away_shown_at, seen_at, now() - interval '1 day') into v_since from public.lives where user_id = p_user;
  if v_since is null then return null; end if;
  v_out := jsonb_build_object(
    'since', v_since,
    'doorstep', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'body', d.body, 'item', d.item_name, 'fromName', coalesce(p.username, 'Someone'), 'at', d.created_at) order by d.created_at desc)
      from public.doorstep d left join public.profiles p on p.id = d.from_user where d.to_user = p_user and d.created_at > v_since), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'body', n.body, 'at', n.created_at) order by n.created_at desc)
      from (select * from public.notifications where user_id = p_user and created_at > v_since and kind <> 'doorstep' order by created_at desc limit 20) n), '[]'::jsonb),
    'money', coalesce((select jsonb_object_agg(kind, total) from (select kind, round(sum(amount), 2) as total from public.ledger
      where user_id = p_user and created_at > v_since group by kind) m), '{}'::jsonb)
  );
  update public.lives set away_shown_at = now() where user_id = p_user;
  return v_out;
end $$;

/** Keep (or move) a push subscription for a phone or browser. */
create or replace function public.push_subscribe(p_user uuid, p_endpoint text, p_p256dh text, p_auth text) returns void
language sql security definer set search_path = public as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values (left(p_endpoint, 1000), p_user, left(p_p256dh, 200), left(p_auth, 100))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now()
$$;

do $$
begin
  revoke all on table public.doorstep, public.push_subscriptions from public, anon, authenticated;
  grant all on table public.doorstep, public.push_subscriptions to service_role;
  revoke all on sequence public.doorstep_id_seq from public, anon, authenticated;
  grant all on sequence public.doorstep_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.people_here(uuid)', 'public.people_on_map(uuid, text, int, int, int, int, int)', 'public.player_card(uuid, uuid)',
    'public.doorstep_leave(uuid, uuid, text, text, bigint)', 'public.doorstep_list(uuid)', 'public.doorstep_open(uuid, bigint)',
    'public.doorstep_thank(uuid, bigint)', 'public.away_digest(uuid)', 'public.push_subscribe(uuid, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
