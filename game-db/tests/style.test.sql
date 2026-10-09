\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- Part 24: play styles. A game's diary (the app's numbers plus what the server knows for sure)
-- picks a style; each player builds up a mix over time. Nothing here moves mint.
\ir ../024_play_style.sql

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
create function pg_temp.u(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.fails(sql text, code text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return sqlerrm like code || '%';
end $$;
-- Plays out whatever game is on until it has paid out.
create function pg_temp.close_games() returns void language plpgsql as $$
declare r rounds;
begin
  for i in 1..6 loop
    select * into r from rounds where status <> 'done';
    exit when not found;
    if r.status = 'join' then update rounds set join_ends_at = now() - interval '1 second' where id = r.id;
    else update rounds set seek_ends_at = now() - interval '1 second' where id = r.id; end if;
    perform tick();
  end loop;
  if exists (select 1 from rounds where status <> 'done') then raise exception 'could not close the open game'; end if;
end $$;

insert into auth.users (email) values ('hunt@style24.test'), ('ghost@style24.test'), ('walker@style24.test'), ('away@style24.test');
select log_coins(id, null, 'topup', 3000 - coins) from profiles where email_key like '%@style24.test';
update profiles set coins = 3000, seeker_rounds = 1, hider_rounds = 10, level = 5, last_search_at = null, search_heat = 0
 where email_key like '%@style24.test';
update profiles set username = 'Hunt24' where email_key = 'hunt@style24.test';
update profiles set username = 'Ghost24' where email_key = 'ghost@style24.test';
update game_settings set value = 0 where key = 'search_cooldown_seconds';

-- ============================================================ a game: one hunter, one ghost, one walker
select pg_temp.close_games();
select tick() is not null as next_game;
do $$
declare
  hunt uuid := pg_temp.u('hunt@style24.test');
  ghost uuid := pg_temp.u('ghost@style24.test');
  walker uuid := pg_temp.u('walker@style24.test');
  r bigint := (select id from rounds where status = 'join');
  res jsonb;
begin
  perform pg_temp.check(r is not null, 'a game is open to join');
  perform join_round(ghost, 'hider');
  perform join_round(hunt, 'seeker');
  perform pg_temp.check(play_check_in(walker) = r, 'the walker checks in to the open game');
  perform play_check_in(walker);
  perform pg_temp.check((select count(*) from play_check_ins where round_id = r and user_id = walker) = 1, 'checking in twice is one check-in');
  perform pg_temp.check(pg_temp.fails(format('select save_play_diary(%L, %s, %L)', hunt, r, '{}'), 'not_finished'),
    'no diary while the game is still on');
  update rounds set join_ends_at = now() - interval '1 second' where id = r;
  perform tick();
  delete from world_events where round_id = r;
  res := search_tile(hunt, (select tile from entries where round_id = r and user_id = ghost));
  perform pg_temp.check(res->>'result' = 'caught', 'the hunter finds the ghost: ' || (res->>'result'));
  update rounds set seek_ends_at = now() - interval '1 second' where id = r;
  perform tick();
  perform pg_temp.check((select status from rounds where id = r) = 'done', 'the game is over');
end $$;

-- ============================================================ saving diaries
do $$
declare
  hunt uuid := pg_temp.u('hunt@style24.test');
  ghost uuid := pg_temp.u('ghost@style24.test');
  walker uuid := pg_temp.u('walker@style24.test');
  away uuid := pg_temp.u('away@style24.test');
  r bigint := (select max(id) from rounds where status = 'done' and exists (select 1 from entries e where e.round_id = rounds.id and e.user_id = hunt));
  res jsonb;
  again jsonb;
  srv jsonb;
begin
  srv := play_server_counts(hunt, r);
  perform pg_temp.check((srv->>'searches')::int = 1 and (srv->>'catches')::int >= 1 and (srv->>'hunter')::int = 1 and srv->'ghost' is null,
    'the server counts the hunter''s search and catch: ' || srv::text);
  srv := play_server_counts(ghost, r);
  perform pg_temp.check((srv->>'ghost')::int = 1 and srv->'survived' is null, 'the caught ghost: a ghost, not a survivor: ' || srv::text);

  -- The hunter: the app says 1 building, 500 searches (the server knows better) and an unknown number.
  res := save_play_diary(hunt, r, '{"buildings": 1, "searches": 500, "made_up": 7, "rooms": -4}');
  perform pg_temp.check(res->>'style' = 'detective', 'the hunter is The Detective: ' || (res->'scores')::text);
  perform pg_temp.check((res->'counters'->>'searches')::int = 1, 'searches come from the server, not the app');
  perform pg_temp.check((res->'counters'->>'buildings')::int = 1 and res->'counters'->'made_up' is null and res->'counters'->'rooms' is null,
    'the app''s numbers are kept, unknown and negative ones dropped');
  perform pg_temp.check(not (res->>'already')::boolean, 'first save');
  again := save_play_diary(hunt, r, '{"buildings": 50}');
  perform pg_temp.check((again->>'already')::boolean and again->>'style' = 'detective' and (again->'counters'->>'buildings')::int = 1,
    'a second save changes nothing');

  -- The ghost: caught (4 points of Phantom) but rode a lot (Tourist wins).
  res := save_play_diary(ghost, r, '{"ride_balloon": 2, "ride_train": 1}');
  perform pg_temp.check(res->>'style' = 'tourist', 'the ghost who rode about is The Tourist: ' || (res->'scores')::text);
  perform pg_temp.check((res->'scores'->>'phantom')::int = 4, 'still a bit of Phantom (played as a ghost)');

  -- The walker only checked in: their diary counts. A huge number is capped.
  res := save_play_diary(walker, r, '{"orders_food": 3, "restaurants": 1, "buildings": 99999}');
  perform pg_temp.check(res->>'style' = 'explorer' and (res->'counters'->>'buildings')::int = 60,
    'numbers are capped (60 buildings): ' || (res->'scores')::text);

  -- Someone who wasn't there can't save a diary for this game.
  perform pg_temp.check(pg_temp.fails(format('select save_play_diary(%L, %s, %L)', away, r, '{"buildings": 3}'), 'not_in_game'),
    'no diary for a game you weren''t in');
  perform pg_temp.check(pg_temp.fails(format('select save_play_diary(%L, %s, %L)', away, 999999999, '{}'), 'unknown_round'),
    'no diary for a game that doesn''t exist');
  perform pg_temp.check(pg_temp.fails(format('select save_play_diary(%L, %s, %L)', (select id from profiles where is_bot limit 1), r, '{}'), 'unknown_player'),
    'the bot has no diary');

  -- Too late: a game that ended long ago.
  update rounds set finished_at = now() - interval '3 days' where id = r;
  perform pg_temp.check(pg_temp.fails(format('select save_play_diary(%L, %s, %L)', away, r, '{}'), 'too_late'), 'too late after 48 hours');
  update rounds set finished_at = now() where id = r;
end $$;

-- ============================================================ your style over time
do $$
declare
  hunt uuid := pg_temp.u('hunt@style24.test');
  away uuid := pg_temp.u('away@style24.test');
  m jsonb;
  total numeric;
begin
  m := my_play_style(hunt);
  select sum(value::text::numeric) into total from jsonb_each(m->'shares');
  perform pg_temp.check((m->>'games')::int = 1 and total = 1, 'one game, shares add up to 1: ' || (m->'shares')::text);
  perform pg_temp.check((m->'tops'->>'detective')::int = 1 and jsonb_array_length(m->'recent') = 1
                        and m->'recent'->0->>'style' = 'detective', 'tops and recent games');
  m := my_play_style(away);
  perform pg_temp.check((m->>'games')::int = 0 and jsonb_array_length(m->'recent') = 0, 'a player with no games: empty');
end $$;

-- A second game adds to the mix.
select pg_temp.close_games();
select tick() is not null as next_game;
do $$
declare
  hunt uuid := pg_temp.u('hunt@style24.test');
  r bigint;
  m jsonb;
  total numeric;
begin
  perform play_check_in(hunt);
  r := (select id from rounds where status <> 'done');
  perform pg_temp.close_games();
  perform save_play_diary(hunt, r, '{"clubs": 3, "club_minutes": 30}');
  m := my_play_style(hunt);
  select sum(value::text::numeric) into total from jsonb_each(m->'shares');
  perform pg_temp.check((m->>'games')::int = 2 and abs(total - 1) < 0.001 and (m->'tops'->>'party')::int = 1
                        and (m->'shares'->>'party')::numeric > 0.4, 'two games: half party, the rest detective: ' || (m->'shares')::text);
  perform pg_temp.check((select games from play_style_totals where user_id = hunt) = 2, 'totals counted once per game');
end $$;

-- ============================================================ the maths matches src/lib/play-style.ts
select pg_temp.check(play_pick('{}'::jsonb) = 'explorer', 'no points: The Explorer');
select pg_temp.check(play_pick('{"thief": 12, "detective": 12}'::jsonb) = 'thief', 'a dead heat goes to the rarer style');
select pg_temp.check((select count(*) from play_style_kinds) = 12, 'twelve styles');
select pg_temp.check(play_shares('{"explorer": 3, "party": 1}'::jsonb, 'explorer') = '{"explorer": 0.75, "party": 0.25}'::jsonb, 'shares of one game');

-- ============================================================ re-running part 24, privacy, no mint moved
\ir ../024_play_style.sql
select pg_temp.check((select games from play_style_totals where user_id = pg_temp.u('hunt@style24.test')) = 2, 'part 24 re-run keeps everything');
select pg_temp.check(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('play_style_kinds', 'play_counters', 'play_style_rules', 'play_check_ins', 'play_diaries', 'play_style_totals'))
  and not has_table_privilege('anon', 'public.play_diaries', 'select')
  and not has_table_privilege('authenticated', 'public.play_style_totals', 'select')
  and not has_function_privilege('anon', 'public.save_play_diary(uuid, bigint, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.my_play_style(uuid)', 'execute'),
  'play style tables and functions are server-only');
select pg_temp.check(
  not exists (select 1 from ledger l where l.note ilike '%style%' or l.note ilike '%diary%'),
  'saving diaries moved no mint');
