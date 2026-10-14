\set ON_ERROR_STOP on
-- Part 84: the World Bank opens with ₦1 billion (once), billboard views count in full, ads for
-- one region, and the dashboard's money since a time.
\ir ../084_bank_ads_admin.sql
\ir ../084_bank_ads_admin.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
do $$
declare
  b numeric;
begin
  perform pg_temp.check((select count(*) from world_bank_ledger where kind = 'opening') = 1, 'the opening ₦1 billion goes in once, however often this runs');
  perform pg_temp.check((select balance from world_bank where id = 1) >= 666666.67, 'the World Bank holds at least ₦1 billion');
  perform pg_temp.check((world_bank_view()->>'today')::numeric < 666666.67, 'the opening sum is not counted as today''s takings');
  b := (select balance from world_bank where id = 1);
  perform burn(null, 10, 'Challenge pools');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 10, 'and it grows from there');
  perform pg_temp.check((money_since(now() - interval '1 hour')->>'burned')::numeric >= 10, 'money since counts what was burned');
  perform pg_temp.check(exists (select 1 from information_schema.columns where table_name = 'ads' and column_name = 'region'), 'ads can be for one region');
end $$;
\o
\echo 'bank, ads and admin: all ok'
