\set ON_ERROR_STOP on
-- Part 75: the fresh start: everyone to ₦350,000, pots emptied, the Founder badge, a message,
-- homes kept, old money backed up, and only once.
\o /dev/null
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('rich@fs2.test'), ('poor@fs2.test');
update profiles set username = 'Rich' where email_key = 'rich@fs2.test';
update profiles set username = 'Poor' where email_key = 'poor@fs2.test';
insert into lives (user_id, region, granted) select id, 'lagos', 0 from profiles where email_key like '%@fs2.test';
update profiles set coins = 50000 where email_key = 'rich@fs2.test';
update profiles set coins = 3 where email_key = 'poor@fs2.test';
insert into life_pots (user_id, pot, balance) select id, 'savings', 900 from profiles where email_key = 'rich@fs2.test';
\o
\ir ../075_fresh_start.sql
\o /dev/null
do $$
declare
  r uuid := pg_temp.uid('rich@fs2.test');
  p uuid := pg_temp.uid('poor@fs2.test');
begin
  perform pg_temp.check((select coins from profiles where id = r) = 233.34 and (select coins from profiles where id = p) = 233.34, 'everyone has ₦350,000');
  perform pg_temp.check((select balance from life_pots where user_id = r and pot = 'savings') = 0, 'pots emptied');
  perform pg_temp.check((select coins from fresh_start_backup where user_id = r) = 50000 and (select pots->>'savings' from fresh_start_backup where user_id = r)::numeric = 900, 'old money backed up');
  perform pg_temp.check(exists (select 1 from badges where user_id = p and badge = 'founder'), 'a Founder');
  perform pg_temp.check(exists (select 1 from notifications where user_id = r and kind = 'fresh_start'), 'told');
  update profiles set coins = 999 where id = r;
end $$;
\o
\ir ../075_fresh_start.sql
\o /dev/null
do $$
begin
  perform pg_temp.check((select coins from profiles where id = pg_temp.uid('rich@fs2.test')) = 999, 'running it again changes nothing');
  perform pg_temp.check((select count(*) from badges where user_id = pg_temp.uid('rich@fs2.test') and badge = 'founder') = 1, 'one badge');
end $$;
\o
\echo 'fresh start: all ok'
