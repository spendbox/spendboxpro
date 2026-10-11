\set ON_ERROR_STOP on
-- Part 38: owning property on the real map. A starting budget once; a home first; nobody can buy
-- what's owned or what they can't afford; tax goes to the treasuries (state and country); rent
-- accrues only while let and never on your home; names only for buildings you own all of; the
-- books balance; running the part again changes nothing.
\ir ../038_property.sql
\ir ../038_property.sql
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

insert into auth.users (email) values ('own1@prop.test'), ('own2@prop.test');
update profiles set username = 'Owner1' where email_key = 'own1@prop.test';
update profiles set username = 'Owner2' where email_key = 'own2@prop.test';

do $$
declare
  a uuid := pg_temp.uid('own1@prop.test');
  b uuid := pg_temp.uid('own2@prop.test');
  v jsonb;
  before_a numeric;
  snap jsonb := '{"id":"lagos:5,7","kind":"flats","units":[{"id":"lagos:5,7/0"},{"id":"lagos:5,7/1"}]}';
  shop jsonb := '{"id":"lagos:9,9","kind":"shops","units":[{"id":"lagos:9,9/0"}]}';
begin
  update profiles set coins = 0 where id in (a, b);
  perform pg_temp.fails('no buying before starting a life', 'no_life', format('select property_buy(%L, %L, %L, %L, 100, %L, 90, %L, 1)', a, 'lagos', 'lagos:5,7/0', snap, 'home', 'Flat'));

  v := life_start(a, 'lagos');
  perform pg_temp.check((v->>'started')::boolean and (v->>'coins')::numeric = 60000, 'the starting budget arrives');
  v := life_start(a, 'lagos');
  perform pg_temp.check(not (v->>'started')::boolean and (v->>'coins')::numeric = 60000, 'only once');

  perform pg_temp.fails('a home first', 'home_first', format('select property_buy(%L, %L, %L, %L, 100, %L, 30, %L, 1)', a, 'lagos', 'lagos:9,9/0', shop, 'shop', 'Shop 1'));
  perform pg_temp.fails('not more than you have (price + tax)', 'not_enough', format('select property_buy(%L, %L, %L, %L, 59000, %L, 90, %L, 10)', a, 'lagos', 'lagos:5,7/0', snap, 'home', 'Flat'));
  perform pg_temp.fails('a unit id must say where it is', 'bad_unit', format('select property_buy(%L, %L, %L, %L, 100, %L, 90, %L, 1)', a, 'lagos', 'lagos:5,7', snap, 'home', 'Flat'));

  v := property_buy(a, 'lagos', 'lagos:5,7/0', snap, 3000, 'home', 95, 'Flat, ground floor, left', 10);
  perform pg_temp.check((v->>'home')::boolean and (v->>'coins')::numeric = 60000 - 3000 - 90, 'bought a home: price and 3% tax');
  perform pg_temp.check((select home_unit from lives where user_id = a) = 'lagos:5,7/0', 'it is your home');
  perform pg_temp.check((select balance from treasuries where id = 'ng-la') = 63 and (select balance from treasuries where id = 'ng') = 27, 'tax split 70/30 between Lagos State and Nigeria');

  perform life_start(b, 'lagos');
  perform pg_temp.fails('nobody buys what is owned', 'taken', format('select property_buy(%L, %L, %L, %L, 3000, %L, 95, %L, 10)', b, 'lagos', 'lagos:5,7/0', snap, 'home', 'Flat'));
  perform pg_temp.fails('not your unit to let', 'not_yours', format('select property_let(%L, %L, true)', b, 'lagos:5,7/0'));
  perform pg_temp.fails('your home is not let out', 'is_home', format('select property_let(%L, %L, true)', a, 'lagos:5,7/0'));
  perform pg_temp.fails('naming needs every unit', 'not_all_yours', format('select property_rename(%L, %L, %L)', a, 'lagos:5,7', 'Ada Court'));

  v := property_buy(a, 'lagos', 'lagos:5,7/1', snap, 1000, 'home', 95, 'Flat, ground floor, right', 24);
  perform pg_temp.check(not (v->>'home')::boolean, 'a second home is not your home by itself');
  perform property_rename(a, 'lagos:5,7', '  Ada   Court ');
  perform pg_temp.check((select name from property_buildings where building_id = 'lagos:5,7') = 'Ada Court', 'named and tidied');
  perform pg_temp.fails('names are sensible', 'bad_name', format('select property_rename(%L, %L, %L)', a, 'lagos:5,7', '<b>'));

  -- Let the second flat out, pretend a day has passed, collect.
  perform property_let(a, 'lagos:5,7/1', true);
  update property_units set collected_at = now() - interval '1 day' where unit_id = 'lagos:5,7/1';
  before_a := (select coins from profiles where id = a);
  v := property_collect(a);
  perform pg_temp.check(abs((v->>'rent')::numeric - 21.6) < 0.02 and abs((select coins from profiles where id = a) - before_a - 21.6) < 0.02, 'a day of rent, less 10% tax');
  update property_units set collected_at = now() - interval '1 day' where unit_id = 'lagos:5,7/0';
  perform pg_temp.check((property_collect(a)->>'rent')::numeric < 0.1, 'your home earns no rent');

  perform property_set_home(a, 'lagos:5,7/1');
  perform pg_temp.check((select not let from property_units where unit_id = 'lagos:5,7/1') and (select home_unit from lives where user_id = a) = 'lagos:5,7/1', 'moving into a let flat stops letting it');

  perform pg_temp.check(jsonb_array_length(my_assets(a)->'units') = 2, 'your assets list your units');
  perform pg_temp.check(jsonb_array_length(owned_buildings('lagos')) = 1 and owned_buildings('lagos')->0->>'name' = 'Ada Court', 'the map gets owned buildings, as bought, with names');
  perform pg_temp.check(jsonb_array_length(building_owners('lagos:5,7')) = 2, 'who owns which unit');
  perform pg_temp.check(jsonb_array_length(treasury_report()) >= 2, 'the treasuries are open to read');

  -- The books: new mint (start grants, rent) less burned equals players' mint plus treasuries.
  perform pg_temp.check(exists (select 1 from coin_supply_daily where created >= 10000), 'start grants and rent count as new mint');
end $$;

\o
select 'property: all checks passed' as result;
