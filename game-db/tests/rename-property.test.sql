\set ON_ERROR_STOP on
-- Part 87: name any property you own from Assets; empty puts back its plain name.
\ir ../087_rename_property.sql
\ir ../087_rename_property.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('r1@rn.test'), ('r2@rn.test');
do $$
declare
  a uuid := (select id from profiles where email_key = 'r1@rn.test');
  b uuid := (select id from profiles where email_key = 'r2@rn.test');
  failed boolean := false;
begin
  perform life_start(a, 'lagos');
  insert into property_buildings (building_id, region, snapshot) values ('lagos:31,31', 'lagos', '{"units":[{"label":"Shop 1","use":"shop"},{"label":"Flat 2","use":"home"}]}')
  on conflict (building_id) do nothing;
  insert into property_units (unit_id, building_id, owner_id, label, use, area, price) values ('lagos:31,31/0', 'lagos:31,31', a, 'Shop 1', 'shop', 40, 100)
  on conflict (unit_id) do update set owner_id = a, label = 'Shop 1';
  perform pg_temp.check(unit_rename(a, 'lagos:31,31/0', 'Mama Put Corner') = 'Mama Put Corner', 'a shop you own can be named');
  perform pg_temp.check((select label from property_units where unit_id = 'lagos:31,31/0') = 'Mama Put Corner', 'and the name is kept');
  perform pg_temp.check(unit_rename(a, 'lagos:31,31/0', '') = 'Shop 1', 'an empty name puts back its plain name');
  begin
    perform unit_rename(b, 'lagos:31,31/0', 'Mine now');
  exception when others then failed := sqlerrm like 'not_yours%';
  end;
  perform pg_temp.check(failed, 'not someone else''s');
end $$;
\o
\echo 'rename property: all ok'
