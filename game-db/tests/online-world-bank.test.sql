\set ON_ERROR_STOP on
-- Part 83: paid for each active minute online (up to the daily cap), and the World Bank collecting
-- Newtown's cut of challenge pools and challenge fees.
\ir ../083_online_pay_world_bank.sql
\ir ../083_online_pay_world_bank.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('o@ow.test');
update profiles set username = 'OnlineOla', coins = 0 where email_key = 'o@ow.test';
insert into lives (user_id, region, granted) select id, 'lagos', 0 from profiles where email_key = 'o@ow.test';
do $$
declare
  o uuid := (select id from profiles where email_key = 'o@ow.test');
  v jsonb;
  b numeric;
begin
  v := online_ping(o);
  perform pg_temp.check((v->>'paid')::numeric = 0.33 and (select coins from profiles where id = o) = 0.33, 'a minute online pays');
  -- Another ping 10 seconds later (a separate request): not counted, not paid.
  update activity_days set last_ping = now() - interval '10 seconds' where user_id = o;
  v := online_ping(o);
  perform pg_temp.check((v->>'paid')::numeric = 0, 'not twice in the same minute');
  update activity_days set last_ping = now() - interval '2 minutes', minutes = 240 where user_id = o;
  v := online_ping(o);
  perform pg_temp.check((v->>'paid')::numeric = 0 and (v->>'left')::int = 0, 'nothing past the daily cap');
  b := (select balance from world_bank where id = 1);
  perform burn(null, 12.5, 'Challenge pools');
  perform log_coins(o, null, 'challenge_fee', -33.33, false, 'Challenge fee');
  perform burn(null, 99, 'Something else');
  perform pg_temp.check((select balance from world_bank where id = 1) = b + 45.83, 'the World Bank takes the challenge cut and fees, nothing else');
  perform pg_temp.check((world_bank_view()->>'today')::numeric >= 45.83, 'and shows today''s takings');
  perform pg_temp.check((earnings_summary(o, array['online_pay'])->'online_pay'->>'total')::numeric = 0.33, 'earnings are added up by kind');
end $$;
\o
\echo 'online pay and world bank: all ok'
