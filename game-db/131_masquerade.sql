-- Newtown, part 131: Masquerade (docs/MASQUERADE.md). Five minutes of chat with someone new, both
-- masked; names and faces show only if both unmask.
--
--   masq_queue     who's waiting to be matched (gone after 2 minutes without a word from them)
--   masq_sessions  each masquerade: the two players (a and b), how it's going, what each chose
--   masq_messages  what was said, kept for reports (cleared after 7 days)
--   masq_open      who's switched on Open to Masquerade (asked by pop-up when someone masks up)
--   masq_invites   those pop-ups: who asked whom, and what they said (20 seconds to answer)
--
-- The server (src/app/api/masquerade) does everything through the functions below; phones only
-- talk to each other on the masquerade's own live channel, by side ("a" or "b"), never by name.
-- Safe to run more than once. Run 128 again after it (it keeps new functions closed).

create table if not exists public.masq_queue (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  region text not null,
  mode text not null,
  x integer not null default 0,
  z integer not null default 0,
  area text,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
-- What they're here for: friends, dating, or a spicy link-up (dating and link-ups only for people
-- open to dating). Set again here so running this part again brings older copies up to date.
alter table public.masq_queue drop constraint if exists masq_queue_mode_check;
alter table public.masq_queue add constraint masq_queue_mode_check check (mode in ('friends', 'dating', 'linkup'));

-- Who they'd like to meet (men, women, anyone; aged from/to), how spicy they'd like the questions
-- (0 mild to 3 extra spicy), and who they are (their sex and age when they joined).
alter table public.masq_queue add column if not exists want text not null default 'anyone' check (want in ('men', 'women', 'anyone'));
alter table public.masq_queue add column if not exists age_min integer not null default 18;
alter table public.masq_queue add column if not exists age_max integer not null default 80;
alter table public.masq_queue add column if not exists spice integer not null default 1 check (spice between 0 and 3);
alter table public.masq_queue add column if not exists gender text;
alter table public.masq_queue add column if not exists age integer;
create index if not exists masq_queue_region_idx on public.masq_queue (region, mode, joined_at);
alter table public.masq_queue enable row level security; -- no policies: only the server reads them

create table if not exists public.masq_sessions (
  id bigserial primary key,
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  mode text not null,
  -- The live channel's secret part (only the two of them are told it).
  secret text not null,
  a_area text,
  b_area text,
  question integer not null default 0,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  extended boolean not null default false,
  a_choice text check (a_choice in ('unmask', 'pass', 'more')),
  b_choice text check (b_choice in ('unmask', 'pass', 'more')),
  status text not null default 'live' check (status in ('live', 'unmasked', 'ended')),
  ended_by uuid,
  ended_why text check (ended_why in ('pass', 'left', 'timeout', 'reported')),
  check (a <> b)
);
alter table public.masq_sessions drop constraint if exists masq_sessions_mode_check;
alter table public.masq_sessions add constraint masq_sessions_mode_check check (mode in ('friends', 'dating', 'linkup'));

-- How spicy each of them asked for (both see the other's; the questions follow the average).
alter table public.masq_sessions add column if not exists a_spice integer not null default 1;
alter table public.masq_sessions add column if not exists b_spice integer not null default 1;
create index if not exists masq_sessions_a_idx on public.masq_sessions (a, started_at desc);
create index if not exists masq_sessions_b_idx on public.masq_sessions (b, started_at desc);
create index if not exists masq_sessions_live_idx on public.masq_sessions (started_at) where status = 'live';
alter table public.masq_sessions enable row level security;

create table if not exists public.masq_messages (
  id bigserial primary key,
  session_id bigint not null references public.masq_sessions (id) on delete cascade,
  side text not null check (side in ('a', 'b')),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists masq_messages_session_idx on public.masq_messages (session_id, id);
alter table public.masq_messages enable row level security;

-- Open to Masquerade: playing or chatting as usual, but happy to be asked. Kept fresh by their
-- phone (once a minute while the game is open); gone from the asking after 150 seconds without.
-- Their live channel's secret part (token) is where the server tells them they're being asked.
create table if not exists public.masq_open (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  region text not null,
  mode text not null check (mode in ('friends', 'dating', 'linkup')),
  x integer not null default 0,
  z integer not null default 0,
  area text,
  want text not null default 'anyone' check (want in ('men', 'women', 'anyone')),
  age_min integer not null default 18,
  age_max integer not null default 80,
  spice integer not null default 1 check (spice between 0 and 3),
  gender text,
  age integer,
  token text not null,
  seen_at timestamptz not null default now()
);
create index if not exists masq_open_region_idx on public.masq_open (region, mode, seen_at);
alter table public.masq_open enable row level security;

-- "A masked guest wants to talk": asked one at a time, 20 seconds to say yes.
create table if not exists public.masq_invites (
  id bigserial primary key,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  region text not null,
  mode text not null,
  from_area text,
  from_spice integer not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'asking' check (status in ('asking', 'accepted', 'declined', 'missed')),
  -- Whether their phone has been told (the server tells it once, on the live channel).
  told boolean not null default false,
  session_id bigint references public.masq_sessions (id) on delete set null
);
create index if not exists masq_invites_to_idx on public.masq_invites (to_user, created_at desc);
create index if not exists masq_invites_from_idx on public.masq_invites (from_user, created_at desc);
alter table public.masq_invites enable row level security;

revoke all on table public.masq_queue, public.masq_sessions, public.masq_messages, public.masq_open, public.masq_invites from public, anon, authenticated;
grant all on table public.masq_queue, public.masq_sessions, public.masq_messages, public.masq_open, public.masq_invites to service_role;
grant usage, select on sequence public.masq_sessions_id_seq, public.masq_messages_id_seq, public.masq_invites_id_seq to service_role;

drop function if exists public.masq_join(uuid, text, text, integer, integer, text, text, integer, integer);

/**
 * Put on your mask: matched at once with the nearest person waiting in the same region who's here
 * for the same thing, and who fits what you asked for while you fit what they asked for (men,
 * women or anyone; their age in your range and yours in theirs). Not someone either of you
 * blocked, met in the last day, or ever reported in a masquerade. Otherwise you wait (call again
 * every few seconds: it keeps your place and tries again). Someone who hasn't said whether they're
 * a man or a woman only meets people asking for anyone. Nobody waiting who fits: someone Open to
 * Masquerade who fits is asked instead (one at a time, nearest first, 20 seconds to say yes; not
 * someone you asked today, nor someone who said no or missed one in the last 5 minutes). Returns
 * the masquerade's id, or null while waiting. Your live one, if any, comes back as it is. Errors: too_many (p_per_day today),
 * dating_off (here for dating but not open to it).
 */
create or replace function public.masq_join(
  p_user uuid, p_region text, p_mode text, p_x integer, p_z integer, p_area text,
  p_secret text, p_minutes integer, p_per_day integer,
  p_want text, p_age_min integer, p_age_max integer, p_spice integer
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_other public.masq_queue;
  v_open public.masq_open;
  v_gender text;
  v_age integer;
  v_min integer := greatest(18, least(coalesce(p_age_min, 18), 99));
  v_max integer := greatest(18, least(coalesce(p_age_max, 99), 99));
  v_spice integer := greatest(0, least(coalesce(p_spice, 1), 3));
begin
  if p_mode not in ('friends', 'dating', 'linkup') then raise exception 'bad_mode'; end if;
  if p_want not in ('men', 'women', 'anyone') then raise exception 'bad_want'; end if;
  if v_max < v_min then v_max := v_min; end if;
  select gender, extract(year from age(birth_date))::integer into v_gender, v_age from public.profiles where id = p_user;
  perform pg_advisory_xact_lock(hashtext('masq:' || p_region));
  select id into v_id from public.masq_sessions
   where status = 'live' and (a = p_user or b = p_user) and ends_at > now() - interval '90 seconds'
   order by id desc limit 1;
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.masq_sessions where (a = p_user or b = p_user) and started_at > now() - interval '1 day') >= p_per_day then
    delete from public.masq_queue where user_id = p_user;
    raise exception 'too_many';
  end if;
  if p_mode in ('dating', 'linkup') and not coalesce((select dating_open from public.profiles where id = p_user), false) then
    raise exception 'dating_off';
  end if;
  delete from public.masq_queue where seen_at < now() - interval '2 minutes';
  select q.* into v_other from public.masq_queue q
   where q.region = p_region and q.mode = p_mode and q.user_id <> p_user
     -- Each fits what the other asked for.
     and (p_want = 'anyone' or (p_want = 'men' and q.gender = 'male') or (p_want = 'women' and q.gender = 'female'))
     and (q.want = 'anyone' or (q.want = 'men' and v_gender = 'male') or (q.want = 'women' and v_gender = 'female'))
     and (q.age is null or q.age between v_min and v_max)
     and (v_age is null or v_age between q.age_min and q.age_max)
     and not exists (select 1 from public.blocks k where (k.blocker = p_user and k.blocked = q.user_id) or (k.blocker = q.user_id and k.blocked = p_user))
     and not exists (
       select 1 from public.masq_sessions s
        where ((s.a = p_user and s.b = q.user_id) or (s.a = q.user_id and s.b = p_user))
          and (s.started_at > now() - interval '1 day' or s.ended_why = 'reported'))
   order by (q.x - p_x)::bigint * (q.x - p_x) + (q.z - p_z)::bigint * (q.z - p_z), q.joined_at
   limit 1
   for update skip locked;
  if v_other.user_id is null then
    insert into public.masq_queue (user_id, region, mode, x, z, area, want, age_min, age_max, spice, gender, age)
    values (p_user, p_region, p_mode, p_x, p_z, left(p_area, 60), p_want, v_min, v_max, v_spice, v_gender, v_age)
    on conflict (user_id) do update set
      joined_at = case when public.masq_queue.region = excluded.region and public.masq_queue.mode = excluded.mode then public.masq_queue.joined_at else now() end,
      region = excluded.region, mode = excluded.mode, x = excluded.x, z = excluded.z, area = excluded.area, seen_at = now(),
      want = excluded.want, age_min = excluded.age_min, age_max = excluded.age_max, spice = excluded.spice, gender = excluded.gender, age = excluded.age;
    -- Nobody waiting: ask someone open to it (unless someone's being asked for you already).
    if not exists (select 1 from public.masq_invites where from_user = p_user and status = 'asking' and expires_at > now()) then
      select o.* into v_open from public.masq_open o
       where o.region = p_region and o.mode = p_mode and o.user_id <> p_user
         and o.seen_at > now() - interval '150 seconds'
         and (p_want = 'anyone' or (p_want = 'men' and o.gender = 'male') or (p_want = 'women' and o.gender = 'female'))
         and (o.want = 'anyone' or (o.want = 'men' and v_gender = 'male') or (o.want = 'women' and v_gender = 'female'))
         and (o.age is null or o.age between v_min and v_max)
         and (v_age is null or v_age between o.age_min and o.age_max)
         and not exists (select 1 from public.blocks k where (k.blocker = p_user and k.blocked = o.user_id) or (k.blocker = o.user_id and k.blocked = p_user))
         and not exists (
           select 1 from public.masq_sessions s
            where ((s.a = p_user and s.b = o.user_id) or (s.a = o.user_id and s.b = p_user))
              and (s.started_at > now() - interval '1 day' or s.ended_why = 'reported'))
         -- Not busy: masked up themselves, in one, or being asked by someone else.
         and not exists (select 1 from public.masq_queue q2 where q2.user_id = o.user_id)
         and not exists (select 1 from public.masq_sessions s where (s.a = o.user_id or s.b = o.user_id) and s.status = 'live' and s.ends_at > now() - interval '90 seconds')
         and not exists (select 1 from public.masq_invites i where i.to_user = o.user_id and i.status = 'asking' and i.expires_at > now())
         -- Not asked by you today; a rest after saying no (or missing one).
         and not exists (select 1 from public.masq_invites i where i.from_user = p_user and i.to_user = o.user_id and i.created_at > now() - interval '1 day')
         and not exists (select 1 from public.masq_invites i where i.to_user = o.user_id and i.status in ('declined', 'missed') and i.created_at > now() - interval '5 minutes')
         and (select count(*) from public.masq_sessions s where (s.a = o.user_id or s.b = o.user_id) and s.started_at > now() - interval '1 day') < p_per_day
       order by (o.x - p_x)::bigint * (o.x - p_x) + (o.z - p_z)::bigint * (o.z - p_z), o.seen_at desc
       limit 1
       for update skip locked;
      if v_open.user_id is not null then
        update public.masq_invites set status = 'missed' where from_user = p_user and status = 'asking';
        insert into public.masq_invites (from_user, to_user, region, mode, from_area, from_spice, expires_at)
        values (p_user, v_open.user_id, p_region, p_mode, left(p_area, 60), v_spice, now() + interval '20 seconds');
      end if;
    end if;
    return null;
  end if;
  delete from public.masq_queue where user_id in (p_user, v_other.user_id);
  update public.masq_invites set status = 'missed' where from_user in (p_user, v_other.user_id) and status = 'asking';
  insert into public.masq_sessions (a, b, mode, secret, a_area, b_area, a_spice, b_spice, ends_at)
  values (v_other.user_id, p_user, p_mode, p_secret, v_other.area, left(p_area, 60), v_other.spice, v_spice, now() + make_interval(mins => p_minutes))
  returning id into v_id;
  return v_id;
end $$;

/** Take your mask off the waiting list (and stop asking anyone for you). */
create or replace function public.masq_cancel(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.masq_queue where user_id = p_user;
  update public.masq_invites set status = 'missed' where from_user = p_user and status = 'asking';
$$;

/**
 * Open to Masquerade, switched on (and kept fresh: the phone calls again once a minute) with what
 * you'd like (the same as when you put on your mask yourself), or off. Returns your channel's
 * secret part (p_token the first time; the same one after). Errors: dating_off.
 */
create or replace function public.masq_set_open(
  p_user uuid, p_on boolean, p_region text, p_mode text, p_x integer, p_z integer, p_area text,
  p_want text, p_age_min integer, p_age_max integer, p_spice integer, p_token text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_min integer := greatest(18, least(coalesce(p_age_min, 18), 99));
  v_max integer := greatest(18, least(coalesce(p_age_max, 99), 99));
begin
  if not p_on then
    delete from public.masq_open where user_id = p_user;
    update public.masq_invites set status = 'declined' where to_user = p_user and status = 'asking';
    return null;
  end if;
  if p_mode not in ('friends', 'dating', 'linkup') then raise exception 'bad_mode'; end if;
  if p_want not in ('men', 'women', 'anyone') then raise exception 'bad_want'; end if;
  if p_mode in ('dating', 'linkup') and not coalesce((select dating_open from public.profiles where id = p_user), false) then
    raise exception 'dating_off';
  end if;
  insert into public.masq_open (user_id, region, mode, x, z, area, want, age_min, age_max, spice, gender, age, token)
  select p_user, p_region, p_mode, p_x, p_z, left(p_area, 60), p_want, v_min, greatest(v_min, v_max),
         greatest(0, least(coalesce(p_spice, 1), 3)), gender, extract(year from age(birth_date))::integer, p_token
    from public.profiles where id = p_user
  on conflict (user_id) do update set
    region = excluded.region, mode = excluded.mode, x = excluded.x, z = excluded.z, area = excluded.area,
    want = excluded.want, age_min = excluded.age_min, age_max = excluded.age_max, spice = excluded.spice,
    gender = excluded.gender, age = excluded.age, seen_at = now()
  returning token into v_token;
  return v_token;
end $$;

/**
 * Your answer to "a masked guest wants to talk": no (they ask the next person), or yes: the
 * masquerade starts (you're b; they waited, so they're a). Returns its id (null for a no).
 * Errors: gone (not yours), missed (too late, or they found someone else), too_many.
 */
create or replace function public.masq_answer(
  p_user uuid, p_invite bigint, p_yes boolean, p_secret text, p_minutes integer, p_per_day integer
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.masq_invites;
  v_q public.masq_queue;
  v_open public.masq_open;
  v_id bigint;
begin
  select * into v_inv from public.masq_invites where id = p_invite and to_user = p_user;
  if not found then raise exception 'gone'; end if;
  if not p_yes then
    update public.masq_invites set status = 'declined' where id = v_inv.id and status = 'asking';
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('masq:' || v_inv.region));
  select * into v_inv from public.masq_invites where id = p_invite for update;
  if v_inv.status = 'accepted' then return v_inv.session_id; end if;
  -- A few seconds' grace for a slow connection.
  if v_inv.status <> 'asking' or v_inv.expires_at < now() - interval '3 seconds' then
    update public.masq_invites set status = 'missed' where id = v_inv.id and status = 'asking';
    raise exception 'missed';
  end if;
  if (select count(*) from public.masq_sessions where (a = p_user or b = p_user) and started_at > now() - interval '1 day') >= p_per_day then
    raise exception 'too_many';
  end if;
  select * into v_q from public.masq_queue
   where user_id = v_inv.from_user and region = v_inv.region and mode = v_inv.mode and seen_at > now() - interval '2 minutes'
   for update;
  if not found or exists (select 1 from public.masq_sessions where (a = p_user or b = p_user) and status = 'live' and ends_at > now() - interval '90 seconds') then
    update public.masq_invites set status = 'missed' where id = v_inv.id;
    raise exception 'missed';
  end if;
  select * into v_open from public.masq_open where user_id = p_user;
  delete from public.masq_queue where user_id in (p_user, v_inv.from_user);
  insert into public.masq_sessions (a, b, mode, secret, a_area, b_area, a_spice, b_spice, ends_at)
  values (v_inv.from_user, p_user, v_inv.mode, p_secret, v_q.area, v_open.area, v_q.spice, coalesce(v_open.spice, 1), now() + make_interval(mins => p_minutes))
  returning id into v_id;
  update public.masq_invites set status = 'accepted', session_id = v_id where id = v_inv.id;
  return v_id;
end $$;

/**
 * Your choice: 'unmask' or 'more' once the time is up, 'pass' then, or 'left' any time (leaving) or
 * 'reported'. Both unmask: unmasked. Both ask for more (once): p_more minutes more. Anyone passing
 * or leaving ends it. Returns the masquerade's status afterwards. Errors: gone, not_yet.
 */
create or replace function public.masq_choose(p_user uuid, p_session bigint, p_choice text, p_more integer)
returns text
language plpgsql security definer set search_path = public as $$
declare
  s public.masq_sessions;
  v_side text;
begin
  select * into s from public.masq_sessions where id = p_session and (a = p_user or b = p_user) for update;
  if not found then raise exception 'gone'; end if;
  if s.status <> 'live' then return s.status; end if;
  v_side := case when s.a = p_user then 'a' else 'b' end;
  if p_choice in ('pass', 'left', 'reported') then
    update public.masq_sessions set status = 'ended', ended_by = p_user, ended_why = p_choice,
      a_choice = case when v_side = 'a' then 'pass' else a_choice end,
      b_choice = case when v_side = 'b' then 'pass' else b_choice end
     where id = s.id;
    return 'ended';
  end if;
  if p_choice not in ('unmask', 'more') then raise exception 'bad_choice'; end if;
  if now() < s.ends_at - interval '5 seconds' then raise exception 'not_yet'; end if;
  if v_side = 'a' then s.a_choice := p_choice; else s.b_choice := p_choice; end if;
  if s.a_choice = 'unmask' and s.b_choice = 'unmask' then
    s.status := 'unmasked';
  elsif s.a_choice = 'more' and s.b_choice = 'more' and not s.extended then
    s.ends_at := now() + make_interval(mins => p_more);
    s.extended := true;
    s.a_choice := null;
    s.b_choice := null;
  end if;
  update public.masq_sessions set a_choice = s.a_choice, b_choice = s.b_choice, status = s.status, ends_at = s.ends_at, extended = s.extended where id = s.id;
  return s.status;
end $$;

/** Time's up and nobody decided in p_decide seconds: it's over (for everyone looking). */
create or replace function public.masq_expire(p_decide integer) returns void
language sql security definer set search_path = public as $$
  update public.masq_sessions set status = 'ended', ended_why = 'timeout'
   where status = 'live' and ends_at < now() - make_interval(secs => p_decide);
  delete from public.masq_messages where created_at < now() - interval '7 days';
  update public.masq_invites set status = 'missed' where status = 'asking' and expires_at < now() - interval '10 seconds';
  delete from public.masq_invites where created_at < now() - interval '7 days';
  delete from public.masq_open where seen_at < now() - interval '1 day';
$$;

/** Say something (kept for reports). At most one message a second each. Errors: gone, too_fast. */
create or replace function public.masq_say(p_user uuid, p_session bigint, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.masq_sessions;
  v_side text;
begin
  select * into s from public.masq_sessions where id = p_session and (a = p_user or b = p_user);
  if not found or s.status = 'ended' then raise exception 'gone'; end if;
  v_side := case when s.a = p_user then 'a' else 'b' end;
  if exists (select 1 from public.masq_messages where session_id = s.id and side = v_side and created_at > now() - interval '700 milliseconds') then
    raise exception 'too_fast';
  end if;
  insert into public.masq_messages (session_id, side, body) values (s.id, v_side, left(btrim(p_body), 300));
end $$;

/** "Another question": the next one (both phones show it). */
create or replace function public.masq_next_question(p_user uuid, p_session bigint) returns integer
language sql security definer set search_path = public as $$
  update public.masq_sessions set question = question + 1
   where id = p_session and (a = p_user or b = p_user) and status = 'live'
  returning question;
$$;

revoke all on function public.masq_join(uuid, text, text, integer, integer, text, text, integer, integer, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.masq_cancel(uuid) from public, anon, authenticated;
revoke all on function public.masq_set_open(uuid, boolean, text, text, integer, integer, text, text, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.masq_answer(uuid, bigint, boolean, text, integer, integer) from public, anon, authenticated;
revoke all on function public.masq_choose(uuid, bigint, text, integer) from public, anon, authenticated;
revoke all on function public.masq_expire(integer) from public, anon, authenticated;
revoke all on function public.masq_say(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.masq_next_question(uuid, bigint) from public, anon, authenticated;
grant execute on function public.masq_join(uuid, text, text, integer, integer, text, text, integer, integer, text, integer, integer, integer) to service_role;
grant execute on function public.masq_cancel(uuid) to service_role;
grant execute on function public.masq_set_open(uuid, boolean, text, text, integer, integer, text, text, integer, integer, integer, text) to service_role;
grant execute on function public.masq_answer(uuid, bigint, boolean, text, integer, integer) to service_role;
grant execute on function public.masq_choose(uuid, bigint, text, integer) to service_role;
grant execute on function public.masq_expire(integer) to service_role;
grant execute on function public.masq_say(uuid, bigint, text) to service_role;
grant execute on function public.masq_next_question(uuid, bigint) to service_role;
