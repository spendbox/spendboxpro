\set ON_ERROR_STOP on
-- Part 48: trips. Going into a building costs its fare (from Travel, then the wallet), burned, and
-- you're there; you can't go without the fare.
\ir ../048_trips.sql
\ir ../048_trips.sql
\o /dev/null

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;

insert into auth.users (email) values ('trip@go.test');

do $$
declare
  a uuid := (select id from profiles where email_key = 'trip@go.test');
  paid numeric;
begin
  perform life_start(a, 'lagos');
  update profiles set coins = 10 where id = a;
  paid := life_go(a, 'lagos:5,5', 2.5);
  perform pg_temp.check(paid = 2.5 and (select coins from profiles where id = a) = 7.5, 'the fare is paid');
  perform pg_temp.check((select at_place from lives where user_id = a) = 'lagos:5,5', 'and you are there');
  perform pg_temp.check(exists (select 1 from ledger where user_id = a and kind = 'commute' and amount = -2.5), 'it shows as travel');
  begin
    perform life_go(a, 'lagos:9,9', 40);
    raise exception 'FAILED: went without the fare';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
    perform pg_temp.check(sqlerrm like 'not_enough%', 'no fare, no trip');
  end;
  paid := life_go(a, 'lagos:6,5', 0);
  perform pg_temp.check(paid = 0, 'walking is free');
end $$;

\o
select 'trips: all checks passed' as result;
