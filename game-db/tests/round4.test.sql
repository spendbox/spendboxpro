\set ON_ERROR_STOP on
-- Round 4 (part 7): empty pool at the start, shields, the 80/10/10 split, passive income.
update rounds set seek_ends_at = now() - interval '1s' where status = 'seek'; select tick() as r3_done;
select tick() as r4;
select pool as r4_starting_pool, (select coins from profiles where is_bot) as bot_coins from rounds where status = 'join';  -- 0, 0
-- Set balances through the ledger (as a top-up) so the coin books still balance.
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
select pg_temp.set_coins(id, 1000) from profiles where email_key in ('bo@x.com', 'cy@x.com', 'ada@gmail.com');
update profiles set level = 5 where email_key = 'bo@x.com';  -- shields unlock at level 5 (part 9)
do $$ begin
  perform join_round((select id from profiles where email_key='bo@x.com'),'hider');
  perform join_round((select id from profiles where email_key='cy@x.com'),'hider');
  perform join_round((select id from profiles where email_key='ada@gmail.com'),'seeker');
end $$;
update rounds set join_ends_at = now() - interval '1s' where status='join'; select tick();
do $$
declare b uuid := (select id from profiles where email_key='bo@x.com'); c uuid := (select id from profiles where email_key='cy@x.com');
        a uuid := (select id from profiles where email_key='ada@gmail.com'); r bigint := (select id from rounds where status='seek');
        bt int; ct int; res jsonb;
begin
  -- Keep the bot well away from the action.
  select tile into bt from entries where round_id = r and user_id = b;
  select tile into ct from entries where round_id = r and user_id = c;
  update entries set tile = (select g from generate_series(0, 439) g where g not in (bt, ct) and not in_area(g, bt, 8) limit 1)
    where round_id = r and user_id = '00000000-0000-0000-0000-00000000b07a';
  res := buy_shield(b); raise notice 'shield: %', res;
  begin perform buy_shield(b); raise exception 'should fail'; exception when others then raise notice 'ok one shield: %', sqlerrm; end;
  begin perform move_hider(b, (bt + 1) % 440); raise exception 'should fail'; exception when others then raise notice 'ok shield blocks moving: %', sqlerrm; end;
  res := search_tile(a, bt); raise notice 'search shielded bo: % / %', res->>'result', res->>'reward';
  raise notice 'bo still in: caught=%, moved=%, stake=%', (select caught from entries where round_id=r and user_id=b),
    (select tile <> bt from entries where round_id=r and user_id=b), (select stake from entries where round_id=r and user_id=b);
  raise notice 'notices: %', (select string_agg(kind, ',' order by id) from notifications where round_id = r);
  res := search_tile(a, ct); raise notice 'search cy: % / %', res->>'result', res->>'reward';
  -- bo can move again now the shield is spent.
  res := move_hider(b, (select g from generate_series(0, 439) g
                        where g not in (select tile from entries where round_id = r and tile is not null)
                          and not exists (select 1 from searches s where s.round_id = r and s.tile = g)
                          and not (g = any(coalesce((select visited from entries where round_id = r and user_id = b), '{}'::int[])))
                        limit 1));
  raise notice 'bo moves after shield: %', res->>'fee';
end $$;
select pool as pool_before_finish from rounds where status = 'seek';
update rounds set seek_ends_at = now() - interval '1s' where status='seek'; select tick();
-- bo survived: 80% to bo, 10% to ada, 10% burns.
select coalesce(p.username, p.email_key) who, l.kind, l.amount from ledger l join profiles p on p.id = l.user_id
  where l.round_id = (select max(id) from rounds where status = 'done') and l.kind in ('pool_hider', 'pool_seeker', 'stake_return') order by 2, 1;
select amount as bank_burn from ledger where kind = 'burn' and note = 'bank' and round_id = (select max(id) from rounds where status = 'done');
-- Passive income: 12 hours at 0 coins → 50 coins; asking again straight away → nothing; never above 100.
do $$ declare a uuid := (select id from profiles where email_key='ada@gmail.com'); begin
  perform pg_temp.set_coins(a, 0); update profiles set passive_at = now() - interval '12 hours' where id = a;
  raise notice 'passive after 12h: %', accrue_passive(a);
  raise notice 'passive again: %', accrue_passive(a);
  perform pg_temp.set_coins(a, 90); update profiles set passive_at = now() - interval '3 days' where id = a;
  raise notice 'passive capped by 24h limit: %', accrue_passive(a);
  update ledger set created_at = now() - interval '2 days' where user_id = a and kind = 'passive';
  update profiles set passive_at = now() - interval '3 days' where id = a;
  raise notice 'passive tops up to 100: % (coins %)', accrue_passive(a), (select coins from profiles where id = a);
end $$;
select (select sum(created) - sum(burned) from coin_supply_daily) as created_minus_burned,
       (select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done') as held;
