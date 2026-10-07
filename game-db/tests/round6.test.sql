\set ON_ERROR_STOP on
-- Round 6 (part 15): ghosts' move limits, the hunt runs the full hour, drone recharge after a
-- hit, catches carry the player's id and level.
-- Earlier test files may set balances by hand, so check that this round adds no gap of its own.
create temp table books as select (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')) as gap_before;
update game_settings set value = 1 where key = 'ghost_moves_level_1';
update game_settings set value = 0 where key = 'search_cooldown_seconds';
update game_settings set value = 0 where key = 'move_cooldown_seconds';
update rounds set seek_ends_at = now() - interval '1s' where status = 'seek'; select tick();
select tick() as r6;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
select pg_temp.set_coins(id, 5000) from profiles where email_key in ('bo@x.com', 'cy@x.com', 'ada@gmail.com');
update profiles set level = 1 where email_key = 'cy@x.com';
do $$ begin
  perform join_round((select id from profiles where email_key='bo@x.com'),'hider');
  perform join_round((select id from profiles where email_key='cy@x.com'),'hider');
  perform join_round((select id from profiles where email_key='ada@gmail.com'),'seeker');
end $$;
update rounds set join_ends_at = now() - interval '1s' where status='join'; select tick();
do $$
declare b uuid := (select id from profiles where email_key='bo@x.com'); c uuid := (select id from profiles where email_key='cy@x.com');
        a uuid := (select id from profiles where email_key='ada@gmail.com'); r bigint := (select id from rounds where status='seek');
        res jsonb; bot_tile int;
begin
  update entries set tile = 100 where round_id = r and user_id = b;
  update entries set tile = 200 where round_id = r and user_id = c;
  res := move_hider(c, 201); raise notice 'cy (level 1) first move ok: %', res->>'moved_to';
  begin perform move_hider(c, 202); raise exception 'should fail'; exception when others then raise notice 'ok move limit: %', sqlerrm; end;
  -- A sweep that spots someone: 60 s pin, 90 s recharge.
  res := sweep(a, 201, 1); raise notice 'sweep found %, cooldown %, freeze %', res->>'found', res->>'cooldown', res->>'freeze';
  update entries set last_sweep_at = now() - interval '30 seconds' where round_id = r and user_id = a;
  begin perform sweep(a, 0, 1); raise exception 'should fail'; exception when others then raise notice 'ok long recharge: %', sqlerrm; end;
  -- Catch everyone (bot included): the round keeps going.
  update profiles set level = 12 where id = b;
  res := search_tile(a, 100); raise notice 'catch bo: %', res->>'result';
  raise notice 'caught detail has user and level: %', (select detail->'hiders'->0 ?& array['user','level'] from events where round_id = r and kind = 'caught' order by id desc limit 1);
  perform search_tile(a, 201);
  select tile into bot_tile from entries where round_id = r and user_id = '00000000-0000-0000-0000-00000000b07a';
  perform search_tile(a, bot_tile);
  raise notice 'everyone caught, round still %', (select status from rounds where id = r);
end $$;
update rounds set seek_ends_at = now() - interval '1s' where status='seek'; select tick();
select gap_before, (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')) as gap_after from books;  -- must be equal
