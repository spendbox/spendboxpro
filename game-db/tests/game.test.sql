\set ON_ERROR_STOP on
-- Faster clocks for the test (the real game waits longer between searches and moves).
update game_settings set value = 0 where key = 'search_cooldown_seconds';
update game_settings set value = 60 where key = 'move_cooldown_seconds';
insert into auth.users (email) values ('Ada@gmail.com'),('bo@x.com'),('cy@x.com'),('a.da+2@gmail.com');
select email_key, coins, is_bot from profiles order by email_key nulls first;   -- alias gets 0 coins
-- Round 1: only the bot hides; a new player seeks and finds it.
select tick() as r1;
select tile_count, hiders_total from rounds;                                      -- 400, 1
do $$ begin
  begin perform join_round((select id from profiles where email_key='bo@x.com'),'hider'); raise exception 'should fail';
  exception when others then raise notice 'ok: %', sqlerrm; end;
  perform join_round((select id from profiles where email_key='bo@x.com'),'seeker');
end $$;
update rounds set join_ends_at = now() - interval '1s'; select tick() as r1_seek;
do $$ declare u uuid := (select id from profiles where email_key='bo@x.com'); t int := (select tile from entries where user_id='00000000-0000-0000-0000-00000000b07a'); res jsonb;
begin
  res := search_tile(u, (t + 1) % 400); raise notice 'miss: %', res;   -- free first search
  res := search_tile(u, (t + 1) % 400); raise notice 'again: %', res;  -- already searched
  res := search_tile(u, t);             raise notice 'bot: %', res;    -- bounty
end $$;
select id, status from rounds;                                                    -- done (all hiders caught)
-- Round 2: bo (now a seeker veteran) hides, cy seeks.
select tick() as r2;
do $$ begin
  perform join_round((select id from profiles where email_key='bo@x.com'),'hider');
  perform join_round((select id from profiles where email_key='cy@x.com'),'seeker');
end $$;
select id, tile_count, hiders_total from rounds where status <> 'done';           -- 420, 2
update rounds set join_ends_at = now() - interval '1s' where status='join'; select tick();
do $$ declare b uuid := (select id from profiles where email_key='bo@x.com'); c uuid := (select id from profiles where email_key='cy@x.com'); t int; x int; res jsonb;
begin
  select tile into t from entries where user_id=b and round_id=2;
  res := move_hider(b, (t+5) % 420); raise notice 'move1 (costs 100): %', res;
  begin perform move_hider(b, (t+6) % 420); raise exception 'should fail'; exception when others then raise notice 'ok cooldown: %', sqlerrm; end;
  update entries set last_move_at = now() - interval '2 minutes' where user_id = b and round_id = 2;
  begin perform move_hider(b, t); raise exception 'should fail'; exception when others then raise notice 'ok no going back: %', sqlerrm; end;
  res := move_hider(b, (t+6) % 420); raise notice 'move2: %', res;
  res := sweep(c, (t+6) % 420, 1); raise notice 'sweep: %', res;
  raise notice 'hider warned of sweep: %', (select last_swept_at is not null from entries where user_id = b and round_id = 2);
  begin perform sweep(c, 0, 1); raise exception 'should fail'; exception when others then raise notice 'ok sweep cooldown: %', sqlerrm; end;
  -- The bot runs when swept.
  update entries set last_swept_at = now() where user_id = '00000000-0000-0000-0000-00000000b07a' and round_id = 2;
  raise notice 'bot: %', tick();
  -- Walking into a searched tile gets you caught by whoever searched it.
  x := (t + 50) % 420;
  if exists (select 1 from entries where round_id = 2 and tile = x) then x := (t + 51) % 420; end if;
  res := search_tile(c, x); raise notice 'cy searches %: %', x, res->>'result';
  raise notice 'search again (allowed): %', search_tile(c, x)->>'searched_before';
  update entries set last_move_at = now() - interval '2 minutes' where user_id = b and round_id = 2;
  begin perform move_hider(b, x); raise exception 'should fail'; exception when others then raise notice 'ok frozen or blocked: %', sqlerrm; end;
  update entries set frozen_until = null where user_id = b and round_id = 2;
  begin perform move_hider(b, x); raise exception 'should fail'; exception when others then raise notice 'ok searched spot blocked: %', sqlerrm; end;
  -- Drone trap: cy's sweep around a spot keeps watching; bo moves into it.
  update entries set last_sweep_at = null where user_id = c and round_id = 2;
  perform sweep(c, (t + 120) % 420, 1);
  update entries set last_move_at = now() - interval '2 minutes', frozen_until = null where user_id = b and round_id = 2;
  res := move_hider(b, (t + 120) % 420); raise notice 'bo moves into the trap: %', res;
  raise notice 'notifications: %', (select string_agg(kind, ',' order by id) from notifications);
end $$;
select events.kind, count(*) from events group by 1;
update rounds set seek_ends_at = now() - interval '1s' where status='seek'; select tick();
select id, status, pool from rounds order by id;
select (select sum(created) - sum(burned) from coin_supply_daily) as created_minus_burned,
       (select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') as held;
select coalesce(username, email_key) who, coins, bonus_coins, hider_rounds, seeker_rounds from profiles order by 1;
-- City layout: the database spiral must match the app's (src/lib/city/layout.ts).
select spiral_xy(0) as t0, spiral_xy(1) as t1, spiral_xy(24) as t24, spiral_xy(399) as t399, spiral_xy(1234) as t1234;
-- expect {0,0} {1,0} {2,-2} {-9,10} {18,-8}
select count(*) as distinct_positions from (select distinct spiral_xy(g) from generate_series(0, 4999) g) x;  -- 5000
-- Chat: a public message and a private one, both tied to the current round.
insert into chat_messages (round_id, sender_id, sender_name, sender_role, body)
  select max(id), (select id from profiles where email_key='bo@x.com'), 'bo', 'hider', 'hello city' from rounds;
insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, body)
  select max(id), (select id from profiles where email_key='bo@x.com'), 'bo', 'hider', (select id from profiles where email_key='cy@x.com'), 'cy', 'psst' from rounds;
select sender_role, recipient_name, body from chat_messages order by id;
select value as tiles_per_hider from game_settings where key = 'tiles_per_hider';  -- 20
-- Round 3: the bot teases in chat (time-travel the round), names on moves, badges, balloons.
select tick() as r3;
update rounds set join_ends_at = now() - interval '1s' where status = 'join'; select tick();
update rounds set join_ends_at = now() - interval '50 minutes' where status = 'seek';
select bot_tease(max(id)) as tease1, bot_tease(max(id)) as tease2, bot_tease(max(id)) as tease3 from rounds;
select sender_name, body from chat_messages where sender_id = '00000000-0000-0000-0000-00000000b07a';
select detail->>'name' as mover from events where kind = 'moved' order by id desc limit 2;
select badge, detail from badges order by id;
do $$ declare u uuid := (select id from profiles where email_key='ada@gmail.com'); begin
  raise notice 'balloon: %', claim_balloon(u, 1);
  begin perform claim_balloon(u, 1); raise exception 'should fail'; exception when others then raise notice 'ok same balloon: %', sqlerrm; end;
end $$;
select count_visit(), count_visit();
select (select sum(created) - sum(burned) from coin_supply_daily) as created_minus_burned,
       (select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done') as held;
-- Badge collection (part 8): new badges are handed out, career ones only once, never to the bot.
select coalesce(pr.username, pr.email_key) who, b.round_id, b.badge, b.detail
  from badges b join profiles pr on pr.id = b.user_id order by b.round_id, who, b.badge;
do $$ declare bo uuid := (select id from profiles where email_key='bo@x.com'); begin
  if not exists (select 1 from badges where user_id = bo and round_id = 1 and badge = 'the_closer') then
    raise exception 'bo should be The Closer in round 1 (found the bot, the last hider)'; end if;
  if not exists (select 1 from badges where user_id = bo and round_id = 1 and badge = 'quick_draw') then
    raise exception 'bo should have Quick Draw in round 1'; end if;
  if not exists (select 1 from badges where user_id = bo and round_id = 2 and badge = 'close_shave') then
    raise exception 'bo should have Close Shave in round 2 (swept, still got away)'; end if;
  if (select count(*) from badges where user_id = bo and badge = 'welcome') <> 1 then
    raise exception 'Welcome to the City should be won exactly once'; end if;
  if (select count(*) from badges where badge = 'welcome') <> 2 then
    raise exception 'bo and cy (the two players so far) should each have Welcome'; end if;
  if exists (select 1 from badges where user_id = '00000000-0000-0000-0000-00000000b07a') then
    raise exception 'the bot must never get badges'; end if;
  if award_badges(1) <> 0 then raise exception 'awarding a round twice should add nothing'; end if;
  raise notice 'ok badges: % kinds handed out', (select count(distinct badge) from badges);
end $$;
