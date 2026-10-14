-- Newtown, part 92: buildings are leased by the month (docs/BUSINESS.md).
--   - A lease is paid for 1, 3, 6 or 12 months up front (business_leases.months) and runs 30 days a
--     month; leases from before this part keep their year.
--   - "Another month" (an upgrade, business_upgrades.upgrade = 'month') adds 30 days and the taps
--     that month's money buys, any time while the lease is live.
--   - Billboard ads on their own are unchanged (weekly budget, 1 to 8 weeks: part 13).
--
-- Run it after 043 and 047. If you ever run 043 or 047 again, run this again after it.
-- Safe to run more than once.

alter table public.business_leases add column if not exists months int check (months is null or months between 1 and 12);

alter table public.business_upgrades drop constraint if exists business_upgrades_upgrade_check;
alter table public.business_upgrades add constraint business_upgrades_upgrade_check check (upgrade in ('bright', 'rebuild', 'storey', 'month'));

/** Start paying for an upgrade to a live lease (a storey only from a month in; another month any time). */
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

/** Paystack confirmed a payment: a lease goes live for its months (with the billboards and its taps), or an upgrade is applied. */
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

/** An account's leases with their numbers (and the months they were paid for). */
create or replace function public.business_mine(p_advertiser uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'building', l.building_id, 'name', l.name, 'category', l.category, 'about', l.about, 'address', l.address,
    'phone', l.phone, 'whatsapp', l.whatsapp, 'website', l.website, 'logo', l.logo_path, 'billboardImage', coalesce(l.billboard_path, l.logo_path),
    'status', l.status, 'glow', l.glow, 'kind', l.kind, 'storeys', l.storeys, 'billboard', l.billboard, 'startsAt', l.starts_at, 'endsAt', l.ends_at,
    'priceKobo', l.price_kobo, 'months', l.months, 'clickCap', l.click_cap, 'clicks', public.lease_taps(l.id),
    'hits', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id group by kind) s), '{}'::jsonb),
    'week', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id and h.day > (now() at time zone 'Africa/Lagos')::date - 7 group by kind) s), '{}'::jsonb)
  ) order by l.created_at desc), '[]'::jsonb)
  from public.business_leases l where l.advertiser_id = p_advertiser and l.status <> 'pending_payment'
$$;

do $$
declare f text;
begin
  foreach f in array array['public.business_upgrade_start(uuid, uuid, text, text, bigint, text)', 'public.business_paid(text, bigint)', 'public.business_mine(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
