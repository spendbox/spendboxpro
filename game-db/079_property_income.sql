-- Newtown, part 79: property pays you, by itself (docs/MONEY.md, "What your property earns").
--   1. Every home, shop, office or plot you own (not a free room) earns a share of what you paid
--      for it every day (property_income_day, 1% a day to start), counted to the second and paid
--      whenever the game asks (opening the game, every minute while you play, opening your
--      wallet). While you're away it keeps earning, up to 2 days' worth.
--   2. Buying from the city is simply its price: no buying tax any more.
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('property_income_day', 0.01, 'Share of what you paid for a property that it earns you every day (paid automatically)'),
  ('property_income_cap_hours', 48, 'Most hours of property income paid at once (earning while away)')
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- A simple buy at the price shown.
update public.game_settings set value = 0 where key = 'property_buy_tax';

alter table public.lives add column if not exists income_at timestamptz;

-- What a unit earns on: what it cost from the city (a sale between players, at whatever price
-- they agree, doesn't change it, so nobody can sell a flat to a friend for ₦1bn and earn on that).
alter table public.property_units add column if not exists income_base numeric(14,2);
update public.property_units set income_base = price where income_base is null;

/** What your property earns a day (mint): the share of what you paid for each unit you own (free rooms earn nothing). */
create or replace function public.property_income_day(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(coalesce(sum(coalesce(u.income_base, u.price)), 0) * coalesce(public.setting('property_income_day'), 0), 4)
  from public.property_units u
  where u.owner_id = p_user and not coalesce(u.starter, false)
$$;

/**
 * Pay what your property has earned since last time (up to the cap). Returns
 * { paid, per_day, at, coins, total }: paid now, earning a day, when it was counted up to, your
 * coins after, and all it has ever paid you.
 */
create or replace function public.property_income_settle(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_day numeric := public.property_income_day(p_user);
  v_secs numeric;
  v_pay numeric := 0;
  v_coins numeric;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return jsonb_build_object('paid', 0, 'per_day', 0); end if;
  if l.income_at is not null and v_day > 0 then
    v_secs := least(extract(epoch from now() - l.income_at), coalesce(public.setting('property_income_cap_hours'), 48) * 3600);
    v_pay := floor(v_day * greatest(v_secs, 0) / 86400 * 100) / 100;
  end if;
  if v_pay > 0 then
    update public.profiles set coins = coins + v_pay where id = p_user;
    perform public.log_coins(p_user, null, 'property_income', v_pay, false, 'What your property earned');
    -- Counted up to the second that's been paid for (the pennies not yet paid carry on).
    update public.lives set income_at = least(now(), l.income_at + make_interval(secs => v_pay / v_day * 86400)) where user_id = p_user;
    if extract(epoch from now() - l.income_at) > coalesce(public.setting('property_income_cap_hours'), 48) * 3600 then
      update public.lives set income_at = now() where user_id = p_user;
    end if;
  elsif l.income_at is null or v_day <= 0 then
    update public.lives set income_at = now() where user_id = p_user;
  end if;
  select coins into v_coins from public.profiles where id = p_user;
  return jsonb_build_object(
    'paid', v_pay,
    'per_day', v_day,
    'at', (select income_at from public.lives where user_id = p_user),
    'coins', v_coins,
    'total', coalesce((select sum(amount) from public.ledger where user_id = p_user and kind = 'property_income'), 0)
  );
end $$;

/**
 * A unit bought or changing hands: what both owners have earned so far is paid first (at their old
 * rates), so nobody is paid for time before they owned it; and a new unit earns on its city price.
 */
create or replace function public.property_income_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.income_base := coalesce(new.income_base, new.price);
    if new.owner_id is not null then perform public.property_income_settle(new.owner_id); end if;
  elsif new.owner_id is distinct from old.owner_id then
    new.income_base := coalesce(old.income_base, old.price);
    if old.owner_id is not null then perform public.property_income_settle(old.owner_id); end if;
    if new.owner_id is not null then perform public.property_income_settle(new.owner_id); end if;
  else
    -- A new price agreed between players doesn't change what it earns on.
    new.income_base := coalesce(old.income_base, old.price);
  end if;
  return new;
end $$;
drop trigger if exists property_income_guard on public.property_units;
create trigger property_income_guard before insert or update of owner_id, price, income_base on public.property_units
  for each row execute function public.property_income_guard();

revoke all on function public.property_income_day(uuid), public.property_income_settle(uuid), public.property_income_guard() from public, anon, authenticated;
grant execute on function public.property_income_day(uuid), public.property_income_settle(uuid) to service_role;

-- The daily new-mint report counts property income too.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                   'daily_gift', 'challenge_bonus', 'first_step', 'property_income', 'tutorial')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;
revoke all on public.coin_supply_daily from public, anon, authenticated;
grant select on public.coin_supply_daily to service_role;
