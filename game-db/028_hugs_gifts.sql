-- Newtown, part 28: hugs, handshakes, "My gifts", thank-yous and blocking.
-- Run once in Supabase → SQL Editor, after 027 (it needs part 27's streaks).
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- - Players can send each other a hug or a handshake. Free, up to hugs_per_day (30) a day in
--   all and hugs_pair_per_day (3) a day to the same person. The other player gets a
--   notification. A hug or a handshake counts towards your daily streak, and two new side
--   quests (Town hugger, Diplomat) count them.
-- - "My gifts" lists what other players sent you (mint gifts, spraying, hugs, handshakes), with
--   a thank-you button for each (the sender gets a notification, once per gift).
-- - Blocking someone stops their hugs, handshakes, mint gifts, private messages and friend
--   requests reaching you, and ends any friendship between you. You can unblock them later.
-- - Bots, paused (frozen) and under-18 accounts can't send or receive hugs and handshakes.
--
-- Coin books: nothing here makes or burns mint (thank-yous are free).
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('hugs_per_day',      30, 'Most hugs and handshakes one player can send in a day'),
  ('hugs_pair_per_day', 3,  'Most hugs and handshakes one player can send the same person in a day')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
create table if not exists public.greetings (
  id bigserial primary key,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('hug', 'handshake')),
  created_at timestamptz not null default now(),
  thanked_at timestamptz,
  check (from_id <> to_id)
);
create index if not exists greetings_from_idx on public.greetings (from_id, created_at desc);
create index if not exists greetings_to_idx on public.greetings (to_id, created_at desc);
alter table public.greetings enable row level security; -- no policies: only the server reads them

alter table public.coin_gifts add column if not exists thanked_at timestamptz;

create table if not exists public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked);
alter table public.blocks enable row level security; -- no policies: only the server reads them

-- Has p_blocker blocked p_other?
create or replace function public.has_blocked(p_blocker uuid, p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where blocker = p_blocker and blocked = p_other)
$$;

-- ============================================================ hugs and handshakes
-- Send a hug or a handshake. Returns { kind, to, left_today }. Errors: bad_kind, self,
-- unknown_player, no_name, frozen (you), unknown_target, target_bot, target_frozen, blocked
-- (they blocked you), you_blocked (you blocked them), daily_cap:<max>, pair_cap:<max>.
create or replace function public.send_greeting(p_from uuid, p_to uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.profiles;
  t public.profiles;
  v_day timestamptz := date_trunc('day', now());
  v_today int;
  v_round bigint;
  v_q bigint;
begin
  if p_kind is null or p_kind not in ('hug', 'handshake') then raise exception 'bad_kind'; end if;
  if p_to is null or p_to = p_from then raise exception 'self'; end if;
  select * into f from public.profiles where id = p_from;
  if not found or f.is_bot then raise exception 'unknown_player'; end if;
  if f.frozen or f.age_blocked_at is not null then raise exception 'frozen'; end if;
  if f.username is null then raise exception 'no_name'; end if;
  select * into t from public.profiles where id = p_to;
  if not found or t.username is null then raise exception 'unknown_target'; end if;
  if t.is_bot then raise exception 'target_bot'; end if;
  if t.frozen or t.age_blocked_at is not null then raise exception 'target_frozen'; end if;
  if public.has_blocked(p_to, p_from) then raise exception 'blocked'; end if;
  if public.has_blocked(p_from, p_to) then raise exception 'you_blocked'; end if;
  -- One sender at a time, so quick double taps can't slip past the limits.
  perform pg_advisory_xact_lock(hashtextextended(p_from::text, 28));
  select count(*) into v_today from public.greetings where from_id = p_from and created_at >= v_day;
  if v_today >= public.setting('hugs_per_day') then raise exception 'daily_cap:%', public.setting('hugs_per_day')::int; end if;
  if (select count(*) from public.greetings where from_id = p_from and to_id = p_to and created_at >= v_day)
     >= public.setting('hugs_pair_per_day') then
    raise exception 'pair_cap:%', public.setting('hugs_pair_per_day')::int;
  end if;
  insert into public.greetings (from_id, to_id, kind) values (p_from, p_to, p_kind);
  select max(id) into v_round from public.rounds;
  perform public.notify(p_to, v_round, p_kind,
    case p_kind when 'hug' then f.username || ' gave you a hug! Open My gifts to say thank you.'
                else f.username || ' shook your hand! Open My gifts to say thank you.' end);
  select id into v_q from public.quests where user_id = p_from and status = 'active' and expires_at > now();
  if found then perform public.quest_sync(v_q); end if;
  return jsonb_build_object('kind', p_kind, 'to', t.username,
                            'left_today', greatest(public.setting('hugs_per_day')::int - v_today - 1, 0));
end $$;

-- A hug or a handshake keeps your daily streak going (part 27).
create or replace function public.streak_on_greeting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.streak_touch(new.from_id, new.kind);
  return null;
exception when others then
  raise warning 'streak (greeting) failed: %', sqlerrm;
  return null;
end $$;
drop trigger if exists greetings_streak on public.greetings;
create trigger greetings_streak after insert on public.greetings
  for each row execute function public.streak_on_greeting();

-- ============================================================ my gifts
-- What other players sent you in the last 30 days, newest first (at most 80): mint gifts,
-- spraying, hugs and handshakes. { items: [{ kind, id, from, name, avatar, amount, note, at,
-- thanked, blocked }], totals: { hugs, handshakes, mint }, sent_today, left_today }.
create or replace function public.my_gifts(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with got as (
    select g.kind, g.id, g.from_id, g.amount, g.note, g.created_at, g.thanked_at
    from public.coin_gifts g where g.to_id = p_user and g.created_at > now() - interval '30 days'
    union all
    select h.kind, h.id, h.from_id, null, null, h.created_at, h.thanked_at
    from public.greetings h where h.to_id = p_user and h.created_at > now() - interval '30 days'
  ), recent as (
    select * from got order by created_at desc limit 80
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                         'kind', r.kind, 'id', r.id, 'from', r.from_id, 'name', p.username, 'avatar', p.avatar,
                         'amount', r.amount, 'note', r.note, 'at', r.created_at, 'thanked', r.thanked_at is not null,
                         'blocked', public.has_blocked(p_user, r.from_id))
                       order by r.created_at desc)
                       from recent r join public.profiles p on p.id = r.from_id), '[]'::jsonb),
    'totals', jsonb_build_object(
      'hugs', (select count(*) from got where kind = 'hug'),
      'handshakes', (select count(*) from got where kind = 'handshake'),
      'mint', (select coalesce(sum(amount), 0) from got where kind in ('gift', 'spray'))),
    'sent_today', (select count(*) from public.greetings where from_id = p_user and created_at >= date_trunc('day', now())),
    'left_today', greatest(public.setting('hugs_per_day')::int
                           - (select count(*) from public.greetings where from_id = p_user and created_at >= date_trunc('day', now()))::int, 0))
$$;

-- Say thank you for something in My gifts (p_kind: gift, spray, hug or handshake). The sender
-- gets a notification, once per gift. Returns { already }. Errors: unknown_player, no_gift.
create or replace function public.thank_for(p_user uuid, p_kind text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  v_from uuid;
  v_amount numeric;
  v_thanked timestamptz;
  v_round bigint;
begin
  select * into me from public.profiles where id = p_user;
  if not found or me.username is null then raise exception 'unknown_player'; end if;
  if p_kind in ('gift', 'spray') then
    select from_id, amount, thanked_at into v_from, v_amount, v_thanked from public.coin_gifts
     where id = p_id and to_id = p_user and kind = p_kind for update;
  elsif p_kind in ('hug', 'handshake') then
    select from_id, null, thanked_at into v_from, v_amount, v_thanked from public.greetings
     where id = p_id and to_id = p_user and kind = p_kind for update;
  end if;
  if v_from is null then raise exception 'no_gift'; end if;
  if v_thanked is not null then return jsonb_build_object('already', true); end if;
  if p_kind in ('gift', 'spray') then
    update public.coin_gifts set thanked_at = now() where id = p_id;
  else
    update public.greetings set thanked_at = now() where id = p_id;
  end if;
  if not public.has_blocked(p_user, v_from) then
    select max(id) into v_round from public.rounds;
    perform public.notify(v_from, v_round, 'thanks', me.username || ' says thank you for ' ||
      case p_kind when 'hug' then 'the hug!' when 'handshake' then 'the handshake!'
                  when 'spray' then 'the ' || to_char(v_amount, 'FM999,999,990') || ' mint you sprayed!'
                  else 'the ' || to_char(v_amount, 'FM999,999,990') || ' mint!' end);
  end if;
  return jsonb_build_object('already', false);
end $$;

-- ============================================================ blocking
-- Block a player: their hugs, handshakes, mint gifts, private messages and friend requests no
-- longer reach you, and any friendship (or request) between you ends. Returns { blocked }.
-- Errors: self, no_player.
create or replace function public.block_player(p_user uuid, p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_other is null or p_other = p_user then raise exception 'self'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then raise exception 'no_player'; end if;
  insert into public.blocks (blocker, blocked) values (p_user, p_other) on conflict do nothing;
  delete from public.friendships
   where (requester = p_user and addressee = p_other) or (requester = p_other and addressee = p_user);
  return jsonb_build_object('blocked', true);
end $$;

-- Unblock a player. Returns { blocked: false }.
create or replace function public.unblock_player(p_user uuid, p_other uuid) returns jsonb
language sql security definer set search_path = public as $$
  with gone as (delete from public.blocks where blocker = p_user and blocked = p_other returning 1)
  select jsonb_build_object('blocked', false)
$$;

-- The players you blocked, newest first: [{ id, name, avatar, at }].
create or replace function public.blocked_players(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.username, 'avatar', p.avatar, 'at', b.created_at)
                  order by b.created_at desc), '[]'::jsonb)
  from public.blocks b join public.profiles p on p.id = b.blocked
  where b.blocker = p_user
$$;

-- Blocked players can't send you mint gifts, private messages or friend requests.
create or replace function public.blocks_gift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'gift' and public.has_blocked(new.to_id, new.from_id) then raise exception 'blocked'; end if;
  return new;
end $$;
drop trigger if exists coin_gifts_blocks on public.coin_gifts;
create trigger coin_gifts_blocks before insert on public.coin_gifts
  for each row execute function public.blocks_gift();

create or replace function public.blocks_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recipient_id is not null and public.has_blocked(new.recipient_id, new.sender_id) then raise exception 'blocked'; end if;
  return new;
end $$;
drop trigger if exists chat_messages_blocks on public.chat_messages;
create trigger chat_messages_blocks before insert on public.chat_messages
  for each row execute function public.blocks_message();

create or replace function public.blocks_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.has_blocked(new.addressee, new.requester) or public.has_blocked(new.requester, new.addressee) then
    raise exception 'blocked';
  end if;
  return new;
end $$;
drop trigger if exists friendships_blocks on public.friendships;
create trigger friendships_blocks before insert on public.friendships
  for each row execute function public.blocks_friendship();

-- ============================================================ side quests with hugs
-- A copy of the two new quests in src/lib/quests.ts.
insert into public.quest_catalog (key, title, role, brief, fits, reward, action, steps) values
  ('town_hugger', 'Town hugger', 'Today you are the town hugger.', 'Give 3 different players a hug (tap someone, then Hug).', 'any', 15, null,
   '[{"type":"greet","kind":"hug","count":3,"target":3}]'),
  ('diplomat', 'Diplomat', 'Today you are a diplomat.', 'Shake hands with 2 different players and say hi to a regular.', 'any', 20, null,
   '[{"type":"greet","kind":"handshake","count":2,"target":2},{"type":"talk_npcs","count":1,"target":1}]')
on conflict (key) do update set title = excluded.title, role = excluded.role, brief = excluded.brief, fits = excluded.fits,
  reward = excluded.reward, action = excluded.action, steps = excluded.steps;

-- Count the steps the server can check by itself (as in part 19, plus 'greet': different
-- players hugged or greeted since the quest started), then finish the quest if it's done.
create or replace function public.quest_sync(p_id bigint) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  q public.quests;
  c public.quest_catalog;
  s jsonb;
  o bigint;
  v numeric;
  v_prog jsonb;
begin
  select * into q from public.quests where id = p_id for update;
  if not found or q.status <> 'active' then return 0; end if;
  select * into c from public.quest_catalog where key = q.quest_key;
  v_prog := q.progress;
  for s, o in select e.s, e.o from jsonb_array_elements(c.steps) with ordinality e(s, o) loop
    v := case s ->> 'type'
      when 'gift' then (select coalesce(sum(g.amount), 0) from public.coin_gifts g
                        where g.from_id = q.user_id and g.kind = 'gift' and g.created_at >= q.started_at)
      when 'gift_people' then (select count(distinct g.to_id) from public.coin_gifts g
                               where g.from_id = q.user_id and g.kind = 'gift' and g.created_at >= q.started_at)
      when 'spray' then (select coalesce(sum(g.amount), 0) from public.coin_gifts g
                         where g.from_id = q.user_id and g.kind = 'spray' and g.created_at >= q.started_at)
      when 'greet' then (select count(distinct h.to_id) from public.greetings h
                         where h.from_id = q.user_id and h.created_at >= q.started_at
                           and (s ->> 'kind' is null or h.kind = s ->> 'kind'))
      when 'search_tiles' then (select count(*) from public.searches x
                                where x.seeker_id = q.user_id and x.created_at >= q.started_at)
      when 'sweep' then (select count(*) from public.sweeps x
                         where x.seeker_id = q.user_id and x.created_at >= q.started_at)
      when 'claim_event' then (select count(*) from public.ledger l
                               where l.user_id = q.user_id and l.kind in ('event_reward', 'balloon')
                                 and l.amount > 0 and l.created_at >= q.started_at)
    end;
    if v is not null then
      v := least(v, (s ->> 'target')::numeric);
      if v <> coalesce((v_prog ->> (o - 1)::int)::numeric, 0) then
        v_prog := jsonb_set(v_prog, array[(o - 1)::text], to_jsonb(v));
      end if;
    end if;
  end loop;
  if v_prog is distinct from q.progress then
    update public.quests set progress = v_prog where id = p_id;
  end if;
  return public.quest_finish(p_id);
end $$;

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['greetings', 'blocks'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  revoke all on sequence public.greetings_id_seq from public, anon, authenticated;
  grant all on sequence public.greetings_id_seq to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('has_blocked', 'send_greeting', 'streak_on_greeting', 'my_gifts', 'thank_for', 'block_player', 'unblock_player',
            'blocked_players', 'blocks_gift', 'blocks_message', 'blocks_friendship', 'quest_sync')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
