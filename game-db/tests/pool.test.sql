\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- Part 22: mint spent during a game goes into the open game's prize pool (burned when no game
-- is open), ads pay for a tap on the ad's button (not for looking), and the final countdown is
-- the last 2 minutes of the hunt.
-- Run part 22 again first: it must be safe to re-run, and earlier tests re-run parts 17 and 20
-- (which hold older copies of what part 22 replaces).
\ir ../022_pool_and_ads.sql

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- Coin books: created − burned = held + open round pools + bets not settled yet + the stakes of
-- ghosts still hiding in an open game. Earlier test files may leave a gap of their own, so this
-- checks the gap never changes during this file.
create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled)
          + (select coalesce(sum(e.stake), 0) from entries e join rounds r on r.id = e.round_id
              where r.status <> 'done' and e.role = 'hider' and not e.caught))
$$;
create temp table books22 as select pg_temp.gap() as gap;
create function pg_temp.books() returns boolean language sql as $$ select pg_temp.gap() = (select gap from books22) $$;

create function pg_temp.u(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.coins(u uuid) returns numeric language sql as $$ select coins from profiles where id = u $$;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
create function pg_temp.pool() returns numeric language sql as $$
  select coalesce((select pool from rounds where status <> 'done'), 0)
$$;
create function pg_temp.burned(p_note text) returns numeric language sql as $$
  select coalesce(sum(amount), 0) from ledger where kind = 'burn' and note = p_note
$$;
create function pg_temp.pooled(p_note text) returns numeric language sql as $$
  select coalesce(sum(amount), 0) from ledger where kind = 'pool_fee' and note = p_note
$$;
-- Plays out whatever game is on (joining or hunting) until it has paid out: no game open.
create function pg_temp.close_games() returns void language plpgsql as $$
declare r rounds;
begin
  for i in 1..6 loop
    select * into r from rounds where status <> 'done';
    exit when not found;
    if r.status = 'join' then update rounds set join_ends_at = now() - interval '1 second' where id = r.id;
    else update rounds set seek_ends_at = now() - interval '1 second' where id = r.id; end if;
    perform tick();
  end loop;
  if exists (select 1 from rounds where status <> 'done') then raise exception 'could not close the open game'; end if;
end $$;

insert into auth.users (email) values ('h1@pool22.test'), ('s1@pool22.test'), ('b1@pool22.test'), ('b2@pool22.test'),
                                      ('p1@pool22.test'), ('p2@pool22.test'), ('p3@pool22.test'), ('p4@pool22.test');
select pg_temp.set_coins(pg_temp.u(e), 3000) from unnest(array['h1@pool22.test', 's1@pool22.test', 'b1@pool22.test',
                                                                 'b2@pool22.test']) e;
-- Known settings for this test (whatever an earlier run left).
update game_settings set value = 20 where key = 'sports_ticket_football';
update game_settings set value = 15 where key in ('sports_ticket_basketball', 'sports_ticket_boxing', 'sports_ticket_wrestling');
update game_settings set value = 10 where key = 'bet_min';
update game_settings set value = 500 where key = 'bet_max';
update game_settings set value = 2000 where key = 'bet_daily_max';
update game_settings set value = 0.10 where key = 'bet_burn_share';
update game_settings set value = 300 where key = 'respawn_price';
update game_settings set value = 0 where key = 'search_cooldown_seconds';
select pg_temp.check(pg_temp.books(), 'books balance at the start');

-- ============================================================ no game open: spending burns, as before
select pg_temp.close_games();
do $$
declare b1 uuid := pg_temp.u('b1@pool22.test'); b2 uuid := pg_temp.u('b2@pool22.test'); res jsonb; c0 numeric;
        ko timestamptz := now() + interval '5 minutes'; opts text[] := array['home', 'draw', 'away'];
begin
  perform pg_temp.check(open_pool_round() is null, 'no game is open');
  c0 := pg_temp.coins(b1);
  res := buy_ticket(b1, 'football:22001');
  perform pg_temp.check((res->>'price')::numeric = 20 and (res->>'to_pool')::boolean = false and pg_temp.coins(b1) = c0 - 20,
    'no game open: a football ticket costs 20 mint: ' || res::text);
  perform pg_temp.check(pg_temp.burned('Sports ticket: football:22001') = 20 and pg_temp.pooled('Sports ticket: football:22001') = 0,
    'no game open: the ticket price burns');

  -- 100 on home, 100 on away; home wins. The 10% cut (20) burns; the winner gets 180.
  perform place_bet(b1, 'football:22002', 'home', 100, ko, opts);
  perform place_bet(b2, 'football:22002', 'away', 100, ko, opts);
  c0 := pg_temp.coins(b1);
  res := settle_match('football:22002', 'home', '1-0', null, opts);
  perform pg_temp.check((res->>'cut')::numeric = 20 and res->>'cut_round' is null and pg_temp.coins(b1) = c0 + 180,
    'no game open: settled, cut 20, winner +180: ' || res::text);
  perform pg_temp.check(pg_temp.burned('Sports house cut: football:22002') = 20 and pg_temp.pooled('Sports house cut: football:22002') = 0,
    'no game open: the house cut burns');
end $$;
select pg_temp.check(pg_temp.books(), 'books balance with no game open');

-- ============================================================ a game is open (joining): spending goes to its pool
select tick();
do $$
declare b1 uuid := pg_temp.u('b1@pool22.test'); b2 uuid := pg_temp.u('b2@pool22.test'); res jsonb; c0 numeric; p0 numeric;
        r bigint := (select id from rounds where status = 'join'); burns0 int;
        ko timestamptz := now() + interval '5 minutes';
begin
  perform pg_temp.check(r is not null and open_pool_round() = r, 'a game is open, in its join window');
  select count(*) into burns0 from ledger where kind = 'burn';
  p0 := pg_temp.pool();
  c0 := pg_temp.coins(b1);
  res := buy_ticket(b1, 'basketball:22003');
  perform pg_temp.check((res->>'price')::numeric = 15 and (res->>'to_pool')::boolean and pg_temp.coins(b1) = c0 - 15,
    'a basketball ticket costs 15 mint: ' || res::text);
  perform pg_temp.check(pg_temp.pool() = p0 + 15, 'the ticket price went into the game''s prize pool');
  perform pg_temp.check((select count(*) = 1 and min(round_id) = r and min(amount) = 15 and bool_and(user_id is null)
                           from ledger where kind = 'pool_fee' and note = 'Sports ticket: basketball:22003'),
    'one pool_fee row (no player) says which game got it');
  perform pg_temp.check((select round_id = r and amount = -15 from ledger where user_id = b1 and kind = 'ticket' and note = 'Ticket: basketball:22003'),
    'the player''s ticket row carries the game''s id');
  res := buy_ticket(b1, 'basketball:22003');
  perform pg_temp.check((res->>'already')::boolean and pg_temp.pool() = p0 + 15 and pg_temp.coins(b1) = c0 - 15,
    'asking again is free and adds nothing');

  -- 300 on home, 100 on away; home wins. The cut (40) goes into the game's pool; home gets 360.
  perform place_bet(b1, 'basketball:22004', 'home', 300, ko, array['home', 'away']);
  perform place_bet(b2, 'basketball:22004', 'away', 100, ko, array['home', 'away']);
  c0 := pg_temp.coins(b1);
  res := settle_match('basketball:22004', 'home', '99-90', null, array['home', 'away']);
  perform pg_temp.check((res->>'cut')::numeric = 40 and (res->>'cut_round')::bigint = r and pg_temp.coins(b1) = c0 + 360,
    'settled: cut 40 to this game, winner +360: ' || res::text);
  perform pg_temp.check(pg_temp.pool() = p0 + 55 and pg_temp.pooled('Sports house cut: basketball:22004') = 40
                        and pg_temp.burned('Sports house cut: basketball:22004') = 0,
    'the sportsbook''s 10% went into the prize pool, not burned');
  res := settle_match('basketball:22004', 'home', '99-90', null, array['home', 'away']);
  perform pg_temp.check((res->>'already')::boolean and pg_temp.pool() = p0 + 55, 'settling again adds nothing');

  -- Everyone on one side: refunded in full, so there's no cut for the pool.
  perform place_bet(b1, 'boxing:22005', 'red', 50, ko, array['red', 'blue']);
  perform place_bet(b2, 'boxing:22005', 'red', 50, ko, array['red', 'blue']);
  res := settle_match('boxing:22005', 'red', 'KO', null, array['red', 'blue']);
  perform pg_temp.check((res->>'refunded')::boolean and (res->>'cut')::numeric = 0 and res->>'cut_round' is null
                        and pg_temp.pool() = p0 + 55, 'a refunded match adds nothing to the pool');

  -- Levelling up is progression, not game spending: it still burns.
  update profiles set seeker_rounds = greatest(seeker_rounds, 10) where id = b2;
  c0 := (select coalesce(sum(amount), 0) from ledger where kind = 'burn' and note = 'level up');
  res := upgrade_level(b2);
  perform pg_temp.check((select coalesce(sum(amount), 0) from ledger where kind = 'burn' and note = 'level up') = c0 + (res->>'cost')::numeric
                        and pg_temp.pool() = p0 + 55, 'level-ups still burn (and leave the pool alone)');
  perform pg_temp.check((select count(*) from ledger where kind = 'burn') = burns0 + 1, 'nothing else burned while the game was open');
end $$;
select pg_temp.check(pg_temp.books(), 'books balance with mint moving into an open pool');

-- ============================================================ respawning (the hunt is on)
update profiles set seeker_rounds = greatest(seeker_rounds, 1), hider_rounds = 10, level = 20 where email_key = 'h1@pool22.test';
select join_round(pg_temp.u('h1@pool22.test'), 'hider') is not null as ghost_joined;
select join_round(pg_temp.u('s1@pool22.test'), 'seeker') is not null as hunter_joined;
update rounds set join_ends_at = now() - interval '1 second' where status = 'join';
select tick();
select pg_temp.check(pg_temp.books(), 'books balance with a ghost''s stake in the game');
do $$
declare h uuid := pg_temp.u('h1@pool22.test'); s uuid := pg_temp.u('s1@pool22.test'); b2 uuid := pg_temp.u('b2@pool22.test');
        r bigint := (select id from rounds where status = 'seek'); res jsonb; c0 numeric; p0 numeric; t int; e entries;
begin
  perform pg_temp.check(r is not null and open_pool_round() = r, 'the hunt is on');
  delete from world_events where round_id = r;  -- no twists (safe houses, blackouts…) in the way
  update profiles set last_search_at = null, search_heat = 0, frozen = false where id = s;
  t := (select tile from entries where round_id = r and user_id = h);
  res := search_tile(s, t);
  perform pg_temp.check(res->>'result' = 'caught', 'the ghost is caught early: ' || res::text);

  p0 := pg_temp.pool();
  c0 := pg_temp.coins(h);
  res := respawn(h);
  perform pg_temp.check((res->>'respawned')::boolean and (res->>'cost')::numeric = 300, 'respawned for 300 mint: ' || res::text);
  perform pg_temp.check(pg_temp.coins(h) = c0 - 300 and pg_temp.pool() = p0 + 300, 'the 300 mint went into the prize pool');
  perform pg_temp.check((select amount = 300 and user_id is null from ledger where kind = 'pool_fee' and note = 'Respawn' and round_id = r)
                        and not exists (select 1 from ledger where kind = 'burn' and round_id = r and note in ('respawn', 'Respawn')),
    'a pool_fee row, and no burn');
  perform pg_temp.check((select amount = -300 from ledger where user_id = h and kind = 'respawn' and round_id = r), 'the player''s respawn row');
  select * into e from entries where round_id = r and user_id = h;
  perform pg_temp.check(e.respawned and not e.caught and e.stake = 0 and e.stake_weight >= 300
                        and e.tile between 0 and (select tile_count - 1 from rounds where id = r)
                        and not exists (select 1 from searches where round_id = r and tile = e.tile),
    'back in hiding on a fresh spot, and what they paid counts towards their share of the pot');
  -- Caught again: no second respawn this game.
  update entries set caught = true, caught_at = now() where round_id = r and user_id = h;
  begin
    perform respawn(h);
    raise exception 'should fail';
  exception when others then
    perform pg_temp.check(sqlerrm like '%once per game%', 'once per game');
  end;
  update entries set caught = false, caught_at = null where round_id = r and user_id = h;

  -- A ticket bought during the hunt goes into the same pool.
  p0 := pg_temp.pool();
  perform buy_ticket(b2, 'wrestling:22006');
  perform pg_temp.check(pg_temp.pool() = p0 + 15, 'tickets during the hunt go into the pool too');
end $$;
select pg_temp.check(pg_temp.books(), 'books balance after a respawn');

-- ============================================================ ads: looking is free, the button pays
-- A paid, live ad with a pool of p_coins (₦5 a mint).
create function pg_temp.ad(p_n int, p_coins numeric, p_link text default null) returns uuid language plpgsql as $$
declare v_id uuid := ('22222222-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid;
begin
  insert into ads (id, brand, headline, link_url, image_path, contact_name, contact_email, amount_kobo, paystack_reference,
                   policy_accepted_at, advertiser_id, weeks, coins_total)
  values (v_id, 'Brand22 ' || p_n, 'Hello ' || p_n, p_link, 'pool22-' || p_n || '.png', 'Ann', 'pool22@brand.test',
          (p_coins * 500)::bigint, 'ad-pool22-' || p_n, now(), advertiser_for_email('pool22@brand.test'), 1, p_coins);
  perform ad_paid('ad-pool22-' || p_n, (p_coins * 500)::bigint);
  return v_id;
end $$;
update game_settings set value = 5 where key = 'ad_view_reward';
update game_settings set value = 5 where key = 'ad_rewards_per_day';
update game_settings set value = 5 where key = 'ad_free_opens_hourly';

do $$
declare p uuid := pg_temp.u('p1@pool22.test'); a1 uuid; a2 uuid; a6 uuid; res jsonb; c0 numeric;
begin
  a1 := pg_temp.ad(1, 1000);                          -- no link: its button says "Thanks, Brand22 1!"
  a2 := pg_temp.ad(2, 1000, 'https://brand22.test/'); -- a link: "Visit Brand22 2"
  c0 := pg_temp.coins(p);

  -- Looking pays nothing, and is a free view.
  res := ad_open(a1, p, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and (res->>'reward')::numeric = 5 and res->>'reason' is null
                        and (res->>'left_today')::int = 5, 'opening an ad pays nothing, but says the button pays 5: ' || res::text);
  perform pg_temp.check(pg_temp.coins(p) = c0 and not exists (select 1 from ledger where user_id = p and kind = 'ad_reward'),
    'no mint for looking');
  perform pg_temp.check((select free_views = 1 and opens = 1 and rewarded_views = 0 and coins_left = 1000 from ads where id = a1),
    'a look is a free view: nothing leaves the ad''s pool');
  res := ad_open(a1, p, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and (res->>'reward')::numeric = 5 and pg_temp.coins(p) = c0,
    'looking again still pays nothing');

  -- The button pays (once per ad per day) and is the paid view.
  res := ad_cta(a1, p, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 5 and res->>'reason' is null and (res->>'left_today')::int = 4
                        and (res->>'clicked')::boolean = false, 'tapping the button pays 5 mint: ' || res::text);
  perform pg_temp.check(pg_temp.coins(p) = c0 + 5, 'the player got the 5 mint');
  perform pg_temp.check((select rewarded_views = 1 and free_views = 2 and coins_left = 995 and clicks = 0 from ads where id = a1),
    '1 paid view, 2 free views, 5 mint out of the ad''s pool');
  perform pg_temp.check((select views = 1 and free_views = 2 and opens = 2 and clicks = 0 from ad_daily where ad_id = a1 and day = current_date),
    'today''s numbers: views = paid button taps');
  perform pg_temp.check((select amount = 5 and note like 'Tapped an ad%' from ledger where user_id = p and kind = 'ad_reward'),
    'the reward is created mint in the ledger');
  res := ad_cta(a1, p, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'already_today' and (res->>'left_today')::int = 4,
    'the same ad''s button pays once a day: ' || res::text);
  res := ad_open(a1, p, 'v-p1');
  perform pg_temp.check((res->>'reward')::numeric = 0 and res->>'reason' = 'already_today', 'and opening it again says so');
  perform pg_temp.check((select coins_left = 995 and rewarded_views = 1 from ads where id = a1), 'nothing more left the pool');

  -- Signed out: looking and tapping are both free.
  res := ad_open(a1, null, 'watcher22');
  perform pg_temp.check((res->>'reward')::numeric = 0 and res->>'reason' = 'signed_out' and (res->>'left_today')::int = 0,
    'a watcher without an account can look: ' || res::text);
  res := ad_cta(a1, null, 'watcher22');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'signed_out', 'and tap the button, for nothing: ' || res::text);

  -- An ad with a link: the button is also a link click.
  res := ad_cta(a2, p, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 5 and (res->>'clicked')::boolean and (res->>'left_today')::int = 3,
    '"Visit" pays and counts a click: ' || res::text);
  perform pg_temp.check((select clicks = 1 and rewarded_views = 1 from ads where id = a2)
                        and (select clicks = 1 and views = 1 from ad_daily where ad_id = a2 and day = current_date),
    'the click is in the ad''s numbers');
  for i in 1..8 loop perform ad_cta(a2, null, 'clicker22'); end loop;
  perform pg_temp.check((select clicks from ads where id = a2) = 6, 'clicks are still capped at 5 per viewer per hour');

  -- The daily cap: 5 paid button taps a day, across ads.
  for i in 3..5 loop
    res := ad_cta(pg_temp.ad(i, 1000), p, 'v-p1');
    perform pg_temp.check((res->>'coins')::numeric = 5 and (res->>'left_today')::int = 5 - i, 'paid tap ' || i || ': ' || res::text);
  end loop;
  a6 := pg_temp.ad(6, 1000);
  res := ad_open(a6, p, 'v-p1');
  perform pg_temp.check((res->>'reward')::numeric = 0 and res->>'reason' = 'daily_limit', 'over the daily cap, opening says so: ' || res::text);
  res := ad_cta(a6, p, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'daily_limit' and (res->>'left_today')::int = 0,
    'the 6th paid tap of the day is refused: ' || res::text);
  perform pg_temp.check((select coins_left = 1000 and rewarded_views = 0 and free_views = 1 from ads where id = a6),
    'a player over the cap costs the advertiser nothing');
  perform pg_temp.check(pg_temp.coins(p) = c0 + 25, 'the player got 25 mint today in all');

  -- Looks are rate-limited per viewer (5 an hour), so one person can't pump the numbers.
  for i in 1..10 loop perform ad_open(a6, null, 'spammer22'); end loop;
  perform pg_temp.check((select free_views from ads where id = a6) = 6, 'free views capped at 5 per viewer per hour');

  -- Frozen players and the bot never get mint.
  update profiles set frozen = true where id = pg_temp.u('p2@pool22.test');
  res := ad_cta(a6, pg_temp.u('p2@pool22.test'), 'v-p2');
  perform pg_temp.check((res->>'coins')::numeric = 0, 'a frozen player gets nothing');
  update profiles set frozen = false where id = pg_temp.u('p2@pool22.test');
  res := ad_cta(a6, '00000000-0000-0000-0000-00000000b07a', 'v-bot');
  perform pg_temp.check((res->>'coins')::numeric = 0, 'nor does the bot');

  begin
    perform ad_cta('22222222-0000-0000-0000-999999999999', p, 'v-p1');
    raise exception 'should fail';
  exception when others then
    perform pg_temp.check(sqlerrm like '%isn''t showing%', 'an unknown ad can''t be tapped');
  end;
end $$;

-- The pool runs out.
do $$
declare small uuid := pg_temp.ad(7, 7); res jsonb;
begin
  res := ad_cta(small, pg_temp.u('p2@pool22.test'), 'v-p2');
  perform pg_temp.check((res->>'coins')::numeric = 5, 'a 7-mint ad pays one tap');
  perform pg_temp.check((select status = 'finished' and coins_left = 2 from ads where id = small), 'then it''s finished');
  res := ad_open(small, pg_temp.u('p3@pool22.test'), 'v-p3');
  perform pg_temp.check((res->>'coins')::numeric = 0 and (res->>'reward')::numeric = 0 and res->>'reason' = 'pool_empty',
    'a finished ad can still be looked at: ' || res::text);
  res := ad_cta(small, pg_temp.u('p3@pool22.test'), 'v-p3');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'pool_empty', 'but its button pays nothing: ' || res::text);
  update ads set paused = true where id = '22222222-0000-0000-0000-000000000006';
  res := ad_cta('22222222-0000-0000-0000-000000000006', pg_temp.u('p4@pool22.test'), 'v-p4');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'pool_empty', 'a paused ad pays nothing');
end $$;
select pg_temp.check((select sum(coins_total - coins_left) from ads where paystack_reference like 'ad-pool22-%')
  = (select sum(r.coins) from ad_open_rewards r join ads a on a.id = r.ad_id where a.paystack_reference like 'ad-pool22-%')
  and (select sum(coins) from ad_open_rewards r join ads a on a.id = r.ad_id where a.paystack_reference like 'ad-pool22-%') = 30,
  'mint out of the ads'' pools = mint paid for button taps (30)');
select pg_temp.check(not has_function_privilege('anon', 'public.ad_cta(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.pool_or_burn(bigint,numeric,text)', 'execute')
  and not has_function_privilege('anon', 'public.open_pool_round()', 'execute')
  and has_function_privilege('service_role', 'public.ad_cta(uuid,uuid,text)', 'execute'), 'the new functions are server-only');
select pg_temp.check(pg_temp.books(), 'books balance after ad rewards');

-- ============================================================ the final countdown: the last 2 minutes
select pg_temp.check((select minutes from world_event_kinds where key = 'final_countdown') = 2, 'the catalog says 2 minutes');
do $$
declare r rounds; w world_events; tries int := 0;
begin
  select * into r from rounds where status = 'seek';
  -- It's planned about a third of the time: plan again until it is.
  loop
    tries := tries + 1;
    delete from world_events where round_id = r.id;
    perform plan_world_events(r.id);
    exit when exists (select 1 from world_events where round_id = r.id and key = 'final_countdown') or tries >= 80;
  end loop;
  select * into w from world_events where round_id = r.id and key = 'final_countdown';
  perform pg_temp.check(found and w.ends_at = r.seek_ends_at and w.starts_at = r.seek_ends_at - interval '2 minutes',
    'the final countdown runs for the last 2 minutes of the hunt (planned after ' || tries || ' tries)');
  perform pg_temp.check(not exists (select 1 from world_events where round_id = r.id and key <> 'final_countdown' and ends_at > w.starts_at),
    'every other event is over before it starts');

  -- A countdown planned before part 22 (the last 5 minutes) moves to the last 2 when part 22 runs.
  delete from world_events where round_id = r.id;
  insert into world_events (round_id, key, tile, starts_at, ends_at)
    values (r.id, 'final_countdown', 0, r.seek_ends_at - interval '5 minutes', r.seek_ends_at);
end $$;
\ir ../022_pool_and_ads.sql
select pg_temp.check((select starts_at = ends_at - interval '2 minutes' from world_events
                       where key = 'final_countdown' and round_id = (select id from rounds where status = 'seek')),
  'an already planned countdown moves to the last 2 minutes');
delete from world_events where round_id = (select id from rounds where status = 'seek');  -- leave no twists behind

-- ============================================================ the game pays out
select pg_temp.close_games();
select pg_temp.check(pg_temp.books(), 'books balance after the game paid out its pool');
select (select gap from books22) as gap_before, pg_temp.gap() as gap_after;  -- must be equal
