\set ON_ERROR_STOP on
-- Round 5 (part 9): levels, rising move prices, search cooldowns, decoys, big searches,
-- respawns and the level bonus.
update game_settings set value = 2 where key = 'search_cooldown_seconds';
update rounds set seek_ends_at = now() - interval '1s' where status = 'seek'; select tick() as r4_done;
select tick() as r5;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
select pg_temp.set_coins(id, 20000) from profiles where email_key in ('bo@x.com', 'cy@x.com', 'ada@gmail.com');
-- Levelling: needs rounds played and coins; the coins burn.
do $$ declare a uuid := (select id from profiles where email_key='ada@gmail.com'); res jsonb; begin
  raise notice 'ada level info: %', level_info(a);
  update profiles set seeker_rounds = 60 where id = a;
  res := upgrade_level(a); raise notice 'upgrade: %', res;
  while (select level from profiles where id = a) < 10 loop perform upgrade_level(a); end loop;
  raise notice 'ada now level % with % coins', (select level from profiles where id = a), (select coins from profiles where id = a);
  update profiles set hider_rounds = 0, seeker_rounds = 1 where email_key = 'cy@x.com';
  begin perform upgrade_level((select id from profiles where email_key='cy@x.com')); raise exception 'should fail';
  exception when others then raise notice 'ok needs rounds: %', sqlerrm; end;
end $$;
update profiles set level = 20 where email_key = 'bo@x.com';
update profiles set level = 3 where email_key = 'cy@x.com';
do $$ begin
  perform join_round((select id from profiles where email_key='bo@x.com'),'hider');
  perform join_round((select id from profiles where email_key='cy@x.com'),'hider');
  perform join_round((select id from profiles where email_key='ada@gmail.com'),'seeker');
end $$;
update rounds set join_ends_at = now() - interval '1s' where status='join'; select tick();
do $$
declare b uuid := (select id from profiles where email_key='bo@x.com'); c uuid := (select id from profiles where email_key='cy@x.com');
        a uuid := (select id from profiles where email_key='ada@gmail.com'); r bigint := (select id from rounds where status='seek');
        bt int; ct int; free int; res jsonb;
begin
  update entries set tile = (select g from generate_series(0, 439) g where not in_area(g, 0, 6) order by g desc limit 1)
    where round_id = r and user_id = '00000000-0000-0000-0000-00000000b07a';
  update entries set tile = 0 where round_id = r and user_id = b;
  update entries set tile = 30 where round_id = r and user_id = c;
  -- Move prices climb with every move.
  raise notice 'first move price: %', move_price(r);
  res := move_hider(c, 31); raise notice 'cy moved, paid %, next %', res->>'fee', res->>'next_price';
  begin perform move_hider(c, 32); raise exception 'should fail'; exception when others then raise notice 'ok 5 min cooldown: %', sqlerrm; end;
  -- Decoy (cy is level 3): placed on tile 5, nobody knows where.
  res := place_decoy(c, 5); raise notice 'decoy: %', res;
  begin perform place_decoy(c, 6); raise exception 'should fail'; exception when others then raise notice 'ok one decoy: %', sqlerrm; end;
  raise notice 'public decoy event tile: %', (select tile from events where round_id = r and kind = 'decoy');
  -- Sweeps read decoys as someone's there.
  raise notice 'sweep over the decoy says found: %', sweep(a, 5, 1)->>'found';
  -- Searching the decoy: nothing for the hunter.
  update profiles set free_search_day = current_date, last_search_at = null, search_heat = 0 where id = a;
  res := search_tile(a, 5); raise notice 'search decoy: % reward %', res->>'result', res->>'reward';
  begin perform search_tile(a, 7); raise exception 'should fail'; exception when others then raise notice 'ok search cooldown: %', sqlerrm; end;
  -- Level 10 big search over bo (level 20 → finder bonus 4×25).
  update profiles set last_search_at = now() - interval '1 minute', search_heat = 0 where id = a;
  res := search_area(a, 0); raise notice 'big search: % caught % reward % cost %', res->>'result', res->>'caught', res->>'reward', res->>'cost';
  raise notice 'level bonus paid: %', (select sum(amount) from ledger where kind = 'level_bonus' and round_id = r);
  -- bo respawns (level 20, caught in the first 30 minutes); the 300 coins go into the prize pool (part 22).
  res := respawn(b); raise notice 'respawn: % at a secret spot', res->>'respawned';
  begin perform respawn(b); raise exception 'should fail'; exception when others then raise notice 'ok once: %', sqlerrm; end;
  raise notice 'public respawn event tile: %, hiders left: %', (select tile from events where round_id = r and kind = 'respawn'),
    (select hiders_remaining from rounds where id = r);
end $$;
update rounds set seek_ends_at = now() - interval '1s' where status='seek'; select tick();
select (select sum(created) - sum(burned) from coin_supply_daily) as created_minus_burned,
       (select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done') as held;
