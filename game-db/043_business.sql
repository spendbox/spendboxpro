-- Newtown, part 43: real businesses on the map. A business (an advertiser account, by email) leases
-- one building for a year through Paystack, with its name, logo and real details; it lights up for
-- everyone. Upgrades (a bright sign, a refit into another kind of building, an extra storey from a
-- month in) are paid the same way, and any upgrade puts it on the billboards. Landmarks can't be
-- leased (the game only offers buildings), nor buildings any player owns part of. One live lease per
-- account, and at most one new lease a week. Taps, card views, calls, WhatsApp, website, directions
-- and billboard views are counted for the owner. Prices are worked out by the game
-- (src/lib/world/business.ts). See docs/BUSINESS.md.
--
-- Safe to run more than once. Run after parts 1-42.

create table if not exists public.business_leases (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.advertisers (id) on delete cascade,
  building_id text not null check (building_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$'),
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(name) between 2 and 60),
  category text not null check (char_length(category) <= 40),
  about text not null check (char_length(about) between 10 and 300),
  address text not null check (char_length(address) between 5 and 200),
  phone text check (phone is null or char_length(phone) <= 30),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 30),
  website text check (website is null or char_length(website) <= 300),
  logo_path text,
  price_kobo bigint not null check (price_kobo > 0),
  reference text not null unique check (reference ~ '^bz-[a-z0-9-]{8,60}$'),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'live', 'ended', 'removed')),
  glow int not null default 1 check (glow between 1 and 2),
  kind text check (kind is null or kind ~ '^[a-z]{2,20}$'),
  storeys int check (storeys is null or storeys between 1 and 60),
  billboard boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists business_leases_region_idx on public.business_leases (region, status);
create index if not exists business_leases_adv_idx on public.business_leases (advertiser_id, created_at desc);
-- A building has one live lease at most.
create unique index if not exists business_leases_one_live on public.business_leases (building_id) where status = 'live';

create table if not exists public.business_upgrades (
  reference text primary key check (reference ~ '^bz-[a-z0-9-]{8,60}$'),
  lease_id uuid not null references public.business_leases (id) on delete cascade,
  upgrade text not null check (upgrade in ('bright', 'rebuild', 'storey')),
  kind text check (kind is null or kind ~ '^[a-z]{2,20}$'),
  price_kobo bigint not null check (price_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.business_hits (
  lease_id uuid not null references public.business_leases (id) on delete cascade,
  day date not null default (now() at time zone 'Africa/Lagos')::date,
  kind text not null check (kind in ('tap', 'view', 'call', 'whatsapp', 'website', 'directions', 'billboard')),
  n int not null default 0,
  primary key (lease_id, day, kind)
);

/** Leases that have run their year end. */
create or replace function public.business_tidy() returns void
language sql security definer set search_path = public as $$
  update public.business_leases set status = 'ended' where status = 'live' and ends_at <= now()
$$;

/** Start a lease (pending until Paystack confirms). Checks the building is free and the account's limits. */
create or replace function public.business_lease_start(
  p_advertiser uuid, p_building text, p_region text, p_name text, p_category text, p_about text, p_address text,
  p_phone text, p_whatsapp text, p_website text, p_logo text, p_kobo bigint, p_reference text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.business_tidy();
  if split_part(p_building, ':', 1) <> p_region then raise exception 'bad_building'; end if;
  if exists (select 1 from public.business_leases where building_id = p_building and status = 'live') then raise exception 'taken'; end if;
  if exists (select 1 from public.property_units where building_id = p_building) then raise exception 'owned'; end if;
  if exists (select 1 from public.business_leases where advertiser_id = p_advertiser and status = 'live') then raise exception 'one_only'; end if;
  if exists (select 1 from public.business_leases where advertiser_id = p_advertiser and status <> 'pending_payment' and created_at > now() - interval '7 days') then
    raise exception 'one_a_week';
  end if;
  insert into public.business_leases (advertiser_id, building_id, region, name, category, about, address, phone, whatsapp, website, logo_path, price_kobo, reference)
    values (p_advertiser, p_building, p_region, p_name, p_category, p_about, p_address, nullif(p_phone, ''), nullif(p_whatsapp, ''), nullif(p_website, ''), p_logo, p_kobo, p_reference)
    returning id into v_id;
  return v_id;
end $$;

/**
 * Paystack confirmed a payment (p_kobo actually paid): a lease goes live for a year, or an upgrade
 * is applied (and the business goes on the billboards). Once only; a building taken meanwhile stays
 * pending (and is refunded by hand).
 */
create or replace function public.business_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.business_leases;
  u public.business_upgrades;
begin
  select * into l from public.business_leases where reference = p_reference for update;
  if found then
    if l.status <> 'pending_payment' then return jsonb_build_object('found', true, 'new', false, 'id', l.id); end if;
    if coalesce(p_kobo, 0) < l.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
    if exists (select 1 from public.business_leases where building_id = l.building_id and status = 'live')
       or exists (select 1 from public.property_units where building_id = l.building_id) then
      return jsonb_build_object('found', true, 'new', false, 'clash', true, 'id', l.id);
    end if;
    update public.business_leases set status = 'live', starts_at = now(), ends_at = now() + interval '365 days' where id = l.id;
    return jsonb_build_object('found', true, 'new', true, 'id', l.id);
  end if;
  select * into u from public.business_upgrades where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if u.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'id', u.lease_id); end if;
  if coalesce(p_kobo, 0) < u.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  update public.business_upgrades set status = 'paid', paid_at = now() where reference = p_reference;
  update public.business_leases set
    glow = case when u.upgrade = 'bright' then 2 else glow end,
    kind = case when u.upgrade = 'rebuild' then u.kind else kind end,
    storeys = case when u.upgrade = 'storey' then coalesce(storeys, 1) + 1 else storeys end,
    billboard = true
  where id = u.lease_id;
  return jsonb_build_object('found', true, 'new', true, 'id', u.lease_id, 'upgrade', u.upgrade);
end $$;

/** Start paying for an upgrade to a live lease (a storey only from a month in). */
create or replace function public.business_upgrade_start(p_advertiser uuid, p_lease uuid, p_upgrade text, p_kind text, p_kobo bigint, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.business_leases;
begin
  select * into l from public.business_leases where id = p_lease and advertiser_id = p_advertiser;
  if not found or l.status <> 'live' then raise exception 'not_yours'; end if;
  if p_upgrade = 'storey' and l.starts_at > now() - interval '30 days' then raise exception 'too_soon'; end if;
  if p_upgrade = 'bright' and l.glow >= 2 then raise exception 'already'; end if;
  insert into public.business_upgrades (reference, lease_id, upgrade, kind, price_kobo) values (p_reference, p_lease, p_upgrade, p_kind, p_kobo);
end $$;

/** Count something people did with a business (only live ones). */
create or replace function public.business_hit(p_lease uuid, p_kind text) returns void
language sql security definer set search_path = public as $$
  insert into public.business_hits (lease_id, kind, n)
  select p_lease, p_kind, 1 where exists (select 1 from public.business_leases where id = p_lease and status = 'live')
  on conflict (lease_id, day, kind) do update set n = business_hits.n + 1
$$;

/** Live businesses in a region, for the map. */
create or replace function public.businesses_in(p_region text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'building', building_id, 'name', name, 'category', category, 'about', about, 'address', address,
    'phone', phone, 'whatsapp', whatsapp, 'website', website, 'logo', logo_path, 'glow', glow, 'kind', kind,
    'storeys', storeys, 'billboard', billboard)), '[]'::jsonb)
  from public.business_leases where region = p_region and status = 'live' and ends_at > now()
$$;

/** An account's leases with their numbers (for the business page). */
create or replace function public.business_mine(p_advertiser uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'building', l.building_id, 'name', l.name, 'category', l.category, 'about', l.about, 'address', l.address,
    'phone', l.phone, 'whatsapp', l.whatsapp, 'website', l.website, 'logo', l.logo_path, 'status', l.status, 'glow', l.glow,
    'kind', l.kind, 'storeys', l.storeys, 'billboard', l.billboard, 'startsAt', l.starts_at, 'endsAt', l.ends_at, 'priceKobo', l.price_kobo,
    'hits', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id group by kind) s), '{}'::jsonb),
    'week', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id and h.day > (now() at time zone 'Africa/Lagos')::date - 7 group by kind) s), '{}'::jsonb)
  ) order by l.created_at desc), '[]'::jsonb)
  from public.business_leases l where l.advertiser_id = p_advertiser and l.status <> 'pending_payment'
$$;

do $$
begin
  revoke all on table public.business_leases, public.business_upgrades, public.business_hits from public, anon, authenticated;
  grant all on table public.business_leases, public.business_upgrades, public.business_hits to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.business_tidy()',
    'public.business_lease_start(uuid, text, text, text, text, text, text, text, text, text, text, bigint, text)',
    'public.business_paid(text, bigint)', 'public.business_upgrade_start(uuid, uuid, text, text, bigint, text)',
    'public.business_hit(uuid, text)', 'public.businesses_in(text)', 'public.business_mine(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
