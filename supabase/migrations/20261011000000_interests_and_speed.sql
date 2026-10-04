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
