-- Newtown, part 120: food at a table costs money (docs/FOOD.md). Order sitting down in a restaurant,
-- a club, a lounge or a hotel and the bill (worked out by the game from the menu and the place: a
-- hotel costs more than a buka) is paid from your Fun money, then savings, then essentials, and
-- burned like other spending. A good meal lifts Mind and Body a little.
--
-- Safe to run more than once. Run after part 119.

insert into public.game_settings (key, value, note) values
  ('food_order_max', 200, 'Most one order at a table can cost (mint, a sanity check: six dishes at a hotel is about 150)')
on conflict (key) do update set note = excluded.note;

/** Pay for an order at a table. Returns what was paid. */
create or replace function public.life_order_food(p_user uuid, p_place text, p_items text, p_cost numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(least(public.setting('food_order_max'), greatest(0, coalesce(p_cost, 0))), 2);
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
    if public.life_can_spend(p_user, array['fun', 'savings', 'essentials']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    v_paid := public.life_spend(p_user, array['fun', 'savings', 'essentials'], v_cost);
    perform public.log_coins(p_user, null, 'food', -v_paid, false, left('Ate out: ' || coalesce(p_items, 'a meal'), 120));
    perform public.burn(null, v_paid, 'Restaurants');
    update public.lives set mind = least(100, mind + 2), health = least(100, health + 1) where user_id = p_user;
  end if;
  return v_paid;
end $$;

do $$
begin
  revoke all on function public.life_order_food(uuid, text, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_order_food(uuid, text, text, numeric) to service_role;
end $$;
