-- Newtown, part 105: starter packs are offered for the first 72 hours after you join, then they're
-- gone (they used to stay until you bought a home of your own). Buying a home no longer ends the
-- offer early. One pack each, as before.
--
-- Safe to run more than once. Run after part 90.

/** When this player's starter-pack offer ends (72 hours after they joined). */
create or replace function public.pack_ends_at(p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select created_at + interval '72 hours' from public.profiles where id = p_user
$$;

/** Can this player still buy a pack? 'open', 'had' (one already) or 'too_late' (72 hours have passed). */
create or replace function public.pack_status(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.pack_had(p_user) then 'had'
    when coalesce(public.pack_ends_at(p_user), now()) <= now() then 'too_late'
    else 'open' end
$$;

revoke all on function public.pack_ends_at(uuid) from public, anon, authenticated;
grant execute on function public.pack_ends_at(uuid) to service_role;
