-- Newtown, part 91: the city grows with its players (docs/GROWTH.md).
--   1. Each city has a growth level from how many people live there (the steps are in
--      src/lib/world/growth.ts, GROWTH_STEPS). It only ever goes up. As it rises, buildings nobody
--      owns yet are rebuilt taller, and gated estates spread.
--   2. A sold-out block (every flat, office or shop in it owned, by more than one player) grows:
--      more storeys, and the new units go on sale. Units already owned keep their number and name.
--
-- Run it after 038 (property). Safe to run more than once.

-- ============================================================ 1. growth levels
create table if not exists public.city_growth (
  region text primary key check (region ~ '^[a-z0-9-]{2,30}$'),
  level int not null default 0 check (level between 0 and 20),
  lives int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.city_growth enable row level security;

/** A city's growth level now (counting who lives there), kept if higher than before; never lower. */
create or replace function public.city_growth_level(p_region text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_lives int;
  v_level int := 0;
  v_step int;
begin
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' then return 0; end if;
  select count(*) into v_lives from public.lives where region = p_region;
  -- The same steps as GROWTH_STEPS in src/lib/world/growth.ts.
  foreach v_step in array array[1000, 3000, 7500, 15000, 30000, 60000, 120000, 250000, 500000] loop
    if v_lives >= v_step then v_level := v_level + 1; end if;
  end loop;
  insert into public.city_growth (region, level, lives) values (p_region, v_level, v_lives)
    on conflict (region) do update set level = greatest(public.city_growth.level, excluded.level), lives = excluded.lives, updated_at = now();
  return (select level from public.city_growth where region = p_region);
end $$;

-- ============================================================ 2. sold-out blocks grow
/**
 * Grow a sold-out block: its snapshot becomes p_snapshot (worked out by the server: the same units,
 * then the new ones). Only when every unit it had (p_before of them) is owned, by two players or
 * more (one owner of a whole block keeps it as it is), and only once per step (nobody grew it meanwhile).
 */
create or replace function public.building_grow(p_building text, p_snapshot jsonb, p_before int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_snap jsonb;
  v_owned int;
  v_owners int;
begin
  select snapshot into v_snap from public.property_buildings where building_id = p_building for update;
  if not found or jsonb_array_length(v_snap->'units') <> p_before then return false; end if;
  if jsonb_array_length(p_snapshot->'units') <= p_before then return false; end if;
  select count(*), count(distinct owner_id) into v_owned, v_owners from public.property_units where building_id = p_building and owner_id is not null;
  if v_owned < p_before or v_owners < 2 then return false; end if;
  -- The units already there must stay exactly as they were (same order, same names).
  if exists (select 1 from generate_series(0, p_before - 1) k where (v_snap->'units'->k->>'label') is distinct from (p_snapshot->'units'->k->>'label')) then
    return false;
  end if;
  update public.property_buildings set snapshot = p_snapshot where building_id = p_building;
  return true;
end $$;

do $$
declare f text;
begin
  revoke all on table public.city_growth from public, anon, authenticated;
  grant all on table public.city_growth to service_role;
  foreach f in array array['public.city_growth_level(text)', 'public.building_grow(text, jsonb, int)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
