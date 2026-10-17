\set ON_ERROR_STOP on
-- Part 124: the money cheats closed before launch. Game results (a lone claim, a friend naming a
-- winner, a loser owning up, giving up, a majority, a dispute running out), new accounts' stakes,
-- trips (too many a minute, finds rolled here with a daily cap), and online pay only after doing
-- something. And running the part twice.
\ir ../124_launch_money.sql
\ir ../124_launch_money.sql
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
-- A game with these players, started (the first one hosts), stake 10 each.
create function pg_temp.game(ps uuid[]) returns bigint language plpgsql as $$
declare v_id bigint; k int;
begin
  v_id := (challenge_open(ps[1], 'lagos', 'whot', 10, 5, 5, 6, 0, 60)->>'id')::bigint;
  for k in 2 .. array_length(ps, 1) loop perform challenge_join(ps[k], v_id); end loop;
  update challenges set starts_at = now() - interval '1 second' where id = v_id;
  perform challenge_begin(v_id);
  return v_id;
end $$;

insert into auth.users (email) values ('a@lm.test'), ('b@lm.test'), ('c@lm.test'), ('d@lm.test'), ('new@lm.test');
update profiles set username = 'LM' || substr(email_key, 1, 3) where email_key like '%@lm.test';
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key like '%@lm.test';
update profiles set coins = 100000 where email_key like '%@lm.test';
-- Old enough accounts, except the new one.
update profiles set created_at = now() - interval '30 days', level = 10 where email_key like '%@lm.test' and email_key <> 'new@lm.test';

do $$
declare
  a uuid := pg_temp.uid('a@lm.test');
  b uuid := pg_temp.uid('b@lm.test');
  c uuid := pg_temp.uid('c@lm.test');
  d uuid := pg_temp.uid('d@lm.test');
  nw uuid := pg_temp.uid('new@lm.test');
  id1 bigint;
  v jsonb;
  k int;
  n int;
begin
  -- 1. A lone "I won" waits, and after the settling time goes to stakes back, never a payout.
  id1 := pg_temp.game(array[a, b]);
  v := challenge_report(a, id1, a, false);
  perform pg_temp.check((v->>'waiting')::boolean, 'a lone claim: waits');
  update challenge_players set said_at = now() - interval '4 minutes' where challenge_id = id1;
  v := challenge_report(a, id1, null, false);
  perform pg_temp.check((v->>'draw')::boolean and (select status from challenges where id = id1) = 'cancelled', 'a lone claim, time up: called off');
  perform pg_temp.check((select coins from profiles where id = a) = 100000 and (select coins from profiles where id = b) = 100000, 'a lone claim: everyone''s stake back, nobody paid');

  -- The sweep does the same for games everyone closed.
  id1 := pg_temp.game(array[a, b]);
  v := challenge_report(a, id1, a, false);
  update challenge_players set said_at = now() - interval '4 minutes' where challenge_id = id1;
  perform challenge_sweep('lagos');
  perform pg_temp.check((select status from challenges where id = id1) = 'cancelled' and (select coins from profiles where id = a) = 100000, 'the sweep: a lone old claim is called off');

  -- Two players: the loser owns up, paid at once.
  id1 := pg_temp.game(array[a, b]);
  v := challenge_report(b, id1, a, false);
  perform pg_temp.check((v->>'winner')::uuid = a and (v->>'prize')::numeric = 18, 'two players: the loser owns up, paid');

  -- Two players each say the other won (said at the same moment): nobody paid; stakes back when time is up.
  id1 := pg_temp.game(array[a, b]);
  update challenge_players set says = case when user_id = a then b else a end, said_at = now() where challenge_id = id1;
  v := challenge_report(a, id1, null, false);
  perform pg_temp.check((v->>'waiting')::boolean, 'each says the other won: waits');
  update challenge_players set said_at = now() - interval '4 minutes' where challenge_id = id1;
  v := challenge_report(a, id1, null, false);
  perform pg_temp.check((v->>'draw')::boolean, 'each says the other won: stakes back');

  -- 2. Three players: a friend naming the cheat as winner isn't enough.
  update profiles set coins = 100000 where email_key like '%@lm.test';
  id1 := pg_temp.game(array[a, b, c]);
  v := challenge_report(a, id1, a, false);
  v := challenge_report(b, id1, a, false);
  perform pg_temp.check((v->>'waiting')::boolean, 'three players: the winner and one friend: not paid');
  v := challenge_report(c, id1, c, false);
  perform pg_temp.check((v->>'waiting')::boolean, 'and the other disagrees: still not paid');
  update challenge_players set said_at = now() - interval '4 minutes' where challenge_id = id1;
  v := challenge_report(c, id1, null, false);
  perform pg_temp.check((v->>'draw')::boolean and (select coins from profiles where id = a) = 100000, 'a dispute: stakes back after the settling time');

  -- Three players, both others agree: paid.
  id1 := pg_temp.game(array[a, b, c]);
  v := challenge_report(b, id1, a, false);
  v := challenge_report(c, id1, a, false);
  perform pg_temp.check((v->>'winner')::uuid = a and (v->>'prize')::numeric = 27, 'three players, both others agree: paid');

  -- Four players: two of the three others is a majority.
  update profiles set coins = 100000 where email_key like '%@lm.test';
  id1 := pg_temp.game(array[a, b, c, d]);
  v := challenge_report(b, id1, d, false);
  perform pg_temp.check((v->>'waiting')::boolean, 'four players: one of three others: not yet');
  v := challenge_report(c, id1, d, false);
  perform pg_temp.check((v->>'winner')::uuid = d, 'four players: two of three others: paid');

  -- Giving up: one leaves a game of three, then the last other one owns up.
  update profiles set coins = 100000 where email_key like '%@lm.test';
  id1 := pg_temp.game(array[a, b, c]);
  perform challenge_leave(b, id1);
  v := challenge_report(a, id1, a, false);
  perform pg_temp.check((v->>'waiting')::boolean, 'one gave up: the winner alone isn''t enough');
  v := challenge_report(c, id1, a, false);
  perform pg_temp.check((v->>'winner')::uuid = a, 'one gave up, the other owns up: paid');
  -- Leaving a game of two: the other wins (everyone else gave up).
  id1 := pg_temp.game(array[a, b]);
  perform pg_temp.check(challenge_leave(b, id1) = 'won_by_other', 'leaving a game of two: the other wins');
  perform pg_temp.check((select winner_id from challenges where id = id1) = a, 'and is paid');

  -- A draw: both say so, stakes back at once.
  id1 := pg_temp.game(array[a, b]);
  v := challenge_report(a, id1, null, true);
  v := challenge_report(b, id1, null, true);
  perform pg_temp.check((v->>'draw')::boolean, 'both say draw: stakes back');

  -- A game the server plays (Whot!): the phones' claims are ignored; the server pays.
  update profiles set coins = 100000 where email_key like '%@lm.test';
  id1 := pg_temp.game(array[a, b]);
  insert into whot_games (challenge_id, game) values (id1, '{}');
  v := challenge_report(b, id1, a, false);
  perform pg_temp.check((v->>'waiting')::boolean and (select says from challenge_players where challenge_id = id1 and user_id = b) is null, 'a server game: a phone''s word isn''t taken');
  v := challenge_award(id1, b);
  perform pg_temp.check((v->>'winner')::uuid = b and (select coins from profiles where id = b) = 100000 + 8, 'the server pays the winner');
  -- The server's game, someone gives up: the other wins.
  id1 := pg_temp.game(array[a, b]);
  insert into whot_games (challenge_id, game) values (id1, '{}');
  perform challenge_leave(a, id1);
  perform pg_temp.check((select winner_id from challenges where id = id1) = b, 'a server game: giving up hands it to the other');
  -- A winner who left gets nothing: stakes back.
  id1 := pg_temp.game(array[a, b, c]);
  insert into whot_games (challenge_id, game) values (id1, '{}');
  perform challenge_leave(c, id1);
  v := challenge_award(id1, c);
  perform pg_temp.check((v->>'draw')::boolean and (select status from challenges where id = id1) = 'cancelled', 'a server game won by a seat whose player left: stakes back');

  -- New accounts: at most stake_new_daily_max a day into pools.
  update public.game_settings set value = 25 where key = 'stake_new_daily_max';
  id1 := pg_temp.game(array[a, nw]);
  perform pg_temp.check(stake_left_today((select p from profiles p where id = nw)) = 15, 'a new account: 15 of 25 left today');
  perform pg_temp.check(stake_left_today((select p from profiles p where id = a)) is null, 'an old account: no limit');
  v := challenge_report(nw, id1, a, false);
  id1 := (challenge_open(a, 'lagos', 'whot', 10, 5, 5, 6, 0, 60)->>'id')::bigint;
  perform challenge_join(nw, id1);
  perform challenge_leave(a, id1);
  id1 := (challenge_open(b, 'lagos', 'whot', 20, 5, 5, 6, 0, 60)->>'id')::bigint;
  perform pg_temp.fails('a new account over the daily stakes', 'new_stake_cap', format('select challenge_join(%L, %s)', nw, id1));
  perform pg_temp.check((select count(*) from challenge_players where challenge_id = id1) = 1, 'and isn''t in it');
  perform pg_temp.fails('a new account hosting over it', 'new_stake_cap', format('select challenge_open(%L, ''lagos'', ''whot'', 20, 5, 5, 6, 0, 60)', nw));
  perform challenge_leave(b, id1);

  -- 3. Trips: at most trip_max_per_minute a minute.
  update lives set trip_n = 0, trip_since = null where user_id = c;
  for k in 1 .. 10 loop perform life_go(c, 'lagos:1,' || k, 0); end loop;
  perform pg_temp.fails('an 11th trip in a minute', 'too_fast', format('select life_go(%L, ''lagos:1,99'', 0)', c));
  update lives set trip_since = now() - interval '61 seconds' where user_id = c;
  perform life_go(c, 'lagos:1,99', 0);
  perform pg_temp.check((select at_place from lives where user_id = c) = 'lagos:1,99', 'a minute later: trips again');

  -- Finds: rolled here, at most trip_find_daily_max a day.
  update public.game_settings set value = 1 where key = 'trip_find_chance';
  n := 0;
  for k in 1 .. 6 loop if trip_find(c) then n := n + 1; end if; end loop;
  perform pg_temp.check(n = 3, 'finds: at most 3 a day');
  update lives set find_day = find_day - 1 where user_id = c;
  perform pg_temp.check(trip_find(c), 'the next day: finds again');
  update public.game_settings set value = 0 where key = 'trip_find_chance';
  perform pg_temp.check(not trip_find(c), 'no luck: nothing');

  -- 4. Online pay: only after doing something the server saw.
  update public.game_settings set value = 0.33 where key = 'online_pay_minute';
  update public.game_settings set value = 240 where key = 'online_pay_daily_minutes';
  update lives set acted_at = null where user_id = d;
  delete from activity_days where user_id = d;
  v := online_ping(d);
  perform pg_temp.check((v->>'paid')::numeric = 0 and (v->>'idle')::boolean and (v->>'minutes')::int = 1, 'pinging with nothing done: counted, not paid');
  if not exists (select 1 from rounds) then insert into rounds (join_ends_at, seek_ends_at) values (now() + interval '1 hour', now() + interval '2 hours'); end if;
  perform town_hall_send(d, 'lagos', 'hello');
  perform pg_temp.check((select acted_at from lives where user_id = d) is not null, 'a message: seen doing something');
  update activity_days set last_ping = now() - interval '2 minutes' where user_id = d;
  v := online_ping(d);
  perform pg_temp.check((v->>'paid')::numeric = 0.33, 'after a message: paid');
  update lives set acted_at = now() - interval '30 minutes' where user_id = d;
  update activity_days set last_ping = now() - interval '2 minutes' where user_id = d;
  v := online_ping(d);
  perform pg_temp.check((v->>'paid')::numeric = 0, 'nothing done for 30 minutes: not paid');
  perform life_go(d, 'lagos:3,3', 0);
  update activity_days set last_ping = now() - interval '2 minutes' where user_id = d;
  v := online_ping(d);
  perform pg_temp.check((v->>'paid')::numeric = 0.33, 'after a trip: paid again');
end $$;

\o
\echo 'launch money: all ok'
