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
