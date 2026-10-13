\set ON_ERROR_STOP on
-- Part 77: renting a home: a month up front, nobody else can buy or rent it, each month paid from
-- the wallet, moved out when short, and buying your own ends the lease.
\ir ../077_renting.sql
\ir ../077_renting.sql
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
insert into auth.users (email) values ('r@rn.test'), ('o@rn.test');
update profiles set username = 'Remi', coins = 100 where email_key = 'r@rn.test';
update profiles set username = 'Obi', coins = 10000 where email_key = 'o@rn.test';
insert into lives (user_id, region, granted) select id, 'lagos', 0 from profiles where email_key like '%@rn.test';
do $$
declare
  r uuid := (select id from profiles where email_key = 'r@rn.test');
  o uuid := (select id from profiles where email_key = 'o@rn.test');
  v jsonb;
begin
  v := starter_room_give(r, 'lagos', 'lagos:1,1/0', '{}'::jsonb, 'Room 1', 12, false);
  v := rent_home(r, 'lagos:5,5/0', 'Flat 1', 40);
  perform pg_temp.check((select home_unit from lives where user_id = r) = 'lagos:5,5/0' and (select coins from profiles where id = r) = 60, 'rented: a month paid, it''s home');
  perform pg_temp.check(not exists (select 1 from property_units where owner_id = r and starter), 'the free room went back');
  perform pg_temp.fails('nobody else can rent it', 'taken', format('select rent_home(%L, ''lagos:5,5/0'', ''F'', 40)', o));
  perform pg_temp.fails('nobody else can buy it', 'taken', format('select property_buy(%L, ''lagos'', ''lagos:5,5/0'', ''{}'', 500, ''home'', 80, ''Flat'', 1)', o));
  -- A month goes by: paid from the wallet.
  update home_rentals set paid_until = now() - interval '1 minute' where user_id = r;
  v := rent_settle(r);
  perform pg_temp.check((v->>'paid')::int = 1 and (select coins from profiles where id = r) = 20, 'next month paid');
  -- Short next time: moved out.
  update home_rentals set paid_until = now() - interval '1 minute' where user_id = r;
  v := rent_settle(r);
  perform pg_temp.check((v->>'ended')::boolean and (select home_unit from lives where user_id = r) is null, 'short: moved out');
  -- Buying your own ends the lease.
  update profiles set coins = 10000 where id = r;
  v := rent_home(r, 'lagos:6,6/0', 'Flat 2', 40);
  v := property_buy(r, 'lagos', 'lagos:7,7/0', '{}'::jsonb, 500, 'home', 80, 'Flat 3', 1);
  perform pg_temp.check(not exists (select 1 from home_rentals where user_id = r) and (select home_unit from lives where user_id = r) = 'lagos:7,7/0', 'bought a home: the lease ends, the new one is home');
end $$;
\o
\echo 'renting: all ok'
