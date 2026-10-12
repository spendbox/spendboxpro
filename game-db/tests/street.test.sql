\set ON_ERROR_STOP on
-- Parts 53-55: mark rules (styles, how many up), earnings, and the street: stealing, jail and
-- bribes, pranks, rivals, gossip.

\ir ../053_marks_rules.sql
\ir ../053_marks_rules.sql
\ir ../054_earnings.sql
\ir ../055_street.sql
\ir ../055_street.sql
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

insert into auth.users (email) values ('s1@street.test'), ('s2@street.test'), ('s3@street.test');

do $$
declare
  a uuid := pg_temp.uid('s1@street.test');
  b uuid := pg_temp.uid('s2@street.test');
  c uuid := pg_temp.uid('s3@street.test');
  m bigint;
  r jsonb;
  it bigint;
  coins_b numeric;
begin
  perform life_start(a, 'lagos');
  perform life_start(b, 'lagos');
  perform life_start(c, 'lagos');
  update profiles set coins = 1000 where id in (a, b, c);

  -- Marks: a style for writing, and only as many up as reputation allows.
  m := mark_place(a, 'lagos', 30, 30, 'writing', 'Bubble letters', '#e03131', null, 'A wall', 0, 0, null, null, 'bubble', 1);
  perform pg_temp.check(marks_near(b, 'lagos', 20, 40, 20, 40)->0->>'style' = 'bubble' and marks_up(a) = 1, 'a graffiti style, one up');
  perform pg_temp.fails('one at a time', 'mark_limit:1', format('select mark_place(%L, %L, 31, 31, %L, %L, null, null, null, 0, 0, null, null, null, 1)', a, 'lagos', 'writing', 'Again'));
  perform pg_temp.fails('reputation first', 'low_rep', format('select mark_place(%L, %L, 31, 31, %L, %L, null, null, null, 0, 0, null, null, null, 0)', a, 'lagos', 'writing', 'Again'));
  perform pg_temp.fails('a real style', 'bad_kind', format('select mark_place(%L, %L, 31, 31, %L, %L, null, null, null, 0, 0, null, null, %L, 3)', a, 'lagos', 'writing', 'Again', 'crayon'));
  perform mark_place(a, 'lagos', 31, 31, 'writing', repeat('x', 150), null, null, null, 0, 0, null, null, null, 2);
  perform pg_temp.check((select char_length(body) from marks where author = a order by id desc limit 1) = 100 and marks_up(a) = 2, 'short lines, two up with more reputation');
  perform mark_remove(a, m);
  perform pg_temp.check(marks_up(a) = 1, 'taken down: room for another');

  -- Earnings: everything earned, and each payment in.
  perform log_coins(a, null, 'work_pay', 50, false, 'Pay: Cashier, Shoprite');
  perform log_coins(a, null, 'rent', 20, false, 'Rent');
  perform log_coins(a, null, 'commute', -5, false, 'Fare');
  r := life_earnings(a, 7, 100);
  perform pg_temp.check((r->>'total')::numeric = 70 and jsonb_array_length(r->'entries') = 2 and r->'entries'->0->>'kind' = 'rent', 'earnings and pay slips');

  -- New players can't be robbed for their first days.
  perform pg_temp.fails('new players are safe', 'too_new', format('select street_steal(%L, %L, 100, 100, 10)', a, b));
  update lives set started_at = now() - interval '5 days' where user_id in (a, b, c);

  -- Not caught: a share of their wallet (capped), and they're told someone did it.
  update game_settings set value = -100 where key = 'steal_catch_pct';
  r := street_steal(a, b, 30, 100, 10);
  perform pg_temp.check(r->>'what' = 'cash' and (r->>'amount')::numeric = 30 and (select coins from profiles where id = b) = 970 and (select coins from profiles where id = a) = 1030, 'a pocket picked');
  perform pg_temp.check((select rep_penalty from lives where user_id = a) = 1 and exists (select 1 from notifications where user_id = b and body like 'Someone picked your pocket%'), 'people talk, they''re told');
  perform pg_temp.fails('once a day each', 'too_many_here', format('select street_steal(%L, %L, 30, 100, 10)', a, b));

  -- Empty wallet: one of their small things instead.
  update profiles set coins = 0 where id = c;
  it := item_get(c, 'watch', 'A watch', 'jewellery', 50, '{}'::jsonb, 'bought', 0);
  r := street_steal(a, c, 30, 100, 10);
  perform pg_temp.check(r->>'what' = 'item' and (select owner from items where id = it) = a and (select how from items where id = it) = 'stolen', 'their watch instead');

  -- Caught: fined, reputation, they know who; jail, and a bribe that works (or not).
  update game_settings set value = 200 where key = 'steal_catch_pct';
  update game_settings set value = 100 where key = 'jail_pct';
  update profiles set coins = 1000 where id = c;
  r := street_steal(b, c, 30, 100, 10);
  perform pg_temp.check((r->>'caught')::boolean and (r->>'jailed')::boolean and jail_until(b) is not null and (select coins from profiles where id = c) = 1000, 'caught and jailed');
  perform pg_temp.check(exists (select 1 from notifications where user_id = c and body like '%tried to pick your pocket%') and exists (select 1 from gossip where kind = 'jail'), 'they know, the street knows');
  perform pg_temp.fails('no stealing from a cell', 'in_jail', format('select street_steal(%L, %L, 30, 100, 10)', b, a));
  update game_settings set value = 100 where key = 'bribe_ok_pct';
  perform pg_temp.check(jail_bribe(b, 50), 'a bribe works');
  perform pg_temp.check(jail_until(b) is null, 'and gets you out');
  perform pg_temp.fails('not in jail now', 'not_in_jail', format('select jail_bribe(%L, 50)', b));

  -- Pranks at the door, rivals and the score, and the gossip column.
  perform pg_temp.fails('a home to prank', 'no_home', format('select street_prank(%L, %L, %L, 1)', a, b, 'eggs'));
  update lives set home_unit = 'lagos:1,1/0' where user_id in (a, b, c);
  perform rival_set(a, b, true);
  perform pg_temp.check(rival_set(b, a, true), 'rivals, both ways');
  perform pg_temp.check(exists (select 1 from gossip where kind = 'rivals'), 'in the gossip');
  m := street_prank(a, b, 'eggs', 1);
  perform pg_temp.check(exists (select 1 from doorstep where id = m and kind = 'prank' and prank = 'eggs') and exists (select 1 from gossip where kind = 'prank'), 'eggs on the door, and in the gossip');
  perform pg_temp.fails('one prank a day each', 'too_many_here', format('select street_prank(%L, %L, %L, 1)', a, b, 'glitter'));
  r := rivals_of(a);
  perform pg_temp.check(jsonb_array_length(r) = 1 and (r->0->>'named')::boolean and (r->0->>'namedMe')::boolean and (r->0->>'mine')::int = 2 and (r->0->>'theirs')::int = 0, 'the score: a prank and a pocket');
  perform prank_clean(b, m);
  perform pg_temp.check((select cleaned_at is not null from doorstep where id = m), 'cleaned up');
  perform pg_temp.check(jsonb_array_length(gossip_list(c, 'lagos')) >= 3, 'the gossip column');
  insert into blocks (blocker, blocked) values (c, a);
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(gossip_list(c, 'lagos')) g where g->'people' ? a::text), 'blocked people left out');
end $$;
