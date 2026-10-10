\set ON_ERROR_STOP on
-- Part 36: minigame rewards. Bronze/silver/gold pay 2/4/6, one reward per game every 45
-- seconds, 10 rewarded games a day, server-only, and the coin books still balance.
\ir ../036_minigames.sql
\ir ../036_minigames.sql
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
create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled)
          + (select coalesce(sum(e.stake), 0) from entries e join rounds r on r.id = e.round_id
              where r.status <> 'done' and e.role = 'hider' and not e.caught))
$$;

insert into auth.users (email) values ('play1@mg.test');
update profiles set username = 'Qgamer' where email_key = 'play1@mg.test';
select tick();
create temp table books_m as select pg_temp.gap() as gap_before;

do $$
declare u uuid := pg_temp.uid('play1@mg.test'); v jsonb; c0 numeric; i int;
begin
  perform pg_temp.check(not has_table_privilege('authenticated', 'public.minigame_rewards', 'select')
                        and not has_function_privilege('authenticated', 'public.claim_minigame_reward(uuid,text,int)', 'execute')
                        and has_function_privilege('service_role', 'public.claim_minigame_reward(uuid,text,int)', 'execute'), 'rewards are server-only');
  c0 := pg_temp.coins(u);
  v := claim_minigame_reward(u, 'safe-cracker', 3);
  perform pg_temp.check((v->>'coins')::numeric = 6 and pg_temp.coins(u) = c0 + 6 and (v->>'left_today')::int = 9, 'gold pays 6');
  v := claim_minigame_reward(u, 'safe-cracker', 1);
  perform pg_temp.check((v->>'coins')::numeric = 0 and v->>'reason' = 'too_soon' and pg_temp.coins(u) = c0 + 6, 'the same game again too soon pays nothing');
  v := claim_minigame_reward(u, 'snake', 1);
  perform pg_temp.check((v->>'coins')::numeric = 2, 'bronze pays 2');
  v := claim_minigame_reward(u, 'chess', 2);
  perform pg_temp.check((v->>'coins')::numeric = 4, 'silver pays 4');
  perform pg_temp.fails('grades are 1-3', 'bad_score', format('select claim_minigame_reward(%L, %L, 4)', u, 'snake'));
  perform pg_temp.fails('game names are checked', 'bad_game', format('select claim_minigame_reward(%L, %L, 1)', u, 'DROP TABLE'));
  for i in 1..7 loop perform claim_minigame_reward(u, 'g' || i || '-x', 1); end loop;
  v := claim_minigame_reward(u, 'ludo', 3);
  perform pg_temp.check((v->>'coins')::numeric = 0 and v->>'reason' = 'daily_limit', '10 rewarded games a day');
  perform pg_temp.check(pg_temp.coins(u) = c0 + 6 + 2 + 4 + 7 * 2, 'paid exactly what it said');
end $$;

\o
select gap_before, pg_temp.gap() as gap_after from books_m;  -- must be equal
select pg_temp.check(gap_before = pg_temp.gap(), 'the coin books still balance') from books_m;
select 'minigames: all checks passed' as result;
