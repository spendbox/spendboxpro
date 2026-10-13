\set ON_ERROR_STOP on
-- Part 79: property earns by itself (1% of what you paid a day), capped at 2 days while away; free
-- rooms earn nothing; buying from the city has no tax.
\ir ../079_property_income.sql
\ir ../079_property_income.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('p@pi.test');
update profiles set username = 'Pelu', coins = 10000 where email_key = 'p@pi.test';
insert into lives (user_id, region, granted) select id, 'lagos', 0 from profiles where email_key = 'p@pi.test';
do $$
declare
  p uuid := (select id from profiles where email_key = 'p@pi.test');
  v jsonb;
begin
  v := starter_room_give(p, 'lagos', 'lagos:11,11/0', '{}'::jsonb, 'Room 1', 12, false);
  v := property_income_settle(p);
  perform pg_temp.check((v->>'per_day')::numeric = 0 and (v->>'paid')::numeric = 0, 'a free room earns nothing');
  v := property_buy(p, 'lagos', 'lagos:17,17/0', '{}'::jsonb, 5000, 'home', 80, 'Flat 3', 1);
  perform pg_temp.check((select coins from profiles where id = p) = 5000, 'bought at its price, no tax');
  v := property_income_settle(p);
  perform pg_temp.check((v->>'per_day')::numeric = 50, 'earns 1% a day');
  -- Six hours later: a quarter of a day.
  update lives set income_at = now() - interval '6 hours' where user_id = p;
  v := property_income_settle(p);
  perform pg_temp.check((v->>'paid')::numeric = 12.5 and (select coins from profiles where id = p) = 5012.5, 'six hours pays a quarter of a day');
  v := property_income_settle(p);
  perform pg_temp.check((v->>'paid')::numeric = 0, 'nothing twice');
  -- A week away: two days at most.
  update lives set income_at = now() - interval '7 days' where user_id = p;
  v := property_income_settle(p);
  perform pg_temp.check((v->>'paid')::numeric = 100 and (v->>'total')::numeric = 112.5, 'a week away pays two days');
  perform pg_temp.check((select income_at from lives where user_id = p) > now() - interval '1 minute', 'and counts from now again');
end $$;
\o
\echo 'property income: all ok'
