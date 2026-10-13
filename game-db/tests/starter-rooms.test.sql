\set ON_ERROR_STOP on
-- Part 74: free starter rooms: given once, one free move, can't be sold, let or listed, given back
-- when you buy a home of your own, and given back after 60 days away.
\ir ../074_simple_life.sql
\ir ../074_simple_life.sql
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
insert into auth.users (email) values ('a@sr.test'), ('b@sr.test');
update profiles set username = 'Ayo' where email_key = 'a@sr.test';
update profiles set username = 'Bisi' where email_key = 'b@sr.test';
do $$
declare
  a uuid := pg_temp.uid('a@sr.test');
  b uuid := pg_temp.uid('b@sr.test');
  v jsonb;
begin
  v := life_start(a, 'lagos');
  perform pg_temp.check((select granted from lives where user_id = a) = 166.67, 'a new life starts with ₦250,000');
  v := life_start(b, 'lagos');
  v := starter_room_give(a, 'lagos', 'lagos:10,10/0', '{}'::jsonb, 'Room 1', 12, false);
  perform pg_temp.check((select home_unit from lives where user_id = a) = 'lagos:10,10/0', 'given a free room, it''s home');
  v := starter_room_give(a, 'lagos', 'lagos:10,10/1', '{}'::jsonb, 'Room 2', 12, false);
  perform pg_temp.check((v->>'already')::boolean and (select count(*) from property_units where owner_id = a) = 1, 'one free room only');
  perform pg_temp.fails('someone else can''t have it', 'taken', format('select starter_room_give(%L, ''lagos'', ''lagos:10,10/0'', ''{}'', ''R'', 12, false)', b));
  perform pg_temp.fails('can''t let it', 'starter_room', 'update property_units set let = true where unit_id = ''lagos:10,10/0''');
  perform pg_temp.fails('can''t hand it over', 'starter_room', format('update property_units set owner_id = %L where unit_id = ''lagos:10,10/0''', b));
  perform pg_temp.fails('can''t list it', 'starter_room', format('insert into property_listings (unit_id, seller_id, price) values (''lagos:10,10/0'', %L, 5)', a));
  -- One free move.
  v := starter_room_give(a, 'lagos', 'lagos:20,20/3', '{}'::jsonb, 'Room 4', 12, true);
  perform pg_temp.check((select home_unit from lives where user_id = a) = 'lagos:20,20/3' and not exists (select 1 from property_units where unit_id = 'lagos:10,10/0'), 'moved: the old room is free again');
  perform pg_temp.fails('only one free move', 'moved', format('select starter_room_give(%L, ''lagos'', ''lagos:30,30/0'', ''{}'', ''R'', 12, true)', a));
  -- Buying a home of your own gives the free room back.
  update profiles set coins = 100000 where id = a;
  v := property_buy(a, 'lagos', 'lagos:40,40/0', '{}'::jsonb, 500, 'home', 80, 'Flat 1', 1);
  perform pg_temp.check((select home_unit from lives where user_id = a) = 'lagos:40,40/0', 'a bought home becomes home');
  perform pg_temp.check(not exists (select 1 from property_units where owner_id = a and starter), 'and the free room goes back');
  -- 60 days away: the free room goes back.
  v := starter_room_give(b, 'lagos', 'lagos:50,50/0', '{}'::jsonb, 'Room 1', 12, false);
  update lives set seen_at = now() - interval '61 days' where user_id = b;
  perform starter_rooms_sweep();
  perform pg_temp.check((select home_unit from lives where user_id = b) is null and not exists (select 1 from property_units where owner_id = b), 'away 60 days: the room goes back');
  perform pg_temp.check(exists (select 1 from property_units where owner_id = a), 'other homes untouched');
end $$;
\o
\echo 'starter rooms: all ok'
