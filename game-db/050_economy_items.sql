-- Newtown, part 50: a kinder economy, and things to own.
--
-- Pay. Jobs and side hustles pay four times real Lagos wages (src/lib/world/work.ts PAY_BOOST, in
-- every city), so the caps that check what the game sends go up, and jobs and hustles people
-- already have get the same raise, once.
--
-- Safe to run more than once. Run after parts 1-49.

-- ============================================================ pay four times real wages
update public.game_settings set value = greatest(value, 1000), note = 'Most a job on the real map can pay every 2 hours (mint, before skill bonus)' where key = 'work_pay_max';
update public.game_settings set value = greatest(value, 400), note = 'Most a side hustle can earn every 2 hours (mint, before swing and boost)' where key = 'hustle_pay_max';
insert into public.game_settings (key, value, note) values
  ('pay_boost_done', 0, 'Set to 1 once the jobs and hustles people had got the 4x raise (part 50)')
on conflict (key) do nothing;
do $$
begin
  if public.setting('pay_boost_done') = 0 then
    update public.life_jobs set pay_day = round(pay_day * 4, 2);
    update public.life_hustles set pay_day = round(pay_day * 4, 2);
    update public.game_settings set value = 1 where key = 'pay_boost_done';
  end if;
end $$;

-- ============================================================ money day by day
/**
 * Your money by day (Lagos days, the last p_days of them, oldest first): what you earned (pay,
 * hustles, rent, sales), what living cost you (tax, bills, getting about, health, school, fees),
 * and what you bought to keep (property, cars, items, starting a hustle). Earned minus costs says
 * whether you're up or down; buying things to keep is spending into what you own, so it's shown
 * apart.
 */
create or replace function public.life_money_days(p_user uuid, p_days int) returns jsonb
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(
      (date_trunc('day', now() at time zone 'Africa/Lagos') - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) - 1)),
      date_trunc('day', now() at time zone 'Africa/Lagos'), interval '1 day') as day
  ),
  rows as (
    select date_trunc('day', created_at at time zone 'Africa/Lagos') as day, kind, amount from public.ledger
    where user_id = p_user and created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) + 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(d.day, 'YYYY-MM-DD'),
    'earned', round(coalesce((select sum(amount) from rows r where r.day = d.day and r.amount > 0
      and r.kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'property_sale', 'item_sale', 'car_sale', 'service_pay')), 0), 2),
    'costs', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('income_tax', 'rent_tax', 'vat', 'sale_tax', 'power_bill', 'waste_bill', 'commute', 'health_care', 'gym', 'school_fees',
                     'procedure', 'loan_repay', 'market_fee', 'item_tax', 'car_running')), 0), 2),
    'bought', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('property_buy', 'property_tax', 'hustle_start', 'item_buy', 'car_buy', 'craft_cost')), 0), 2)
  ) order by d.day), '[]'::jsonb)
  from days d
$$;

do $$
begin
  revoke all on function public.life_money_days(uuid, int) from public, anon, authenticated;
  grant execute on function public.life_money_days(uuid, int) to service_role;
end $$;
