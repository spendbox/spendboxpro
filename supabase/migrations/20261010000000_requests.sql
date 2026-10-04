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

create table public.requests (
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

create index requests_customer_idx on public.requests (customer_id, created_at desc);
create index requests_live_idx on public.requests (expires_at desc) where status = 'open';

alter table public.requests enable row level security;
create policy "Customers see their requests" on public.requests
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "Customers delete their requests" on public.requests
  for delete to authenticated using (customer_id = (select auth.uid()));
revoke all on public.requests from public, anon, authenticated;
grant select, delete on public.requests to authenticated;
grant all on public.requests to service_role;

-- Which businesses reached out, and how --------------------------------------

create table public.request_contacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  method text not null check (method in ('whatsapp', 'call', 'email')),
  created_at timestamptz not null default now(),
  unique (request_id, business_id)
);
create index request_contacts_business_idx on public.request_contacts (business_id, created_at desc);

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
  select (b.plan = 'plus' and b.paid_until > now())
      or (coalesce(b.paid_until, '-infinity') <= now() and b.trial_ends_at > now());
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
        exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = p_request.customer_id)
        or (public.business_has_plus(b) and exists (
          select 1 from public.partnerships p
          join public.memberships m
            on m.business_id = case when p.requester_id = b.id then p.partner_id else p.requester_id end
          where p.status = 'active' and (p.requester_id = b.id or p.partner_id = b.id)
            and m.customer_id = p_request.customer_id
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
