\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- Coin-pool ads and advertiser accounts (part 13). Runs on a fresh database after 001…013.
-- Since part 22, looking at an ad (ad_open) is always a free view and pays nothing; the paid
-- view is a tap on the ad's button (ad_cta), so the reward checks below tap the button.
insert into auth.users (email) values ('p1@ads2.com'), ('p2@ads2.com'), ('p3@ads2.com'), ('p4@ads2.com'),
                                      ('p5@ads2.com'), ('p6@ads2.com'), ('p7@ads2.com');

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- Coin books: created − burned = coins held + open round pools. (Earlier test files may leave
-- their own known gap, so this checks the gap never changes while ads run.)
create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - (select sum(coins + bonus_coins) from profiles)
       - (select value from game_state where key = 'carry')
       - (select coalesce(sum(pool), 0) from rounds where status <> 'done')
$$;
create temp table books_start as select pg_temp.gap() as gap;
create function pg_temp.books() returns boolean language sql as $$
  select pg_temp.gap() = (select gap from books_start)
$$;

create function pg_temp.u(p_email text) returns uuid language sql as $$
  select id from profiles where email_key = p_email
$$;

-- A paid, live ad with a pool of p_coins (₦5 a coin), owned by p_adv.
create function pg_temp.ad(p_id text, p_adv uuid, p_coins numeric, p_weeks int default 1) returns uuid language plpgsql as $$
declare v_id uuid := ('00000000-0000-0000-0000-' || lpad(p_id, 12, '0'))::uuid;
begin
  insert into ads (id, brand, headline, image_path, contact_name, contact_email, amount_kobo, paystack_reference,
                   policy_accepted_at, advertiser_id, weeks, coins_total)
  values (v_id, 'Brand ' || p_id, 'Hello ' || p_id, p_id || '.png', 'Ann', 'ann@brand.com', (p_coins * 500)::bigint,
          'ad-test-' || p_id, now(), p_adv, p_weeks, p_coins);
  perform ad_paid('ad-test-' || p_id, (p_coins * 500)::bigint);
  return v_id;
end $$;

select pg_temp.check(pg_temp.books(), 'books balance at the start');

-- ============================================================ settings
select pg_temp.check((select count(*) from game_settings where key in ('ad_coins_per_ngn', 'ad_view_reward', 'ad_rewards_per_day',
  'ad_min_weekly_ngn', 'ad_max_weeks', 'ad_max_ngn', 'ad_free_opens_hourly', 'ad_link_days', 'ad_session_days')) = 9,
  'every ad number is a setting');
select pg_temp.check(setting('ad_coins_per_ngn') = 0.2 and setting('ad_view_reward') = 5 and setting('ad_rewards_per_day') = 5,
  'default numbers: 1 coin per ₦5, 5 coins a tap, 5 taps a day');

-- ============================================================ advertiser accounts
do $$
declare a uuid; b uuid;
begin
  a := advertiser_for_email('  Ann@Brand.com ', 'Ann', '0801');
  b := advertiser_for_email('ann@brand.com', 'Somebody Else', '0999');
  perform pg_temp.check(a = b, 'one advertiser per email (case and spaces ignored)');
  perform pg_temp.check((select name = 'Ann' and phone = '0801' and email = 'ann@brand.com' from advertisers where id = a),
    'someone using the same email can''t change the name or phone');
end $$;

-- ============================================================ paying puts the ad live
do $$
declare v uuid := advertiser_for_email('ann@brand.com'); res jsonb;
begin
  insert into ads (id, brand, headline, image_path, contact_name, contact_email, amount_kobo, paystack_reference,
                   policy_accepted_at, advertiser_id, weeks, coins_total)
  values ('00000000-0000-0000-0000-000000000001', 'Brand 1', 'Hello 1', '1.png', 'Ann', 'ann@brand.com', 1000000,
          'ad-test-1', now(), v, 2, 2000);
  perform pg_temp.check(not exists (select 1 from ad_serve(40) where id = '00000000-0000-0000-0000-000000000001'),
    'unpaid ad is never served');
  res := ad_paid('ad-test-1', 500);
  perform pg_temp.check(res->>'status' = 'pending_payment' and (res->>'newly_paid')::boolean = false, 'a short payment is ignored');
  res := ad_paid('ad-test-1', 1000000);
  perform pg_temp.check(res->>'status' = 'live' and (res->>'newly_paid')::boolean, 'payment puts the ad live at once (no review)');
  res := ad_paid('ad-test-1', 1000000);
  perform pg_temp.check((res->>'newly_paid')::boolean = false, 'a second confirmation changes nothing');
  perform pg_temp.check((select coins_total = 2000 and coins_left = 2000 and paused = false
                           and ends_at - starts_at = interval '14 days' from ads where id = '00000000-0000-0000-0000-000000000001'),
    '₦10,000 loads 2,000 coins and runs for its 2 weeks');
  perform pg_temp.check(exists (select 1 from ad_serve(40) where id = '00000000-0000-0000-0000-000000000001'), 'live ad is served');
  perform pg_temp.check((ad_paid('nope', 1))->>'found' = 'false', 'unknown reference');
end $$;
select pg_temp.check((select coalesce(sum(amount), 0) from ledger where kind = 'ad_reward')
  = (select coalesce(sum(coins), 0) from ad_open_rewards), 'paying creates no coins up front (only paid taps do)');
select pg_temp.check(pg_temp.books(), 'books balance after an ad is paid');

-- ============================================================ taps: rewards, limits, free views
do $$
declare
  v uuid := advertiser_for_email('ann@brand.com');
  p1 uuid := pg_temp.u('p1@ads2.com');
  ad1 uuid := '00000000-0000-0000-0000-000000000001';
  res jsonb;
  before numeric := (select coins from profiles where id = pg_temp.u('p1@ads2.com'));
begin
  res := ad_open(ad1, null, 'watcher1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'signed_out' and (res->>'left_today')::int = 0,
    'a watcher without an account gets no coins: ' || res::text);
  perform pg_temp.check((select coins_left = 2000 and free_views = 1 and rewarded_views = 0 from ads where id = ad1),
    'a watcher''s tap is a free view: nothing leaves the pool');

  res := ad_open(ad1, p1, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and (res->>'reward')::numeric = 5 and res->>'reason' is null,
    'a player''s look pays nothing (the button would pay 5): ' || res::text);
  res := ad_cta(ad1, p1, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 5 and (res->>'left_today')::int = 4 and res->>'reason' is null,
    'a player''s tap on the button pays 5 coins: ' || res::text);
  perform pg_temp.check((select coins from profiles where id = p1) = before + 5, 'the player got the 5 coins');
  perform pg_temp.check((select coins_left = 1995 and rewarded_views = 1 from ads where id = ad1), '5 coins came out of the ad''s pool');
  perform pg_temp.check((select views = 1 and free_views = 2 and opens = 2 from ad_daily where ad_id = ad1 and day = current_date),
    'today''s numbers: 1 rewarded view (the button), 2 free views (both looks)');

  res := ad_cta(ad1, p1, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'already_today' and (res->>'left_today')::int = 4,
    'the same ad pays once a day: ' || res::text);
  res := ad_open(ad1, p1, 'v-p1');
  perform pg_temp.check((select coins_left = 1995 and free_views = 3 from ads where id = ad1) and res->>'reason' = 'already_today',
    'a second look is free');

  -- Daily cap: 5 paid taps a day, across ads.
  for i in 2..6 loop perform pg_temp.ad(i::text, v, 1000); end loop;
  for i in 2..5 loop
    res := ad_cta(('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, p1, 'v-p1');
    perform pg_temp.check((res->>'coins')::numeric = 5 and (res->>'left_today')::int = 5 - i, 'paid tap ' || i || ': ' || res::text);
  end loop;
  res := ad_cta('00000000-0000-0000-0000-000000000006', p1, 'v-p1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'daily_limit' and (res->>'left_today')::int = 0,
    'the 6th paid tap of the day is refused: ' || res::text);
  res := ad_open('00000000-0000-0000-0000-000000000006', p1, 'v-p1');
  perform pg_temp.check((select coins_left = 1000 and free_views = 1 from ads where id = '00000000-0000-0000-0000-000000000006')
                        and res->>'reason' = 'daily_limit', 'a player over the daily limit only gets a free view');
  perform pg_temp.check((select coins from profiles where id = p1) = before + 25, 'the player got 25 coins today in all');

  -- Free views are rate-limited per viewer (5 an hour), so one person can't pump the numbers.
  for i in 1..10 loop perform ad_open('00000000-0000-0000-0000-000000000006', null, 'spammer'); end loop;
  perform pg_temp.check((select free_views from ads where id = '00000000-0000-0000-0000-000000000006') = 6,
    'free views capped at 5 per viewer per hour');

  -- Bots and frozen players never get coins.
  update profiles set frozen = true where id = pg_temp.u('p7@ads2.com');
  res := ad_cta(ad1, pg_temp.u('p7@ads2.com'), 'v-p7');
  perform pg_temp.check((res->>'coins')::numeric = 0, 'a frozen player gets no coins');
  update profiles set frozen = false where id = pg_temp.u('p7@ads2.com');
end $$;
select pg_temp.check(pg_temp.books(), 'books balance after rewards');

-- ============================================================ the pool runs out
do $$
declare v uuid := advertiser_for_email('ann@brand.com'); small uuid; res jsonb;
begin
  small := pg_temp.ad('7', v, 12);  -- 12 coins: pays two taps of 5, then can't pay a third
  perform pg_temp.check(exists (select 1 from ad_serve(40) where id = small), 'small ad is served');
  res := ad_cta(small, pg_temp.u('p2@ads2.com'), 'v2');
  perform pg_temp.check((res->>'coins')::numeric = 5, 'first tap paid');
  res := ad_cta(small, pg_temp.u('p3@ads2.com'), 'v3');
  perform pg_temp.check((res->>'coins')::numeric = 5, 'second tap paid');
  perform pg_temp.check((select status = 'finished' and coins_left = 2 and finished_at is not null from ads where id = small),
    'an ad that can''t pay another reward is finished');
  perform pg_temp.check(not exists (select 1 from ad_serve(40) where id = small), 'a finished ad is never served');
  res := ad_open(small, pg_temp.u('p4@ads2.com'), 'v4');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'pool_empty',
    'a finished ad can still be looked at, but pays nothing: ' || res::text);
  perform pg_temp.check((select free_views = 1 and rewarded_views = 2 from ads where id = small), 'that look is a free view');
  res := ad_cta(small, pg_temp.u('p4@ads2.com'), 'v4');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'pool_empty', 'and its button pays nothing: ' || res::text);
  perform pg_temp.check((select count(*) from ad_serve(1000)) <= 40, 'serve is capped at 40');
end $$;
select pg_temp.check(pg_temp.books(), 'books balance when a pool runs out');

-- ============================================================ time runs out
do $$
declare v uuid := advertiser_for_email('ann@brand.com'); old uuid;
begin
  old := pg_temp.ad('8', v, 500);
  update ads set ends_at = now() - interval '1 minute' where id = old;
  perform pg_temp.check(not exists (select 1 from ad_serve(40) where id = old), 'an ad whose weeks are over is not served');
  perform pg_temp.check((ad_cta(old, pg_temp.u('p5@ads2.com'), 'v5'))->>'reason' = 'pool_empty', 'and pays nothing');
  perform ad_housekeeping();
  perform pg_temp.check((select status from ads where id = old) = 'finished', 'housekeeping finishes it (unused coins expire)');
end $$;

-- ============================================================ pacing
do $$
declare v uuid := advertiser_for_email('ann@brand.com'); big uuid; tiny uuid; n int;
begin
  update ads set paused = true where status = 'live';
  big := pg_temp.ad('9', v, 5000);
  tiny := pg_temp.ad('10', v, 50);
  select count(*) into n from generate_series(1, 400) g, lateral (select id from ad_serve(1)) s where s.id = big;
  perform pg_temp.check(n > 300, 'an ad with more coins to spend is shown more: ' || n || '/400');
  update ads set paused = false where status = 'live' and id not in (big, tiny);
end $$;

-- ============================================================ the advertiser's controls
do $$
declare
  v uuid := advertiser_for_email('ann@brand.com');
  other uuid := advertiser_for_email('bob@other.com', 'Bob');
  ad2 uuid := '00000000-0000-0000-0000-000000000002';
  res jsonb;
begin
  perform pg_temp.check(not ad_set_paused(ad2, other, true), 'someone else can''t pause my ad');
  perform pg_temp.check(ad_set_paused(ad2, v, true), 'I can pause my ad');
  perform pg_temp.check(not exists (select 1 from ad_serve(40) where id = ad2), 'a paused ad is not served');
  res := ad_cta(ad2, pg_temp.u('p6@ads2.com'), 'v6');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'pool_empty', 'a paused ad pays nothing: ' || res::text);
  perform pg_temp.check(ad_set_paused(ad2, v, false), 'I can resume it');
  perform pg_temp.check(exists (select 1 from ad_serve(40) where id = ad2), 'a resumed ad is served again');

  perform pg_temp.check(not ad_edit(ad2, other, 'Hacked', null, false, null), 'someone else can''t edit my ad');
  perform pg_temp.check((select headline from ads where id = ad2) = 'Hello 2', 'and nothing changed');
  perform pg_temp.check(ad_edit(ad2, v, 'New headline', 'https://brand.com/x', false, 'new2.png'), 'I can edit my ad');
  perform pg_temp.check((select headline = 'New headline' and link_url = 'https://brand.com/x' and image_path = 'new2.png'
                           and status = 'live' from ads where id = ad2), 'edits go live straight away');
  perform pg_temp.check(exists (select 1 from ad_retired_images where path = '2.png'), 'the old picture is kept a day, then deleted');
  perform pg_temp.check(ad_edit(ad2, v, null, null, true, null), 'removing the link');
  perform pg_temp.check((select link_url is null and headline = 'New headline' from ads where id = ad2), 'link removed, rest kept');
  begin
    perform ad_edit(ad2, v, null, 'http://insecure.com', false, null);
    raise exception 'should fail';
  exception when check_violation then perform pg_temp.check(true, 'http links refused'); end;
  update ad_retired_images set retired_at = now() - interval '2 days';
  perform pg_temp.check((ad_housekeeping())->'paths' ? '2.png', 'housekeeping hands back the old picture to delete');
end $$;

-- ============================================================ billboard sightings (never billed)
do $$
declare ad3 uuid := '00000000-0000-0000-0000-000000000003'; before numeric := (select coins_left from ads where id = ad3);
begin
  perform ad_track_views(jsonb_build_object(ad3::text, 25, 'junk', 3), 'eyes1');
  perform ad_track_views(jsonb_build_object(ad3::text, 25), 'eyes1');
  perform ad_track_views(jsonb_build_object(ad3::text, 'lots'), 'eyes1');
  perform pg_temp.check((select sightings from ads where id = ad3) = 30, 'sightings capped at 30 per viewer per hour');
  perform ad_track_views(jsonb_build_object(ad3::text, 1000000), 'eyes2');
  perform pg_temp.check((select sightings from ads where id = ad3) = 60, 'absurd counts are capped');
  perform pg_temp.check((select coins_left from ads where id = ad3) = before, 'sightings never take coins');
  perform pg_temp.check((select sightings = 60 and views = 1 from ad_daily where ad_id = ad3 and day = current_date),
    'ad_daily.views is rewarded views only; sightings are separate');
end $$;

-- ============================================================ link clicks
do $$
declare ad4 uuid := '00000000-0000-0000-0000-000000000004';
begin
  for i in 1..3 loop perform ad_click(ad4, 'clicker'); end loop;
  perform pg_temp.check((select clicks from ads where id = ad4) = 0, 'no link, no clicks');
  update ads set link_url = 'https://brand.com' where id = ad4;
  for i in 1..8 loop perform ad_click(ad4, 'clicker'); end loop;
  perform pg_temp.check((select clicks from ads where id = ad4) = 5, 'clicks capped per viewer');
end $$;

-- ============================================================ top-ups
do $$
declare small uuid := '00000000-0000-0000-0000-000000000007'; res jsonb; t0 timestamptz;
begin
  insert into ad_topups (ad_id, coins, weeks, amount_kobo, paystack_reference) values (small, 1000, 0, 500000, 'at-test-1');
  res := ad_topup_paid('at-test-1', 100);
  perform pg_temp.check(res->>'status' = 'pending_payment', 'a short top-up payment is ignored');
  t0 := (select ends_at from ads where id = small);
  res := ad_topup_paid('at-test-1', 500000);
  perform pg_temp.check((res->>'newly_paid')::boolean, 'top-up paid');
  perform pg_temp.check((select status = 'live' and coins_left = 1002 and coins_total = 1012 and ends_at = t0 and finished_at is null
                           from ads where id = small), 'a finished ad is back with its new coins');
  perform pg_temp.check(exists (select 1 from ad_serve(40) where id = small), 'and is served again');
  res := ad_topup_paid('at-test-1', 500000);
  perform pg_temp.check((res->>'newly_paid')::boolean = false and (select coins_left from ads where id = small) = 1002,
    'a second confirmation adds nothing');

  -- An ad whose weeks are over gets at least one more week with a top-up.
  insert into ad_topups (ad_id, coins, weeks, amount_kobo, paystack_reference)
    values ('00000000-0000-0000-0000-000000000008', 1000, 0, 500000, 'at-test-2');
  perform ad_topup_paid('at-test-2', 500000);
  perform pg_temp.check((select status = 'live' and ends_at > now() + interval '6 days' and weeks = 2
                           from ads where id = '00000000-0000-0000-0000-000000000008'), 'time over: a top-up adds a week');
  insert into ad_topups (ad_id, coins, weeks, amount_kobo, paystack_reference) values (small, 1000, 2, 500000, 'at-test-3');
  perform ad_topup_paid('at-test-3', 500000);
  perform pg_temp.check((select ends_at = t0 + interval '14 days' and weeks = 3 from ads where id = small), 'extra weeks extend the run');
end $$;
select pg_temp.check(pg_temp.books(), 'books balance after top-ups');

-- ============================================================ sign-in links and codes
do $$
declare v uuid := advertiser_for_email('ann@brand.com');
begin
  perform advertiser_link_new(v, 'hash-good');
  perform pg_temp.check(advertiser_link_check('hash-good') = v, 'a manage link signs the advertiser in');
  perform pg_temp.check(advertiser_link_check('hash-bad') is null, 'an unknown link does nothing');
  perform pg_temp.check((select expires_at > now() + interval '29 days' from advertiser_links where token_hash = 'hash-good'),
    'links last 30 days');
  update advertiser_links set expires_at = now() - interval '1 second' where token_hash = 'hash-good';
  perform pg_temp.check(advertiser_link_check('hash-good') is null, 'an expired link does nothing');
  perform ad_housekeeping();
  perform pg_temp.check(not exists (select 1 from advertiser_links where token_hash = 'hash-good'), 'expired links are cleared');

  insert into advertiser_codes (email, code_hash, expires_at) values ('ann@brand.com', 'c1', now() + interval '10 minutes');
  perform pg_temp.check(check_advertiser_code('ann@brand.com', 'x') = 'wrong', 'wrong code');
  perform pg_temp.check(check_advertiser_code('ann@brand.com', 'c1') = 'ok', 'right code');
  perform pg_temp.check(check_advertiser_code('ann@brand.com', 'c1') = 'expired', 'a code works once');
  insert into advertiser_codes (email, code_hash, expires_at) values ('ann@brand.com', 'c2', now() + interval '10 minutes');
  for i in 1..4 loop perform check_advertiser_code('ann@brand.com', 'x'); end loop;
  perform pg_temp.check(check_advertiser_code('ann@brand.com', 'x') = 'too_many', '5 wrong tries end a code');
  perform pg_temp.check(check_advertiser_code('ann@brand.com', 'c2') = 'too_many', 'even the right code after that');
  update advertiser_codes set attempts = 0, wrong_total = 15 where email = 'ann@brand.com';
  perform pg_temp.check(check_advertiser_code('ann@brand.com', 'c2') = 'locked', '15 wrong tries a day lock the email');
  perform pg_temp.check(not exists (select 1 from email_codes where email = 'ann@brand.com'), 'players'' codes are untouched');
end $$;

-- ============================================================ nobody else can reach any of this
select pg_temp.check(not has_function_privilege('anon', 'public.ad_open(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.ad_edit(uuid,uuid,text,text,boolean,text)', 'execute')
  and not has_function_privilege('anon', 'public.check_advertiser_code(text,text)', 'execute')
  and has_function_privilege('service_role', 'public.ad_topup_paid(text,bigint)', 'execute'), 'functions are server-only');
select pg_temp.check(not has_table_privilege('anon', 'public.advertisers', 'select')
  and not has_table_privilege('authenticated', 'public.advertiser_links', 'select')
  and not has_table_privilege('anon', 'public.ads', 'select'), 'tables are server-only');

-- ============================================================ coin books
select pg_temp.check((select sum(amount) from ledger where kind = 'ad_reward')
  = (select sum(coins) from ad_open_rewards), 'every reward is in the ledger as created coins');
select pg_temp.check((select sum(coins_total - coins_left) from ads where paystack_reference like 'ad-test-%')
  = (select sum(r.coins) from ad_open_rewards r join ads a on a.id = r.ad_id where a.paystack_reference like 'ad-test-%'),
  'coins out of the pools = coins paid to players');
select pg_temp.check(pg_temp.books(), 'created − burned = coins held + open round pools');
