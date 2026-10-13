-- Newtown, part 65: a fairer economy. A look over where money comes from and where it goes found
-- a few ways to get rich without really playing, and jobs paying less than tapping about for free.
--
-- - Jobs pay 18 times real Lagos wages (was 4; src/lib/world/work.ts PAY_BOOST). The lowest jobs
--   (₦60,000 a month) now pay about ₥288 a real day before tax and fares, more than free taps.
--   Every job gets the same raise, and jobs people already have are raised once. The cap on what
--   a job can pay (work_pay_max) goes up to fit. Side hustles stay as they were.
-- - The daily refill counts the money in your budget pots (Savings and the rest) as well as your
--   wallet, so moving money into a pot no longer keeps the refill coming.
-- - Levels cost more: 40 × the level in mint below 20 (was 10 ×), 160 × (level − 15) from 20 on
--   (was 50 ×), so levelling up (and the bigger daily refill it brings) isn't nearly free.
-- - Gifts and spraying: until your account is 3 days old and level 5, you can give at most ₥500 a
--   day (so new second accounts can't pass their free mint straight on).
-- - Food: about ₦3,000 a real day in Lagos, paid with the bills by the game day (src/lib/world/
--   living.ts FOOD_MONTH). What can't be paid costs a little health instead.
-- - Rent follows value: when a unit's price changes (building onto your home, a sale on the
--   market), what it earns while let is worked out again by the rule used when it was bought:
--   homes 6% of their value a game year, business units 9%, land nothing.
-- - Shops pay for things from their worth, and the market only pulls worth between half and one and
--   a half times what a thing was worth when made (src/lib/world/items.ts itemWorth). As a backstop
--   here, a shop never pays more than twice that.
-- - Picking a pocket: caught 4 times in 10 (was about 1 in 3), and the fine is ₦40,000 (the game's
--   src/lib/world/street.ts), so on average it doesn't pay.
-- Crafting's materials and worth are worked out by the game (src/lib/world/items.ts); nothing to
-- change here.
--
-- Safe to run more than once. Run after parts 1-64.

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('gift_new_days',          3,   'Days an account must be before it can give more than gift_new_daily_max a day'),
  ('gift_new_level',         5,   'Level a player must reach before they can give more than gift_new_daily_max a day'),
  ('gift_new_daily_max',     500, 'Most mint a new or low-level player can give away (gifts and spraying) a day'),
  ('living_hungry_health',   1,   'Health lost for each game day of food that could not be paid for')
on conflict (key) do update set note = excluded.note;

update public.game_settings set value = greatest(value, 1500),
  note = 'Most a job on the real map can pay every 2 hours (mint, before skill bonus; a pilot gets 1,200)' where key = 'work_pay_max';
-- Levels cost four times as much below 20 (40 × L), and from 20 on 160 × (L − 15), so the price
-- still only goes up: ₥760 from 19 to 20, ₥800 from 20 to 21.
update public.game_settings set value = 40, note = 'Mint to go from level L to L+1 below level_easy_until = this × L' where key = 'level_cost_easy';
update public.game_settings set value = 160, note = 'Mint from level_easy_until up = this × (L − level_easy_until + 5)' where key = 'level_cost_hard';
update public.game_settings set value = 40,
  note = 'Chance (%) of being caught picking a pocket (more if they''re online, less if they''re asleep)' where key = 'steal_catch_pct';

-- ============================================================ jobs pay 18 times real wages
-- Jobs people already have get the raise (18 ÷ 4 = 4.5 times). Each job's old pay is at most what
-- its best-paid place paid at 4 times (below, mint a game day in Lagos); a job paid more than that
-- has had its raise already (jobs pay at most twice as much in one place as another, and the raise
-- is 4.5 times), so running this again, or after someone took a job at the new pay, changes nothing.
update public.life_jobs j set pay_day = round(j.pay_day * 4.5, 2)
from (values
  ('accountant', 31.11), ('admin_officer', 17.78), ('airport_cleaner', 7.11), ('analyst', 44.44), ('bartender', 8.89),
  ('cabin_crew', 53.33), ('campus_cleaner', 6.22), ('caretaker', 5.33), ('cashier', 10.67), ('check_in', 22.22),
  ('chef', 22.22), ('civil_servant', 16), ('cook', 10.67), ('crane_operator', 26.67), ('curator', 26.67),
  ('director', 62.22), ('dj', 26.67), ('dock_worker', 10.67), ('doctor', 80), ('farm_hand', 5.33),
  ('farm_manager', 17.78), ('fire_cleaner', 6.22), ('firefighter', 15.11), ('forklift', 13.33), ('fuel_cashier', 8),
  ('gardener', 5.33), ('groundskeeper', 8), ('guide', 8.89), ('hospital_porter', 7.11), ('hotel_manager', 80),
  ('hotel_receptionist', 13.33), ('housekeeper', 8), ('lab_assistant', 13.33), ('labourer', 6.22), ('lecturer', 40),
  ('loader', 7.11), ('manager', 106.67), ('market_trader', 17.78), ('messenger', 6.22), ('nurse', 26.67),
  ('office_assistant', 8.89), ('pilot', 266.67), ('police_clerk', 8), ('police_officer', 16), ('port_manager', 88.89),
  ('porter', 5.33), ('pump_attendant', 6.22), ('receptionist', 13.33), ('restaurant_manager', 26.67), ('sales_assistant', 8.89),
  ('school_cleaner', 6.22), ('shop_assistant', 7.11), ('shop_supervisor', 13.33), ('site_foreman', 22.22), ('station_manager', 22.22),
  ('steward', 6.22), ('store_manager', 35.56), ('teacher', 13.33), ('trader_assistant', 7.11), ('waiter', 6.22),
  ('warehouse_manager', 31.11), ('waste_collector', 7.11)
) as was (job, top)
where j.job = was.job and j.region = 'lagos' and j.pay_day <= was.top + 0.01;

-- ============================================================ the daily refill counts your pots
-- The daily refill: 100, then +25 per level (no more growth after level passive_level_cap), up to
-- the same target. What you have is your wallet and your budget pots together.
create or replace function public.accrue_passive(p_user uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_lv int;
  v_target numeric;
  v_day numeric;
  v_rate numeric;      -- coins per second
  v_amt numeric;
  v_recent numeric;
  v_have numeric;      -- wallet and pots
begin
  select * into p from public.profiles where id = p_user for update;
  v_lv := least(coalesce(p.level, 1), coalesce(public.setting('passive_level_cap'), 40)::int);
  v_day := public.setting('passive_per_day') + public.setting('passive_per_level') * greatest(v_lv - 1, 0);
  v_target := public.setting('passive_target') + public.setting('passive_per_level') * greatest(v_lv - 1, 0);
  if not found or p.is_bot or p.frozen or v_day <= 0 then return 0; end if;
  v_have := p.coins + coalesce((select sum(balance) from public.life_pots where user_id = p_user), 0);
  if v_have >= v_target or p.passive_at is null then
    update public.profiles set passive_at = now() where id = p_user;
    return 0;
  end if;
  v_rate := v_day / 86400.0;
  v_amt := floor(extract(epoch from (now() - p.passive_at)) * v_rate);
  select coalesce(sum(amount), 0) into v_recent from public.ledger
    where user_id = p_user and kind = 'passive' and created_at > now() - interval '24 hours';
  v_amt := least(v_amt, floor(v_target - v_have), floor(v_day - v_recent));
  if v_amt < 1 then
    if v_recent >= v_day then update public.profiles set passive_at = now() where id = p_user; end if;
    return 0;
  end if;
  update public.profiles set coins = coins + v_amt,
         passive_at = least(now(), passive_at + make_interval(secs => (v_amt / v_rate)::double precision))
    where id = p_user;
  perform public.log_coins(p_user, null, 'passive', v_amt);
  return v_amt;
end $$;

-- ============================================================ gifts from new accounts
/** How much this player may give away a day: the full amount, or less while their account is new or their level low. */
create or replace function public.gift_daily_limit(p public.profiles) returns numeric
language sql stable set search_path = public as $$
  select case
    when p.created_at > now() - make_interval(days => public.setting('gift_new_days')::int)
      or coalesce(p.level, 1) < public.setting('gift_new_level')
    then least(public.setting('gift_daily_max'), public.setting('gift_new_daily_max'))
    else public.setting('gift_daily_max') end
$$;

-- Checks shared by gifts and spraying: may this player give coins away (amount more today)? New
-- accounts (under gift_new_days days old) and low levels (under gift_new_level) can give only
-- gift_new_daily_max a day.
create or replace function public.gift_check(p public.profiles, p_amount numeric) returns void
language plpgsql set search_path = public as $$
declare
  v_today numeric;
  v_max numeric;
begin
  if p.id is null or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.seeker_rounds + p.hider_rounds < public.setting('gift_min_rounds') then raise exception 'new_player'; end if;
  select coalesce(sum(amount), 0) into v_today from public.coin_gifts
   where from_id = p.id and created_at >= date_trunc('day', now());
  v_max := public.gift_daily_limit(p);
  if v_today + p_amount > v_max then
    if v_max < public.setting('gift_daily_max') then
      raise exception 'new_giver_cap:%', greatest(v_max - v_today, 0);
    end if;
    raise exception 'daily_cap:%', greatest(v_max - v_today, 0);
  end if;
  if p.coins < p_amount then raise exception 'not_enough'; end if;
end $$;

-- Give coins to another player (1–10,000 whole coins). Returns { amount, to, balance, left_today }
-- (as part 19, with what's left today from the giver's own limit).
create or replace function public.give_coins(p_from uuid, p_to uuid, p_amount numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.profiles;
  t public.profiles;
  v_note text := nullif(btrim(left(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g'), 80)), '');
  v_pair numeric;
  v_round bigint;
  v_q bigint;
begin
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 1 or p_amount > public.setting('gift_max') then
    raise exception 'bad_amount';
  end if;
  if p_to is null or p_to = p_from then raise exception 'gift_self'; end if;
  perform public.lock_players(array[p_from, p_to]);
  select * into f from public.profiles where id = p_from;
  select * into t from public.profiles where id = p_to;
  if t.id is null or t.username is null then raise exception 'unknown_target'; end if;
  if t.is_bot then raise exception 'target_bot'; end if;
  if t.frozen then raise exception 'target_frozen'; end if;
  perform public.gift_check(f, p_amount);
  select coalesce(sum(amount), 0) into v_pair from public.coin_gifts
   where from_id = p_from and to_id = p_to and created_at >= date_trunc('day', now());
  if v_pair + p_amount > public.setting('gift_pair_daily_max') then
    raise exception 'pair_cap:%', greatest(public.setting('gift_pair_daily_max') - v_pair, 0);
  end if;

  select max(id) into v_round from public.rounds;
  update public.profiles set coins = coins - p_amount where id = p_from;
  update public.profiles set coins = coins + p_amount where id = p_to;
  perform public.log_coins(p_from, v_round, 'gift_sent', -p_amount, false, 'To ' || t.username || coalesce(': ' || v_note, ''));
  perform public.log_coins(p_to, v_round, 'gift_received', p_amount, false, 'From ' || f.username || coalesce(': ' || v_note, ''));
  insert into public.coin_gifts (from_id, to_id, kind, amount, note) values (p_from, p_to, 'gift', p_amount, v_note);
  perform public.notify(p_to, v_round, 'gift', format('%s gave you %s coins%s', f.username, p_amount,
    coalesce(': "' || v_note || '"', '!')));

  select id into v_q from public.quests where user_id = p_from and status = 'active' and expires_at > now();
  if found then perform public.quest_sync(v_q); end if;
  return jsonb_build_object('amount', p_amount, 'to', t.username,
    'balance', (select coins from public.profiles where id = p_from),
    'left_today', greatest(0, public.gift_daily_limit(f) - (select coalesce(sum(amount), 0) from public.coin_gifts
                                                       where from_id = p_from and created_at >= date_trunc('day', now()))));
end $$;

-- ============================================================ food, with the bills
-- life_tick gains p_food_day (food a game day, mint). The old version (without it) goes, so the
-- game never calls the wrong one.
drop function if exists public.life_tick(uuid, numeric, numeric, numeric, numeric, numeric, numeric, jsonb);

/**
 * Bring a life up to now (as part 41): health and mind, the home's bills, food, the gym, a
 * check-up when needed, where the time went, courses finished. Food is paid by the game day from
 * Essentials, then the wallet, home or not (everyone eats); what can't be paid costs
 * living_hungry_health health a game day instead.
 */
create or replace function public.life_tick(
  p_user uuid, p_power_day numeric, p_waste_day numeric, p_care_fee numeric,
  p_body_day numeric, p_mind_day numeric, p_gym_day numeric, p_hours jsonb, p_food_day numeric default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_bdays numeric;
  v_health numeric;
  v_mind numeric;
  v_power numeric;
  v_waste numeric;
  v_paid numeric;
  v_gym numeric;
  v_food numeric;
  v_fee numeric := round(least(greatest(coalesce(p_care_fee, 0), 0), public.setting('living_fee_max')), 2);
  k text;
  c record;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return null; end if;
  perform 1 from public.profiles where id = p_user for update;

  v_days := least(public.setting('living_bill_hold_days'), greatest(0, extract(epoch from (now() - l.health_at)) / 3600.0 / v_hours));
  v_health := least(100, greatest(0, l.health + least(5, greatest(-5, coalesce(p_body_day, -1.5))) * v_days));
  v_mind := least(100, greatest(0, l.mind + least(5, greatest(-5, coalesce(p_mind_day, 0))) * v_days));

  if l.home_unit is not null then
    v_bdays := least(public.setting('living_bill_hold_days'), greatest(0, extract(epoch from (now() - l.bills_at)) / 3600.0 / v_hours));
    v_power := l.power_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_power_day, 0))) * v_bdays, 2);
    v_waste := l.waste_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_waste_day, 0))) * v_bdays, 2);
    v_paid := public.life_spend(p_user, array['essentials'], v_power);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'power_bill', -v_paid, false, 'Electricity');
      perform public.burn(null, v_paid, 'Electricity bills');
    end if;
    v_power := v_power - v_paid;
    v_paid := public.life_spend(p_user, array['essentials'], v_waste);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'waste_bill', -v_paid, false, 'Waste collection');
      perform public.pay_tax(l.region, v_paid, 'waste_bill', 'Waste collection');
    end if;
    v_waste := v_waste - v_paid;
    update public.lives set bills_at = now(), power_owed = v_power, waste_owed = v_waste, power_day = round(greatest(0, coalesce(p_power_day, 0)), 2)
      where user_id = p_user;
  end if;

  -- Food, by the game day, home or not. Hungry days (unpaid) cost a little health.
  v_food := round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_food_day, 0))) * v_days, 2);
  if v_food > 0 then
    v_paid := public.life_spend(p_user, array['essentials'], v_food);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'food', -v_paid, false, 'Food');
      perform public.burn(null, v_paid, 'Food');
    end if;
    if v_paid < v_food then
      v_health := greatest(0, v_health - coalesce(public.setting('living_hungry_health'), 1) * v_days * (1 - v_paid / v_food));
    end if;
  end if;

  -- The gym, by the game day; can't pay, no gym.
  v_gym := round(least(public.setting('life_gym_max_day'), greatest(0, coalesce(p_gym_day, 0))) * v_days, 2);
  if v_gym > 0 then
    v_paid := public.life_spend(p_user, array['essentials'], v_gym);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'gym', -v_paid, false, 'Gym membership');
      perform public.burn(null, v_paid, 'Gym memberships');
    end if;
    if v_paid < v_gym then update public.lives set exercise = 'walk' where user_id = p_user; end if;
  end if;

  -- A check-up by itself when the body is low and you can pay for it.
  if v_health < public.setting('living_auto_care_below') and v_fee > 0
     and public.life_can_spend(p_user, array['essentials']) >= v_fee then
    perform public.life_spend(p_user, array['essentials'], v_fee);
    perform public.log_coins(p_user, null, 'health_care', -v_fee, false, 'Check-up at a public clinic (by itself)');
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public clinic fees');
    v_health := least(100, v_health + public.setting('living_auto_care_gain'));
  end if;
  update public.lives set health = round(v_health, 2), mind = round(v_mind, 2), health_at = now() where user_id = p_user;

  -- Where the time went.
  if v_days > 0.01 and p_hours is not null and jsonb_typeof(p_hours) = 'object' then
    for k in select jsonb_object_keys(p_hours) loop
      if k ~ '^[a-z_]{2,20}$' and coalesce((p_hours ->> k)::numeric, 0) > 0 then
        insert into public.life_hours (user_id, kind, hours) values (p_user, k, round(least(24, (p_hours ->> k)::numeric) * v_days, 2));
      end if;
    end loop;
  end if;

  for c in select * from public.life_courses where user_id = p_user and done_at is null and ends_at <= now() for update loop
    update public.life_courses set done_at = now() where user_id = p_user and course = c.course;
    insert into public.life_skills (user_id, skill, days) values (p_user, c.skill, c.grants)
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end loop;
  update public.life_events set status = 'expired' where user_id = p_user and status = 'open' and expires_at <= now();

  return public.life_status(p_user);
end $$;

/** Your money by day (as part 50, with food among the living costs). */
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
      and r.kind in ('income_tax', 'rent_tax', 'vat', 'sale_tax', 'power_bill', 'waste_bill', 'food', 'commute', 'health_care', 'gym', 'school_fees',
                     'procedure', 'loan_repay', 'market_fee', 'item_tax', 'car_running', 'fine')), 0), 2),
    'bought', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('property_buy', 'property_tax', 'hustle_start', 'item_buy', 'car_buy', 'craft_cost')), 0), 2)
  ) order by d.day), '[]'::jsonb)
  from days d
$$;

/** Money in and out by kind (as part 50, with food). */
create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'food', 'commute',
                   'health_care', 'gym', 'school_fees', 'procedure', 'hustle_start', 'property_buy', 'start_grant',
                   'property_sale', 'sale_tax', 'loan', 'loan_repay',
                   'item_buy', 'item_sale', 'car_buy', 'car_sale', 'craft_cost', 'market_fee', 'item_tax', 'fine')
    group by kind
    union all
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ============================================================ rent follows value
/**
 * What a unit earns a day while let (mint), from its value: homes 6% a game year, business units
 * 9%, land nothing (a game year is a real month, so a real day is a thirtieth). The same rule as
 * src/lib/world/property-api.ts rentPerDay, used when a unit is bought.
 */
create or replace function public.unit_rent_day(p_price numeric, p_use text) returns numeric
language sql immutable set search_path = public as $$
  select round(greatest(coalesce(p_price, 0), 0) * case p_use when 'home' then 0.06 when 'land' then 0 else 0.09 end / 30, 2)
$$;

-- Whenever a unit's price changes (and its rent wasn't set at the same time), its rent follows.
create or replace function public.property_rent_follows_price() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.price is distinct from old.price and new.rent_day is not distinct from old.rent_day then
    new.rent_day := public.unit_rent_day(new.price, new.use);
  end if;
  return new;
end $$;
drop trigger if exists property_units_rent_follows_price on public.property_units;
create trigger property_units_rent_follows_price before update of price on public.property_units
  for each row execute function public.property_rent_follows_price();

/**
 * Save a home plan, paying for what's new (as part 64). p_cost: what it costs (mint), p_value: what
 * it adds to the home's value, p_paid: everything paid for so far (after this). The home's rent (if
 * it's ever let) follows its new value. Returns your wallet.
 */
create or replace function public.home_plan_save(p_user uuid, p_unit text, p_plan jsonb, p_paid jsonb, p_cost numeric, p_value numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(greatest(0, coalesce(p_cost, 0)), 2);
  v_value numeric := round(greatest(0, coalesce(p_value, 0)), 2);
  v_unit public.property_units;
  v_price numeric;
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
    v_price := least(public.setting('property_price_max'), v_unit.price + v_value);
    update public.property_units
      set price = v_price, rent_day = public.unit_rent_day(v_price, v_unit.use)
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

-- Homes already built onto before this part: their rent catches up with their value, once.
update public.property_units u set rent_day = public.unit_rent_day(u.price, u.use)
where u.unit_id in (select unit from public.home_plans)
  and u.rent_day is distinct from public.unit_rent_day(u.price, u.use);

-- ============================================================ selling to the city
/**
 * Sell straight to the city's shops (p_amount: what the game offers, a share of its worth). As part
 * 50, and a backstop: a shop never pays more than twice what the thing was worth when it was made.
 */
create or replace function public.item_sell_city(p_user uuid, p_item bigint, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare i public.items;
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
  if coalesce(p_amount, 0) < 0 or p_amount > public.setting('item_price_max') or p_amount > i.base_value * 2 then raise exception 'bad_price'; end if;
  delete from public.items where id = p_item;
  if p_amount > 0 then
    perform public.log_coins(p_user, null, case when i.category = 'car' then 'car_sale' else 'item_sale' end, round(p_amount, 2), false, 'Sold to a shop: ' || left(i.name, 40));
    perform public.life_income(p_user, round(p_amount, 2));
  end if;
  return round(p_amount, 2);
end $$;

-- ============================================================ who may call these
do $$
declare f text;
begin
  foreach f in array array[
    'public.accrue_passive(uuid)', 'public.gift_daily_limit(public.profiles)', 'public.gift_check(public.profiles, numeric)',
    'public.give_coins(uuid, uuid, numeric, text)',
    'public.life_tick(uuid, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, numeric)',
    'public.life_money_days(uuid, int)', 'public.life_money(uuid, int)',
    'public.home_plan_save(uuid, text, jsonb, jsonb, numeric, numeric)', 'public.item_sell_city(uuid, bigint, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
