\set ON_ERROR_STOP on
-- Run part 17 again: it must be safe to re-run (and earlier tests re-run part 16).
\ir ../017_world_events.sql
-- Round 7 (part 17): world events and twists, event rewards, the bot's last words, the world
-- ending when every ghost is caught, level-based passive income, ride chat rooms.
create temp table books7 as select
  (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles)
   + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')) as gap_before;
update game_settings set value = 0 where key = 'search_cooldown_seconds';
update game_settings set value = 0 where key = 'move_cooldown_seconds';
update game_settings set value = 1 where key = 'ghost_moves_level_1';
update rounds set seek_ends_at = now() - interval '1s' where status = 'seek'; select tick();
select tick() as r7;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
select pg_temp.set_coins(id, 20000) from profiles where email_key in ('bo@x.com', 'cy@x.com', 'ada@gmail.com');
update profiles set level = 1 where email_key in ('bo@x.com', 'cy@x.com');
do $$ begin
  perform join_round((select id from profiles where email_key='bo@x.com'),'hider');
  perform join_round((select id from profiles where email_key='cy@x.com'),'hider');
  perform join_round((select id from profiles where email_key='ada@gmail.com'),'seeker');
end $$;
update rounds set join_ends_at = now() - interval '1s' where status='join'; select tick();
select count(*) between 1 and 5 as events_planned from world_events where round_id = (select id from rounds where status = 'seek');
do $$
declare b uuid := (select id from profiles where email_key='bo@x.com'); c uuid := (select id from profiles where email_key='cy@x.com');
        a uuid := (select id from profiles where email_key='ada@gmail.com'); r bigint := (select id from rounds where status='seek');
        bot uuid := '00000000-0000-0000-0000-00000000b07a'; res jsonb; ev bigint; coins_before numeric;
begin
  delete from world_events where round_id = r;  -- control the events from here on
  update entries set tile = 100 where round_id = r and user_id = b;
  update entries set tile = 300 where round_id = r and user_id = c;
  update entries set tile = 410 where round_id = r and user_id = bot;
  update profiles set free_search_day = current_date where id = a;
  -- Blackout: no searching in the area.
  insert into world_events (round_id, key, tile, radius, starts_at, ends_at) values (r, 'blackout_district', 50, 2, now() - interval '1 minute', now() + interval '1 minute');
  begin perform search_tile(a, 50); raise exception 'should fail'; exception when others then raise notice 'ok blackout: %', sqlerrm; end;
  -- Lucky street: free searches in the area.
  insert into world_events (round_id, key, tile, radius, starts_at, ends_at) values (r, 'lucky_street', 200, 1, now() - interval '1 minute', now() + interval '1 minute');
  res := search_tile(a, 200); raise notice 'lucky street search cost: %', res->>'cost';
  -- Safe house: bo can't be found while it lasts.
  insert into world_events (round_id, key, tile, radius, starts_at, ends_at) values (r, 'safe_house', 100, 1, now() - interval '1 minute', now() + interval '1 minute');
  res := search_tile(a, 100); raise notice 'search in safe house: %', res->>'result';
  delete from world_events where round_id = r and key = 'safe_house';
  -- Double coins + bounty on bo.
  insert into world_events (round_id, key, tile, starts_at, ends_at) values (r, 'double_coins', 0, now() - interval '1 minute', now() + interval '1 minute');
  insert into world_events (round_id, key, tile, starts_at, ends_at, detail) values (r, 'bounty_board', 0, now() - interval '1 minute', now() + interval '1 minute', jsonb_build_object('user', b, 'name', 'bo'));
  res := search_tile(a, 100); raise notice 'catch bo with double coins + bounty: % reward %', res->>'result', res->>'reward';
  -- Amnesty: cy (level 1, one move) gets a free extra move.
  insert into world_events (round_id, key, tile, starts_at, ends_at) values (r, 'ghost_amnesty', 0, now() - interval '1 minute', now() + interval '1 minute');
  res := move_hider(c, 301); raise notice 'amnesty move 1 fee %', res->>'fee';
  res := move_hider(c, 302); raise notice 'amnesty move 2 fee %', res->>'fee';
  begin perform move_hider(c, 303); raise exception 'should fail'; exception when others then raise notice 'ok amnesty only one extra: %', sqlerrm; end;
  -- Event rewards: first come, first served, once each.
  insert into world_events (round_id, key, tile, starts_at, ends_at, reward_coins, reward_slots) values (r, 'treasure_chest', 5, now() - interval '1 minute', now() + interval '1 minute', 50, 1) returning id into ev;
  raise notice 'claim treasure: %', claim_world_event(a, ev);
  begin perform claim_world_event(b, ev); raise exception 'should fail'; exception when others then raise notice 'ok too late: %', sqlerrm; end;
  -- Catch the rest: the bot speaks, and the world ends.
  perform search_tile(a, 302);
  perform search_tile(a, 410);
  raise notice 'bot last words: %', (select body from chat_messages where round_id = r and sender_id = bot and room = '*' order by id desc limit 1) is not null;
  raise notice 'world ended when everyone was caught: %', (select status from rounds where id = r);
  -- Ride rooms are valid chat rooms.
  raise notice 'ride rooms ok: %', chat_room_ok('v:train:0') and chat_room_ok('v:car:12') and not chat_room_ok('v:plane:1');
  -- Passive income grows with level: level 5 refills to 200 and earns up to 200 a day.
  perform pg_temp.set_coins(a, 0);
  update profiles set level = 5, passive_at = now() - interval '2 days' where id = a;
  update ledger set created_at = now() - interval '3 days' where user_id = a and kind = 'passive';
  raise notice 'level 5 passive top-up: %', accrue_passive(a);
end $$;
select gap_before, (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles)
   + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')) as gap_after
from books7;  -- must be equal
