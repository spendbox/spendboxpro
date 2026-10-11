\set ON_ERROR_STOP on
-- Part 43: businesses on the map. A lease goes live only on full payment; one building, one live
-- lease; not a player's building; one live lease per account; upgrades apply once and put the
-- business on the billboards; a storey only from a month in; hits counted; the map lists live ones.
\ir ../043_business.sql
\ir ../043_business.sql
\o /dev/null

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

do $$
declare
  a uuid := advertiser_for_email('shop@biz.test', 'Ada', null);
  b uuid := advertiser_for_email('two@biz.test', 'Bola', null);
  l uuid;
  v jsonb;
begin
  l := business_lease_start(a, 'lagos:300,300', 'lagos', 'Mama Put', 'Food and drink', 'Hot jollof and swallow every day', '12 Allen Avenue, Ikeja', '0800', null, null, null, 6000000, 'bz-aaaaaaaaaa');
  perform pg_temp.check((businesses_in('lagos')) = '[]'::jsonb, 'not on the map before paying');
  v := business_paid('bz-aaaaaaaaaa', 100);
  perform pg_temp.check((v->>'short')::boolean, 'part payment: still pending');
  v := business_paid('bz-aaaaaaaaaa', 6000000);
  perform pg_temp.check((v->>'new')::boolean and jsonb_array_length(businesses_in('lagos')) = 1, 'paid: live on the map');
  perform pg_temp.check((select ends_at from business_leases where id = l) > now() + interval '364 days', 'for a year');
  perform pg_temp.fails('one live lease per account', 'one_only', format('select business_lease_start(%L, %L, %L, %L, %L, %L, %L, null, null, null, null, 6000000, %L)', a, 'lagos:301,300', 'lagos', 'Shop 2', 'Shop', 'Another one of our shops', 'Somewhere in Lagos', 'bz-bbbbbbbbbb'));
  perform pg_temp.fails('one lease per building', 'taken', format('select business_lease_start(%L, %L, %L, %L, %L, %L, %L, null, null, null, null, 6000000, %L)', b, 'lagos:300,300', 'lagos', 'Rival', 'Shop', 'We want that building too', 'Somewhere in Lagos', 'bz-cccccccccc'));
  insert into property_buildings (building_id, region, snapshot) values ('lagos:302,300', 'lagos', '{}') on conflict do nothing;
  insert into property_units (unit_id, building_id, owner_id, label, use, area, price) select 'lagos:302,300/0', 'lagos:302,300', id, 'Room', 'home', 10, 10 from profiles limit 1;
  perform pg_temp.fails('not a building players own', 'owned', format('select business_lease_start(%L, %L, %L, %L, %L, %L, %L, null, null, null, null, 6000000, %L)', b, 'lagos:302,300', 'lagos', 'Rival', 'Shop', 'We want a player building', 'Somewhere in Lagos', 'bz-dddddddddd'));

  perform business_upgrade_start(a, l, 'bright', null, 5000000, 'bz-up-bright1');
  perform business_paid('bz-up-bright1', 5000000);
  perform pg_temp.check((select glow from business_leases where id = l) = 2 and (select billboard from business_leases where id = l), 'a bright sign, and on the billboards');
  perform pg_temp.fails('a storey only from a month in', 'too_soon', format('select business_upgrade_start(%L, %L, %L, null, 1500000, %L)', a, l, 'storey', 'bz-up-storey1'));
  update business_leases set starts_at = now() - interval '31 days' where id = l;
  perform business_upgrade_start(a, l, 'storey', null, 1500000, 'bz-up-storey1');
  perform business_paid('bz-up-storey1', 1500000);
  perform business_paid('bz-up-storey1', 1500000);
  perform pg_temp.check((select storeys from business_leases where id = l) = 2, 'one storey added, once');
  perform business_upgrade_start(a, l, 'rebuild', 'plaza', 600000, 'bz-up-rebuild1');
  perform business_paid('bz-up-rebuild1', 600000);
  perform pg_temp.check((select kind from business_leases where id = l) = 'plaza', 'refitted as a plaza');

  perform business_hit(l, 'tap');
  perform business_hit(l, 'tap');
  perform business_hit(l, 'call');
  v := business_mine(a);
  perform pg_temp.check((v->0->'hits'->>'tap')::int = 2 and (v->0->'week'->>'call')::int = 1, 'taps and calls counted');
end $$;

\o
select 'business: all checks passed' as result;
