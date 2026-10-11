\set ON_ERROR_STOP on
-- Part 40: living on the real map. Income shared into pots by the budget; bills paid from
-- Essentials or owed (and the power cut); health falls, a check-up happens by itself, sickness
-- halves pay; a treat with recovery means days off; school finishes by itself and counts as
-- experience; essential services are paid by the treasury (or owed); money in and out by kind.
\ir ../040_living.sql
\ir ../040_living.sql
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
create function pg_temp.pot(u uuid, p text) returns numeric language sql as $$ select coalesce((select balance from life_pots where user_id = u and pot = p), 0) $$;

insert into auth.users (email) values ('l1@live.test'), ('l2@live.test');
update profiles set username = 'Liver1' where email_key = 'l1@live.test';
update profiles set username = 'Liver2' where email_key = 'l2@live.test';

do $$
declare
  a uuid := pg_temp.uid('l1@live.test');
  b uuid := pg_temp.uid('l2@live.test');
  v jsonb;
  t numeric;
  snap jsonb := '{"id":"lagos:60,60","kind":"flats","units":[{"id":"lagos:60,60/0"}]}';
begin
  perform pg_temp.check((select balance from treasuries where id = 'ng-la') >= 500000, 'the Lagos treasury opens (once)');
  perform pg_temp.check((select count(*) from treasury_ledger where kind = 'opening') = 1, 'only once');

  perform life_start(a, 'lagos');
  perform property_buy(a, 'lagos', 'lagos:60,60/0', snap, 1000, 'home', 60, 'Flat 1', 2);
  update profiles set coins = 100 where id = a;
  delete from life_pots where user_id = a;

  -- Income shared by the budget (25/15/20/10, the rest to the wallet).
  perform life_income(a, 100);
  perform pg_temp.check(pg_temp.pot(a, 'essentials') = 25 and pg_temp.pot(a, 'travel') = 15 and pg_temp.pot(a, 'savings') = 20 and pg_temp.pot(a, 'fun') = 10
    and (select coins from profiles where id = a) = 130, 'income shared into pots, the rest to the wallet');
  perform pg_temp.fails('a budget adds up to 100 at most', 'bad_budget', format('select life_budget_set(%L, %L)', a, '{"essentials":60,"travel":60}'));
  perform life_budget_set(a, '{"essentials":50,"travel":0,"savings":50,"fun":0}');
  perform pg_temp.check((select budget->>'essentials' from lives where user_id = a) = '50', 'budget changed');
  perform life_pot_move(a, 'fun', 'wallet', 10);
  perform pg_temp.check(pg_temp.pot(a, 'fun') = 0 and (select coins from profiles where id = a) = 140, 'money moved from a pot to the wallet');
  perform pg_temp.fails('only what a pot has', 'not_enough', format('select life_pot_move(%L, %L, %L, 999)', a, 'savings', 'wallet'));

  -- Ten game days of bills: ₥1/day power, ₥0.2/day waste, from Essentials (25).
  update lives set bills_at = now() - interval '20 hours', health_at = now() where user_id = a;
  t := (select balance from treasuries where id = 'ng-la') + (select balance from treasuries where id = 'ng');
  v := life_tick(a, 1, 0.2, 3.33);
  perform pg_temp.check(abs(pg_temp.pot(a, 'essentials') - 13) < 0.02, 'bills paid from Essentials');
  perform pg_temp.check(abs((select balance from treasuries where id = 'ng-la') + (select balance from treasuries where id = 'ng') - t - 2) < 0.02, 'waste collection goes to the state');
  -- Thirty game days more than anyone can pay: owed, and the power cut.
  update profiles set coins = 0 where id = a;
  update lives set bills_at = now() - interval '60 hours' where user_id = a;
  v := life_tick(a, 1, 0.2, 3.33);
  perform pg_temp.check((v->>'powerCut')::boolean and (v->>'powerOwed')::numeric > 7, 'owing a week of electricity: the power is cut');

  -- Health falls; a check-up by itself when it's low and there's money.
  update profiles set coins = 50 where id = a;
  update lives set health = 60, health_at = now() - interval '20 hours', bills_at = now() where user_id = a;
  v := life_tick(a, 1, 0.2, 3.33);
  perform pg_temp.check(abs((v->>'health')::numeric - 70) < 0.1, 'health fell 15 over ten game days, then a check-up gave 25');

  -- Pay: unwell is half pay.
  perform life_work_take(a, 'lagos', 'lagos:61,60', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 2, 0, 'walk', 0);
  update lives set health = 20 where user_id = a;
  update life_jobs set paid_until = now() - interval '4 hours' where user_id = a;
  v := life_work_collect(a, 0);
  perform pg_temp.check(abs((v->>'gross')::numeric - 2) < 0.02, 'unwell: half pay for two game days');
  update lives set health = 90 where user_id = a;

  -- A treat with recovery: no pay while recovering.
  update life_pots set balance = 5000 where user_id = a and pot = 'savings';
  perform pg_temp.fails('treats cost money', 'not_enough', format('select life_procedure(%L, %L, %L, 9999, 0, 14)', a, 'bbl', 'BBL'));
  v := life_procedure(a, 'bbl', 'BBL', 2333.33, 175, 14);
  perform pg_temp.check((select recovering_until from lives where user_id = a) > now() + interval '27 hours', 'fourteen game days to recover');
  perform pg_temp.fails('one recovery at a time', 'recovering', format('select life_procedure(%L, %L, %L, 100, 0, 2)', a, 'veneers', 'Veneers'));
  update life_jobs set paid_until = now() - interval '4 hours' where user_id = a;
  v := life_work_collect(a, 0);
  perform pg_temp.check((v->>'gross')::numeric = 0, 'no pay while recovering');
  update lives set recovering_until = null where user_id = a;

  -- School: paid from Savings, finishes by itself, counts as experience.
  update life_pots set balance = 300 where user_id = a and pot = 'savings';
  t := (select balance from treasuries where id = 'ng-la');
  perform life_enrol(a, 'nursing', 'Nursing diploma', 'health', 45, 'nursing', 200, 90, true);
  perform pg_temp.check(pg_temp.pot(a, 'savings') = 100 and (select balance from treasuries where id = 'ng-la') > t, 'school fees from Savings, to the state');
  perform pg_temp.fails('one course at a time', 'studying', format('select life_enrol(%L, %L, %L, %L, 20, null, 10, 5, false)', a, 'sales', 'Sales', 'retail'));
  update life_courses set ends_at = now() - interval '1 minute' where user_id = a;
  v := life_tick(a, 1, 0.2, 3.33);
  perform pg_temp.check((v->'courses'->0->>'done')::boolean and (select days from life_skills where user_id = a and skill = 'health') >= 45, 'course finished: nursing level 3');
  perform pg_temp.fails('not the same course twice', 'done_already', format('select life_enrol(%L, %L, %L, %L, 45, %L, 200, 90, true)', a, 'nursing', 'Nursing diploma', 'health', 'nursing'));

  -- Care.
  update life_pots set balance = 100 where user_id = a and pot = 'essentials';
  v := life_care(a, 'full', 'Full medical', 50, 3.75, 100, false);
  perform pg_temp.check((v->>'health')::numeric = 100, 'a full medical: full health');

  -- Essential services are paid by the treasury: a nurse.
  perform life_work_take(a, 'lagos', 'lagos:70,70', 'General Hospital', 'nurse', 'Nurse', 'health', 6.67, 3, 'walk', 0);
  perform life_work_set_state(a, true);
  update life_jobs set paid_until = now() - interval '4 hours' where user_id = a;
  t := (select balance from treasuries where id = 'ng-la');
  v := life_work_collect(a, 0);
  perform pg_temp.check((v->>'gross')::numeric > 13 and abs(t - (select balance from treasuries where id = 'ng-la') - ((v->>'gross')::numeric - (v->>'tax')::numeric)) < 0.02,
    'a nurse is paid by the state, income tax kept back');
  -- An empty treasury: pay is owed until it can pay.
  update treasuries set balance = 0 where id in ('ng-la', 'ng');
  update life_jobs set paid_until = now() - interval '4 hours' where user_id = a;
  v := life_work_collect(a, 0);
  perform pg_temp.check((v->>'owed')::numeric > 12 and (v->>'net')::numeric = 0, 'the state can''t pay: owed');
  update treasuries set balance = 1000 where id = 'ng-la';
  update life_jobs set paid_until = now() where user_id = a;
  v := life_work_collect(a, 0);
  perform pg_temp.check((v->>'owed')::numeric = 0 and (v->>'net')::numeric > 12, 'paid what was owed once it could');

  -- Money in and out.
  v := life_money(a, 24);
  perform pg_temp.check((v->>'public_pay')::numeric > 0 and (v->>'power_bill')::numeric < 0 and (v->>'school_fees')::numeric < 0
    and (v->>'procedure')::numeric < 0 and (v->>'vat')::numeric < 0 and (v->>'property_tax')::numeric = -30 and (v->>'property_buy')::numeric = -1000,
    'money in and out by kind, property tax apart');

  -- Rent is logged in full, its tax apart, and shared into pots.
  perform life_start(b, 'lagos');
  perform property_buy(b, 'lagos', 'lagos:62,60/0', '{"id":"lagos:62,60","kind":"shops","units":[{"id":"lagos:62,60/0"}]}', 100, 'home', 30, 'Shop', 10);
  perform property_buy(b, 'lagos', 'lagos:63,60/0', '{"id":"lagos:63,60","kind":"shops","units":[{"id":"lagos:63,60/0"}]}', 100, 'shop', 30, 'Shop', 10);
  perform property_let(b, 'lagos:63,60/0', true);
  update property_units set collected_at = now() - interval '1 day' where unit_id = 'lagos:63,60/0';
  v := property_collect(b);
  perform pg_temp.check(abs((v->>'rent')::numeric - 9) < 0.02 and abs(pg_temp.pot(b, 'savings') - 1.8) < 0.02, 'rent after tax, shared into pots');
  perform pg_temp.check((life_money(b, 24)->>'rent')::numeric = 10 and (life_money(b, 24)->>'rent_tax')::numeric = -1, 'rent in full, tax apart');
end $$;

\o
select 'living: all checks passed' as result;
