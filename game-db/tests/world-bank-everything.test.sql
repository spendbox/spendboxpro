\set ON_ERROR_STOP on
-- Part 89: the World Bank counts everything players pay the city: spending, taxes and bills, loans.
\ir ../089_world_bank_everything.sql
\ir ../089_world_bank_everything.sql
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
  bal numeric := (select balance from world_bank where id = 1);
begin
  perform pg_temp.check((select count(*) from world_bank_ledger where kind = 'catch_up') <= 1, 'the catch-up is added once at most');
  b := (select balance from world_bank where id = 1);
  t := (world_bank_view()->>'today')::numeric;
  perform burn(null, 4, 'Ride fares');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 4, 'transport fares go into the World Bank');
  perform burn(null, 6, 'Food');
  perform burn(null, 5, 'Challenge pools');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 15, 'and food, and games');
  perform pay_tax('lagos', 10, 'income_tax', 'Income tax');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 25, 'taxes count too (the whole tax, state and country parts)');
  perform pg_temp.check((world_bank_view()->>'today')::numeric = t + 25, 'all of it counts as today''s takings');
  perform burn(null, 100, 'bot coins retired');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 25, 'bookkeeping burns are not counted');
  perform treasury_move('wb', -20, 'loan_out', 'Loan 1');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 5, 'a loan goes out of the World Bank');
  perform pg_temp.check((world_bank_view()->>'today')::numeric = t + 25, 'and does not lower today''s takings');
  perform treasury_move('wb', 8, 'loan_repay', 'Payment on loan 1');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 13, 'repayments come back in');
  perform log_coins((select id from profiles limit 1), null, 'challenge_fee', -3, false, 'Challenge fee');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 13, 'a challenge fee counts once (its burn), not twice');
end $$;
\o
\echo 'world bank counts everything: all ok'
