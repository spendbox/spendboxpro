-- HIDE & SEEK, part 13: ads paid for with a coin pool, and advertiser accounts.
-- Run once in Supabase → SQL Editor, after 012_age_codes.sql.
-- Safe to run again: it only adds what is missing and replaces functions.
--
-- How ads work now:
--   * An advertiser picks a weekly budget (from ₦5,000) and 1–8 weeks. What they pay loads the
--     ad with a COIN POOL: 1 coin per ₦5 (ad_coins_per_ngn = 0.2).
--   * A player who taps a billboard to look at the ad gets 5 coins (ad_view_reward) out of that
--     pool. Each player can earn this at most 5 times a day (ad_rewards_per_day), and only once
--     per ad per day. These paid taps are the "views" the advertiser pays for.
--   * Taps by people who get no coins (watchers without an account, players over their daily
--     limit, a second look the same day) are counted as FREE views: nothing leaves the pool.
--     Link clicks are counted too. Billboards simply being on screen ("seen on billboards")
--     are counted for interest only and never cost anything.
--   * An ad stops showing when its pool can't pay another reward or its weeks are over.
--     Coins left at the end just expire (they were never created, see below).
--   * No automatic picture check: an ad goes live as soon as Paystack confirms the payment.
--
-- Coin books: the pool is only a budget counter on the ad. Coins are created (ledger kind
-- 'ad_reward') at the moment a player is paid, exactly as before, so coin_supply_daily
-- stays correct and unused pool coins never existed.
--
-- Advertisers get an account from their email the first time they book (separate from
-- players). They manage their ads at /advertiser, signing in with a link from any of our
-- emails or a 4-digit email code.
--
-- Sponsored prize pools (part 10) keep working for anything already paid, but the website no
-- longer sells new ones. Several paid sponsors queue: one per round, in order.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('ad_coins_per_ngn',     0.2,      'Coins loaded into an ad''s pool per naira paid (0.2 = 1 coin per ₦5)'),
  ('ad_view_reward',       5,        'Coins a signed-in player gets from an ad''s pool for tapping it'),
  ('ad_rewards_per_day',   5,        'Most paid ad taps per player per day (and only once per ad per day)'),
  ('ad_min_weekly_ngn',    5000,     'Smallest weekly ad budget in naira (also the smallest top-up)'),
  ('ad_max_weeks',         8,        'Most weeks one ad can run for'),
  ('ad_max_ngn',           10000000, 'Largest single ad payment in naira'),
  ('ad_free_opens_hourly', 5,        'Most taps one viewer can add to one ad''s numbers per hour'),
  ('ad_link_days',         30,       'Days a "Manage your ad" email link keeps working'),
  ('ad_session_days',      30,       'Days an advertiser stays signed in on a device')
on conflict (key) do nothing;

-- ============================================================ advertisers
create table if not exists public.advertisers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 200),
  name text,
  phone text,
  created_at timestamptz not null default now()
);

-- "Manage your ad" links. Only a fingerprint (sha-256) of each link's secret is stored.
create table if not exists public.advertiser_links (
  token_hash text primary key,
  advertiser_id uuid not null references public.advertisers (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists advertiser_links_expiry_idx on public.advertiser_links (expires_at);

-- 4-digit sign-in codes for advertisers (kept apart from the players' email_codes).
create table if not exists public.advertiser_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_count int not null default 1,
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  wrong_total int not null default 0,
  wrong_window_started_at timestamptz not null default now()
);

-- Finds or makes the advertiser for an email. Name and phone are filled in only if missing,
-- so someone typing another person's email can't change their details.
create or replace function public.advertiser_for_email(p_email text, p_name text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  insert into public.advertisers (email, name, phone) values (v_email, nullif(trim(p_name), ''), nullif(trim(p_phone), ''))
    on conflict (email) do update
      set name = coalesce(public.advertisers.name, excluded.name),
          phone = coalesce(public.advertisers.phone, excluded.phone)
    returning id into v_id;
  return v_id;
end $$;

-- Saves a new "Manage your ad" link (the server makes the secret and passes its fingerprint).
create or replace function public.advertiser_link_new(p_advertiser uuid, p_hash text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_exp timestamptz := now() + make_interval(days => public.setting('ad_link_days')::int);
begin
  insert into public.advertiser_links (token_hash, advertiser_id, expires_at) values (p_hash, p_advertiser, v_exp)
    on conflict (token_hash) do nothing;
  return v_exp;
end $$;

-- Who a link belongs to (null when it's unknown or has expired).
create or replace function public.advertiser_link_check(p_hash text) returns uuid
language sql stable security definer set search_path = public as $$
  select advertiser_id from public.advertiser_links where token_hash = p_hash and expires_at > now()
$$;

-- Same rules as the players' check_email_code (game-db/012): 5 wrong tries per code, codes
-- last 10 minutes (the server sets expires_at), at most 15 wrong tries per email a day, all
-- in one locked step. Answers: 'ok', 'wrong', 'expired', 'too_many' or 'locked'.
create or replace function public.check_advertiser_code(p_email text, p_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.advertiser_codes;
begin
  select * into c from public.advertiser_codes where email = p_email for update;
  if not found then return 'expired'; end if;
  if c.wrong_window_started_at < now() - interval '24 hours' then
    update public.advertiser_codes set wrong_total = 0, wrong_window_started_at = now() where email = p_email;
    c.wrong_total := 0;
  end if;
  if c.wrong_total >= 15 then return 'locked'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'too_many'; end if;
  if c.code_hash = p_hash then
    delete from public.advertiser_codes where email = p_email;
    return 'ok';
  end if;
  update public.advertiser_codes set attempts = attempts + 1, wrong_total = wrong_total + 1 where email = p_email;
  return case when c.attempts + 1 >= 5 then 'too_many' else 'wrong' end;
end $$;

-- ============================================================ ads: new columns
-- Ads are no longer sold in slots of views, so those two columns are now optional.
alter table public.ads alter column slots drop not null;
alter table public.ads alter column views_bought drop not null;

alter table public.ads add column if not exists advertiser_id uuid references public.advertisers (id) on delete set null;
alter table public.ads add column if not exists weeks int check (weeks is null or weeks between 1 and 52);
alter table public.ads add column if not exists coins_total numeric(14,2);
alter table public.ads add column if not exists coins_left numeric(14,2) not null default 0 check (coins_left >= 0);
alter table public.ads add column if not exists paused boolean not null default false;
alter table public.ads add column if not exists rewarded_views int not null default 0;
alter table public.ads add column if not exists free_views int not null default 0;
create index if not exists ads_advertiser_idx on public.ads (advertiser_id, created_at desc);

-- "Seen on billboards" used to be views_delivered; give it a clear name (moved once).
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'ads' and column_name = 'sightings') then
    alter table public.ads add column sightings bigint not null default 0;
    update public.ads set sightings = views_delivered;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'ad_daily' and column_name = 'sightings') then
    alter table public.ad_daily add column sightings int not null default 0;
    alter table public.ad_daily add column free_views int not null default 0;
    -- ad_daily.views now means paid (rewarded) taps; the old numbers were billboard sightings.
    update public.ad_daily set sightings = views, views = 0;
  end if;
end $$;

-- Top-ups: more budget (and optionally more weeks) for an ad that's running or finished.
create table if not exists public.ad_topups (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads (id) on delete cascade,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid')),
  coins numeric(14,2) not null check (coins > 0),
  weeks int not null default 0 check (weeks between 0 and 52),
  amount_kobo bigint not null check (amount_kobo > 0),
  paystack_reference text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ad_topups_ad_idx on public.ad_topups (ad_id, created_at);

-- Old pictures replaced by an edit are deleted a day later (games may still be showing them).
create table if not exists public.ad_retired_images (
  path text primary key,
  retired_at timestamptz not null default now()
);

-- ============================================================ moving old ads over
-- Every ad gets an advertiser account from its contact email.
insert into public.advertisers (email, name, phone)
select distinct on (lower(contact_email)) lower(contact_email), contact_name, contact_phone
from public.ads where contact_email ~ '@'
order by lower(contact_email), created_at
on conflict (email) do nothing;
update public.ads a set advertiser_id = v.id
from public.advertisers v where a.advertiser_id is null and v.email = lower(a.contact_email);

-- Old "slots of views" ads become coin-pool ads (once: only rows with no pool yet).
--   * Paid ads still waiting for the old picture check go live now, with their full pool.
--   * Live ads keep the part of their pool they haven't used (the share of views not yet
--     delivered) and get at least 7 more days to use it.
--   * Finished, rejected and unpaid ads get a pool for the record (empty unless unpaid).
update public.ads set
  coins_total = floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn')),
  weeks = coalesce(weeks, 1),
  coins_left = case
    when status in ('paid', 'reviewing', 'held') then floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn'))
    when status = 'live' then floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn')
                                    * greatest(coalesce(views_bought, 0) - views_delivered, 0)
                                    / greatest(coalesce(views_bought, 1), 1))
    else 0 end,
  ends_at = case when status = 'live' then greatest(coalesce(ends_at, now()), now() + interval '7 days') else ends_at end
where coins_total is null;

-- ============================================================ the ad's clock and finish line
-- Going live starts the ad's weeks. An ad that can't pay another reward is finished.
create or replace function public.ads_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    if new.starts_at is null then new.starts_at := now(); end if;
    if new.ends_at is null then
      new.ends_at := new.starts_at + make_interval(days => 7 * coalesce(new.weeks, 1));
    end if;
  end if;
  if new.status = 'live' and new.coins_total is not null and new.coins_left < public.setting('ad_view_reward') then
    new.status := 'finished';
  end if;
  if new.status = 'finished' and new.finished_at is null then new.finished_at := now(); end if;
  if new.status = 'live' then new.finished_at := null; end if;
  return new;
end $$;
drop trigger if exists ads_before_update on public.ads;
create trigger ads_before_update before update on public.ads
  for each row execute function public.ads_before_update();

-- Paid ads that were waiting for the old picture check go live now (their weeks start now).
update public.ads set status = 'live' where status in ('paid', 'reviewing', 'held') and paid_at is not null;
-- Live ads whose pool can't pay another reward are finished.
update public.ads set status = 'finished'
  where status = 'live' and coins_total is not null and coins_left < public.setting('ad_view_reward');

-- ============================================================ serving ads
-- True when an ad can pay a reward right now.
create or replace function public.ad_is_paying(a public.ads) returns boolean
language sql stable set search_path = public as $$
  select a.status = 'live' and not a.paused and a.coins_left >= public.setting('ad_view_reward')
     and coalesce(a.starts_at, now()) <= now() and (a.ends_at is null or a.ends_at > now())
$$;

-- A weighted random pick of up to p_n paying ads, without repeats. Weight = coins left ÷ hours
-- left (at least 1 hour), so every ad spends its pool evenly over its weeks.
create or replace function public.ad_serve(p_n int)
returns table (id uuid, image_path text, headline text, brand text, link_url text)
language sql volatile security definer set search_path = public as $$
  select a.id, a.image_path, a.headline, a.brand, a.link_url
  from public.ads a
  where public.ad_is_paying(a)
  order by -ln(greatest(random(), 1e-12))
           / (a.coins_left::float8
              / greatest(extract(epoch from (coalesce(a.ends_at, now()) - now())) / 3600.0, 1.0))
  limit greatest(0, least(coalesce(p_n, 24), 40))
$$;

-- "Seen on billboards": p_views is {"<ad id>": count, ...}. Never costs the advertiser
-- anything. Each viewer adds at most ad_viewer_hourly_cap sightings per ad per hour.
create or replace function public.ad_track_views(p_views jsonb, p_viewer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cap int := public.setting('ad_viewer_hourly_cap')::int;
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(p_viewer, 128);
  v_counted int := 0;
  v_ad uuid;
  v_want int;
  v_old int;
  v_add int;
  x record;
begin
  if p_views is null or jsonb_typeof(p_views) <> 'object' or coalesce(p_viewer, '') = '' then
    return jsonb_build_object('counted', 0);
  end if;
  for x in select key, value from jsonb_each(p_views) order by key limit 40 loop
    continue when x.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    continue when jsonb_typeof(x.value) <> 'number';
    v_want := least(greatest(floor((x.value #>> '{}')::numeric), 0), v_cap)::int;
    continue when v_want <= 0;
    v_ad := x.key::uuid;
    continue when not exists (select 1 from public.ads a where a.id = v_ad and a.status = 'live');

    insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, v_ad, v_hour) on conflict do nothing;
    select b.views into v_old from public.ad_view_buckets b
      where b.viewer = v_viewer and b.ad_id = v_ad and b.hour = v_hour for update;
    v_add := least(v_want, v_cap - v_old);
    continue when v_add <= 0;
    update public.ad_view_buckets b set views = b.views + v_add
      where b.viewer = v_viewer and b.ad_id = v_ad and b.hour = v_hour;
    update public.ads a set sightings = a.sightings + v_add where a.id = v_ad;
    insert into public.ad_daily (ad_id, day, sightings) values (v_ad, current_date, v_add)
      on conflict (ad_id, day) do update set sightings = public.ad_daily.sightings + excluded.sightings;
    v_counted := v_counted + v_add;
  end loop;
  return jsonb_build_object('counted', v_counted);
end $$;

-- Someone tapped a billboard to look at the ad.
--   * A signed-in player gets ad_view_reward coins from the ad's pool: once per ad per day,
--     at most ad_rewards_per_day times a day, and only while the pool can pay. That's a
--     rewarded view: the thing advertisers pay for.
--   * Anyone else (or a player who can't be paid) is a free view: counted, costs nothing.
--     Free views and opens count at most ad_free_opens_hourly times per viewer per ad per hour.
-- Returns { coins, left_today, reason } where reason is null when paid, otherwise
-- 'signed_out', 'daily_limit', 'already_today' or 'pool_empty'.
create or replace function public.ad_open(p_ad uuid, p_user uuid default null, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(coalesce(nullif(p_viewer, ''), 'anon'), 128);
  v_reward numeric := public.setting('ad_view_reward');
  v_per_day int := public.setting('ad_rewards_per_day')::int;
  v_hourly int := coalesce(public.setting('ad_free_opens_hourly'), 5)::int;
  v_today int := 0;
  v_paid numeric := 0;
  v_reason text;
  v_opens int;
  v_signed boolean := false;
  p public.profiles;
  a public.ads;
begin
  if not exists (select 1 from public.ads where id = p_ad and status in ('live', 'finished')) then
    raise exception 'That ad isn''t showing any more';
  end if;

  if p_user is not null then
    -- Lock order everywhere: the player first, then the ad.
    select * into p from public.profiles where id = p_user for update;
    v_signed := found and not p.is_bot and not p.frozen;
  end if;

  if not v_signed then
    v_reason := 'signed_out';
  else
    select count(*) into v_today from public.ad_open_rewards where user_id = p_user and day = current_date;
    if exists (select 1 from public.ad_open_rewards where user_id = p_user and ad_id = p_ad and day = current_date) then
      v_reason := 'already_today';
    elsif v_today >= v_per_day then
      v_reason := 'daily_limit';
    else
      select * into a from public.ads where id = p_ad for update;
      if v_reward <= 0 or not public.ad_is_paying(a) then
        v_reason := 'pool_empty';
      else
        insert into public.ad_open_rewards (user_id, ad_id, day, coins) values (p_user, p_ad, current_date, v_reward);
        -- (The ads trigger marks the ad finished once its pool can't pay another reward.)
        update public.ads set coins_left = coins_left - v_reward, rewarded_views = rewarded_views + 1, opens = opens + 1
          where id = p_ad;
        insert into public.ad_daily (ad_id, day, views, opens) values (p_ad, current_date, 1, 1)
          on conflict (ad_id, day) do update set views = public.ad_daily.views + 1, opens = public.ad_daily.opens + 1;
        update public.profiles set coins = coins + v_reward where id = p_user;
        perform public.log_coins(p_user, null, 'ad_reward', v_reward, false, 'Looked at an ad');
        v_paid := v_reward;
        v_today := v_today + 1;
      end if;
    end if;
  end if;

  if v_paid = 0 then
    -- A free view, limited per viewer so one person can't pump the numbers.
    insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, p_ad, v_hour) on conflict do nothing;
    update public.ad_view_buckets set opens = opens + 1
      where viewer = v_viewer and ad_id = p_ad and hour = v_hour
      returning opens into v_opens;
    if v_opens <= v_hourly then
      update public.ads set free_views = free_views + 1, opens = opens + 1 where id = p_ad;
      insert into public.ad_daily (ad_id, day, free_views, opens) values (p_ad, current_date, 1, 1)
        on conflict (ad_id, day) do update set free_views = public.ad_daily.free_views + 1, opens = public.ad_daily.opens + 1;
    end if;
  end if;

  return jsonb_build_object('coins', v_paid, 'reason', v_reason,
    'left_today', case when v_signed then greatest(v_per_day - v_today, 0) else 0 end);
end $$;

-- Someone followed the ad's link (at most 5 counted per viewer per ad per hour).
create or replace function public.ad_click(p_ad uuid, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(coalesce(nullif(p_viewer, ''), 'anon'), 128);
  v_clicks int;
begin
  if not exists (select 1 from public.ads where id = p_ad and status in ('live', 'finished') and link_url is not null) then
    return jsonb_build_object('counted', false);
  end if;
  insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, p_ad, v_hour) on conflict do nothing;
  update public.ad_view_buckets set clicks = clicks + 1
    where viewer = v_viewer and ad_id = p_ad and hour = v_hour
    returning clicks into v_clicks;
  if v_clicks > 5 then return jsonb_build_object('counted', false); end if;
  update public.ads set clicks = clicks + 1 where id = p_ad;
  insert into public.ad_daily (ad_id, day, clicks) values (p_ad, current_date, 1)
    on conflict (ad_id, day) do update set clicks = public.ad_daily.clicks + 1;
  return jsonb_build_object('counted', true);
end $$;

-- ============================================================ paying
-- Paystack confirmed a payment for this ad. The first confirmation fills the pool and puts the
-- ad live (newly_paid = true, so the caller sends the emails once). Safe to call many times.
create or replace function public.ad_paid(p_reference text, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.ads; v_new boolean := false;
begin
  select * into a from public.ads where paystack_reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if a.status = 'pending_payment' then
    if p_amount_kobo < a.amount_kobo then
      return jsonb_build_object('found', true, 'id', a.id, 'status', a.status, 'newly_paid', false, 'short', true);
    end if;
    update public.ads set status = 'live', paid_at = now(),
           coins_total = coalesce(coins_total, floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn'))),
           coins_left = coalesce(coins_total, floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn')))
      where id = a.id
      returning * into a;
    v_new := true;
  end if;
  return jsonb_build_object('found', true, 'id', a.id, 'status', a.status, 'newly_paid', v_new,
    'advertiser_id', a.advertiser_id);
end $$;

-- Paystack confirmed a top-up. Adds the coins (and weeks) once. If the ad's time is over, it
-- gets at least one more week, so the new coins can be used.
create or replace function public.ad_topup_paid(p_reference text, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.ad_topups; a public.ads; v_weeks int; v_new boolean := false;
begin
  select * into t from public.ad_topups where paystack_reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  select * into a from public.ads where id = t.ad_id for update;
  if t.status = 'pending_payment' then
    if p_amount_kobo < t.amount_kobo then
      return jsonb_build_object('found', true, 'id', t.id, 'ad_id', t.ad_id, 'status', t.status, 'newly_paid', false, 'short', true);
    end if;
    v_weeks := t.weeks;
    if v_weeks = 0 and (a.ends_at is null or a.ends_at < now() + interval '1 day') then v_weeks := 1; end if;
    update public.ad_topups set status = 'paid', paid_at = now(), weeks = v_weeks where id = t.id;
    update public.ads set
      coins_total = coalesce(coins_total, 0) + t.coins,
      coins_left = coins_left + t.coins,
      weeks = coalesce(weeks, 1) + v_weeks,
      ends_at = case when v_weeks > 0 then greatest(coalesce(ends_at, now()), now()) + make_interval(days => 7 * v_weeks)
                     else ends_at end,
      status = case when status in ('live', 'finished') then 'live' else status end,
      final_report_at = null
    where id = a.id
    returning * into a;
    t.status := 'paid';
    v_new := true;
  end if;
  return jsonb_build_object('found', true, 'id', t.id, 'ad_id', t.ad_id, 'status', t.status, 'newly_paid', v_new,
    'advertiser_id', a.advertiser_id, 'coins', t.coins);
end $$;

-- ============================================================ advertiser changes
-- Changes the headline, link and/or picture of the advertiser's own ad (null = keep). Goes
-- live straight away. Returns false when the ad isn't theirs.
create or replace function public.ad_edit(p_ad uuid, p_advertiser uuid, p_headline text, p_link text, p_clear_link boolean,
                                          p_image_path text)
returns boolean language plpgsql security definer set search_path = public as $$
declare a public.ads;
begin
  select * into a from public.ads where id = p_ad and advertiser_id = p_advertiser and status <> 'pending_payment' for update;
  if not found then return false; end if;
  if p_image_path is not null and p_image_path <> a.image_path then
    insert into public.ad_retired_images (path) values (a.image_path) on conflict do nothing;
  end if;
  update public.ads set
    headline = coalesce(nullif(trim(p_headline), ''), headline),
    link_url = case when p_clear_link then null else coalesce(p_link, link_url) end,
    image_path = coalesce(p_image_path, image_path)
  where id = p_ad;
  return true;
end $$;

-- Pauses or resumes the advertiser's own ad. (The weeks keep counting while paused.)
create or replace function public.ad_set_paused(p_ad uuid, p_advertiser uuid, p_paused boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.ads set paused = p_paused where id = p_ad and advertiser_id = p_advertiser and status <> 'pending_payment';
  return found;
end $$;

-- ============================================================ upkeep
-- Finishes ads whose weeks are over, clears old rate-limit rows, unpaid checkouts, expired
-- links and codes, and returns picture paths that can now be deleted from storage.
create or replace function public.ad_housekeeping() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_paths text[]; v_buckets int; v_finished int;
begin
  update public.ads set status = 'finished' where status = 'live' and ends_at < now();
  get diagnostics v_finished = row_count;
  delete from public.ad_view_buckets where hour < now() - interval '3 hours';
  get diagnostics v_buckets = row_count;
  delete from public.ad_topups where status = 'pending_payment' and created_at < now() - interval '3 days';
  delete from public.advertiser_links where expires_at < now();
  delete from public.advertiser_codes where last_sent_at < now() - interval '2 days';
  with gone as (
    delete from public.ads where status = 'pending_payment' and created_at < now() - interval '3 days'
    returning image_path
  ), gone_sponsors as (
    delete from public.pool_sponsors where status = 'pending_payment' and created_at < now() - interval '3 days'
    returning logo_path
  ), retired as (
    delete from public.ad_retired_images r where r.retired_at < now() - interval '1 day'
      and not exists (select 1 from public.ads a where a.image_path = r.path)
    returning path
  )
  select coalesce(array_agg(p) filter (where p is not null), '{}') into v_paths
  from (select image_path p from gone union all select logo_path from gone_sponsors union all select path from retired) x;
  return jsonb_build_object('buckets_cleared', v_buckets, 'finished', v_finished, 'paths', to_jsonb(v_paths));
end $$;

-- ============================================================ privacy & access
alter table public.advertisers enable row level security;
alter table public.advertiser_links enable row level security;
alter table public.advertiser_codes enable row level security;
alter table public.ad_topups enable row level security;
alter table public.ad_retired_images enable row level security;
do $$
declare t text;
begin
  foreach t in array array['ads', 'ad_daily', 'ad_view_buckets', 'ad_open_rewards', 'pool_sponsors', 'advertisers',
                           'advertiser_links', 'advertiser_codes', 'ad_topups', 'ad_retired_images'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('ads_before_update', 'ad_is_paying', 'ad_serve', 'ad_track_views', 'ad_open', 'ad_click', 'ad_paid',
            'ad_set_review', 'ad_topup_paid', 'ad_edit', 'ad_set_paused', 'ad_housekeeping',
            'advertiser_for_email', 'advertiser_link_new', 'advertiser_link_check', 'check_advertiser_code',
            'sponsor_apply', 'sponsor_paid', 'rounds_take_sponsor')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
