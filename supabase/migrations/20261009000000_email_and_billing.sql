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
