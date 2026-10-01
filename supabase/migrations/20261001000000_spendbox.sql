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
