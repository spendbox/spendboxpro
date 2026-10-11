\set ON_ERROR_STOP on
-- Part 41: your day. Body and Mind move by the game day; burnout stops work; the gym is paid from
-- Essentials; time spent is written down; a side hustle earns (with a swing), can be boosted or
-- stalled; care for the mind; interview cool-downs; one breakthrough at a time, closed once.
\ir ../041_your_day.sql
\ir ../041_your_day.sql
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

insert into auth.users (email) values ('d1@day.test');
update profiles set username = 'Dayer1' where email_key = 'd1@day.test';

do $$
declare
  a uuid := pg_temp.uid('d1@day.test');
  v jsonb;
  t numeric;
  snap jsonb := '{"id":"lagos:80,80","kind":"flats","units":[{"id":"lagos:80,80/0"}]}';
begin
  perform life_start(a, 'lagos');
  perform pg_temp.fails('a home before a hustle', 'home_first', format('select life_hustle_start(%L, %L, %L, %L, 1.5, 0.3, 3, 10)', a, 'braiding', 'Hair braiding', 'beauty'));
  perform property_buy(a, 'lagos', 'lagos:80,80/0', snap, 1000, 'home', 60, 'Flat 1', 2);
  update profiles set coins = 1000 where id = a;

  -- Ten game days: body and mind move by the day, gym paid, hours written down.
  update lives set health = 50, mind = 50, health_at = now() - interval '20 hours', bills_at = now() where user_id = a;
  insert into life_pots (user_id, pot, balance) values (a, 'essentials', 100) on conflict (user_id, pot) do update set balance = 100;
  v := life_tick(a, 0, 0, 3.33, 0.5, 2, 0.33, '{"job": 8, "commute": 1.5, "exercise": 1}');
  perform pg_temp.check(abs((v->>'health')::numeric - 55) < 0.1 and abs((v->>'mind')::numeric - 70) < 0.1, 'body +0.5 and mind +2 a game day for ten days');
  perform pg_temp.check(abs((select balance from life_pots where user_id = a and pot = 'essentials') - 96.7) < 0.05, 'the gym paid from Essentials');
  perform pg_temp.check(abs((life_time(a, 24)->>'job')::numeric - 80) < 0.5 and abs((life_time(a, 24)->>'commute')::numeric - 15) < 0.5, 'time spent written down');

  -- Burnout: no pay.
  perform life_work_take(a, 'lagos', 'lagos:81,80', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 2, 0, 'walk', 0);
  update lives set mind = 5 where user_id = a;
  update life_jobs set paid_until = now() - interval '4 hours' where user_id = a;
  perform pg_temp.check((life_work_collect(a, 0)->>'gross')::numeric = 0, 'burnt out: no work');
  update lives set mind = 70 where user_id = a;

  -- A side hustle: start-up cost, earnings with a swing, taxed, shared into pots.
  insert into life_pots (user_id, pot, balance) values (a, 'savings', 50) on conflict (user_id, pot) do update set balance = 50;
  v := life_hustle_start(a, 'braiding', 'Hair braiding', 'beauty', 1.5, 0.3, 3, 13.33);
  perform pg_temp.check(abs((select balance from life_pots where user_id = a and pot = 'savings') - 36.67) < 0.02, 'start-up cost from Savings');
  perform pg_temp.fails('not the same hustle twice', 'already', format('select life_hustle_start(%L, %L, %L, %L, 1.5, 0.3, 3, 10)', a, 'braiding', 'Hair braiding', 'beauty'));
  update life_hustles set paid_until = now() - interval '4 hours' where user_id = a;
  v := life_hustle_collect(a);
  perform pg_temp.check((v->>'gross')::numeric between 2.09 and 3.91 and (v->>'tax')::numeric > 0, 'two game days of braiding, give or take the swing');

  -- Breakthroughs: one at a time, closed once; a boost and a stall.
  perform pg_temp.check(life_event_open(a, 'evt-aaaaaaaa', 'hustle', 'braiding-1', 'A bride wants braids', 2), 'a breakthrough opens');
  perform pg_temp.check(not life_event_open(a, 'evt-bbbbbbbb', 'job', 'retail-1', 'Another', 2), 'only one at a time');
  perform pg_temp.check((life_status(a)->'event'->>'id') = 'evt-aaaaaaaa', 'it shows in your status');
  v := life_event_close(a, 'evt-aaaaaaaa', true, 0, 'beauty', 3, 2, 3, 0);
  perform pg_temp.check((select boost from life_hustles where user_id = a) = 2 and (select boost_until from life_hustles where user_id = a) > now() + interval '5 hours', 'won: the hustle is boosted');
  perform pg_temp.fails('closed once', 'event_over', format('select life_event_close(%L, %L, true, 10, null, 0, 1, 0, 0)', a, 'evt-aaaaaaaa'));
  perform pg_temp.check(not life_event_open(a, 'evt-cccccccc', 'job', 'retail-1', 'Too soon', 2), 'a cool-down after each');
  update lives set event_at = now() - interval '5 hours' where user_id = a;
  perform life_event_open(a, 'evt-dddddddd', 'hustle', 'braiding-2', 'A customer complains', 2);
  perform life_event_close(a, 'evt-dddddddd', false, 0, null, 0, 1, 0, 2);
  perform pg_temp.check((select stalled_until from life_hustles where user_id = a) > now() + interval '3 hours', 'lost: the hustle stalls for two game days');
  update lives set event_at = now() - interval '5 hours' where user_id = a;
  perform life_event_open(a, 'evt-eeeeeeee', 'job', 'retail-2', 'Big order', 2);
  t := (select coins from profiles where id = a);
  v := life_event_close(a, 'evt-eeeeeeee', true, 6, 'retail', 3, 1, 0, 0);
  perform pg_temp.check((v->>'bonus')::numeric = 6 and (select days from life_skills where user_id = a and skill = 'retail') >= 3, 'won at work: a bonus and experience');
  perform pg_temp.check((life_money(a, 24)->>'bonus')::numeric = 6, 'bonuses show in money in');

  -- Care for the mind; a weekend away means no work for a while.
  update life_pots set balance = 500 where user_id = a and pot = 'fun';
  v := life_care(a, 'holiday', 'A weekend away', 166.67, 12.5, 10, 60, 3, false, array['fun', 'savings']);
  perform pg_temp.check((v->>'mind')::numeric = 100 and (select recovering_until from lives where user_id = a) > now() + interval '5 hours', 'a weekend away: mind up, away from work');

  -- Interviews: a failed one waits.
  perform life_interview_fail(a, 'lagos:81,80', 'shop_supervisor');
  perform pg_temp.check(life_interview_wait(a, 'lagos:81,80', 'shop_supervisor') > now() + interval '13 hours', 'a failed interview waits 14 hours');
  perform pg_temp.check(life_interview_wait(a, 'lagos:81,80', 'store_manager') is null, 'other jobs can be tried');

  perform life_set_exercise(a, 'football');
  perform pg_temp.check((life_status(a)->>'exercise') = 'football', 'exercise set');
  perform life_hustle_stop(a);
  perform pg_temp.check(life_status(a)->'hustle' = 'null'::jsonb, 'hustle stopped');
end $$;

\o
select 'day: all checks passed' as result;
