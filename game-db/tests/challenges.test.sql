\set ON_ERROR_STOP on
-- Part 70: challenges on the map. Opening (free, then a fee before the cooldown), joining, the
-- minute running out (start, or called off with stakes back), the result (agreement, a loser owning
-- up, a draw, a lone answer after two minutes), the prize, reputation, and running it twice.
\ir ../070_challenges.sql
\ir ../070_challenges.sql
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
-- The minute is up (instead of waiting for it).
create function pg_temp.time_up(p_id bigint) returns void language sql as $$
  update challenges set starts_at = now() - interval '1 second' where id = p_id
$$;

insert into auth.users (email) values ('a@ch.test'), ('b@ch.test'), ('c@ch.test'), ('d@ch.test');
update profiles set username = 'Ada' where email_key = 'a@ch.test';
update profiles set username = 'Bayo' where email_key = 'b@ch.test';
update profiles set username = 'Chi' where email_key = 'c@ch.test';
update profiles set username = 'Dele' where email_key = 'd@ch.test';
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key like '%@ch.test';
update profiles set coins = 1000 where email_key like '%@ch.test';

do $$
declare
  a uuid := pg_temp.uid('a@ch.test');
  b uuid := pg_temp.uid('b@ch.test');
  c uuid := pg_temp.uid('c@ch.test');
  d uuid := pg_temp.uid('d@ch.test');
  v jsonb;
  id1 bigint;
  id2 bigint;
  id3 bigint;
  id4 bigint;
  s text;
begin
  -- Nobody joins: called off, stake back.
  v := challenge_open(a, 'lagos', 'whot', 10, 5, 5, 4, 33.33, 480);
  id1 := (v->>'id')::bigint;
  perform pg_temp.check((v->>'fee')::numeric = 0, 'the first challenge is free');
  perform pg_temp.check((select coins from profiles where id = a) = 990, 'the host pays the stake into the pool');
  perform pg_temp.check(challenge_begin(id1) = 'open', 'not started before the minute is up');
  perform pg_temp.fails('busy: one challenge at a time', 'busy', format('select challenge_open(%L, ''lagos'', ''ludo'', 10, 5, 5, 4, 33.33, 480)', a));
  perform pg_temp.time_up(id1);
  perform pg_temp.fails('too late to join', 'started', format('select challenge_join(%L, %s)', b, id1));
  perform pg_temp.check(challenge_begin(id1) = 'cancelled', 'nobody joined: called off');
  perform pg_temp.check((select coins from profiles where id = a) = 1000, 'nobody joined: the stake is back');
  perform pg_temp.check(exists (select 1 from notifications where user_id = a and body like '%didn''t start%'), 'told it didn''t start');

  -- One nobody joined doesn't count towards the cooldown. Two join; all three agree who won.
  v := challenge_open(a, 'lagos', 'whot', 10, 5, 5, 4, 33.33, 480);
  id2 := (v->>'id')::bigint;
  perform pg_temp.check((v->>'fee')::numeric = 0, 'after one nobody joined: still free');
  v := challenge_join(b, id2);
  v := challenge_join(c, id2);
  v := challenge_join(c, id2);
  perform pg_temp.check((v->>'already')::boolean, 'joining twice changes nothing');
  perform pg_temp.check((select pool from challenges where id = id2) = 30, 'three stakes in the pool');
  perform pg_temp.time_up(id2);
  perform pg_temp.check(challenge_begin(id2) = 'playing', 'two or more: it starts');
  perform pg_temp.check(challenge_begin(id2) = 'playing', 'starting again changes nothing');
  perform pg_temp.check(exists (select 1 from notifications where user_id = b and body like 'Game on!%'), 'players told it started');
  v := challenge_report(a, id2, a, false);
  perform pg_temp.check(v->>'winner' is null, 'one of three says so: not yet');
  v := challenge_report(c, id2, a, false);
  perform pg_temp.check((v->>'winner')::uuid = a and (v->>'prize')::numeric = 27, 'two of three agree: paid, less a tenth');
  perform pg_temp.check((select coins from profiles where id = a) = 1000 - 10 + 27, 'the winner has the prize');
  v := challenge_report(b, id2, b, false);
  perform pg_temp.check((v->>'winner')::uuid = a, 'once settled, it stays settled');
  perform pg_temp.check((select coins from profiles where id = b) = 990, 'the loser paid the stake only');

  -- Two players: the loser owns up (or gives up): paid at once.
  v := challenge_open(b, 'lagos', 'ludo', 20, 9, 9, 4, 33.33, 480);
  id3 := (v->>'id')::bigint;
  v := challenge_join(d, id3);
  perform pg_temp.time_up(id3);
  perform challenge_begin(id3);
  v := challenge_report(b, id3, d, false);
  perform pg_temp.check((v->>'winner')::uuid = d, 'the loser says the other won: paid at once');
  perform pg_temp.check((select coins from profiles where id = d) = 1000 - 20 + 36, 'the winner gets the pool less a tenth');

  -- A draw: both say so, stakes back.
  v := challenge_open(c, 'lagos', 'whot', 15, 1, 1, 4, 33.33, 480);
  id4 := (v->>'id')::bigint;
  v := challenge_join(d, id4);
  perform pg_temp.time_up(id4);
  perform challenge_begin(id4);
  v := challenge_report(c, id4, null, true);
  perform pg_temp.check(v->>'draw' is null, 'one says draw: not yet');
  v := challenge_report(d, id4, null, true);
  perform pg_temp.check((v->>'draw')::boolean, 'both say draw: a draw');
  perform pg_temp.check((select status from challenges where id = id4) = 'cancelled' and (select started_at from challenges where id = id4) is not null, 'a draw: called off after it started');
  perform pg_temp.check((select coins from profiles where id = c) = 1000 - 10, 'a draw: the stake is back');

  -- Only one answer, nobody disagrees, two minutes go by (the others closed the game): settled.
  v := challenge_open(d, 'lagos', 'whot', 5, 2, 2, 4, 33.33, 480);
  id1 := (v->>'id')::bigint;
  v := challenge_join(a, id1);
  perform pg_temp.time_up(id1);
  perform challenge_begin(id1);
  v := challenge_report(d, id1, d, false);
  perform pg_temp.check(v->>'winner' is null, 'a lone answer: waits');
  -- Not in it: can't say who won.
  perform pg_temp.fails('only players say who won', 'not_in', format('select challenge_report(%L, %s, %L, false)', b, id1, b));
  update challenge_players set said_at = now() - interval '3 minutes' where challenge_id = id1;
  perform challenge_sweep('lagos');
  perform pg_temp.check((select status from challenges where id = id1) = 'done' and (select winner_id from challenges where id = id1) = d, 'a lone answer two minutes old: the sweep settles it');

  -- Challenging again within the cooldown, after one that was played: the fee.
  v := challenge_open(a, 'lagos', 'whot', 10, 5, 5, 4, 33.33, 480);
  id2 := (v->>'id')::bigint;
  perform pg_temp.check((v->>'fee')::numeric = 33.33, 'again before the cooldown: the fee');
  perform pg_temp.check((select coins from profiles where id = a) = 1012 - 33.33 - 10, 'fee and stake paid');
  perform pg_temp.time_up(id2);
  perform challenge_begin(id2);
  perform pg_temp.check((select coins from profiles where id = a) = 1012 - 33.33, 'called off: the stake is back, not the fee');


  -- Leaving before it starts: a player gets their stake back; the host calls it off for everyone.
  update profiles set coins = 1000 where email_key like '%@ch.test';
  v := challenge_open(b, 'lagos', 'whot', 10, 3, 3, 4, 33.33, 1);
  id3 := (v->>'id')::bigint;
  v := challenge_join(c, id3);
  v := challenge_join(d, id3);
  perform pg_temp.check(challenge_leave(c, id3) = 'left', 'a player leaves before it starts');
  perform pg_temp.check((select coins from profiles where id = c) = 1000 and (select pool from challenges where id = id3) = 20, 'their stake is back, out of the pool');
  perform pg_temp.check(challenge_busy(c) is null, 'and they can challenge again');
  perform pg_temp.check(challenge_leave(b, id3) = 'cancelled', 'the host leaves: called off');
  perform pg_temp.check((select coins from profiles where id = b) = 1000 - (select fee from challenges where id = id3) and (select coins from profiles where id = d) = 1000, 'everyone''s stake is back');
  perform pg_temp.check(challenge_busy(b) is null and challenge_busy(d) is null, 'nobody is stuck in it');

  -- Leaving mid-game with two: the other wins at once.
  v := challenge_open(c, 'lagos', 'ludo', 10, 3, 3, 4, 33.33, 1);
  id3 := (v->>'id')::bigint;
  v := challenge_join(d, id3);
  perform pg_temp.time_up(id3);
  perform challenge_begin(id3);
  perform pg_temp.check(challenge_leave(d, id3) = 'won_by_other', 'leaving a game of two: the other wins');
  perform pg_temp.check((select winner_id from challenges where id = id3) = c and (select coins from profiles where id = c) = 1000 - 10 + 18, 'and is paid');
  perform pg_temp.check(challenge_busy(d) is null, 'the one who left is free');

  -- Leaving mid-game with three: the game goes on, the leaver is free.
  v := challenge_open(c, 'lagos', 'whot', 10, 3, 3, 4, 33.33, 1);
  id3 := (v->>'id')::bigint;
  v := challenge_join(d, id3);
  v := challenge_join(b, id3);
  perform pg_temp.time_up(id3);
  perform challenge_begin(id3);
  perform pg_temp.check(challenge_leave(d, id3) = 'left' and (select status from challenges where id = id3) = 'playing', 'leaving a game of three: it goes on');
  perform pg_temp.check(challenge_busy(d) is null and challenge_busy(c) = id3, 'the leaver is free, the others still in it');

  -- Reputation: hosted and played, won.
  v := challenge_rep(a);
  perform pg_temp.check((v->>'hosted')::int = 1 and (v->>'won')::int = 1, 'reputation counts: hosted 1, won 1');
  perform pg_temp.check(challenge_busy(a) is null, 'all over: free to challenge again');
end $$;

\o
\echo 'challenges: all ok'
