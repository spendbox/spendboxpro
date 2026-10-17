\set ON_ERROR_STOP on
-- Part 123: scheduled games (Police & Thieves). Signing up on a side (and the sides kept even),
-- the ticket and the shop, pulling out, the start (matches and pools), results from the phones
-- (a loser owning up, a lie that nobody backs, the medians for shares, time running out), the
-- jackpot from a bots' win, and running the part twice.
\ir ../123_scheduled_games.sql
\ir ../123_scheduled_games.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
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
-- The next real start time (01:00, 09:00 or 17:00 UTC).
create function pg_temp.next_slot() returns timestamptz language sql as $$
  select min(t) from generate_series(date_trunc('hour', now()) + interval '1 hour', date_trunc('hour', now()) + interval '9 hours', interval '1 hour') t
  where extract(hour from t at time zone 'UTC')::int in (1, 9, 17)
$$;
-- Move a session in time: it started p_ago ago (and its fighting ends 10.5 minutes after that).
create function pg_temp.started(p_starts timestamptz, p_ago interval) returns timestamptz language plpgsql as $$
declare v timestamptz := now() - p_ago;
begin
  update sched_sessions set starts_at = v, fight_at = v + interval '30 seconds', ends_at = v + interval '630 seconds' where game = 'cops-robbers' and starts_at = p_starts;
  return v;
end $$;

insert into auth.users (email) select format('p%s@sg.test', k) from generate_series(1, 6) k;
update profiles set username = 'P' || substr(email_key, 2, 1) where email_key like '%@sg.test';
update profiles set coins = 500 where email_key like '%@sg.test';

do $$
declare
  p1 uuid := pg_temp.uid('p1@sg.test');
  p2 uuid := pg_temp.uid('p2@sg.test');
  p3 uuid := pg_temp.uid('p3@sg.test');
  p4 uuid := pg_temp.uid('p4@sg.test');
  p5 uuid := pg_temp.uid('p5@sg.test');
  p6 uuid := pg_temp.uid('p6@sg.test');
  t timestamptz := pg_temp.next_slot();
  v jsonb;
  sid bigint;
begin
  perform pg_temp.fails('only real start times', 'bad_time', format('select sched_join(%L, ''cops-robbers'', %L, 0, 3.33)', p1, t + interval '1 hour'));
  perform pg_temp.fails('not days ahead', 'bad_time', format('select sched_join(%L, ''cops-robbers'', %L, 0, 3.33)', p1, t + interval '24 hours'));

  -- Signing up, and the sides kept even.
  v := sched_join(p1, 'cops-robbers', t, 0, 3.33);
  perform pg_temp.check((v->>'in')::boolean and (v->>'side')::int = 0, 'signed up as police');
  perform pg_temp.check((select coins from profiles where id = p1) = 496.67, 'the ticket is paid');
  perform pg_temp.fails('police can''t get two ahead', 'side_full', format('select sched_join(%L, ''cops-robbers'', %L, 0, 3.33)', p2, t));
  perform sched_join(p2, 'cops-robbers', t, 1, 3.33);
  perform sched_join(p3, 'cops-robbers', t, 1, 3.33);
  perform pg_temp.fails('thieves can''t get two ahead', 'side_full', format('select sched_join(%L, ''cops-robbers'', %L, 1, 3.33)', p4, t));
  perform sched_join(p4, 'cops-robbers', t, 0, 3.33);
  perform pg_temp.fails('no changing to the bigger side', 'side_full', format('select sched_join(%L, ''cops-robbers'', %L, 1, 3.33)', p1, t));
  v := sched_join(p4, 'cops-robbers', t, 0, 3.33);
  perform pg_temp.check((select coins from profiles where id = p4) = 496.67, 'signing up again pays nothing more');
  v := sched_status(p1, 'cops-robbers', t);
  perform pg_temp.check((v->>'police')::int = 2 and (v->>'thieves')::int = 2, 'two a side');
  perform pg_temp.check((v->>'pool')::numeric = round(4 * 3.33 * 0.9, 2), 'the pool so far, less the house');

  -- The shop.
  v := sched_buy(p1, 'cops-robbers', t, 'rifle', 1, 16.67, 1);
  perform pg_temp.check((v->'gear'->>'rifle')::int = 1 and (v->>'spent')::numeric = 20, 'bought a rifle');
  perform pg_temp.fails('one rifle is enough', 'too_many', format('select sched_buy(%L, ''cops-robbers'', %L, ''rifle'', 1, 16.67, 1)', p1, t));
  v := sched_buy(p1, 'cops-robbers', t, 'grenade', 3, 2, 6);
  perform pg_temp.check((v->'gear'->>'grenade')::int = 3, 'three grenades');
  update profiles set coins = 10 where id = p3;
  perform pg_temp.fails('not more than you have', 'not_enough', format('select sched_buy(%L, ''cops-robbers'', %L, ''tank'', 1, 166.67, 1)', p3, t));
  update profiles set coins = 496.67 where id = p3;
  perform pg_temp.fails('signed up first', 'not_in', format('select sched_buy(%L, ''cops-robbers'', %L, ''smg'', 1, 6.67, 1)', p5, t));
  perform sched_buy(p2, 'cops-robbers', t, 'tank', 1, 166.67, 1);
  perform pg_temp.check((select coins from profiles where id = p2) = 330, 'a tank: 166.67');
  update profiles set coins = 5000 where id = p2;
  perform sched_buy(p2, 'cops-robbers', t, 'rocket', 1, 250, 1);
  perform pg_temp.fails('the most one player spends', 'spend_cap', format('select sched_buy(%L, ''cops-robbers'', %L, ''sniper'', 1, 100, 1)', p2, t));
  perform pg_temp.fails('the price is capped', 'too_many', format('select sched_buy(%L, ''cops-robbers'', %L, ''tank'', 1, 999, 1)', p2, t));

  -- Pulling out: everything back. Then in again.
  perform sched_join(p5, 'cops-robbers', t, 0, 3.33);
  perform sched_buy(p5, 'cops-robbers', t, 'smg', 1, 6.67, 1);
  perform sched_leave(p5, 'cops-robbers', t);
  perform pg_temp.check((select coins from profiles where id = p5) = 500, 'pulled out: all of it back');

  -- Too late for the room before the start.
  perform pg_temp.check((sched_room(p1, 'cops-robbers', t)->>'status') = 'open', 'no match before the start');

  -- It starts: one match, 2 v 2; the pool is everything spent, less a tenth.
  t := pg_temp.started(t, interval '1 minute');
  perform pg_temp.fails('too late to sign up', 'started', format('select sched_join(%L, ''cops-robbers'', %L, 0, 3.33)', p5, t));
  perform pg_temp.fails('too late to shop', 'started', format('select sched_buy(%L, ''cops-robbers'', %L, ''smg'', 1, 6.67, 1)', p1, t));
  v := sched_room(p3, 'cops-robbers', t);
  sid := (select id from sched_sessions where game = 'cops-robbers' and starts_at = t);
  perform pg_temp.check((v->>'status') = 'playing' and (v->>'room')::int = 1 and jsonb_array_length(v->'roster') = 4, 'one match of four');
  perform pg_temp.check((v->>'pool')::numeric = round((3.33 * 4 + 16.67 + 6 + 166.67 + 250) * 0.9, 2), 'its pool');
  perform pg_temp.check((select (r->'g'->>'rifle')::int from jsonb_array_elements(v->'roster') r where r->>'i' = p1::text) = 1, 'the roster carries the gear');
  perform pg_temp.fails('no result before the end', 'too_early', format('select sched_report(%L, ''cops-robbers'', %L, 0, ''{}''::jsonb)', p1, t));

  -- The end. Police say police won; thieves say thieves: nobody owns up, so it waits.
  t := pg_temp.started(t, interval '11 minutes');
  v := sched_report(p1, 'cops-robbers', t, 0, jsonb_build_object(p1, jsonb_build_array(300, 3, 1, 0), p4, jsonb_build_array(100, 1, 2, 0), p2, jsonb_build_array(50, 1, 3, 0), p3, jsonb_build_array(40, 0, 2, 0)));
  perform pg_temp.check((v->>'waiting')::boolean, 'one side alone saying it won: waiting');
  v := sched_report(p2, 'cops-robbers', t, 1, jsonb_build_object(p1, jsonb_build_array(300, 3, 1, 0), p4, jsonb_build_array(100, 1, 2, 0), p2, jsonb_build_array(9000, 1, 3, 0), p3, jsonb_build_array(40, 0, 2, 0)));
  perform pg_temp.check((v->>'waiting')::boolean, 'a lie nobody backs: still waiting');
  -- A thief owns up: police won. Shares by the middle of what the phones said.
  v := sched_report(p3, 'cops-robbers', t, 0, jsonb_build_object(p1, jsonb_build_array(310, 3, 1, 0), p4, jsonb_build_array(90, 1, 2, 0), p2, jsonb_build_array(50, 1, 3, 0), p3, jsonb_build_array(40, 0, 2, 0)));
  perform pg_temp.check((v->>'w')::int = 0, 'a thief owning up: police won');
  perform pg_temp.check((select prize from sched_players where session_id = sid and user_id = p1) = round((select pool from sched_rooms where session_id = sid) * 300 / 400, 2), 'the best police player gets three quarters (median 300 of 400)');
  perform pg_temp.check((select prize from sched_players where session_id = sid and user_id = p2) = 0, 'thieves get nothing');
  perform pg_temp.check((select sum(prize) from sched_players where session_id = sid) <= (select pool from sched_rooms where session_id = sid), 'never more than the pool');
  perform pg_temp.check((select (r->>'a')::numeric from jsonb_array_elements(v->'rows') r where r->>'i' = p2::text) = 50, 'the puffed-up score is ignored (median)');
  perform pg_temp.check((select status from sched_sessions where id = sid) = 'done', 'the session is done');
  v := sched_status(p1, 'cops-robbers', pg_temp.next_slot());
  perform pg_temp.check(jsonb_array_length(v->'last'->'rows') = 4 and (v->'last'->'me'->>'prize')::numeric > 0, 'the last game''s leaderboard, and your prize');
end $$;

-- A second game: nobody agrees, and time runs out (everyone's part back); then a game the bots win (jackpot).
do $$
declare
  p1 uuid := pg_temp.uid('p1@sg.test');
  p2 uuid := pg_temp.uid('p2@sg.test');
  p6 uuid := pg_temp.uid('p6@sg.test');
  t timestamptz := pg_temp.next_slot();
  v jsonb;
  sid bigint;
  before1 numeric;
  before2 numeric;
begin
  delete from sched_sessions where status = 'done';
  update profiles set coins = 500 where email_key like '%@sg.test';
  perform sched_join(p1, 'cops-robbers', t, 0, 10);
  perform sched_join(p2, 'cops-robbers', t, 1, 10);
  t := pg_temp.started(t, interval '11 minutes');
  perform sched_room(p1, 'cops-robbers', t);
  sid := (select id from sched_sessions where game = 'cops-robbers' and starts_at = t);
  perform sched_report(p1, 'cops-robbers', t, 0, '{}'::jsonb);
  perform sched_report(p2, 'cops-robbers', t, 1, '{}'::jsonb);
  select coins into before1 from profiles where id = p1;
  update sched_sessions set ends_at = now() - interval '4 minutes' where id = sid;
  perform sched_sweep('cops-robbers');
  perform pg_temp.check((select winner from sched_rooms where session_id = sid) = -2, 'nobody agreed: settled with everyone''s part back');
  perform pg_temp.check((select coins from profiles where id = p1) = before1 + 9, 'their 90% back');

  -- One person, alone against bots, who lose... the bots win: the pool goes into the jackpot.
  delete from sched_sessions where status = 'done';
  t := pg_temp.next_slot();
  perform sched_join(p6, 'cops-robbers', t, 1, 10);
  t := pg_temp.started(t, interval '11 minutes');
  perform sched_room(p6, 'cops-robbers', t);
  v := sched_report(p6, 'cops-robbers', t, 0, '{}'::jsonb);
  perform pg_temp.check((v->>'jackpot')::boolean, 'the bots won: into the jackpot');
  perform pg_temp.check((select amount from sched_jackpot where game = 'cops-robbers') = 9, 'the jackpot holds it');

  -- The next game with people on both sides gets the jackpot.
  delete from sched_sessions where status = 'done';
  t := pg_temp.next_slot();
  perform sched_join(p1, 'cops-robbers', t, 0, 10);
  perform sched_join(p2, 'cops-robbers', t, 1, 10);
  t := pg_temp.started(t, interval '1 minute');
  v := sched_room(p1, 'cops-robbers', t);
  perform pg_temp.check((v->>'pool')::numeric = 18 + 9, 'the jackpot is added to the pool');
  perform pg_temp.check((select amount from sched_jackpot where game = 'cops-robbers') = 0, 'and emptied');
end $$;

-- Lots of players: shared into even matches of up to 8 a side.
do $$
declare
  t timestamptz;
  v jsonb;
  sid bigint;
  u uuid;
  k int := 0;
begin
  delete from sched_sessions;
  insert into auth.users (email) select format('m%s@sg.test', g) from generate_series(1, 20) g;
  update profiles set coins = 100, username = 'M' || email_key where email_key like 'm%@sg.test';
  t := pg_temp.next_slot();
  for u in select id from profiles where email_key like 'm%@sg.test' order by email_key loop
    perform sched_join(u, 'cops-robbers', t, k % 2, 1);
    k := k + 1;
  end loop;
  t := pg_temp.started(t, interval '1 minute');
  v := sched_room(u, 'cops-robbers', t);
  sid := (select id from sched_sessions where game = 'cops-robbers' and starts_at = t);
  perform pg_temp.check((v->>'rooms')::int = 2, '20 players: two matches');
  perform pg_temp.check((select bool_and(c = 5) from (select count(*) c from sched_players where session_id = sid group by room, side) x), 'each 5 v 5');
end $$;
\o
