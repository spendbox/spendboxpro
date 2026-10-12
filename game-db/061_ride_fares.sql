-- Newtown, part 61: paying for rides on the real map (src/lib/fees.ts RIDE_FARE_NAIRA). Boarding a
-- train, a lagoon ferry, a bus, a taxi, a Ferris wheel, a water slide, a hot-air balloon or a
-- helicopter tour costs its fare every time, from your Travel money then your wallet, burned like
-- every other fare. (Ride fares used to be taken only during the old hourly games, so on the real
-- map they were free.) Trips about town (game-db/048) now cost real 2026 Lagos fares, so the most
-- one trip can cost goes up too.
--
-- Safe to run more than once. Run after part 60.

insert into public.game_settings (key, value, note) values
  ('ride_fare_max', 150, 'Most boarding one ride can cost (mint, a sanity check: a helicopter tour is about 100)')
on conflict (key) do update set note = excluded.note;
update public.game_settings set value = greatest(value, 80) where key = 'trip_fare_max';

/** Board a ride: pay its fare (worked out by the game). Returns what was paid. */
create or replace function public.life_ride(p_user uuid, p_key text, p_fare numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_fare numeric := round(least(public.setting('ride_fare_max'), greatest(0, coalesce(p_fare, 0))), 2);
  v_paid numeric := 0;
  p public.profiles;
begin
  if p_key is null or p_key !~ '^v:[a-z]+:[0-9]{1,3}$' then raise exception 'bad_place'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_fare > 0 then
    if public.life_can_spend(p_user, array['travel']) < v_fare then raise exception 'not_enough:%', trim_scale(v_fare); end if;
    v_paid := public.life_spend(p_user, array['travel'], v_fare);
    perform public.log_coins(p_user, null, 'commute', -v_paid, false, 'Ride: ' || p_key);
    perform public.burn(null, v_paid, 'Ride fares');
  end if;
  return v_paid;
end $$;

do $$
begin
  revoke all on function public.life_ride(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_ride(uuid, text, numeric) to service_role;
end $$;
