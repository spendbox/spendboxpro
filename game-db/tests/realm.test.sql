\set ON_ERROR_STOP on
-- Part 118: the Spirit Realm. Joining the next battle (paying for the army), changing the army
-- (paying the difference, or getting it back), leaving before it starts, arenas filling up, the
-- payout (the winner takes 85% of the arena's pool, the rest to the city), an arena with one army
-- (money back), and settling twice (paid once).
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

insert into auth.users (email) values ('a@realm.test'), ('b@realm.test'), ('c@realm.test'), ('d@realm.test');
update profiles set username = 'Ada' where email_key = 'a@realm.test';
update profiles set username = 'Bayo' where email_key = 'b@realm.test';
update profiles set username = 'Chi' where email_key = 'c@realm.test';
update profiles set username = 'Dele' where email_key = 'd@realm.test';
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key like '%@realm.test';
update profiles set coins = 1000 where email_key like '%@realm.test';
delete from life_pots where user_id in (select id from profiles where email_key like '%@realm.test');

do $$
declare
  a uuid := pg_temp.uid('a@realm.test');
  b uuid := pg_temp.uid('b@realm.test');
  c uuid := pg_temp.uid('c@realm.test');
  d uuid := pg_temp.uid('d@realm.test');
  nxt timestamptz := date_trunc('hour', now()) + interval '1 hour';
  v jsonb;
  bank numeric;
begin
  perform pg_temp.fails('not on the hour', 'bad_time', format('select realm_enlist(%L, %L, 0, ''{}'', 0, 0, 10, 2)', a, nxt + interval '5 minutes'));
  perform pg_temp.fails('a battle already started', 'started', format('select realm_enlist(%L, %L, 0, ''{}'', 0, 0, 10, 2)', a, nxt - interval '1 hour'));
  perform pg_temp.fails('not the next battle yet', 'too_soon', format('select realm_enlist(%L, %L, 0, ''{}'', 0, 0, 10, 2)', a, nxt + interval '1 hour'));
  perform pg_temp.fails('an unknown gate', 'bad_gate', format('select realm_enlist(%L, %L, 12, ''{}'', 0, 0, 10, 2)', a, nxt));
  perform pg_temp.fails('more than you have', 'not_enough', format('select realm_enlist(%L, %L, 0, ''{}'', 0, 0, 2000, 2)', a, nxt));

  -- Arenas of 2 here (30 in the game), so four armies make two arenas.
  v := realm_enlist(a, nxt, 0, '{"soldier": 50}', 0, 0, 100, 2);
  perform pg_temp.check((v->>'arena')::int = 0 and (v->>'paid')::numeric = 100, 'the first army is in arena 0 and pays for itself');
  perform pg_temp.check(pg_temp.coins(a) = 900, 'paid from the wallet');
  v := realm_enlist(a, nxt, 3, '{"soldier": 50, "angel": 5}', 1, 0, 185, 2);
  perform pg_temp.check((v->>'paid')::numeric = 85 and pg_temp.coins(a) = 815, 'a bigger army pays the difference');
  v := realm_enlist(a, nxt, 3, '{"soldier": 40}', 0, 0, 80, 2);
  perform pg_temp.check((v->>'paid')::numeric = -105 and pg_temp.coins(a) = 920, 'a smaller army gets the difference back');
  perform pg_temp.check((select gate from realm_armies where user_id = a) = 3 and (v->>'arena')::int = 0, 'same place in the queue, new gate');

  perform realm_enlist(b, nxt, 6, '{"ghost": 10}', 0, 0, 60, 2);
  perform realm_enlist(c, nxt, 9, '{"devil": 5}', 0, 0, 60, 2);
  perform pg_temp.check(realm_leave(c, nxt) = 60 and pg_temp.coins(c) = 1000, 'leaving before it starts: all of it back');
  perform realm_leave(b, nxt);
  v := realm_enlist(b, nxt, 6, '{"ghost": 10}', 0, 0, 60, 2);
  perform pg_temp.check((v->>'arena')::int = 0, 'a seat someone left is taken by the next to come');
  v := realm_enlist(c, nxt, 9, '{"devil": 5}', 0, 0, 60, 2);
  perform pg_temp.check((v->>'arena')::int = 1, 'arena 0 is full: the next arena');
  v := realm_enlist(d, nxt, 0, '{"soldier": 1}', 0, 0, 2, 2);
  perform pg_temp.check((v->>'arena')::int = 1, 'arena 1 fills up');

  -- The hour comes.
  alter table realm_armies drop constraint realm_armies_at_fkey;
  update realm_battles set at = at - interval '2 hours' where at = nxt;
  update realm_armies set at = at - interval '2 hours' where at = nxt;
  alter table realm_armies add constraint realm_armies_at_fkey foreign key (at) references realm_battles (at) on delete cascade;
  nxt := nxt - interval '2 hours';
  perform pg_temp.fails('too late to change your army', 'started', format('select realm_enlist(%L, %L, 0, ''{}'', 0, 0, 10, 2)', b, nxt));
  perform pg_temp.fails('too late to leave', 'started', format('select realm_leave(%L, %L)', b, nxt));

  -- The battle says: arena 0, Bayo beat Ada; arena 1 has no result (money back).
  select balance into bank from world_bank where id = 1;
  v := realm_settle(nxt, jsonb_build_array(jsonb_build_object('arena', 0, 'ranks', jsonb_build_array(b, a))), 0.85);
  perform pg_temp.check(v->>'status' = 'settled' and (v->>'arenas')::int = 2, 'settled, both arenas');
  perform pg_temp.check(pg_temp.coins(b) = 940 + 119, 'the winner takes 85% of the pool (140)');
  perform pg_temp.check((select balance from world_bank where id = 1) = bank + 21, 'the rest goes to the city');
  perform pg_temp.check((select rank from realm_armies where user_id = a) = 2 and (select prize from realm_armies where user_id = b) = 119, 'places and the prize are kept');
  perform pg_temp.check(pg_temp.coins(c) = 1000 and pg_temp.coins(d) = 1000, 'an arena without a result: money back');
  perform pg_temp.check((select count(*) from notifications where kind = 'realm' and user_id = b and body like '%won%') = 1, 'the winner is told');
  v := realm_settle(nxt, jsonb_build_array(jsonb_build_object('arena', 0, 'ranks', jsonb_build_array(a, b))), 0.85);
  perform pg_temp.check((v->>'already')::boolean and pg_temp.coins(a) = 920 and pg_temp.coins(b) = 1059, 'settling again pays nothing');
end $$;

do $$
declare
  a uuid := pg_temp.uid('a@realm.test');
  b uuid := pg_temp.uid('b@realm.test');
  nxt timestamptz := date_trunc('hour', now()) + interval '1 hour';
  v jsonb;
begin
  -- Alone in the realm: nobody to fight, the money back even with a result.
  perform realm_enlist(a, nxt, 0, '{"giant": 1}', 0, 0, 25, 30);
  alter table realm_armies drop constraint realm_armies_at_fkey;
  update realm_battles set at = at - interval '3 hours' where at = nxt;
  update realm_armies set at = at - interval '3 hours' where at = nxt;
  alter table realm_armies add constraint realm_armies_at_fkey foreign key (at) references realm_battles (at) on delete cascade;
  nxt := nxt - interval '3 hours';
  v := realm_settle(nxt, jsonb_build_array(jsonb_build_object('arena', 0, 'ranks', jsonb_build_array(a))), 0.85);
  perform pg_temp.check(pg_temp.coins(a) = 920, 'alone: the money back');
  perform pg_temp.check(realm_settle(nxt + interval '9 hours', '[]', 0.85)->>'status' = 'none', 'no battle then');
  perform pg_temp.check(pg_temp.coins(b) = 1059, 'others untouched');
end $$;
