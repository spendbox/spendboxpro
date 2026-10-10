\set ON_ERROR_STOP on
-- Part 35: first-visit fees, train fares and jobs. A first visit costs once per town, a fare
-- every time, half of both into the prize pool; jobs: a failed interview bars the place, pay
-- by the hour with tax into the pool, the daily cap, skills and no interview next time.
\ir ../035_fees_and_jobs.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.coins(u uuid) returns numeric language sql as $$ select coins from profiles where id = u $$;
create function pg_temp.pool() returns numeric language sql as $$ select pool from rounds where status in ('join', 'seek') order by id desc limit 1 $$;
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
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
create function pg_temp.set_pool(n numeric) returns void language plpgsql as $$
declare r rounds;
begin
  select * into r from rounds where status in ('join', 'seek') order by id desc limit 1;
  if n > r.pool then perform log_coins(null, r.id, 'topup', n - r.pool); end if;
  if n < r.pool then perform burn(r.id, r.pool - n, 'test'); end if;
  update rounds set pool = n where id = r.id;
end $$;
-- Coin books with open stakes and the pool (as in the duels test).
create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled)
          + (select coalesce(sum(e.stake), 0) from entries e join rounds r on r.id = e.round_id
              where r.status <> 'done' and e.role = 'hider' and not e.caught))
$$;

-- Running part 35 again changes nothing.
\ir ../035_fees_and_jobs.sql
\o /dev/null

insert into auth.users (email) values ('work1@jobs.test'), ('work2@jobs.test');
update profiles set username = 'Qworker' where email_key = 'work1@jobs.test';
update profiles set username = 'Qpoor' where email_key = 'work2@jobs.test';
select pg_temp.set_coins(pg_temp.uid('work1@jobs.test'), 100);
select pg_temp.set_coins(pg_temp.uid('work2@jobs.test'), 0.05);
select tick();
create temp table books_j as select pg_temp.gap() as gap_before;

do $$
declare u uuid := pg_temp.uid('work1@jobs.test'); v jsonb; c0 numeric; p0 numeric;
begin
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.jobs', 'select')
                        and not has_function_privilege('authenticated', 'public.pay_fee(uuid,text,text,numeric)', 'execute')
                        and has_function_privilege('service_role', 'public.job_hire(uuid,text,text,text,text,text,numeric,boolean,int,int)', 'execute'), 'fees and jobs are server-only');
  -- First visit: once per place per town, clamped to 0.10-5, half into the pool.
  c0 := pg_temp.coins(u); p0 := pg_temp.pool();
  v := pay_fee(u, 'visit', 'b:12', 2);
  perform pg_temp.check((v->>'paid')::numeric = 2 and pg_temp.coins(u) = c0 - 2 and pg_temp.pool() = p0 + 1, 'a first visit costs 2, 1 into the pool');
  v := pay_fee(u, 'visit', 'b:12', 2);
  perform pg_temp.check((v->>'paid')::numeric = 0 and pg_temp.coins(u) = c0 - 2, 'going back is free');
  v := pay_fee(u, 'visit', 'b:13', 99);
  perform pg_temp.check((v->>'paid')::numeric = 5, 'a visit costs at most 5');
  v := pay_fee(u, 'visit', 'b:14', 0);
  perform pg_temp.check((v->>'paid')::numeric = 0.1, 'and at least 0.10');
  perform pg_temp.check(my_visits(u) @> '["b:12", "b:13", "b:14"]'::jsonb, 'the game knows where you''ve been');
  c0 := pg_temp.coins(u);
  perform pay_fee(u, 'fare', 'v:train:0', 1);
  perform pay_fee(u, 'fare', 'v:train:0', 1);
  perform pg_temp.check(pg_temp.coins(u) = c0 - 2, 'a fare every time you board');
  perform pg_temp.fails('can''t pay without the mint', 'not_enough:0.1', format('select pay_fee(%L, %L, %L, 0.1)', pg_temp.uid('work2@jobs.test'), 'visit', 'b:1'));
  perform pg_temp.fails('only visits and fares', 'bad_kind', format('select pay_fee(%L, %L, %L, 1)', u, 'gift', 'b:1'));

  -- Jobs: a failed interview bars the place.
  v := job_hire(u, 'b:20', 'Big Office', 'clerk', 'Office clerk', 'office', 10, true, 2, 3);
  perform pg_temp.check(not (v->>'hired')::boolean, 'a score under the pass mark: no job');
  perform pg_temp.fails('can''t apply there again', 'banned', format('select job_hire(%L, %L, %L, %L, %L, %L, 10, true, 5, 3)', u, 'b:20', 'Big Office', 'clerk', 'Office clerk', 'office'));
  perform pg_temp.check(job_status(u)->'banned' @> '["b:20"]'::jsonb, 'the game knows');
  perform pg_temp.fails('no interview without the skill', 'interview_needed', format('select job_hire(%L, %L, %L, %L, %L, %L, 10, false, 0, 0)', u, 'b:21', 'Shop', 'clerk', 'Office clerk', 'office'));
  perform pg_temp.fails('pay has a ceiling', 'bad_job', format('select job_hire(%L, %L, %L, %L, %L, %L, 500, true, 5, 3)', u, 'b:21', 'Shop', 'clerk', 'Office clerk', 'office'));
  v := job_hire(u, 'b:21', 'Big Bank', 'teller', 'Bank teller', 'finance', 12, true, 4, 3);
  perform pg_temp.check((v->>'hired')::boolean and (job_status(u)->'job'->>'title') = 'Bank teller', 'passed: hired');
  -- Two hours of work later: 24 pay, 2.40 tax into the pool.
  update jobs set hired_at = hired_at - interval '2 hours', paid_until = paid_until - interval '2 hours' where user_id = u;
  perform pg_temp.check(abs((job_status(u)->>'owed')::numeric - 24) < 0.05, 'two hours owed: 24');
  c0 := pg_temp.coins(u); p0 := pg_temp.pool();
  v := job_collect(u);
  perform pg_temp.check(abs((v->>'gross')::numeric - 24) < 0.05 and (v->>'tax')::numeric = round((v->>'gross')::numeric * 0.1, 2)
                        and pg_temp.coins(u) = c0 + (v->>'net')::numeric and pg_temp.pool() = p0 + (v->>'tax')::numeric,
                        'paid 24 less 10% tax, the tax into the pool');
  perform pg_temp.check((select public.skill_level(minutes) from job_skills where user_id = u and skill = 'finance') = 4, '120 minutes: finance level 4');
  v := job_collect(u);
  perform pg_temp.check((v->>'gross')::numeric < 0.1, 'nothing more to collect yet');
  -- The daily cap: 8 paid hours.
  update jobs set paid_until = paid_until - interval '10 hours' where user_id = u and ends_at > now();
  v := job_collect(u);
  perform pg_temp.check((v->>'hours')::numeric <= 6.001 and (v->>'capped')::boolean, 'at most 8 paid hours a day');
  -- With the skill, the same kind of job anywhere without an interview (and a new job ends the old one).
  v := job_hire(u, 'b:22', 'Corner Bank', 'teller', 'Bank teller', 'finance', 12, false, 0, 0);
  perform pg_temp.check((v->>'hired')::boolean and (select count(*) from jobs where user_id = u and ends_at > now()) = 1, 'no interview with the skill; one job at a time');
  v := job_quit(u);
  perform pg_temp.check(job_status(u)->'job' = 'null'::jsonb, 'quit');
end $$;

\o
select gap_before, pg_temp.gap() as gap_after from books_j;  -- must be equal
select pg_temp.check(gap_before = pg_temp.gap(), 'the coin books still balance') from books_j;
select 'jobs: all checks passed' as result;
