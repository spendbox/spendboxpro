\set ON_ERROR_STOP on
-- Part 118: the Spirit Realm. Sending troops into the battle on now (paying for them, the step they
-- come through, the limits), arenas filling up, and the payout when the hour is over (the top three
-- of each arena share the pool, the rest to the city), an arena with one player (money back), and
-- settling twice (paid once).
\ir ../118_spirit_realm.sql
\ir ../118_spirit_realm.sql
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
create function pg_temp.coins(u uuid) returns numeric language sql as $$ select coins from profiles where id = u $$;
-- Send troops into the battle on now: arenas of 2, 20 s to come through, 10 s between sends, never closed, ₥300 at most, 3 sends.
create function pg_temp.send(u uuid, x numeric, y numeric, cost numeric) returns jsonb language sql as $$
  select realm_send(u, date_trunc('hour', now()), x, y, '{"soldier": 5}', 0, 0, cost, 2, 20, 10, 0, 300, 3)
$$;

insert into auth.users (email) values ('a@realm.test'), ('b@realm.test'), ('c@realm.test'), ('d@realm.test'), ('e@realm.test');
update profiles set username = initcap(split_part(email_key, '@', 1)) where email_key like '%@realm.test';
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key like '%@realm.test';
update profiles set coins = 1000 where email_key like '%@realm.test';
delete from life_pots where user_id in (select id from profiles where email_key like '%@realm.test');

do $$
declare
  a uuid := pg_temp.uid('a@realm.test');
  b uuid := pg_temp.uid('b@realm.test');
  c uuid := pg_temp.uid('c@realm.test');
  now_at timestamptz := date_trunc('hour', now());
  v jsonb;
  w jsonb;
begin
  perform pg_temp.fails('not on the hour', 'bad_time', format('select realm_send(%L, %L, 0, 0, ''{}'', 0, 0, 10, 2, 20, 10, 0, 300, 3)', a, now_at + interval '5 minutes'));
  perform pg_temp.fails('the next battle hasn''t begun', 'not_yet', format('select realm_send(%L, %L, 0, 0, ''{}'', 0, 0, 10, 2, 20, 10, 0, 300, 3)', a, now_at + interval '1 hour'));
  perform pg_temp.fails('closed near the end', 'closed', format('select realm_send(%L, %L, 0, 0, ''{}'', 0, 0, 10, 2, 20, 10, 3599, 300, 3)', a, now_at));
  perform pg_temp.fails('outside the arena', 'outside', format('select pg_temp.send(%L, 80, 80, 10)', a));
  perform pg_temp.fails('more than you have', 'not_enough', format('select realm_send(%L, %L, 0, 0, ''{}'', 0, 0, 2000, 2, 20, 10, 0, 3000, 3)', a, now_at));
  perform pg_temp.fails('more than a battle allows', 'too_much', format('select pg_temp.send(%L, 0, 0, 301)', a));

  v := pg_temp.send(a, 0, -90, 100);
  perform pg_temp.check((v->>'arena')::int = 0 and (v->>'seq')::int = 0 and (v->>'n')::int = 0, 'the first player is in arena 0');
  perform pg_temp.check(pg_temp.coins(a) = 900, 'the troops are paid for');
  perform pg_temp.check((v->>'step')::int between floor(extract(epoch from now() - now_at) * 4)::int + 79 and floor(extract(epoch from now() - now_at) * 4)::int + 81, 'they come through in 20 seconds');
  perform pg_temp.fails('too quick after the last', 'too_quick', format('select pg_temp.send(%L, 0, 0, 10)', a));
  update realm_armies set last_step = last_step - 400 where user_id = a;
  w := pg_temp.send(a, 10, 10, 150);
  perform pg_temp.check((w->>'n')::int = 1 and (w->>'spent')::numeric = 250 and pg_temp.coins(a) = 750, 'a second send');
  update realm_armies set last_step = last_step - 400 where user_id = a;
  perform pg_temp.fails('over the battle''s limit in all', 'too_much', format('select pg_temp.send(%L, 0, 0, 60)', a));
  perform pg_temp.check((select count(*) from realm_waves where user_id = a) = 2, 'both sends kept');

  perform pg_temp.send(b, 50, 50, 60);
  v := pg_temp.send(c, -50, 0, 40);
  perform pg_temp.check((v->>'arena')::int = 1 and (v->>'seq')::int = 2, 'arena 0 is full: the next one');
  delete from realm_battles where at = now_at;
end $$;

do $$
declare
  a uuid := pg_temp.uid('a@realm.test');
  b uuid := pg_temp.uid('b@realm.test');
  c uuid := pg_temp.uid('c@realm.test');
  d uuid := pg_temp.uid('d@realm.test');
  e uuid := pg_temp.uid('e@realm.test');
  past timestamptz := date_trunc('hour', now()) - interval '2 hours';
  v jsonb;
  bank numeric;
begin
  -- A battle two hours ago: four players in arena 0 (₥100 each, a pool of 400), one alone in arena 1.
  update profiles set coins = 1000 where email_key like '%@realm.test';
  insert into realm_battles (at, seed, joined) values (past, 1, 5);
  insert into realm_armies (at, user_id, name, seq, arena, spent, sends) values
    (past, a, 'A', 0, 0, 100, 1), (past, b, 'B', 1, 0, 100, 1), (past, c, 'C', 2, 0, 100, 1), (past, d, 'D', 3, 0, 100, 1), (past, e, 'E', 4, 1, 50, 1);
  insert into realm_battles (at, seed) values (date_trunc('hour', now()), 1);
  perform pg_temp.fails('not over yet', 'not_yet', format('select realm_settle(%L, ''[]'', ''{0.5,0.23,0.12}'')', date_trunc('hour', now())));
  delete from realm_battles where at = date_trunc('hour', now());

  select balance into bank from world_bank where id = 1;
  v := realm_settle(past, jsonb_build_array(
    jsonb_build_object('arena', 0, 'ranks', jsonb_build_array(c, a, d, b), 'points', jsonb_build_object(c, 90, a, 50, d, 20, b, 0)),
    jsonb_build_object('arena', 1, 'ranks', jsonb_build_array(e), 'points', jsonb_build_object(e, 30))), '{0.5,0.23,0.12}');
  perform pg_temp.check(v->>'status' = 'settled' and (v->>'arenas')::int = 2, 'settled, both arenas');
  perform pg_temp.check(pg_temp.coins(c) = 1200 and pg_temp.coins(a) = 1092 and pg_temp.coins(d) = 1048 and pg_temp.coins(b) = 1000, 'first 50%, second 23%, third 12% of the pool');
  perform pg_temp.check((select balance from world_bank where id = 1) = bank + 60, 'the rest (15%) goes to the city');
  perform pg_temp.check((select rank from realm_armies where at = past and user_id = b) = 4 and (select points from realm_armies where at = past and user_id = c) = 90, 'places and points are kept');
  perform pg_temp.check(pg_temp.coins(e) = 1050, 'alone in an arena: the money back');
  perform pg_temp.check((select count(*) from notifications where kind = 'realm' and user_id = c and body like '%won the Spirit Realm%') = 1, 'the winner is told');
  v := realm_settle(past, jsonb_build_array(jsonb_build_object('arena', 0, 'ranks', jsonb_build_array(b))), '{1}');
  perform pg_temp.check((v->>'already')::boolean and pg_temp.coins(b) = 1000, 'settling again pays nothing');
  perform pg_temp.check(realm_settle(past - interval '9 hours', '[]', '{1}')->>'status' = 'none', 'no battle then');
end $$;
