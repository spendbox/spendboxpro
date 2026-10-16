-- Newtown, part 118: dearer clubs. Every club now charges at the door, ₦250k, ₦500k, ₦1m or ₦10m
-- (src/lib/fees.ts), so the most one door can charge goes up from ₥1,000 to ₥10,000. Everything
-- else about club entry (part 67) stays the same: paid once, good for 24 hours, the money burned.
--
-- Safe to run more than once. Run after part 117.

/**
 * Into a club: free if you paid in the last 24 hours, otherwise pays the fee (mint, at most 10,000:
 * ₦15m at ₦1,500 a mint, room for the ₦10m clubs).
 * Returns what was paid now and until when you're in.
 */
create or replace function public.life_club_entry(p_user uuid, p_place text, p_fee numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric := round(least(10000, greatest(0, coalesce(p_fee, 0))), 2);
  v_paid numeric := 0;
  v_at timestamptz;
  p public.profiles;
begin
  if p_place is null or p_place !~ '^b:[0-9]{1,7}$' then raise exception 'bad_place'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select paid_at into v_at from public.club_entries where user_id = p_user and place = p_place for update;
  if v_at is not null and v_at > now() - interval '24 hours' then
    return jsonb_build_object('paid', 0, 'until', v_at + interval '24 hours');
  end if;
  if v_fee > 0 then
    perform 1 from public.lives where user_id = p_user for update;
    if not found then raise exception 'no_life'; end if;
    if public.life_can_spend(p_user, array['fun']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    v_paid := public.life_spend(p_user, array['fun'], v_fee);
    perform public.log_coins(p_user, null, 'club_entry', -v_paid, false, 'Club entry: ' || p_place);
    perform public.burn(null, v_paid, 'Club entry');
  end if;
  insert into public.club_entries (user_id, place, fee, paid_at) values (p_user, p_place, v_paid, now())
  on conflict (user_id, place) do update set fee = excluded.fee, paid_at = excluded.paid_at;
  return jsonb_build_object('paid', v_paid, 'until', now() + interval '24 hours');
end $$;

do $$
begin
  revoke all on function public.life_club_entry(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_club_entry(uuid, text, numeric) to service_role;
end $$;
