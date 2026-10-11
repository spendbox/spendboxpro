\set ON_ERROR_STOP on
-- Part 39: jobs on the real map. A home first; better jobs need the skill; pay builds up by the
-- game day (up to a game week), less income tax (to the treasuries) and fares (burned), never
-- below nothing; skills grow; changing job or getting there pays you up first; neighbours.
\ir ../039_work.sql
\ir ../039_work.sql
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

insert into auth.users (email) values ('w1@work.test'), ('w2@work.test'), ('w3@work.test');
update profiles set username = 'Worker1' where email_key = 'w1@work.test';
update profiles set username = 'Worker2' where email_key = 'w2@work.test';
update profiles set username = 'Worker3' where email_key = 'w3@work.test';

do $$
declare
  a uuid := pg_temp.uid('w1@work.test');
  b uuid := pg_temp.uid('w2@work.test');
  c uuid := pg_temp.uid('w3@work.test');
  v jsonb;
  t_before numeric;
  snap jsonb := '{"id":"lagos:40,40","kind":"flats","units":[{"id":"lagos:40,40/0"},{"id":"lagos:40,40/1"}]}';
  snap2 jsonb := '{"id":"lagos:43,40","kind":"bungalow","units":[{"id":"lagos:43,40/0"}]}';
  snap3 jsonb := '{"id":"lagos:90,40","kind":"bungalow","units":[{"id":"lagos:90,40/0"}]}';
begin
  update profiles set coins = 0 where id in (a, b, c);
  perform pg_temp.fails('a life first', 'no_life', format('select life_work_take(%L, %L, %L, %L, %L, %L, %L, 2, 0, %L, 0)', a, 'lagos', 'lagos:41,40', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 'walk'));
  perform life_start(a, 'lagos');
  perform pg_temp.fails('a home first', 'home_first', format('select life_work_take(%L, %L, %L, %L, %L, %L, %L, 2, 0, %L, 0)', a, 'lagos', 'lagos:41,40', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 'walk'));
  perform property_buy(a, 'lagos', 'lagos:40,40/0', snap, 1000, 'home', 60, 'Flat 1', 2);

  perform pg_temp.fails('pay has a ceiling', 'bad_job', format('select life_work_take(%L, %L, %L, %L, %L, %L, %L, 5000, 0, %L, 0)', a, 'lagos', 'lagos:41,40', 'Shops', 'x_job', 'X', 'retail', 'walk'));
  perform pg_temp.fails('a workplace in the region', 'bad_job', format('select life_work_take(%L, %L, %L, %L, %L, %L, %L, 2, 0, %L, 0)', a, 'lagos', 'abuja:1,1', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 'walk'));
  perform pg_temp.fails('better jobs need the skill', 'need_level', format('select life_work_take(%L, %L, %L, %L, %L, %L, %L, 3.33, 2, %L, 0)', a, 'lagos', 'lagos:41,40', 'Shops', 'shop_supervisor', 'Shop supervisor', 'retail', 'walk'));
  perform pg_temp.fails('ways to get there', 'bad_mode', format('select life_work_take(%L, %L, %L, %L, %L, %L, %L, 2, 0, %L, 0)', a, 'lagos', 'lagos:41,40', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 'jet'));

  v := life_work_take(a, 'lagos', 'lagos:41,40', 'Shops, 3 Adeniran St', 'shop_assistant', 'Shop assistant', 'retail', 2, 0, 'danfo', 0);
  perform pg_temp.check((v->>'hired')::boolean, 'hired');
  perform pg_temp.fails('not the same job twice', 'already', format('select life_work_take(%L, %L, %L, %L, %L, %L, %L, 2, 0, %L, 0)', a, 'lagos', 'lagos:41,40', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 'walk'));

  -- Five game days (10 real hours): 5 × ₥2 = 10, tax 0.70, fares 2 × 0.5 × 5 = 5.
  update life_jobs set paid_until = now() - interval '10 hours' where user_id = a;
  update profiles set coins = 100 where id = a;
  t_before := (select balance from treasuries where id = 'ng-la') + (select balance from treasuries where id = 'ng');
  v := life_work_collect(a, 0.5);
  perform pg_temp.check(abs((v->>'gross')::numeric - 10) < 0.02 and abs((v->>'tax')::numeric - 0.7) < 0.01 and abs((v->>'fares')::numeric - 5) < 0.02, 'five game days of pay, tax and fares');
  perform pg_temp.check(abs((select coins from profiles where id = a) - 104.3) < 0.03, 'what is left is yours');
  perform pg_temp.check(abs((select balance from treasuries where id = 'ng-la') + (select balance from treasuries where id = 'ng') - t_before - 0.7) < 0.01, 'income tax to the treasuries');
  perform pg_temp.check((select life_skill_level(days) from life_skills where user_id = a and skill = 'retail') = 1, 'five days worked: selling level 1');

  -- A long time away: only a game week waits.
  update life_jobs set paid_until = now() - interval '3 days' where user_id = a;
  v := life_work_collect(a, 0);
  perform pg_temp.check(abs((v->>'days')::numeric - 7) < 0.01, 'at most a game week of pay waits');
  perform pg_temp.check(abs((v->>'gross')::numeric - 7 * 2 * 1.03) < 0.03, 'level 1 pays 3% more');

  -- Fares can't take you below nothing (a taxi from far away on little pay).
  update life_jobs set paid_until = now() - interval '2 hours' where user_id = a;
  update profiles set coins = 1 where id = a;
  v := life_work_collect(a, 20);
  perform pg_temp.check((select coins from profiles where id = a) = 0 and (v->>'fares')::numeric < 40, 'fares never below nothing');

  -- Changing how you get there, and changing job, pay you up first.
  update life_jobs set paid_until = now() - interval '2 hours' where user_id = a;
  v := life_work_mode(a, 'walk', 0);
  perform pg_temp.check((v->>'gross')::numeric > 1.9 and (select mode from life_jobs where user_id = a) = 'walk', 'walking now, paid up first');
  update life_skills set days = 20 where user_id = a and skill = 'retail';
  update life_jobs set paid_until = now() - interval '2 hours' where user_id = a;
  v := life_work_take(a, 'lagos', 'lagos:41,40', 'Shops, 3 Adeniran St', 'shop_supervisor', 'Shop supervisor', 'retail', 3.33, 2, 'walk', 0);
  perform pg_temp.check((v->'collected'->>'gross')::numeric > 1.9 and (select job from life_jobs where user_id = a) = 'shop_supervisor', 'promoted, the old job paid up');
  perform pg_temp.check((life_work_status(a)->'job'->>'title') = 'Shop supervisor' and (life_work_status(a)->'skills'->>'retail')::numeric > 20, 'your job and skills');

  -- Neighbours: b in the same building, c far away.
  perform life_start(b, 'lagos');
  perform life_start(c, 'lagos');
  perform property_buy(b, 'lagos', 'lagos:40,40/1', snap, 1000, 'home', 60, 'Flat 2', 2);
  perform property_buy(c, 'lagos', 'lagos:90,40/0', snap3, 1000, 'home', 60, 'Bungalow', 2);
  v := life_neighbours(a, 5);
  perform pg_temp.check(jsonb_array_length(v) = 1 and v->0->>'name' = 'Worker2' and (v->0->>'sameBuilding')::boolean and v->0->>'unit' = 'Flat 2', 'your neighbour in the building');
  perform property_set_home(b, 'lagos:40,40/1');
  update profiles set coins = 5000 where id = b;
  perform property_buy(b, 'lagos', 'lagos:43,40/0', snap2, 1000, 'home', 60, 'Bungalow', 2);
  perform property_set_home(b, 'lagos:43,40/0');
  v := life_neighbours(a, 5);
  perform pg_temp.check(jsonb_array_length(v) = 1 and not (v->0->>'sameBuilding')::boolean and v->0->>'unit' is null and (v->0->>'tiles')::numeric = 3, 'a neighbour down the road (which flat stays private)');
  perform pg_temp.check(jsonb_array_length(life_neighbours(c, 5)) = 0, 'nobody near');

  perform life_work_quit(a, 0);
  perform pg_temp.check(life_work_status(a)->'job' = 'null'::jsonb, 'left the job');
  perform pg_temp.check(exists (select 1 from coin_supply_daily where created > 0), 'pay counts as new mint');
end $$;

\o
select 'work: all checks passed' as result;
