-- Newtown, part 64: building onto your home (docs/HOME_PLANNER.md). Planning stays free, but
-- saving a plan pays for what's new: each extra floor (builders), and each piece of furniture
-- you don't already own. What you've paid for stays yours (take a floor off, or a sofa out, and
-- putting it back costs nothing). Floors add most of their cost to your home's value, furniture
-- some of it. The game works out the prices (src/lib/home-plan.ts planCost); this keeps the
-- books.
--
-- Safe to run more than once. Run after part 63.

alter table public.home_plans add column if not exists paid jsonb not null default '{}'::jsonb;

insert into public.game_settings (key, value, note) values
  ('home_upgrade_max', 200000, 'Most one save of a home plan can cost (mint, a sanity check)')
on conflict (key) do update set note = excluded.note;

/**
 * Save a home plan, paying for what's new. p_cost: what it costs (mint), p_value: what it adds
 * to the home's value, p_paid: everything paid for so far (after this). Returns your wallet.
 */
create or replace function public.home_plan_save(p_user uuid, p_unit text, p_plan jsonb, p_paid jsonb, p_cost numeric, p_value numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(greatest(0, coalesce(p_cost, 0)), 2);
  v_value numeric := round(greatest(0, coalesce(p_value, 0)), 2);
  v_unit public.property_units;
begin
  if v_cost > public.setting('home_upgrade_max') then raise exception 'too_dear'; end if;
  perform 1 from public.lives where user_id = p_user and home_unit = p_unit for update;
  if not found then raise exception 'not_home'; end if;
  select * into v_unit from public.property_units where unit_id = p_unit for update;
  if v_cost > 0 then
    -- Only your own home can be built onto (a home you rent is the landlord's).
    if not found or v_unit.owner_id <> p_user then raise exception 'not_owner'; end if;
    if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'home_upgrade', -v_cost, false, 'Building onto your home');
    perform public.burn(null, v_cost, 'Home improvements');
    update public.property_units
      set price = least(public.setting('property_price_max'), price + v_value)
      where unit_id = p_unit;
  end if;
  insert into public.home_plans (user_id, unit, plan, paid, updated_at)
    values (p_user, p_unit, p_plan, coalesce(p_paid, '{}'::jsonb), now())
  on conflict (user_id) do update set unit = excluded.unit, plan = excluded.plan, paid = excluded.paid, updated_at = now();
  return jsonb_build_object(
    'coins', (select coins from public.profiles where id = p_user),
    'value', (select price from public.property_units where unit_id = p_unit)
  );
end $$;

revoke all on function public.home_plan_save(uuid, text, jsonb, jsonb, numeric, numeric) from public, anon, authenticated;
grant execute on function public.home_plan_save(uuid, text, jsonb, jsonb, numeric, numeric) to service_role;
