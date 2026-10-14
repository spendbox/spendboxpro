-- Newtown, part 87: name any property you own (a flat, a shop, an office, a plot...), not just
-- your home, from Assets. An empty name puts back what the map calls it ("Flat 2", "Shop 1").
-- The names show on your Assets and in the map's search, like a home's (part 78).
--
-- Run it after 078. Safe to run more than once.

/** Name a unit you own (null or '' puts back its plain name from the building). */
create or replace function public.unit_rename(p_user uuid, p_unit text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_plain text;
  v_label text;
  u public.property_units;
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  select * into u from public.property_units where unit_id = p_unit and owner_id = p_user;
  if not found then raise exception 'not_yours'; end if;
  -- Its plain name: what the building's snapshot calls it (a free room is a "Room").
  select b.snapshot -> 'units' -> (split_part(p_unit, '/', 2)::int) ->> 'label' into v_plain
  from public.property_buildings b where b.building_id = u.building_id;
  v_label := coalesce(v_name, case when u.starter then 'Room' end, v_plain, case when u.use = 'home' then 'Home' else 'Unit' end);
  update public.property_units set label = left(v_label, 60) where unit_id = p_unit;
  -- Naming your home still counts for the walkthrough's first mission (part 80).
  if v_name is not null and u.use = 'home' then update public.lives set home_named_at = now() where user_id = p_user; end if;
  return v_label;
end $$;
revoke all on function public.unit_rename(uuid, text, text) from public, anon, authenticated;
grant execute on function public.unit_rename(uuid, text, text) to service_role;
