-- Newtown, part 126: bottle service in clubs (docs/CLUBS.md). Order bottles at a club and the bill
-- (worked out by the game from its bottle list and the club: the ₦10m-door clubs charge more) is
-- paid from your Fun money, then savings, and burned like other spending. Hostesses bring the
-- bottles to your table with sparklers, for the whole club to see.
--
-- Safe to run more than once. Run after part 120.

insert into public.game_settings (key, value, note) values
  ('bottle_order_max', 40000, 'Most one bottle order can cost (mint, a sanity check: a 3 L Ace of Spades at a ₦10m club is about 30,000)')
on conflict (key) do update set note = excluded.note;

/** Pay for bottles at a club. Returns what was paid. */
create or replace function public.life_order_bottles(p_user uuid, p_place text, p_items text, p_cost numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(least(public.setting('bottle_order_max'), greatest(0, coalesce(p_cost, 0))), 2);
  v_paid numeric := 0;
  p public.profiles;
begin
  if p_place is null or p_place !~ '^b:[0-9]{1,7}$' then raise exception 'bad_place'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    v_paid := public.life_spend(p_user, array['fun', 'savings'], v_cost);
    perform public.log_coins(p_user, null, 'bottles', -v_paid, false, left('Bottle service: ' || coalesce(p_items, 'bottles'), 120));
    perform public.burn(null, v_paid, 'Clubs');
  end if;
  return v_paid;
end $$;

do $$
begin
  revoke all on function public.life_order_bottles(uuid, text, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_order_bottles(uuid, text, text, numeric) to service_role;
end $$;
