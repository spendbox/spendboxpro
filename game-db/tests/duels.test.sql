\set ON_ERROR_STOP on
-- Part 29: ghost duels. Joining as a ghost (no hunting first), ghosts lighting up on the
-- board, challenges (fee, busy, cooldown, who can't), answering, Rock-Paper-Scissors throws,
-- winning and losing (stake slices 80/20, fees into the pool), unanswered challenges, running
-- out of time (ghosts win a draw), giving up and calling off, golden ghosts, ghosts going out,
-- hunters entering the pool, the end of the game (stakes back, the pool shared, duels called
-- off), switched-off events and quests, running part 29 again, books, and privacy.
\ir ../029_ghost_duels.sql
\o /dev/null

-- Coin books, with the stakes of ghosts still in an open game (as in the pool test). Checked
-- when no duel is waiting or running (a waiting duel holds the hunter's fee).
create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled)
          + (select coalesce(sum(e.stake), 0) from entries e join rounds r on r.id = e.round_id
              where r.status <> 'done' and e.role = 'hider' and not e.caught))
$$;
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.coins(u uuid) returns numeric language sql as $$ select coins from profiles where id = u $$;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
create function pg_temp.pool() returns numeric language sql as $$ select coalesce((select pool from rounds where status <> 'done'), 0) $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
create function pg_temp.fails(what text, p_code text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  if sqlerrm not like p_code || '%' then raise exception 'FAILED: % gave "%" (expected %)', what, sqlerrm, p_code; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;
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
end $$;
-- One throw each (ghost's move, hunter's move); returns the duel as the hunter sees it.
create function pg_temp.throw(d bigint, g uuid, h uuid, gm text, hm text) returns jsonb language plpgsql as $$
begin
  perform duel_move(g, d, gm);
  return duel_move(h, d, hm);
end $$;
create function pg_temp.board_ghost(u uuid, g uuid) returns jsonb language sql as $$
  select x from jsonb_array_elements(duel_board(u)->'ghosts') x where x->>'id' = g::text
$$;
-- Lets a hunter challenge again straight away.
create function pg_temp.rested(u uuid) returns void language sql as $$
  update entries set last_duel_at = now() - interval '1 hour' where user_id = u and round_id = (select max(id) from rounds)
$$;

select pg_temp.close_games();
create temp table books_d as select pg_temp.gap() as gap_before;

insert into auth.users (email) values ('dg1@duels.test'), ('dg2@duels.test'), ('dg3@duels.test'), ('dh1@duels.test'),
                                      ('dh2@duels.test'), ('dh3@duels.test');
update profiles set username = 'Qdada' where email_key = 'dg1@duels.test';    -- never hunted: can still be a ghost
update profiles set username = 'Qdbola' where email_key = 'dg2@duels.test';
update profiles set username = 'Qdchi' where email_key = 'dg3@duels.test';
update profiles set username = 'Qdhunt' where email_key = 'dh1@duels.test';
update profiles set username = 'Qdkemi' where email_key = 'dh2@duels.test';
update profiles set username = 'Qdbroke' where email_key = 'dh3@duels.test';
select pg_temp.set_coins(pg_temp.uid(e), 1000)
  from unnest(array['dg1@duels.test', 'dg2@duels.test', 'dg3@duels.test', 'dh1@duels.test', 'dh2@duels.test']) e;
select pg_temp.set_coins(pg_temp.uid('dh3@duels.test'), 5);

-- ============================================================ privacy
select pg_temp.check(not has_table_privilege('anon', 'public.duels', 'select')
  and not has_table_privilege('authenticated', 'public.duels', 'select')
  and has_table_privilege('service_role', 'public.duels', 'insert')
  and (select relrowsecurity from pg_class where oid = 'public.duels'::regclass), 'duels are server-only');
select pg_temp.check(not has_function_privilege('authenticated', 'public.duel_challenge(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.duel_board(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.duel_move(uuid,bigint,text)', 'execute'), 'duel functions are server-only');

-- ============================================================ joining
select tick();
do $$
declare g1 uuid := pg_temp.uid('dg1@duels.test'); h1 uuid := pg_temp.uid('dh1@duels.test');
begin
  perform join_round(g1, 'hider');
  perform pg_temp.check((select role from entries where user_id = g1 and round_id = (select max(id) from rounds)) = 'hider'
                        and (select seeker_rounds from profiles where id = g1) = 0, 'a brand-new player can join as a ghost');
  perform join_round(pg_temp.uid('dg2@duels.test'), 'hider');
  perform join_round(pg_temp.uid('dg3@duels.test'), 'hider');
  perform pg_temp.fails('no duels before the hunt', 'no_hunt', format('select duel_challenge(%L, %L)', h1, g1));
  perform pg_temp.check(duel_board(h1)->>'phase' = 'join', 'the board knows it''s the join window');
end $$;
update rounds set join_ends_at = now() - interval '1 second' where status = 'join';
select tick();
select pg_temp.fails('ghosts can''t join once the hunt is on', 'Ghosts can only join',
  format('select join_round(%L, %L)', pg_temp.uid('dh2@duels.test'), 'hider'));

-- ============================================================ the board and challenges
do $$
declare g1 uuid := pg_temp.uid('dg1@duels.test'); g2 uuid := pg_temp.uid('dg2@duels.test'); h1 uuid := pg_temp.uid('dh1@duels.test');
        h2 uuid := pg_temp.uid('dh2@duels.test'); h3 uuid := pg_temp.uid('dh3@duels.test');
        r bigint := (select id from rounds where status = 'seek'); b jsonb; v jsonb; c0 numeric;
begin
  delete from world_events where round_id = r;
  b := duel_board(h1);
  perform pg_temp.check(b->>'phase' = 'seek' and jsonb_array_length(b->'ghosts') = 3
                        and (select bool_and((x->>'tile') is not null and x->>'status' = 'free') from jsonb_array_elements(b->'ghosts') x)
                        and not exists (select 1 from jsonb_array_elements(b->'ghosts') x where x->>'name' = (select bot_name from rounds where id = r)),
                        'three ghosts light up on the map (each on a spot, all free; not the bot)');
  perform pg_temp.check(b->'me'->>'role' = 'hunter' and (b->'rules'->>'fee')::numeric = 10, 'everyone else is a hunter; a duel costs 10');
  perform pg_temp.fails('no duelling yourself', 'self', format('select duel_challenge(%L, %L)', g1, g1));
  perform pg_temp.fails('ghosts can''t challenge ghosts', 'you_are_ghost', format('select duel_challenge(%L, %L)', g2, g1));
  perform pg_temp.fails('only ghosts can be challenged', 'not_ghost', format('select duel_challenge(%L, %L)', h1, h2));
  perform pg_temp.fails('it costs 10 mint', 'not_enough:10', format('select duel_challenge(%L, %L)', h3, g1));
  perform pg_temp.check((duel_board(h1)->'me'->>'role') = 'hunter' and not exists (select 1 from entries where user_id = h1 and round_id = r),
                        'hunters don''t have to join');

  c0 := pg_temp.coins(h1);
  v := duel_challenge(h1, g1);
  perform pg_temp.check(v->>'status' = 'asked' and v->>'role' = 'hunter' and v->'opponent'->>'name' = 'Qdada'
                        and pg_temp.coins(h1) = c0 - 10, 'Hunt challenges Ada (10 mint held)');
  perform pg_temp.check((select role from entries where user_id = h1 and round_id = r) = 'seeker', 'the first challenge puts a hunter in the game');
  perform pg_temp.check((select body from notifications where user_id = g1 and kind = 'duel' order by id desc limit 1)
                        like 'Qdhunt challenged you to a duel! Answer within 30 seconds%', 'Ada gets the challenge');
  perform pg_temp.check(pg_temp.board_ghost(h2, g1)->>'status' = 'playing'
                        and (ghost_card(h2, g1)->>'why') = 'busy' and not (ghost_card(h2, g1)->>'can')::boolean,
                        'Ada''s light shows she''s busy; Kemi''s button says so');
  perform pg_temp.fails('one duel at a time for a ghost', 'busy', format('select duel_challenge(%L, %L)', h2, g1));
  perform pg_temp.fails('and for a hunter', 'you_busy', format('select duel_challenge(%L, %L)', h1, g2));
  perform pg_temp.check((duel_board(g1)->'duel'->>'role') = 'ghost' and (duel_board(g1)->'duel'->>'status') = 'asked',
                        'Ada''s board has the challenge waiting');
end $$;

-- ============================================================ a duel: the hunter wins
do $$
declare g1 uuid := pg_temp.uid('dg1@duels.test'); h1 uuid := pg_temp.uid('dh1@duels.test');
        r bigint := (select id from rounds where status = 'seek'); d bigint; v jsonb; c0 numeric; p0 numeric;
begin
  d := (select id from duels where ghost_id = g1 and status = 'asked');
  perform pg_temp.fails('only the ghost answers', 'not_yours', format('select duel_answer(%L, %s)', pg_temp.uid('dh2@duels.test'), d));
  v := duel_answer(g1, d);
  perform pg_temp.check(v->>'status' = 'playing' and (v->>'ends_at')::timestamptz between now() + interval '55 seconds' and now() + interval '65 seconds',
                        'Ada answers: a minute on the clock');
  perform pg_temp.fails('only rock, paper or scissors', 'bad_move', format('select duel_move(%L, %s, %L)', g1, d, 'lizard'));
  v := duel_move(h1, d, 'rock');
  perform pg_temp.check(v->>'my_move' = 'rock' and not (v->>'they_moved')::boolean, 'Hunt throws; Ada hasn''t yet');
  perform pg_temp.check((duel_state(g1, d)->>'they_moved')::boolean and duel_state(g1, d)->>'my_move' is null,
                        'Ada sees Hunt has thrown (but not what)');
  v := duel_move(g1, d, 'scissors');
  perform pg_temp.check((v->>'me')::int = 0 and (v->>'them')::int = 1 and v->'throws'->0->>'w' = 'them'
                        and v->'throws'->0->>'them' = 'rock', 'rock beats scissors: 1-0 to Hunt');
  v := pg_temp.throw(d, g1, h1, 'paper', 'paper');
  perform pg_temp.check((v->>'me')::int = 1 and jsonb_array_length(v->'throws') = 2 and v->'throws'->1->>'w' = 'tie', 'a tie is thrown again');
  c0 := pg_temp.coins(h1);
  p0 := pg_temp.pool();
  v := pg_temp.throw(d, g1, h1, 'rock', 'paper');
  perform pg_temp.check(v->>'status' = 'done' and v->>'winner' = 'me' and v->>'reason' = 'score'
                        and (v->>'portion')::numeric = 33.33 and (v->>'reward')::numeric = 26.66,
                        'Hunt wins 2-0: a third of Ada''s stake (33.33), 80% of it to Hunt');
  perform pg_temp.check(pg_temp.coins(h1) = c0 + 10 + 26.66 and pg_temp.pool() = p0 + 6.67, 'Hunt''s 10 back plus 26.66; 6.67 into the pool');
  perform pg_temp.check((select stake from entries where user_id = g1 and round_id = r) = 66.67
                        and (select duel_losses from entries where user_id = g1 and round_id = r) = 1
                        and not (select caught from entries where user_id = g1 and round_id = r), 'Ada: 1 loss, 66.67 stake left, still in');
  perform pg_temp.check((select body from notifications where user_id = g1 and kind = 'duel_lost' order by id desc limit 1)
                        like 'Qdhunt beat you and took 33.33 mint of your stake. 2 more losses%', 'Ada is told');
  perform pg_temp.check((select detail->>'winner' from events where round_id = r and kind = 'duel' order by id desc limit 1) = 'hunter',
                        'everyone hears who won');
  perform pg_temp.fails('a hunter waits after a duel', 'cooldown:', format('select duel_challenge(%L, %L)', h1, pg_temp.uid('dg2@duels.test')));
  perform pg_temp.check((duel_board(h1)->'me'->>'cooldown_until')::timestamptz > now(), 'the board shows the wait');
end $$;
select pg_temp.check(pg_temp.gap() = gap_before, 'books balance after a duel') from books_d;

-- ============================================================ a duel: the ghost wins
do $$
declare g2 uuid := pg_temp.uid('dg2@duels.test'); h1 uuid := pg_temp.uid('dh1@duels.test');
        r bigint := (select id from rounds where status = 'seek'); d bigint; v jsonb; c0 numeric; p0 numeric;
begin
  perform pg_temp.rested(h1);
  c0 := pg_temp.coins(h1);
  p0 := pg_temp.pool();
  d := (duel_challenge(h1, g2)->>'id')::bigint;
  perform duel_answer(g2, d);
  perform pg_temp.throw(d, g2, h1, 'paper', 'rock');
  v := pg_temp.throw(d, g2, h1, 'scissors', 'paper');
  perform pg_temp.check(v->>'winner' = 'them' and pg_temp.coins(h1) = c0 - 10 and pg_temp.pool() = p0 + 10,
                        'Bola wins 2-0: Hunt''s 10 mint goes into the pool');
  perform pg_temp.check((select duel_wins from entries where user_id = g2 and round_id = r) = 1
                        and (select stake from entries where user_id = g2 and round_id = r) = 100, 'Bola: 1 win, stake untouched');
end $$;

-- ============================================================ no answer, time up, giving up
do $$
declare g1 uuid := pg_temp.uid('dg1@duels.test'); g2 uuid := pg_temp.uid('dg2@duels.test'); g3 uuid := pg_temp.uid('dg3@duels.test');
        h1 uuid := pg_temp.uid('dh1@duels.test'); h2 uuid := pg_temp.uid('dh2@duels.test');
        r bigint := (select id from rounds where status = 'seek'); d bigint; v jsonb; c0 numeric;
begin
  -- Ada doesn't answer in time: she loses.
  d := (duel_challenge(h2, g1)->>'id')::bigint;
  update duels set answer_by = now() - interval '1 second' where id = d;
  perform duel_board(h2);
  perform pg_temp.check((select winner = 'hunter' and reason = 'no_answer' from duels where id = d), 'no answer in 30 seconds: the ghost loses');
  v := duel_answer(g1, d);
  perform pg_temp.check(v->>'status' = 'done' and v->>'winner' = 'them', 'answering too late shows the lost duel');

  -- Time runs out level: the ghost wins (ghosts start with the advantage).
  perform pg_temp.rested(h2);
  d := (duel_challenge(h2, g2)->>'id')::bigint;
  perform duel_answer(g2, d);
  perform pg_temp.throw(d, g2, h2, 'rock', 'paper');
  perform pg_temp.throw(d, g2, h2, 'rock', 'scissors');
  update duels set ends_at = now() - interval '1 second' where id = d;
  v := duel_state(h2, d);
  perform pg_temp.check(v->>'status' = 'done' and v->>'winner' = 'them' and v->>'reason' = 'time', '1-1 when time runs out: the ghost wins');

  -- A hunter calls off a challenge before it's answered: fee back, nobody wins.
  perform pg_temp.rested(h2);
  c0 := pg_temp.coins(h2);
  d := (duel_challenge(h2, g3)->>'id')::bigint;
  v := duel_give_up(h2, d);
  perform pg_temp.check(v->>'status' = 'void' and pg_temp.coins(h2) = c0, 'calling off a challenge: the 10 mint comes back');

  -- Ada won't play: that's her third loss, and she's out.
  perform pg_temp.rested(h2);
  d := (duel_challenge(h2, g1)->>'id')::bigint;
  v := duel_give_up(g1, d);
  perform pg_temp.check(v->>'winner' = 'them' and v->>'reason' = 'gave_up', 'a ghost who won''t play loses');
  perform pg_temp.check((select caught and stake = 0 and duel_losses = 3 from entries where user_id = g1 and round_id = r)
                        and pg_temp.board_ghost(h1, g1) is null
                        and (select hiders_remaining from rounds where id = r) = (select hiders_total from rounds where id = r) - 1,
                        'three losses: Ada is out and her light is gone');
  perform pg_temp.check((select body from notifications where user_id = g1 and kind = 'duel_lost' order by id desc limit 1) like '%you''re out%',
                        'Ada is told she''s out');
  perform pg_temp.fails('an out ghost can''t be challenged', 'ghost_out', format('select duel_challenge(%L, %L)', h1, g1));
end $$;
select pg_temp.check(pg_temp.gap() = gap_before, 'books balance after a ghost goes out') from books_d;

-- ============================================================ golden ghosts, hunters in the pool
update game_settings set value = 2 where key = 'hunter_pool_wins';
do $$
declare g2 uuid := pg_temp.uid('dg2@duels.test'); g3 uuid := pg_temp.uid('dg3@duels.test'); h1 uuid := pg_temp.uid('dh1@duels.test');
        h2 uuid := pg_temp.uid('dh2@duels.test'); r bigint := (select id from rounds where status = 'seek'); d bigint;
begin
  perform pg_temp.rested(h1);
  d := (duel_challenge(h1, g2)->>'id')::bigint;
  perform duel_answer(g2, d);
  perform pg_temp.throw(d, g2, h1, 'rock', 'scissors');
  perform pg_temp.throw(d, g2, h1, 'rock', 'scissors');
  perform pg_temp.check((select golden from entries where user_id = g2 and round_id = r) and pg_temp.board_ghost(h2, g2)->>'status' = 'golden'
                        and (duel_board(g2)->'me'->>'in_pool')::boolean, 'three wins: Bola turns golden and is in the pool');
  perform pg_temp.check((select body from notifications where user_id = g2 and kind = 'duel_won' order by id desc limit 1) like '%you''re golden%',
                        'Bola is told');
  perform pg_temp.fails('golden ghosts are safe', 'ghost_golden', format('select duel_challenge(%L, %L)', h2, g2));
  perform pg_temp.check((duel_board(h2)->'me'->>'in_pool')::boolean and not (duel_board(h1)->'me'->>'in_pool')::boolean,
                        'Kemi has 2 wins (enough here): she''s in the pool; Hunt isn''t');
  -- A challenge still waiting when the game ends is called off.
  perform pg_temp.rested(h1);
  perform duel_challenge(h1, g3);
end $$;

-- ============================================================ the end of the game
do $$
declare g1 uuid := pg_temp.uid('dg1@duels.test'); g2 uuid := pg_temp.uid('dg2@duels.test'); g3 uuid := pg_temp.uid('dg3@duels.test');
        h1 uuid := pg_temp.uid('dh1@duels.test'); h2 uuid := pg_temp.uid('dh2@duels.test');
        r bigint := (select id from rounds where status = 'seek'); pool numeric; share numeric;
        c1 numeric; c2 numeric; c3 numeric; ch1 numeric; ch2 numeric;
begin
  pool := pg_temp.pool();
  share := floor(round(pool * 0.9, 2) * 100 / 2) / 100;
  c1 := pg_temp.coins(g1); c2 := pg_temp.coins(g2); c3 := pg_temp.coins(g3); ch1 := pg_temp.coins(h1); ch2 := pg_temp.coins(h2);
  update rounds set seek_ends_at = now() - interval '1 second' where id = r;
  perform tick();
  perform pg_temp.check((select status from rounds where id = r) = 'done', 'the game ends');
  perform pg_temp.check((select status = 'void' and reason = 'game_over' from duels where hunter_id = h1 and round_id = r order by id desc limit 1)
                        and pg_temp.coins(h1) = ch1 + 10, 'the waiting challenge is called off: Hunt gets his 10 back');
  perform pg_temp.check(pg_temp.coins(g2) = c2 + 100 + share and pg_temp.coins(h2) = ch2 + share,
                        format('golden Bola gets her stake back plus a share (%s); Kemi gets a share too', share));
  perform pg_temp.check(pg_temp.coins(g3) = c3 + 100 and pg_temp.coins(g1) = c1, 'Chi (still in) gets her stake back; Ada (out) gets nothing');
  perform pg_temp.check((select coalesce(sum(amount), 0) from ledger where round_id = r and kind = 'burn' and note = 'bank') = pool - 2 * share,
                        'the rest of the pool burns');
end $$;
update game_settings set value = 20 where key = 'hunter_pool_wins';

-- ============================================================ switched off
select pg_temp.check((select count(*) from world_event_kinds where not enabled) = 10
  and not (select enabled from world_event_kinds where key = 'safe_house') and (select enabled from world_event_kinds where key = 'golden_balloon'),
  'the 10 hiding-and-hunting town events are off (the golden balloon is still on)');
select pg_temp.check((select count(*) from quest_catalog where not enabled and key in ('detective', 'drone_pilot', 'escape_artist', 'shadow')) = 4
  and (select enabled from quest_catalog where key = 'thief'), 'side quests about hiding and hunting are off (the thief is still on)');

-- ============================================================ running part 29 again
update game_settings set value = 15 where key = 'duel_fee';
create temp table before_rerun as select count(*) as n from duels;
\ir ../029_ghost_duels.sql
\o /dev/null
select pg_temp.check((select count(*) from duels) = n, 'part 29 re-run keeps every duel') from before_rerun;
select pg_temp.check(setting('duel_fee') = 15, 'part 29 re-run keeps changed settings');
update game_settings set value = 10 where key = 'duel_fee';

\o
select gap_before, pg_temp.gap() as gap_after from books_d;  -- must be equal
