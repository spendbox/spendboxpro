-- Newtown, part 125: the city's owned buildings, only what changed (docs/COSTS.md, "The
-- savings"). Every phone used to fetch every owned building in the city, with its layout, every
-- minute: a list that grows with the players, fetched by every player. Now each building notes
-- when it last changed (bought into, named, regrown), and a phone fetches the whole list once
-- (shared by everyone through the CDN, /api/owned) and then only what changed since.
--
-- Safe to run more than once. Run after part 91 (any time).

alter table public.property_buildings add column if not exists updated_at timestamptz not null default now();
create index if not exists property_buildings_changed_idx on public.property_buildings (region, updated_at);

create or replace function public.property_buildings_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists property_buildings_touch on public.property_buildings;
create trigger property_buildings_touch before update on public.property_buildings
  for each row execute function public.property_buildings_touch();

/**
 * The owned buildings in a region that changed after p_since (all of them when p_since is null):
 * { at: the database's time now (ms, to ask from next time), rows: [{ id, building, name }] }.
 */
create or replace function public.owned_buildings_since(p_region text, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'at', floor(extract(epoch from now()) * 1000),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', building_id, 'building', snapshot, 'name', name))
                      from public.property_buildings
                      where region = p_region and (p_since is null or updated_at > p_since)), '[]'::jsonb))
$$;

do $$
begin
  revoke all on function public.owned_buildings_since(text, timestamptz), public.property_buildings_touch() from public, anon, authenticated;
  grant execute on function public.owned_buildings_since(text, timestamptz) to service_role;
end $$;
