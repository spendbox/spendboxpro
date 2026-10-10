\set ON_ERROR_STOP on
-- Part 32: robbing the bank. Info screen numbers, getting away (loot out of the prize pool,
-- stake back), getting caught (stake and fine into the pool), the hour's wait, no robbing an
-- empty vault, not enough mint, the books, and privacy.
\ir ../032_bank_heist.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.coins(u uuid) returns numeric language sql as $$ select coins from profiles where id = u $$;
create function pg_temp.pool() returns numeric language sql as $$ select pool from rounds where status in ('join', 'seek') order by id desc limit 1 $$;
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
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
create function pg_temp.set_pool(n numeric) returns void language plpgsql as $$
declare r rounds;
begin
  select * into r from rounds where status in ('join', 'seek') order by id desc limit 1;
  if n > r.pool then perform log_coins(null, r.id, 'topup', n - r.pool); end if;
  if n < r.pool then perform burn(r.id, r.pool - n, 'test'); end if;
  update rounds set pool = n where id = r.id;
end $$;
-- Coin books with open stakes and the pool (as in the duels test).
create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled)
          + (select coalesce(sum(e.stake), 0) from entries e join rounds r on r.id = e.round_id
              where r.status <> 'done' and e.role = 'hider' and not e.caught))
$$;
create function pg_temp.rested(u uuid) returns void language sql as $$
  update bank_heists set created_at = now() - interval '2 hours' where user_id = u
$$;

-- Running part 32 again changes nothing.
\ir ../032_bank_heist.sql
\o /dev/null

insert into auth.users (email) values ('rob1@heist.test'), ('rob2@heist.test');
update profiles set username = 'Qrobber' where email_key = 'rob1@heist.test';
update profiles set username = 'Qbroke' where email_key = 'rob2@heist.test';
select pg_temp.set_coins(pg_temp.uid('rob1@heist.test'), 2000);
select pg_temp.set_coins(pg_temp.uid('rob2@heist.test'), 50);
select tick();
create temp table books_h as select pg_temp.gap() as gap_before;

do $$
declare u uuid := pg_temp.uid('rob1@heist.test'); v jsonb; c0 numeric; p0 numeric;
begin
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.bank_heists', 'select')
                        and not has_function_privilege('authenticated', 'public.bank_heist(uuid,text)', 'execute')
                        and has_function_privilege('service_role', 'public.bank_heist(uuid,text)', 'execute'), 'robberies are server-only');
  perform pg_temp.set_pool(10);
  perform pg_temp.check(bank_heist_info(u)->>'why' = 'empty_vault', 'a near-empty vault isn''t worth robbing');
  perform pg_temp.fails('can''t rob an empty vault', 'empty_vault', format('select bank_heist(%L, %L)', u, 'quiet'));
  perform pg_temp.set_pool(1000);
  v := bank_heist_info(u);
  perform pg_temp.check((v->>'can')::boolean and (v->>'vault')::numeric = 1000
                        and (v->'plans'->0->>'loot')::numeric = 100 and (v->'plans'->1->>'loot')::numeric = 350
                        and (v->'plans'->1->>'chance')::numeric = 0.10,
                        'the screen shows the vault (1000), the quiet job takes 100, the big heist 350 at 10%');
  perform pg_temp.fails('only two plans', 'bad_plan', format('select bank_heist(%L, %L)', u, 'tunnel'));
  perform pg_temp.fails('not enough mint', 'not_enough:100', format('select bank_heist(%L, %L)', pg_temp.uid('rob2@heist.test'), 'quiet'));

  -- Got away (the dice always say yes for this one).
  update game_settings set value = 1 where key = 'heist_big_chance';
  c0 := pg_temp.coins(u);
  p0 := pg_temp.pool();
  v := bank_heist(u, 'big');
  perform pg_temp.check((v->>'success')::boolean and (v->>'loot')::numeric = 350 and pg_temp.coins(u) = c0 + 350 and pg_temp.pool() = p0 - 350,
                        'the big heist gets away with 35% of the vault: +350 mint, the pool 350 less');
  perform pg_temp.check((select body from notifications where user_id = u and kind = 'heist' order by id desc limit 1) like 'You robbed the bank and got away with 350 mint!',
                        'the robber is told');
  perform pg_temp.check((select detail->>'name' from events where kind = 'heist' order by id desc limit 1) = 'Qrobber', 'the town hears about it');
  perform pg_temp.fails('one try an hour', 'cooldown:', format('select bank_heist(%L, %L)', u, 'quiet'));
  perform pg_temp.check(bank_heist_info(u)->>'why' = 'cooldown', 'the screen says to wait');

  -- Caught (the dice always say no).
  perform pg_temp.rested(u);
  update game_settings set value = 0 where key = 'heist_quiet_chance';
  c0 := pg_temp.coins(u);
  p0 := pg_temp.pool();
  v := bank_heist(u, 'quiet');
  perform pg_temp.check(not (v->>'success')::boolean and (v->>'fine')::numeric = round((c0 - 100) * 0.10, 2)
                        and pg_temp.coins(u) = c0 - 100 - round((c0 - 100) * 0.10, 2)
                        and pg_temp.pool() = p0 + 100 + round((c0 - 100) * 0.10, 2),
                        'caught: the 100 stake and a 10% fine go into the prize pool');
  -- The fine never goes over 1,000.
  perform pg_temp.rested(u);
  perform pg_temp.set_coins(u, 50000);
  v := bank_heist(u, 'quiet');
  perform pg_temp.check((v->>'fine')::numeric = 1000, 'the fine is at most 1,000');
end $$;
update game_settings set value = 0.10 where key = 'heist_big_chance';
update game_settings set value = 0.25 where key = 'heist_quiet_chance';

\o
select gap_before, pg_temp.gap() as gap_after from books_h;  -- must be equal
select pg_temp.check(gap_before = pg_temp.gap(), 'the coin books still balance') from books_h;
select 'heist: all checks passed' as result;
