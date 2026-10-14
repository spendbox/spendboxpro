\set ON_ERROR_STOP on
-- Part 88: the World Bank counts sports money (house cut and tickets) as well as challenges.
\ir ../088_world_bank_sports.sql
\ir ../088_world_bank_sports.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
do $$
declare
  b numeric;
  t numeric;
begin
  b := (select balance from world_bank where id = 1);
  t := (world_bank_view()->>'today')::numeric;
  perform pool_or_burn(null, 7, 'Sports house cut: m1');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 7, 'the sports house cut goes into the World Bank');
  perform pool_or_burn(null, 3, 'Sports ticket: m1');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 10, 'and so do match tickets');
  perform pg_temp.check((world_bank_view()->>'today')::numeric = t + 10, 'and they count in today''s takings');
  perform burn(null, 5, 'Challenge pools');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 15, 'challenges still count');
  perform burn(null, 100, 'Electricity bills');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 15, 'bills are not games: not counted');
end $$;
\o
\echo 'world bank sports: all ok'
