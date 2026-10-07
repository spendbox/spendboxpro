-- HIDE & SEEK, part 10: paid billboard ads and sponsored prize pools.
-- Run once in Supabase → SQL Editor, after 009 (or after 008 if there is no 009).
--
-- Billboard ads are sold in "slots": 1 slot = a guaranteed number of billboard views
-- (ad_views_per_slot, 1,000 by default), delivered within ad_days (7) days. Every billboard
-- in every city rotates through the live ads, so what we sell is a share of views, not a
-- number of billboards. Ads are served more often when they are behind schedule (views
-- still to deliver ÷ time left), so every campaign finishes on time. An ad that is late
-- keeps showing until it has had all its views.
--
-- Sponsored pools: a brand pays to add coins to a round's prize pool ("Prize pool by …").
-- One sponsor per round. If the current round is still in its hiding window, the coins go
-- in straight away; otherwise they wait for the next new round.
--
-- Everything here is used by the server only (service_role). Nobody can read these tables
-- from the browser.

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('ad_views_per_slot',        1000, 'Billboard views in one ad slot'),
  ('ad_slot_price_ngn',        5000, 'Price of one ad slot in naira'),
  ('ad_days',                  7,    'Days we promise to deliver an ad''s views in'),
  ('ad_max_slots',             50,   'Most slots one advertiser can buy at once'),
  ('ad_viewer_hourly_cap',     30,   'Most views one viewer can add to one ad in an hour'),
  ('ad_open_coins',            2,    'Coins a signed-in player gets for opening (tapping) an ad'),
  ('ad_open_rewards_per_day',  10,   'Most paid ad opens per player per day'),
  ('sponsor_coins_per_ngn',    0.2,  'Coins added to a prize pool per naira a sponsor pays (0.2 = 5 naira a coin)'),
  ('sponsor_min_ngn',          5000, 'Smallest prize pool sponsorship in naira')
on conflict (key) do nothing;

-- ============================================================ ads
create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'reviewing', 'live', 'rejected', 'finished', 'held')),
  brand text not null check (char_length(brand) between 1 and 60),
  headline text not null check (char_length(headline) between 1 and 60),
  link_url text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500)),
  image_path text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  slots int not null check (slots between 1 and 50),
  views_bought int not null check (views_bought > 0),
  views_delivered int not null default 0,
  clicks int not null default 0,
  opens int not null default 0,
  amount_kobo bigint not null check (amount_kobo > 0),
  paystack_reference text not null unique,
  policy_accepted_at timestamptz not null,
  paid_at timestamptz,
  review_started_at timestamptz,
  review_notes text,
  starts_at timestamptz,
  ends_at timestamptz,
  finished_at timestamptz,
  last_report_day date,
  final_report_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ads_status_idx on public.ads (status, created_at);

-- One row per ad per day, for the daily report emails.
create table if not exists public.ad_daily (
  ad_id uuid not null references public.ads (id) on delete cascade,
  day date not null,
  views int not null default 0,
  opens int not null default 0,
  clicks int not null default 0,
  primary key (ad_id, day)
);

-- Rate limit: how much one viewer (a hashed IP + browser, never stored in the clear) has
-- added to one ad this hour. Old rows are cleared by ad_housekeeping().
create table if not exists public.ad_view_buckets (
  viewer text not null,
  ad_id uuid not null references public.ads (id) on delete cascade,
  hour timestamptz not null,
  views int not null default 0,
  opens int not null default 0,
  clicks int not null default 0,
  primary key (viewer, ad_id, hour)
);
create index if not exists ad_view_buckets_hour_idx on public.ad_view_buckets (hour);

-- Coins paid to players for opening ads (one per player per ad per day).
create table if not exists public.ad_open_rewards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ad_id uuid not null references public.ads (id) on delete cascade,
  day date not null,
  coins numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ad_id, day)
);
create index if not exists ad_open_rewards_day_idx on public.ad_open_rewards (user_id, day);

-- When an ad goes live (by the AI review, or by the owner changing status to 'live' in the
-- Table Editor), its 7-day window starts. Ads that have all their views are finished.
create or replace function public.ads_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    if new.starts_at is null then new.starts_at := now(); end if;
    if new.ends_at is null then
      new.ends_at := new.starts_at + make_interval(days => public.setting('ad_days')::int);
    end if;
  end if;
  if new.status = 'live' and new.views_delivered >= new.views_bought then
    new.status := 'finished';
  end if;
  if new.status = 'finished' and new.finished_at is null then new.finished_at := now(); end if;
  return new;
end $$;
drop trigger if exists ads_before_update on public.ads;
create trigger ads_before_update before update on public.ads
  for each row execute function public.ads_before_update();

-- ============================================================ serving ads
-- A weighted random pick of up to p_n live ads, without repeats. Weight = views still to
-- deliver ÷ hours left (at least 1 hour, so late ads get a strong push). Uses the
-- Efraimidis–Spirakis trick: order by -ln(random()) / weight.
create or replace function public.ad_serve(p_n int)
returns table (id uuid, image_path text, headline text, brand text, link_url text)
language sql volatile security definer set search_path = public as $$
  select a.id, a.image_path, a.headline, a.brand, a.link_url
  from public.ads a
  where a.status = 'live' and a.views_delivered < a.views_bought
  order by -ln(greatest(random(), 1e-12))
           / ((a.views_bought - a.views_delivered)::float8
              / greatest(extract(epoch from (coalesce(a.ends_at, now()) - now())) / 3600.0, 1.0))
  limit greatest(0, least(coalesce(p_n, 24), 40))
$$;

-- Adds a viewer's billboard views: p_views is {"<ad id>": count, ...}. Each viewer can add at
-- most ad_viewer_hourly_cap views to an ad per hour; anything over that is ignored.
create or replace function public.ad_track_views(p_views jsonb, p_viewer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cap int := public.setting('ad_viewer_hourly_cap')::int;
  v_hour timestamptz := date_trunc('hour', now());
  v_counted int := 0;
  v_ad uuid;
  v_want int;
  v_old int;
  v_add int;
  v_room int;
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

    -- Lock order everywhere: the viewer's bucket first, then the ad.
    insert into public.ad_view_buckets (viewer, ad_id, hour) values (left(p_viewer, 128), v_ad, v_hour)
      on conflict do nothing;
    select b.views into v_old from public.ad_view_buckets b
      where b.viewer = left(p_viewer, 128) and b.ad_id = v_ad and b.hour = v_hour for update;
    continue when v_old >= v_cap;
    select a.views_bought - a.views_delivered into v_room from public.ads a
      where a.id = v_ad and a.status = 'live' for update;
    continue when not found or v_room <= 0;
    v_add := least(v_want, v_cap - v_old, v_room);
    continue when v_add <= 0;

    -- (The ads trigger marks the ad finished once it has all its views.)
    update public.ads a set views_delivered = a.views_delivered + v_add where a.id = v_ad;
    update public.ad_view_buckets b set views = b.views + v_add
      where b.viewer = left(p_viewer, 128) and b.ad_id = v_ad and b.hour = v_hour;
    insert into public.ad_daily (ad_id, day, views) values (v_ad, current_date, v_add)
      on conflict (ad_id, day) do update set views = public.ad_daily.views + excluded.views;
    v_counted := v_counted + v_add;
  end loop;
  return jsonb_build_object('counted', v_counted);
end $$;

-- Someone tapped a billboard to look at the ad. Counts an "open" (at most 5 per viewer per
-- ad per hour). A signed-in player also gets a few coins: once per ad per day, and at most
-- ad_open_rewards_per_day times a day. Returns the coins paid and how many paid opens are left today.
create or replace function public.ad_open(p_ad uuid, p_user uuid default null, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(coalesce(nullif(p_viewer, ''), 'anon'), 128);
  v_coins numeric := public.setting('ad_open_coins');
  v_per_day int := public.setting('ad_open_rewards_per_day')::int;
  v_today int := 0;
  v_paid numeric := 0;
  v_opens int;
  p public.profiles;
begin
  if not exists (select 1 from public.ads where id = p_ad and status in ('live', 'finished')) then
    raise exception 'That ad isn''t showing any more';
  end if;

  insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, p_ad, v_hour) on conflict do nothing;
  update public.ad_view_buckets set opens = opens + 1
    where viewer = v_viewer and ad_id = p_ad and hour = v_hour
    returning opens into v_opens;
  if v_opens <= 5 then
    update public.ads set opens = opens + 1 where id = p_ad;
    insert into public.ad_daily (ad_id, day, opens) values (p_ad, current_date, 1)
      on conflict (ad_id, day) do update set opens = public.ad_daily.opens + 1;
  end if;

  if p_user is not null then
    select * into p from public.profiles where id = p_user for update;
    if found and not p.is_bot and not p.frozen then
      select count(*) into v_today from public.ad_open_rewards where user_id = p_user and day = current_date;
      if v_coins > 0 and v_today < v_per_day
         and exists (select 1 from public.ads where id = p_ad and status = 'live') then
        insert into public.ad_open_rewards (user_id, ad_id, day, coins)
          values (p_user, p_ad, current_date, v_coins) on conflict do nothing;
        if found then
          update public.profiles set coins = coins + v_coins where id = p_user;
          perform public.log_coins(p_user, null, 'ad_reward', v_coins);
          v_paid := v_coins;
          v_today := v_today + 1;
        end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('coins', v_paid,
    'left_today', case when p_user is null then 0 else greatest(v_per_day - v_today, 0) end);
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

-- ============================================================ paying for an ad
-- Paystack confirmed a payment of p_amount_kobo for this reference. Marks the ad paid (once)
-- and hands out the right to run the AI review: claimed = true for exactly one caller (or
-- again if a review got stuck for 5+ minutes). Safe to call many times.
create or replace function public.ad_paid(p_reference text, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.ads; v_claimed boolean := false;
begin
  select * into a from public.ads where paystack_reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if a.status = 'pending_payment' then
    if p_amount_kobo < a.amount_kobo then
      return jsonb_build_object('found', true, 'id', a.id, 'status', a.status, 'claimed', false, 'short', true);
    end if;
    a.status := 'paid';
    update public.ads set status = 'paid', paid_at = now() where id = a.id;
  end if;
  if a.status = 'paid' or (a.status = 'reviewing' and a.review_started_at < now() - interval '5 minutes') then
    update public.ads set status = 'reviewing', review_started_at = now() where id = a.id;
    a.status := 'reviewing';
    v_claimed := true;
  end if;
  return jsonb_build_object('found', true, 'id', a.id, 'status', a.status, 'claimed', v_claimed);
end $$;

-- The review's verdict: 'live', 'rejected' or 'held' (for the owner to check by hand).
create or replace function public.ad_set_review(p_ad uuid, p_status text, p_notes text) returns text
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_status not in ('live', 'rejected', 'held') then raise exception 'Bad review status'; end if;
  update public.ads set status = p_status, review_notes = left(p_notes, 1000)
    where id = p_ad and status = 'reviewing'
    returning status into v_status;
  return coalesce(v_status, (select status from public.ads where id = p_ad));
end $$;

-- ============================================================ sponsored prize pools
alter table public.rounds add column if not exists sponsor_name text;
alter table public.rounds add column if not exists sponsor_logo text;
alter table public.rounds add column if not exists sponsor_coins numeric(14,2) not null default 0;

create table if not exists public.pool_sponsors (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'queued', 'applied', 'refunded')),
  brand text not null check (char_length(brand) between 1 and 60),
  logo_path text,
  logo_url text,
  coins numeric(14,2) not null check (coins > 0),
  amount_kobo bigint not null check (amount_kobo > 0),
  paystack_reference text not null unique,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  round_id bigint references public.rounds (id),
  paid_at timestamptz,
  applied_at timestamptz,
  report_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pool_sponsors_queue_idx on public.pool_sponsors (status, paid_at);

-- Puts a sponsor's coins into a round's pool. New coins, so they are logged as 'sponsor'.
create or replace function public.sponsor_apply(p_sponsor uuid, p_round bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare s public.pool_sponsors;
begin
  select * into s from public.pool_sponsors where id = p_sponsor and status = 'queued' for update;
  if not found then return false; end if;
  update public.rounds set pool = pool + s.coins, sponsor_name = s.brand, sponsor_logo = s.logo_url,
         sponsor_coins = s.coins
    where id = p_round and status <> 'done' and sponsor_name is null;
  if not found then return false; end if;
  perform public.log_coins(null, p_round, 'sponsor', s.coins, false, 'Prize pool by ' || s.brand);
  update public.pool_sponsors set status = 'applied', round_id = p_round, applied_at = now() where id = s.id;
  return true;
end $$;

-- Paystack confirmed a sponsor's payment. Queues it (once), then puts it into the current
-- round straight away if that round is still in its hiding window and has no sponsor yet.
create or replace function public.sponsor_paid(p_reference text, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.pool_sponsors; r public.rounds; v_new boolean := false;
begin
  select * into s from public.pool_sponsors where paystack_reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if s.status = 'pending_payment' then
    if p_amount_kobo < s.amount_kobo then
      return jsonb_build_object('found', true, 'id', s.id, 'status', s.status, 'short', true);
    end if;
    update public.pool_sponsors set status = 'queued', paid_at = now() where id = s.id;
    s.status := 'queued';
    s.paid_at := now();
    v_new := true;
    -- Only jump the queue if nobody else is waiting.
    if not exists (select 1 from public.pool_sponsors where status = 'queued' and id <> s.id) then
      select * into r from public.rounds where status = 'join' and sponsor_name is null for update;
      if found and public.sponsor_apply(s.id, r.id) then
        s.status := 'applied';
        s.round_id := r.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('found', true, 'id', s.id, 'status', s.status, 'round_id', s.round_id,
    'coins', s.coins, 'newly_paid', v_new, 'queued_ahead',
    (select count(*) from public.pool_sponsors q where q.status = 'queued' and q.paid_at < coalesce(s.paid_at, now())));
end $$;

-- Every new round takes the oldest waiting sponsor (if any).
create or replace function public.rounds_take_sponsor() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if new.sponsor_name is null then
    select id into v_id from public.pool_sponsors where status = 'queued'
      order by paid_at, created_at limit 1 for update skip locked;
    if v_id is not null then perform public.sponsor_apply(v_id, new.id); end if;
  end if;
  return null;
exception when others then
  raise warning 'sponsor not applied: %', sqlerrm;
  return null;
end $$;
drop trigger if exists rounds_take_sponsor on public.rounds;
create trigger rounds_take_sponsor after insert on public.rounds
  for each row execute function public.rounds_take_sponsor();

-- ============================================================ upkeep
-- Clears old rate-limit rows and unpaid checkouts (returns their image paths so the server
-- can delete the files too).
create or replace function public.ad_housekeeping() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_paths text[]; v_buckets int;
begin
  delete from public.ad_view_buckets where hour < now() - interval '3 hours';
  get diagnostics v_buckets = row_count;
  with gone as (
    delete from public.ads where status = 'pending_payment' and created_at < now() - interval '3 days'
    returning image_path
  ), gone_sponsors as (
    delete from public.pool_sponsors where status = 'pending_payment' and created_at < now() - interval '3 days'
    returning logo_path
  )
  select coalesce(array_agg(p) filter (where p is not null), '{}') into v_paths
  from (select image_path p from gone union all select logo_path from gone_sponsors) x;
  return jsonb_build_object('buckets_cleared', v_buckets, 'paths', to_jsonb(v_paths));
end $$;

-- ============================================================ coin books
-- Ad rewards are new coins.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
alter table public.ads enable row level security;
alter table public.ad_daily enable row level security;
alter table public.ad_view_buckets enable row level security;
alter table public.ad_open_rewards enable row level security;
alter table public.pool_sponsors enable row level security;

-- Ad images (and sponsor logos) are public pictures, 2 MB at most.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ads', 'ads', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('ads_before_update', 'ad_serve', 'ad_track_views', 'ad_open', 'ad_click', 'ad_paid', 'ad_set_review',
            'sponsor_apply', 'sponsor_paid', 'rounds_take_sponsor', 'ad_housekeeping')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
