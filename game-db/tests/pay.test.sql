\set ON_ERROR_STOP on
-- Part 37: better pay. Jobs may pay up to 100 an hour (the dearest pays 60), each skill level
-- adds 10%, and running the part again changes nothing.
\ir ../037_better_pay.sql
\ir ../037_better_pay.sql
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

insert into auth.users (email) values ('pay1@pay.test');
update profiles set username = 'Qearner' where email_key = 'pay1@pay.test';
select tick();

do $$
declare u uuid := pg_temp.uid('pay1@pay.test'); v jsonb;
begin
  perform pg_temp.check(setting('job_pay_max') = 100 and setting('job_skill_bonus') = 0.10, 'pay settings raised');
  v := job_hire(u, 'b:900', 'Spaceport', 'mission_control', 'Mission control assistant', 'tech', 60, true, 5, 4);
  perform pg_temp.check((v->>'hired')::boolean and (job_status(u)->'job'->>'pay_hour')::numeric = 60, 'the best job pays 60 an hour');
  perform pg_temp.check((job_status(u)->>'skill_bonus')::numeric = 0.10, 'the phone is told 10% a skill level');
  perform pg_temp.fails('still a ceiling', 'bad_job', format('select job_hire(%L, %L, %L, %L, %L, %L, 150, true, 5, 4)', u, 'b:901', 'Shop', 'clerk', 'Office clerk', 'office'));
  perform job_quit(u);
end $$;

\o
select 'pay: all checks passed' as result;
