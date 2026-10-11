\set ON_ERROR_STOP on
-- Part 49: several side hustles at once (up to hustles_max, each with its own start-up cost; stop
-- one and the rest carry on); pay that waits for the daily job; reports about people.
\ir ../049_reports_and_work.sql
\ir ../049_reports_and_work.sql
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

insert into auth.users (email) values ('h1@hustle.test'), ('h2@hustle.test');
update profiles set username = 'Hustler1' where email_key = 'h1@hustle.test';
update profiles set username = 'Other2' where email_key = 'h2@hustle.test';

do $$
declare
  a uuid := pg_temp.uid('h1@hustle.test');
  b uuid := pg_temp.uid('h2@hustle.test');
  v jsonb;
  snap jsonb := '{"id":"lagos:90,90","kind":"flats","units":[{"id":"lagos:90,90/0"}]}';
begin
  perform life_start(a, 'lagos');
  perform property_buy(a, 'lagos', 'lagos:90,90/0', snap, 1000, 'home', 60, 'Flat 1', 2);
  update profiles set coins = 1000 where id = a;
  insert into life_pots (user_id, pot, balance) values (a, 'savings', 100) on conflict (user_id, pot) do update set balance = 100;

  -- Three hustles side by side, each paying its own start-up cost; a fourth is one too many.
  perform life_hustle_start(a, 'braiding', 'Hair braiding', 'beauty', 1.5, 0.3, 3, 10);
  perform life_hustle_start(a, 'tutoring', 'Home tutoring', 'education', 1, 0.2, 2, 5);
  perform life_hustle_start(a, 'content', 'Content creation', 'entertainment', 1.2, 0.9, 2, 20);
  perform pg_temp.check((select count(*) from life_hustles where user_id = a) = 3, 'three side hustles at once');
  perform pg_temp.check(abs((select balance from life_pots where user_id = a and pot = 'savings') - 65) < 0.01, 'each start-up cost paid');
  perform pg_temp.fails('a fourth is too many', 'too_many', format('select life_hustle_start(%L, %L, %L, %L, 1, 0.3, 2, 1)', a, 'pos', 'POS agent', 'finance'));
  v := life_status(a);
  perform pg_temp.check(jsonb_array_length(v->'hustles') = 3 and v->'hustle'->>'hustle' = 'braiding', 'the screens see all of them');

  -- They all earn; collecting adds them up.
  update life_hustles set paid_until = now() - interval '4 hours' where user_id = a;
  v := life_hustle_collect(a);
  perform pg_temp.check((v->>'gross')::numeric > 0 and (select count(*) from life_hustles where user_id = a and paid_until > now() - interval '1 minute') = 3, 'all three paid in');

  -- Stop one: the others carry on.
  perform life_hustle_stop(a, 'tutoring');
  perform pg_temp.check((select count(*) from life_hustles where user_id = a) = 2, 'stopping one keeps the rest');
  perform pg_temp.fails('stopping one you do not run', 'no_hustle', format('select life_hustle_stop(%L, %L)', a, 'tutoring'));

  -- A game week of pay waiting: the daily job finds it.
  update life_hustles set paid_until = now() - interval '15 hours' where user_id = a and hustle = 'braiding';
  perform pg_temp.check(a in (select life_pay_due(100)), 'a week of pay waiting is due');
  perform life_hustle_collect(a);
  perform pg_temp.check(a not in (select life_pay_due(100)), 'and not once paid');
  perform pg_temp.check(public.setting('work_hold_days') >= 28, 'pay waits up to four game weeks');

  -- Reports about people: a player or a character, once each until looked at, never yourself.
  perform pg_temp.check(person_report(a, b, null, 'Other2', 'abuse', 'Rude in chat', 'Shoprite') > 0, 'a player reported');
  perform pg_temp.fails('the same player twice', 'already', format('select person_report(%L, %L, null, %L, %L, %L, null)', a, b, 'Other2', 'scam', ''));
  perform pg_temp.check(person_report(a, null, 'npc:7', 'Mama Nkechi', 'glitch', '', null) > 0, 'a character reported');
  perform pg_temp.fails('not yourself', 'self', format('select person_report(%L, %L, null, %L, %L, %L, null)', a, a, 'Me', 'other', ''));
  perform pg_temp.check(jsonb_array_length(person_reports_list('open')) = 2, 'the owner sees them');
  perform person_report_set((select max(id) from person_reports), 'dismissed');
  perform pg_temp.check(jsonb_array_length(person_reports_list('open')) = 1 and jsonb_array_length(person_reports_list('all')) = 2, 'and marks them');
end $$;
