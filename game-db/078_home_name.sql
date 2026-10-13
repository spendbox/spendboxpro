-- Newtown, part 78: name your home. Any home you hold (bought, or your free room) can have its own
-- name ("Tolu's Pad"), shown on your home card. A free room's name goes with it when it goes back
-- to the city (the row is removed then).
--
-- Safe to run more than once.

alter table public.lives add column if not exists home_named_at timestamptz;

/** Name a home you hold (an empty name puts back what it was called: "Room", "Flat"...). */
create or replace function public.home_rename(p_user uuid, p_unit text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  update public.property_units set label = coalesce(v_name, case when starter then 'Room' else 'Home' end)
  where unit_id = p_unit and owner_id = p_user and use = 'home';
  if not found then raise exception 'not_yours'; end if;
  -- The walkthrough's first step (part 80).
  if v_name is not null then update public.lives set home_named_at = now() where user_id = p_user; end if;
end $$;
revoke all on function public.home_rename(uuid, text, text) from public, anon, authenticated;
grant execute on function public.home_rename(uuid, text, text) to service_role;
