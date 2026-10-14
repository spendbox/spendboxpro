-- Newtown, part 93: reputation from taking part (docs/REPUTATION.md). Quietly, on top of property,
-- things, map marks and challenges, reputation now grows with:
--   time   time actively spent in the game (the minutes part 73 already counts), up to 50
--   talk   real conversations: days you and someone messaged each other (both ways), up to 40
--   kind   gifts, hugs and handshakes given, and thanks for them, up to 30
--   people friends, reactions to what you say in the Town Hall, visitors signing your guestbook, up to 30
-- The rules keep it fair and hard to game:
--   - only the last 60 days count, and the older the less (worth half after about three weeks), so
--     reputation follows what you do now;
--   - every part has diminishing returns (square roots and logs): the hundredth hour adds far less
--     than the first, and talking to many people counts more than spamming one;
--   - a conversation only counts when the other person writes back; at most a few gifts and
--     greetings a day count;
--   - nothing is announced: it just shows in your reputation.
-- Worked out at most once an hour per player (kept in rep_engagement).
--
-- Run it after 073 (active time). Safe to run more than once.

create table if not exists public.rep_engagement (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  parts jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.rep_engagement enable row level security;

-- Looking up someone's recent private messages quickly.
create index if not exists chat_dm_sender_idx on public.chat_messages (sender_id, created_at desc) where recipient_id is not null;
create index if not exists chat_dm_recipient_idx on public.chat_messages (recipient_id, created_at desc) where recipient_id is not null;

/** How much a day `p_day` ago is worth now: 1 today, half after about three weeks. */
create or replace function public.rep_weight(p_at timestamptz) returns float8
language sql immutable as $$ select exp(-greatest(0, extract(epoch from (now() - p_at)) / 86400.0) / 30.0) $$;

/** The four parts of reputation from taking part, worked out now. */
create or replace function public.engagement_parts(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := now() - interval '60 days';
  v_time float8;
  v_talk float8;
  v_kind float8;
  v_friends int;
  v_reacts int;
  v_guests int;
begin
  -- Time: each active day counts by the square root of its minutes (up to 4 hours), weighted by how recent.
  select coalesce(sum(public.rep_weight(day::timestamptz) * sqrt(least(minutes, 240) / 15.0)), 0) into v_time
  from public.activity_days where user_id = p_user and day >= v_since::date;

  -- Talk: a day you and someone both wrote to each other is one exchange; per person, the square
  -- root of their (weighted) exchanges, so many real conversations beat one long one.
  with mine as (
    select recipient_id as other, created_at::date as d, max(created_at) as at from public.chat_messages
    where sender_id = p_user and recipient_id is not null and created_at >= v_since group by 1, 2
  ), theirs as (
    select sender_id as other, created_at::date as d from public.chat_messages
    where recipient_id = p_user and created_at >= v_since group by 1, 2
  ), per as (
    select m.other, sum(public.rep_weight(m.at)) as w from mine m join theirs t on t.other = m.other and t.d = m.d group by 1
  )
  select coalesce(sum(sqrt(w)), 0) into v_talk from per;

  -- Kindness: gifts given (at most 3 a day), hugs and handshakes given (at most 5 a day), and each one thanked.
  with gifts as (
    select created_at::date as d, least(count(*), 3) as n, max(created_at) as at from public.ledger
    where user_id = p_user and kind = 'gift_sent' and created_at >= v_since group by 1
  ), greets as (
    select created_at::date as d, least(count(*), 5) as n, least(count(thanked_at), 5) as thanked, max(created_at) as at from public.greetings
    where from_id = p_user and created_at >= v_since group by 1
  )
  select coalesce((select sum(public.rep_weight(at) * n * 1.0) from gifts), 0)
       + coalesce((select sum(public.rep_weight(at) * (n * 0.5 + thanked * 0.5)) from greets), 0)
    into v_kind;

  -- People: friends, people reacting to what you say in the Town Hall, and visitors signing your guestbook.
  select count(*) into v_friends from public.friendships where accepted_at is not null and (requester = p_user or addressee = p_user);
  select count(distinct r.user_id) into v_reacts from public.town_reactions r join public.chat_messages m on m.id = r.message_id
    where m.sender_id = p_user and r.user_id <> p_user and r.created_at >= v_since;
  select count(distinct author_id) into v_guests from public.home_guestbook where owner_id = p_user and author_id <> p_user and created_at >= v_since;

  return jsonb_build_object(
    'time', least(50, round(v_time * 0.8)),
    'talk', least(40, round(v_talk * 3)),
    'kind', least(30, round(sqrt(v_kind) * 4)),
    'people', least(30, least(v_friends, 10) * 2 + round(5 * ln(1 + v_reacts)) + round(3 * ln(1 + v_guests)))
  );
exception when undefined_table or undefined_column then
  -- A part of the game not set up yet: what can be counted is.
  return jsonb_build_object('time', least(50, round(coalesce(v_time, 0) * 0.8)), 'talk', least(40, round(coalesce(v_talk, 0) * 3)), 'kind', 0, 'people', 0);
end $$;

/** Your reputation from taking part: kept for an hour, then worked out again. */
create or replace function public.engagement_rep(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rep_engagement;
  v jsonb;
begin
  select * into r from public.rep_engagement where user_id = p_user;
  if found and r.computed_at > now() - interval '1 hour' then return r.parts; end if;
  v := public.engagement_parts(p_user);
  insert into public.rep_engagement (user_id, parts, computed_at) values (p_user, v, now())
    on conflict (user_id) do update set parts = excluded.parts, computed_at = excluded.computed_at;
  return v;
end $$;

do $$
declare f text;
begin
  revoke all on table public.rep_engagement from public, anon, authenticated;
  grant all on table public.rep_engagement to service_role;
  foreach f in array array['public.engagement_parts(uuid)', 'public.engagement_rep(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
