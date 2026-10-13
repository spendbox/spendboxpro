\set ON_ERROR_STOP on
-- Part 76: top-ups: paid once, only when Paystack says the full amount was paid, the first doubled.
\ir ../076_topups.sql
\ir ../076_topups.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('t@tu.test');
update profiles set username = 'Tola', coins = 10 where email_key = 't@tu.test';
do $$
declare
  u uuid := (select id from profiles where email_key = 't@tu.test');
  v jsonb;
begin
  perform topup_start(u, 'tu-aaaaaaaaaaaaaaaaaaaa', 'lagos', 't1', 666.67, 100000);
  v := topup_paid('tu-aaaaaaaaaaaaaaaaaaaa', 50000);
  perform pg_temp.check((v->>'short')::boolean and (select coins from profiles where id = u) = 10, 'paid too little: nothing');
  v := topup_paid('tu-aaaaaaaaaaaaaaaaaaaa', 100000);
  perform pg_temp.check((v->>'doubled')::boolean and (select coins from profiles where id = u) = 10 + 1333.34, 'the first top-up is doubled');
  v := topup_paid('tu-aaaaaaaaaaaaaaaaaaaa', 100000);
  perform pg_temp.check(not (v->>'new')::boolean and (select coins from profiles where id = u) = 10 + 1333.34, 'paid once only');
  perform topup_start(u, 'tu-bbbbbbbbbbbbbbbbbbbb', 'lagos', 't1', 666.67, 100000);
  v := topup_paid('tu-bbbbbbbbbbbbbbbbbbbb', 100000);
  perform pg_temp.check(not (v->>'doubled')::boolean and (select coins from profiles where id = u) = 10 + 1333.34 + 666.67, 'the second is not doubled');
  v := topup_paid('tu-cccccccccccccccccccc', 100000);
  perform pg_temp.check(not (v->>'found')::boolean, 'an unknown payment: nothing');
end $$;
\o
\echo 'top-ups: all ok'
