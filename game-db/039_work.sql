-- Newtown, part 39: working on the real map, getting there, and your neighbours.
--
-- Jobs. Shops, offices, warehouses, building sites and landmarks (markets, the airport, hospitals,
-- the port...) hire (src/lib/world/work.ts). You need a home first. One job at a time; better jobs
-- need a skill level, and every game day worked (2 real hours) adds to that job's skill. Pay
-- builds up by the game day while you have the job, for up to work_hold_days game days, so come
-- back at least once a game week (14 real hours) to collect it. Pay is new mint; income tax goes
-- to the treasuries (state and country, as in part 38).
--
-- Getting to work. Two trips a game day, home to work and back, by the way you choose (walk,
-- keke, okada, danfo, taxi). The game works out the fare from the map (how far your home is from
-- your job) and passes it in; it's taken off your pay when you collect, and burned (it goes to the
-- drivers, outside the game). Fares are never more than you have.
--
-- Neighbours. Other players whose home is near yours, nearest first (in your building, then
-- around you).
--
-- Safe to run more than once. Run after parts 1-38.

insert into public.game_settings (key, value, note) values
  ('work_income_tax',  0.07, 'Income tax on pay from jobs on the real map (into the treasuries)'),
  ('work_pay_max',     200,  'Most a job on the real map can pay a game day (mint, before skill bonus)'),
  ('work_fare_max',    20,   'Dearest single trip to work (mint)'),
  ('work_hold_days',   7,    'Most game days of pay that wait to be collected'),
  ('work_day_hours',   2,    'Real hours in a game day'),
  ('work_skill_bonus', 0.03, 'Extra pay per skill level (real-map jobs)')
on conflict (key) do update set note = excluded.note;

-- ============================================================ jobs and skills
create table if not exists public.life_jobs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  place_id text not null check (place_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$'),
  place_name text not null check (char_length(place_name) <= 120),
  job text not null check (job ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 60),
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  -- Mint a game day, before the skill bonus (the game works it out from the job).
  pay_day numeric(14,2) not null check (pay_day > 0),
  mode text not null check (mode in ('walk', 'keke', 'okada', 'danfo', 'taxi')),
  hired_at timestamptz not null default now(),
  paid_until timestamptz not null default now()
);
create index if not exists life_jobs_place_idx on public.life_jobs (place_id);

create table if not exists public.life_skills (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  -- Game days worked in it.
  days numeric(12,3) not null default 0,
  primary key (user_id, skill)
);

/** A skill's level from game days worked: 5 days for level 1, 20 for 2, 45 for 3... with no top. */
create or replace function public.life_skill_level(p_days numeric) returns int
language sql immutable as $$ select floor(sqrt(greatest(0, coalesce(p_days, 0)) / 5))::int $$;

/**
 * Collect your pay up to now (at most work_hold_days game days of it): pay with the skill bonus,
 * less income tax and two trips a game day at p_fare_trip (mint, worked out by the game from the
 * map). Adds the days to the job's skill. Returns what happened and your mint.
 */
create or replace function public.life_work_collect(p_user uuid, p_fare_trip numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  j public.life_jobs;
  v_days numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
  v_fares numeric;
  v_net numeric;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  select * into j from public.life_jobs where user_id = p_user for update;
  if not found then
    return jsonb_build_object('days', 0, 'gross', 0, 'tax', 0, 'fares', 0, 'net', 0, 'coins', p.coins);
  end if;
  v_days := least(public.setting('work_hold_days'),
                  greatest(0, extract(epoch from (now() - j.paid_until)) / 3600.0 / public.setting('work_day_hours')));
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = j.skill;
  v_gross := round(j.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus')) * v_days, 2);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  v_fares := round(2 * least(public.setting('work_fare_max'), greatest(0, coalesce(p_fare_trip, 0))) * v_days, 2);
  -- Fares never take you below nothing.
  v_fares := least(v_fares, p.coins + v_gross - v_tax);
  v_net := v_gross - v_tax - v_fares;

  update public.life_jobs set paid_until = now() where user_id = p_user;
  if v_days > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, j.skill, round(v_days, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  if v_gross > 0 then
    update public.profiles set coins = coins + v_net where id = p_user;
    perform public.log_coins(p_user, null, 'work_pay', v_gross, false, 'Pay: ' || j.title || ', ' || left(j.place_name, 60));
    if v_tax > 0 then
      perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
      perform public.pay_tax(j.region, v_tax, 'income_tax', 'Income tax on pay');
    end if;
    if v_fares > 0 then
      perform public.log_coins(p_user, null, 'commute', -v_fares, false, 'Fares to work and back');
      perform public.burn(null, v_fares, 'Fares to work');
    end if;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'gross', v_gross, 'tax', v_tax, 'fares', v_fares, 'net', v_net,
    'coins', (select coins from public.profiles where id = p_user));
end $$;

/**
 * Take a job (the game has checked the job is at that place and what it pays). You need a home,
 * and the job's skill level. The job you had is paid up first (p_old_fare: its fare a trip).
 */
create or replace function public.life_work_take(
  p_user uuid, p_region text, p_place text, p_place_name text, p_job text, p_title text, p_skill text,
  p_pay_day numeric, p_need_level int, p_mode text, p_old_fare numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  v_level int;
  v_out jsonb;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' or p_place is null or p_place !~ ('^' || p_region || ':-?[0-9]+,-?[0-9]+$')
     or p_job !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' then raise exception 'bad_job'; end if;
  if coalesce(p_pay_day, 0) <= 0 or p_pay_day > public.setting('work_pay_max') then raise exception 'bad_job'; end if;
  if p_mode is null or p_mode not in ('walk', 'keke', 'okada', 'danfo', 'taxi') then raise exception 'bad_mode'; end if;
  if exists (select 1 from public.life_jobs where user_id = p_user and place_id = p_place and job = p_job) then raise exception 'already'; end if;
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = p_skill;
  if coalesce(v_level, 0) < coalesce(p_need_level, 0) then raise exception 'need_level:%', p_need_level; end if;

  v_out := public.life_work_collect(p_user, p_old_fare);
  delete from public.life_jobs where user_id = p_user;
  insert into public.life_jobs (user_id, region, place_id, place_name, job, title, skill, pay_day, mode)
    values (p_user, p_region, p_place, left(coalesce(p_place_name, 'Work'), 120), p_job, left(p_title, 60), p_skill, round(p_pay_day, 2), p_mode);
  return jsonb_build_object('hired', true, 'collected', v_out, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Change how you get to work (pay up to now is collected at the old fare first). */
create or replace function public.life_work_mode(p_user uuid, p_mode text, p_old_fare numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if p_mode is null or p_mode not in ('walk', 'keke', 'okada', 'danfo', 'taxi') then raise exception 'bad_mode'; end if;
  if not exists (select 1 from public.life_jobs where user_id = p_user) then raise exception 'no_job'; end if;
  v_out := public.life_work_collect(p_user, p_old_fare);
  update public.life_jobs set mode = p_mode where user_id = p_user;
  return v_out;
end $$;

/** Leave your job (paid up first). */
create or replace function public.life_work_quit(p_user uuid, p_fare_trip numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.life_work_collect(p_user, p_fare_trip);
  delete from public.life_jobs where user_id = p_user;
  return v_out;
end $$;

/** Your job (if any), when it was last paid, and your skills. */
create or replace function public.life_work_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'job', (select jsonb_build_object('place', j.place_id, 'placeName', j.place_name, 'job', j.job, 'title', j.title, 'skill', j.skill,
                                      'payDay', j.pay_day, 'mode', j.mode, 'hiredAt', j.hired_at, 'paidUntil', j.paid_until)
            from public.life_jobs j where j.user_id = p_user),
    'skills', coalesce((select jsonb_object_agg(skill, days) from public.life_skills where user_id = p_user), '{}'::jsonb)
  )
$$;

-- ============================================================ neighbours
/** "lagos:12,-40/3" -> (12, -40). */
create or replace function public.unit_xz(p_unit text, out x int, out z int)
language sql immutable as $$
  select m[1]::int, m[2]::int from regexp_match(p_unit, ':(-?[0-9]+),(-?[0-9]+)(/|$)') m
$$;

/**
 * Players whose home is within p_radius tiles (100 m each) of yours, nearest first: their name,
 * whether they're in your building (and then which unit), and how far.
 */
create or replace function public.life_neighbours(p_user uuid, p_radius int) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select l.region, l.home_unit, split_part(l.home_unit, '/', 1) as building, (public.unit_xz(l.home_unit)).*
    from public.lives l where l.user_id = p_user and l.home_unit is not null
  ), near as (
    select o.user_id, o.home_unit, split_part(o.home_unit, '/', 1) as building, (public.unit_xz(o.home_unit)).*
    from public.lives o, me
    where o.user_id <> p_user and o.region = me.region and o.home_unit is not null
  )
  select coalesce(jsonb_agg(x order by (x->>'tiles')::numeric, x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'name', coalesce(p.username, 'A neighbour'),
      'sameBuilding', n.building = me.building,
      'unit', case when n.building = me.building then u.label end,
      'building', n.building,
      'tiles', round(sqrt(power(n.x - me.x, 2) + power(n.z - me.z, 2))::numeric, 1)
    ) as x
    from near n cross join me
    join public.profiles p on p.id = n.user_id
    left join public.property_units u on u.unit_id = n.home_unit
    where abs(n.x - me.x) <= least(greatest(coalesce(p_radius, 5), 0), 30) and abs(n.z - me.z) <= least(greatest(coalesce(p_radius, 5), 0), 30)
      and sqrt(power(n.x - me.x, 2) + power(n.z - me.z, 2)) <= least(greatest(coalesce(p_radius, 5), 0), 30)
      and not p.frozen and p.age_blocked_at is null
    order by sqrt(power(n.x - me.x, 2) + power(n.z - me.z, 2))
    limit 40
  ) s
$$;

-- ============================================================ the books
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.life_jobs, public.life_skills from public, anon, authenticated;
  grant all on table public.life_jobs, public.life_skills to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.life_work_collect(uuid, numeric)',
    'public.life_work_take(uuid, text, text, text, text, text, text, numeric, int, text, numeric)',
    'public.life_work_mode(uuid, text, numeric)', 'public.life_work_quit(uuid, numeric)', 'public.life_work_status(uuid)',
    'public.life_neighbours(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
