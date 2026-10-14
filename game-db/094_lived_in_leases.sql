-- Newtown, part 94: a business can take a building people live in, without taking the homes away
-- (docs/BUSINESS.md).
--   - A residential building (one with homes: rooming houses, bungalows, duplexes, terraces, flats,
--     apartments, shops with flats) can be leased even when players own homes in it, and players can
--     still buy and live in its homes while the lease runs. So advertising never takes places to live
--     off the map.
--   - While a business leases it, nobody can rename the building (it carries the business's name).
--   - A building people live in can't be refitted into another kind, or have storeys added by the business.
--   Other buildings (offices, plazas, shops, towers, warehouses, land) stay as before: only ones nobody owns.
--
-- Run it after 043, 047 and 092. If you ever run 043, 047 or 092 again, run this again after it.
-- Safe to run more than once.

alter table public.business_leases add column if not exists residential boolean not null default false;

-- The lease start, with "is it residential" (worked out by the server from the building's homes).
drop function if exists public.business_lease_start(uuid, text, text, text, text, text, text, text, text, text, text, bigint, text);
create or replace function public.business_lease_start(
  p_advertiser uuid, p_building text, p_region text, p_name text, p_category text, p_about text, p_address text,
  p_phone text, p_whatsapp text, p_website text, p_logo text, p_kobo bigint, p_reference text, p_residential boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.business_tidy();
  if split_part(p_building, ':', 1) <> p_region then raise exception 'bad_building'; end if;
  if exists (select 1 from public.business_leases where building_id = p_building and status = 'live') then raise exception 'taken'; end if;
  if not coalesce(p_residential, false) and exists (select 1 from public.property_units where building_id = p_building) then raise exception 'owned'; end if;
  if exists (select 1 from public.business_leases where advertiser_id = p_advertiser and status = 'live') then raise exception 'one_only'; end if;
  if exists (select 1 from public.business_leases where advertiser_id = p_advertiser and status <> 'pending_payment' and created_at > now() - interval '7 days') then
    raise exception 'one_a_week';
  end if;
  insert into public.business_leases (advertiser_id, building_id, region, name, category, about, address, phone, whatsapp, website, logo_path, price_kobo, reference, residential)
    values (p_advertiser, p_building, p_region, p_name, p_category, p_about, p_address, nullif(p_phone, ''), nullif(p_whatsapp, ''), nullif(p_website, ''), p_logo, p_kobo, p_reference, coalesce(p_residential, false))
    returning id into v_id;
  return v_id;
end $$;

/** Paystack confirmed a payment: a lease goes live for its months (people's homes in a residential one stay theirs), or an upgrade is applied. */
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
       or (not l.residential and exists (select 1 from public.property_units where building_id = l.building_id)) then
      return jsonb_build_object('found', true, 'new', false, 'clash', true, 'id', l.id);
    end if;
    update public.business_leases set status = 'live', starts_at = now(),
      ends_at = now() + case when l.months is null then interval '365 days' else make_interval(days => 30 * l.months) end,
      billboard = true, click_cap = public.lease_clicks(l.price_kobo) where id = l.id;
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
    -- Another month: 30 more days and that month's taps.
    ends_at = case when u.upgrade = 'month' then greatest(coalesce(ends_at, now()), now()) + interval '30 days' else ends_at end,
    click_cap = case when u.upgrade = 'month' then coalesce(click_cap, 0) + public.lease_clicks(u.price_kobo) else click_cap end,
    billboard = true
  where id = u.lease_id;
  return jsonb_build_object('found', true, 'new', true, 'id', u.lease_id, 'upgrade', u.upgrade);
end $$;

/** Start paying for an upgrade to a live lease (no refit or storey on a building people live in). */
create or replace function public.business_upgrade_start(p_advertiser uuid, p_lease uuid, p_upgrade text, p_kind text, p_kobo bigint, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.business_leases;
begin
  select * into l from public.business_leases where id = p_lease and advertiser_id = p_advertiser;
  if not found or l.status <> 'live' then raise exception 'not_yours'; end if;
  if l.residential and p_upgrade in ('rebuild', 'storey') then raise exception 'lived_in'; end if;
  if p_upgrade = 'storey' and l.starts_at > now() - interval '30 days' then raise exception 'too_soon'; end if;
  if p_upgrade = 'bright' and l.glow >= 2 then raise exception 'already'; end if;
  insert into public.business_upgrades (reference, lease_id, upgrade, kind, price_kobo) values (p_reference, p_lease, p_upgrade, p_kind, p_kobo);
end $$;

/** Name a building you own all of: not while a business leases it (it carries the business's name). */
create or replace function public.property_rename(p_user uuid, p_building text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_units int;
  v_mine int;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  if exists (select 1 from public.business_leases where building_id = p_building and status = 'live') then raise exception 'leased'; end if;
  select jsonb_array_length(snapshot -> 'units') into v_units from public.property_buildings where building_id = p_building;
  if v_units is null then raise exception 'not_yours'; end if;
  select count(*) into v_mine from public.property_units where building_id = p_building and owner_id = p_user;
  if v_mine < v_units then raise exception 'not_all_yours'; end if;
  update public.property_buildings set name = v_name where building_id = p_building;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.business_lease_start(uuid, text, text, text, text, text, text, text, text, text, text, bigint, text, boolean)',
    'public.business_paid(text, bigint)', 'public.business_upgrade_start(uuid, uuid, text, text, bigint, text)', 'public.property_rename(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
