\set ON_ERROR_STOP on
-- Part 91: growth levels (only ever up) and sold-out blocks growing.
\ir ../091_city_growth.sql
\ir ../091_city_growth.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
delete from property_units where building_id = 'testgrow:1,1';
delete from property_buildings where building_id = 'testgrow:1,1';
delete from city_growth where region = 'testgrow';
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  snap jsonb := '{"id":"testgrow:1,1","kind":"flats","storeys":2,"units":[{"id":"testgrow:1,1/0","label":"Flat, ground floor, left"},{"id":"testgrow:1,1/1","label":"Flat, ground floor, right"}]}';
  big jsonb := '{"id":"testgrow:1,1","kind":"flats","storeys":4,"units":[{"id":"testgrow:1,1/0","label":"Flat, ground floor, left"},{"id":"testgrow:1,1/1","label":"Flat, ground floor, right"},{"id":"testgrow:1,1/2","label":"Flat, floor 2, left"}]}';
  bad jsonb := '{"id":"testgrow:1,1","kind":"flats","storeys":4,"units":[{"id":"testgrow:1,1/0","label":"Penthouse"},{"id":"testgrow:1,1/1","label":"Flat, ground floor, right"},{"id":"testgrow:1,1/2","label":"Flat, floor 2, left"}]}';
begin
  perform pg_temp.check(city_growth_level('testgrow') = 0, 'a city with nobody in it is level 0');
  update city_growth set level = 3 where region = 'testgrow';
  perform pg_temp.check(city_growth_level('testgrow') = 3, 'a level never goes down when players leave');
  insert into auth.users (id, email) values (a, a || '@t.test'), (b, b || '@t.test');
  insert into property_buildings (building_id, region, snapshot) values ('testgrow:1,1', 'testgrow', snap);
  insert into property_units (unit_id, building_id, owner_id, label, use, area, price) values ('testgrow:1,1/0', 'testgrow:1,1', a, 'Flat, ground floor, left', 'home', 100, 10);
  perform pg_temp.check(not building_grow('testgrow:1,1', big, 2), 'a block with units for sale does not grow');
  insert into property_units (unit_id, building_id, owner_id, label, use, area, price) values ('testgrow:1,1/1', 'testgrow:1,1', a, 'Flat, ground floor, right', 'home', 100, 10);
  perform pg_temp.check(not building_grow('testgrow:1,1', big, 2), 'one owner of a whole block keeps it as it is');
  update property_units set owner_id = b where unit_id = 'testgrow:1,1/1';
  perform pg_temp.check(not building_grow('testgrow:1,1', bad, 2), 'the units already owned must stay the same');
  perform pg_temp.check(building_grow('testgrow:1,1', big, 2), 'a sold-out block (two owners) grows');
  perform pg_temp.check((select jsonb_array_length(snapshot->'units') from property_buildings where building_id = 'testgrow:1,1') = 3, 'with its new units');
  perform pg_temp.check(not building_grow('testgrow:1,1', big, 2), 'and only once per step');
end $$;
\o
\echo 'city growth: all ok'
