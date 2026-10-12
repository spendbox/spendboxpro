\set ON_ERROR_STOP on
-- Part 51: people on the map, cards, doorsteps (knocks, notes, wrapped gifts, thanks), while you were away, push.

\ir ../051_people.sql
\ir ../051_people.sql
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


insert into auth.users (email) values ('p1@people.test'), ('p2@people.test'), ('p3@people.test');
update profiles set username = 'Ade' where email_key = 'p1@people.test';
update profiles set username = 'Bola' where email_key = 'p2@people.test';
update profiles set username = 'Chi' where email_key = 'p3@people.test';

do $$
declare
  a uuid := pg_temp.uid('p1@people.test');
  b uuid := pg_temp.uid('p2@people.test');
  c uuid := pg_temp.uid('p3@people.test');
  v jsonb;
  it bigint;
  d bigint;
begin
  perform life_start(a, 'lagos');
  perform life_start(b, 'lagos');
  perform life_start(c, 'lagos');
  update profiles set coins = 100000 where id in (a, b, c);
  perform property_buy(a, 'lagos', 'lagos:140,140/0', '{"id":"lagos:140,140","kind":"flats","units":[{"id":"lagos:140,140/0"}]}', 10, 'home', 60, 'Flat 1', 2);
  perform property_buy(b, 'lagos', 'lagos:145,140/0', '{"id":"lagos:145,140","kind":"flats","units":[{"id":"lagos:145,140/0"}]}', 10, 'home', 60, 'Flat 1', 2);

  -- On the map: Bola is online at her home; nobody homeless shows; never yourself.
  perform people_here(b);
  v := people_on_map(a, 'lagos', 100, 200, 100, 200, 50);
  perform pg_temp.check(jsonb_array_length(v) = 1 and v->0->>'name' = 'Bola' and v->0->>'status' = 'online' and (v->0->>'x')::int = 145, 'Bola online at home');
  perform pg_temp.check(jsonb_array_length(people_on_map(a, 'lagos', 300, 400, 300, 400, 50)) = 0, 'only in the box');
  v := player_card(a, b);
  perform pg_temp.check(v->>'name' = 'Bola' and (v->>'online')::boolean and (v->>'units')::int = 1, 'her card');

  -- Doorsteps: a knock, a note, a wrapped gift (hers at once), thanks back.
  perform doorstep_leave(a, b, 'knock', null, null);
  perform doorstep_leave(a, b, 'note', 'Welcome to the street!', null);
  it := item_get(a, 'novel', 'Novel', 'book', 4, '{"mind":0.3}', 'bought', 4);
  d := doorstep_leave(a, b, 'gift', 'For you', it);
  perform pg_temp.check((select owner from items where id = it) = b, 'the gift is hers');
  perform pg_temp.fails('not someone else''s thing', 'not_yours', format('select doorstep_leave(%L, %L, %L, null, %L)', a, b, 'gift', it));
  perform pg_temp.fails('not to a door with no home', 'no_home', format('select doorstep_leave(%L, %L, %L, null, null)', a, c, 'knock'));
  perform pg_temp.fails('not yourself', 'self', format('select doorstep_leave(%L, %L, %L, null, null)', a, a, 'knock'));
  v := doorstep_list(b);
  perform pg_temp.check(jsonb_array_length(v) = 3 and v->0->>'kind' = 'gift' and v->0->>'item' = 'Novel' and v->0->>'fromName' = 'Ade', 'three things at her door');
  perform doorstep_thank(b, d);
  perform pg_temp.check(exists (select 1 from notifications where user_id = a and kind = 'thanks'), 'Ade hears thanks');
  perform pg_temp.fails('thanks once', 'already', format('select doorstep_thank(%L, %L)', b, d));
  perform doorstep_open(b, null);
  perform pg_temp.check(not exists (select 1 from doorstep where to_user = b and opened_at is null), 'all opened');

  -- Blocked: no knocking, not on the map.
  insert into blocks (blocker, blocked) values (b, c);
  perform property_buy(c, 'lagos', 'lagos:146,140/0', '{"id":"lagos:146,140","kind":"flats","units":[{"id":"lagos:146,140/0"}]}', 10, 'home', 60, 'Flat 1', 2);
  perform pg_temp.fails('blocked', 'blocked', format('select doorstep_leave(%L, %L, %L, null, null)', c, b, 'knock'));
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(people_on_map(c, 'lagos', 100, 200, 100, 200, 50)) e where e->>'name' = 'Bola'), 'not on their map');

  -- While you were away: what came to the door since, then from now.
  update lives set away_shown_at = now() - interval '1 hour' where user_id = b;
  v := away_digest(b);
  perform pg_temp.check(jsonb_array_length(v->'doorstep') = 3, 'while you were away: three at the door');
  perform pg_temp.check(jsonb_array_length(away_digest(b)->'doorstep') = 0, 'then nothing new');

  perform push_subscribe(a, 'https://push.example/1', 'key', 'auth');
  perform push_subscribe(b, 'https://push.example/1', 'key', 'auth');
  perform pg_temp.check((select user_id from push_subscriptions where endpoint = 'https://push.example/1') = b, 'a phone follows who signed in last');
end $$;
