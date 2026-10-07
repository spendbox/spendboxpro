\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- Ads and sponsored pools (parts 10 and 13). Runs on a fresh database after 001…013.
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
-- (Part 13 replaced "slots of views" with coin pools; game-db/tests/ads2.test.sql covers ads in
-- detail. These are the basics, so the sponsor checks below run on a realistic database.)
insert into ads (id, brand, headline, image_path, contact_name, contact_email, amount_kobo, paystack_reference,
                 policy_accepted_at, coins_total)
values ('00000000-0000-0000-0000-0000000000a1', 'Brand A', 'Hello A', 'a.png', 'Ann', 'a@x.com', 500000, 'ad-a1', now(), 1000),
       ('00000000-0000-0000-0000-0000000000a2', 'Brand B', 'Hello B', 'b.png', 'Ben', 'b@x.com', 500000, 'ad-a2', now(), 1000);

select pg_temp.check((select count(*) from ad_serve(10)) = 0, 'unpaid ads are never served');
select pg_temp.check((ad_paid('ad-a1', 100))->>'status' = 'pending_payment', 'a short payment leaves the ad unpaid');
select pg_temp.check((ad_paid('ad-a1', 500000))->>'status' = 'live', 'paying puts the ad live');
select pg_temp.check((select ends_at - starts_at from ads where paystack_reference = 'ad-a1') = interval '7 days', 'live ad gets its week');
select pg_temp.check((select count(*) from ad_serve(10)) = 1, 'only live ads are served');

do $$
declare u uuid := (select id from profiles where email_key = 'ad1@x.com'); res jsonb; before numeric;
begin
  before := (select coins from profiles where id = u);
  res := ad_open('00000000-0000-0000-0000-0000000000a1', u, 'v1');
  perform pg_temp.check((res->>'coins')::numeric = 5, 'a tap pays 5 coins from the pool: ' || res::text);
  res := ad_open('00000000-0000-0000-0000-0000000000a1', u, 'v1');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'already_today', 'once per ad per day');
  res := ad_open('00000000-0000-0000-0000-0000000000a1', null, 'v9');
  perform pg_temp.check((res->>'coins')::numeric = 0 and res->>'reason' = 'signed_out', 'visitors without an account get no coins');
  perform pg_temp.check((select coins from profiles where id = u) = before + 5, 'player got 5 coins');
  begin
    perform ad_open('00000000-0000-0000-0000-0000000000a2', u, 'v1');
    raise exception 'should fail';
  exception when others then
    perform pg_temp.check(sqlerrm like '%isn''t showing%', 'an unpaid ad cannot be opened');
  end;
end $$;
select pg_temp.check((select sum(amount) from ledger where kind = 'ad_reward') = 5, 'ad rewards are counted as created coins');
select pg_temp.check(pg_temp.books(), 'coin books balance after ad rewards');

-- Bad data is refused by the table itself.
do $$ begin
  begin
    insert into ads (brand, headline, image_path, contact_name, contact_email, amount_kobo, paystack_reference, policy_accepted_at, link_url)
    values ('X', 'Y', 'x.png', 'X', 'x@x.com', 1, 'ad-bad', now(), 'http://insecure.com');
    raise exception 'should fail';
  exception when check_violation then perform pg_temp.check(true, 'http links refused'); end;
  begin
    insert into ads (brand, headline, image_path, contact_name, contact_email, amount_kobo, paystack_reference, policy_accepted_at)
    values ('X', repeat('y', 61), 'x.png', 'X', 'x@x.com', 1, 'ad-bad', now());
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

select (select sum(created) - sum(burned) from coin_supply_daily) as created_minus_burned,
       (select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
         + (select coalesce(sum(pool), 0) from rounds where status <> 'done') as held_plus_pools;
