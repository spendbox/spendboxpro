-- Newtown, part 26: friends.
-- Players can add each other as friends. Adding someone sends them a request; once they say
-- yes you're friends in every game from then on (the town changes every hour, your friends
-- don't), and you can see where each other is in each new town. Either of you can remove the
-- other at any time (that also cancels or turns down a request).
-- Run once in Supabase → SQL Editor, after 025 (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- - One row per pair of players: who asked, who was asked, and when it was accepted (null
--   while it's still a request). Asking someone who already asked you makes you friends
--   straight away.
-- - Limits: friends_max (300) friends (and requests sent) each, friend_requests_per_day (40)
--   new requests a day.
-- - Bots, paused (frozen) and under-18 accounts can't send requests and can't be asked.
-- - Each request, and each yes, sends the other player a notification in the current game.
--
-- Coin books: nothing here moves any mint.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('friends_max',             300, 'Most friends (and requests sent) one player can have'),
  ('friend_requests_per_day', 40,  'Most friend requests one player can send in a day')
on conflict (key) do update set note = excluded.note;

-- ============================================================ the table
create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- One row per pair, whichever way round.
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security; -- no policies: only the server reads them

-- ============================================================ what the app shows
-- A player's friends, the requests waiting for them, and the ones they sent:
-- { friends: [{ id, name, avatar, level, since }], incoming: [{ id, name, avatar, level, at }],
--   outgoing: [{ id, name, avatar, level, at }] }, newest first.
create or replace function public.friends_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select f.*, case when f.requester = p_user then f.addressee else f.requester end as other
    from public.friendships f
    where f.requester = p_user or f.addressee = p_user
  ), rows as (
    select m.*, p.username, p.avatar, p.level
    from mine m join public.profiles p on p.id = m.other
  )
  select jsonb_build_object(
    'friends', coalesce((select jsonb_agg(jsonb_build_object('id', other, 'name', username, 'avatar', avatar, 'level', level, 'since', accepted_at)
                          order by accepted_at desc) from rows where accepted_at is not null), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', other, 'name', username, 'avatar', avatar, 'level', level, 'at', created_at)
                          order by created_at desc) from rows where accepted_at is null and addressee = p_user), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', other, 'name', username, 'avatar', avatar, 'level', level, 'at', created_at)
                          order by created_at desc) from rows where accepted_at is null and requester = p_user), '[]'::jsonb))
$$;

-- ============================================================ asking, saying yes, removing
-- Can this player have friends? Errors: unknown_player, bot, frozen.
create or replace function public.friend_check(p_user uuid, p_unknown text) returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.username is null then raise exception '%', p_unknown; end if;
  if p.is_bot then raise exception 'bot'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  return p;
end $$;

-- Ask someone to be friends (or say yes, if they already asked you). Returns
-- { status: 'pending' | 'friends' }. Errors: unknown_player, bot, frozen, self, no_player
-- (the other player), too_many_friends:<max>, too_many_requests:<max>.
create or replace function public.friend_request(p_user uuid, p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  them public.profiles;
  f public.friendships;
  v_round bigint := (select id from public.rounds order by id desc limit 1);
  v_max int := coalesce(public.setting('friends_max'), 300)::int;
  v_day int := coalesce(public.setting('friend_requests_per_day'), 40)::int;
begin
  if p_user = p_other then raise exception 'self'; end if;
  me := public.friend_check(p_user, 'unknown_player');
  them := public.friend_check(p_other, 'no_player');
  -- One pair at a time, so two people asking each other at once can't make two rows.
  perform pg_advisory_xact_lock(hashtextextended(least(p_user, p_other)::text || greatest(p_user, p_other)::text, 26));
  select * into f from public.friendships
  where (requester = p_user and addressee = p_other) or (requester = p_other and addressee = p_user);
  if found then
    if f.accepted_at is not null then return jsonb_build_object('status', 'friends'); end if;
    if f.requester = p_user then return jsonb_build_object('status', 'pending'); end if;
    -- They asked first: that's a yes.
    if (select count(*) from public.friendships where (requester = p_user or addressee = p_user) and accepted_at is not null) >= v_max then
      raise exception 'too_many_friends:%', v_max;
    end if;
    update public.friendships set accepted_at = now() where requester = p_other and addressee = p_user;
    perform public.notify(p_other, v_round, 'friend', coalesce(me.username, 'Someone') || ' is your friend now. You''ll see where they are in every town.');
    return jsonb_build_object('status', 'friends');
  end if;
  if (select count(*) from public.friendships where requester = p_user or addressee = p_user) >= v_max then
    raise exception 'too_many_friends:%', v_max;
  end if;
  if (select count(*) from public.friendships where requester = p_user and created_at > now() - interval '1 day') >= v_day then
    raise exception 'too_many_requests:%', v_day;
  end if;
  insert into public.friendships (requester, addressee) values (p_user, p_other);
  perform public.notify(p_other, v_round, 'friend', coalesce(me.username, 'Someone') || ' wants to be your friend. Open Friends in the menu to say yes.');
  return jsonb_build_object('status', 'pending');
end $$;

-- Say yes to a request. Returns { status: 'friends' }. Errors: unknown_player, bot, frozen,
-- no_request, too_many_friends:<max>.
create or replace function public.friend_accept(p_user uuid, p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  v_round bigint := (select id from public.rounds order by id desc limit 1);
  v_max int := coalesce(public.setting('friends_max'), 300)::int;
begin
  me := public.friend_check(p_user, 'unknown_player');
  perform 1 from public.friendships where requester = p_other and addressee = p_user and accepted_at is null for update;
  if not found then
    if exists (select 1 from public.friendships where ((requester = p_other and addressee = p_user) or (requester = p_user and addressee = p_other))
               and accepted_at is not null) then
      return jsonb_build_object('status', 'friends');
    end if;
    raise exception 'no_request';
  end if;
  if (select count(*) from public.friendships where (requester = p_user or addressee = p_user) and accepted_at is not null) >= v_max then
    raise exception 'too_many_friends:%', v_max;
  end if;
  update public.friendships set accepted_at = now() where requester = p_other and addressee = p_user;
  perform public.notify(p_other, v_round, 'friend', coalesce(me.username, 'Someone') || ' is your friend now. You''ll see where they are in every town.');
  return jsonb_build_object('status', 'friends');
end $$;

-- Remove a friend, cancel a request you sent, or turn one down (no notification either way).
-- Returns { removed: true | false }.
create or replace function public.friend_remove(p_user uuid, p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.friendships
  where (requester = p_user and addressee = p_other) or (requester = p_other and addressee = p_user);
  get diagnostics v_n = row_count;
  return jsonb_build_object('removed', v_n > 0);
end $$;

-- Players to add, by name (at least 2 letters): up to 12 real, active players whose name starts
-- with (or contains) the text, not yourself. [{ id, name, avatar, level }].
create or replace function public.find_players(p_user uuid, p_text text) returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (select lower(btrim(coalesce(p_text, ''))) as t)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', username, 'avatar', avatar, 'level', level)
                  order by starts desc, length(username), username), '[]'::jsonb)
  from (
    select p.id, p.username, p.avatar, p.level, lower(p.username) like (select t from q) || '%' as starts
    from public.profiles p
    where char_length((select t from q)) >= 2
      and p.id <> p_user and p.username is not null and not p.is_bot and not p.frozen and p.age_blocked_at is null
      and strpos(lower(p.username), (select t from q)) > 0
    order by starts desc, length(p.username), p.username
    limit 12
  ) found
$$;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.friendships from public, anon, authenticated;
  grant all on table public.friendships to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('friends_of', 'friend_check', 'friend_request', 'friend_accept', 'friend_remove', 'find_players')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
