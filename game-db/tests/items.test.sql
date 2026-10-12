\set ON_ERROR_STOP on
-- Part 50: pay four times real wages; money by day; items bought, found, swiped and gifted; the
-- market (listing fee, taxed sales); selling to the city; crafting an invention; a car to work.
\ir ../050_economy_items.sql
\ir ../050_economy_items.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
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

insert into auth.users (email) values ('i1@items.test'), ('i2@items.test');
update profiles set username = 'Seller1' where email_key = 'i1@items.test';
update profiles set username = 'Buyer2' where email_key = 'i2@items.test';

do $$
declare
  a uuid := pg_temp.uid('i1@items.test');
  b uuid := pg_temp.uid('i2@items.test');
  it bigint;
  v jsonb;
  k text;
  before numeric;
  snap jsonb := '{"id":"lagos:70,70","kind":"flats","units":[{"id":"lagos:70,70/0"}]}';
begin
  perform pg_temp.check(public.setting('work_pay_max') >= 1000 and public.setting('pay_boost_done') = 1, 'pay caps raised, the 4x raise done once');
  perform life_start(a, 'lagos');
  perform life_start(b, 'lagos');
  update profiles set coins = 1000 where id in (a, b);

  -- Bought from a shop: paid, and it shows as a thing bought to keep.
  it := item_get(a, 'gold_chain', 'Gold chain', 'jewellery', 300, '{"mind":0.2,"rep":3}', 'bought', 300);
  perform pg_temp.check((select coins from profiles where id = a) = 700, 'bought for 300');
  v := life_money_days(a, 7);
  perform pg_temp.check(jsonb_array_length(v) = 7 and (v->6->>'bought')::numeric = 300, 'the day shows it bought to keep');
  perform pg_temp.fails('too dear', 'not_enough', format('select item_get(%L, %L, %L, %L, 5000, %L, %L, 5000)', a, 'car_lexus', 'Lexus RX', 'car', '{}', 'bought'));

  -- Found, and caught swiping: fined, reputation lost.
  perform item_get(a, 'novel', 'Novel', 'book', 4, '{"mind":0.3}', 'found', 0);
  before := (select coins from profiles where id = a);
  perform item_caught(a, 30, 10);
  perform pg_temp.check((select coins from profiles where id = a) = before - 30 and (select rep_penalty from lives where user_id = a) = 10, 'caught: fined, reputation lost');

  -- The market: a listing fee, then a sale taxed, the seller paid, the buyer owns it.
  perform item_list(a, it, 400, 8);
  perform pg_temp.check((select list_price from items where id = it) = 400, 'listed');
  perform pg_temp.fails('not at a stale price', 'price_changed', format('select item_buy(%L, %L, 350, 0.05)', b, it));
  before := life_can_spend(a, array['essentials', 'travel', 'savings', 'fun']);
  v := item_buy(b, it, 400, 0.05);
  perform pg_temp.check((select owner from items where id = it) = b and life_can_spend(b, array['savings']) = 600, 'bought on the market');
  perform pg_temp.check(life_can_spend(a, array['essentials', 'travel', 'savings', 'fun']) = before + 380, 'seller paid less 5% tax (shared into their pots)');
  perform pg_temp.check(item_recent_price('gold_chain') = 400, 'the price is remembered');

  -- A gift back, then sold to the city.
  perform pg_temp.check(item_gift(b, it, 'seller1') = 'Seller1', 'a gift by name');
  perform pg_temp.fails('not someone else''s', 'not_yours', format('select item_gift(%L, %L, %L)', b, it, 'Seller1'));
  perform item_sell_city(a, it, 120);
  perform pg_temp.check(not exists (select 1 from items where id = it), 'sold to the city');

  -- Crafting: materials now, done later, then an invention with its copies.
  insert into life_pots (user_id, pot, balance) values (a, 'savings', 100) on conflict (user_id, pot) do update set balance = 100;
  it := craft_start(a, '{"name":"Calm Beads","category":"jewellery","quality":0.8}', 20, 1);
  perform pg_temp.fails('not before it is done', 'not_done', format('select craft_finish(%L, %L, 30, %L, 5)', a, it, '{"mind":0.3}'));
  update crafts set ends_at = now() - interval '1 minute' where id = it;
  k := craft_finish(a, it, 30, '{"mind":0.3}', 5);
  perform pg_temp.check(k like 'inv-%' and (select count(*) from items where owner = a and kind = k) = 5, 'an invention, five copies');
  perform pg_temp.fails('only once', 'already', format('select craft_finish(%L, %L, 30, %L, 5)', a, it, '{}'));
  v := my_items(a);
  perform pg_temp.check((v->>'crafted')::int = 1 and jsonb_array_length(v->'items') >= 6, 'my things and crafts');
  perform item_list(a, (select min(id) from items where kind = k), 50, 0);
  perform item_buy(b, (select min(id) from items where kind = k and list_price is not null), 50, 0.05);
  perform pg_temp.check((select sold from item_kinds where id = k) = 1 and jsonb_array_length(inventions_top(5)) >= 1, 'inventions count their sales');

  -- A car to work: only with a car.
  perform property_buy(a, 'lagos', 'lagos:70,70/0', snap, 10, 'home', 60, 'Flat 1', 2);
  perform pg_temp.fails('no car, no driving', 'no_car', format('select life_work_take(%L, %L, %L, %L, %L, %L, %L, 2, 0, %L, 0)', a, 'lagos', 'lagos:71,70', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 'car'));
  perform item_get(a, 'car_bike', 'Motorbike', 'car', 0, '{}', 'found', 0);
  perform life_work_take(a, 'lagos', 'lagos:71,70', 'Shops', 'shop_assistant', 'Shop assistant', 'retail', 2, 0, 'car', 0);
  perform pg_temp.check((select mode from life_jobs where user_id = a) = 'car', 'driving to work');
end $$;
