-- Newtown, part 41: your day. A side hustle beside your main job; Body and Mind; exercise; where your
-- time and money went; interview cooldowns; breakthrough moments. See docs/DAY.md and
-- src/lib/world/day.ts, hustles.ts, interviews.ts, breakthroughs.ts (the game works out the numbers
-- and checks a day fits in 24 hours before it calls these).
--
-- Side hustle. One at a time, a few hours a game day, with a start-up cost (gone once spent). It
-- earns by the game day (up to work_hold_days at a time) with a daily swing, less income tax, shared
-- into your pots. A breakthrough can boost it for a while; a bad call can stall it for a few days.
--
-- Body and Mind. Each game day the game says how your days move them (exercise helps your body;
-- free time helps your mind; long days and owing bills wear you down) and life_tick applies it.
-- Mind below 10 is burnout: no work, like being bedridden. A gym membership is paid by the game day
-- from Essentials. Care can be for the body or the mind (counselling, a therapist, a weekend away).
--
-- Interviews. A failed interview means waiting a game week (14 hours) before trying that job there
-- again. (The questions and marking live in the game: src/lib/world/interviews.ts.)
--
-- Breakthroughs. At most one open at a time, with a cool-down after each; it expires if not answered.
-- Won: a bonus (new mint, shared into pots) and experience for a job; a boost for a side hustle.
-- Lost: nothing, or a stalled side hustle.
--
-- Safe to run more than once. Run after parts 1-40.

insert into public.game_settings (key, value, note) values
  ('hustle_pay_max',       100,  'Most a side hustle can earn a game day (mint, before swing and boost)'),
  ('hustle_start_max',     5000, 'Dearest side hustle to start (mint, a sanity check)'),
  ('life_gym_max_day',     5,    'Dearest gym membership a game day (mint)'),
  ('interview_wait_hours', 14,   'Real hours before trying a failed interview again'),
  ('event_cooldown_hours', 4,    'Real hours after a breakthrough before another can come'),
  ('event_bonus_max',      2000, 'Biggest breakthrough bonus (mint)')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
alter table public.lives add column if not exists mind numeric(6,2) not null default 70;
alter table public.lives add column if not exists exercise text not null default 'none';
alter table public.lives add column if not exists event_at timestamptz;

create table if not exists public.life_hustles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  hustle text not null check (hustle ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 60),
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  pay_day numeric(12,2) not null check (pay_day > 0),
  swing numeric(4,2) not null default 0.3 check (swing between 0 and 1),
  hours numeric(4,2) not null check (hours > 0 and hours <= 8),
  started_at timestamptz not null default now(),
  paid_until timestamptz not null default now(),
  boost numeric(4,2) not null default 1,
  boost_until timestamptz,
  stalled_until timestamptz
);

-- Time spent, a row per kind each time life moves on (hours, for "where your time went").
create table if not exists public.life_hours (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,20}$'),
  hours numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists life_hours_user_idx on public.life_hours (user_id, created_at desc);

create table if not exists public.life_interview_fails (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (char_length(place) <= 40),
  job text not null check (job ~ '^[a-z_]{2,30}$'),
  failed_at timestamptz not null default now(),
  primary key (user_id, place, job)
);

create table if not exists public.life_events (
  id text primary key check (id ~ '^[a-z0-9_-]{8,64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('job', 'hustle')),
  key text not null check (char_length(key) <= 40),
  title text not null check (char_length(title) <= 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'expired')),
  reward jsonb
);
create index if not exists life_events_user_idx on public.life_events (user_id, created_at desc);

-- ============================================================ time passes (body, mind, bills, gym, time)
drop function if exists public.life_tick(uuid, numeric, numeric, numeric);
/**
 * Bring your life up to now: Body and Mind move by p_body_day and p_mind_day each game day (the
 * game works these out from how you live), bills and the gym (p_gym_day) are paid from Essentials,
 * a check-up happens by itself when your body is low, finished courses count, and the hours you
 * spent (p_hours: hours a game day by kind) are written down. Returns your status.
 */
create or replace function public.life_tick(
  p_user uuid, p_power_day numeric, p_waste_day numeric, p_care_fee numeric,
  p_body_day numeric, p_mind_day numeric, p_gym_day numeric, p_hours jsonb
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

/** Body and mind together: how much of a day's work counts (0 bedridden or burnt out, half unwell). */
create or replace function public.life_work_factor(p_health numeric, p_mind numeric) returns numeric
language sql stable set search_path = public as $$
  select case when coalesce(p_health, 100) < public.setting('living_bedridden_below') or coalesce(p_mind, 100) < 10 then 0
              when coalesce(p_health, 100) < public.setting('living_sick_below') then 0.5 else 1 end
$$;

-- ============================================================ main job pay (burnout counts now)
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
    return jsonb_build_object('days', 0, 'worked', 0, 'gross', 0, 'tax', 0, 'fares', 0, 'net', 0, 'owed', 0, 'coins', p.coins);
  end if;
  select * into l from public.lives where user_id = p_user;
  v_days := least(public.setting('work_hold_days'), greatest(0, extract(epoch from (now() - j.paid_until)) / 3600.0 / v_hours));
  v_start := now() - make_interval(secs => v_days * v_hours * 3600);
  if l.recovering_until is not null and l.recovering_until > v_start then
    v_rec := least(v_days, extract(epoch from (least(now(), l.recovering_until) - v_start)) / 3600.0 / v_hours);
  end if;
  v_factor := public.life_work_factor(l.health, l.mind);
  v_work := greatest(0, v_days - v_rec) * case when v_factor = 0 then 0 else 1 end;
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = j.skill;
  v_gross := round(j.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus')) * v_work * v_factor, 2);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);

  if j.state then
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

-- ============================================================ side hustles
/** Collect what your side hustle has made (at most work_hold_days game days), less income tax. */
create or replace function public.life_hustle_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  h public.life_hustles;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_start timestamptz;
  v_off numeric := 0;
  v_boost numeric := 0;
  v_work numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  select * into h from public.life_hustles where user_id = p_user for update;
  if not found then return jsonb_build_object('days', 0, 'gross', 0, 'tax', 0, 'net', 0); end if;
  select * into l from public.lives where user_id = p_user;
  v_days := least(public.setting('work_hold_days'), greatest(0, extract(epoch from (now() - h.paid_until)) / 3600.0 / v_hours));
  v_start := now() - make_interval(secs => v_days * v_hours * 3600);
  -- Days it was stalled, or you were away, earn nothing; boosted days earn more.
  if h.stalled_until is not null and h.stalled_until > v_start then
    v_off := least(v_days, extract(epoch from (least(now(), h.stalled_until) - v_start)) / 3600.0 / v_hours);
  end if;
  if l.recovering_until is not null and l.recovering_until > v_start then
    v_off := greatest(v_off, least(v_days, extract(epoch from (least(now(), l.recovering_until) - v_start)) / 3600.0 / v_hours));
  end if;
  v_work := greatest(0, v_days - v_off);
  if h.boost_until is not null and h.boost_until > v_start then
    v_boost := least(v_work, extract(epoch from (least(now(), h.boost_until) - v_start)) / 3600.0 / v_hours);
  end if;
  v_work := v_work * case when public.life_work_factor(l.health, l.mind) = 0 then 0 else 1 end;
  v_boost := least(v_boost, v_work);
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = h.skill;
  v_gross := round(h.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus'))
                   * (v_work + v_boost * (h.boost - 1)) * public.life_work_factor(l.health, l.mind)
                   * (1 + h.swing * (random()::numeric * 2 - 1)), 2);
  v_gross := greatest(0, v_gross);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  update public.life_hustles set paid_until = now() where user_id = p_user;
  if v_gross > 0 then
    perform public.log_coins(p_user, null, 'hustle_pay', v_gross, false, 'Side hustle: ' || h.title);
    if v_tax > 0 then
      perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
      perform public.pay_tax(l.region, v_tax, 'income_tax', 'Income tax on a side hustle');
    end if;
    perform public.life_income(p_user, v_gross - v_tax);
  end if;
  if v_work > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, h.skill, round(v_work, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'worked', round(v_work, 3), 'gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax);
end $$;

/** Start a side hustle (the game says what it earns a day, its swing, hours and start-up cost). The one you had stops. */
create or replace function public.life_hustle_start(
  p_user uuid, p_hustle text, p_title text, p_skill text, p_pay_day numeric, p_swing numeric, p_hours numeric, p_cost numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_cost numeric := round(coalesce(p_cost, 0), 2);
  v_out jsonb;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_hustle !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' or coalesce(p_pay_day, 0) <= 0 or p_pay_day > public.setting('hustle_pay_max')
     or v_cost < 0 or v_cost > public.setting('hustle_start_max') or coalesce(p_hours, 0) <= 0 or p_hours > 8 then raise exception 'bad_item'; end if;
  if exists (select 1 from public.life_hustles where user_id = p_user and hustle = p_hustle) then raise exception 'already'; end if;
  if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
  v_out := public.life_hustle_collect(p_user);
  delete from public.life_hustles where user_id = p_user;
  if v_cost > 0 then
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'hustle_start', -v_cost, false, 'Starting: ' || left(p_title, 50));
    perform public.burn(null, v_cost, 'Side hustle start-up costs');
  end if;
  insert into public.life_hustles (user_id, hustle, title, skill, pay_day, swing, hours)
    values (p_user, p_hustle, left(p_title, 60), p_skill, round(p_pay_day, 2), least(1, greatest(0, coalesce(p_swing, 0.3))), p_hours);
  return jsonb_build_object('collected', v_out, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Stop your side hustle (what it made is collected first). */
create or replace function public.life_hustle_stop(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.life_hustle_collect(p_user);
  delete from public.life_hustles where user_id = p_user;
  return v_out;
end $$;

/** How you exercise: none, walk, football or gym. */
create or replace function public.life_set_exercise(p_user uuid, p_exercise text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_exercise not in ('none', 'walk', 'football', 'gym') then raise exception 'bad_item'; end if;
  update public.lives set exercise = p_exercise where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
end $$;

-- ============================================================ care for body and mind
drop function if exists public.life_care(uuid, text, text, numeric, numeric, numeric, boolean);
/** Care (the game says the fee and VAT in mint, what it gives body and mind, days away, and which pots pay). */
create or replace function public.life_care(
  p_user uuid, p_care text, p_title text, p_fee numeric, p_vat numeric, p_gain numeric, p_mind_gain numeric,
  p_away_days numeric, p_public boolean, p_pots text[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_fee numeric := round(coalesce(p_fee, 0), 2);
  v_vat numeric := round(greatest(coalesce(p_vat, 0), 0), 2);
  v_pots text[] := coalesce(p_pots, array['essentials']);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if p_care !~ '^[a-z_]{2,30}$' or v_fee <= 0 or v_fee > public.setting('living_fee_max') or coalesce(p_away_days, 0) < 0 or p_away_days > 14 then raise exception 'bad_item'; end if;
  if coalesce(p_away_days, 0) > 0 and l.recovering_until > now() then raise exception 'recovering'; end if;
  if public.life_can_spend(p_user, v_pots) < v_fee + v_vat then raise exception 'not_enough:%', trim_scale(v_fee + v_vat); end if;
  perform public.life_spend(p_user, v_pots, v_fee + v_vat);
  perform public.log_coins(p_user, null, 'health_care', -v_fee, false, left(p_title, 60));
  if p_public then
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public care fees');
  else
    perform public.burn(null, v_fee, 'Private care');
  end if;
  if v_vat > 0 then
    perform public.log_coins(p_user, null, 'vat', -v_vat, false, 'VAT');
    perform public.pay_tax(l.region, v_vat, 'vat', 'VAT on ' || left(p_title, 40));
  end if;
  update public.lives set
    health = least(100, case when p_gain >= 100 then 100 else health + greatest(0, coalesce(p_gain, 0)) end),
    mind = least(100, case when p_mind_gain >= 100 then 100 else mind + greatest(0, coalesce(p_mind_gain, 0)) end),
    recovering_until = case when coalesce(p_away_days, 0) > 0 then now() + make_interval(secs => p_away_days * public.setting('work_day_hours') * 3600) else recovering_until end,
    health_at = now()
  where user_id = p_user;
  return jsonb_build_object('health', (select health from public.lives where user_id = p_user), 'mind', (select mind from public.lives where user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ interviews
/** A failed interview: wait before trying that job there again. */
create or replace function public.life_interview_fail(p_user uuid, p_place text, p_job text) returns void
language sql security definer set search_path = public as $$
  insert into public.life_interview_fails (user_id, place, job) values (p_user, left(p_place, 40), p_job)
  on conflict (user_id, place, job) do update set failed_at = now()
$$;

/** When you can try this interview again (null: now). */
create or replace function public.life_interview_wait(p_user uuid, p_place text, p_job text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select failed_at + make_interval(hours => public.setting('interview_wait_hours')::int)
  from public.life_interview_fails
  where user_id = p_user and place = p_place and job = p_job and failed_at + make_interval(hours => public.setting('interview_wait_hours')::int) > now()
$$;

-- ============================================================ breakthroughs
/** Open a breakthrough (the game drew it and keeps the answer): only one at a time, and not too often. Returns whether it opened. */
create or replace function public.life_event_open(p_user uuid, p_id text, p_source text, p_key text, p_title text, p_hours numeric) returns boolean
language plpgsql security definer set search_path = public as $$
declare l public.lives;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return false; end if;
  update public.life_events set status = 'expired' where user_id = p_user and status = 'open' and expires_at <= now();
  if exists (select 1 from public.life_events where user_id = p_user and status = 'open') then return false; end if;
  if l.event_at is not null and l.event_at + make_interval(hours => public.setting('event_cooldown_hours')::int) > now() then return false; end if;
  insert into public.life_events (id, user_id, source, key, title, expires_at)
    values (p_id, p_user, p_source, left(p_key, 40), left(p_title, 60), now() + make_interval(secs => least(greatest(coalesce(p_hours, 2), 0.5), 24) * 3600));
  update public.lives set event_at = now() where user_id = p_user;
  return true;
end $$;

/**
 * Close a breakthrough the game has marked: won (a bonus in mint and experience for a job, a boost
 * for a side hustle) or lost (a stalled side hustle for some). Only the open one, once.
 */
create or replace function public.life_event_close(
  p_user uuid, p_id text, p_won boolean, p_bonus numeric, p_skill text, p_skill_days numeric, p_boost numeric, p_boost_days numeric, p_stall_days numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.life_events;
  l public.lives;
  v_bonus numeric := round(least(greatest(coalesce(p_bonus, 0), 0), public.setting('event_bonus_max')), 2);
  v_day numeric := public.setting('work_day_hours') * 3600;
begin
  select * into e from public.life_events where id = p_id and user_id = p_user for update;
  if not found then raise exception 'no_event'; end if;
  if e.status <> 'open' or e.expires_at <= now() then raise exception 'event_over'; end if;
  select * into l from public.lives where user_id = p_user;
  update public.life_events set status = case when p_won then 'won' else 'lost' end,
    reward = jsonb_build_object('bonus', v_bonus, 'skillDays', p_skill_days, 'boost', p_boost, 'boostDays', p_boost_days, 'stallDays', p_stall_days)
  where id = p_id;
  if p_won then
    if v_bonus > 0 then
      perform public.log_coins(p_user, null, 'bonus', v_bonus, false, 'Breakthrough: ' || e.title);
      perform public.life_income(p_user, v_bonus);
    end if;
    if coalesce(p_skill_days, 0) > 0 and p_skill ~ '^[a-z_]{2,30}$' then
      insert into public.life_skills (user_id, skill, days) values (p_user, p_skill, least(p_skill_days, 30))
        on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
    end if;
    if e.source = 'hustle' and coalesce(p_boost_days, 0) > 0 then
      perform public.life_hustle_collect(p_user);
      update public.life_hustles set boost = least(3, greatest(1, coalesce(p_boost, 1))),
        boost_until = now() + make_interval(secs => least(p_boost_days, 7) * v_day) where user_id = p_user;
    end if;
  elsif e.source = 'hustle' and coalesce(p_stall_days, 0) > 0 then
    perform public.life_hustle_collect(p_user);
    update public.life_hustles set stalled_until = now() + make_interval(secs => least(p_stall_days, 3) * v_day) where user_id = p_user;
  end if;
  return jsonb_build_object('won', p_won, 'bonus', case when p_won then v_bonus else 0 end, 'coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ reading
create or replace function public.life_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'health', l.health,
    'mind', l.mind,
    'exercise', l.exercise,
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
    'payOwed', coalesce((select owed from public.life_jobs where user_id = p_user), 0),
    'hustle', (select jsonb_build_object('hustle', hustle, 'title', title, 'skill', skill, 'payDay', pay_day, 'swing', swing, 'hours', hours,
                                         'paidUntil', paid_until, 'boost', boost, 'boostUntil', boost_until, 'stalledUntil', stalled_until)
               from public.life_hustles where user_id = p_user),
    'event', (select jsonb_build_object('id', id, 'source', source, 'key', key, 'title', title, 'expiresAt', expires_at)
              from public.life_events where user_id = p_user and status = 'open' and expires_at > now() order by created_at desc limit 1)
  )
  from public.lives l where l.user_id = p_user
$$;

/** Hours spent by kind over the last p_hours real hours. */
create or replace function public.life_time(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb) from (
    select kind, round(sum(hours), 1) as total from public.life_hours
    where user_id = p_user and created_at >= now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365))
    group by kind
  ) s
$$;

create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'commute',
                   'health_care', 'gym', 'school_fees', 'procedure', 'hustle_start', 'property_buy', 'start_grant')
    group by kind
    union all
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ============================================================ the books
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.life_hustles, public.life_hours, public.life_interview_fails, public.life_events from public, anon, authenticated;
  grant all on table public.life_hustles, public.life_hours, public.life_interview_fails, public.life_events to service_role;
  revoke all on sequence public.life_hours_id_seq from public, anon, authenticated;
  grant all on sequence public.life_hours_id_seq to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.life_tick(uuid, numeric, numeric, numeric, numeric, numeric, numeric, jsonb)', 'public.life_work_factor(numeric, numeric)',
    'public.life_work_collect(uuid, numeric)', 'public.life_hustle_collect(uuid)',
    'public.life_hustle_start(uuid, text, text, text, numeric, numeric, numeric, numeric)', 'public.life_hustle_stop(uuid)',
    'public.life_set_exercise(uuid, text)', 'public.life_care(uuid, text, text, numeric, numeric, numeric, numeric, numeric, boolean, text[])',
    'public.life_interview_fail(uuid, text, text)', 'public.life_interview_wait(uuid, text, text)',
    'public.life_event_open(uuid, text, text, text, text, numeric)',
    'public.life_event_close(uuid, text, boolean, numeric, text, numeric, numeric, numeric, numeric)',
    'public.life_status(uuid)', 'public.life_time(uuid, int)', 'public.life_money(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
