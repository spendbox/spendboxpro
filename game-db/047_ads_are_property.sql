-- Newtown, part 47: advertising is leasing a property (docs/BUSINESS.md). A business leases a
-- building and gets the city's billboards with it from day one; it can swap its billboard design
-- any time, free. A lease runs a year, or until people have tapped the building or its billboards
-- (opening its card) as many times as the lease paid for, whichever comes first. Players no longer
-- get mint for tapping ads.
--
-- Safe to run more than once. Run after parts 1-46.

insert into public.game_settings (key, value, note) values
  ('lease_naira_per_click', 20, 'What each tap on a leased building or its billboard uses up of the lease (naira)')
on conflict (key) do update set note = excluded.note;
-- No more mint for tapping ads.
update public.game_settings set value = 0 where key = 'ad_rewards_per_day';

alter table public.business_leases add column if not exists billboard_path text;
alter table public.business_leases add column if not exists click_cap int;

/** Taps a lease of this price pays for. */
create or replace function public.lease_clicks(p_kobo bigint) returns int
language sql stable as $$ select greatest(100, floor(p_kobo / 100.0 / public.setting('lease_naira_per_click'))::int) $$;

-- Live leases from before this part: on the billboards, with their allowance of taps.
update public.business_leases set billboard = true, click_cap = public.lease_clicks(price_kobo) where status = 'live' and click_cap is null;

/** Taps on a lease so far (building and billboard taps both open its card). */
create or replace function public.lease_taps(p_lease uuid) returns int
language sql stable as $$ select coalesce(sum(n), 0)::int from public.business_hits where lease_id = p_lease and kind = 'view' $$;

/** Leases that have run their year, or used up their taps, end. */
create or replace function public.business_tidy() returns void
language sql security definer set search_path = public as $$
  update public.business_leases set status = 'ended'
  where status = 'live' and (ends_at <= now() or (click_cap is not null and public.lease_taps(id) >= click_cap))
$$;

/** Paystack confirmed a payment: a lease goes live (with the billboards and its taps), or an upgrade is applied. */
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
    update public.business_leases set status = 'live', starts_at = now(), ends_at = now() + interval '365 days',
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
    billboard = true
  where id = u.lease_id;
  return jsonb_build_object('found', true, 'new', true, 'id', u.lease_id, 'upgrade', u.upgrade);
end $$;

/** Swap a live lease's billboard design (a stored picture's path; null goes back to the logo). Free, any time. */
create or replace function public.business_billboard_set(p_advertiser uuid, p_lease uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  select billboard_path into v_old from public.business_leases where id = p_lease and advertiser_id = p_advertiser and status = 'live' for update;
  if not found then raise exception 'not_yours'; end if;
  update public.business_leases set billboard_path = p_path where id = p_lease;
  return v_old;
end $$;

/** Live businesses in a region, for the map (with their billboard design). */
create or replace function public.businesses_in(p_region text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.business_tidy();
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'building', building_id, 'name', name, 'category', category, 'about', about, 'address', address,
    'phone', phone, 'whatsapp', whatsapp, 'website', website, 'logo', logo_path, 'billboardImage', coalesce(billboard_path, logo_path),
    'glow', glow, 'kind', kind, 'storeys', storeys, 'billboard', billboard)), '[]'::jsonb)
  from public.business_leases where region = p_region and status = 'live' and ends_at > now());
end $$;

/** An account's leases with their numbers, taps used and allowed, and billboard design. */
create or replace function public.business_mine(p_advertiser uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'building', l.building_id, 'name', l.name, 'category', l.category, 'about', l.about, 'address', l.address,
    'phone', l.phone, 'whatsapp', l.whatsapp, 'website', l.website, 'logo', l.logo_path, 'billboardImage', coalesce(l.billboard_path, l.logo_path),
    'status', l.status, 'glow', l.glow, 'kind', l.kind, 'storeys', l.storeys, 'billboard', l.billboard, 'startsAt', l.starts_at, 'endsAt', l.ends_at,
    'priceKobo', l.price_kobo, 'clickCap', l.click_cap, 'clicks', public.lease_taps(l.id),
    'hits', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id group by kind) s), '{}'::jsonb),
    'week', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id and h.day > (now() at time zone 'Africa/Lagos')::date - 7 group by kind) s), '{}'::jsonb)
  ) order by l.created_at desc), '[]'::jsonb)
  from public.business_leases l where l.advertiser_id = p_advertiser and l.status <> 'pending_payment'
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lease_clicks(bigint)', 'public.lease_taps(uuid)', 'public.business_tidy()', 'public.business_paid(text, bigint)',
    'public.business_billboard_set(uuid, uuid, text)', 'public.businesses_in(text)', 'public.business_mine(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
