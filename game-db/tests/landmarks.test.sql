\set ON_ERROR_STOP on
-- Part 82: buy a landmark for crazy money; it earns the same share a day as property.
\ir ../082_landmarks.sql
\ir ../082_landmarks.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
create function pg_temp.fails(sql text, err text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return sqlerrm = err;
end $$;
insert into auth.users (email) values ('a@lm.test'), ('b@lm.test'), ('c@lm.test');
update profiles set username = 'AdaLm', coins = 300000000 where email_key = 'a@lm.test';
update profiles set username = 'BayoLm', coins = 1000 where email_key = 'b@lm.test';
update profiles set username = 'ChiLm', coins = 999999999 where email_key = 'c@lm.test';
update game_settings set value = 0.10 where key = 'property_income_day';
insert into lives (user_id, region, granted) select id, 'lagos', 0 from profiles where email_key in ('a@lm.test', 'b@lm.test');
do $$
declare
  a uuid := (select id from profiles where email_key = 'a@lm.test');
  b uuid := (select id from profiles where email_key = 'b@lm.test');
  c uuid := (select id from profiles where email_key = 'c@lm.test');
  v jsonb;
  burned numeric := (select coalesce(sum(amount), 0) from ledger where kind = 'burn');
begin
  perform pg_temp.check(pg_temp.fails(format('select landmark_buy(%L, ''lagos'', ''lagos:eko-hotel'', ''Eko Hotel'', 200000000)', c), 'no_life'), 'no life, no landmark');
  perform pg_temp.check(pg_temp.fails(format('select landmark_buy(%L, ''lagos'', ''lagos:eko-hotel'', ''Eko Hotel'', 200000000)', b), 'not_enough:200000000'), 'short of money says how much');
  perform pg_temp.check(pg_temp.fails(format('select landmark_buy(%L, ''lagos'', ''abuja:eko-hotel'', ''Eko Hotel'', 200000000)', a), 'bad_landmark'), 'a landmark in another region is refused');
  perform pg_temp.check(pg_temp.fails(format('select landmark_buy(%L, ''lagos'', ''lagos:eko-hotel'', ''Eko Hotel'', 9000000000)', a), 'bad_price'), 'a silly price is refused');

  v := landmark_buy(a, 'lagos', 'lagos:eko-hotel', 'Eko Hotel & Suites', 200000000);
  perform pg_temp.check((v->>'coins')::numeric = 100000000 and (select coins from profiles where id = a) = 100000000, 'bought for ₦300bn (200m mint)');
  perform pg_temp.check((select owner_id from landmark_owners where landmark_id = 'lagos:eko-hotel') = a, 'and owns it');
  perform pg_temp.check((select amount from ledger where user_id = a and kind = 'landmark_buy') = -200000000, 'in the ledger');
  perform pg_temp.check((select coalesce(sum(amount), 0) from ledger where kind = 'burn') - burned = 200000000, 'the price is burned');
  perform pg_temp.check(exists (select 1 from notifications where user_id = a and kind = 'property' and body like 'You own Eko Hotel%'), 'told about it');
  perform pg_temp.check(pg_temp.fails(format('select landmark_buy(%L, ''lagos'', ''lagos:eko-hotel'', ''Eko Hotel'', 200000000)', b), 'taken'), 'nobody else can buy it');

  -- It earns 10% of its price a day, like property.
  perform pg_temp.check(property_income_day(a) = 20000000, 'earns 10% a day');
  update lives set income_at = now() - interval '6 hours' where user_id = a;
  v := property_income_settle(a);
  perform pg_temp.check((v->>'paid')::numeric = 5000000, 'six hours pays a quarter of a day');

  -- Owners list.
  perform pg_temp.check((select owner_name from landmark_owners_list('lagos') where landmark_id = 'lagos:eko-hotel') = 'AdaLm', 'the owner list shows Ada');
  perform pg_temp.check(not exists (select 1 from landmark_owners_list('abuja')), 'nothing in another region');

  -- Changing hands: the old owner is paid up to now first, then earns nothing more on it.
  update lives set income_at = now() - interval '12 hours' where user_id = a;
  update landmark_owners set owner_id = b where landmark_id = 'lagos:eko-hotel';
  perform pg_temp.check((select sum(amount) from ledger where user_id = a and kind = 'property_income') = 15000000, 'the old owner was paid for the 12 hours first');
  perform pg_temp.check(property_income_day(a) = 0 and property_income_day(b) = 20000000, 'the new owner earns on it now');
  perform pg_temp.check((select income_at from lives where user_id = b) > now() - interval '1 minute', 'the new owner earns from now, not before');
end $$;
\o
\echo 'landmarks: all ok'
