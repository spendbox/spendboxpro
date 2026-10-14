\set ON_ERROR_STOP on
-- Part 94: a business can lease a building people live in; they keep their homes, can still buy
-- more, and nobody renames it while the lease runs.
\ir ../094_lived_in_leases.sql
\ir ../094_lived_in_leases.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
delete from business_upgrades where reference like 'bz-up-lived%';
delete from business_leases where reference like 'bz-lived%';
delete from property_units where building_id in ('lagos:320,320', 'lagos:321,320');
delete from property_buildings where building_id in ('lagos:320,320', 'lagos:321,320');
do $$
declare
  a uuid := advertiser_for_email('livedin@biz.test', 'Kemi', null);
  p uuid := gen_random_uuid();
  l uuid;
  v jsonb;
begin
  update business_leases set status = 'ended' where advertiser_id = a and status = 'live';
  insert into auth.users (id, email) values (p, p || '@t.test');
  -- A block of flats where a player owns every flat, and an office block a player owns part of.
  insert into property_buildings (building_id, region, snapshot) values ('lagos:320,320', 'lagos', '{"units":[{"label":"Flat 1"}]}'), ('lagos:321,320', 'lagos', '{"units":[{"label":"Office 1"},{"label":"Office 2"}]}');
  insert into property_units (unit_id, building_id, owner_id, label, use, area, price) values ('lagos:320,320/0', 'lagos:320,320', p, 'Flat 1', 'home', 90, 10), ('lagos:321,320/0', 'lagos:321,320', p, 'Office 1', 'office', 90, 10);
  begin
    perform business_lease_start(a, 'lagos:321,320', 'lagos', 'Kemi Tech', 'Shop', 'Phones and laptops fixed fast', '1 Allen Avenue, Ikeja', null, null, null, null, 6000000, 'bz-lived00001', false);
    perform pg_temp.check(false, 'offices players own are still not for leasing');
  exception when others then perform pg_temp.check(sqlerrm = 'owned', 'offices players own are still not for leasing');
  end;
  l := business_lease_start(a, 'lagos:320,320', 'lagos', 'Kemi Foods', 'Food and drink', 'Hot jollof every day of the week', '1 Allen Avenue, Ikeja', null, null, null, null, 6000000, 'bz-lived00002', true);
  v := business_paid('bz-lived00002', 6000000);
  perform pg_temp.check((v->>'new')::boolean, 'a block of flats people live in can be leased');
  perform pg_temp.check((select owner_id from property_units where unit_id = 'lagos:320,320/0') = p, 'and they keep their homes');
  begin
    perform property_rename(p, 'lagos:320,320', 'Kemi Towers');
    perform pg_temp.check(false, 'nobody renames it while it is leased');
  exception when others then perform pg_temp.check(sqlerrm = 'leased', 'nobody renames it while it is leased');
  end;
  begin
    perform business_upgrade_start(a, l, 'rebuild', 'glass', 1000000, 'bz-up-lived01');
    perform pg_temp.check(false, 'no refit of a building people live in');
  exception when others then perform pg_temp.check(sqlerrm = 'lived_in', 'no refit of a building people live in');
  end;
  perform business_upgrade_start(a, l, 'bright', null, 1500000, 'bz-up-lived02');
  perform pg_temp.check(true, 'a bright sign is fine');
  update business_leases set status = 'ended' where id = l;
  perform property_rename(p, 'lagos:320,320', 'Kemi Towers');
  perform pg_temp.check((select name from property_buildings where building_id = 'lagos:320,320') = 'Kemi Towers', 'once the lease ends, the owner can rename it again');
end $$;
\o
\echo 'lived-in leases: all ok'
