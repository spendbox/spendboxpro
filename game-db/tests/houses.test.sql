\set ON_ERROR_STOP on
-- Part 23: player houses (phase 1). Saving a design, bad choices and rude names refused, the
-- daily edit limit, switching a house on, each new game's snapshot and its extra spots (+5 a
-- house), switching off only counting from the next game, the cap and taking turns, and
-- running part 23 again. Houses are free for now: no mint moves at all.
-- Run part 23 again first: it must be safe to re-run.
\ir ../023_houses.sql
-- Only the 'ok …' lines and the books check at the end are printed (query results go nowhere).
\o /dev/null

-- Earlier test files may set balances by hand, so check that this part adds no gap of its own.
create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled))
$$;
create temp table books_h as select pg_temp.gap() as gap_before;
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
-- Stops the run with FAILED when something isn't right, and prints 'ok <what>' when it is.
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
-- Prints 'ok <what>: <error>' when the call fails as it should (and the error starts with p_code).
create function pg_temp.fails(what text, p_code text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  if sqlerrm not like p_code || '%' then raise exception 'FAILED: % gave "%" (expected %)', what, sqlerrm, p_code; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;
-- Plays the game that's on to the end and starts the next one. Returns the new game's id.
create function pg_temp.next_game() returns bigint language plpgsql as $$
declare v bigint;
begin
  perform tick();
  update rounds set join_ends_at = now() - interval '2 seconds', seek_ends_at = now() - interval '1 second'
   where status <> 'done';
  perform tick();
  if exists (select 1 from rounds where status <> 'done') then perform tick(); end if;
  if exists (select 1 from rounds where status <> 'done') then raise exception 'the game did not finish'; end if;
  perform tick();
  select id into v from rounds where status <> 'done';
  if v is null then raise exception 'no new game was started'; end if;
  return v;
end $$;
-- 'Adaeze:0, Chinedu:1' for a game's houses, in slot order.
create function pg_temp.standing(g bigint) returns text language sql as $$
  select coalesce(string_agg(owner_name || ':' || slot, ', ' order by slot), '(none)') from round_houses where round_id = g
$$;
-- The spots a game has beyond the usual start (ghosts that joined add their own; none join here).
create function pg_temp.extra_spots(g bigint) returns int language sql as $$
  select tile_count - public.setting('base_tiles')::int from rounds where id = g
$$;

insert into auth.users (email) values ('h1@houses.test'), ('h2@houses.test'), ('h3@houses.test'), ('h4@houses.test'),
                                      ('h5@houses.test'), ('h6@houses.test'), ('h7@houses.test');
update profiles set username = 'Adaeze' where email_key = 'h1@houses.test';
update profiles set username = 'Bisi' where email_key = 'h2@houses.test';
update profiles set username = 'Chinedu' where email_key = 'h3@houses.test';
update profiles set username = 'Dayo' where email_key = 'h4@houses.test';
update profiles set username = 'Efe' where email_key = 'h5@houses.test';
update profiles set username = 'Funmi' where email_key = 'h6@houses.test';
-- h7 has no player name yet.
create temp table ledger_h as select coalesce(max(id), 0) as last_id from ledger;

-- ============================================================ saving
do $$
declare a uuid := pg_temp.uid('h1@houses.test'); res jsonb;
begin
  res := save_house(a, '  Sunny   Side!! <3 ', 'cottage', '#FFE8CC', '#c92a2a', 'living');
  perform pg_temp.check(res->>'changed' = 'true' and (res->>'saved')::boolean, 'first save');
  perform pg_temp.check(res->'design'->>'name' = 'Sunny Side!! 3', format('name tidied to "%s"', res->'design'->>'name'));
  perform pg_temp.check(res->'design'->>'wall' = '#ffe8cc', 'colour stored in lower case');
  perform pg_temp.check((res->>'saves_left')::int = 29 and not (res->>'published')::boolean and not (res->>'standing')::boolean,
    format('29 saves left today, not shown, not standing (%s)', res));
  res := save_house(a, 'Sunny Side!! 3', 'cottage', '#ffe8cc', '#c92a2a', 'living');
  perform pg_temp.check(res->>'changed' = 'false' and (res->>'saves_left')::int = 29, 'saving the same design again is free');
  res := save_house(a, 'The Very Long Name Of My Lovely House', 'villa', '#d3f9d8', '#1864ab', 'party');
  perform pg_temp.check(res->'design'->>'name' = 'The Very Long Name Of My', format('long name cut to 24: "%s"', res->'design'->>'name'));
  res := save_house(a, 'Adé''s Ház', 'cottage', '#ffe8cc', '#c92a2a', 'living');
  perform pg_temp.check(res->'design'->>'name' = 'Adé''s Ház', format('accents kept: "%s"', res->'design'->>'name'));
  res := save_house(a, '', 'cottage', '#ffe8cc', '#c92a2a', 'living');
  perform pg_temp.check(res->'design'->>'name' = '' and (res->>'saves_left')::int = 26, 'an empty name is fine (26 saves left)');
  perform pg_temp.check((select count(*) from houses where user_id = a) = 1, 'one house per player');
end $$;

-- Bad choices are refused.
select pg_temp.fails('unknown style', 'bad_style', format('select save_house(%L, %L, %L, %L, %L, %L)', pg_temp.uid('h1@houses.test'), 'X', 'castle', '#ffe8cc', '#c92a2a', 'living'));
select pg_temp.fails('no style', 'bad_style', format('select save_house(%L, %L, null, %L, %L, %L)', pg_temp.uid('h1@houses.test'), 'X', '#ffe8cc', '#c92a2a', 'living'));
select pg_temp.fails('wall colour not in the list', 'bad_wall', format('select save_house(%L, %L, %L, %L, %L, %L)', pg_temp.uid('h1@houses.test'), 'X', 'cottage', '#123456', '#c92a2a', 'living'));
select pg_temp.fails('roof in a wall colour', 'bad_roof', format('select save_house(%L, %L, %L, %L, %L, %L)', pg_temp.uid('h1@houses.test'), 'X', 'cottage', '#ffe8cc', '#ffe8cc', 'living'));
select pg_temp.fails('unknown room', 'bad_interior', format('select save_house(%L, %L, %L, %L, %L, %L)', pg_temp.uid('h1@houses.test'), 'X', 'cottage', '#ffe8cc', '#c92a2a', 'garage'));
select pg_temp.fails('rude name', 'rude_name', format('select save_house(%L, %L, %L, %L, %L, %L)', pg_temp.uid('h1@houses.test'), 'F u c k this', 'cottage', '#ffe8cc', '#c92a2a', 'living'));
select pg_temp.fails('the bot', 'bot', format('select save_house(%L, %L, %L, %L, %L, %L)', '00000000-0000-0000-0000-00000000b07a', 'X', 'cottage', '#ffe8cc', '#c92a2a', 'living'));
select pg_temp.fails('nobody', 'unknown_player', format('select save_house(%L, %L, %L, %L, %L, %L)', '00000000-0000-0000-0000-000000000001', 'X', 'cottage', '#ffe8cc', '#c92a2a', 'living'));
select pg_temp.fails('table refuses a colour outside the catalog', '', format('update houses set wall = %L where user_id = %L', '#000000', pg_temp.uid('h1@houses.test')));

-- The name filter: slurs and insults (also spaced out, with look-alikes or punctuation) are
-- caught; ordinary names that happen to contain those letters are not.
select pg_temp.check(bool_and(house_name_rude(n)), 'rude names caught: ' || string_agg(n, ' | '))
  from unnest(array['F U C K house', 'sh1t shack', 'N.a.z.i HQ', 'Fuuuck', 'BITCH palace', 'the nazi', 'f-u-c-k',
                    'Motherfuckers', '$lut Hut', 'Ashawo Villa', 'werey dey', 'Idiot Lodge']) n;
select pg_temp.check(not bool_or(house_name_rude(n)), 'fine names allowed: ' || string_agg(n, ' | '))
  from unnest(array['Nazir''s Place', 'Spicy Villa', 'Therapist Home', 'Glass House', 'Fresh It Up', 'Scott''s Cottage',
                    'Plot 5 Hitech', 'Sussex Lodge', 'Dickson''s Den', 'Peacock Court', 'Grape Escape', 'Cassie''s Classic',
                    'B & B', 'Mama Put', '']) n;

-- Paused players can't save.
update profiles set frozen = true where email_key = 'h6@houses.test';
select pg_temp.fails('paused account', 'frozen', format('select save_house(%L, %L, %L, %L, %L, %L)', pg_temp.uid('h6@houses.test'), 'X', 'cottage', '#ffe8cc', '#c92a2a', 'living'));
update profiles set frozen = false where email_key = 'h6@houses.test';

-- At most house_saves_per_day changes a day (saving nothing new doesn't count).
do $$
declare a uuid := pg_temp.uid('h1@houses.test'); res jsonb;
begin
  update houses set saves_today = 30, saves_day = current_date where user_id = a;
  perform pg_temp.fails('31st change today', 'too_many_saves:30', format('select save_house(%L, %L, %L, %L, %L, %L)', a, 'Sunny', 'cottage', '#ffe8cc', '#c92a2a', 'living'));
  res := save_house(a, '', 'cottage', '#ffe8cc', '#c92a2a', 'living');
  perform pg_temp.check(res->>'changed' = 'false' and (res->>'saves_left')::int = 0, 'unchanged save still fine at the limit');
  update houses set saves_day = current_date - 1 where user_id = a;  -- a new day
  res := save_house(a, 'Sunny Side', 'cottage', '#ffe8cc', '#c92a2a', 'living');
  perform pg_temp.check(res->>'changed' = 'true' and (res->>'saves_left')::int = 29, 'a new day, a fresh limit');
end $$;

-- ============================================================ switching it on
select pg_temp.fails('no house yet', 'no_house', format('select set_house_published(%L, true)', pg_temp.uid('h6@houses.test')));
select pg_temp.check(not (set_house_published(pg_temp.uid('h6@houses.test'), false)->>'saved')::boolean, 'switching off with no house is harmless');
do $$
declare g uuid := pg_temp.uid('h7@houses.test');
begin
  perform save_house(g, 'Nameless', 'bungalow', '#fff3bf', '#5c3d2e', 'dining');
  perform pg_temp.fails('no player name yet', 'no_name', format('select set_house_published(%L, true)', g));
end $$;
do $$
declare a uuid := pg_temp.uid('h1@houses.test'); b uuid := pg_temp.uid('h2@houses.test'); c uuid := pg_temp.uid('h3@houses.test');
        d uuid := pg_temp.uid('h4@houses.test'); e uuid := pg_temp.uid('h5@houses.test'); res jsonb; v_at timestamptz;
begin
  perform save_house(b, 'Bisi''s Bungalow', 'bungalow', '#e5dbff', '#5f3dc4', 'lounge');
  perform save_house(c, 'Chinedu Court', 'modern', '#d0ebff', '#343a40', 'studio');
  perform save_house(d, 'Dayo Duplex', 'duplex', '#ffdeeb', '#e8590c', 'dining');
  perform save_house(e, 'Efe Villa', 'villa', '#c5a880', '#2b8a3e', 'party');
  res := set_house_published(a, true);
  perform pg_temp.check((res->>'published')::boolean and not (res->>'standing')::boolean, 'switched on (stands from the next game)');
  perform set_house_published(b, true);
  perform set_house_published(c, true);
  perform set_house_published(d, true);
  perform set_house_published(e, true);
  -- Who's been waiting longest: Efe, Dayo, Adaeze, Bisi, Chinedu.
  update houses set published_at = now() - interval '5 hours' where user_id = e;
  update houses set published_at = now() - interval '4 hours' where user_id = d;
  update houses set published_at = now() - interval '3 hours' where user_id = a;
  update houses set published_at = now() - interval '2 hours' where user_id = b;
  update houses set published_at = now() - interval '1 hour' where user_id = c;
  v_at := (select published_at from houses where user_id = a);
  perform set_house_published(a, true);
  perform pg_temp.check((select published_at from houses where user_id = a) = v_at, 'switching on again keeps its place in the queue');
  -- Dayo's account gets paused and Efe said they're under 18: neither house goes in the game.
  update profiles set frozen = true where id = d;
  update profiles set frozen = true, age_blocked_at = now() where id = e;
  perform pg_temp.fails('paused account switching on', 'frozen', format('select set_house_published(%L, true)', d));
  -- The bot never gets one either (even if a row somehow appears).
  insert into houses (user_id, name, style, wall, roof, interior, published, published_at)
  values ('00000000-0000-0000-0000-00000000b07a', 'Bot Base', 'modern', '#e9ecef', '#adb5bd', 'party', true, now() - interval '9 hours');
end $$;
select pg_temp.check((select coalesce(max(id), 0) from ledger) = last_id, 'saving and switching on moved no mint (no ledger rows)') from ledger_h;

-- ============================================================ the next game
select pg_temp.next_game() as g1 \gset
select pg_temp.check(pg_temp.standing(:g1) = 'Adaeze:0, Bisi:1, Chinedu:2', 'game 1 houses, longest-waiting first: ' || pg_temp.standing(:g1));
select pg_temp.check(pg_temp.extra_spots(:g1) = 15, format('game 1 has 3 x 5 = %s extra spots', pg_temp.extra_spots(:g1)));
do $$
declare g bigint := (select id from rounds where status <> 'done'); res jsonb;
begin
  res := my_house(pg_temp.uid('h1@houses.test'));
  perform pg_temp.check((res->>'standing')::boolean and (res->>'slot')::int = 0 and (res->>'round_id')::bigint = g,
    'Adaeze''s house stands in slot 0 of this game');
  perform pg_temp.check(not (my_house(pg_temp.uid('h6@houses.test'))->>'standing')::boolean, 'Funmi (no house) isn''t standing');
  perform pg_temp.check(not (my_house(pg_temp.uid('h4@houses.test'))->>'standing')::boolean, 'paused Dayo isn''t standing');
  res := round_houses_of(g);
  perform pg_temp.check(jsonb_array_length(res) = 3 and res->0->>'owner' = 'Adaeze' and res->0->>'name' = 'Sunny Side'
    and res->1->>'style' = 'bungalow' and res->2->>'interior' = 'studio', 'round_houses_of: ' || res::text);
  perform pg_temp.check(round_houses_of(-1) = '[]'::jsonb, 'no houses for a game that doesn''t exist');
end $$;

-- Bisi switches off and Adaeze repaints during game 1: game 1 doesn't change.
do $$
declare g bigint := (select id from rounds where status <> 'done'); res jsonb; v_tiles int := (select tile_count from rounds where status <> 'done');
begin
  res := set_house_published(pg_temp.uid('h2@houses.test'), false);
  perform pg_temp.check(not (res->>'published')::boolean and (res->>'standing')::boolean, 'Bisi switched off but still stands in this game');
  perform save_house(pg_temp.uid('h1@houses.test'), 'Sunny Side', 'cottage', '#d0ebff', '#c92a2a', 'living');
  perform pg_temp.check(pg_temp.standing(g) = 'Adaeze:0, Bisi:1, Chinedu:2' and (select tile_count from rounds where id = g) = v_tiles,
    'this game keeps its houses and its size');
  perform pg_temp.check((select wall from round_houses where round_id = g and slot = 0) = '#ffe8cc', 'this game keeps Adaeze''s old colour');
end $$;
select pg_temp.next_game() as g2 \gset
select pg_temp.check(pg_temp.standing(:g2) = 'Adaeze:0, Chinedu:1', 'game 2 without Bisi: ' || pg_temp.standing(:g2));
select pg_temp.check(pg_temp.extra_spots(:g2) = 10, format('game 2 has 2 x 5 = %s extra spots', pg_temp.extra_spots(:g2)));
select pg_temp.check((select wall from round_houses where round_id = :g2 and slot = 0) = '#d0ebff', 'game 2 shows Adaeze''s new colour');
select pg_temp.check(not (my_house(pg_temp.uid('h2@houses.test'))->>'standing')::boolean, 'Bisi isn''t standing in game 2');
select pg_temp.check(pg_temp.standing(:g1) = 'Adaeze:0, Bisi:1, Chinedu:2', 'game 1''s houses are kept as they were');

-- ============================================================ the cap: taking turns
update game_settings set value = 1 where key = 'houses_per_round_max';
select pg_temp.next_game() as g3 \gset
select pg_temp.check(pg_temp.standing(:g3) = 'Adaeze:0' and pg_temp.extra_spots(:g3) = 5, 'cap 1, game 3: ' || pg_temp.standing(:g3));
select pg_temp.next_game() as g4 \gset
select pg_temp.check(pg_temp.standing(:g4) = 'Chinedu:0', 'cap 1, game 4 (Chinedu waited longer): ' || pg_temp.standing(:g4));
select pg_temp.next_game() as g5 \gset
select pg_temp.check(pg_temp.standing(:g5) = 'Adaeze:0', 'cap 1, game 5 (Adaeze''s turn again): ' || pg_temp.standing(:g5));
select pg_temp.check((set_house_published(pg_temp.uid('h2@houses.test'), true)->>'published')::boolean, 'Bisi switches back on');
select pg_temp.next_game() as g6 \gset
select pg_temp.check(pg_temp.standing(:g6) = 'Chinedu:0', 'cap 1, game 6 (Bisi just rejoined the queue): ' || pg_temp.standing(:g6));
update game_settings set value = 0 where key = 'houses_per_round_max';
select pg_temp.next_game() as g7 \gset
select pg_temp.check(pg_temp.standing(:g7) = '(none)' and pg_temp.extra_spots(:g7) = 0, 'cap 0: no houses, no extra spots');
update game_settings set value = 500 where key = 'houses_per_round_max';
select pg_temp.next_game() as g8 \gset
select pg_temp.check(pg_temp.standing(:g8) = 'Adaeze:0, Bisi:1, Chinedu:2' and pg_temp.extra_spots(:g8) = 15,
  'cap 500, game 8 (Adaeze stood in game 5, Bisi rejoined after it, Chinedu stood in game 6): ' || pg_temp.standing(:g8));

-- ============================================================ deleting an account
select pg_temp.set_coins(pg_temp.uid('h3@houses.test'), 0);
delete from auth.users where email = 'h3@houses.test';
select pg_temp.check((select count(*) from houses h join profiles p on p.id = h.user_id where p.username = 'Chinedu') = 0
  and pg_temp.standing(:g8) = 'Adaeze:0, Bisi:1', 'a deleted account''s house goes with it: ' || pg_temp.standing(:g8));

-- ============================================================ running part 23 again
update game_settings set value = 7 where key = 'houses_per_round_max';
create temp table before_rerun as select (select count(*) from houses) as houses, (select count(*) from round_houses) as placed;
\ir ../023_houses.sql
select pg_temp.check((select count(*) from houses) = houses and (select count(*) from round_houses) = placed,
  'part 23 re-run keeps every house and every game''s houses') from before_rerun;
select pg_temp.check(setting('houses_per_round_max') = 7, 'part 23 re-run keeps changed settings');
select pg_temp.check((select count(*) from pg_trigger where tgname = 'rounds_place_houses' and tgrelid = 'public.rounds'::regclass) = 1,
  'still one snapshot trigger');
update game_settings set value = 500 where key = 'houses_per_round_max';

-- ============================================================ privacy
select pg_temp.check(not has_table_privilege('anon', 'public.houses', 'select')
  and not has_table_privilege('authenticated', 'public.round_houses', 'select')
  and has_table_privilege('service_role', 'public.houses', 'insert')
  and (select bool_and(relrowsecurity) from pg_class where oid in ('public.houses'::regclass, 'public.round_houses'::regclass)),
  'houses tables are server-only (RLS on, no access for anon or signed-in clients)');
select pg_temp.check(not has_function_privilege('authenticated', 'public.save_house(uuid,text,text,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.set_house_published(uuid,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.my_house(uuid)', 'execute'),
  'house functions are server-only');

-- ============================================================ tidy up, check the books
-- Switch every test house off so later tests get a town without them.
update houses set published = false;
select pg_temp.next_game() as g9 \gset
select pg_temp.check(pg_temp.standing(:g9) = '(none)' and pg_temp.extra_spots(:g9) = 0, 'all switched off: the next game has no houses');
\o
select gap_before, pg_temp.gap() as gap_after from books_h;  -- must be equal
