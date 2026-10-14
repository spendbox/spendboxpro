\set ON_ERROR_STOP on
-- Part 92: buildings leased by the month; another month adds 30 days and taps.
\ir ../092_monthly_leases.sql
\ir ../092_monthly_leases.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
delete from business_upgrades where reference like 'bz-up-mtest%';
delete from business_leases where reference like 'bz-mtest%';
do $$
declare
  a uuid := advertiser_for_email('monthly@biz.test', 'Ngozi', null);
  l uuid;
  ends timestamptz;
  cap int;
begin
  update business_leases set status = 'ended' where advertiser_id = a and status = 'live';
  l := business_lease_start(a, 'lagos:310,310', 'lagos', 'Ngozi Bakery', 'Food and drink', 'Fresh bread every morning', '3 Allen Avenue, Ikeja', null, null, null, null, 1500000, 'bz-mtest00001');
  update business_leases set months = 3 where id = l;
  perform business_paid('bz-mtest00001', 1500000);
  ends := (select ends_at from business_leases where id = l);
  perform pg_temp.check(ends between now() + interval '89 days' and now() + interval '91 days', '3 months paid: live for 90 days');
  cap := (select click_cap from business_leases where id = l);
  perform business_upgrade_start(a, l, 'month', null, 500000, 'bz-up-mtest01');
  perform business_paid('bz-up-mtest01', 500000);
  perform pg_temp.check((select ends_at from business_leases where id = l) between ends + interval '29 days' and ends + interval '31 days', 'another month adds 30 days');
  perform pg_temp.check((select click_cap from business_leases where id = l) = cap + lease_clicks(500000), 'and that month''s taps');
  perform business_paid('bz-up-mtest01', 500000);
  perform pg_temp.check((select ends_at from business_leases where id = l) between ends + interval '29 days' and ends + interval '31 days', 'confirming twice adds it once');
  perform pg_temp.check((business_mine(a)->0->>'months')::int = 3, 'the ad page knows the months');
end $$;
\o
\echo 'monthly leases: all ok'
