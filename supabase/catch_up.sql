-- =============================================================================
-- Spendbox: bring any Supabase database up to date in one go.
--
-- Paste ALL of this into Supabase → SQL Editor and press Run. It checks which
-- updates your database already has and runs only the missing ones, in order.
-- Running it again is safe: it skips everything that's already there.
-- The table at the end shows each update and whether it's in place.
--
-- Generated from supabase/migrations by supabase/build-catch-up.sh. Don't edit
-- by hand; change the migration and run the script again.
-- =============================================================================

-- Update 1: 20261001000000_spendbox.sql
do $outer$ begin
  if not (to_regclass('public.businesses') is not null) then
    execute $spendbox_update_1$
-- =============================================================================
-- Spendbox database
--
-- How to use: open your Supabase project → SQL Editor → New query, paste this
-- whole file and press "Run". Run it once on a fresh project.
--
-- Everything a business or customer can see is enforced here with Row Level
-- Security, so the rules hold no matter which screen asks for the data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Profiles: one per person. The single source of truth for a customer's
-- details, so an edit shows up everywhere (every business they share with)
-- the moment it is saved.
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  full_name text check (char_length(full_name) <= 80),
  gender text check (gender in ('female', 'male', 'other')),
  birth_day smallint check (birth_day between 1 and 31),
  birth_month smallint check (birth_month between 1 and 12),
  birth_year smallint check (birth_year between 1900 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do update set phone = excluded.phone;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_auth_user();

create trigger on_auth_user_phone_changed after update of phone on auth.users
for each row when (old.phone is distinct from new.phone)
execute function public.handle_auth_user();

-- -----------------------------------------------------------------------------
-- Businesses
-- -----------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 80),
  category text check (char_length(category) <= 40),
  location text check (char_length(location) <= 80),
  about text check (char_length(about) <= 280),
  whatsapp text check (char_length(whatsapp) <= 20),
  brand_color text not null default '#0B6E4F' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

create index businesses_owner_idx on public.businesses (owner_id);

create or replace function public.is_business_owner(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses
    where id = p_business_id and owner_id = (select auth.uid())
  );
$$;

-- Bank accounts a business gets paid into. Used to verify customer receipts.
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  bank_name text not null check (char_length(bank_name) between 2 and 60),
  account_number text not null check (account_number ~ '^[0-9]{6,20}$'),
  account_name text not null check (char_length(account_name) between 2 and 100),
  created_at timestamptz not null default now(),
  unique (business_id, account_number)
);

-- -----------------------------------------------------------------------------
-- Perks: what a business offers. Rewards: perks a customer has earned.
-- -----------------------------------------------------------------------------

create type public.perk_kind as enum ('welcome', 'referral', 'visits', 'spend', 'birthday');

create table public.perks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.perk_kind not null,
  title text not null check (char_length(title) between 2 and 80),
  details text check (char_length(details) <= 200),
  threshold numeric(14, 2) check (threshold > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint perks_threshold_required check (kind not in ('visits', 'spend') or threshold is not null)
);

create index perks_business_idx on public.perks (business_id);

-- -----------------------------------------------------------------------------
-- Memberships: a customer who joined a business.
-- -----------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  member_no integer not null,
  ref_code text not null unique,
  referred_by uuid references public.memberships (id) on delete set null,
  share_details boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (business_id, customer_id),
  unique (business_id, member_no)
);

create index memberships_customer_idx on public.memberships (customer_id);
create index memberships_referred_by_idx on public.memberships (referred_by);

-- -----------------------------------------------------------------------------
-- Purchases: from customer receipts, or recorded by the business.
-- -----------------------------------------------------------------------------

create type public.purchase_status as enum ('verified', 'pending', 'rejected');

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'NGN',
  paid_at timestamptz not null,
  description text check (char_length(description) <= 200),
  reference text check (char_length(reference) <= 80),
  source text not null check (source in ('receipt', 'business')),
  match_method text check (match_method in ('account', 'name', 'manual')),
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  status public.purchase_status not null default 'pending',
  receipt_path text,
  receipt_hash text,
  extracted jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index purchases_membership_idx on public.purchases (membership_id);
create index purchases_business_idx on public.purchases (business_id, created_at desc);
create index purchases_customer_idx on public.purchases (customer_id, created_at desc);
-- A receipt can only ever be used once per business.
create unique index purchases_unique_reference on public.purchases (business_id, upper(reference))
  where reference is not null;
create unique index purchases_unique_receipt on public.purchases (business_id, receipt_hash)
  where receipt_hash is not null;

create type public.reward_status as enum ('available', 'redeemed', 'void');

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  perk_id uuid references public.perks (id) on delete set null,
  kind public.perk_kind not null,
  title text not null,
  issue_key text not null,
  status public.reward_status not null default 'available',
  expires_at timestamptz,
  issued_at timestamptz not null default now(),
  redeemed_at timestamptz,
  unique (membership_id, perk_id, issue_key)
);

create index rewards_business_idx on public.rewards (business_id, status);
create index rewards_customer_idx on public.rewards (customer_id, status);

-- Receipt scans, for fair-use limits on the AI receipt reader.
create table public.receipt_scans (
  id bigint generated always as identity primary key,
  customer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index receipt_scans_customer_idx on public.receipt_scans (customer_id, created_at desc);

-- =============================================================================
-- Perk engine
--
-- sync_member_rewards() works out which rewards a member should have right now
-- and makes it so: it issues anything newly earned and takes back unused
-- rewards whose reason went away (for example a receipt marked "not received").
-- It is safe to run any number of times.
-- =============================================================================

create or replace function public.sync_member_rewards(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.memberships;
  prof public.profiles;
  p public.perks;
  keys text[];
  n integer;
  total numeric;
  today date := (now() at time zone 'utc')::date;
begin
  select * into m from public.memberships where id = p_membership_id;
  if not found then
    return;
  end if;
  select * into prof from public.profiles where id = m.customer_id;

  for p in select * from public.perks where business_id = m.business_id loop
    keys := '{}';

    if p.kind = 'welcome' then
      -- Only people who join after the perk was created get it.
      if m.joined_at >= p.created_at then
        keys := array['welcome'];
      end if;

    elsif p.kind = 'visits' then
      select count(*) into n from public.purchases
      where membership_id = m.id and status = 'verified' and created_at >= p.created_at;
      n := least(floor(n / p.threshold)::integer, 500);
      select coalesce(array_agg('visits:' || g), '{}') into keys from generate_series(1, n) g;

    elsif p.kind = 'spend' then
      select coalesce(sum(amount), 0) into total from public.purchases
      where membership_id = m.id and status = 'verified' and created_at >= p.created_at;
      n := least(floor(total / p.threshold)::integer, 500);
      select coalesce(array_agg('spend:' || g), '{}') into keys from generate_series(1, n) g;

    elsif p.kind = 'referral' then
      -- One reward per invited friend, once that friend's first purchase counts.
      select coalesce(array_agg('referral:' || f.id), '{}') into keys
      from public.memberships f
      where f.referred_by = m.id
        and f.joined_at >= p.created_at
        and exists (
          select 1 from public.purchases x
          where x.membership_id = f.id and x.status = 'verified'
        );

    elsif p.kind = 'birthday' then
      -- The system knows the birthday even when the customer keeps it private
      -- from the business, so private customers still get their treat.
      if prof.birth_month is not null and prof.birth_month = extract(month from today) then
        keys := array['birthday:' || extract(year from today)::integer];
      end if;
    end if;

    if p.is_active and cardinality(keys) > 0 then
      insert into public.rewards (business_id, membership_id, customer_id, perk_id, kind, title, issue_key, expires_at)
      select m.business_id, m.id, m.customer_id, p.id, p.kind, p.title, k,
        case when p.kind = 'birthday'
          then (date_trunc('month', today::timestamp) + interval '1 month') at time zone 'utc'
        end
      from unnest(keys) k
      on conflict (membership_id, perk_id, issue_key) do nothing;
    end if;

    if p.kind in ('visits', 'spend', 'referral') then
      -- Bring back rewards that were taken back but are earned again…
      update public.rewards set status = 'available'
      where membership_id = m.id and perk_id = p.id and status = 'void'
        and issue_key = any (keys);
      -- …and take back unused ones that are no longer earned.
      update public.rewards set status = 'void'
      where membership_id = m.id and perk_id = p.id and status = 'available'
        and not (issue_key = any (keys));
    end if;
  end loop;
end $$;

create or replace function public.trg_membership_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_member_rewards(new.id);
  return null;
end $$;

create trigger memberships_sync_rewards after insert on public.memberships
for each row execute function public.trg_membership_created();

create or replace function public.trg_purchase_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_membership_id uuid := coalesce(new.membership_id, old.membership_id);
  v_referrer uuid;
begin
  perform public.sync_member_rewards(v_membership_id);
  select referred_by into v_referrer from public.memberships where id = v_membership_id;
  if v_referrer is not null then
    perform public.sync_member_rewards(v_referrer);
  end if;
  return null;
end $$;

create trigger purchases_sync_rewards
after insert or delete or update of status, amount on public.purchases
for each row execute function public.trg_purchase_changed();

create or replace function public.trg_perk_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if new.title is distinct from old.title then
    update public.rewards set title = new.title
    where perk_id = new.id and status = 'available';
  end if;
  if new.threshold is distinct from old.threshold or new.is_active is distinct from old.is_active then
    for r in select id from public.memberships where business_id = new.business_id loop
      perform public.sync_member_rewards(r.id);
    end loop;
  end if;
  return null;
end $$;

create trigger perks_sync_rewards after update on public.perks
for each row execute function public.trg_perk_changed();

create or replace function public.trg_profile_birthday_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select id from public.memberships where customer_id = new.id loop
    perform public.sync_member_rewards(r.id);
  end loop;
  return null;
end $$;

create trigger profiles_sync_birthday_rewards after update of birth_month on public.profiles
for each row when (old.birth_month is distinct from new.birth_month)
execute function public.trg_profile_birthday_changed();

-- Run daily (see /api/cron/birthdays) so birthday treats arrive on time.
create or replace function public.sync_birthday_rewards() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select m.id from public.memberships m
    join public.profiles p on p.id = m.customer_id
    where p.birth_month = extract(month from (now() at time zone 'utc'))
  loop
    perform public.sync_member_rewards(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- =============================================================================
-- Functions the app calls
-- =============================================================================

create or replace function public.gen_ref_code() returns text
language plpgsql set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..7 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.memberships where ref_code = code);
  end loop;
  return code;
end $$;

-- Create a business owned by the signed-in person and give it a link.
create or replace function public.create_business(
  p_name text,
  p_category text default null,
  p_location text default null,
  p_whatsapp text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_base text;
  v_slug text;
  v_id uuid;
  v_tries integer := 0;
begin
  if v_uid is null then
    raise exception 'Please sign in first' using errcode = '28000';
  end if;
  if (select count(*) from public.businesses where owner_id = v_uid) >= 10 then
    raise exception 'You can have up to 10 businesses';
  end if;

  v_base := trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
  v_base := trim(both '-' from left(v_base, 30));
  if char_length(v_base) < 3 then
    v_base := 'shop';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.businesses where slug = v_slug) loop
    v_tries := v_tries + 1;
    if v_tries > 20 then
      raise exception 'Could not create a link, please try another name';
    end if;
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  insert into public.businesses (owner_id, slug, name, category, location, whatsapp)
  values (
    v_uid, v_slug, trim(p_name),
    nullif(trim(p_category), ''), nullif(trim(p_location), ''), nullif(trim(p_whatsapp), '')
  )
  returning id into v_id;
  return v_id;
end $$;

-- Join a business from its link. Customers are invite-only: this is the only
-- way a membership is created. p_ref is the invite code of the friend who
-- shared the link (optional).
create or replace function public.join_business(
  p_slug text,
  p_ref text default null,
  p_share_details boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_business public.businesses;
  v_referrer public.memberships;
  v_id uuid;
  v_no integer;
begin
  if v_uid is null then
    raise exception 'Please sign in first' using errcode = '28000';
  end if;

  select * into v_business from public.businesses where slug = lower(p_slug) for update;
  if not found then
    raise exception 'This link is not valid' using errcode = 'P0002';
  end if;
  if v_business.owner_id = v_uid then
    raise exception 'This is your own business';
  end if;

  select id into v_id from public.memberships
  where business_id = v_business.id and customer_id = v_uid;
  if found then
    return v_id;
  end if;

  if p_ref is not null and p_ref <> '' then
    select * into v_referrer from public.memberships
    where ref_code = lower(p_ref) and business_id = v_business.id and customer_id <> v_uid;
  end if;

  select coalesce(max(member_no), 0) + 1 into v_no
  from public.memberships where business_id = v_business.id;

  insert into public.memberships (business_id, customer_id, member_no, ref_code, referred_by, share_details)
  values (v_business.id, v_uid, v_no, public.gen_ref_code(), v_referrer.id, coalesce(p_share_details, false))
  returning id into v_id;
  return v_id;
end $$;

-- Customers: keep birthday treats fresh when they open the app.
create or replace function public.sync_my_rewards() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select id from public.memberships where customer_id = auth.uid() loop
    perform public.sync_member_rewards(r.id);
  end loop;
end $$;

-- Customers: friends who joined through my invite link (no personal details).
create or replace function public.my_referrals(p_membership_id uuid)
returns table (joined_at timestamptz, phone_hint text, has_purchase boolean, reward_status public.reward_status)
language sql stable security definer set search_path = '' as $$
  select f.joined_at,
    '•••• ' || right(coalesce(p.phone, ''), 3),
    exists (select 1 from public.purchases x where x.membership_id = f.id and x.status = 'verified'),
    (select r.status from public.rewards r
      where r.membership_id = me.id and r.issue_key = 'referral:' || f.id
      order by r.issued_at desc limit 1)
  from public.memberships me
  join public.memberships f on f.referred_by = me.id
  join public.profiles p on p.id = f.customer_id
  where me.id = p_membership_id and me.customer_id = auth.uid()
  order by f.joined_at desc;
$$;

-- Businesses: their members. Personal details only for members who chose to
-- share them with this business.
create or replace function public.business_members(p_business_id uuid)
returns table (
  membership_id uuid,
  member_no integer,
  joined_at timestamptz,
  shares_details boolean,
  full_name text,
  phone text,
  gender text,
  birth_day smallint,
  birth_month smallint,
  visits bigint,
  total_spent numeric,
  last_visit_at timestamptz,
  rewards_ready bigint,
  referred boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.member_no, m.joined_at, m.share_details,
    case when m.share_details then p.full_name end,
    case when m.share_details then p.phone end,
    case when m.share_details then p.gender end,
    case when m.share_details then p.birth_day end,
    case when m.share_details then p.birth_month end,
    coalesce(s.visits, 0), coalesce(s.total, 0), s.last_at,
    (select count(*) from public.rewards r
      where r.membership_id = m.id and r.status = 'available'
        and (r.expires_at is null or r.expires_at > now())),
    m.referred_by is not null
  from public.memberships m
  join public.profiles p on p.id = m.customer_id
  left join lateral (
    select count(*) as visits, sum(x.amount) as total, max(x.paid_at) as last_at
    from public.purchases x
    where x.membership_id = m.id and x.status = 'verified'
  ) s on true
  where m.business_id = p_business_id and public.is_business_owner(p_business_id)
  order by m.joined_at desc;
$$;

-- Businesses: payments from members, newest first.
create or replace function public.business_purchases(
  p_business_id uuid,
  p_status public.purchase_status default null,
  p_membership_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  membership_id uuid,
  member_no integer,
  member_name text,
  amount numeric,
  currency text,
  paid_at timestamptz,
  description text,
  reference text,
  source text,
  match_method text,
  status public.purchase_status,
  has_receipt boolean,
  bank_label text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select x.id, x.membership_id, m.member_no,
    case when m.share_details then pr.full_name end,
    x.amount, x.currency, x.paid_at, x.description, x.reference, x.source, x.match_method,
    x.status, x.receipt_path is not null,
    case when b.id is not null then b.bank_name || ' •••' || right(b.account_number, 4) end,
    x.created_at
  from public.purchases x
  join public.memberships m on m.id = x.membership_id
  join public.profiles pr on pr.id = x.customer_id
  left join public.bank_accounts b on b.id = x.bank_account_id
  where x.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and (p_status is null or x.status = p_status)
    and (p_membership_id is null or x.membership_id = p_membership_id)
  order by x.created_at desc
  limit least(coalesce(p_limit, 200), 1000);
$$;

-- Businesses: rewards earned by members.
create or replace function public.business_rewards(
  p_business_id uuid,
  p_status public.reward_status default 'available',
  p_membership_id uuid default null
)
returns table (
  id uuid,
  membership_id uuid,
  member_no integer,
  member_name text,
  kind public.perk_kind,
  title text,
  status public.reward_status,
  expires_at timestamptz,
  issued_at timestamptz,
  redeemed_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.membership_id, m.member_no,
    case when m.share_details then p.full_name end,
    r.kind, r.title, r.status, r.expires_at, r.issued_at, r.redeemed_at
  from public.rewards r
  join public.memberships m on m.id = r.membership_id
  join public.profiles p on p.id = r.customer_id
  where r.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and (p_status is null or r.status = p_status)
    and (p_membership_id is null or r.membership_id = p_membership_id)
    and (r.status <> 'available' or r.expires_at is null or r.expires_at > now())
  order by r.issued_at desc
  limit 500;
$$;

-- Businesses: headline numbers for the home screen.
create or replace function public.business_stats(p_business_id uuid)
returns table (
  members bigint,
  members_new bigint,
  sales_week numeric,
  purchases_week bigint,
  pending bigint,
  rewards_ready bigint,
  referred_members bigint
)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.memberships where business_id = p_business_id),
    (select count(*) from public.memberships
      where business_id = p_business_id and joined_at > now() - interval '7 days'),
    (select coalesce(sum(amount), 0) from public.purchases
      where business_id = p_business_id and status = 'verified' and paid_at > now() - interval '7 days'),
    (select count(*) from public.purchases
      where business_id = p_business_id and status = 'verified' and paid_at > now() - interval '7 days'),
    (select count(*) from public.purchases where business_id = p_business_id and status = 'pending'),
    (select count(*) from public.rewards
      where business_id = p_business_id and status = 'available'
        and (expires_at is null or expires_at > now())),
    (select count(*) from public.memberships
      where business_id = p_business_id and referred_by is not null)
  where public.is_business_owner(p_business_id);
$$;

-- Businesses: confirm a payment, or say it never arrived.
create or replace function public.set_purchase_status(p_purchase_id uuid, p_status public.purchase_status)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.purchases set status = p_status, reviewed_at = now()
  where id = p_purchase_id and public.is_business_owner(business_id);
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
end $$;

-- Businesses: hand over a reward (or undo by mistake).
create or replace function public.redeem_reward(p_reward_id uuid, p_redeemed boolean default true)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_redeemed then
    update public.rewards set status = 'redeemed', redeemed_at = now()
    where id = p_reward_id and status = 'available' and public.is_business_owner(business_id);
  else
    update public.rewards set status = 'available', redeemed_at = null
    where id = p_reward_id and status = 'redeemed' and public.is_business_owner(business_id);
  end if;
  if not found then
    raise exception 'Perk not found' using errcode = 'P0002';
  end if;
end $$;

-- Businesses: record a purchase paid in cash or by card at the counter.
create or replace function public.record_purchase(
  p_membership_id uuid,
  p_amount numeric,
  p_description text default null,
  p_paid_at timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  m public.memberships;
  v_id uuid;
begin
  select * into m from public.memberships where id = p_membership_id;
  if not found or not public.is_business_owner(m.business_id) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  insert into public.purchases (business_id, membership_id, customer_id, amount, currency, paid_at,
    description, source, status, reviewed_at)
  select m.business_id, m.id, m.customer_id, p_amount, b.currency, coalesce(p_paid_at, now()),
    nullif(trim(p_description), ''), 'business', 'verified', now()
  from public.businesses b where b.id = m.business_id
  returning id into v_id;
  return v_id;
end $$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.perks enable row level security;
alter table public.memberships enable row level security;
alter table public.purchases enable row level security;
alter table public.rewards enable row level security;
alter table public.receipt_scans enable row level security;

create policy "Own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Edit own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Businesses are public" on public.businesses
  for select to anon, authenticated using (true);
create policy "Owners edit their business" on public.businesses
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owners delete their business" on public.businesses
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "Owners manage bank accounts" on public.bank_accounts
  for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

create policy "Active perks are public" on public.perks
  for select to anon, authenticated using (is_active or public.is_business_owner(business_id));
create policy "Owners add perks" on public.perks
  for insert to authenticated with check (public.is_business_owner(business_id));
create policy "Owners edit perks" on public.perks
  for update to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy "Owners delete perks" on public.perks
  for delete to authenticated using (public.is_business_owner(business_id));

create policy "Members and owners see memberships" on public.memberships
  for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_business_owner(business_id));
create policy "Members change their sharing" on public.memberships
  for update to authenticated
  using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
create policy "Members can leave" on public.memberships
  for delete to authenticated using (customer_id = (select auth.uid()));

create policy "Members and owners see purchases" on public.purchases
  for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_business_owner(business_id));

create policy "Members and owners see rewards" on public.rewards
  for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_business_owner(business_id));

-- receipt_scans: no policies, only the server can use it.

-- =============================================================================
-- Permissions: exactly what the app needs, nothing more.
-- =============================================================================

revoke all on public.profiles, public.businesses, public.bank_accounts, public.perks,
  public.memberships, public.purchases, public.rewards, public.receipt_scans
  from anon, authenticated;

grant select on public.businesses, public.perks to anon, authenticated;
grant select on public.profiles, public.bank_accounts, public.memberships,
  public.purchases, public.rewards to authenticated;
grant update (full_name, gender, birth_day, birth_month, birth_year) on public.profiles to authenticated;
grant update (name, category, location, about, whatsapp, brand_color), delete on public.businesses to authenticated;
grant insert, update, delete on public.bank_accounts to authenticated;
grant insert, update, delete on public.perks to authenticated;
grant update (share_details), delete on public.memberships to authenticated;

grant all on public.profiles, public.businesses, public.bank_accounts, public.perks,
  public.memberships, public.purchases, public.rewards, public.receipt_scans
  to service_role;

-- Internal functions: not callable from the app.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_auth_user() from public, anon, authenticated;
revoke execute on function public.sync_member_rewards(uuid) from public, anon, authenticated;
revoke execute on function public.trg_membership_created() from public, anon, authenticated;
revoke execute on function public.trg_purchase_changed() from public, anon, authenticated;
revoke execute on function public.trg_perk_changed() from public, anon, authenticated;
revoke execute on function public.trg_profile_birthday_changed() from public, anon, authenticated;
revoke execute on function public.sync_birthday_rewards() from public, anon, authenticated;
revoke execute on function public.gen_ref_code() from public, anon, authenticated;
grant execute on function public.sync_birthday_rewards() to service_role;

-- App functions: signed-in people only (each checks who is asking).
revoke execute on function public.create_business(text, text, text, text) from public, anon;
revoke execute on function public.join_business(text, text, boolean) from public, anon;
revoke execute on function public.sync_my_rewards() from public, anon;
revoke execute on function public.my_referrals(uuid) from public, anon;
revoke execute on function public.business_members(uuid) from public, anon;
revoke execute on function public.business_purchases(uuid, public.purchase_status, uuid, integer) from public, anon;
revoke execute on function public.business_rewards(uuid, public.reward_status, uuid) from public, anon;
revoke execute on function public.business_stats(uuid) from public, anon;
revoke execute on function public.set_purchase_status(uuid, public.purchase_status) from public, anon;
revoke execute on function public.redeem_reward(uuid, boolean) from public, anon;
revoke execute on function public.record_purchase(uuid, numeric, text, timestamptz) from public, anon;

-- Used by the public perks rule, so visitors need it too (it is false for them).
grant execute on function public.is_business_owner(uuid) to anon, authenticated;
grant execute on function public.create_business(text, text, text, text) to authenticated;
grant execute on function public.join_business(text, text, boolean) to authenticated;
grant execute on function public.sync_my_rewards() to authenticated;
grant execute on function public.my_referrals(uuid) to authenticated;
grant execute on function public.business_members(uuid) to authenticated;
grant execute on function public.business_purchases(uuid, public.purchase_status, uuid, integer) to authenticated;
grant execute on function public.business_rewards(uuid, public.reward_status, uuid) to authenticated;
grant execute on function public.business_stats(uuid) to authenticated;
grant execute on function public.set_purchase_status(uuid, public.purchase_status) to authenticated;
grant execute on function public.redeem_reward(uuid, boolean) to authenticated;
grant execute on function public.record_purchase(uuid, numeric, text, timestamptz) to authenticated;

-- =============================================================================
-- Storage: private bucket for receipt images. Only the server reads and writes
-- it; people see a receipt through a short-lived link after a permission check.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

$spendbox_update_1$;
  end if;
end $outer$;

-- Update 2: 20261002000000_logos_emails_durations.sql
do $outer$ begin
  if not (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perks' and column_name = 'valid_days')) then
    execute $spendbox_update_2$
-- =============================================================================
-- Spendbox update 2: business logos and categories, emails for notifications,
-- bank codes (for Paystack account-name lookup) and how long perks last.
--
-- Run this after 20261001000000_spendbox.sql (SQL Editor → New query → Run).
-- =============================================================================

-- Businesses: several categories, a logo and a contact email -----------------

alter table public.businesses
  add column categories text[] not null default '{}' check (cardinality(categories) <= 6),
  add column logo_url text check (char_length(logo_url) <= 500),
  add column email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200);

alter table public.businesses alter column brand_color set default '#2A772C';

update public.businesses set categories = array[category] where category is not null and categories = '{}';

-- Bank code (from Paystack's bank list) so account names can be looked up.
alter table public.bank_accounts add column bank_code text check (char_length(bank_code) <= 20);

-- Customers: optional email for notifications. Never shown to businesses.
alter table public.profiles
  add column email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  add column email_notifications boolean not null default true;

-- Perks: how many days a customer has to use a perk once earned (null = no limit).
alter table public.perks add column valid_days integer check (valid_days between 1 and 365);

-- Rewards: when the customer was told by email.
alter table public.rewards add column notified_at timestamptz;
create index rewards_unnotified_idx on public.rewards (issued_at) where notified_at is null;

-- New rewards get their use-by date from the perk's duration.
create or replace function public.trg_reward_set_expiry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_days integer;
begin
  select valid_days into v_days from public.perks where id = new.perk_id;
  if v_days is not null then
    new.expires_at := new.issued_at + make_interval(days => v_days);
  end if;
  return new;
end $$;

create trigger rewards_set_expiry before insert on public.rewards
for each row execute function public.trg_reward_set_expiry();

-- Changing a perk's duration also moves the use-by date of unused rewards.
create or replace function public.trg_perk_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if new.title is distinct from old.title then
    update public.rewards set title = new.title
    where perk_id = new.id and status = 'available';
  end if;
  if new.valid_days is distinct from old.valid_days then
    update public.rewards
    set expires_at = case
      when new.valid_days is null then null
      else issued_at + make_interval(days => new.valid_days)
    end
    where perk_id = new.id and status = 'available';
  end if;
  if new.threshold is distinct from old.threshold or new.is_active is distinct from old.is_active then
    for r in select id from public.memberships where business_id = new.business_id loop
      perform public.sync_member_rewards(r.id);
    end loop;
  end if;
  return null;
end $$;

-- Permissions for the new columns ------------------------------------------

grant update (categories, logo_url, email) on public.businesses to authenticated;
grant update (email, email_notifications) on public.profiles to authenticated;
revoke execute on function public.trg_reward_set_expiry() from public, anon, authenticated;
revoke execute on function public.trg_perk_changed() from public, anon, authenticated;

-- Public bucket for business logos (shown on join pages). Only the server writes to it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

$spendbox_update_2$;
  end if;
end $outer$;

-- Update 3: 20261003000000_bank_feeds.sql
do $outer$ begin
  if not (to_regclass('public.bank_connections') is not null) then
    execute $spendbox_update_3$
-- =============================================================================
-- Spendbox update 3: count payments straight from the business's bank (Mono).
--
-- A business connects its bank account through Mono (read-only). Money that
-- comes in is saved here, matched to the member who sent it, and counted as a
-- purchase. Spendbox remembers each sender ("payer"), so their next payment —
-- at this business or any other they've joined — counts by itself.
--
-- Run this after 20261002000000_logos_emails_durations.sql.
-- =============================================================================

-- Bank accounts connected through Mono ---------------------------------------

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  mono_account_id text not null unique,
  institution text,
  account_name text,
  account_number text,
  currency text not null default 'NGN',
  status text not null default 'active' check (status in ('active', 'reauth', 'error')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index bank_connections_business_idx on public.bank_connections (business_id);

-- Money that came into a connected account ------------------------------------

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  connection_id uuid references public.bank_connections (id) on delete set null,
  external_id text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'NGN',
  paid_at timestamptz not null,
  narration text,
  sender_name text,
  sender_key text,
  sender_account text,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  purchase_id uuid unique references public.purchases (id) on delete set null,
  match_method text check (match_method in ('payer', 'name', 'recorded', 'manual')),
  created_at timestamptz not null default now(),
  unique (business_id, external_id)
);

create index bank_transactions_open_idx on public.bank_transactions (business_id, paid_at desc)
  where status = 'unmatched';

-- Senders Spendbox has recognised as a customer --------------------------------
-- Belongs to the customer: they see the list and can remove any of it.
-- Businesses never read it.

create table public.payers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  sender_name text,
  sender_key text,
  sender_account text,
  institution text,
  learned_at_business uuid references public.businesses (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (sender_key is not null or sender_account is not null)
);

create unique index payers_customer_key on public.payers (customer_id, sender_key) where sender_key is not null;
create unique index payers_customer_account on public.payers (customer_id, sender_account)
  where sender_account is not null and sender_key is null;
create index payers_key_idx on public.payers (sender_key);
create index payers_account_idx on public.payers (sender_account);

-- "Wrong customer": this sender is not this member, so don't match them again.
create table public.bank_sender_rejections (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  sender text not null,
  created_at timestamptz not null default now(),
  primary key (membership_id, sender)
);

-- Senders a business told us to skip (e.g. the owner moving their own money).
alter table public.businesses add column ignored_senders text[] not null default '{}';

-- Purchases can now come from the bank ----------------------------------------

alter table public.purchases drop constraint purchases_source_check;
alter table public.purchases add constraint purchases_source_check
  check (source in ('receipt', 'business', 'bank'));
alter table public.purchases drop constraint purchases_match_method_check;
alter table public.purchases add constraint purchases_match_method_check
  check (match_method in ('account', 'name', 'manual', 'payer', 'recorded'));

-- =============================================================================
-- Matching
-- =============================================================================

-- Remember that a sender is this customer (or refresh when we last saw them).
create or replace function public.learn_payer(p_customer_id uuid, p_tx public.bank_transactions)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_institution text;
begin
  if p_tx.sender_key is null and p_tx.sender_account is null then
    return;
  end if;
  select institution into v_institution from public.bank_connections where id = p_tx.connection_id;
  if p_tx.sender_key is not null then
    insert into public.payers (customer_id, sender_name, sender_key, sender_account, learned_at_business)
    values (p_customer_id, p_tx.sender_name, p_tx.sender_key, p_tx.sender_account, p_tx.business_id)
    on conflict (customer_id, sender_key) where sender_key is not null
    do update set last_seen_at = now(),
      sender_account = coalesce(excluded.sender_account, public.payers.sender_account);
  else
    insert into public.payers (customer_id, sender_name, sender_account, learned_at_business)
    values (p_customer_id, p_tx.sender_name, p_tx.sender_account, p_tx.business_id)
    on conflict (customer_id, sender_account) where sender_account is not null and sender_key is null
    do update set last_seen_at = now();
  end if;
end $$;

-- Count an incoming payment for a member. Used by the matcher (server) and by
-- the business when it picks the customer. Safe to call twice.
--   p_purchase_id: link to a purchase the business already recorded instead of
--   adding a new one (so the same money isn't counted twice).
create or replace function public.settle_bank_transaction(
  p_tx_id uuid,
  p_membership_id uuid,
  p_method text,
  p_purchase_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  m public.memberships;
  v_purchase uuid;
begin
  select * into t from public.bank_transactions where id = p_tx_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if t.status = 'matched' then
    return t.purchase_id;
  end if;
  select * into m from public.memberships where id = p_membership_id and business_id = t.business_id;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if p_purchase_id is not null then
    select id into v_purchase from public.purchases
    where id = p_purchase_id and membership_id = m.id and source = 'business'
      and not exists (select 1 from public.bank_transactions b where b.purchase_id = p_purchase_id);
    if v_purchase is null then
      raise exception 'Purchase not found' using errcode = 'P0002';
    end if;
  else
    insert into public.purchases (business_id, membership_id, customer_id, amount, currency, paid_at,
      source, match_method, status, reviewed_at)
    values (t.business_id, m.id, m.customer_id, t.amount, t.currency, t.paid_at,
      'bank', p_method, 'verified', now())
    returning id into v_purchase;
  end if;

  update public.bank_transactions
  set status = 'matched', purchase_id = v_purchase, match_method = p_method
  where id = t.id;
  if p_method = 'manual' then
    delete from public.bank_sender_rejections
    where membership_id = m.id and sender in (t.sender_key, t.sender_account);
  end if;

  perform public.learn_payer(m.customer_id, t);
  return v_purchase;
end $$;

-- =============================================================================
-- What businesses can do
-- =============================================================================

-- Payments that came in but nobody has been matched to yet.
create or replace function public.business_unmatched_payments(p_business_id uuid)
returns table (
  id uuid,
  amount numeric,
  currency text,
  paid_at timestamptz,
  narration text,
  sender_name text,
  bank_label text
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.amount, t.currency, t.paid_at, t.narration, t.sender_name,
    case when c.id is not null then coalesce(c.institution, 'Bank') ||
      coalesce(' •••' || right(c.account_number, 4), '') end
  from public.bank_transactions t
  left join public.bank_connections c on c.id = t.connection_id
  where t.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and t.status = 'unmatched'
    and t.paid_at > now() - interval '45 days'
  order by t.paid_at desc
  limit 200;
$$;

-- "This was Member #0012."
create or replace function public.assign_bank_payment(p_tx_id uuid, p_membership_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.bank_transactions where id = p_tx_id;
  if v_business is null or not public.is_business_owner(v_business) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  return public.settle_bank_transaction(p_tx_id, p_membership_id, 'manual');
end $$;

-- "Not a customer" — skip this payment, and optionally everything from this sender.
create or replace function public.ignore_bank_payment(p_tx_id uuid, p_always boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
begin
  select * into t from public.bank_transactions where id = p_tx_id;
  if not found or not public.is_business_owner(t.business_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  update public.bank_transactions set status = 'ignored' where id = t.id and status = 'unmatched';
  if p_always and t.sender_key is not null then
    update public.businesses
    set ignored_senders = array_append(ignored_senders, t.sender_key)
    where id = t.business_id and not (t.sender_key = any (ignored_senders));
    update public.bank_transactions set status = 'ignored'
    where business_id = t.business_id and status = 'unmatched' and sender_key = t.sender_key;
  end if;
end $$;

-- "Wrong customer" — undo a bank match and forget that sender for that member.
create or replace function public.unmatch_bank_payment(p_purchase_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.purchases;
  t public.bank_transactions;
begin
  select * into p from public.purchases where id = p_purchase_id;
  if not found or not public.is_business_owner(p.business_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  select * into t from public.bank_transactions where purchase_id = p.id;
  if not found then
    raise exception 'This payment did not come from your bank feed' using errcode = 'P0002';
  end if;

  update public.bank_transactions set status = 'unmatched', purchase_id = null, match_method = null
  where id = t.id;
  -- A purchase the business typed in stays; one we added from the bank goes.
  if p.source = 'bank' then
    delete from public.purchases where id = p.id;
  end if;
  insert into public.bank_sender_rejections (membership_id, sender)
  select p.membership_id, x from unnest(array[t.sender_key, t.sender_account]) x where x is not null
  on conflict do nothing;
  delete from public.payers
  where customer_id = p.customer_id
    and ((t.sender_key is not null and sender_key = t.sender_key)
      or (t.sender_account is not null and sender_account = t.sender_account));
end $$;

-- Payments list: also say who the bank says sent the money.
drop function public.business_purchases(uuid, public.purchase_status, uuid, integer);
create function public.business_purchases(
  p_business_id uuid,
  p_status public.purchase_status default null,
  p_membership_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  membership_id uuid,
  member_no integer,
  member_name text,
  amount numeric,
  currency text,
  paid_at timestamptz,
  description text,
  reference text,
  source text,
  match_method text,
  status public.purchase_status,
  has_receipt boolean,
  bank_label text,
  created_at timestamptz,
  sender_name text,
  from_bank boolean
)
language sql stable security definer set search_path = '' as $$
  select x.id, x.membership_id, m.member_no,
    case when m.share_details then pr.full_name end,
    x.amount, x.currency, x.paid_at, x.description, x.reference,
    x.source, coalesce(t.match_method, x.match_method),
    x.status, x.receipt_path is not null,
    case
      when b.id is not null then b.bank_name || ' •••' || right(b.account_number, 4)
      when c.id is not null then coalesce(c.institution, 'Bank') || coalesce(' •••' || right(c.account_number, 4), '')
    end,
    x.created_at, t.sender_name, t.id is not null
  from public.purchases x
  join public.memberships m on m.id = x.membership_id
  join public.profiles pr on pr.id = x.customer_id
  left join public.bank_accounts b on b.id = x.bank_account_id
  left join public.bank_transactions t on t.purchase_id = x.id
  left join public.bank_connections c on c.id = t.connection_id
  where x.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and (p_status is null or x.status = p_status)
    and (p_membership_id is null or x.membership_id = p_membership_id)
  order by x.paid_at desc, x.created_at desc
  limit least(coalesce(p_limit, 200), 1000);
$$;

-- Home screen numbers: add payments waiting for "who paid this?".
drop function public.business_stats(uuid);
create function public.business_stats(p_business_id uuid)
returns table (
  members bigint,
  members_new bigint,
  sales_week numeric,
  purchases_week bigint,
  pending bigint,
  rewards_ready bigint,
  referred_members bigint,
  unmatched bigint
)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.memberships where business_id = p_business_id),
    (select count(*) from public.memberships
      where business_id = p_business_id and joined_at > now() - interval '7 days'),
    (select coalesce(sum(amount), 0) from public.purchases
      where business_id = p_business_id and status = 'verified' and paid_at > now() - interval '7 days'),
    (select count(*) from public.purchases
      where business_id = p_business_id and status = 'verified' and paid_at > now() - interval '7 days'),
    (select count(*) from public.purchases where business_id = p_business_id and status = 'pending'),
    (select count(*) from public.rewards
      where business_id = p_business_id and status = 'available'
        and (expires_at is null or expires_at > now())),
    (select count(*) from public.memberships
      where business_id = p_business_id and referred_by is not null),
    (select count(*) from public.bank_transactions
      where business_id = p_business_id and status = 'unmatched' and paid_at > now() - interval '45 days')
  where public.is_business_owner(p_business_id);
$$;

-- =============================================================================
-- Row Level Security and permissions
-- =============================================================================

alter table public.bank_connections enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.payers enable row level security;
alter table public.bank_sender_rejections enable row level security;

create policy "Owners see their bank connections" on public.bank_connections
  for select to authenticated using (public.is_business_owner(business_id));
create policy "Owners see money coming in" on public.bank_transactions
  for select to authenticated using (public.is_business_owner(business_id));
create policy "Customers see payers recognised as them" on public.payers
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "Customers remove payers" on public.payers
  for delete to authenticated using (customer_id = (select auth.uid()));

revoke all on public.bank_connections, public.bank_transactions, public.payers, public.bank_sender_rejections
  from anon, authenticated;
-- The Mono account id stays on the server.
grant select (id, business_id, institution, account_name, account_number, currency, status, last_error,
  last_synced_at, created_at) on public.bank_connections to authenticated;
grant select on public.bank_transactions to authenticated;
grant select, delete on public.payers to authenticated;
grant all on public.bank_connections, public.bank_transactions, public.payers, public.bank_sender_rejections
  to service_role;

revoke execute on function public.learn_payer(uuid, public.bank_transactions) from public, anon, authenticated;
revoke execute on function public.settle_bank_transaction(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.settle_bank_transaction(uuid, uuid, text, uuid) to service_role;

revoke execute on function public.business_unmatched_payments(uuid) from public, anon;
revoke execute on function public.assign_bank_payment(uuid, uuid) from public, anon;
revoke execute on function public.ignore_bank_payment(uuid, boolean) from public, anon;
revoke execute on function public.unmatch_bank_payment(uuid) from public, anon;
revoke execute on function public.business_purchases(uuid, public.purchase_status, uuid, integer) from public, anon;
revoke execute on function public.business_stats(uuid) from public, anon;
grant execute on function public.business_unmatched_payments(uuid) to authenticated;
grant execute on function public.assign_bank_payment(uuid, uuid) to authenticated;
grant execute on function public.ignore_bank_payment(uuid, boolean) to authenticated;
grant execute on function public.unmatch_bank_payment(uuid) to authenticated;
grant execute on function public.business_purchases(uuid, public.purchase_status, uuid, integer) to authenticated;
grant execute on function public.business_stats(uuid) to authenticated;

$spendbox_update_3$;
  end if;
end $outer$;

-- Update 4: 20261004000000_sales.sql
do $outer$ begin
  if not (to_regclass('public.bank_transactions_paid_idx') is not null) then
    execute $spendbox_update_4$
-- =============================================================================
-- Spendbox update 4: sales from the bank, on the business's home screen.
--
-- Keeps the account balance Mono reports, brings in the account's past
-- payments (marked "history": shown in sales, never matched to members), and
-- adds totals per day and per month.
--
-- Run this after 20261003000000_bank_feeds.sql.
-- =============================================================================

alter table public.bank_connections
  add column balance numeric(16, 2),
  add column balance_at timestamptz,
  add column data_status text,
  add column history_synced_at timestamptz,
  add column last_fetch_count integer;

grant select (balance, balance_at, data_status, history_synced_at, last_fetch_count)
  on public.bank_connections to authenticated;

-- Payments from before the bank was connected: sales history only.
alter table public.bank_transactions drop constraint bank_transactions_status_check;
alter table public.bank_transactions add constraint bank_transactions_status_check
  check (status in ('unmatched', 'matched', 'ignored', 'history'));

create index bank_transactions_paid_idx on public.bank_transactions (business_id, paid_at desc);

-- Money in per day for one month (days in the business's time zone).
-- "Not a customer" payments (status ignored) are left out: they aren't sales.
create or replace function public.business_sales_days(p_business_id uuid, p_month date, p_tz text default 'Africa/Lagos')
returns table (day date, total numeric, payments bigint, from_members bigint)
language sql stable security definer set search_path = '' as $$
  select (t.paid_at at time zone p_tz)::date as day,
    sum(t.amount), count(*), count(*) filter (where t.status = 'matched')
  from public.bank_transactions t
  where t.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and t.status <> 'ignored'
    and (t.paid_at at time zone p_tz) >= date_trunc('month', p_month)
    and (t.paid_at at time zone p_tz) < date_trunc('month', p_month) + interval '1 month'
  group by 1
  order by 1;
$$;

-- Money in per month (the last two years), newest first.
create or replace function public.business_sales_months(p_business_id uuid, p_tz text default 'Africa/Lagos')
returns table (month date, total numeric, payments bigint)
language sql stable security definer set search_path = '' as $$
  select date_trunc('month', t.paid_at at time zone p_tz)::date, sum(t.amount), count(*)
  from public.bank_transactions t
  where t.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and t.status <> 'ignored'
    and t.paid_at > now() - interval '25 months'
  group by 1
  order by 1 desc;
$$;

revoke execute on function public.business_sales_days(uuid, date, text) from public, anon;
revoke execute on function public.business_sales_months(uuid, text) from public, anon;
grant execute on function public.business_sales_days(uuid, date, text) to authenticated;
grant execute on function public.business_sales_months(uuid, text) to authenticated;

$spendbox_update_4$;
  end if;
end $outer$;

-- Update 5: 20261005000000_partners.sql
do $outer$ begin
  if not (to_regclass('public.partnerships') is not null) then
    execute $spendbox_update_5$
-- =============================================================================
-- Spendbox update 5: cross-promotion between businesses, and a perk fix.
--
-- Businesses switch cross-promotion on, find other businesses on Spendbox
-- (by name or category) and partner with up to 2 of them. Once both sides
-- agree (or the other business approves requests automatically), each one's
-- perks show to the other's customers as "from our partners".
--
-- Run this after 20261004000000_sales.sql.
-- =============================================================================

-- Perk fix -------------------------------------------------------------------
-- A perk's time limit comes only from what the business chose. Birthday treats
-- used to run out at the end of the birthday month even when the business
-- picked "no time limit", so customers saw a countdown they shouldn't.

create or replace function public.trg_reward_set_expiry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_days integer;
begin
  select valid_days into v_days from public.perks where id = new.perk_id;
  new.expires_at := case when v_days is null then null else new.issued_at + make_interval(days => v_days) end;
  return new;
end $$;

update public.rewards r set expires_at = null
from public.perks p
where p.id = r.perk_id and p.valid_days is null and r.expires_at is not null and r.status = 'available';

-- Cross-promotion settings -----------------------------------------------------

alter table public.businesses
  add column partners_enabled boolean not null default false,
  add column partners_auto_approve boolean not null default false;

grant update (partners_enabled, partners_auto_approve) on public.businesses to authenticated;

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.businesses (id) on delete cascade,
  partner_id uuid not null references public.businesses (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> partner_id)
);

-- One partnership per pair of businesses, whoever asked.
create unique index partnerships_pair on public.partnerships
  (least(requester_id, partner_id), greatest(requester_id, partner_id));
create index partnerships_partner_idx on public.partnerships (partner_id);

alter table public.partnerships enable row level security;
-- Only through the functions below.
revoke all on public.partnerships from anon, authenticated;
grant all on public.partnerships to service_role;

/** Most partners a business can have (active, plus requests it has sent). */
create or replace function public.partner_limit() returns integer
language sql immutable as $$ select 2 $$;

-- Places a business has used: active partnerships plus requests it sent.
create or replace function public.partner_slots_used(p_business_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.partnerships
  where (status = 'active' and (requester_id = p_business_id or partner_id = p_business_id))
     or (status = 'pending' and requester_id = p_business_id);
$$;

-- Other businesses that have cross-promotion on, with what a business needs to
-- decide: categories, how many customers, whether they approve automatically,
-- and where things stand between the two.
create or replace function public.partner_directory(p_business_id uuid, p_query text default null, p_category text default null)
returns table (
  id uuid,
  name text,
  slug text,
  categories text[],
  location text,
  logo_url text,
  brand_color text,
  members bigint,
  auto_approve boolean,
  is_full boolean,
  relation text,
  partnership_id uuid
)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.slug, b.categories, b.location, b.logo_url, b.brand_color,
    (select count(*) from public.memberships m where m.business_id = b.id),
    b.partners_auto_approve,
    public.partner_slots_used(b.id) >= public.partner_limit(),
    case
      when p.id is null then 'none'
      when p.status = 'active' then 'active'
      when p.requester_id = p_business_id then 'sent'
      else 'received'
    end,
    p.id
  from public.businesses b
  left join public.partnerships p
    on (p.requester_id = p_business_id and p.partner_id = b.id)
    or (p.partner_id = p_business_id and p.requester_id = b.id)
  where public.is_business_owner(p_business_id)
    and b.id <> p_business_id
    and (b.partners_enabled or p.id is not null)
    and (coalesce(trim(p_query), '') = ''
      or b.name ilike '%' || trim(p_query) || '%'
      or exists (select 1 from unnest(b.categories) c where c ilike '%' || trim(p_query) || '%')
      or b.location ilike '%' || trim(p_query) || '%')
    and (p_category is null or p_category = any (b.categories) or b.category = p_category)
  order by (p.id is not null) desc, 8 desc, b.name
  limit 60;
$$;

-- "Partner with them." Returns 'active' (they approve automatically) or 'pending'.
create or replace function public.request_partnership(p_business_id uuid, p_partner_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me public.businesses;
  them public.businesses;
  v_status text;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  -- Lock both businesses (in a fixed order) so two requests can't both take the last place.
  perform 1 from public.businesses where id in (p_business_id, p_partner_id) order by id for update;
  select * into me from public.businesses where id = p_business_id;
  select * into them from public.businesses where id = p_partner_id;
  if them.id is null or them.id = me.id then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  if not me.partners_enabled then
    raise exception 'Switch on cross-promotion first' using errcode = 'P0001';
  end if;
  if not them.partners_enabled then
    raise exception '% isn''t taking partners right now', them.name using errcode = 'P0001';
  end if;
  if exists (select 1 from public.partnerships where least(requester_id, partner_id) = least(me.id, them.id)
      and greatest(requester_id, partner_id) = greatest(me.id, them.id)) then
    raise exception 'You''ve already asked %', them.name using errcode = 'P0001';
  end if;
  if public.partner_slots_used(me.id) >= public.partner_limit() then
    raise exception 'You can partner with up to % businesses', public.partner_limit() using errcode = 'P0001';
  end if;
  if public.partner_slots_used(them.id) >= public.partner_limit() then
    raise exception '% already has % partners', them.name, public.partner_limit() using errcode = 'P0001';
  end if;

  v_status := case when them.partners_auto_approve then 'active' else 'pending' end;
  insert into public.partnerships (requester_id, partner_id, status, responded_at)
  values (me.id, them.id, v_status, case when v_status = 'active' then now() end);
  return v_status;
end $$;

-- Accept or decline a request another business sent.
create or replace function public.respond_partnership(p_business_id uuid, p_partnership_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.partnerships;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  select * into p from public.partnerships where id = p_partnership_id and partner_id = p_business_id and status = 'pending';
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if not p_accept then
    delete from public.partnerships where id = p.id;
    return;
  end if;
  perform 1 from public.businesses where id in (p.requester_id, p.partner_id) order by id for update;
  if public.partner_slots_used(p_business_id) >= public.partner_limit() then
    raise exception 'You already have % partners. Remove one first.', public.partner_limit() using errcode = 'P0001';
  end if;
  update public.partnerships set status = 'active', responded_at = now() where id = p.id;
end $$;

-- Cancel a request, or end a partnership (either side can).
create or replace function public.end_partnership(p_business_id uuid, p_partnership_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  delete from public.partnerships
  where id = p_partnership_id and (requester_id = p_business_id or partner_id = p_business_id);
  if not found then
    raise exception 'Partnership not found' using errcode = 'P0002';
  end if;
end $$;

-- How many partner requests are waiting for this business to answer.
create or replace function public.partner_requests_waiting(p_business_id uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.partnerships
  where partner_id = p_business_id and status = 'pending' and public.is_business_owner(p_business_id);
$$;

-- Customers: perks from the partners of the businesses they belong to.
-- Only live partnerships where both sides still have cross-promotion on.
create or replace function public.partner_perks(p_business_ids uuid[])
returns table (
  via_business_id uuid,
  partner_id uuid,
  partner_name text,
  partner_slug text,
  partner_categories text[],
  partner_location text,
  partner_logo_url text,
  partner_color text,
  perk_id uuid,
  kind public.perk_kind,
  title text,
  details text,
  threshold numeric,
  valid_days integer
)
language sql stable security definer set search_path = '' as $$
  select via.id, b.id, b.name, b.slug, b.categories, b.location, b.logo_url, b.brand_color,
    k.id, k.kind, k.title, k.details, k.threshold, k.valid_days
  from public.partnerships p
  join public.businesses via on via.id in (p.requester_id, p.partner_id)
  join public.businesses b on b.id in (p.requester_id, p.partner_id) and b.id <> via.id
  join public.perks k on k.business_id = b.id and k.is_active
  where p.status = 'active'
    and via.id = any (p_business_ids)
    and via.partners_enabled and b.partners_enabled
  order by b.name, k.created_at;
$$;

revoke execute on function public.partner_slots_used(uuid) from public, anon, authenticated;
revoke execute on function public.partner_directory(uuid, text, text) from public, anon;
revoke execute on function public.request_partnership(uuid, uuid) from public, anon;
revoke execute on function public.respond_partnership(uuid, uuid, boolean) from public, anon;
revoke execute on function public.end_partnership(uuid, uuid) from public, anon;
revoke execute on function public.partner_perks(uuid[]) from public, anon;
revoke execute on function public.partner_requests_waiting(uuid) from public, anon;
grant execute on function public.partner_requests_waiting(uuid) to authenticated;
grant execute on function public.partner_directory(uuid, text, text) to authenticated;
grant execute on function public.request_partnership(uuid, uuid) to authenticated;
grant execute on function public.respond_partnership(uuid, uuid, boolean) to authenticated;
grant execute on function public.end_partnership(uuid, uuid) to authenticated;
grant execute on function public.partner_perks(uuid[]) to authenticated;

$spendbox_update_5$;
  end if;
end $outer$;

-- Update 6: 20261006000000_activity_and_accounts.sql
do $outer$ begin
  if not (to_regclass('public.audit_events') is not null) then
    execute $spendbox_update_6$
-- =============================================================================
-- Spendbox update 6: an activity log customers can see, undoing a typed-in
-- purchase within an hour, and customers' own bank accounts.
--
-- Run this after 20261005000000_partners.sql.
-- =============================================================================

-- Activity log ----------------------------------------------------------------
-- Everything a business does that touches a customer's purchases or perks is
-- written here automatically, so the customer can see it ("transparency").

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  membership_id uuid,
  kind text not null check (kind in (
    'purchase_recorded', 'purchase_bank', 'purchase_receipt', 'purchase_confirmed', 'purchase_rejected',
    'purchase_deleted', 'purchase_unmatched',
    'perk_earned', 'perk_given', 'perk_ungiven', 'perk_taken_back', 'perk_restored', 'perk_deleted'
  )),
  title text,
  amount numeric(14, 2),
  currency text,
  created_at timestamptz not null default now()
);

create index audit_events_customer_idx on public.audit_events (customer_id, created_at desc);
create index audit_events_business_idx on public.audit_events (business_id, created_at desc);

create or replace function public.log_event(
  p_business_id uuid, p_customer_id uuid, p_membership_id uuid, p_kind text,
  p_title text default null, p_amount numeric default null, p_currency text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Skip while a membership or account is being deleted (nothing to tell anyone).
  if p_membership_id is not null and not exists (select 1 from public.memberships where id = p_membership_id) then
    return;
  end if;
  insert into public.audit_events (business_id, customer_id, membership_id, kind, title, amount, currency)
  values (p_business_id, p_customer_id, p_membership_id, p_kind, p_title, p_amount, p_currency);
end $$;

create or replace function public.trg_audit_purchase() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.business_id, new.customer_id, new.membership_id,
      case new.source when 'business' then 'purchase_recorded' when 'bank' then 'purchase_bank' else 'purchase_receipt' end,
      new.description, new.amount, new.currency);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status and new.status in ('verified', 'rejected') then
      perform public.log_event(new.business_id, new.customer_id, new.membership_id,
        case new.status when 'verified' then 'purchase_confirmed' else 'purchase_rejected' end,
        new.description, new.amount, new.currency);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_event(old.business_id, old.customer_id, old.membership_id,
      case when old.source = 'bank' then 'purchase_unmatched' else 'purchase_deleted' end,
      old.description, old.amount, old.currency);
  end if;
  return null;
end $$;

create trigger purchases_audit after insert or update of status or delete on public.purchases
for each row execute function public.trg_audit_purchase();

create or replace function public.trg_audit_reward() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.business_id, new.customer_id, new.membership_id, 'perk_earned', new.title);
  elsif new.status is distinct from old.status then
    perform public.log_event(new.business_id, new.customer_id, new.membership_id,
      case
        when new.status = 'redeemed' then 'perk_given'
        when old.status = 'redeemed' then 'perk_ungiven'
        when new.status = 'void' then 'perk_taken_back'
        else 'perk_restored'
      end,
      new.title);
  end if;
  return null;
end $$;

create trigger rewards_audit after insert or update of status on public.rewards
for each row execute function public.trg_audit_reward();

-- A business deleting a perk card tells everyone who still had it to use.
create or replace function public.trg_audit_perk_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events (business_id, customer_id, membership_id, kind, title)
  select r.business_id, r.customer_id, r.membership_id, 'perk_deleted', old.title
  from public.rewards r
  where r.perk_id = old.id and r.status = 'available';
  return old;
end $$;

create trigger perks_audit_delete before delete on public.perks
for each row execute function public.trg_audit_perk_deleted();

alter table public.audit_events enable row level security;
create policy "Customers see their activity" on public.audit_events
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "Owners see their business's activity" on public.audit_events
  for select to authenticated using (public.is_business_owner(business_id));
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;

-- Undo a typed-in purchase (within an hour) -----------------------------------

create or replace function public.delete_recorded_purchase(p_purchase_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.purchases;
begin
  select * into p from public.purchases where id = p_purchase_id;
  if not found or not public.is_business_owner(p.business_id) or p.source <> 'business' then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if p.created_at < now() - interval '1 hour' then
    raise exception 'Purchases can only be deleted within an hour of adding them' using errcode = 'P0001';
  end if;
  -- If a bank payment was linked to it, that payment waits to be matched again.
  update public.bank_transactions set status = 'unmatched', purchase_id = null, match_method = null
  where purchase_id = p.id;
  delete from public.purchases where id = p.id;
end $$;

-- Customers' own bank accounts -------------------------------------------------
-- A customer adds the accounts they usually pay from. The server confirms the
-- name with the bank (Paystack) and saves it as a recognised sender, which is
-- what the payment matcher uses. Their Spendbox name comes from the first one.

alter table public.payers
  add column bank_code text check (char_length(bank_code) <= 20),
  add column verified boolean not null default false;

-- A verified account belongs to one Spendbox customer.
create unique index payers_verified_account on public.payers (sender_account) where verified;

-- Names now come from the bank, so customers can't type their own.
revoke update (full_name) on public.profiles from authenticated;

revoke execute on function public.log_event(uuid, uuid, uuid, text, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.trg_audit_purchase() from public, anon, authenticated;
revoke execute on function public.trg_audit_reward() from public, anon, authenticated;
revoke execute on function public.trg_audit_perk_deleted() from public, anon, authenticated;
revoke execute on function public.delete_recorded_purchase(uuid) from public, anon;
grant execute on function public.delete_recorded_purchase(uuid) to authenticated;

$spendbox_update_6$;
  end if;
end $outer$;

-- Update 7: 20261007000000_pay_accounts.sql
do $outer$ begin
  if not (to_regprocedure('public.business_pay_accounts(uuid)') is not null) then
    execute $spendbox_update_7$
-- =============================================================================
-- Spendbox update 7: members can see where to pay.
--
-- A business's members (and the owner) can see the bank accounts it gets paid
-- into, so they can transfer to the right one. Nobody else can.
--
-- Run this after 20261006000000_activity_and_accounts.sql.
-- =============================================================================

create or replace function public.business_pay_accounts(p_business_id uuid)
returns table (institution text, account_name text, account_number text)
language sql stable security definer set search_path = '' as $$
  with allowed as (
    select 1 where public.is_business_owner(p_business_id)
      or exists (select 1 from public.memberships m where m.business_id = p_business_id and m.customer_id = (select auth.uid()))
  ),
  accounts as (
    select c.institution, c.account_name, c.account_number
    from public.bank_connections c
    where c.business_id = p_business_id and c.account_number is not null
    union
    select b.bank_name, b.account_name, b.account_number
    from public.bank_accounts b
    where b.business_id = p_business_id
  )
  select a.institution, a.account_name, a.account_number
  from accounts a, allowed
  order by a.institution;
$$;

revoke execute on function public.business_pay_accounts(uuid) from public, anon;
grant execute on function public.business_pay_accounts(uuid) to authenticated;

$spendbox_update_7$;
  end if;
end $outer$;

-- Update 8: 20261008000000_admin.sql
do $outer$ begin
  if not (to_regclass('public.app_settings') is not null) then
    execute $spendbox_update_8$
-- =============================================================================
-- Spendbox update 8: the admin area (/admin).
--
-- App-wide switches (free trial, sign-ups, joins, emails…), the admin team and
-- their roles, a log of everything admins do, pausing a business or a
-- customer, and a per-business free-trial end date.
--
-- Only the server (service role) can read or change any of this. Run this
-- after 20261007000000_pay_accounts.sql.
-- =============================================================================

-- Switches -------------------------------------------------------------------

create table public.app_settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- The admin team (people who sign in with their Spendbox phone number) -------
-- The main admin signs in with ADMIN_EMAIL / ADMIN_PASSWORD instead and is not
-- in this table.

create table public.admin_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('viewer', 'support', 'manager')),
  added_by text,
  created_at timestamptz not null default now()
);

-- What admins did --------------------------------------------------------------

create table public.admin_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target_type text,
  target_id text,
  summary text check (char_length(summary) <= 300)
);

create index admin_log_created_idx on public.admin_log (created_at desc);
create index admin_log_failed_idx on public.admin_log (target_id, created_at desc) where action = 'login_failed';

alter table public.app_settings enable row level security;
alter table public.admin_members enable row level security;
alter table public.admin_log enable row level security;
revoke all on public.app_settings, public.admin_members, public.admin_log from public, anon, authenticated;

-- Pausing, and a trial date per business ------------------------------------

alter table public.businesses
  add column suspended_at timestamptz,
  -- Null = the usual length from sign-up (set in the admin area).
  add column trial_ends_at timestamptz;

alter table public.profiles add column suspended_at timestamptz;

create index businesses_created_idx on public.businesses (created_at desc);
create index profiles_created_idx on public.profiles (created_at desc);

-- Reads one switch (null if it was never set).
create or replace function public.app_setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.app_settings where key = p_key;
$$;

-- New businesses can be paused from the admin area.
create or replace function public.guard_new_business() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and coalesce((public.app_setting('signups_open'))::boolean, true) = false then
    raise exception 'New businesses are paused for now. Please check back soon.';
  end if;
  return new;
end $$;

create trigger businesses_guard_new before insert on public.businesses
for each row execute function public.guard_new_business();

-- Joining can be paused for everyone, and a paused business takes no new members.
create or replace function public.guard_new_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if coalesce((public.app_setting('joins_open'))::boolean, true) = false then
    raise exception 'Spendbox isn''t taking new members right now. Please try again soon.';
  end if;
  if exists (select 1 from public.businesses where id = new.business_id and suspended_at is not null) then
    raise exception 'This business isn''t taking new members right now.';
  end if;
  return new;
end $$;

create trigger memberships_guard_new before insert on public.memberships
for each row execute function public.guard_new_membership();

-- Dashboard numbers in one trip -----------------------------------------------

create or replace function public.admin_overview(p_trial_days integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with days as (
    select generate_series(current_date - 29, current_date, interval '1 day')::date as day
  ),
  trial as (
    select b.id, coalesce(b.trial_ends_at, b.created_at + make_interval(days => p_trial_days)) > now() as on_trial
    from public.businesses b
  )
  select jsonb_build_object(
    'businesses', (select count(*) from public.businesses),
    'businesses_7d', (select count(*) from public.businesses where created_at > now() - interval '7 days'),
    'businesses_paused', (select count(*) from public.businesses where suspended_at is not null),
    'on_trial', (select count(*) from trial where on_trial),
    'trial_ended', (select count(*) from trial where not on_trial),
    'accounts', (select count(*) from public.profiles),
    'customers', (select count(distinct customer_id) from public.memberships),
    'customers_7d', (select count(*) from public.profiles p
                     where p.created_at > now() - interval '7 days'
                       and exists (select 1 from public.memberships m where m.customer_id = p.id)),
    'customers_paused', (select count(*) from public.profiles where suspended_at is not null),
    'memberships', (select count(*) from public.memberships),
    'purchases_30d', (select count(*) from public.purchases where status = 'verified' and paid_at > now() - interval '30 days'),
    'sales_30d', (select coalesce(sum(amount), 0) from public.purchases where status = 'verified' and paid_at > now() - interval '30 days'),
    'banks_connected', (select count(distinct business_id) from public.bank_connections where status = 'active'),
    'perks_given_30d', (select count(*) from public.rewards where redeemed_at > now() - interval '30 days'),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'businesses', (select count(*) from public.businesses b where b.created_at::date = d.day),
        'members', (select count(*) from public.memberships m where m.joined_at::date = d.day)
      ) order by d.day)
      from days d
    )
  );
$$;

-- Lists with search and paging ------------------------------------------------

create or replace function public.admin_businesses(p_query text, p_filter text, p_limit integer, p_offset integer, p_trial_days integer)
returns table (
  id uuid, name text, slug text, category text, location text, created_at timestamptz,
  suspended_at timestamptz, trial_ends timestamptz, owner_id uuid, owner_phone text,
  members bigint, sales_30d numeric, bank_connected boolean, total bigint
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select b.*, coalesce(b.trial_ends_at, b.created_at + make_interval(days => p_trial_days)) as trial_ends
    from public.businesses b
    where (coalesce(p_query, '') = ''
           or b.name ilike '%' || p_query || '%'
           or b.slug ilike '%' || p_query || '%'
           or exists (select 1 from public.profiles o where o.id = b.owner_id and o.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%' and regexp_replace(p_query, '\D', '', 'g') <> ''))
  ),
  filtered as (
    select * from base
    where case coalesce(p_filter, 'all')
      when 'paused' then suspended_at is not null
      when 'trial' then trial_ends > now()
      when 'trial_ended' then trial_ends <= now()
      else true end
  )
  select f.id, f.name, f.slug, f.category, f.location, f.created_at, f.suspended_at, f.trial_ends, f.owner_id,
    (select o.phone from public.profiles o where o.id = f.owner_id),
    (select count(*) from public.memberships m where m.business_id = f.id),
    (select coalesce(sum(p.amount), 0) from public.purchases p where p.business_id = f.id and p.status = 'verified' and p.paid_at > now() - interval '30 days'),
    exists (select 1 from public.bank_connections c where c.business_id = f.id and c.status = 'active'),
    count(*) over ()
  from filtered f
  order by f.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create or replace function public.admin_customers(p_query text, p_filter text, p_limit integer, p_offset integer)
returns table (
  id uuid, phone text, full_name text, email text, created_at timestamptz, suspended_at timestamptz,
  memberships bigint, businesses_owned bigint, total bigint
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.* from public.profiles p
    where (coalesce(p_query, '') = ''
           or p.full_name ilike '%' || p_query || '%'
           or p.email ilike '%' || p_query || '%'
           or (regexp_replace(p_query, '\D', '', 'g') <> '' and p.phone like '%' || regexp_replace(regexp_replace(p_query, '\D', '', 'g'), '^0', '') || '%'))
  ),
  counted as (
    select b.*,
      (select count(*) from public.memberships m where m.customer_id = b.id) as memberships,
      (select count(*) from public.businesses o where o.owner_id = b.id) as businesses_owned
    from base b
  )
  select c.id, c.phone, c.full_name, c.email, c.created_at, c.suspended_at, c.memberships, c.businesses_owned, count(*) over ()
  from counted c
  where case coalesce(p_filter, 'all')
    when 'customers' then c.memberships > 0
    when 'owners' then c.businesses_owned > 0
    when 'paused' then c.suspended_at is not null
    else true end
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

revoke execute on function public.app_setting(text) from public, anon, authenticated;
revoke execute on function public.admin_overview(integer) from public, anon, authenticated;
revoke execute on function public.admin_businesses(text, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_customers(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.app_setting(text) to service_role;
grant execute on function public.admin_overview(integer) to service_role;
grant execute on function public.admin_businesses(text, text, integer, integer, integer) to service_role;
grant execute on function public.admin_customers(text, text, integer, integer) to service_role;
grant all on public.app_settings, public.admin_members, public.admin_log to service_role;

$spendbox_update_8$;
  end if;
end $outer$;

-- Update 9: 20261009000000_email_and_billing.sql
do $outer$ begin
  if not (to_regclass('public.business_payments') is not null) then
    execute $spendbox_update_9$
-- =============================================================================
-- Spendbox update 9: email sign-up, contacting customers, and paid plans.
--
-- - People sign up with an email and password (phone is optional). Emails are
--   confirmed with a link Spendbox sends through Resend.
-- - Businesses can see a member's email (as well as phone) when that member
--   shares their details, so they can get in touch.
-- - Businesses pay monthly (Starter or Plus) after a free trial. Unpaid
--   businesses are paused 14 days after their plan ends (fair use).
--
-- Run this after 20261008000000_admin.sql.
-- =============================================================================

-- Email sign-up -----------------------------------------------------------------

alter table public.profiles add column email_verified_at timestamptz;

-- The login email becomes the profile email (internal phone-login addresses don't).
create or replace function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := case when new.email is not null and new.email not like '%@phone.spendbox.app' then lower(new.email) end;
begin
  insert into public.profiles (id, phone, email)
  values (new.id, new.phone, v_email)
  on conflict (id) do update set phone = excluded.phone, email = coalesce(excluded.email, public.profiles.email);
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.handle_auth_user();

-- Links in emails: confirm an email address, or reset a password. Only the
-- server reads this table; tokens are stored hashed and work once.
create table public.auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('verify_email', 'reset_password')),
  token_hash text not null unique,
  email text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_user_idx on public.auth_tokens (user_id, kind, created_at desc);
alter table public.auth_tokens enable row level security;
revoke all on public.auth_tokens from public, anon, authenticated;
grant all on public.auth_tokens to service_role;

-- Members' contact details for the business (only when shared) ----------------

drop function public.business_members(uuid);
create function public.business_members(p_business_id uuid)
returns table (
  membership_id uuid,
  member_no integer,
  joined_at timestamptz,
  shares_details boolean,
  full_name text,
  phone text,
  email text,
  gender text,
  birth_day smallint,
  birth_month smallint,
  visits bigint,
  total_spent numeric,
  last_visit_at timestamptz,
  rewards_ready bigint,
  referred boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.member_no, m.joined_at, m.share_details,
    case when m.share_details then p.full_name end,
    case when m.share_details then p.phone end,
    case when m.share_details then p.email end,
    case when m.share_details then p.gender end,
    case when m.share_details then p.birth_day end,
    case when m.share_details then p.birth_month end,
    coalesce(s.visits, 0), coalesce(s.total, 0), s.last_at,
    (select count(*) from public.rewards r
      where r.membership_id = m.id and r.status = 'available'
        and (r.expires_at is null or r.expires_at > now())),
    m.referred_by is not null
  from public.memberships m
  join public.profiles p on p.id = m.customer_id
  left join lateral (
    select count(*) as visits, sum(x.amount) as total, max(x.paid_at) as last_at
    from public.purchases x
    where x.membership_id = m.id and x.status = 'verified'
  ) s on true
  where m.business_id = p_business_id and public.is_business_owner(p_business_id)
  order by m.joined_at desc;
$$;
revoke execute on function public.business_members(uuid) from public, anon;
grant execute on function public.business_members(uuid) to authenticated;

-- Plans and payments ------------------------------------------------------------

alter table public.businesses
  add column plan text not null default 'starter' check (plan in ('starter', 'plus')),
  add column paid_until timestamptz,
  -- Why it's paused: 'admin' (from the admin area) or 'billing' (unpaid, fair use).
  add column suspended_reason text check (suspended_reason in ('admin', 'billing')),
  -- The last billing email sent, so each one goes out once.
  add column billing_notice text;

update public.businesses set suspended_reason = 'admin' where suspended_at is not null and suspended_reason is null;

-- Everyone already signed up gets a fresh two-week trial when paid plans start.
update public.businesses
set trial_ends_at = greatest(created_at + interval '14 days', now() + interval '14 days')
where trial_ends_at is null;

-- New businesses start a free trial (length set in the admin area; none if switched off).
create or replace function public.set_business_trial() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_days integer := coalesce((public.app_setting('trial_days'))::integer, 14);
begin
  if new.trial_ends_at is null then
    new.trial_ends_at := case
      when coalesce((public.app_setting('trial_enabled'))::boolean, true) then now() + make_interval(days => v_days)
      else now()
    end;
  end if;
  return new;
end $$;

create trigger businesses_set_trial before insert on public.businesses
for each row execute function public.set_business_trial();

create table public.business_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  reference text not null unique,
  plan text not null check (plan in ('starter', 'plus')),
  months integer not null check (months between 1 and 24),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  method text not null check (method in ('paystack', 'manual')),
  note text check (char_length(note) <= 200),
  recorded_by text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index business_payments_business_idx on public.business_payments (business_id, created_at desc);

alter table public.business_payments enable row level security;
create policy "Owners see their payments" on public.business_payments
  for select to authenticated using (public.is_business_owner(business_id));
revoke all on public.business_payments from public, anon, authenticated;
grant select on public.business_payments to authenticated;
grant all on public.business_payments to service_role;

-- Marks a payment as paid (once) and adds its months to the business's plan,
-- starting from whenever its current trial or plan ends. A business paused for
-- non-payment is switched back on.
create or replace function public.apply_business_payment(p_reference text, p_amount numeric)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.business_payments;
  v_business public.businesses;
  v_start timestamptz;
begin
  select * into v_payment from public.business_payments where reference = p_reference for update;
  if not found or v_payment.status = 'paid' then
    return false;
  end if;
  if p_amount < v_payment.amount then
    update public.business_payments set status = 'failed', note = 'Paid less than the price' where id = v_payment.id;
    return false;
  end if;

  select * into v_business from public.businesses where id = v_payment.business_id for update;
  v_start := greatest(now(), coalesce(v_business.paid_until, now()), coalesce(v_business.trial_ends_at, now()));

  update public.business_payments set status = 'paid', paid_at = now() where id = v_payment.id;
  update public.businesses set
    plan = v_payment.plan,
    paid_until = v_start + make_interval(months => v_payment.months),
    suspended_at = case when suspended_reason = 'billing' then null else suspended_at end,
    suspended_reason = case when suspended_reason = 'billing' then null else suspended_reason end,
    billing_notice = null
  where id = v_business.id;
  return true;
end $$;

revoke execute on function public.apply_business_payment(text, numeric) from public, anon, authenticated;
grant execute on function public.apply_business_payment(text, numeric) to service_role;
revoke execute on function public.set_business_trial() from public, anon, authenticated;

-- Admin numbers: add paying businesses and money in -----------------------------

create or replace function public.admin_overview(p_trial_days integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with days as (
    select generate_series(current_date - 29, current_date, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'businesses', (select count(*) from public.businesses),
    'businesses_7d', (select count(*) from public.businesses where created_at > now() - interval '7 days'),
    'businesses_paused', (select count(*) from public.businesses where suspended_at is not null),
    'on_trial', (select count(*) from public.businesses where trial_ends_at > now() and coalesce(paid_until, trial_ends_at) <= trial_ends_at),
    'trial_ended', (select count(*) from public.businesses where trial_ends_at <= now() and (paid_until is null or paid_until <= now())),
    'paying', (select count(*) from public.businesses where paid_until > now()),
    'revenue_30d', (select coalesce(sum(amount), 0) from public.business_payments where status = 'paid' and paid_at > now() - interval '30 days'),
    'accounts', (select count(*) from public.profiles),
    'customers', (select count(distinct customer_id) from public.memberships),
    'customers_7d', (select count(*) from public.profiles p
                     where p.created_at > now() - interval '7 days'
                       and exists (select 1 from public.memberships m where m.customer_id = p.id)),
    'customers_paused', (select count(*) from public.profiles where suspended_at is not null),
    'memberships', (select count(*) from public.memberships),
    'purchases_30d', (select count(*) from public.purchases where status = 'verified' and paid_at > now() - interval '30 days'),
    'sales_30d', (select coalesce(sum(amount), 0) from public.purchases where status = 'verified' and paid_at > now() - interval '30 days'),
    'banks_connected', (select count(distinct business_id) from public.bank_connections where status = 'active'),
    'perks_given_30d', (select count(*) from public.rewards where redeemed_at > now() - interval '30 days'),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'businesses', (select count(*) from public.businesses b where b.created_at::date = d.day),
        'members', (select count(*) from public.memberships m where m.joined_at::date = d.day)
      ) order by d.day)
      from days d
    )
  );
$$;

-- Business list: filter by billing state, and show when access runs out.
drop function public.admin_businesses(text, text, integer, integer, integer);
create function public.admin_businesses(p_query text, p_filter text, p_limit integer, p_offset integer, p_trial_days integer)
returns table (
  id uuid, name text, slug text, category text, location text, created_at timestamptz,
  suspended_at timestamptz, suspended_reason text, trial_ends timestamptz, paid_until timestamptz, plan text,
  owner_id uuid, owner_phone text, owner_email text,
  members bigint, sales_30d numeric, bank_connected boolean, total bigint
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select b.*, coalesce(b.trial_ends_at, b.created_at + make_interval(days => p_trial_days)) as trial_ends,
      greatest(coalesce(b.trial_ends_at, b.created_at + make_interval(days => p_trial_days)), coalesce(b.paid_until, '-infinity')) as access_until
    from public.businesses b
    where (coalesce(p_query, '') = ''
           or b.name ilike '%' || p_query || '%'
           or b.slug ilike '%' || p_query || '%'
           or exists (select 1 from public.profiles o where o.id = b.owner_id and (
                o.email ilike '%' || p_query || '%'
                or (regexp_replace(p_query, '\D', '', 'g') <> '' and o.phone like '%' || regexp_replace(regexp_replace(p_query, '\D', '', 'g'), '^0', '') || '%'))))
  ),
  filtered as (
    select * from base
    where case coalesce(p_filter, 'all')
      when 'paused' then suspended_at is not null
      when 'trial' then trial_ends > now() and coalesce(paid_until, '-infinity') <= now()
      when 'paying' then paid_until > now()
      when 'due' then access_until <= now() and suspended_at is null
      when 'trial_ended' then access_until <= now()
      else true end
  )
  select f.id, f.name, f.slug, f.category, f.location, f.created_at, f.suspended_at, f.suspended_reason, f.trial_ends, f.paid_until, f.plan,
    f.owner_id,
    (select o.phone from public.profiles o where o.id = f.owner_id),
    (select o.email from public.profiles o where o.id = f.owner_id),
    (select count(*) from public.memberships m where m.business_id = f.id),
    (select coalesce(sum(p.amount), 0) from public.purchases p where p.business_id = f.id and p.status = 'verified' and p.paid_at > now() - interval '30 days'),
    exists (select 1 from public.bank_connections c where c.business_id = f.id and c.status = 'active'),
    count(*) over ()
  from filtered f
  order by f.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;
revoke execute on function public.admin_businesses(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_businesses(text, text, integer, integer, integer) to service_role;

$spendbox_update_9$;
  end if;
end $outer$;

-- Update 10: 20261010000000_requests.sql
do $outer$ begin
  if not (to_regclass('public.requests') is not null) then
    execute $spendbox_update_10$
-- =============================================================================
-- Spendbox update 10: requests.
--
-- Spendbox no longer tracks payments. Instead, customers post what they need
-- (with a budget and photos). For 24 hours the request is seen by the
-- businesses they've joined and, on the Plus plan, by those businesses'
-- partners, who reach out by WhatsApp, phone or email.
--
-- Perks are now only the ones a business can see happen: welcome (joining),
-- invite (a friend joins through your link) and birthday.
--
-- Old payment and bank tables are left as they are (nothing is deleted), but
-- the app no longer uses them. Run this after 20261009000000_email_and_billing.sql.
-- =============================================================================

-- Names are typed by the customer now (they used to come from the bank).
grant update (full_name) on public.profiles to authenticated;

-- Requests ----------------------------------------------------------------------

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 5 and 500),
  category text check (char_length(category) <= 40),
  area text check (char_length(area) <= 80),
  budget_min numeric(14, 2) check (budget_min >= 0),
  budget_max numeric(14, 2) not null check (budget_max > 0 and budget_max <= 1000000000),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  images text[] not null default '{}' check (cardinality(images) <= 4),
  contact_whatsapp boolean not null default true,
  contact_call boolean not null default false,
  contact_email boolean not null default false,
  status text not null default 'open' check (status in ('open', 'found', 'closed')),
  reposted_from uuid references public.requests (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  closed_at timestamptz,
  check (budget_min is null or budget_min <= budget_max),
  check (contact_whatsapp or contact_call or contact_email)
);

create index if not exists requests_customer_idx on public.requests (customer_id, created_at desc);
create index if not exists requests_live_idx on public.requests (expires_at desc) where status = 'open';

alter table public.requests enable row level security;
drop policy if exists "Customers see their requests" on public.requests;
create policy "Customers see their requests" on public.requests
  for select to authenticated using (customer_id = (select auth.uid()));
drop policy if exists "Customers delete their requests" on public.requests;
create policy "Customers delete their requests" on public.requests
  for delete to authenticated using (customer_id = (select auth.uid()));
revoke all on public.requests from public, anon, authenticated;
grant select, delete on public.requests to authenticated;
grant all on public.requests to service_role;

-- Which businesses reached out, and how --------------------------------------

create table if not exists public.request_contacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  method text not null check (method in ('whatsapp', 'call', 'email')),
  created_at timestamptz not null default now(),
  unique (request_id, business_id)
);
create index if not exists request_contacts_business_idx on public.request_contacts (business_id, created_at desc);

alter table public.request_contacts enable row level security;
revoke all on public.request_contacts from public, anon, authenticated;
grant all on public.request_contacts to service_role;

-- Photos on requests: public links with random names. Only the server uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-images', 'request-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Who sees what ------------------------------------------------------------------

-- Plus (or a free trial): also sees requests from partners' customers.
create or replace function public.business_has_plus(b public.businesses) returns boolean
language sql stable set search_path = '' as $$
  select ((b).plan = 'plus' and (b).paid_until > now())
      or (coalesce((b).paid_until, '-infinity') <= now() and (b).trial_ends_at > now());
$$;

-- A business can see a request if the customer is its member or (on Plus) a
-- member of one of its partners. Paused businesses see nothing.
create or replace function public.business_can_see_request(p_business_id uuid, p_request public.requests)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.suspended_at is null
      and (
        exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = (p_request).customer_id)
        or (public.business_has_plus(b) and exists (
          select 1 from public.partnerships p
          join public.memberships m
            on m.business_id = case when p.requester_id = b.id then p.partner_id else p.requester_id end
          where p.status = 'active' and (p.requester_id = b.id or p.partner_id = b.id)
            and m.customer_id = (p_request).customer_id
        ))
      )
  );
$$;

-- Live requests a business can see, newest first, with the contact details the
-- customer chose to show.
create or replace function public.business_requests(p_business_id uuid)
returns table (
  id uuid,
  body text,
  category text,
  area text,
  budget_min numeric,
  budget_max numeric,
  currency text,
  images text[],
  created_at timestamptz,
  expires_at timestamptz,
  customer_name text,
  phone text,
  email text,
  contact_whatsapp boolean,
  contact_call boolean,
  contact_email boolean,
  is_member boolean,
  via_partner text,
  reached_out text,
  reach_outs bigint
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.body, r.category, r.area, r.budget_min, r.budget_max, r.currency, r.images, r.created_at, r.expires_at,
    coalesce(split_part(p.full_name, ' ', 1), 'A customer'),
    case when r.contact_whatsapp or r.contact_call then p.phone end,
    case when r.contact_email then p.email end,
    r.contact_whatsapp and p.phone is not null,
    r.contact_call and p.phone is not null,
    r.contact_email and p.email is not null,
    exists (select 1 from public.memberships m where m.business_id = p_business_id and m.customer_id = r.customer_id),
    (select b2.name from public.partnerships ps
       join public.businesses b2 on b2.id = case when ps.requester_id = p_business_id then ps.partner_id else ps.requester_id end
       join public.memberships m2 on m2.business_id = b2.id and m2.customer_id = r.customer_id
       where ps.status = 'active' and (ps.requester_id = p_business_id or ps.partner_id = p_business_id)
       order by b2.name limit 1),
    (select c.method from public.request_contacts c where c.request_id = r.id and c.business_id = p_business_id),
    (select count(*) from public.request_contacts c where c.request_id = r.id)
  from public.requests r
  join public.profiles p on p.id = r.customer_id
  where public.is_business_owner(p_business_id)
    and r.status = 'open' and r.expires_at > now()
    and r.customer_id <> (select owner_id from public.businesses where id = p_business_id)
    and public.business_can_see_request(p_business_id, r)
  order by r.created_at desc
  limit 200;
$$;

-- "I'm reaching out": recorded so the customer knows who to expect.
create or replace function public.contact_request(p_business_id uuid, p_request_id uuid, p_method text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.requests;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'Not your business' using errcode = '42501';
  end if;
  if p_method not in ('whatsapp', 'call', 'email') then
    raise exception 'Unknown way to reach out';
  end if;
  select * into v_request from public.requests where id = p_request_id;
  if not found or v_request.status <> 'open' or v_request.expires_at <= now()
     or not public.business_can_see_request(p_business_id, v_request) then
    raise exception 'This request has ended' using errcode = 'P0002';
  end if;
  insert into public.request_contacts (request_id, business_id, method)
  values (p_request_id, p_business_id, p_method)
  on conflict (request_id, business_id) do update set method = excluded.method;
end $$;

-- Customers: post, close and repost --------------------------------------------

create or replace function public.post_request(
  p_body text,
  p_budget_max numeric,
  p_budget_min numeric default null,
  p_category text default null,
  p_area text default null,
  p_images text[] default '{}',
  p_whatsapp boolean default true,
  p_call boolean default false,
  p_email boolean default false,
  p_reposted_from uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in first' using errcode = '28000';
  end if;
  if (select count(*) from public.requests where customer_id = v_uid and status = 'open' and expires_at > now()) >= 3 then
    raise exception 'You can have 3 live requests at a time. Close one first.';
  end if;
  if (select count(*) from public.requests where customer_id = v_uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'That''s a lot of requests today. Please try again tomorrow.';
  end if;
  if p_reposted_from is not null and not exists (
    select 1 from public.requests where id = p_reposted_from and customer_id = v_uid
  ) then
    raise exception 'Request not found';
  end if;

  insert into public.requests (customer_id, body, budget_max, budget_min, category, area, images,
                               contact_whatsapp, contact_call, contact_email, reposted_from)
  values (v_uid, trim(p_body), p_budget_max, p_budget_min, nullif(trim(p_category), ''), nullif(trim(p_area), ''),
          coalesce(p_images, '{}'), coalesce(p_whatsapp, false), coalesce(p_call, false), coalesce(p_email, false), p_reposted_from)
  returning id into v_id;
  return v_id;
end $$;

-- "Found my plug" (found) or "Close" (closed).
create or replace function public.close_request(p_request_id uuid, p_found boolean default false)
returns void
language sql security definer set search_path = '' as $$
  update public.requests
  set status = case when p_found then 'found' else 'closed' end, closed_at = now()
  where id = p_request_id and customer_id = (select auth.uid()) and status = 'open';
$$;

-- Businesses that reached out about one of my requests.
create or replace function public.my_request_contacts(p_request_id uuid)
returns table (business_id uuid, name text, slug text, logo_url text, brand_color text, whatsapp text, email text, method text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.slug, b.logo_url, b.brand_color, b.whatsapp, b.email, c.method, c.created_at
  from public.request_contacts c
  join public.requests r on r.id = c.request_id
  join public.businesses b on b.id = c.business_id
  where c.request_id = p_request_id and r.customer_id = (select auth.uid())
  order by c.created_at;
$$;

revoke execute on function public.business_has_plus(public.businesses) from public, anon;
revoke execute on function public.business_can_see_request(uuid, public.requests) from public, anon, authenticated;
revoke execute on function public.business_requests(uuid) from public, anon;
revoke execute on function public.contact_request(uuid, uuid, text) from public, anon;
revoke execute on function public.post_request(text, numeric, numeric, text, text, text[], boolean, boolean, boolean, uuid) from public, anon;
revoke execute on function public.close_request(uuid, boolean) from public, anon;
revoke execute on function public.my_request_contacts(uuid) from public, anon;
grant execute on function public.business_has_plus(public.businesses) to authenticated, service_role;
grant execute on function public.business_requests(uuid) to authenticated;
grant execute on function public.contact_request(uuid, uuid, text) to authenticated;
grant execute on function public.post_request(text, numeric, numeric, text, text, text[], boolean, boolean, boolean, uuid) to authenticated;
grant execute on function public.close_request(uuid, boolean) to authenticated;
grant execute on function public.my_request_contacts(uuid) to authenticated;

-- Perks: only what a business can see happen ------------------------------------

update public.perks set is_active = false where kind in ('visits', 'spend');

create or replace function public.sync_member_rewards(p_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.memberships;
  prof public.profiles;
  p public.perks;
  keys text[];
  today date := (now() at time zone 'utc')::date;
begin
  select * into m from public.memberships where id = p_membership_id;
  if not found then
    return;
  end if;
  select * into prof from public.profiles where id = m.customer_id;

  for p in select * from public.perks where business_id = m.business_id and is_active and kind in ('welcome', 'referral', 'birthday') loop
    keys := '{}';
    if p.kind = 'welcome' then
      -- Only people who join after the perk was created get it.
      if m.joined_at >= p.created_at then
        keys := array['welcome'];
      end if;
    elsif p.kind = 'referral' then
      -- One for every friend who joins through this member's link.
      select coalesce(array_agg('referral:' || f.id), '{}') into keys
      from public.memberships f
      where f.referred_by = m.id and f.joined_at >= p.created_at;
    elsif p.kind = 'birthday' then
      if prof.birth_month is not null and prof.birth_month = extract(month from today) then
        keys := array['birthday:' || extract(year from today)::integer];
      end if;
    end if;

    if cardinality(keys) > 0 then
      insert into public.rewards (business_id, membership_id, customer_id, perk_id, kind, title, issue_key, expires_at)
      select m.business_id, m.id, m.customer_id, p.id, p.kind, p.title, k,
        case when p.kind = 'birthday'
          then (date_trunc('month', today::timestamp) + interval '1 month') at time zone 'utc'
        end
      from unnest(keys) k
      on conflict (membership_id, perk_id, issue_key) do nothing;
    end if;
  end loop;
end $$;

-- A new member also earns the friend who invited them an invite reward.
create or replace function public.trg_membership_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_member_rewards(new.id);
  if new.referred_by is not null then
    perform public.sync_member_rewards(new.referred_by);
  end if;
  return null;
end $$;

-- Admin numbers for the new product ---------------------------------------------

create or replace function public.admin_overview(p_trial_days integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  with days as (
    select generate_series(current_date - 29, current_date, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'businesses', (select count(*) from public.businesses),
    'businesses_7d', (select count(*) from public.businesses where created_at > now() - interval '7 days'),
    'businesses_paused', (select count(*) from public.businesses where suspended_at is not null),
    'on_trial', (select count(*) from public.businesses where trial_ends_at > now() and coalesce(paid_until, trial_ends_at) <= trial_ends_at),
    'trial_ended', (select count(*) from public.businesses where trial_ends_at <= now() and (paid_until is null or paid_until <= now())),
    'paying', (select count(*) from public.businesses where paid_until > now()),
    'revenue_30d', (select coalesce(sum(amount), 0) from public.business_payments where status = 'paid' and paid_at > now() - interval '30 days'),
    'accounts', (select count(*) from public.profiles),
    'customers', (select count(distinct customer_id) from public.memberships),
    'customers_7d', (select count(*) from public.profiles p
                     where p.created_at > now() - interval '7 days'
                       and exists (select 1 from public.memberships m where m.customer_id = p.id)),
    'customers_paused', (select count(*) from public.profiles where suspended_at is not null),
    'memberships', (select count(*) from public.memberships),
    'requests_live', (select count(*) from public.requests where status = 'open' and expires_at > now()),
    'requests_30d', (select count(*) from public.requests where created_at > now() - interval '30 days'),
    'reach_outs_30d', (select count(*) from public.request_contacts where created_at > now() - interval '30 days'),
    'requests_answered_30d', (select count(*) from public.requests r where r.created_at > now() - interval '30 days'
                               and exists (select 1 from public.request_contacts c where c.request_id = r.id)),
    'perks_given_30d', (select count(*) from public.rewards where redeemed_at > now() - interval '30 days'),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'businesses', (select count(*) from public.businesses b where b.created_at::date = d.day),
        'members', (select count(*) from public.memberships m where m.joined_at::date = d.day),
        'requests', (select count(*) from public.requests r where r.created_at::date = d.day)
      ) order by d.day)
      from days d
    )
  );
$$;

$spendbox_update_10$;
  end if;
end $outer$;

-- Update 11: 20261011000000_interests_and_speed.sql
do $outer$ begin
  if not (to_regclass('public.customer_interests') is not null) then
    execute $spendbox_update_11$
-- =============================================================================
-- Spendbox update 11: customer interests, and fewer trips to the database.
--
-- 1. Every request a customer posts is also written to request_signals, which
--    keeps it even if the request is later deleted. From those, Spendbox keeps
--    a running profile per customer (customer_interests): what they ask for
--    most (categories and words), their usual budget, areas, how often they
--    post and how often they find a plug. Only Spendbox (the server and the
--    admin area) can read these; businesses never see them.
-- 2. Two functions that load in one call what used to take several.
--
-- Safe to run more than once. Run this after 20261010000000_requests.sql.
-- =============================================================================

-- What a request was about, kept for understanding interests ----------------------

create table if not exists public.request_signals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid unique references public.requests (id) on delete set null,
  category text,
  area text,
  keywords text[] not null default '{}',
  budget_min numeric(14, 2),
  budget_max numeric(14, 2) not null,
  currency text not null default 'NGN',
  image_count integer not null default 0,
  contact_whatsapp boolean not null default false,
  contact_call boolean not null default false,
  contact_email boolean not null default false,
  is_repost boolean not null default false,
  reach_outs integer not null default 0,
  -- open → found / closed when the customer says so (expired requests stay 'open').
  outcome text not null default 'open' check (outcome in ('open', 'found', 'closed')),
  posted_at timestamptz not null default now(),
  outcome_at timestamptz
);
create index if not exists request_signals_customer_idx on public.request_signals (customer_id, posted_at desc);
create index if not exists request_signals_category_idx on public.request_signals (category);
alter table public.request_signals enable row level security;
revoke all on public.request_signals from anon, authenticated;
grant all on public.request_signals to service_role;

create table if not exists public.customer_interests (
  customer_id uuid primary key references auth.users (id) on delete cascade,
  requests_count integer not null default 0,
  reposts_count integer not null default 0,
  found_count integer not null default 0,
  reach_outs_count integer not null default 0,
  -- {"Bakery & cakes": 3, "Hair & beauty": 1}, most first when read with top_keys().
  categories jsonb not null default '{}',
  keywords jsonb not null default '{}',
  areas jsonb not null default '{}',
  budget_avg numeric(14, 2),
  budget_low numeric(14, 2),
  budget_high numeric(14, 2),
  prefers_whatsapp integer not null default 0,
  prefers_call integer not null default 0,
  prefers_email integer not null default 0,
  first_request_at timestamptz,
  last_request_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.customer_interests enable row level security;
revoke all on public.customer_interests from anon, authenticated;
grant all on public.customer_interests to service_role;

-- The words that say what a request is about: lower case, no filler words.
create or replace function public.request_keywords(p_body text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct w order by w), '{}')
  from regexp_split_to_table(lower(coalesce(p_body, '')), '[^[:alpha:]]+') as w
  where char_length(w) between 3 and 30
    and w <> all (array[
      'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were', 'will', 'can', 'could', 'would',
      'should', 'have', 'has', 'had', 'not', 'but', 'you', 'your', 'our', 'their', 'they', 'them', 'who', 'what',
      'when', 'where', 'which', 'how', 'any', 'some', 'all', 'one', 'two', 'just', 'also', 'very', 'more', 'less',
      'need', 'needs', 'needed', 'want', 'wants', 'looking', 'look', 'please', 'pls', 'abeg', 'someone', 'anyone',
      'urgent', 'urgently', 'asap', 'today', 'tomorrow', 'tonight', 'week', 'weekend', 'next', 'this', 'about',
      'around', 'within', 'into', 'than', 'then', 'there', 'here', 'get', 'got', 'buy', 'make', 'made', 'like',
      'good', 'nice', 'best', 'cheap', 'quality', 'fast', 'quick', 'budget', 'naira', 'price', 'deliver',
      'delivery', 'delivered', 'available', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
      'sunday', 'lagos', 'abuja'
    ]);
$$;

-- {"a": 2, "b": 1} from a list of values (empty and null values are skipped).
create or replace function public.count_values(p_values text[]) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(v, n), '{}')
  from (select v, count(*) as n from unnest(p_values) as v where coalesce(v, '') <> '' group by v) t;
$$;

-- Recomputes one customer's profile from their signals.
create or replace function public.refresh_customer_interests(p_customer_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.customer_interests as ci (
    customer_id, requests_count, reposts_count, found_count, reach_outs_count, categories, keywords, areas,
    budget_avg, budget_low, budget_high, prefers_whatsapp, prefers_call, prefers_email,
    first_request_at, last_request_at, updated_at
  )
  select p_customer_id,
    count(*),
    count(*) filter (where s.is_repost),
    count(*) filter (where s.outcome = 'found'),
    coalesce(sum(s.reach_outs), 0),
    public.count_values(array_agg(s.category)),
    public.count_values((select array_agg(k) from public.request_signals s2, unnest(s2.keywords) k where s2.customer_id = p_customer_id)),
    public.count_values(array_agg(s.area)),
    round(avg(s.budget_max), 2),
    min(coalesce(s.budget_min, s.budget_max)),
    max(s.budget_max),
    count(*) filter (where s.contact_whatsapp),
    count(*) filter (where s.contact_call),
    count(*) filter (where s.contact_email),
    min(s.posted_at),
    max(s.posted_at),
    now()
  from public.request_signals s
  where s.customer_id = p_customer_id
  having count(*) > 0
  on conflict (customer_id) do update set
    requests_count = excluded.requests_count, reposts_count = excluded.reposts_count,
    found_count = excluded.found_count, reach_outs_count = excluded.reach_outs_count,
    categories = excluded.categories, keywords = excluded.keywords, areas = excluded.areas,
    budget_avg = excluded.budget_avg, budget_low = excluded.budget_low, budget_high = excluded.budget_high,
    prefers_whatsapp = excluded.prefers_whatsapp, prefers_call = excluded.prefers_call,
    prefers_email = excluded.prefers_email, first_request_at = excluded.first_request_at,
    last_request_at = excluded.last_request_at, updated_at = excluded.updated_at;
$$;

-- A new request: remember what it was about.
create or replace function public.trg_request_signal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.request_signals (customer_id, request_id, category, area, keywords, budget_min, budget_max,
    currency, image_count, contact_whatsapp, contact_call, contact_email, is_repost, posted_at)
  values (new.customer_id, new.id, new.category, new.area, public.request_keywords(new.body), new.budget_min,
    new.budget_max, new.currency, cardinality(new.images), new.contact_whatsapp, new.contact_call,
    new.contact_email, new.reposted_from is not null, new.created_at)
  on conflict (request_id) do nothing;
  perform public.refresh_customer_interests(new.customer_id);
  return new;
end $$;

-- Found my plug / closed.
create or replace function public.trg_request_outcome() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    update public.request_signals set outcome = new.status, outcome_at = now() where request_id = new.id;
    perform public.refresh_customer_interests(new.customer_id);
  end if;
  return new;
end $$;

-- A business reached out.
create or replace function public.trg_request_contact_signal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid;
begin
  update public.request_signals set reach_outs = reach_outs + 1 where request_id = new.request_id
  returning customer_id into v_customer;
  if v_customer is not null then
    perform public.refresh_customer_interests(v_customer);
  end if;
  return new;
end $$;

drop trigger if exists requests_signal on public.requests;
create trigger requests_signal after insert on public.requests
  for each row execute function public.trg_request_signal();
drop trigger if exists requests_outcome on public.requests;
create trigger requests_outcome after update of status on public.requests
  for each row execute function public.trg_request_outcome();
drop trigger if exists request_contacts_signal on public.request_contacts;
create trigger request_contacts_signal after insert on public.request_contacts
  for each row execute function public.trg_request_contact_signal();

-- Requests posted before this update.
insert into public.request_signals (customer_id, request_id, category, area, keywords, budget_min, budget_max,
  currency, image_count, contact_whatsapp, contact_call, contact_email, is_repost, reach_outs, outcome, posted_at, outcome_at)
select r.customer_id, r.id, r.category, r.area, public.request_keywords(r.body), r.budget_min, r.budget_max,
  r.currency, cardinality(r.images), r.contact_whatsapp, r.contact_call, r.contact_email, r.reposted_from is not null,
  (select count(*) from public.request_contacts c where c.request_id = r.id), r.status, r.created_at, r.closed_at
from public.requests r
on conflict (request_id) do nothing;
select public.refresh_customer_interests(customer_id) from (select distinct customer_id from public.request_signals) c;

-- The n most common keys of a {"key": count} object, most first.
create or replace function public.top_keys(p_counts jsonb, p_n integer default 5) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(key order by n desc, key), '{}')
  from (select key, value::int as n from jsonb_each_text(coalesce(p_counts, '{}')) order by value::int desc, key limit p_n) t;
$$;

revoke execute on function public.refresh_customer_interests(uuid) from public, anon, authenticated;
revoke execute on function public.trg_request_signal() from public, anon, authenticated;
revoke execute on function public.trg_request_outcome() from public, anon, authenticated;
revoke execute on function public.trg_request_contact_signal() from public, anon, authenticated;

-- One call instead of many ---------------------------------------------------------

-- Who is reaching out, for all of the signed-in customer's recent requests.
create or replace function public.my_requests_contacts()
returns table (request_id uuid, business_id uuid, name text, slug text, logo_url text, brand_color text, whatsapp text, email text, method text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.request_id, b.id, b.name, b.slug, b.logo_url, b.brand_color, b.whatsapp, b.email, c.method, c.created_at
  from public.request_contacts c
  join public.requests r on r.id = c.request_id
  join public.businesses b on b.id = c.business_id
  where r.customer_id = (select auth.uid()) and r.created_at > now() - interval '60 days'
  order by c.created_at;
$$;

-- Partner perks for every business the signed-in customer has joined.
create or replace function public.my_partner_perks()
returns table (
  via_business_id uuid, partner_id uuid, partner_name text, partner_slug text, partner_categories text[],
  partner_location text, partner_logo_url text, partner_color text, perk_id uuid, kind public.perk_kind,
  title text, details text, threshold numeric, valid_days integer
)
language sql stable security definer set search_path = '' as $$
  select * from public.partner_perks(array(select m.business_id from public.memberships m where m.customer_id = (select auth.uid())));
$$;

revoke execute on function public.my_requests_contacts() from public, anon;
revoke execute on function public.my_partner_perks() from public, anon;
grant execute on function public.my_requests_contacts() to authenticated;
grant execute on function public.my_partner_perks() to authenticated;

$spendbox_update_11$;
  end if;
end $outer$;

-- Update 12: 20261012000000_products.sql
do $outer$ begin
  if not (to_regclass('public.products') is not null) then
    execute $spendbox_update_12$
-- =============================================================================
-- Spendbox update 12: products & services, and birthday notes.
--
-- Businesses post products and services, each with one photo or short video.
-- They show (newest first) in the Explore tab of their customers and their
-- partners' customers. Customers can like them (My box) and contact the
-- business; every view, like and contact is counted for the business's stats.
-- Also: a mark so each birthday treat's happy-birthday email goes out once.
--
-- Safe to run more than once. Run this after 20261011000000_interests_and_speed.sql.
-- =============================================================================

alter table public.rewards add column if not exists birthday_reminded_at timestamptz;

-- Products & services ---------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null default 'product' check (kind in ('product', 'service')),
  title text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 500),
  price numeric(14, 2) check (price is null or (price >= 0 and price <= 1000000000)),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  media_type text not null check (media_type in ('image', 'video')),
  media_url text not null check (char_length(media_url) <= 500),
  -- A still frame for videos, shown in the round thumbnails.
  poster_url text check (char_length(poster_url) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_business_idx on public.products (business_id, created_at desc);
create index if not exists products_feed_idx on public.products (created_at desc) where is_active;

alter table public.products enable row level security;
drop policy if exists "Owners see their products" on public.products;
create policy "Owners see their products" on public.products
  for select to authenticated using (public.is_business_owner(business_id));
drop policy if exists "Owners add products" on public.products;
create policy "Owners add products" on public.products
  for insert to authenticated with check (public.is_business_owner(business_id));
drop policy if exists "Owners change products" on public.products;
create policy "Owners change products" on public.products
  for update to authenticated using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "Owners delete products" on public.products;
create policy "Owners delete products" on public.products
  for delete to authenticated using (public.is_business_owner(business_id));
revoke all on public.products from anon, authenticated;
grant select, insert, delete on public.products to authenticated;
grant update (kind, title, description, price, is_active, updated_at) on public.products to authenticated;
grant all on public.products to service_role;

-- At most 200 products per business, so the feed stays quick.
create or replace function public.trg_products_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.products where business_id = new.business_id) >= 200 then
    raise exception 'You can have up to 200 products and services. Delete some to add more.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists products_limit on public.products;
create trigger products_limit before insert on public.products
  for each row execute function public.trg_products_limit();

-- Who looked, liked and asked (read only through the functions below).
create table if not exists public.product_views (
  product_id uuid not null references public.products (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  view_count integer not null default 1,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  primary key (product_id, customer_id)
);
create index if not exists product_views_customer_idx on public.product_views (customer_id);

create table if not exists public.product_likes (
  product_id uuid not null references public.products (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, customer_id)
);
create index if not exists product_likes_customer_idx on public.product_likes (customer_id, created_at desc);

create table if not exists public.product_contacts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (method in ('whatsapp', 'call', 'email')),
  created_at timestamptz not null default now()
);
create index if not exists product_contacts_product_idx on public.product_contacts (product_id, created_at desc);

alter table public.product_views enable row level security;
alter table public.product_likes enable row level security;
alter table public.product_contacts enable row level security;
revoke all on public.product_views, public.product_likes, public.product_contacts from anon, authenticated;
grant all on public.product_views, public.product_likes, public.product_contacts to service_role;

-- Photos and videos: public links with random names. Only the server hands out upload links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- Who sees what ---------------------------------------------------------------------

-- A customer sees a business's products if they joined it, or joined one of its
-- partners (both with cross-promotion on). Paused businesses are hidden.
create or replace function public.customer_sees_business(p_customer_id uuid, p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.suspended_at is null
      and (
        exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = p_customer_id)
        or (b.partners_enabled and exists (
          select 1 from public.partnerships p
          join public.businesses other
            on other.id = case when p.requester_id = b.id then p.partner_id else p.requester_id end
          join public.memberships m on m.business_id = other.id and m.customer_id = p_customer_id
          where p.status = 'active' and (p.requester_id = b.id or p.partner_id = b.id) and other.partners_enabled
        ))
      )
  );
$$;

-- The signed-in customer's feed: newest first, optionally searched.
create or replace function public.explore_products(p_query text default null, p_limit integer default 150)
returns table (
  id uuid, business_id uuid, business_name text, business_slug text, business_logo_url text, business_color text,
  business_whatsapp text, business_email text, kind text, title text, description text, price numeric, currency text,
  media_type text, media_url text, poster_url text, created_at timestamptz, viewed boolean, liked boolean, is_member boolean
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  q as (select nullif(trim(coalesce(p_query, '')), '') as text)
  select p.id, b.id, b.name, b.slug, b.logo_url, b.brand_color, b.whatsapp, b.email, p.kind, p.title, p.description,
    p.price, p.currency, p.media_type, p.media_url, p.poster_url, p.created_at,
    exists (select 1 from public.product_views v where v.product_id = p.id and v.customer_id = me.uid),
    exists (select 1 from public.product_likes l where l.product_id = p.id and l.customer_id = me.uid),
    exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = me.uid)
  from public.products p
  join public.businesses b on b.id = p.business_id
  cross join me cross join q
  where p.is_active and me.uid is not null
    and public.customer_sees_business(me.uid, b.id)
    and (q.text is null or
      (p.title || ' ' || coalesce(p.description, '') || ' ' || b.name || ' ' || array_to_string(coalesce(b.categories, '{}'), ' '))
        ilike '%' || replace(replace(q.text, '%', ''), '_', '') || '%')
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 150), 1), 300);
$$;

-- My box: what the customer liked (still visible to them), most recently liked first.
create or replace function public.my_box()
returns table (
  id uuid, business_id uuid, business_name text, business_slug text, business_logo_url text, business_color text,
  business_whatsapp text, business_email text, kind text, title text, description text, price numeric, currency text,
  media_type text, media_url text, poster_url text, created_at timestamptz, viewed boolean, liked boolean, is_member boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id, b.id, b.name, b.slug, b.logo_url, b.brand_color, b.whatsapp, b.email, p.kind, p.title, p.description,
    p.price, p.currency, p.media_type, p.media_url, p.poster_url, p.created_at, true, true,
    exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = l.customer_id)
  from public.product_likes l
  join public.products p on p.id = l.product_id and p.is_active
  join public.businesses b on b.id = p.business_id
  where l.customer_id = (select auth.uid()) and public.customer_sees_business(l.customer_id, b.id)
  order by l.created_at desc
  limit 300;
$$;

-- Counting ----------------------------------------------------------------------------

create or replace function public.view_product(p_product_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_business uuid;
begin
  select business_id into v_business from public.products where id = p_product_id and is_active;
  if v_uid is null or v_business is null or not public.customer_sees_business(v_uid, v_business) then
    return;
  end if;
  -- Owners looking at their own products don't count.
  if exists (select 1 from public.businesses where id = v_business and owner_id = v_uid) then
    return;
  end if;
  insert into public.product_views (product_id, customer_id) values (p_product_id, v_uid)
  on conflict (product_id, customer_id) do update
    set view_count = public.product_views.view_count + 1, last_viewed_at = now()
    -- A view within the last 10 minutes is the same look.
    where public.product_views.last_viewed_at < now() - interval '10 minutes';
end $$;

create or replace function public.like_product(p_product_id uuid, p_like boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_business uuid;
begin
  select business_id into v_business from public.products where id = p_product_id and is_active;
  if v_uid is null or v_business is null or not public.customer_sees_business(v_uid, v_business) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if p_like then
    insert into public.product_likes (product_id, customer_id) values (p_product_id, v_uid) on conflict do nothing;
  else
    delete from public.product_likes where product_id = p_product_id and customer_id = v_uid;
  end if;
  return p_like;
end $$;

create or replace function public.contact_product(p_product_id uuid, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_business uuid;
begin
  select business_id into v_business from public.products where id = p_product_id and is_active;
  if v_uid is null or v_business is null or not public.customer_sees_business(v_uid, v_business) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if p_method not in ('whatsapp', 'call', 'email') then
    raise exception 'Unknown contact method' using errcode = 'P0001';
  end if;
  -- One per person, method and hour is plenty.
  if not exists (select 1 from public.product_contacts where product_id = p_product_id and customer_id = v_uid
                 and method = p_method and created_at > now() - interval '1 hour') then
    insert into public.product_contacts (product_id, customer_id, method) values (p_product_id, v_uid, p_method);
  end if;
end $$;

-- Business stats ------------------------------------------------------------------------

-- Every product with its numbers, newest first.
create or replace function public.business_products(p_business_id uuid)
returns table (
  id uuid, kind text, title text, description text, price numeric, currency text, media_type text, media_url text,
  poster_url text, is_active boolean, created_at timestamptz,
  views bigint, viewers bigint, partner_viewers bigint, likes bigint, contacts bigint
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.title, p.description, p.price, p.currency, p.media_type, p.media_url, p.poster_url,
    p.is_active, p.created_at,
    coalesce((select sum(v.view_count) from public.product_views v where v.product_id = p.id), 0),
    (select count(*) from public.product_views v where v.product_id = p.id),
    (select count(*) from public.product_views v where v.product_id = p.id
       and not exists (select 1 from public.memberships m where m.business_id = p.business_id and m.customer_id = v.customer_id)),
    (select count(*) from public.product_likes l where l.product_id = p.id),
    (select count(*) from public.product_contacts c where c.product_id = p.id)
  from public.products p
  where p.business_id = p_business_id and public.is_business_owner(p_business_id)
  order by p.created_at desc;
$$;

-- Who looked at, liked or asked about one product: first name only (the full
-- details follow each customer's sharing choice on the Customers page).
create or replace function public.product_audience(p_business_id uuid, p_product_id uuid)
returns table (
  customer_name text, member_no integer, via_partner text, view_count integer, last_viewed_at timestamptz,
  liked boolean, contacted text, last_activity timestamptz
)
language sql stable security definer set search_path = '' as $$
  with people as (
    select customer_id from public.product_views where product_id = p_product_id
    union select customer_id from public.product_likes where product_id = p_product_id
    union select customer_id from public.product_contacts where product_id = p_product_id
  )
  select
    nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), ''),
    m.member_no,
    case when m.id is null then (
      select b2.name from public.memberships m2
      join public.partnerships ps on ps.status = 'active'
        and ((ps.requester_id = p_business_id and ps.partner_id = m2.business_id) or (ps.partner_id = p_business_id and ps.requester_id = m2.business_id))
      join public.businesses b2 on b2.id = m2.business_id
      where m2.customer_id = people.customer_id
      limit 1
    ) end,
    coalesce(v.view_count, 0),
    v.last_viewed_at,
    l.created_at is not null,
    (select string_agg(distinct c.method, ', ') from public.product_contacts c where c.product_id = p_product_id and c.customer_id = people.customer_id),
    greatest(v.last_viewed_at, l.created_at, (select max(c.created_at) from public.product_contacts c where c.product_id = p_product_id and c.customer_id = people.customer_id))
  from people
  join public.products p on p.id = p_product_id and p.business_id = p_business_id
  left join public.profiles pr on pr.id = people.customer_id
  left join public.memberships m on m.business_id = p_business_id and m.customer_id = people.customer_id
  left join public.product_views v on v.product_id = p_product_id and v.customer_id = people.customer_id
  left join public.product_likes l on l.product_id = p_product_id and l.customer_id = people.customer_id
  where public.is_business_owner(p_business_id)
  order by 8 desc nulls last
  limit 500;
$$;

revoke execute on function public.customer_sees_business(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.trg_products_limit() from public, anon, authenticated;
revoke execute on function public.explore_products(text, integer) from public, anon;
revoke execute on function public.my_box() from public, anon;
revoke execute on function public.view_product(uuid) from public, anon;
revoke execute on function public.like_product(uuid, boolean) from public, anon;
revoke execute on function public.contact_product(uuid, text) from public, anon;
revoke execute on function public.business_products(uuid) from public, anon;
revoke execute on function public.product_audience(uuid, uuid) from public, anon;
grant execute on function public.explore_products(text, integer) to authenticated;
grant execute on function public.my_box() to authenticated;
grant execute on function public.view_product(uuid) to authenticated;
grant execute on function public.like_product(uuid, boolean) to authenticated;
grant execute on function public.contact_product(uuid, text) to authenticated;
grant execute on function public.business_products(uuid) to authenticated;
grant execute on function public.product_audience(uuid, uuid) to authenticated;

$spendbox_update_12$;
  end if;
end $outer$;

-- Update 13: 20261013000000_marketplace.sql
do $outer$ begin
  if not (to_regprocedure('public.explore_businesses()') is not null) then
    execute $spendbox_update_13$
-- =============================================================================
-- Spendbox update 13: the 3D marketplace.
--
-- Customers' Explore can show their businesses as shops on a little 3D map.
-- Each business picks a store theme and adjusts it (colours, floor, decor);
-- the choice is kept in businesses.store_theme. explore_businesses() lists
-- the shops a customer can visit, with how many new products each has.
--
-- Safe to run more than once. Run this after 20261012000000_products.sql.
-- =============================================================================

alter table public.businesses add column if not exists store_theme jsonb not null default '{}'::jsonb;
alter table public.businesses drop constraint if exists businesses_store_theme_size;
alter table public.businesses add constraint businesses_store_theme_size check (pg_column_size(store_theme) < 4000);
grant update (store_theme) on public.businesses to authenticated;

-- The shops on the signed-in customer's map: businesses they joined, and those
-- businesses' partners (with cross-promotion on). Oldest relationship first, so
-- the map keeps its shape as it grows.
create or replace function public.explore_businesses()
returns table (
  id uuid, name text, slug text, categories text[], location text, about text, logo_url text, brand_color text,
  whatsapp text, email text, store_theme jsonb, is_member boolean, joined_at timestamptz,
  products integer, new_products integer, latest_product_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  shops as (
    select m.business_id as id, m.joined_at as since, true as member
    from public.memberships m, me where m.customer_id = me.uid
    union all
    select case when p.requester_id = m.business_id then p.partner_id else p.requester_id end, greatest(m.joined_at, p.created_at), false
    from public.memberships m
    join public.partnerships p on p.status = 'active' and m.business_id in (p.requester_id, p.partner_id)
    cross join me
    where m.customer_id = me.uid
  ),
  best as (
    select id, bool_or(member) as member, min(since) as since from shops group by id
  )
  select b.id, b.name, b.slug, coalesce(b.categories, '{}'), b.location, b.about, b.logo_url, b.brand_color,
    b.whatsapp, b.email, b.store_theme, best.member, best.since,
    (select count(*)::int from public.products pr where pr.business_id = b.id and pr.is_active),
    (select count(*)::int from public.products pr where pr.business_id = b.id and pr.is_active
       and not exists (select 1 from public.product_views v where v.product_id = pr.id and v.customer_id = me.uid)),
    (select max(pr.created_at) from public.products pr where pr.business_id = b.id and pr.is_active)
  from best
  join public.businesses b on b.id = best.id
  cross join me
  where public.customer_sees_business(me.uid, b.id)
  order by best.since, b.name
  limit 200;
$$;

revoke execute on function public.explore_businesses() from public, anon;
grant execute on function public.explore_businesses() to authenticated;

$spendbox_update_13$;
  end if;
end $outer$;

-- Update 14: 20261014000000_map_customers.sql
do $outer$ begin
  if not (coalesce(pg_get_function_result(to_regprocedure('public.explore_businesses()')), '') like '%customers integer%') then
    execute $spendbox_update_14$
-- =============================================================================
-- Spendbox update 14: customer counts on the map.
--
-- Each shop on the 3D map shows how many customers the business has, so
-- explore_businesses() now also returns a customers count. (Store themes can
-- also hold a lounge table style; that lives in the existing store_theme JSON,
-- so there's nothing to change in the table for it.)
--
-- Safe to run more than once. Run this after 20261013000000_marketplace.sql.
-- =============================================================================

-- The list of columns changes, so the old function has to go first.
drop function if exists public.explore_businesses();

create or replace function public.explore_businesses()
returns table (
  id uuid, name text, slug text, categories text[], location text, about text, logo_url text, brand_color text,
  whatsapp text, email text, store_theme jsonb, is_member boolean, joined_at timestamptz,
  products integer, new_products integer, latest_product_at timestamptz, customers integer
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  shops as (
    select m.business_id as id, m.joined_at as since, true as member
    from public.memberships m, me where m.customer_id = me.uid
    union all
    select case when p.requester_id = m.business_id then p.partner_id else p.requester_id end, greatest(m.joined_at, p.created_at), false
    from public.memberships m
    join public.partnerships p on p.status = 'active' and m.business_id in (p.requester_id, p.partner_id)
    cross join me
    where m.customer_id = me.uid
  ),
  best as (
    select id, bool_or(member) as member, min(since) as since from shops group by id
  )
  select b.id, b.name, b.slug, coalesce(b.categories, '{}'), b.location, b.about, b.logo_url, b.brand_color,
    b.whatsapp, b.email, b.store_theme, best.member, best.since,
    (select count(*)::int from public.products pr where pr.business_id = b.id and pr.is_active),
    (select count(*)::int from public.products pr where pr.business_id = b.id and pr.is_active
       and not exists (select 1 from public.product_views v where v.product_id = pr.id and v.customer_id = me.uid)),
    (select max(pr.created_at) from public.products pr where pr.business_id = b.id and pr.is_active),
    (select count(*)::int from public.memberships cm where cm.business_id = b.id)
  from best
  join public.businesses b on b.id = best.id
  cross join me
  where public.customer_sees_business(me.uid, b.id)
  order by best.since, b.name
  limit 200;
$$;

revoke execute on function public.explore_businesses() from public, anon;
grant execute on function public.explore_businesses() to authenticated;

$spendbox_update_14$;
  end if;
end $outer$;

-- Update 15: 20261015000000_shared_store.sql
do $outer$ begin
  if not (to_regprocedure('public.public_store(text)') is not null) then
    execute $spendbox_update_15$
-- =============================================================================
-- Spendbox update 15: shareable 3D shops.
--
-- A business can share a link to its 3D shop (/s/their-link). Anyone with the
-- link can walk in, even before joining: public_store() returns what the shop
-- needs (name, logo, store design, contact) and its newest products. Paused
-- businesses aren't shown.
--
-- Safe to run more than once. Run this after 20261014000000_map_customers.sql.
-- =============================================================================

create or replace function public.public_store(p_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'categories', coalesce(b.categories, '{}'),
    'location', b.location, 'about', b.about, 'logo_url', b.logo_url, 'brand_color', b.brand_color,
    'whatsapp', b.whatsapp, 'store_theme', b.store_theme,
    'products', coalesce((
      select jsonb_agg(p order by p.created_at desc)
      from (
        select pr.id, pr.title, pr.price, pr.currency, pr.media_type, pr.media_url, pr.poster_url, pr.description, pr.created_at
        from public.products pr
        where pr.business_id = b.id and pr.is_active
        order by pr.created_at desc
        limit 24
      ) p
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.slug = lower(p_slug) and b.suspended_at is null;
$$;

revoke execute on function public.public_store(text) from public;
grant execute on function public.public_store(text) to anon, authenticated;

$spendbox_update_15$;
  end if;
end $outer$;

-- Update 16: 20261016000000_shop_gift.sql
do $outer$ begin
  if not (coalesce(pg_get_functiondef(to_regprocedure('public.public_store(text)')), '') like '%''perks''%') then
    execute $spendbox_update_16$
-- =============================================================================
-- Spendbox update 16: a gift of perks in the 3D shop.
--
-- When a business has perks, a gift sits on its shop counter; shoppers tap it
-- to see them. public_store() now also returns the business's active perks
-- (welcome, invite a friend, birthday) and its currency.
--
-- Safe to run more than once. Run this after 20261015000000_shared_store.sql.
-- =============================================================================

create or replace function public.public_store(p_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'categories', coalesce(b.categories, '{}'),
    'location', b.location, 'about', b.about, 'logo_url', b.logo_url, 'brand_color', b.brand_color,
    'whatsapp', b.whatsapp, 'store_theme', b.store_theme, 'currency', b.currency,
    'perks', coalesce((
      select jsonb_agg(jsonb_build_object('id', pk.id, 'kind', pk.kind, 'title', pk.title, 'details', pk.details, 'threshold', pk.threshold, 'valid_days', pk.valid_days)
        order by array_position(array['welcome', 'referral', 'birthday']::public.perk_kind[], pk.kind))
      from public.perks pk
      where pk.business_id = b.id and pk.is_active and pk.kind in ('welcome', 'referral', 'birthday')
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(p order by p.created_at desc)
      from (
        select pr.id, pr.title, pr.price, pr.currency, pr.media_type, pr.media_url, pr.poster_url, pr.description, pr.created_at
        from public.products pr
        where pr.business_id = b.id and pr.is_active
        order by pr.created_at desc
        limit 24
      ) p
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.slug = lower(p_slug) and b.suspended_at is null;
$$;

revoke execute on function public.public_store(text) from public;
grant execute on function public.public_store(text) to anon, authenticated;

$spendbox_update_16$;
  end if;
end $outer$;

-- Update 17: 20261017000000_plug_partners.sql
do $outer$ begin
  if not (to_regprocedure('public.plug_partners(uuid)') is not null) then
    execute $spendbox_update_17$
-- =============================================================================
-- Spendbox update 17: a plug's partners, for its customers.
--
-- On a plug's page (and through the door in its 3D shop), customers can see
-- the businesses it partners with. plug_partners() lists them for members of
-- that plug: partnerships that are active, with partners turned on for both
-- businesses, and businesses that aren't paused.
--
-- Safe to run more than once. Run this after 20261016000000_shop_gift.sql.
-- =============================================================================

create or replace function public.plug_partners(p_business_id uuid)
returns table (
  id uuid, name text, slug text, categories text[], location text, about text, logo_url text, brand_color text,
  is_member boolean, products integer, welcome text
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid)
  select o.id, o.name, o.slug, coalesce(o.categories, '{}'), o.location, o.about, o.logo_url, o.brand_color,
    exists (select 1 from public.memberships m2, me where m2.business_id = o.id and m2.customer_id = me.uid),
    (select count(*)::int from public.products pr where pr.business_id = o.id and pr.is_active),
    (select pk.title from public.perks pk where pk.business_id = o.id and pk.kind = 'welcome' and pk.is_active limit 1)
  from me
  join public.memberships m on m.business_id = p_business_id and m.customer_id = me.uid
  join public.businesses b on b.id = p_business_id and b.partners_enabled
  join public.partnerships p on p.status = 'active' and p_business_id in (p.requester_id, p.partner_id)
  join public.businesses o on o.id = case when p.requester_id = p_business_id then p.partner_id else p.requester_id end
  where o.partners_enabled and o.suspended_at is null
  order by p.created_at, o.name;
$$;

revoke execute on function public.plug_partners(uuid) from public, anon;
grant execute on function public.plug_partners(uuid) to authenticated;

$spendbox_update_17$;
  end if;
end $outer$;

-- Update 18: 20261018000000_customer_invites.sql
do $outer$ begin
  if not (to_regprocedure('public.claim_inviter(uuid,text)') is not null) then
    execute $spendbox_update_18$
-- =============================================================================
-- Spendbox update 18: customers who bring a business become its customers.
--
-- A customer's "Invite more plugs" link carries their own invite code. When a
-- business signs up from that link, the customer is added to the new
-- business's customers straight away (and gets its welcome perk, like anyone
-- who joins).
--
--   my_invite_code()      the signed-in customer's code (made the first time)
--   claim_inviter(id, c)  the new business's owner, right after signing up,
--                         adds the customer with code c. Only once, only in
--                         the business's first day, and never the owner.
--
-- Safe to run more than once. Run this after 20261017000000_plug_partners.sql.
-- =============================================================================

alter table public.profiles add column if not exists invite_code text unique;
-- Which customer brought each business (kept private: only these functions read it).
create table if not exists public.business_inviters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.business_inviters enable row level security;
revoke all on public.business_inviters from public, anon, authenticated;

create or replace function public.my_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'Please sign in first' using errcode = '28000';
  end if;
  select invite_code into v_code from public.profiles where id = v_uid;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_code := public.gen_ref_code();
    exit when not exists (select 1 from public.profiles where invite_code = v_code);
  end loop;
  update public.profiles set invite_code = v_code where id = v_uid and invite_code is null;
  select invite_code into v_code from public.profiles where id = v_uid;
  return v_code;
end $$;

create or replace function public.claim_inviter(p_business_id uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_business public.businesses;
  v_inviter uuid;
  v_no integer;
begin
  if v_uid is null or p_code is null or p_code = '' then
    return false;
  end if;
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found or v_business.owner_id <> v_uid or v_business.created_at < now() - interval '1 day'
    or exists (select 1 from public.business_inviters where business_id = p_business_id) then
    return false;
  end if;
  select id into v_inviter from public.profiles where invite_code = lower(trim(p_code));
  if v_inviter is null or v_inviter = v_uid then
    return false;
  end if;

  insert into public.business_inviters (business_id, customer_id) values (p_business_id, v_inviter);
  if not exists (select 1 from public.memberships where business_id = p_business_id and customer_id = v_inviter) then
    select coalesce(max(member_no), 0) + 1 into v_no from public.memberships where business_id = p_business_id;
    insert into public.memberships (business_id, customer_id, member_no, ref_code)
    values (p_business_id, v_inviter, v_no, public.gen_ref_code());
  end if;
  return true;
end $$;

revoke execute on function public.my_invite_code() from public, anon;
grant execute on function public.my_invite_code() to authenticated;
revoke execute on function public.claim_inviter(uuid, text) from public, anon;
grant execute on function public.claim_inviter(uuid, text) to authenticated;

$spendbox_update_18$;
  end if;
end $outer$;

-- Update 19: 20261019000000_shop_hall.sql
do $outer$ begin
  if not (coalesce(pg_get_functiondef(to_regprocedure('public.public_store(text)')), '') like '%limit 400%') then
    execute $spendbox_update_19$
-- =============================================================================
-- Spendbox update 19: room for every product in the 3D shop.
--
-- Every product now stands on its own display in the shop's hall (clothes on
-- mannequins, food on tables, homes as model houses, videos on banners), and
-- the hall grows as products are added. public_store() returns up to 400 of
-- a business's newest products (it returned 24), for the hall to lay out.
--
-- Safe to run more than once. Run this after 20261018000000_customer_invites.sql.
-- =============================================================================

create or replace function public.public_store(p_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'categories', coalesce(b.categories, '{}'),
    'location', b.location, 'about', b.about, 'logo_url', b.logo_url, 'brand_color', b.brand_color,
    'whatsapp', b.whatsapp, 'store_theme', b.store_theme, 'currency', b.currency,
    'perks', coalesce((
      select jsonb_agg(jsonb_build_object('id', pk.id, 'kind', pk.kind, 'title', pk.title, 'details', pk.details, 'threshold', pk.threshold, 'valid_days', pk.valid_days)
        order by array_position(array['welcome', 'referral', 'birthday']::public.perk_kind[], pk.kind))
      from public.perks pk
      where pk.business_id = b.id and pk.is_active and pk.kind in ('welcome', 'referral', 'birthday')
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(p order by p.created_at desc)
      from (
        select pr.id, pr.title, pr.price, pr.currency, pr.media_type, pr.media_url, pr.poster_url, pr.description, pr.created_at
        from public.products pr
        where pr.business_id = b.id and pr.is_active
        order by pr.created_at desc
        limit 400
      ) p
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.slug = lower(p_slug) and b.suspended_at is null;
$$;

revoke execute on function public.public_store(text) from public;
grant execute on function public.public_store(text) to anon, authenticated;

$spendbox_update_19$;
  end if;
end $outer$;

-- Which updates are in place (all should say yes).
select * from (values
  (1, '20261001000000_spendbox', case when to_regclass('public.businesses') is not null then 'yes' else 'NO' end),
  (2, '20261002000000_logos_emails_durations', case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perks' and column_name = 'valid_days') then 'yes' else 'NO' end),
  (3, '20261003000000_bank_feeds', case when to_regclass('public.bank_connections') is not null then 'yes' else 'NO' end),
  (4, '20261004000000_sales', case when to_regclass('public.bank_transactions_paid_idx') is not null then 'yes' else 'NO' end),
  (5, '20261005000000_partners', case when to_regclass('public.partnerships') is not null then 'yes' else 'NO' end),
  (6, '20261006000000_activity_and_accounts', case when to_regclass('public.audit_events') is not null then 'yes' else 'NO' end),
  (7, '20261007000000_pay_accounts', case when to_regprocedure('public.business_pay_accounts(uuid)') is not null then 'yes' else 'NO' end),
  (8, '20261008000000_admin', case when to_regclass('public.app_settings') is not null then 'yes' else 'NO' end),
  (9, '20261009000000_email_and_billing', case when to_regclass('public.business_payments') is not null then 'yes' else 'NO' end),
  (10, '20261010000000_requests', case when to_regclass('public.requests') is not null then 'yes' else 'NO' end),
  (11, '20261011000000_interests_and_speed', case when to_regclass('public.customer_interests') is not null then 'yes' else 'NO' end),
  (12, '20261012000000_products', case when to_regclass('public.products') is not null then 'yes' else 'NO' end),
  (13, '20261013000000_marketplace', case when to_regprocedure('public.explore_businesses()') is not null then 'yes' else 'NO' end),
  (14, '20261014000000_map_customers', case when coalesce(pg_get_function_result(to_regprocedure('public.explore_businesses()')), '') like '%customers integer%' then 'yes' else 'NO' end),
  (15, '20261015000000_shared_store', case when to_regprocedure('public.public_store(text)') is not null then 'yes' else 'NO' end),
  (16, '20261016000000_shop_gift', case when coalesce(pg_get_functiondef(to_regprocedure('public.public_store(text)')), '') like '%''perks''%' then 'yes' else 'NO' end),
  (17, '20261017000000_plug_partners', case when to_regprocedure('public.plug_partners(uuid)') is not null then 'yes' else 'NO' end),
  (18, '20261018000000_customer_invites', case when to_regprocedure('public.claim_inviter(uuid,text)') is not null then 'yes' else 'NO' end),
  (19, '20261019000000_shop_hall', case when coalesce(pg_get_functiondef(to_regprocedure('public.public_store(text)')), '') like '%limit 400%' then 'yes' else 'NO' end)
) as updates (step, name, in_place);
