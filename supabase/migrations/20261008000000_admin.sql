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
