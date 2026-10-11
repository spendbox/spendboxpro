-- Newtown, part 40: living on the real map. Money pots and a budget, bills, health, school and
-- treats; essential public services paid from taxes. See docs/LIVING.md and
-- src/lib/world/living.ts (the game works out every price and passes it in).
--
-- Pots. Every income (pay, rent) is shared out by your budget: so much into Essentials, Travel,
-- Savings and Treats, the rest into your wallet (your mint). Bills and check-ups come out of
-- Essentials, fares out of Travel, school fees out of Savings, treats out of Treats; whatever a
-- pot can't cover comes from your wallet. Pots are yours: move money between them any time.
--
-- Bills. Your home's electricity (to the power company, burned) and waste collection (to the
-- state) build up by the game day, up to 30 game days at a time, and are paid by themselves; what
-- can't be paid is owed, and owing more than a week of electricity cuts the power until it's paid.
--
-- Health falls a little every game day. Below living_auto_care_below a public clinic check-up
-- happens by itself (when you can pay). Unwell: half pay; bedridden: no work. Private care and
-- treats carry VAT (to the treasuries). A treat with recovery (a BBL) means game days off work.
--
-- School. One course at a time, paid up front (public: the fee goes to the state; private: it
-- leaves the game). It finishes by itself after its game days, counting as experience in its skill
-- and giving its certificate.
--
-- Essential services (public hospitals, schools, universities, government) are paid by the state
-- treasury, then the country's, from taxes; when the treasuries can't pay, it's owed until they
-- can. The Lagos treasury opens with living_treasury_opening (once).
--
-- Rent is now logged in full with its tax shown apart (the books balance with the treasuries).
--
-- Safe to run more than once. Run after parts 1-39.

insert into public.game_settings (key, value, note) values
  ('living_health_decay',     1.5,   'Health lost each game day'),
  ('living_sick_below',       30,    'Below this health: half pay'),
  ('living_bedridden_below',  10,    'Below this health: no work'),
  ('living_auto_care_below',  50,    'Below this health a public clinic check-up happens by itself'),
  ('living_auto_care_gain',   25,    'Health a public clinic check-up gives'),
  ('living_bill_max_day',     50,    'Dearest bill a game day (mint, a sanity check)'),
  ('living_bill_hold_days',   30,    'Most game days of bills charged at once'),
  ('living_cutoff_days',      7,     'Game days of unpaid electricity before the power is cut'),
  ('living_fee_max',          50000, 'Dearest fee for care, a treat or a course (mint, a sanity check)'),
  ('living_treasury_opening', 500000, 'What the Lagos State treasury opens with (once)')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
alter table public.lives add column if not exists health numeric(6,2) not null default 80;
alter table public.lives add column if not exists health_at timestamptz not null default now();
alter table public.lives add column if not exists bills_at timestamptz not null default now();
alter table public.lives add column if not exists power_owed numeric(14,2) not null default 0;
alter table public.lives add column if not exists waste_owed numeric(14,2) not null default 0;
alter table public.lives add column if not exists power_day numeric(10,2) not null default 0;
alter table public.lives add column if not exists budget jsonb not null default '{"essentials":25,"travel":15,"savings":20,"fun":10}';
alter table public.lives add column if not exists recovering_until timestamptz;

alter table public.life_jobs add column if not exists state boolean not null default false;
alter table public.life_jobs add column if not exists owed numeric(14,2) not null default 0;

create table if not exists public.life_pots (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pot text not null check (pot in ('essentials', 'travel', 'savings', 'fun')),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  primary key (user_id, pot)
);

create table if not exists public.life_courses (
  user_id uuid not null references public.profiles (id) on delete cascade,
  course text not null check (course ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 80),
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  grants numeric(10,2) not null default 0,
  cert text check (cert is null or cert ~ '^[a-z_]{2,30}$'),
  fee numeric(14,2) not null default 0,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  done_at timestamptz,
  primary key (user_id, course)
);

create table if not exists public.life_procedures (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  procedure text not null check (procedure ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 60),
  paid numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists life_procedures_user_idx on public.life_procedures (user_id, created_at desc);

-- ============================================================ the treasury opens
do $$
declare v numeric := public.setting('living_treasury_opening');
begin
  if not exists (select 1 from public.treasury_ledger where treasury = 'ng-la' and kind = 'opening') then
    update public.treasuries set balance = balance + v where id = 'ng-la';
    insert into public.treasury_ledger (treasury, amount, kind, note) values ('ng-la', v, 'opening', 'Opening balance');
    insert into public.ledger (user_id, round_id, kind, amount, bonus, note) values (null, null, 'treasury_opening', v, false, 'Lagos State treasury opens');
  end if;
end $$;

-- ============================================================ money in and out
/** Pay from your pots in order, then your wallet. Returns what was paid (all of it, or what there was). */
create or replace function public.life_spend(p_user uuid, p_pots text[], p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_left numeric := round(coalesce(p_amount, 0), 2);
  v_take numeric;
  v_bal numeric;
  pt text;
begin
  if v_left <= 0 then return 0; end if;
  foreach pt in array coalesce(p_pots, '{}') loop
    select balance into v_bal from public.life_pots where user_id = p_user and pot = pt for update;
    v_take := least(coalesce(v_bal, 0), v_left);
    if v_take > 0 then
      update public.life_pots set balance = balance - v_take where user_id = p_user and pot = pt;
      v_left := v_left - v_take;
    end if;
    exit when v_left <= 0;
  end loop;
  if v_left > 0 then
    select coins into v_bal from public.profiles where id = p_user for update;
    v_take := least(greatest(coalesce(v_bal, 0), 0), v_left);
    if v_take > 0 then
      update public.profiles set coins = coins - v_take where id = p_user;
      v_left := v_left - v_take;
    end if;
  end if;
  return round(coalesce(p_amount, 0), 2) - v_left;
end $$;

/** What your pots (these ones) and wallet hold together. */
create or replace function public.life_can_spend(p_user uuid, p_pots text[]) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(balance) from public.life_pots where user_id = p_user and pot = any (p_pots)), 0)
       + greatest(coalesce((select coins from public.profiles where id = p_user), 0), 0)
$$;

/** Share an income out by your budget: so much into each pot, the rest into your wallet. */
create or replace function public.life_income(p_user uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_budget jsonb;
  v_left numeric := round(coalesce(p_amount, 0), 2);
  v_part numeric;
  pt text;
begin
  if v_left <= 0 then return; end if;
  select budget into v_budget from public.lives where user_id = p_user;
  foreach pt in array array['essentials', 'travel', 'savings', 'fun'] loop
    v_part := round(p_amount * least(100, greatest(0, coalesce((v_budget ->> pt)::numeric, 0))) / 100, 2);
    v_part := least(v_part, v_left);
    if v_part > 0 then
      insert into public.life_pots (user_id, pot, balance) values (p_user, pt, v_part)
        on conflict (user_id, pot) do update set balance = life_pots.balance + excluded.balance;
      v_left := v_left - v_part;
    end if;
  end loop;
  if v_left > 0 then update public.profiles set coins = coins + v_left where id = p_user; end if;
end $$;

-- ============================================================ the passing of time
/**
 * Bring your life up to now: health falls with the game days; bills for your home (p_power_day,
 * p_waste_day: mint a game day, worked out by the game from your home) are paid from Essentials,
 * then your wallet, or owed; a check-up happens by itself when health is low (p_care_fee, mint);
 * finished courses count. Returns your status.
 */
create or replace function public.life_tick(p_user uuid, p_power_day numeric, p_waste_day numeric, p_care_fee numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_hours numeric := public.setting('work_day_hours');
  v_health numeric;
  v_days numeric;
  v_power numeric;
  v_waste numeric;
  v_paid numeric;
  v_fee numeric := round(least(greatest(coalesce(p_care_fee, 0), 0), public.setting('living_fee_max')), 2);
  c record;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return null; end if;
  perform 1 from public.profiles where id = p_user for update;

  v_health := greatest(0, l.health - public.setting('living_health_decay') * extract(epoch from (now() - l.health_at)) / 3600.0 / v_hours);

  if l.home_unit is not null then
    v_days := least(public.setting('living_bill_hold_days'), greatest(0, extract(epoch from (now() - l.bills_at)) / 3600.0 / v_hours));
    v_power := l.power_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_power_day, 0))) * v_days, 2);
    v_waste := l.waste_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_waste_day, 0))) * v_days, 2);
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

  -- A check-up by itself when health is low and you can pay for it.
  if v_health < public.setting('living_auto_care_below') and v_fee > 0
     and public.life_can_spend(p_user, array['essentials']) >= v_fee then
    perform public.life_spend(p_user, array['essentials'], v_fee);
    perform public.log_coins(p_user, null, 'health_care', -v_fee, false, 'Check-up at a public clinic (by itself)');
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public clinic fees');
    v_health := least(100, v_health + public.setting('living_auto_care_gain'));
  end if;
  update public.lives set health = round(v_health, 2), health_at = now() where user_id = p_user;

  -- Courses that have finished count as experience.
  for c in select * from public.life_courses where user_id = p_user and done_at is null and ends_at <= now() for update loop
    update public.life_courses set done_at = now() where user_id = p_user and course = c.course;
    insert into public.life_skills (user_id, skill, days) values (p_user, c.skill, c.grants)
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end loop;

  return public.life_status(p_user);
end $$;

-- ============================================================ pay (redone for pots, health and the state)
/**
 * Collect your pay up to now (at most work_hold_days game days): pay with the skill bonus, for the
 * days you could work (none while recovering; half while unwell), less income tax; essential
 * services are paid by the treasuries (what they can't pay is owed). Shared into your pots by your
 * budget, then fares (two trips a day worked, p_fare_trip each) come out of Travel.
 */
create or replace function public.life_work_collect(p_user uuid, p_fare_trip numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  j public.life_jobs;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_rec numeric := 0;
  v_work numeric;
  v_factor numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
  v_due numeric;
  v_paid numeric := 0;
  v_take numeric;
  v_state text;
  v_country text;
  v_income numeric;
  v_fares numeric;
  v_start timestamptz;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  select * into j from public.life_jobs where user_id = p_user for update;
  if not found then
    return jsonb_build_object('days', 0, 'gross', 0, 'tax', 0, 'fares', 0, 'net', 0, 'owed', 0, 'coins', p.coins);
  end if;
  select * into l from public.lives where user_id = p_user;
  v_days := least(public.setting('work_hold_days'), greatest(0, extract(epoch from (now() - j.paid_until)) / 3600.0 / v_hours));
  v_start := now() - make_interval(secs => v_days * v_hours * 3600);
  if l.recovering_until is not null and l.recovering_until > v_start then
    v_rec := least(v_days, extract(epoch from (least(now(), l.recovering_until) - v_start)) / 3600.0 / v_hours);
  end if;
  v_factor := case when coalesce(l.health, 100) < public.setting('living_bedridden_below') then 0
                   when coalesce(l.health, 100) < public.setting('living_sick_below') then 0.5 else 1 end;
  v_work := greatest(0, v_days - v_rec) * case when v_factor = 0 then 0 else 1 end;
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = j.skill;
  v_gross := round(j.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus')) * v_work * v_factor, 2);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);

  if j.state then
    -- Paid by the state (then the country) from taxes; income tax is kept back at source.
    v_due := v_gross - v_tax + j.owed;
    v_state := public.region_treasury(j.region);
    select coalesce(parent, id) into v_country from public.treasuries where id = v_state;
    foreach v_state in array array[v_state, v_country] loop
      exit when v_paid >= v_due;
      select least(balance, v_due - v_paid) into v_take from public.treasuries where id = v_state for update;
      if coalesce(v_take, 0) > 0 then
        update public.treasuries set balance = balance - v_take where id = v_state;
        insert into public.treasury_ledger (treasury, amount, kind, note) values (v_state, -v_take, 'salaries', 'Pay: ' || j.title);
        v_paid := v_paid + v_take;
      end if;
    end loop;
    v_income := v_paid;
    update public.life_jobs set owed = round(v_due - v_paid, 2) where user_id = p_user;
    if v_paid + v_tax > 0 then
      perform public.log_coins(p_user, null, 'public_pay', v_paid + v_tax, false, 'Pay (from the state): ' || j.title);
      if v_tax > 0 then perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax (kept back by the state)'); end if;
    end if;
  else
    v_income := v_gross - v_tax;
    if v_gross > 0 then
      perform public.log_coins(p_user, null, 'work_pay', v_gross, false, 'Pay: ' || j.title || ', ' || left(j.place_name, 60));
      if v_tax > 0 then
        perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
        perform public.pay_tax(j.region, v_tax, 'income_tax', 'Income tax on pay');
      end if;
    end if;
  end if;
  perform public.life_income(p_user, v_income);

  v_fares := round(2 * least(public.setting('work_fare_max'), greatest(0, coalesce(p_fare_trip, 0))) * v_work, 2);
  v_fares := public.life_spend(p_user, array['travel'], v_fares);
  if v_fares > 0 then
    perform public.log_coins(p_user, null, 'commute', -v_fares, false, 'Fares to work and back');
    perform public.burn(null, v_fares, 'Fares to work');
  end if;

  update public.life_jobs set paid_until = now() where user_id = p_user;
  if v_work > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, j.skill, round(v_work, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'worked', round(v_work, 3), 'gross', v_gross, 'tax', v_tax, 'fares', v_fares,
    'net', round(v_income - v_fares, 2), 'owed', (select owed from public.life_jobs where user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Mark a job as an essential public service (paid from taxes): the game says which jobs are. */
create or replace function public.life_work_set_state(p_user uuid, p_state boolean) returns void
language sql security definer set search_path = public as $$
  update public.life_jobs set state = coalesce(p_state, false) where user_id = p_user
$$;

-- ============================================================ rent (redone for pots, tax shown apart)
create or replace function public.property_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u record;
  v_gross numeric := 0;
  v_tax numeric := 0;
  v_rent numeric;
  v_unit_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  for u in select * from public.property_units where owner_id = p_user and let and rent_day > 0 for update loop
    v_rent := round(u.rent_day * extract(epoch from (now() - u.collected_at)) / 86400, 2);
    if v_rent <= 0 then continue; end if;
    v_unit_tax := round(v_rent * public.setting('property_rent_tax'), 2);
    perform public.pay_tax(split_part(u.unit_id, ':', 1), v_unit_tax, 'rent_tax', 'Rent tax on ' || u.unit_id);
    update public.property_units set collected_at = now() where unit_id = u.unit_id;
    v_gross := v_gross + v_rent;
    v_tax := v_tax + v_unit_tax;
  end loop;
  if v_gross > 0 then
    perform public.log_coins(p_user, null, 'rent', v_gross, false, 'Rent');
    if v_tax > 0 then perform public.log_coins(p_user, null, 'rent_tax', -v_tax, false, 'Tax on rent'); end if;
    perform public.life_income(p_user, v_gross - v_tax);
  end if;
  return jsonb_build_object('rent', v_gross - v_tax, 'tax', v_tax, 'coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ your budget and pots
/** Set your budget: percent of each income for each pot (whole numbers, together no more than 100). */
create or replace function public.life_budget_set(p_user uuid, p_budget jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v jsonb := '{}';
  v_sum int := 0;
  v_n int;
  pt text;
begin
  foreach pt in array array['essentials', 'travel', 'savings', 'fun'] loop
    v_n := coalesce((p_budget ->> pt)::int, 0);
    if v_n < 0 or v_n > 100 then raise exception 'bad_budget'; end if;
    v_sum := v_sum + v_n;
    v := v || jsonb_build_object(pt, v_n);
  end loop;
  if v_sum > 100 then raise exception 'bad_budget'; end if;
  update public.lives set budget = v where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
end $$;

/** Move money between your pots and your wallet ('wallet'). */
create or replace function public.life_pot_move(p_user uuid, p_from text, p_to text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  v numeric := round(coalesce(p_amount, 0), 2);
  v_have numeric;
begin
  if p_from = p_to or v <= 0 or p_from not in ('wallet', 'essentials', 'travel', 'savings', 'fun')
     or p_to not in ('wallet', 'essentials', 'travel', 'savings', 'fun') then raise exception 'bad_move'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if p_from = 'wallet' then
    select coins into v_have from public.profiles where id = p_user for update;
    if coalesce(v_have, 0) < v then raise exception 'not_enough:%', trim_scale(v); end if;
    update public.profiles set coins = coins - v where id = p_user;
  else
    select balance into v_have from public.life_pots where user_id = p_user and pot = p_from for update;
    if coalesce(v_have, 0) < v then raise exception 'not_enough:%', trim_scale(v); end if;
    update public.life_pots set balance = balance - v where user_id = p_user and pot = p_from;
  end if;
  if p_to = 'wallet' then
    update public.profiles set coins = coins + v where id = p_user;
  else
    insert into public.life_pots (user_id, pot, balance) values (p_user, p_to, v)
      on conflict (user_id, pot) do update set balance = life_pots.balance + excluded.balance;
  end if;
end $$;

-- ============================================================ care, treats, school
/** Health care (the game says what it is, its fee and VAT in mint, and the health it gives; 100 = full). */
create or replace function public.life_care(p_user uuid, p_care text, p_title text, p_fee numeric, p_vat numeric, p_gain numeric, p_public boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_fee numeric := round(coalesce(p_fee, 0), 2);
  v_vat numeric := round(greatest(coalesce(p_vat, 0), 0), 2);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if p_care !~ '^[a-z_]{2,30}$' or v_fee <= 0 or v_fee > public.setting('living_fee_max') then raise exception 'bad_item'; end if;
  if public.life_can_spend(p_user, array['essentials']) < v_fee + v_vat then raise exception 'not_enough:%', trim_scale(v_fee + v_vat); end if;
  perform public.life_spend(p_user, array['essentials'], v_fee + v_vat);
  perform public.log_coins(p_user, null, 'health_care', -v_fee, false, left(p_title, 60));
  if p_public then
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public clinic fees');
  else
    perform public.burn(null, v_fee, 'Private health care');
  end if;
  if v_vat > 0 then
    perform public.log_coins(p_user, null, 'vat', -v_vat, false, 'VAT');
    perform public.pay_tax(l.region, v_vat, 'vat', 'VAT on ' || left(p_title, 40));
  end if;
  update public.lives set health = least(100, case when p_gain >= 100 then 100 else health + greatest(0, p_gain) end), health_at = now() where user_id = p_user;
  return jsonb_build_object('health', (select health from public.lives where user_id = p_user), 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** A cosmetic procedure (the game says its fee and VAT in mint, and the game days of recovery). */
create or replace function public.life_procedure(p_user uuid, p_procedure text, p_title text, p_fee numeric, p_vat numeric, p_recovery numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_fee numeric := round(coalesce(p_fee, 0), 2);
  v_vat numeric := round(greatest(coalesce(p_vat, 0), 0), 2);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_procedure !~ '^[a-z_]{2,30}$' or v_fee <= 0 or v_fee > public.setting('living_fee_max') or coalesce(p_recovery, 0) < 0 then raise exception 'bad_item'; end if;
  if l.recovering_until > now() then raise exception 'recovering'; end if;
  if public.life_can_spend(p_user, array['fun', 'savings']) < v_fee + v_vat then raise exception 'not_enough:%', trim_scale(v_fee + v_vat); end if;
  perform public.life_spend(p_user, array['fun', 'savings'], v_fee + v_vat);
  perform public.log_coins(p_user, null, 'procedure', -v_fee, false, left(p_title, 60));
  perform public.burn(null, v_fee, 'Cosmetic procedures');
  if v_vat > 0 then
    perform public.log_coins(p_user, null, 'vat', -v_vat, false, 'VAT');
    perform public.pay_tax(l.region, v_vat, 'vat', 'VAT on ' || left(p_title, 40));
  end if;
  insert into public.life_procedures (user_id, procedure, title, paid) values (p_user, p_procedure, left(p_title, 60), v_fee + v_vat);
  if coalesce(p_recovery, 0) > 0 then
    update public.lives set recovering_until = now() + make_interval(secs => p_recovery * public.setting('work_day_hours') * 3600) where user_id = p_user;
  end if;
  return jsonb_build_object('coins', (select coins from public.profiles where id = p_user),
    'recovering_until', (select recovering_until from public.lives where user_id = p_user));
end $$;

/** Start a course (the game says its fee in mint, how many game days, the skill and certificate). */
create or replace function public.life_enrol(
  p_user uuid, p_course text, p_title text, p_skill text, p_grants numeric, p_cert text, p_fee numeric, p_days numeric, p_public boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_fee numeric := round(coalesce(p_fee, 0), 2);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if p_course !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' or (p_cert is not null and p_cert !~ '^[a-z_]{2,30}$')
     or v_fee <= 0 or v_fee > public.setting('living_fee_max') or coalesce(p_days, 0) <= 0 or coalesce(p_grants, 0) < 0 then raise exception 'bad_item'; end if;
  if exists (select 1 from public.life_courses where user_id = p_user and done_at is null) then raise exception 'studying'; end if;
  if exists (select 1 from public.life_courses where user_id = p_user and course = p_course) then raise exception 'done_already'; end if;
  if public.life_can_spend(p_user, array['savings']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
  perform public.life_spend(p_user, array['savings'], v_fee);
  perform public.log_coins(p_user, null, 'school_fees', -v_fee, false, left(p_title, 60));
  if p_public then
    perform public.pay_tax(l.region, v_fee, 'school_fees', 'Public school fees');
  else
    perform public.burn(null, v_fee, 'Private school fees');
  end if;
  insert into public.life_courses (user_id, course, title, skill, grants, cert, fee, ends_at)
    values (p_user, p_course, left(p_title, 80), p_skill, p_grants, p_cert, v_fee, now() + make_interval(secs => p_days * public.setting('work_day_hours') * 3600));
  return jsonb_build_object('coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ reading
/** Your life now: health, bills owed, the power, your budget and pots, school, treats, pay owed. */
create or replace function public.life_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'health', l.health,
    'powerOwed', l.power_owed,
    'wasteOwed', l.waste_owed,
    'powerCut', l.power_day > 0 and l.power_owed > l.power_day * public.setting('living_cutoff_days'),
    'budget', l.budget,
    'recoveringUntil', l.recovering_until,
    'wallet', (select coins from public.profiles where id = p_user),
    'pots', coalesce((select jsonb_object_agg(pot, balance) from public.life_pots where user_id = p_user), '{}'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('course', course, 'title', title, 'cert', cert, 'startedAt', started_at, 'endsAt', ends_at, 'done', done_at is not null) order by started_at)
                         from public.life_courses where user_id = p_user), '[]'::jsonb),
    'procedures', coalesce((select jsonb_agg(jsonb_build_object('procedure', procedure, 'title', title, 'at', created_at) order by created_at desc)
                            from public.life_procedures where user_id = p_user), '[]'::jsonb),
    'payOwed', coalesce((select owed from public.life_jobs where user_id = p_user), 0)
  )
  from public.lives l where l.user_id = p_user
$$;

/** Money in and out over the last p_hours real hours, by kind (the tax on property you bought shown apart). */
create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'commute',
                   'health_care', 'school_fees', 'procedure', 'property_buy', 'start_grant')
    group by kind
    union all
    -- property_buy is logged with its tax: take the tax out and show it apart.
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ============================================================ the books
-- Pay from the state ('public_pay') comes out of the treasuries, so it isn't new mint; the Lagos
-- treasury's opening balance is.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.life_pots, public.life_courses, public.life_procedures from public, anon, authenticated;
  grant all on table public.life_pots, public.life_courses, public.life_procedures to service_role;
  revoke all on sequence public.life_procedures_id_seq from public, anon, authenticated;
  grant all on sequence public.life_procedures_id_seq to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.life_spend(uuid, text[], numeric)', 'public.life_can_spend(uuid, text[])', 'public.life_income(uuid, numeric)',
    'public.life_tick(uuid, numeric, numeric, numeric)', 'public.life_work_collect(uuid, numeric)', 'public.life_work_set_state(uuid, boolean)',
    'public.property_collect(uuid)', 'public.life_budget_set(uuid, jsonb)', 'public.life_pot_move(uuid, text, text, numeric)',
    'public.life_care(uuid, text, text, numeric, numeric, numeric, boolean)', 'public.life_procedure(uuid, text, text, numeric, numeric, numeric)',
    'public.life_enrol(uuid, text, text, text, numeric, text, numeric, numeric, boolean)', 'public.life_status(uuid)', 'public.life_money(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
