\set ON_ERROR_STOP on
-- Part 125: the city's owned buildings, only what changed. All of them, nothing when nothing
-- changed, and a building again once it's named; running the part twice.
\ir ../125_owned_changes.sql
\ir ../125_owned_changes.sql
\o /dev/null
insert into property_buildings (building_id, region, snapshot) values ('lagos:9001,1', 'lagos', '{"a":1}'), ('lagos:9002,2', 'lagos', '{"a":2}');
alter table property_buildings disable trigger property_buildings_touch;
update property_buildings set updated_at = now() - interval '1 hour' where building_id in ('lagos:9001,1', 'lagos:9002,2');
alter table property_buildings enable trigger property_buildings_touch;
do $$
declare v jsonb;
begin
  v := owned_buildings_since('lagos', null);
  if not exists (select 1 from jsonb_array_elements(v->'rows') r where r->>'id' = 'lagos:9001,1') then raise exception 'FAILED: all of them'; end if;
  if (v->>'at')::numeric < 1 then raise exception 'FAILED: a time to ask from'; end if;
  v := owned_buildings_since('lagos', now() - interval '5 minutes');
  if exists (select 1 from jsonb_array_elements(v->'rows') r where r->>'id' like 'lagos:900%') then raise exception 'FAILED: nothing changed, nothing sent'; end if;
  update property_buildings set name = 'Ada Place' where building_id = 'lagos:9002,2';
  v := owned_buildings_since('lagos', now() - interval '5 minutes');
  if not exists (select 1 from jsonb_array_elements(v->'rows') r where r->>'id' = 'lagos:9002,2' and r->>'name' = 'Ada Place') then raise exception 'FAILED: a named building is sent again'; end if;
end $$;
\o
\echo 'owned changes: all ok'
