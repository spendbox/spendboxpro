-- Newtown, part 54: what you've earned, pay slip by pay slip (Finance, Overview).
--
-- Opening Finance first shows what you've earned (all of it, and the last week or month) and each
-- payment that came in, like a pile of pay slips you can filter: job, side hustle, rent, sales.
-- The numbers on whether you're up or down overall moved to Finance, Stats.
--
-- Safe to run more than once. Run after parts 1-53.

/** Everything you've earned (ever, and in the last p_days days), and the latest payments in. */
create or replace function public.life_earnings(p_user uuid, p_days int, p_limit int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  with earned as (
    select id, kind, amount, note, created_at from public.ledger
    where user_id = p_user and amount > 0
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'property_sale', 'item_sale', 'car_sale', 'service_pay')
  )
  select jsonb_build_object(
    'total', coalesce((select round(sum(amount), 2) from earned), 0),
    'period', coalesce((select round(sum(amount), 2) from earned where created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 3650))), 0),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', round(e.amount, 2), 'note', e.note, 'at', e.created_at) order by e.created_at desc, e.id desc)
      from (select * from earned where created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 3650))
            order by created_at desc, id desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) e), '[]'::jsonb)
  )
$$;

do $$
begin
  revoke all on function public.life_earnings(uuid, int, int) from public, anon, authenticated;
  grant execute on function public.life_earnings(uuid, int, int) to service_role;
end $$;
