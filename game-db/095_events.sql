-- Newtown, part 95: events on the map (docs/EVENTS.md). Anyone can host an event that others come
-- to: a party (street party, owambe, concert, rave, house party, drum circle) or a stage (a talk, a
-- class, a watch party, an open mic). The host picks where (the street they're on, or a landmark,
-- a restaurant, a park...), when (now, or up to a week ahead), how long, how many can come and a
-- ticket price (free, or any amount). People say they're going, get told when it starts, and come
-- in from a few minutes before. Ticket money is held until the event is over, then 90% goes to the
-- host (the rest is the city's); if the host calls it off, everyone gets their ticket back.
-- Parties cost money to host (worked out by the server from the hours, the crowd size, the kind of
-- place and how dear the area is; it comes back if called off before it starts), and two street
-- parties can't be on the same stretch of road at the same time.
-- Hosting events people come to, and going to them, add to your reputation.
--
-- Safe to run more than once. Run after part 94.

create table if not exists public.hosted_events (
  id bigserial primary key,
  host_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  category text not null check (category in ('party', 'stage')),
  format text not null check (format ~ '^[a-z_]{2,20}$'),
  title text not null check (char_length(title) between 3 and 60),
  about text not null default '' check (char_length(about) <= 280),
  x int not null,
  z int not null,
  -- Where it is, in words ("Awolowo Road, Ikoyi", "Terra Kulture"), and whether it's on the street.
  place text not null default '' check (char_length(place) <= 80),
  on_street boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- The ticket (mint; 0 is free) and the most people who can come in (the host included).
  price numeric(14,2) not null default 0 check (price >= 0),
  capacity int not null default 300 check (capacity between 2 and 1000),
  -- Ticket money held until it's over.
  pool numeric(14,2) not null default 0,
  -- What hosting it cost (mint; parties).
  host_fee numeric(14,2) not null default 0,
  status text not null default 'on' check (status in ('on', 'cancelled', 'closed')),
  -- The people going were told it started; the host was paid (status 'closed').
  started_told boolean not null default false,
  paid_out numeric(14,2),
  -- What's on the stage now (slides or a video, src/lib/world/events.ts StageState).
  stage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint hosted_events_times check (ends_at >= starts_at)
);
-- Ending the moment it starts (the host ends it at once) is allowed (added after the first version).
alter table public.hosted_events drop constraint if exists hosted_events_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hosted_events_times') then
    alter table public.hosted_events add constraint hosted_events_times check (ends_at >= starts_at);
  end if;
end $$;
alter table public.hosted_events add column if not exists host_fee numeric(14,2) not null default 0;
create index if not exists hosted_events_region_idx on public.hosted_events (region, status, ends_at);
create index if not exists hosted_events_host_idx on public.hosted_events (host_id, created_at desc);

create table if not exists public.hosted_event_guests (
  event_id bigint not null references public.hosted_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  going boolean not null default true,
  going_at timestamptz not null default now(),
  -- Came in (the first time), and what their ticket cost.
  entered_at timestamptz,
  paid numeric(14,2) not null default 0,
  primary key (event_id, user_id)
);
create index if not exists hosted_event_guests_user_idx on public.hosted_event_guests (user_id, going_at desc);

/** A player who can take part: signed up, not a bot, not paused, with a life in the city. */
create or replace function public.event_player(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
end $$;

/** Your event that isn't over yet (coming up or on now), or null: one at a time. */
create or replace function public.event_hosting(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select id from public.hosted_events where host_id = p_user and status = 'on' and ends_at > now() order by starts_at limit 1
$$;

/**
 * Host an event. p_starts: when (now if it's in the past; at most 7 days ahead), p_minutes: how
 * long (15 to 240), p_price: the ticket in mint (0 free, at most p_price_max), p_capacity: the most
 * people (2 to 1000), p_fee: what hosting it costs (mint, paid now from Fun money then the wallet).
 * One event at a time, at most p_per_day a day. A party on the street can't be within p_gap tiles
 * of another street party on at the same time. Returns {id, starts_at, ends_at, fee}.
 */
drop function if exists public.event_open(uuid, text, text, text, text, text, int, int, text, boolean, timestamptz, int, numeric, numeric, int, int);
create or replace function public.event_open(p_user uuid, p_region text, p_category text, p_format text, p_title text, p_about text,
  p_x int, p_z int, p_place text, p_on_street boolean, p_starts timestamptz, p_minutes int, p_price numeric, p_price_max numeric,
  p_capacity int, p_per_day int default 3, p_fee numeric default 0, p_gap int default 16)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_starts timestamptz := greatest(now(), coalesce(p_starts, now()));
  v_minutes int := coalesce(p_minutes, 0);
  v_price numeric := round(coalesce(p_price, 0), 2);
  v_fee numeric := round(greatest(0, coalesce(p_fee, 0)), 2);
  v_id bigint;
  v_ends timestamptz;
begin
  perform public.event_player(p_user);
  if p_category not in ('party', 'stage') or coalesce(p_format, '') !~ '^[a-z_]{2,20}$' then raise exception 'bad_kind'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 60 then raise exception 'bad_title'; end if;
  if v_starts > now() + interval '7 days 5 minutes' then raise exception 'too_far'; end if;
  if v_minutes < 15 or v_minutes > 240 then raise exception 'bad_length'; end if;
  if v_price < 0 or v_price > greatest(0, coalesce(p_price_max, 0)) then raise exception 'bad_price'; end if;
  if coalesce(p_capacity, 0) < 2 or p_capacity > 1000 then raise exception 'bad_capacity'; end if;
  if public.event_hosting(p_user) is not null then raise exception 'busy'; end if;
  if (select count(*) from public.hosted_events where host_id = p_user and created_at > now() - interval '24 hours') >= greatest(1, coalesce(p_per_day, 3)) then
    raise exception 'too_many';
  end if;
  v_ends := v_starts + make_interval(mins => v_minutes);
  -- Street parties take the road: none on the same stretch at the same time.
  if p_category = 'party' and coalesce(p_on_street, false) and exists (
    select 1 from public.hosted_events e
    where e.region = p_region and e.category = 'party' and e.on_street and e.status = 'on'
      and e.starts_at < v_ends and v_starts < e.ends_at
      and sqrt(power(e.x - p_x, 2) + power(e.z - p_z, 2)) < greatest(1, coalesce(p_gap, 16))) then
    raise exception 'street_taken';
  end if;
  if v_fee > 0 then
    if public.life_can_spend(p_user, array['fun']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    perform public.life_spend(p_user, array['fun'], v_fee);
  end if;
  insert into public.hosted_events (host_id, region, category, format, title, about, x, z, place, on_street, starts_at, ends_at, price, capacity, host_fee)
    values (p_user, p_region, p_category, p_format, v_title, left(coalesce(p_about, ''), 280), p_x, p_z, left(coalesce(p_place, ''), 80),
            coalesce(p_on_street, false), v_starts, v_ends, v_price, p_capacity, v_fee)
    returning id into v_id;
  if v_fee > 0 then
    -- Held until it's over (or called off before it starts, when it comes back).
    perform public.log_coins(p_user, null, 'event_hosting', -v_fee, false, 'Hosting: ' || v_title);
  end if;
  insert into public.hosted_event_guests (event_id, user_id, going) values (v_id, p_user, true);
  return jsonb_build_object('id', v_id, 'starts_at', v_starts, 'ends_at', v_ends, 'fee', v_fee);
end $$;

/** Say you're going (or not any more). Returns {going, count}: how many are going now. */
create or replace function public.event_rsvp(p_user uuid, p_id bigint, p_going boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  v_count int;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  if e.host_id = p_user then raise exception 'host'; end if;
  if coalesce(p_going, true) then
    perform public.event_player(p_user);
    if not exists (select 1 from public.hosted_event_guests where event_id = p_id and user_id = p_user and going)
       and (select count(*) from public.hosted_event_guests where event_id = p_id and going) >= e.capacity then
      raise exception 'full';
    end if;
    insert into public.hosted_event_guests (event_id, user_id, going) values (p_id, p_user, true)
      on conflict (event_id, user_id) do update set going = true, going_at = case when hosted_event_guests.going then hosted_event_guests.going_at else now() end;
  else
    update public.hosted_event_guests set going = false where event_id = p_id and user_id = p_user;
  end if;
  select count(*) into v_count from public.hosted_event_guests where event_id = p_id and going;
  return jsonb_build_object('going', coalesce(p_going, true), 'count', v_count);
end $$;

/**
 * Come in: from p_early minutes before it starts (the host any time) until it ends. The ticket is
 * paid the first time (it's yours for the whole event: come and go as you like). Returns {paid, already}.
 */
create or replace function public.event_enter(p_user uuid, p_id bigint, p_early int default 5) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  g public.hosted_event_guests;
begin
  perform public.event_player(p_user);
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.status = 'cancelled' then raise exception 'cancelled'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  select * into g from public.hosted_event_guests where event_id = p_id and user_id = p_user for update;
  if found and g.entered_at is not null then
    update public.hosted_event_guests set going = true where event_id = p_id and user_id = p_user;
    return jsonb_build_object('paid', 0, 'already', true);
  end if;
  if e.host_id <> p_user and now() < e.starts_at - make_interval(mins => greatest(0, least(60, coalesce(p_early, 5)))) then
    raise exception 'not_yet';
  end if;
  if e.host_id <> p_user and (select count(*) from public.hosted_event_guests where event_id = p_id and entered_at is not null) >= e.capacity then
    raise exception 'full';
  end if;
  if e.host_id <> p_user and e.price > 0 then
    if public.life_can_spend(p_user, array['fun']) < e.price then raise exception 'not_enough:%', trim_scale(e.price); end if;
    perform public.life_spend(p_user, array['fun'], e.price);
    perform public.log_coins(p_user, null, 'event_ticket', -e.price, false, 'Event ticket: ' || e.title);
    update public.hosted_events set pool = pool + e.price where id = p_id;
  end if;
  insert into public.hosted_event_guests (event_id, user_id, going, entered_at, paid)
    values (p_id, p_user, true, now(), case when e.host_id = p_user then 0 else e.price end)
    on conflict (event_id, user_id) do update set going = true, entered_at = now(), paid = excluded.paid;
  return jsonb_build_object('paid', case when e.host_id = p_user then 0 else e.price end, 'already', false);
end $$;

/**
 * Over: pay the host their share of the ticket money (the rest is the city's) and tell them how it
 * went. Safe to call by anyone, any number of times; nothing happens before it ends.
 */
create or replace function public.event_settle(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  v_share numeric;
  v_came int;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then return 'gone'; end if;
  if e.status <> 'on' then return e.status; end if;
  if e.ends_at > now() then return 'on'; end if;
  v_share := round(e.pool * 0.9, 2);
  if v_share > 0 then
    update public.profiles set coins = coins + v_share where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_tickets', v_share, false, 'Tickets: ' || e.title);
  end if;
  if e.pool - v_share > 0 then perform public.burn(null, e.pool - v_share, 'Event tickets'); end if;
  if e.host_fee > 0 then perform public.burn(null, e.host_fee, 'Event hosting'); end if;
  select count(*) into v_came from public.hosted_event_guests where event_id = p_id and entered_at is not null and user_id <> e.host_id;
  update public.hosted_events set status = 'closed', paid_out = v_share where id = p_id;
  perform public.notify(e.host_id, null, 'event',
    format('"%s" is over. %s came%s. Thanks for hosting!', e.title, case when v_came = 1 then '1 person' else v_came || ' people' end,
           case when v_share > 0 then format(' and ₥%s of tickets is yours', trim_scale(v_share)) else '' end));
  return 'closed';
end $$;

/** The host calls it off (before or while it's on): everyone's ticket back, and the people going are told. */
create or replace function public.event_cancel(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  r record;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.host_id <> p_user then raise exception 'not_host'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  for r in select user_id, paid from public.hosted_event_guests where event_id = p_id and paid > 0 loop
    update public.profiles set coins = coins + r.paid where id = r.user_id;
    perform public.log_coins(r.user_id, null, 'event_refund', r.paid, false, 'Event called off: ' || e.title);
  end loop;
  update public.hosted_event_guests set paid = 0 where event_id = p_id;
  -- The hosting fee: back if it's called off before it starts; spent once it has started.
  if e.host_fee > 0 and now() < e.starts_at then
    update public.profiles set coins = coins + e.host_fee where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_hosting_back', e.host_fee, false, 'Hosting fee back: ' || e.title);
  elsif e.host_fee > 0 then
    perform public.burn(null, e.host_fee, 'Event hosting');
  end if;
  update public.hosted_events set status = 'cancelled', pool = 0, ends_at = least(ends_at, greatest(now(), starts_at + interval '1 second')) where id = p_id;
  for r in select user_id from public.hosted_event_guests where event_id = p_id and going and user_id <> p_user loop
    perform public.notify(r.user_id, null, 'event', format('"%s" was called off by the host.%s', e.title, case when e.price > 0 then ' Any ticket you bought is back.' else '' end));
  end loop;
  return 'cancelled';
end $$;

/** The host ends it now (it's settled at once). */
create or replace function public.event_end(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare e public.hosted_events;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.host_id <> p_user then raise exception 'not_host'; end if;
  if e.status <> 'on' then return e.status; end if;
  if e.starts_at > now() then raise exception 'not_started'; end if;
  update public.hosted_events set ends_at = now() where id = p_id and ends_at > now();
  return public.event_settle(p_id);
end $$;

/**
 * Keep a region's events moving: tell the people going when one starts (returns who was told, for
 * a push), and settle the ones that are over.
 */
create or replace function public.event_sweep(p_region text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  g record;
  v_told uuid[] := '{}';
begin
  for r in select id, title, host_id, place from public.hosted_events
           where region = p_region and status = 'on' and not started_told and starts_at <= now() and ends_at > now()
           order by starts_at limit 20 for update skip locked loop
    update public.hosted_events set started_told = true where id = r.id;
    for g in select user_id from public.hosted_event_guests where event_id = r.id and going and user_id <> r.host_id limit 300 loop
      perform public.notify(g.user_id, null, 'event', format('"%s" has started%s! Tap Events to go in.', r.title, case when r.place <> '' then ' at ' || r.place else '' end));
      v_told := v_told || g.user_id;
    end loop;
  end loop;
  for r in select id from public.hosted_events where region = p_region and status = 'on' and ends_at <= now() order by ends_at limit 20 loop
    perform public.event_settle(r.id);
  end loop;
  return to_jsonb(v_told);
end $$;

/** The host sets what's on the stage (slides or a video; kept small). */
create or replace function public.event_stage(p_user uuid, p_id bigint, p_stage jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e public.hosted_events;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.host_id <> p_user then raise exception 'not_host'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  if jsonb_typeof(coalesce(p_stage, 'null'::jsonb)) <> 'object' or octet_length(p_stage::text) > 8000 then raise exception 'bad_stage'; end if;
  update public.hosted_events set stage = p_stage where id = p_id;
end $$;

/** For reputation: events you hosted that 3+ people came to, and events of others you went to. */
create or replace function public.event_rep(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hosted', (select count(*) from public.hosted_events e where e.host_id = p_user and e.status = 'closed'
               and (select count(*) from public.hosted_event_guests g where g.event_id = e.id and g.entered_at is not null and g.user_id <> p_user) >= 3),
    'attended', (select count(*) from public.hosted_event_guests g join public.hosted_events e on e.id = g.event_id
                 where g.user_id = p_user and g.entered_at is not null and e.host_id <> p_user and e.status <> 'cancelled'))
$$;

do $$
declare f text;
begin
  revoke all on table public.hosted_events, public.hosted_event_guests from public, anon, authenticated;
  grant all on table public.hosted_events, public.hosted_event_guests to service_role;
  revoke all on sequence public.hosted_events_id_seq from public, anon, authenticated;
  grant all on sequence public.hosted_events_id_seq to service_role;
  foreach f in array array['public.event_player(uuid)', 'public.event_hosting(uuid)',
    'public.event_open(uuid, text, text, text, text, text, int, int, text, boolean, timestamptz, int, numeric, numeric, int, int, numeric, int)',
    'public.event_rsvp(uuid, bigint, boolean)', 'public.event_enter(uuid, bigint, int)', 'public.event_settle(bigint)',
    'public.event_cancel(uuid, bigint)', 'public.event_end(uuid, bigint)', 'public.event_sweep(text)',
    'public.event_stage(uuid, bigint, jsonb)', 'public.event_rep(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- Slides for talks (public pictures, uploaded by the server only).
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('events', 'events', true, 600000, array['image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
