-- Newtown, part 38: owning property on the real map (docs/PROPERTY.md).
--
-- A life on the real map starts with a budget (start_grant, once) and buying a home. Every
-- building and unit on the map has a permanent id ("lagos:12,-40" and "lagos:12,-40/3"); the game
-- works out what each unit is worth (land + building, from the map) and the database checks and
-- records the rest:
--
--  - buying a unit nobody owns (from the city): its price is burned, a purchase tax goes to the
--    treasuries; the building is saved exactly as bought, so it stands as bought whatever the map
--    does later; the first home you buy is your home (your primary residence) until you choose
--    another of yours;
--  - letting a unit out (not your home): it earns rent by the second while let, collected when you
--    ask, less a rent tax to the treasuries;
--  - naming a building you own all of.
--
-- Treasuries: every purchase tax and rent tax goes to the state's treasury and the country's
-- (treasury_state_share to the state, the rest to the country). Anyone can read them (balance and
-- every movement); spending them comes later (governors, presidents).
--
-- New mint: 'start_grant' and 'rent' (added to coin_supply_daily). Purchase prices are burned.
-- Money in treasuries has left the players without being burned: created - burned = players'
-- mint + treasuries.
--
-- Safe to run more than once. Run after parts 1-37.

insert into public.game_settings (key, value, note) values
  ('start_grant',          5000, 'Mint to start a life on the real map with (once)'),
  ('property_buy_tax',     0.03, 'Tax on buying property (into the treasuries)'),
  ('property_rent_tax',    0.10, 'Tax on rent (into the treasuries)'),
  ('treasury_state_share', 0.7,  'Share of each tax that goes to the state (the rest to the country)'),
  ('property_price_max',   100000000, 'Dearest unit the game will sell (a sanity check)')
on conflict (key) do update set note = excluded.note;
-- For a while lives started with 60,000; move that back to 5,000 (a value set by hand stays).
update public.game_settings set value = 5000 where key = 'start_grant' and value = 60000;

-- ============================================================ lives, buildings, units
create table if not exists public.lives (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  region text not null check (char_length(region) <= 30),
  -- Your home: one of your units (null until you buy one).
  home_unit text,
  granted numeric(14,2) not null default 0,
  started_at timestamptz not null default now()
);

-- A building as first bought (its kind, storeys, units, look), so it always stands as bought.
create table if not exists public.property_buildings (
  building_id text primary key check (building_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$'),
  region text not null,
  snapshot jsonb not null,
  name text check (name is null or char_length(name) between 2 and 40),
  created_at timestamptz not null default now()
);
create index if not exists property_buildings_region_idx on public.property_buildings (region);

create table if not exists public.property_units (
  unit_id text primary key check (unit_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$'),
  building_id text not null references public.property_buildings (building_id),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) <= 60),
  use text not null check (use in ('home', 'shop', 'office', 'industry', 'land')),
  area numeric(12,1) not null check (area > 0),
  price numeric(14,2) not null check (price > 0),
  -- Rent while let: mint per real day (the game works it out from the unit's value).
  rent_day numeric(14,2) not null default 0 check (rent_day >= 0),
  let boolean not null default false,
  collected_at timestamptz not null default now(),
  bought_at timestamptz not null default now()
);
create index if not exists property_units_owner_idx on public.property_units (owner_id);
create index if not exists property_units_building_idx on public.property_units (building_id);

create table if not exists public.property_sales (
  id bigserial primary key,
  unit_id text not null,
  seller_id uuid references public.profiles (id) on delete set null, -- null: the city
  buyer_id uuid references public.profiles (id) on delete set null,
  price numeric(14,2) not null,
  tax numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists property_sales_unit_idx on public.property_sales (unit_id, created_at desc);

-- ============================================================ treasuries
create table if not exists public.treasuries (
  id text primary key check (char_length(id) <= 30), -- 'ng' (Nigeria), 'ng-la' (Lagos State)
  name text not null,
  parent text references public.treasuries (id),
  balance numeric(16,2) not null default 0
);
create table if not exists public.treasury_ledger (
  id bigserial primary key,
  treasury text not null references public.treasuries (id),
  amount numeric(14,2) not null, -- positive in, negative spent
  kind text not null check (char_length(kind) <= 30),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists treasury_ledger_idx on public.treasury_ledger (treasury, created_at desc);

insert into public.treasuries (id, name, parent) values ('ng', 'Federal Republic of Nigeria', null) on conflict (id) do nothing;
insert into public.treasuries (id, name, parent) values ('ng-la', 'Lagos State', 'ng') on conflict (id) do nothing;

/** Which state treasury a region's taxes go to. */
create or replace function public.region_treasury(p_region text) returns text
language sql immutable as $$ select case p_region when 'lagos' then 'ng-la' else 'ng' end $$;

/** Split a tax between the state and the country, and record it. */
create or replace function public.pay_tax(p_region text, p_amount numeric, p_kind text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_state text := public.region_treasury(p_region);
  v_country text;
  v_state_part numeric;
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  select coalesce(parent, id) into v_country from public.treasuries where id = v_state;
  v_state_part := case when v_country = v_state then p_amount else round(p_amount * public.setting('treasury_state_share'), 2) end;
  update public.treasuries set balance = balance + v_state_part where id = v_state;
  insert into public.treasury_ledger (treasury, amount, kind, note) values (v_state, v_state_part, p_kind, p_note);
  if p_amount - v_state_part > 0 then
    update public.treasuries set balance = balance + (p_amount - v_state_part) where id = v_country;
    insert into public.treasury_ledger (treasury, amount, kind, note) values (v_country, p_amount - v_state_part, p_kind, p_note);
  end if;
end $$;

-- ============================================================ starting a life
/** Start (or carry on) your life in a region: the starting budget the first time. */
create or replace function public.life_start(p_user uuid, p_region text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  v_grant numeric := public.setting('start_grant');
begin
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_region'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user;
  if found then
    return jsonb_build_object('started', false, 'coins', p.coins, 'home', l.home_unit, 'region', l.region);
  end if;
  insert into public.lives (user_id, region, granted) values (p_user, p_region, v_grant);
  update public.profiles set coins = coins + v_grant where id = p_user;
  perform public.log_coins(p_user, null, 'start_grant', v_grant, false, 'Starting a life in ' || p_region);
  return jsonb_build_object('started', true, 'coins', p.coins + v_grant, 'home', null, 'region', p_region, 'granted', v_grant);
end $$;

-- ============================================================ buying
/**
 * Buy a unit nobody owns yet, from the city, at the price the game worked out (p_price, mint).
 * p_snapshot: the building as the map has it now (saved if this is its first sale).
 * p_rent_day: what it would earn a day if let. Returns your mint and whether it's your home now.
 */
create or replace function public.property_buy(
  p_user uuid, p_region text, p_unit text, p_snapshot jsonb, p_price numeric, p_use text, p_area numeric, p_label text, p_rent_day numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  v_building text := split_part(p_unit, '/', 1);
  v_price numeric := round(p_price, 2);
  v_tax numeric;
  v_home boolean := false;
begin
  if p_unit is null or p_unit !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$' or split_part(v_building, ':', 1) <> p_region then raise exception 'bad_unit'; end if;
  if v_price is null or v_price <= 0 or v_price > public.setting('property_price_max') then raise exception 'bad_price'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  -- Your first purchase must be a home.
  if l.home_unit is null and p_use <> 'home' then raise exception 'home_first'; end if;
  if exists (select 1 from public.property_units where unit_id = p_unit) then raise exception 'taken'; end if;
  v_tax := round(v_price * public.setting('property_buy_tax'), 2);
  if p.coins < v_price + v_tax then raise exception 'not_enough:%', trim_scale(v_price + v_tax); end if;

  insert into public.property_buildings (building_id, region, snapshot) values (v_building, p_region, p_snapshot)
  on conflict (building_id) do nothing;
  insert into public.property_units (unit_id, building_id, owner_id, label, use, area, price, rent_day)
  values (p_unit, v_building, p_user, left(p_label, 60), p_use, p_area, v_price, greatest(0, round(coalesce(p_rent_day, 0), 2)));
  insert into public.property_sales (unit_id, seller_id, buyer_id, price, tax) values (p_unit, null, p_user, v_price, v_tax);

  update public.profiles set coins = coins - v_price - v_tax where id = p_user;
  perform public.log_coins(p_user, null, 'property_buy', -(v_price + v_tax), false, 'Bought ' || p_unit);
  perform public.burn(null, v_price, 'Property bought from the city');
  perform public.pay_tax(p_region, v_tax, 'property_tax', 'Tax on buying ' || p_unit);

  if l.home_unit is null then
    update public.lives set home_unit = p_unit where user_id = p_user;
    v_home := true;
  end if;
  return jsonb_build_object('coins', p.coins - v_price - v_tax, 'home', v_home, 'tax', v_tax);
end $$;

-- ============================================================ your home, letting, naming
/** Make one of your homes your home (your primary residence). */
create or replace function public.property_set_home(p_user uuid, p_unit text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.property_units where unit_id = p_unit and owner_id = p_user and use = 'home') then raise exception 'not_yours'; end if;
  update public.property_units set let = false, collected_at = now() where unit_id = p_unit and let;
  update public.lives set home_unit = p_unit where user_id = p_user;
end $$;

/** Collect the rent your let units have earned so far (less the rent tax). Returns what you got. */
create or replace function public.property_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u record;
  v_gross numeric := 0;
  v_tax numeric := 0;
  v_rent numeric;
  v_unit_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  for u in select * from public.property_units where owner_id = p_user and let and rent_day > 0 for update loop
    v_rent := round(u.rent_day * extract(epoch from (now() - u.collected_at)) / 86400, 2);
    if v_rent <= 0 then continue; end if;
    v_unit_tax := round(v_rent * public.setting('property_rent_tax'), 2);
    perform public.pay_tax(split_part(u.unit_id, ':', 1), v_unit_tax, 'rent_tax', 'Rent tax on ' || u.unit_id);
    update public.property_units set collected_at = now() where unit_id = u.unit_id;
    v_gross := v_gross + v_rent;
    v_tax := v_tax + v_unit_tax;
  end loop;
  if v_gross - v_tax > 0 then
    update public.profiles set coins = coins + (v_gross - v_tax) where id = p_user;
    perform public.log_coins(p_user, null, 'rent', v_gross - v_tax, false, 'Rent');
  end if;
  return jsonb_build_object('rent', v_gross - v_tax, 'tax', v_tax, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Let one of your units out (or stop): not your home. Collects what it's earned first. */
create or replace function public.property_let(p_user uuid, p_unit text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_home text;
  v_out jsonb;
begin
  if not exists (select 1 from public.property_units where unit_id = p_unit and owner_id = p_user) then raise exception 'not_yours'; end if;
  select home_unit into v_home from public.lives where user_id = p_user;
  if p_on and v_home = p_unit then raise exception 'is_home'; end if;
  v_out := public.property_collect(p_user);
  update public.property_units set let = coalesce(p_on, false), collected_at = now() where unit_id = p_unit;
  return v_out;
end $$;

/** Name a building you own every unit of (null to clear). */
create or replace function public.property_rename(p_user uuid, p_building text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_units int;
  v_mine int;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  select jsonb_array_length(snapshot -> 'units') into v_units from public.property_buildings where building_id = p_building;
  if v_units is null then raise exception 'not_yours'; end if;
  select count(*) into v_mine from public.property_units where building_id = p_building and owner_id = p_user;
  if v_mine < v_units then raise exception 'not_all_yours'; end if;
  update public.property_buildings set name = v_name where building_id = p_building;
end $$;

-- ============================================================ reading
/** Your life: home, mint, every unit you own (with rent waiting to be collected). */
create or replace function public.my_assets(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'life', (select to_jsonb(l) - 'user_id' from public.lives l where l.user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unit', u.unit_id, 'building', u.building_id, 'label', u.label, 'use', u.use, 'area', u.area,
        'price', u.price, 'rentDay', u.rent_day, 'let', u.let, 'boughtAt', u.bought_at, 'name', b.name,
        'waiting', case when u.let then round(u.rent_day * extract(epoch from (now() - u.collected_at)) / 86400, 2) else 0 end
      ) order by u.bought_at)
      from public.property_units u join public.property_buildings b using (building_id)
      where u.owner_id = p_user), '[]'::jsonb)
  )
$$;

/** Every owned building in a region (as bought, with its name), for drawing them on the map. */
create or replace function public.owned_buildings(p_region text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', building_id, 'building', snapshot, 'name', name)), '[]'::jsonb)
  from public.property_buildings where region = p_region
$$;

/** Who owns which units of a building (by name; null where nobody does yet). */
create or replace function public.building_owners(p_building text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('unit', u.unit_id, 'owner', u.owner_id, 'name', coalesce(p.username, 'A player'))), '[]'::jsonb)
  from public.property_units u join public.profiles p on p.id = u.owner_id
  where u.building_id = p_building
$$;

/** The treasuries: balances and their latest movements (open to everyone). */
create or replace function public.treasury_report() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'balance', t.balance,
    'latest', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('amount', amount, 'kind', kind, 'note', note, 'at', created_at) as x
      from public.treasury_ledger where treasury = t.id order by created_at desc limit 20) s), '[]'::jsonb)
  ) order by t.parent nulls first, t.id), '[]'::jsonb)
  from public.treasuries t
$$;

-- ============================================================ the books
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.lives, public.property_buildings, public.property_units, public.property_sales,
    public.treasuries, public.treasury_ledger from public, anon, authenticated;
  grant all on table public.lives, public.property_buildings, public.property_units, public.property_sales,
    public.treasuries, public.treasury_ledger to service_role;
  revoke all on sequence public.property_sales_id_seq, public.treasury_ledger_id_seq from public, anon, authenticated;
  grant all on sequence public.property_sales_id_seq, public.treasury_ledger_id_seq to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.pay_tax(text, numeric, text, text)', 'public.life_start(uuid, text)',
    'public.property_buy(uuid, text, text, jsonb, numeric, text, numeric, text, numeric)', 'public.property_set_home(uuid, text)',
    'public.property_collect(uuid)', 'public.property_let(uuid, text, boolean)', 'public.property_rename(uuid, text, text)',
    'public.my_assets(uuid)', 'public.owned_buildings(text)', 'public.building_owners(text)', 'public.treasury_report()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
