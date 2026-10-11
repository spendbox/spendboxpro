\set ON_ERROR_STOP on
-- Part 46: the player market. Sales at an asking price (taxes both ways, homes never for sale);
-- offers held until answered (accept, refuse, counter, withdraw, lapse); rent only once a tenant is
-- in; World Bank loans paid each game month, paid first from a sale, and the property taken after
-- three missed payments.
\ir ../046_market.sql
\ir ../046_market.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.coins(u uuid) returns numeric language sql as $$ select coins from profiles where id = u $$;
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

insert into auth.users (email) values ('m1@mkt.test'), ('m2@mkt.test'), ('m3@mkt.test');
update profiles set username = 'MktSeller' where email_key = 'm1@mkt.test';
update profiles set username = 'MktBuyer' where email_key = 'm2@mkt.test';
update profiles set username = 'MktBidder' where email_key = 'm3@mkt.test';

do $$
declare
  a uuid := pg_temp.uid('m1@mkt.test');
  b uuid := pg_temp.uid('m2@mkt.test');
  c uuid := pg_temp.uid('m3@mkt.test');
  flats jsonb := '{"id":"lagos:940,940","kind":"flats","units":[{"id":"lagos:940,940/0"},{"id":"lagos:940,940/1"}]}';
  shop jsonb := '{"id":"lagos:941,940","kind":"shops","units":[{"id":"lagos:941,940/0"}]}';
  room jsonb := '{"id":"lagos:942,940","kind":"rooming","units":[{"id":"lagos:942,940/0"}]}';
  v jsonb;
  o bigint;
  x numeric;
  y numeric;
  t numeric;
begin
  perform life_start(a, 'lagos');
  perform life_start(b, 'lagos');
  perform life_start(c, 'lagos');
  update profiles set coins = 20000 where id in (a, b, c);
  perform property_buy(a, 'lagos', 'lagos:940,940/0', flats, 3000, 'home', 90, 'Flat 1', 10);
  perform property_buy(a, 'lagos', 'lagos:940,940/1', flats, 3000, 'home', 90, 'Flat 2', 10);
  perform property_buy(a, 'lagos', 'lagos:941,940/0', shop, 1000, 'shop', 30, 'Shop 1', 5);

  -- Tenants: nothing until one moves in.
  perform property_let(a, 'lagos:940,940/1', true);
  perform pg_temp.check((select tenant_from > now() from property_units where unit_id = 'lagos:940,940/1'), 'a let unit waits for a tenant');
  perform pg_temp.check((select rent_waiting(u) = 0 from property_units u where unit_id = 'lagos:940,940/1'), 'no rent before the tenant');
  update property_units set tenant_from = now() - interval '1 day', collected_at = now() - interval '1 day' where unit_id = 'lagos:940,940/1';
  perform pg_temp.check((select rent_waiting(u) between 9.9 and 10.1 from property_units u where unit_id = 'lagos:940,940/1'), 'a day of fair rent once they are in');
  perform property_rent_level(a, 'lagos:940,940/1', 'high');
  perform pg_temp.check((select rent_level = 'high' and tenant_from > now() from property_units where unit_id = 'lagos:940,940/1'), 'new rent: a new tenant to find');
  perform pg_temp.check(rent_factor('high') > 1 and rent_factor('low') < 1, 'high rent earns more, low less');
  update property_units set tenant_from = now() - interval '1 day', collected_at = now() - interval '1 day' where unit_id = 'lagos:940,940/1';

  -- Selling at an asking price.
  perform pg_temp.fails('your home is not for sale', 'is_home', format('select market_list(%L, %L, 100)', a, 'lagos:940,940/0'));
  perform pg_temp.fails('only your own', 'not_yours', format('select market_list(%L, %L, 100)', b, 'lagos:940,940/1'));
  perform market_list(a, 'lagos:940,940/1', 4000);
  perform pg_temp.check(jsonb_array_length(market_listings('lagos')) = 1, 'it shows in the listings');
  perform pg_temp.fails('the price you saw', 'price_changed', format('select market_buy(%L, %L, 3500)', b, 'lagos:940,940/1'));
  x := pg_temp.coins(a);
  t := (select balance from treasuries where id = 'ng-la') + (select balance from treasuries where id = 'ng');
  v := market_buy(b, 'lagos:940,940/1', 4000);
  perform pg_temp.check((v->>'home')::boolean and (select home_unit from lives where user_id = b) = 'lagos:940,940/1', 'the buyer''s first home');
  perform pg_temp.check(pg_temp.coins(b) = 20000 - 4000 - 120, 'the buyer pays the price and 3% tax');
  perform pg_temp.check((select owner_id from property_units where unit_id = 'lagos:940,940/1') = b, 'it is theirs');
  perform pg_temp.check(not exists (select 1 from property_listings where unit_id = 'lagos:940,940/1'), 'no longer listed');
  perform pg_temp.check((select let from property_units where unit_id = 'lagos:940,940/1'), 'the tenant stays in');
  perform pg_temp.check((select sum(amount) from ledger where user_id = a and kind = 'rent' and created_at > now() - interval '1 minute') > 0, 'the seller''s rent so far is collected first');
  perform pg_temp.check((select balance from treasuries where id = 'ng-la') + (select balance from treasuries where id = 'ng') >= t + 120 + 80, 'both taxes reach the treasuries');
  perform pg_temp.check(pg_temp.coins(a) >= x + 4000 - 80, 'the seller gets the price less 2%');

  -- Offers.
  perform pg_temp.fails('no offers on someone''s home', 'is_home', format('select market_offer(%L, %L, 100)', c, 'lagos:940,940/1'));
  perform pg_temp.fails('a home first', 'home_first', format('select market_offer(%L, %L, 100)', c, 'lagos:941,940/0'));
  perform property_buy(c, 'lagos', 'lagos:942,940/0', room, 500, 'home', 15, 'Room 1', 1);
  x := pg_temp.coins(c);
  o := market_offer(c, 'lagos:941,940/0', 600);
  perform pg_temp.check(pg_temp.coins(c) = x - 618, 'the offer and its tax are held');
  perform pg_temp.fails('one offer a unit', 'already_offered', format('select market_offer(%L, %L, 700)', c, 'lagos:941,940/0'));
  perform pg_temp.fails('only the owner answers', 'not_yours', format('select market_answer(%L, %s, %L, null)', b, o, 'accept'));
  perform pg_temp.fails('a counter asks more', 'bad_price', format('select market_answer(%L, %s, %L, 500)', a, o, 'counter'));
  perform market_answer(a, o, 'counter', 800);
  perform pg_temp.fails('the owner can''t take their own counter', 'offer_gone', format('select market_answer(%L, %s, %L, null)', a, o, 'accept'));
  y := pg_temp.coins(a);
  perform market_reply(c, o, 'accept');
  perform pg_temp.check((select owner_id from property_units where unit_id = 'lagos:941,940/0') = c, 'the counter taken: it is the bidder''s');
  perform pg_temp.check(pg_temp.coins(c) = x - 824, 'they paid the counter price and its tax, no more');
  perform pg_temp.check(pg_temp.coins(a) = y + 800 - 16, 'the owner got the counter less 2%');

  o := market_offer(b, 'lagos:941,940/0', 300);
  x := pg_temp.coins(b);
  perform market_answer(c, o, 'refuse', null);
  perform pg_temp.check(pg_temp.coins(b) = x + 309, 'refused: the held mint comes back');
  o := market_offer(b, 'lagos:941,940/0', 300);
  update property_offers set expires_at = now() - interval '1 minute' where id = o;
  perform market_tidy();
  perform pg_temp.check((select status from property_offers where id = o) = 'lapsed' and pg_temp.coins(b) = x + 309, 'unanswered offers lapse and refund');
  o := market_offer(b, 'lagos:941,940/0', 300);
  perform market_reply(b, o, 'withdraw');
  perform pg_temp.check(pg_temp.coins(b) = x + 309, 'withdrawn: refunded');
  o := market_offer(b, 'lagos:941,940/0', 300);
  perform market_list(c, 'lagos:941,940/0', 900);
  perform market_buy(a, 'lagos:941,940/0', 900);
  perform pg_temp.check((select status from property_offers where id = o) = 'void' and pg_temp.coins(b) = x + 309, 'sold elsewhere: other offers are given back');

  -- World Bank loans.
  perform pg_temp.check(loan_limit(a) = round((3000 + 900) * 0.5, 2), 'borrow up to half of what your property cost');
  perform pg_temp.fails('not over the limit', 'over_limit', format('select loan_take(%L, 5000, 6)', a));
  x := pg_temp.coins(a);
  t := (select balance from treasuries where id = 'wb');
  v := loan_take(a, 1950, 6);
  perform pg_temp.check(pg_temp.coins(a) = x + 1950 and (select balance from treasuries where id = 'wb') = t - 1950, 'the loan comes from the World Bank');
  perform pg_temp.check((select count(*) from property_units where owner_id = a and loan_id is not null) = 2, 'your property stands behind it');
  perform pg_temp.check(loan_limit(a) = 0, 'one loan at a time');
  -- A month's payment from savings and wallet.
  update loans set next_due = now() - interval '1 minute' where user_id = a and status = 'open';
  y := (select balance from loans where user_id = a and status = 'open');
  perform loan_tick(a);
  perform pg_temp.check((select balance < y and missed = 0 and next_due > now() from loans where user_id = a and status = 'open'), 'a payment goes in');
  -- Selling a unit behind the loan pays the bank first.
  perform market_list(a, 'lagos:941,940/0', 1000);
  y := (select balance from loans where user_id = a and status = 'open');
  perform market_buy(c, 'lagos:941,940/0', 1000);
  perform pg_temp.check((select balance from loans where user_id = a and status = 'open') = y - 980, 'the sale paid the bank first');
  -- Three missed payments: the bank takes the property.
  update profiles set coins = 0 where id = a;
  update life_pots set balance = 0 where user_id = a;
  update loans set next_due = now() - interval '200 hours' where user_id = a and status = 'open';
  perform loan_tick(a);
  perform pg_temp.check((select status from loans where user_id = a order by id desc limit 1) = 'defaulted', 'three missed payments: default');
  perform pg_temp.check(not exists (select 1 from property_units where owner_id = a), 'the bank took the property');
  perform pg_temp.check((select home_unit from lives where user_id = a) is null, 'and with it the home');

  -- Paying a loan off early.
  perform loan_take(c, 100, 12);
  perform loan_repay(c, 1000);
  perform pg_temp.check((select status from loans where user_id = c order by id desc limit 1) = 'repaid'
    and not exists (select 1 from property_units where owner_id = c and loan_id is not null), 'paid off early: the property is free');
  v := market_board(c);
  perform pg_temp.check(v ? 'made' and v ? 'received' and (v->>'canBorrow')::numeric > 0, 'the market board reads');
end $$;

\o
select 'market: all checks passed' as result;
