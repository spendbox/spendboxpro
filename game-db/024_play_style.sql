-- Newtown, part 24: play styles ("This game you were The Explorer: 5 buildings visited…").
-- Run once in Supabase → SQL Editor, after parts 1–23.
-- Safe to run again: it only adds what is missing, refreshes the style rules and replaces
-- functions (the play_diary_hours setting keeps any value you changed).
--
-- At the end of a game every player gets a play style: one of twelve (The Explorer, The Tourist,
-- The Detective, The Phantom, The Escape Artist, The Socialite, The Party Animal, The Foodie,
-- The High Roller, The Master Thief, The Gamer, The Sports Fan). Over time each player builds up
-- a mix ("40% Explorer, 25% Detective…").
--
-- - The app keeps a diary of the game on the player's phone (buildings, rides, food, time in the
--   club…) and sends it once, when the results open: save_play_diary. Each number is capped to a
--   sane maximum (play_counters), unknown numbers are dropped. The phone can fib, but that only
--   changes the player's own fun profile: nothing here ever moves mint.
-- - What the server knows for sure (searches, drone sweeps, catches, ghost moves, staying hidden,
--   shields and decoys, bets, match tickets, gifts, sprays, thefts, side quests, town events,
--   chat messages, mini game claims, chats with the locals) is counted here and replaces (or tops
--   up) what the phone says. Food and drink orders are only in the diary: the server doesn't keep
--   each order.
-- - A diary is accepted once per player per game, only for a finished game (within
--   play_diary_hours of the end) the player took part in or visited during: an entry, a check-in
--   (play_check_in, which the app calls once while a game is on), or anything the server counted.
-- - The style is worked out here, the same way as src/lib/play-style.ts: points per style =
--   weight × number (up to a cap) from play_style_rules; most points wins; a dead heat goes to the
--   rarer style (play_style_kinds.tie); no points at all: The Explorer. Change both together.
-- - Lifetime: each game adds its style mix (points shared out so they add up to 1) to
--   play_style_totals, so my_play_style can show the proportions as bars.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('play_diary_hours', 48, 'Hours after a game ends that its play diary can still be saved')
on conflict (key) do nothing;

-- ============================================================ the styles and their rules
-- A copy of STYLES / COUNTERS / RULES in src/lib/play-style.ts.
create table if not exists public.play_style_kinds (
  style text primary key,
  title text not null,
  tie int not null            -- breaks a dead heat: the lower number wins
);

create table if not exists public.play_counters (
  counter text primary key,
  max int not null check (max >= 0),
  -- who knows it best: the app ('client'), the server ('server': replaces the app's number),
  -- or both ('max': the bigger one counts)
  source text not null check (source in ('client', 'server', 'max'))
);

create table if not exists public.play_style_rules (
  style text not null references public.play_style_kinds (style) on delete cascade on update cascade,
  counter text not null references public.play_counters (counter) on delete cascade on update cascade,
  weight int not null check (weight between 0 and 100),
  cap int not null check (cap between 0 and 10000),
  primary key (style, counter)
);

with v (style, title, tie) as (values
  ('explorer',    'The Explorer',      12),
  ('tourist',     'The Tourist',       10),
  ('detective',   'The Detective',      4),
  ('phantom',     'The Phantom',        2),
  ('escape',      'The Escape Artist',  3),
  ('socialite',   'The Socialite',     11),
  ('party',       'The Party Animal',   7),
  ('foodie',      'The Foodie',         8),
  ('high_roller', 'The High Roller',    5),
  ('thief',       'The Master Thief',   1),
  ('gamer',       'The Gamer',          9),
  ('sports_fan',  'The Sports Fan',     6)
), gone as (
  delete from public.play_style_kinds k where not exists (select 1 from v where v.style = k.style)
)
insert into public.play_style_kinds (style, title, tie) select style, title, tie from v
on conflict (style) do update set title = excluded.title, tie = excluded.tie;

with v (counter, max, source) as (values
  -- only the app sees these
  ('buildings', 60, 'client'), ('rooms', 150, 'client'), ('roofs', 40, 'client'),
  ('clubs', 30, 'client'), ('club_minutes', 70, 'client'), ('restaurants', 30, 'client'),
  ('arenas', 20, 'client'), ('arena_minutes', 70, 'client'),
  ('ride_balloon', 20, 'client'), ('ride_train', 30, 'client'), ('ride_bus', 30, 'client'),
  ('ride_car', 30, 'client'), ('ride_boat', 30, 'client'), ('ride_ferris', 30, 'client'),
  ('ride_slide', 40, 'client'), ('photos', 60, 'client'), ('seats', 60, 'client'),
  ('seat_minutes', 70, 'client'), ('slots', 100, 'client'),
  ('orders_food', 40, 'client'), ('orders_drink', 40, 'client'),
  -- both: the bigger number counts
  ('npc_chats', 60, 'max'), ('arcade_games', 100, 'max'), ('party_games', 60, 'max'), ('games_won', 100, 'max'),
  -- the server knows these for sure
  ('searches', 5000, 'server'), ('sweeps', 1000, 'server'), ('catches', 1000, 'server'),
  ('hunter', 1, 'server'), ('ghost', 1, 'server'), ('survived', 1, 'server'),
  ('moves', 50, 'server'), ('tricks', 3, 'server'),
  ('bets', 100, 'server'), ('bets_won', 100, 'server'), ('bet_mint', 100000, 'server'), ('tickets', 50, 'server'),
  ('gifts', 200, 'server'), ('gift_mint', 1000000, 'server'), ('sprays', 200, 'server'), ('spray_mint', 1000000, 'server'),
  ('steals', 50, 'server'), ('quests_done', 20, 'server'), ('thief_quests', 20, 'server'),
  ('events', 50, 'server'), ('chats', 2000, 'server')
), gone as (
  delete from public.play_counters c where not exists (select 1 from v where v.counter = c.counter)
)
insert into public.play_counters (counter, max, source) select counter, max, source from v
on conflict (counter) do update set max = excluded.max, source = excluded.source;

with v (style, counter, weight, cap) as (values
  ('explorer', 'buildings', 4, 15), ('explorer', 'rooms', 1, 30), ('explorer', 'roofs', 2, 10), ('explorer', 'events', 4, 5),
  ('tourist', 'ride_balloon', 5, 6), ('tourist', 'ride_train', 4, 8), ('tourist', 'ride_bus', 3, 8), ('tourist', 'ride_car', 3, 8),
  ('tourist', 'ride_boat', 4, 8), ('tourist', 'ride_ferris', 4, 6), ('tourist', 'ride_slide', 3, 8), ('tourist', 'photos', 4, 6),
  ('detective', 'catches', 8, 6), ('detective', 'searches', 1, 40), ('detective', 'sweeps', 2, 10), ('detective', 'hunter', 2, 1),
  ('phantom', 'survived', 20, 1), ('phantom', 'ghost', 4, 1),
  ('escape', 'moves', 6, 5), ('escape', 'tricks', 6, 3),
  ('socialite', 'npc_chats', 3, 10), ('socialite', 'gifts', 4, 5), ('socialite', 'chats', 1, 30), ('socialite', 'seat_minutes', 1, 15),
  ('party', 'club_minutes', 1, 30), ('party', 'sprays', 5, 6), ('party', 'clubs', 4, 6), ('party', 'party_games', 3, 10),
  ('foodie', 'orders_food', 4, 10), ('foodie', 'orders_drink', 3, 10), ('foodie', 'restaurants', 3, 6),
  ('high_roller', 'bets', 6, 10), ('high_roller', 'bets_won', 4, 10), ('high_roller', 'slots', 2, 10),
  ('thief', 'steals', 12, 3), ('thief', 'thief_quests', 8, 3), ('thief', 'quests_done', 3, 5),
  ('gamer', 'arcade_games', 3, 15), ('gamer', 'games_won', 2, 15),
  ('sports_fan', 'tickets', 8, 5), ('sports_fan', 'arenas', 4, 5), ('sports_fan', 'arena_minutes', 1, 30)
), gone as (
  delete from public.play_style_rules r where not exists (select 1 from v where v.style = r.style and v.counter = r.counter)
)
insert into public.play_style_rules (style, counter, weight, cap) select style, counter, weight, cap from v
on conflict (style, counter) do update set weight = excluded.weight, cap = excluded.cap;

-- ============================================================ tables
-- "I was in town during this game": the app checks in once while a game is on, so players who
-- only walked around (nothing the server would otherwise see) can still save their diary.
create table if not exists public.play_check_ins (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

-- One diary per player per game: the numbers (app + server, capped), the points per style and
-- the style that won. client = the app's own numbers after capping (kept to compare).
create table if not exists public.play_diaries (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  counters jsonb not null default '{}'::jsonb,
  client jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  style text not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);
create index if not exists play_diaries_user_idx on public.play_diaries (user_id, created_at desc);

-- Lifetime totals per player: scores = each style's share added up over all games (so the
-- shares add up to games), tops = games each style came out on top.
create table if not exists public.play_style_totals (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  tops jsonb not null default '{}'::jsonb,
  games int not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================ the maths
-- Keep only known numbers: whole, 0 or more, at most their max. Anything else counts as 0.
create or replace function public.play_clean(p_counters jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(c.counter, v.n) filter (where v.n > 0), '{}'::jsonb)
  from public.play_counters c
  cross join lateral (
    select case when jsonb_typeof(p_counters) = 'object' and jsonb_typeof(p_counters -> c.counter) = 'number'
                then least(greatest(floor((p_counters ->> c.counter)::numeric), 0), c.max)
                else 0 end as n
  ) v
$$;

-- The app's numbers plus the server's: 'client' numbers from the app, 'server' numbers from the
-- server, 'max' numbers whichever is bigger. Both sides should already be cleaned.
create or replace function public.play_merge(p_client jsonb, p_server jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(c.counter, v.n) filter (where v.n > 0), '{}'::jsonb)
  from public.play_counters c
  cross join lateral (
    select case c.source
             when 'client' then coalesce((p_client ->> c.counter)::numeric, 0)
             when 'server' then coalesce((p_server ->> c.counter)::numeric, 0)
             else greatest(coalesce((p_client ->> c.counter)::numeric, 0), coalesce((p_server ->> c.counter)::numeric, 0))
           end as n
  ) v
$$;

-- Points for every style: { "explorer": 24, "detective": 0, … }.
create or replace function public.play_scores(p_counters jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(k.style, coalesce(s.score, 0)), '{}'::jsonb)
  from public.play_style_kinds k
  left join (
    select r.style, sum(r.weight * least(coalesce((p_counters ->> r.counter)::numeric, 0), r.cap)) as score
    from public.play_style_rules r
    group by r.style
  ) s on s.style = k.style
$$;

-- The winning style (dead heat: lowest tie number). No points at all: the explorer.
create or replace function public.play_pick(p_scores jsonb) returns text
language sql stable set search_path = public as $$
  select case when coalesce((p_scores ->> k.style)::numeric, 0) > 0 then k.style else 'explorer' end
  from public.play_style_kinds k
  order by coalesce((p_scores ->> k.style)::numeric, 0) desc, k.tie
  limit 1
$$;

-- One game's style mix: each style's share of the points (4 decimals), adding up to exactly 1
-- (the winner takes the rounding). No points: all of it to the winner.
create or replace function public.play_shares(p_scores jsonb, p_top text) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_total numeric;
  v_rest numeric := 0;
  v_out jsonb := '{}'::jsonb;
  k record;
begin
  select coalesce(sum(greatest(coalesce((p_scores ->> style)::numeric, 0), 0)), 0) into v_total from public.play_style_kinds;
  if v_total <= 0 then return jsonb_build_object(p_top, 1); end if;
  for k in
    select style, round(greatest(coalesce((p_scores ->> style)::numeric, 0), 0) / v_total, 4) as s
    from public.play_style_kinds where style <> p_top
  loop
    if k.s > 0 then
      v_out := v_out || jsonb_build_object(k.style, k.s);
      v_rest := v_rest + k.s;
    end if;
  end loop;
  return v_out || jsonb_build_object(p_top, 1 - v_rest);
end $$;

-- Adds two { key: number } objects together.
create or replace function public.play_add(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(key, total), '{}'::jsonb)
  from (
    select key, sum(value::text::numeric) as total
    from (select * from jsonb_each(coalesce(a, '{}'::jsonb)) union all select * from jsonb_each(coalesce(b, '{}'::jsonb))) x
    where jsonb_typeof(value) = 'number'
    group by key
  ) y
$$;

-- What the server knows for sure about one player in one game. Things tied to the game (entries,
-- searches, sweeps, chat, town events, chats with the locals) by its id; the rest (bets, tickets,
-- gifts, sprays, thefts, side quests, mini game claims) by time, from when the game was set up
-- to when it ended. Only numbers above 0 are listed.
create or replace function public.play_server_counts(p_user uuid, p_round bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  t0 timestamptz;
  t1 timestamptz;
  v jsonb;
begin
  select * into r from public.rounds where id = p_round;
  if not found then return '{}'::jsonb; end if;
  t0 := r.created_at;
  t1 := coalesce(r.finished_at, r.seek_ends_at);
  select * into e from public.entries where round_id = p_round and user_id = p_user;
  v := jsonb_build_object(
    'searches', (select count(*) from public.searches where round_id = p_round and seeker_id = p_user),
    'sweeps', (select count(*) from public.sweeps where round_id = p_round and seeker_id = p_user),
    'catches', (select count(*) from public.entries where round_id = p_round and caught_by = p_user and user_id <> p_user),
    'hunter', case when e.role = 'seeker' then 1 else 0 end,
    'ghost', case when e.role = 'hider' then 1 else 0 end,
    'survived', case when e.role = 'hider' and e.caught is false then 1 else 0 end,
    'moves', case when e.role = 'hider' then greatest(e.moves, 0) else 0 end,
    'tricks', case when e.role = 'hider' then e.shield_bought::int + e.decoy_used::int + e.respawned::int else 0 end,
    'events', (select count(*) from public.world_event_claims c join public.world_events w on w.id = c.event_id
                where w.round_id = p_round and c.user_id = p_user),
    'chats', (select count(*) from public.chat_messages where round_id = p_round and sender_id = p_user),
    'npc_chats', (select count(distinct npc) from public.npc_talks where round_id = p_round and user_id = p_user)
  );
  v := v || (select jsonb_build_object('bets', count(*),
                                       'bets_won', count(*) filter (where settled and payout > amount),
                                       'bet_mint', coalesce(floor(sum(amount)), 0))
             from public.sports_bets where user_id = p_user and created_at >= t0 and created_at < t1);
  v := v || jsonb_build_object('tickets',
             (select count(*) from public.sports_tickets where user_id = p_user and created_at >= t0 and created_at < t1));
  v := v || (select jsonb_build_object('gifts', count(*), 'gift_mint', coalesce(floor(sum(amount)), 0))
             from public.coin_gifts where from_id = p_user and kind = 'gift' and created_at >= t0 and created_at < t1);
  v := v || (select jsonb_build_object('sprays', count(*), 'spray_mint', coalesce(floor(-sum(amount)), 0))
             from public.ledger where user_id = p_user and kind = 'spray_sent' and created_at >= t0 and created_at < t1);
  v := v || jsonb_build_object('steals',
             (select count(*) from public.steals where thief_id = p_user and created_at >= t0 and created_at < t1));
  v := v || (select jsonb_build_object('quests_done', count(*), 'thief_quests', count(*) filter (where action = 'steal'))
             from public.quests where user_id = p_user and status = 'done' and completed_at >= t0 and completed_at < t1);
  v := v || (select jsonb_build_object('arcade_games', count(*) filter (where game not in ('dance', 'karaoke')),
                                       'party_games', count(*) filter (where game in ('dance', 'karaoke')),
                                       'games_won', count(*) filter (where coins > 0))
             from public.activity_claims where user_id = p_user and created_at >= t0 and created_at < t1);
  return coalesce((select jsonb_object_agg(key, value) from jsonb_each(v)
                    where jsonb_typeof(value) = 'number' and value::text::numeric > 0), '{}'::jsonb);
end $$;

-- ============================================================ checking in
-- The app calls this once while a game is on (join window or hunt). Returns the game's id, or
-- null when no game is open.
create or replace function public.play_check_in(p_user uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_round bigint;
begin
  if not exists (select 1 from public.profiles where id = p_user and not is_bot) then raise exception 'unknown_player'; end if;
  select id into v_round from public.rounds where status <> 'done' order by id desc limit 1;
  if v_round is null then return null; end if;
  insert into public.play_check_ins (round_id, user_id) values (v_round, p_user) on conflict do nothing;
  -- Old check-ins aren't needed once their diaries can't be saved any more (about 4 days of games).
  delete from public.play_check_ins where round_id < v_round - 100;
  return v_round;
end $$;

-- ============================================================ saving a game's diary
-- Once per player per game. Returns { round, style, scores, counters, already }. A second call
-- for the same game changes nothing and returns what was saved (already = true).
-- Errors: unknown_player, unknown_round, not_finished, too_late, not_in_game.
create or replace function public.save_play_diary(p_user uuid, p_round bigint, p_counters jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  r public.rounds;
  d public.play_diaries;
  v_client jsonb;
  v_server jsonb;
  v_merged jsonb;
  v_scores jsonb;
  v_style text;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  -- One save at a time per player, so the lifetime totals add up.
  perform pg_advisory_xact_lock(hashtextextended('play_style:' || p_user::text, 0));

  select * into d from public.play_diaries where round_id = p_round and user_id = p_user;
  if found then
    return jsonb_build_object('round', d.round_id, 'style', d.style, 'scores', d.scores, 'counters', d.counters, 'already', true);
  end if;

  select * into r from public.rounds where id = p_round;
  if not found then raise exception 'unknown_round'; end if;
  if r.status <> 'done' then raise exception 'not_finished'; end if;
  if coalesce(r.finished_at, r.seek_ends_at) < now() - make_interval(hours => coalesce(public.setting('play_diary_hours'), 48)::int) then
    raise exception 'too_late';
  end if;

  v_server := public.play_server_counts(p_user, p_round);
  if not (exists (select 1 from public.entries where round_id = p_round and user_id = p_user)
          or exists (select 1 from public.play_check_ins where round_id = p_round and user_id = p_user)
          or v_server <> '{}'::jsonb) then
    raise exception 'not_in_game';
  end if;

  v_client := public.play_clean(p_counters);
  v_merged := public.play_clean(public.play_merge(v_client, v_server));
  v_scores := public.play_scores(v_merged);
  v_style := public.play_pick(v_scores);

  insert into public.play_diaries (round_id, user_id, counters, client, scores, style)
  values (p_round, p_user, v_merged, v_client, v_scores, v_style);

  insert into public.play_style_totals as t (user_id, scores, tops, games)
  values (p_user, public.play_shares(v_scores, v_style), jsonb_build_object(v_style, 1), 1)
  on conflict (user_id) do update
    set scores = public.play_add(t.scores, excluded.scores),
        tops = public.play_add(t.tops, excluded.tops),
        games = t.games + 1,
        updated_at = now();

  return jsonb_build_object('round', p_round, 'style', v_style, 'scores', v_scores, 'counters', v_merged, 'already', false);
end $$;

-- ============================================================ your style over time
-- { games, shares: { style: 0…1 } (adds up to 1), tops: { style: games on top }, recent: [{ round, style, at }] }.
create or replace function public.my_play_style(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t public.play_style_totals;
  v_games int;
begin
  select * into t from public.play_style_totals where user_id = p_user;
  v_games := coalesce(t.games, 0);
  return jsonb_build_object(
    'games', v_games,
    'shares', (select coalesce(jsonb_object_agg(k.style,
                 case when v_games > 0 then round(coalesce((t.scores ->> k.style)::numeric, 0) / v_games, 4) else 0 end), '{}'::jsonb)
               from public.play_style_kinds k),
    'tops', (select coalesce(jsonb_object_agg(k.style, coalesce((t.tops ->> k.style)::int, 0)), '{}'::jsonb)
             from public.play_style_kinds k),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('round', d.round_id, 'style', d.style, 'at', d.created_at)
                                         order by d.created_at desc, d.round_id desc), '[]'::jsonb)
               from (select round_id, style, created_at from public.play_diaries
                      where user_id = p_user order by created_at desc, round_id desc limit 8) d)
  );
end $$;

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['play_style_kinds', 'play_counters', 'play_style_rules', 'play_check_ins', 'play_diaries', 'play_style_totals'] loop
    execute format('alter table public.%I enable row level security', t);  -- no policies: only the server reads them
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('play_clean', 'play_merge', 'play_scores', 'play_pick', 'play_shares', 'play_add', 'play_server_counts',
            'play_check_in', 'save_play_diary', 'my_play_style')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
