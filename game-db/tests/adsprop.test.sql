\set ON_ERROR_STOP on
-- Part 47: advertising is leasing a property. A paid lease is on the billboards from day one with
-- an allowance of taps; its billboard design can be swapped any time; it ends when the taps run
-- out; tapping ads pays players nothing.
\ir ../047_ads_are_property.sql
\ir ../047_ads_are_property.sql
\o /dev/null

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;

do $$
declare
  a uuid := advertiser_for_email('ads@prop.test', 'Tolu', null);
  l uuid;
  v jsonb;
begin
  perform pg_temp.check(setting('ad_rewards_per_day') = 0, 'no mint for tapping ads');
  l := business_lease_start(a, 'lagos:700,700', 'lagos', 'Suya Spot', 'Food and drink', 'The best suya on the island', '3 Awolowo Road, Ikoyi', null, null, null, 'logos/x.png', 6000000, 'bz-adsprop0001');
  perform business_paid('bz-adsprop0001', 6000000);
  perform pg_temp.check((select billboard and click_cap = 3000 from business_leases where id = l), 'live: on the billboards, ₦60,000 buys 3,000 taps');
  perform business_billboard_set(a, l, 'billboards/new.png');
  v := businesses_in('lagos');
  perform pg_temp.check(exists (select 1 from jsonb_array_elements(v) e where e->>'id' = l::text and e->>'billboardImage' = 'billboards/new.png'), 'a new billboard design, free');
  insert into business_hits (lease_id, kind, n) values (l, 'view', 3000) on conflict (lease_id, day, kind) do update set n = excluded.n;
  perform business_tidy();
  perform pg_temp.check((select status from business_leases where id = l) = 'ended', 'taps used up: the lease ends');
end $$;

\o
select 'adsprop: all checks passed' as result;
