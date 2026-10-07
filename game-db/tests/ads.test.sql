\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- Ads and sponsored pools (part 10). Runs on a fresh database after 001…010.
insert into auth.users (email) values ('ad1@x.com'), ('ad2@x.com');

-- A helper that fails the run when something is wrong.
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;

-- Ends whatever round is running and starts a fresh one (in its hiding window).
create function pg_temp.new_round() returns bigint language plpgsql as $$
declare r rounds;
begin
  for i in 1..5 loop
    select * into r from rounds where status <> 'done';
    exit when not found;
    if r.status = 'join' then update rounds set join_ends_at = now() - interval '1s' where id = r.id;
    else update rounds set seek_ends_at = now() - interval '1s' where id = r.id; end if;
    perform tick();
  end loop;
  perform tick();
  return (select id from rounds where status = 'join');
end $$;

create function pg_temp.books() returns boolean language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       = (select sum(coins + bonus_coins) from profiles)
         + (select value from game_state where key = 'carry')
         + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
$$;

-- ============================================================ ads
insert into ads (id, brand, headline, image_path, contact_name, contact_email, slots, views_bought, amount_kobo,
                 paystack_reference, policy_accepted_at)
values ('00000000-0000-0000-0000-0000000000a1', 'Brand A', 'Hello A', 'a.png', 'Ann', 'a@x.com', 1, 100, 500000, 'ad-a1', now()),
       ('00000000-0000-0000-0000-0000000000a2', 'Brand B', 'Hello B', 'b.png', 'Ben', 'b@x.com', 1, 100, 500000, 'ad-a2', now()),
       ('00000000-0000-0000-0000-0000000000a3', 'Brand C', 'Hello C', 'c.png', 'Cy',  'c@x.com', 1, 100, 500000, 'ad-a3', now());

select pg_temp.check((select count(*) from ad_serve(10)) = 0, 'unpaid ads are never served');

-- Paying: short payments don't count; the first caller claims the review, later callers don't.
select pg_temp.check((ad_paid('ad-a1', 100))->>'status' = 'pending_payment', 'a short payment leaves the ad unpaid');
select pg_temp.check((ad_paid('ad-a1', 500000))->>'claimed' = 'true', 'first confirmation claims the review');
select pg_temp.check((ad_paid('ad-a1', 500000))->>'claimed' = 'false', 'second confirmation does not re-run the review');
select pg_temp.check((ad_paid('nope', 500000))->>'found' = 'false', 'unknown reference');
select pg_temp.check(ad_set_review('00000000-0000-0000-0000-0000000000a1', 'live', 'ok') = 'live', 'review approves');
select pg_temp.check((select ends_at - starts_at from ads where paystack_reference = 'ad-a1') = interval '7 days', 'live ad gets a 7-day window');
select ad_paid('ad-a2', 500000);
select pg_temp.check(ad_set_review('00000000-0000-0000-0000-0000000000a2', 'rejected', 'gambling') = 'rejected', 'review rejects');
select pg_temp.check(ad_set_review('00000000-0000-0000-0000-0000000000a2', 'live', 'x') = 'rejected', 'a rejected ad cannot be flipped by a late review');
select ad_paid('ad-a3', 500000);
select ad_set_review('00000000-0000-0000-0000-0000000000a3', 'held', 'no key');
-- The owner approves a held ad in the Table Editor: its window starts then.
update ads set status = 'live' where paystack_reference = 'ad-a3';
select pg_temp.check((select starts_at is not null and ends_at is not null from ads where paystack_reference = 'ad-a3'), 'owner approval starts the window');

select pg_temp.check((select count(*) from ad_serve(10)) = 2, 'only live ads are served');
select pg_temp.check(not exists (select 1 from ad_serve(10) where brand = 'Brand B'), 'rejected ad never served');
select pg_temp.check((select count(*) from ad_serve(1000)) <= 40, 'serve is capped at 40');

-- Pacing: an ad far behind schedule is picked much more often than one nearly done.
update ads set views_delivered = 95 where paystack_reference = 'ad-a3';
select pg_temp.check(
  (select count(*) from generate_series(1, 400) g, lateral (select brand from ad_serve(1)) s where s.brand = 'Brand A') > 300,
  'behind-schedule ad gets most of the views');
update ads set views_delivered = 0 where paystack_reference = 'ad-a3';

-- Views: capped at 30 per viewer per ad per hour, junk ignored.
select ad_track_views('{"00000000-0000-0000-0000-0000000000a1": 25, "not-a-uuid": 5, "00000000-0000-0000-0000-0000000000a2": 10}', 'viewer1');
select ad_track_views('{"00000000-0000-0000-0000-0000000000a1": 25}', 'viewer1');
select ad_track_views('{"00000000-0000-0000-0000-0000000000a1": "lots"}', 'viewer1');
select pg_temp.check((select views_delivered from ads where paystack_reference = 'ad-a1') = 30, 'one viewer adds at most 30 views an hour');
select pg_temp.check((select views_delivered from ads where paystack_reference = 'ad-a2') = 0, 'rejected ad gets no views');
select ad_track_views('{"00000000-0000-0000-0000-0000000000a1": 1000000}', 'viewer2');
select pg_temp.check((select views_delivered from ads where paystack_reference = 'ad-a1') = 60, 'absurd counts are capped');
select pg_temp.check((select views from ad_daily where ad_id = '00000000-0000-0000-0000-0000000000a1' and day = current_date) = 60, 'daily views recorded');
-- Delivering every view finishes the ad.
select ad_track_views('{"00000000-0000-0000-0000-0000000000a1": 30}', 'viewer3');
select ad_track_views('{"00000000-0000-0000-0000-0000000000a1": 30}', 'viewer4');
select pg_temp.check((select status = 'finished' and views_delivered = 100 and finished_at is not null from ads where paystack_reference = 'ad-a1'),
  'ad is finished once all views are delivered (never over-delivered)');
select pg_temp.check(not exists (select 1 from ad_serve(10) where brand = 'Brand A'), 'finished ad never served');

-- Opens: coins for signed-in players, once per ad per day, 10 a day at most.
update game_settings set value = 2 where key = 'ad_open_rewards_per_day';
insert into ads (id, brand, headline, image_path, contact_name, contact_email, slots, views_bought, amount_kobo,
                 paystack_reference, policy_accepted_at, status)
values ('00000000-0000-0000-0000-0000000000a4', 'Brand D', 'Hello D', 'd.png', 'Di', 'd@x.com', 1, 100, 500000, 'ad-a4', now(), 'live'),
       ('00000000-0000-0000-0000-0000000000a5', 'Brand E', 'Hello E', 'e.png', 'Ed', 'e@x.com', 1, 100, 500000, 'ad-a5', now(), 'live');
do $$
declare u uuid := (select id from profiles where email_key = 'ad1@x.com'); res jsonb; before numeric;
begin
  before := (select coins from profiles where id = u);
  res := ad_open('00000000-0000-0000-0000-0000000000a3', u, 'v1');
  perform pg_temp.check((res->>'coins')::numeric = 2 and (res->>'left_today')::int = 1, 'first open pays 2 coins: ' || res::text);
  res := ad_open('00000000-0000-0000-0000-0000000000a3', u, 'v1');
  perform pg_temp.check((res->>'coins')::numeric = 0, 'same ad again the same day pays nothing: ' || res::text);
  res := ad_open('00000000-0000-0000-0000-0000000000a4', u, 'v1');
  perform pg_temp.check((res->>'coins')::numeric = 2 and (res->>'left_today')::int = 0, 'second ad pays: ' || res::text);
  res := ad_open('00000000-0000-0000-0000-0000000000a5', u, 'v1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and (res->>'left_today')::int = 0, 'daily cap reached: ' || res::text);
  res := ad_open('00000000-0000-0000-0000-0000000000a1', u, 'v1');
  perform pg_temp.check((res->>'coins')::numeric = 0, 'finished ad can be opened but pays nothing');
  perform pg_temp.check((select coins from profiles where id = u) = before + 4, 'player got 4 coins');
  res := ad_open('00000000-0000-0000-0000-0000000000a5', null, 'v9');
  perform pg_temp.check((res->>'coins')::numeric = 0, 'visitors without an account get no coins');
  begin
    perform ad_open('00000000-0000-0000-0000-0000000000a2', u, 'v1');
    raise exception 'should fail';
  exception when others then
    perform pg_temp.check(sqlerrm like '%isn''t showing%', 'rejected ad cannot be opened');
  end;
  for i in 1..8 loop perform ad_open('00000000-0000-0000-0000-0000000000a5', null, 'spam'); end loop;
  perform pg_temp.check((select opens from ads where paystack_reference = 'ad-a5') = 7, 'opens capped per viewer (2 earlier + 5): '
    || (select opens from ads where paystack_reference = 'ad-a5'));
  for i in 1..8 loop perform ad_click('00000000-0000-0000-0000-0000000000a5', 'spam'); end loop;
  perform pg_temp.check((select clicks from ads where paystack_reference = 'ad-a5') = 0, 'no link, no clicks');
  update ads set link_url = 'https://example.com' where paystack_reference = 'ad-a5';
  for i in 1..8 loop perform ad_click('00000000-0000-0000-0000-0000000000a5', 'spam'); end loop;
  perform pg_temp.check((select clicks from ads where paystack_reference = 'ad-a5') = 5, 'clicks capped per viewer');
end $$;
select pg_temp.check((select sum(created) from coin_supply_daily) >= 4
  and (select sum(amount) from ledger where kind = 'ad_reward') = 4, 'ad rewards are counted as created coins');
select pg_temp.check(pg_temp.books(), 'coin books balance after ad rewards');

-- Bad data is refused by the table itself.
do $$ begin
  begin
    insert into ads (brand, headline, image_path, contact_name, contact_email, slots, views_bought, amount_kobo, paystack_reference, policy_accepted_at, link_url)
    values ('X', 'Y', 'x.png', 'X', 'x@x.com', 1, 1, 1, 'ad-bad', now(), 'http://insecure.com');
    raise exception 'should fail';
  exception when check_violation then perform pg_temp.check(true, 'http links refused'); end;
  begin
    insert into ads (brand, headline, image_path, contact_name, contact_email, slots, views_bought, amount_kobo, paystack_reference, policy_accepted_at)
    values ('X', repeat('y', 61), 'x.png', 'X', 'x@x.com', 1, 1, 1, 'ad-bad', now());
    raise exception 'should fail';
  exception when check_violation then perform pg_temp.check(true, 'headline over 60 characters refused'); end;
end $$;

-- ============================================================ sponsored pools
select pg_temp.new_round() is not null as fresh_round;
insert into pool_sponsors (id, brand, coins, amount_kobo, paystack_reference, contact_name, contact_email, logo_url)
values ('00000000-0000-0000-0000-0000000005a1', 'Sponsor One', 1000, 500000, 'sp-1', 'S1', 's1@x.com', 'https://x/logo1.png'),
       ('00000000-0000-0000-0000-0000000005a2', 'Sponsor Two', 2000, 1000000, 'sp-2', 'S2', 's2@x.com', null),
       ('00000000-0000-0000-0000-0000000005a3', 'Sponsor Three', 300, 150000, 'sp-3', 'S3', 's3@x.com', null);
select pg_temp.check((sponsor_paid('sp-1', 10))->>'status' = 'pending_payment', 'short sponsor payment ignored');
select pg_temp.check((sponsor_paid('sp-1', 500000))->>'status' = 'applied', 'paid during the hiding window: applied now');
select pg_temp.check((select pool = 1000 and sponsor_name = 'Sponsor One' and sponsor_logo = 'https://x/logo1.png' and sponsor_coins = 1000
  from rounds where status = 'join'), 'pool and sponsor shown on the round');
select pg_temp.check((sponsor_paid('sp-1', 500000))->>'status' = 'applied', 'second confirmation changes nothing');
select pg_temp.check((select pool from rounds where status = 'join') = 1000, 'coins added only once');
select pg_temp.check((sponsor_paid('sp-2', 1000000))->>'status' = 'queued', 'round already sponsored: queued');
select pg_temp.check(pg_temp.books(), 'coin books balance with a sponsored pool');

-- Search phase: a sponsor paid now waits too.
update rounds set join_ends_at = now() - interval '1s' where status = 'join'; select tick();
select pg_temp.check((sponsor_paid('sp-3', 150000))->>'status' = 'queued', 'paid during the hunt: queued');
-- The round ends; the next round takes the oldest waiting sponsor, the round after takes the next.
update rounds set seek_ends_at = now() - interval '1s' where status = 'seek'; select tick();
select pg_temp.check(pg_temp.books(), 'coin books balance after a sponsored round pays out');
select tick();
select pg_temp.check((select sponsor_name = 'Sponsor Two' and pool = 2000 from rounds where status = 'join'), 'next round gets the oldest queued sponsor');
select pg_temp.check((select status from pool_sponsors where paystack_reference = 'sp-3') = 'queued', 'one sponsor per round');
select pg_temp.check(pg_temp.books(), 'coin books balance after a queued sponsor is applied');
select pg_temp.new_round() is not null as fresh_round;
select pg_temp.check((select sponsor_name = 'Sponsor Three' and pool = 300 from rounds where status = 'join'), 'the round after gets the next sponsor');
select pg_temp.check((select count(*) from ledger where kind = 'sponsor' and note like 'Prize pool by Sponsor%') = 3, 'one sponsor ledger row each');
select pg_temp.check(pg_temp.books(), 'coin books balance at the end');

-- Housekeeping clears old unpaid checkouts and returns their files.
update ads set created_at = now() - interval '4 days', status = 'pending_payment' where paystack_reference = 'ad-a2';
select pg_temp.check((ad_housekeeping())->'paths' ? 'b.png', 'old unpaid checkout removed');
update game_settings set value = 10 where key = 'ad_open_rewards_per_day';

select (select sum(created) - sum(burned) from coin_supply_daily) as created_minus_burned,
       (select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
         + (select coalesce(sum(pool), 0) from rounds where status <> 'done') as held_plus_pools;
