-- HIDE & SEEK, part 14: chat in places (buildings and hot-air balloons) instead of one city room.
-- Run once in Supabase → SQL Editor, after 013_ads_v2.sql (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces three functions.
--
-- How rooms work:
--   room = 'b:<tile>'      everyone inside that building
--   room = 'balloon:<k>'   everyone riding hot-air balloon k (0 … 50)
--   room = '*'             a message shown in every room (the bot's teases)
--   room = null            a private message (recipient_id is set)
-- Who is inside which place is tracked live in the browser (Realtime presence), not here.

-- ============================================================ room column
alter table public.chat_messages add column if not exists room text;

-- Messages from before this part were in the one "City" room; park them in a room nobody
-- can enter so they never show up in a building.
update public.chat_messages set room = 'city' where room is null and recipient_id is null;

alter table public.chat_messages drop constraint if exists chat_messages_room_check;
alter table public.chat_messages add constraint chat_messages_room_check check (
  (recipient_id is not null and room is null)
  or (recipient_id is null and room is not null and (
        room = '*' or room = 'city'
        or room ~ '^b:[0-9]{1,7}$'
        or room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'))
);

-- Anything still written the old way (no room, not private) goes to the old "City" room,
-- so an older copy of the app keeps working while the new one goes live.
create or replace function public.chat_default_room() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.room is null and new.recipient_id is null then new.room := 'city'; end if;
  return new;
end $$;
drop trigger if exists chat_default_room on public.chat_messages;
create trigger chat_default_room before insert on public.chat_messages
  for each row execute function public.chat_default_room();

create index if not exists chat_room_idx on public.chat_messages (round_id, room, id);
-- For the "not so fast" check (recent messages by one person).
create index if not exists chat_sender_idx on public.chat_messages (sender_id, created_at desc);

-- ============================================================ room names
-- True for a room a player can post in: 'b:<tile>' or 'balloon:<0..50>'.
create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_room ~ '^b:[0-9]{1,7}$' or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$', false)
$$;

-- ============================================================ sending
-- Every player message goes through here (the server calls it after checking the login).
-- Exactly one of p_room / p_to. Text up to 500 characters, or a voice note.
-- Pace: at most 1 message a second and 10 messages in 20 seconds per person.
-- Errors (the app turns these into friendly words):
--   no_name, frozen, no_round, bad_target, bad_room, bad_recipient, empty, too_long, too_fast
create or replace function public.chat_send(
  p_user uuid, p_room text, p_to uuid, p_body text, p_audio_path text default null, p_audio_seconds int default null
) returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_round bigint;
  v_role text;
  v_to_name text;
  v_body text;
  v_recent int;
  v_last timestamptz;
  m public.chat_messages;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot or p.username is null or trim(p.username) = '' then raise exception 'no_name'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  select max(id) into v_round from public.rounds;
  if v_round is null then raise exception 'no_round'; end if;

  if (p_room is null) = (p_to is null) then raise exception 'bad_target'; end if;
  if p_room is not null and not public.chat_room_ok(p_room) then raise exception 'bad_room'; end if;
  if p_to is not null then
    if p_to = p_user then raise exception 'bad_recipient'; end if;
    select username into v_to_name from public.profiles where id = p_to and not is_bot and username is not null;
    if v_to_name is null then raise exception 'bad_recipient'; end if;
  end if;

  v_body := nullif(trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')), '');
  if v_body is null and p_audio_path is null then raise exception 'empty'; end if;
  if char_length(v_body) > 500 then raise exception 'too_long'; end if;

  -- One person at a time, so quick double taps can't slip past the pace check.
  perform pg_advisory_xact_lock(hashtext('chat:' || p_user::text));
  select count(*), max(created_at) into v_recent, v_last
    from public.chat_messages where sender_id = p_user and created_at > now() - interval '20 seconds';
  if v_recent >= 10 or (v_last is not null and v_last > now() - interval '1 second') then
    raise exception 'too_fast';
  end if;

  select coalesce(role, 'watcher') into v_role from public.entries where round_id = v_round and user_id = p_user;
  insert into public.chat_messages
    (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, room, body, audio_path, audio_seconds)
  values
    (v_round, p_user, p.username, coalesce(v_role, 'watcher'), p_to, v_to_name, p_room, v_body, p_audio_path,
     case when p_audio_path is null then null else greatest(1, least(60, coalesce(p_audio_seconds, 1))) end)
  returning * into m;
  return m;
end $$;

-- ============================================================ the bot's teases
-- Same as part 6, but the tease now goes to every room at once (room '*'), because the
-- database can't see who is standing where.
create or replace function public.bot_tease(p_round bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_due timestamptz;
  v_open text[] := array['Psst.', 'Hello, detectives.', 'Still looking?', 'Ahem.', 'Knock knock.', 'Is it hot in here or is it just me?',
    'Breaking news:', 'Fun fact:', 'Hmm.', 'Okay, okay.', 'Dear seekers,', 'Quick update from the shadows:'];
  v_mid text[] := array[
    'I can hear you tapping the wrong roofs.', 'I''ve had %s coins of searches walk right past me.', 'The pool is %s coins. Imagine.',
    'You''ve checked %s spots and I''m still comfy.', 'I can see a drone. It can''t see me.', 'I''m closer than you think. Or am I?',
    'Somebody just searched next door. Rude.', '%s minutes left and I''ve barely broken a sweat.', 'My hiding spot has a lovely view.',
    'I''ve moved %s times. Or have I?', 'Try the tall buildings. Actually, don''t.', 'There are %s of you and one of me.'];
  v_end text[] := array['😏', '🙈', 'Toodles!', 'Catch me if you can.', 'Not even warm.', 'Good luck with that.', 'Tick tock.', '👀',
    'I believe in you. Sort of.', 'Back to my nap.', ''];
  v_mid_pick text;
  v_body text;
  v_seekers int;
begin
  select * into r from public.rounds where id = p_round;
  if r.status <> 'seek' or r.bot_teases >= public.setting('bot_teases') then return 'quiet'; end if;
  select * into e from public.entries where round_id = p_round and user_id = '00000000-0000-0000-0000-00000000b07a';
  if not found or e.caught then return 'quiet'; end if;
  -- Spread the teases over the hunt: the first after ~8-15 min, the next after ~30-40 min.
  v_due := r.join_ends_at + make_interval(mins => (case when r.bot_teases = 0 then 8 + (r.id % 8) else 30 + (r.id % 11) end)::int);
  if now() < v_due then return 'waiting'; end if;
  select count(*) into v_seekers from public.entries where round_id = p_round and role = 'seeker';
  v_mid_pick := v_mid[1 + floor(random() * array_length(v_mid, 1))::int];
  v_body := format(v_mid_pick,
    case
      when v_mid_pick like '%%coins of searches%%' then (select coalesce(round(sum(cost)), 0)::text from public.searches where round_id = p_round)
      when v_mid_pick like '%%pool%%' then round(r.pool)::text
      when v_mid_pick like '%%checked%%' then r.searched_count::text
      when v_mid_pick like '%%minutes left%%' then greatest(1, ceil(extract(epoch from (r.seek_ends_at - now())) / 60))::text
      when v_mid_pick like '%%moved%%' then e.moves::text
      when v_mid_pick like '%%of you%%' then greatest(v_seekers, 2)::text
      else ''
    end);
  v_body := trim(v_open[1 + floor(random() * array_length(v_open, 1))::int] || ' ' || v_body || ' ' ||
                 v_end[1 + floor(random() * array_length(v_end, 1))::int]);
  insert into public.chat_messages (round_id, sender_id, sender_name, sender_role, room, body)
    values (p_round, '00000000-0000-0000-0000-00000000b07a', coalesce(r.bot_name, 'The bot') || ' (bot)', 'hider', '*', left(v_body, 500));
  update public.rounds set bot_teases = bot_teases + 1 where id = p_round;
  return 'teased';
end $$;

-- ============================================================ who may call what
-- Only the server (service role) runs these; players never call them directly.
revoke all on function public.chat_send(uuid, text, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.chat_send(uuid, text, uuid, text, text, int) to service_role;
revoke all on function public.bot_tease(bigint) from public, anon, authenticated;
grant execute on function public.bot_tease(bigint) to service_role;
grant execute on function public.chat_room_ok(text) to service_role;
