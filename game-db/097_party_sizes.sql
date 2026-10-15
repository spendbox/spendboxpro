-- Newtown, part 97: parties of any size (docs/EVENTS.md). The host picks how far a party reaches
-- (radius_m: from one spot, 50 m, to a carnival 2.5 km round, every road in it lit up), and the
-- biggest can take up to 10,000 people. Two street parties on at the same time can't be closer than
-- the old 16 tiles, nor so close that their areas meet. The server works out the price from the
-- size (src/lib/world/events.ts partyCost) as before.
--
-- Safe to run more than once. Run after part 96.

alter table public.hosted_events add column if not exists radius_m int not null default 50;
-- Up to 10,000 people (part 95 allowed 1,000).
alter table public.hosted_events drop constraint if exists hosted_events_capacity_check;
alter table public.hosted_events add constraint hosted_events_capacity_check check (capacity between 2 and 10000);
alter table public.hosted_events drop constraint if exists hosted_events_radius_m_check;
alter table public.hosted_events add constraint hosted_events_radius_m_check check (radius_m between 20 and 5000);

drop function if exists public.event_open(uuid, text, text, text, text, text, int, int, text, boolean, timestamptz, int, numeric, numeric, int, int, numeric, int);
create or replace function public.event_open(p_user uuid, p_region text, p_category text, p_format text, p_title text, p_about text,
  p_x int, p_z int, p_place text, p_on_street boolean, p_starts timestamptz, p_minutes int, p_price numeric, p_price_max numeric,
  p_capacity int, p_per_day int default 3, p_fee numeric default 0, p_gap int default 16, p_radius int default 50)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_starts timestamptz := greatest(now(), coalesce(p_starts, now()));
  v_minutes int := coalesce(p_minutes, 0);
  v_price numeric := round(coalesce(p_price, 0), 2);
  v_fee numeric := round(greatest(0, coalesce(p_fee, 0)), 2);
  v_radius int := coalesce(p_radius, 50);
  v_id bigint;
  v_ends timestamptz;
begin
  perform public.event_player(p_user);
  if p_category not in ('party', 'stage') or coalesce(p_format, '') !~ '^[a-z_]{2,20}$' then raise exception 'bad_kind'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 60 then raise exception 'bad_title'; end if;
  if v_starts > now() + interval '7 days 5 minutes' then raise exception 'too_far'; end if;
  if v_minutes < 15 or v_minutes > 240 then raise exception 'bad_length'; end if;
  if v_price < 0 or v_price > greatest(0, coalesce(p_price_max, 0)) then raise exception 'bad_price'; end if;
  if coalesce(p_capacity, 0) < 2 or p_capacity > 10000 then raise exception 'bad_capacity'; end if;
  if v_radius < 20 or v_radius > 5000 or (p_category <> 'party' and v_radius > 50) then raise exception 'bad_size'; end if;
  if public.event_hosting(p_user) is not null then raise exception 'busy'; end if;
  if (select count(*) from public.hosted_events where host_id = p_user and created_at > now() - interval '24 hours') >= greatest(1, coalesce(p_per_day, 3)) then
    raise exception 'too_many';
  end if;
  v_ends := v_starts + make_interval(mins => v_minutes);
  -- Street parties take the road: none on the same stretch at the same time, and no two whose
  -- areas meet (tiles are 100 m).
  if p_category = 'party' and coalesce(p_on_street, false) and exists (
    select 1 from public.hosted_events e
    where e.region = p_region and e.category = 'party' and e.on_street and e.status = 'on'
      and e.starts_at < v_ends and v_starts < e.ends_at
      and sqrt(power(e.x - p_x, 2) + power(e.z - p_z, 2)) < greatest(1, coalesce(p_gap, 16), (e.radius_m + v_radius) / 100.0)) then
    raise exception 'street_taken';
  end if;
  if v_fee > 0 then
    if public.life_can_spend(p_user, array['fun']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    perform public.life_spend(p_user, array['fun'], v_fee);
  end if;
  insert into public.hosted_events (host_id, region, category, format, title, about, x, z, place, on_street, starts_at, ends_at, price, capacity, host_fee, radius_m)
    values (p_user, p_region, p_category, p_format, v_title, left(coalesce(p_about, ''), 280), p_x, p_z, left(coalesce(p_place, ''), 80),
            coalesce(p_on_street, false), v_starts, v_ends, v_price, p_capacity, v_fee, v_radius)
    returning id into v_id;
  if v_fee > 0 then
    -- Held until it's over (or called off before it starts, when it comes back).
    perform public.log_coins(p_user, null, 'event_hosting', -v_fee, false, 'Hosting: ' || v_title);
  end if;
  insert into public.hosted_event_guests (event_id, user_id, going) values (v_id, p_user, true);
  return jsonb_build_object('id', v_id, 'starts_at', v_starts, 'ends_at', v_ends, 'fee', v_fee);
end $$;

/**
 * What the events list shows for each event, worked out here instead of sending every guest
 * (a carnival can have 10,000): how many are going and came in, whether p_user is going or in,
 * and the first 7 people going besides the host (for faces). One row per event id.
 */
create or replace function public.event_counts(p_ids bigint[], p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'going', (select count(*) from public.hosted_event_guests g where g.event_id = e.id and g.going),
    'came', (select count(*) from public.hosted_event_guests g where g.event_id = e.id and g.entered_at is not null),
    'me_going', coalesce((select g.going from public.hosted_event_guests g where g.event_id = e.id and g.user_id = p_user), false),
    'me_in', coalesce((select g.entered_at is not null from public.hosted_event_guests g where g.event_id = e.id and g.user_id = p_user), false),
    'faces', coalesce((select jsonb_agg(f.user_id) from (
      select g.user_id from public.hosted_event_guests g
      where g.event_id = e.id and g.going and g.user_id <> e.host_id order by g.going_at limit 7) f), '[]'::jsonb)
  )), '[]'::jsonb)
  from public.hosted_events e where e.id = any(p_ids)
$$;
revoke all on function public.event_counts(bigint[], uuid) from public, anon, authenticated;
grant execute on function public.event_counts(bigint[], uuid) to service_role;
