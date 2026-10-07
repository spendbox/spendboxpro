\set ON_ERROR_STOP on
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
select id, tile_count, hiders_total from rounds where status <> 'done';           -- 410, 2
update rounds set join_ends_at = now() - interval '1s' where status='join'; select tick();
do $$ declare b uuid := (select id from profiles where email_key='bo@x.com'); t int; res jsonb;
begin
  select tile into t from entries where user_id=b and round_id=2;
  res := move_hider(b, (t+5) % 410); raise notice 'move1: %', res;
  res := move_hider(b, (t+6) % 410); raise notice 'move2: %', res;
  begin perform move_hider(b, (t+7) % 410); raise exception 'should fail'; exception when others then raise notice 'ok: %', sqlerrm; end;
  begin perform move_hider('00000000-0000-0000-0000-00000000b07a', 0); raise exception 'should fail'; exception when others then raise notice 'ok bot: %', sqlerrm; end;
  res := sweep((select id from profiles where email_key='cy@x.com'), (t+6) % 410, 1); raise notice 'sweep: %', res;
end $$;
select events.kind, count(*) from events group by 1;
update rounds set seek_ends_at = now() - interval '1s' where status='seek'; select tick();
select id, status, pool from rounds order by id;
select (select sum(created) - sum(burned) from coin_supply_daily) as created_minus_burned,
       (select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') as held;
select coalesce(username, email_key) who, coins, bonus_coins, hider_rounds, seeker_rounds from profiles order by 1;
