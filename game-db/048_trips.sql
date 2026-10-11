-- Newtown, part 48: getting about the real map. Going into a building costs the fare from where
-- you last were (your home, or the last building you went into), the cheapest way there (walk,
-- keke or danfo, src/lib/world/work.ts), paid from your Travel money, then your wallet. Fares are
-- burned, as fares to work are.
--
-- Safe to run more than once. Run after parts 1-47.

insert into public.game_settings (key, value, note) values
  ('trip_fare_max', 50, 'Most a single trip into a building can cost (mint, a sanity check)')
on conflict (key) do update set note = excluded.note;

alter table public.lives add column if not exists at_place text check (at_place is null or at_place ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$');

/** Go to a building: pay the fare (worked out by the game) and be there. Returns what was paid. */
create or replace function public.life_go(p_user uuid, p_place text, p_fare numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_fare numeric := round(least(public.setting('trip_fare_max'), greatest(0, coalesce(p_fare, 0))), 2);
  v_paid numeric := 0;
begin
  if p_place is null or p_place !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$' then raise exception 'bad_place'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_fare > 0 then
    if public.life_can_spend(p_user, array['travel']) < v_fare then raise exception 'not_enough:%', trim_scale(v_fare); end if;
    v_paid := public.life_spend(p_user, array['travel'], v_fare);
    perform public.log_coins(p_user, null, 'commute', -v_paid, false, 'Fare to ' || p_place);
    perform public.burn(null, v_paid, 'Fares about town');
  end if;
  update public.lives set at_place = p_place where user_id = p_user;
  return v_paid;
end $$;

do $$
begin
  revoke all on function public.life_go(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_go(uuid, text, numeric) to service_role;
end $$;
