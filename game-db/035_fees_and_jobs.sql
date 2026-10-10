-- Newtown, part 35: first-visit fees, train fares, and jobs.
--
-- Fees. The first time you go into a place in a town (each hourly town is a new world) costs a
-- little mint, ₥0.10 for a house up to ₥5 for an international airport (the game works out the
-- price from what the place is). Going back is free for the rest of that town. Boarding a train
-- (a bullet train or the monorail) costs a fare every time. A share of every fee goes into the
-- prize pool (fee_pool_share); the rest is burned.
--
-- Jobs. Any commercial building can give you a job. You apply with a short trivia interview
-- about the town (the game asks and marks it); score below the job's pass mark and you can't
-- apply there again in that town. A job pays mint by the hour while the town lasts, up to
-- job_max_hours_day paid hours a day; pay is taxed (job_tax, into the prize pool). Every paid
-- minute adds to a skill (hospitality, finance...), and with a skill you get the same kind of
-- job in later towns without an interview, and a little more pay for each skill level.
--
-- Safe to run more than once. Run after parts 1-34.

insert into public.game_settings (key, value, note) values
  ('fee_pool_share',       0.5,  'Share of first-visit fees and train fares that goes into the prize pool (the rest burns)'),
  ('visit_fee_min',        0.1,  'Cheapest first visit to a place'),
  ('visit_fee_max',        5,    'Dearest first visit to a place'),
  ('fare_max',             5,    'Dearest train fare'),
  ('job_tax',              0.10, 'Tax on job pay (into the prize pool)'),
  ('job_max_hours_day',    8,    'Most paid job hours a day'),
  ('job_pay_max',          60,   'Most a job can pay an hour (before skill bonus)'),
  ('job_skill_bonus',      0.05, 'Extra pay per skill level'),
  ('job_skill_max_level',  10,   'Highest skill level'),
  ('job_skill_minutes',    30,   'Paid minutes for each skill level'),
  ('job_skip_interview_minutes', 10, 'Paid minutes in a skill before the same kind of job needs no interview')
on conflict (key) do update set note = excluded.note;

-- ============================================================ first visits and fares
create table if not exists public.place_visits (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (char_length(place) <= 40),
  fee numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id, place)
);

/**
 * Pay a fee: p_kind 'visit' (once per place per town; p_key is the place, e.g. 'b:123') or 'fare'
 * (every time; p_key is the ride, e.g. 'v:train:0'). Returns the fee paid (0 for a place you've
 * already been to this town) and your mint.
 */
create or replace function public.pay_fee(p_user uuid, p_kind text, p_key text, p_fee numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_fee numeric;
  v_pool numeric;
begin
  if p_kind is null or p_kind not in ('visit', 'fare') then raise exception 'bad_kind'; end if;
  if p_key is null or char_length(p_key) > 40 then raise exception 'bad_place'; end if;
  select * into r from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  if not found then return jsonb_build_object('paid', 0, 'first', false, 'coins', (select coins from public.profiles where id = p_user)); end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if p_kind = 'visit' then
    v_fee := round(least(public.setting('visit_fee_max'), greatest(public.setting('visit_fee_min'), coalesce(p_fee, 0))), 2);
    if exists (select 1 from public.place_visits where round_id = r.id and user_id = p_user and place = p_key) then
      return jsonb_build_object('paid', 0, 'first', false, 'coins', p.coins);
    end if;
  else
    v_fee := round(least(public.setting('fare_max'), greatest(0.1, coalesce(p_fee, 0))), 2);
  end if;
  if p.coins < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
  update public.profiles set coins = coins - v_fee where id = p_user;
  perform public.log_coins(p_user, r.id, case when p_kind = 'visit' then 'visit_fee' else 'fare' end, -v_fee, false,
    case when p_kind = 'visit' then 'First visit: ' else 'Fare: ' end || p_key);
  v_pool := round(v_fee * public.setting('fee_pool_share'), 2);
  perform public.pool_or_burn(r.id, v_pool, case when p_kind = 'visit' then 'First-visit fees' else 'Train fares' end);
  perform public.burn(r.id, v_fee - v_pool, case when p_kind = 'visit' then 'First-visit fees' else 'Train fares' end);
  if p_kind = 'visit' then
    insert into public.place_visits (round_id, user_id, place, fee) values (r.id, p_user, p_key, v_fee);
  end if;
  return jsonb_build_object('paid', v_fee, 'first', p_kind = 'visit', 'coins', p.coins - v_fee);
end $$;

/** The places you've already been to in this town (so the game knows what's free). */
create or replace function public.my_visits(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(v.place), '[]'::jsonb)
  from public.place_visits v
  where v.user_id = p_user and v.round_id = (select id from public.rounds where status in ('join', 'seek') order by id desc limit 1)
$$;

-- ============================================================ jobs
create table if not exists public.jobs (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (char_length(place) <= 40),
  place_name text not null check (char_length(place_name) <= 80),
  job text not null check (job ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 60),
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  pay_hour numeric(14,2) not null check (pay_hour > 0),
  interviewed boolean not null default true,
  hired_at timestamptz not null default now(),
  ends_at timestamptz not null,
  paid_until timestamptz not null default now()
);
create index if not exists jobs_user_idx on public.jobs (user_id, hired_at desc);
-- One job at a time in a town.
create unique index if not exists jobs_one_open on public.jobs (round_id, user_id) where ends_at > paid_until;

create table if not exists public.job_bans (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null,
  score int not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id, place)
);

create table if not exists public.job_skills (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  minutes numeric(12,2) not null default 0,
  primary key (user_id, skill)
);

-- What's been paid today (for the daily cap): paid hours per player per UTC day.
create table if not exists public.job_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  hours numeric(10,4) not null default 0,
  primary key (user_id, day)
);

create or replace function public.skill_level(p_minutes numeric) returns int
language sql stable set search_path = public as $$
  select least(public.setting('job_skill_max_level')::int, floor(coalesce(p_minutes, 0) / public.setting('job_skill_minutes'))::int)
$$;

/**
 * Collect the pay owed for your jobs (the open one up to now, finished ones up to their end):
 * pay × hours (plus the skill bonus), capped at job_max_hours_day paid hours a day, taxed into
 * the prize pool. Adds the paid minutes to the job's skill. Returns gross, tax, net and hours.
 */
create or replace function public.job_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j public.jobs;
  r_now bigint;
  v_until timestamptz;
  v_hours numeric;
  v_left numeric;
  v_level int;
  v_rate numeric;
  v_gross numeric := 0;
  v_tax numeric;
  v_paid_hours numeric := 0;
  v_day date := (now() at time zone 'UTC')::date;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  select id into r_now from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  insert into public.job_days (user_id, day) values (p_user, v_day) on conflict do nothing;
  select greatest(0, public.setting('job_max_hours_day') - hours) into v_left from public.job_days where user_id = p_user and day = v_day for update;
  for j in select * from public.jobs where user_id = p_user and paid_until < least(ends_at, now()) order by hired_at for update loop
    v_until := least(j.ends_at, now());
    v_hours := least(v_left, extract(epoch from (v_until - j.paid_until)) / 3600.0);
    update public.jobs set paid_until = v_until where id = j.id;
    if v_hours <= 0 then continue; end if;
    v_left := v_left - v_hours;
    select public.skill_level(minutes) into v_level from public.job_skills where user_id = p_user and skill = j.skill;
    v_rate := j.pay_hour * (1 + coalesce(v_level, 0) * public.setting('job_skill_bonus'));
    v_gross := v_gross + v_rate * v_hours;
    v_paid_hours := v_paid_hours + v_hours;
    insert into public.job_skills (user_id, skill, minutes) values (p_user, j.skill, v_hours * 60)
      on conflict (user_id, skill) do update set minutes = job_skills.minutes + excluded.minutes;
  end loop;
  update public.job_days set hours = hours + v_paid_hours where user_id = p_user and day = v_day;
  v_gross := round(v_gross, 2);
  v_tax := round(v_gross * public.setting('job_tax'), 2);
  if v_gross > 0 then
    update public.profiles set coins = coins + v_gross - v_tax where id = p_user;
    perform public.log_coins(p_user, r_now, 'job_pay', v_gross, false, 'Job pay');
    if v_tax > 0 then
      perform public.log_coins(p_user, r_now, 'job_tax', -v_tax, false, 'Tax on job pay');
      perform public.pool_or_burn(r_now, v_tax, 'Tax on job pay');
    end if;
  end if;
  return jsonb_build_object('gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax, 'hours', round(v_paid_hours, 3),
    'capped', v_left <= 0, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/**
 * Take a job (the game has already held the interview and says how it went: p_score out of
 * p_out_of against p_pass). No interview (p_interviewed false) only if you have the skill.
 * A failed interview bars you from that place for the rest of the town. Taking a new job ends
 * the one you had (its pay is collected first).
 */
create or replace function public.job_hire(
  p_user uuid, p_place text, p_place_name text, p_job text, p_title text, p_skill text, p_pay numeric,
  p_interviewed boolean, p_score int, p_pass int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_pay jsonb;
  v_id bigint;
begin
  select * into r from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  if not found then raise exception 'no_game'; end if;
  if r.seek_ends_at <= now() + interval '1 minute' then raise exception 'too_late'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if p_place is null or char_length(p_place) > 40 or p_job !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' then raise exception 'bad_job'; end if;
  if coalesce(p_pay, 0) <= 0 or p_pay > public.setting('job_pay_max') then raise exception 'bad_job'; end if;
  if exists (select 1 from public.job_bans where round_id = r.id and user_id = p_user and place = p_place) then raise exception 'banned'; end if;
  if exists (select 1 from public.jobs where round_id = r.id and user_id = p_user and place = p_place and ends_at > now()) then raise exception 'already'; end if;
  if not p_interviewed then
    if coalesce((select minutes from public.job_skills where user_id = p_user and skill = p_skill), 0) < public.setting('job_skip_interview_minutes') then
      raise exception 'interview_needed';
    end if;
  elsif coalesce(p_score, 0) < coalesce(p_pass, 1) then
    insert into public.job_bans (round_id, user_id, place, score) values (r.id, p_user, p_place, coalesce(p_score, 0)) on conflict do nothing;
    return jsonb_build_object('hired', false, 'score', p_score, 'pass', p_pass);
  end if;
  -- Leave the job you had (paid up first).
  v_pay := public.job_collect(p_user);
  update public.jobs set ends_at = greatest(paid_until, now()) where user_id = p_user and round_id = r.id and ends_at > now();
  update public.jobs set paid_until = ends_at where user_id = p_user and round_id = r.id and paid_until > ends_at;
  insert into public.jobs (round_id, user_id, place, place_name, job, title, skill, pay_hour, interviewed, ends_at, paid_until)
    values (r.id, p_user, p_place, left(coalesce(p_place_name, 'Work'), 80), p_job, left(p_title, 60), p_skill, round(p_pay, 2), p_interviewed, r.seek_ends_at, now())
    returning id into v_id;
  return jsonb_build_object('hired', true, 'id', v_id, 'ends_at', r.seek_ends_at, 'collected', v_pay);
end $$;

/** Leave your job (pay collected first). */
create or replace function public.job_quit(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_pay jsonb;
begin
  v_pay := public.job_collect(p_user);
  update public.jobs set ends_at = greatest(paid_until, least(ends_at, now())) where user_id = p_user and ends_at > now();
  return jsonb_build_object('collected', v_pay);
end $$;

/** Your job, the pay waiting for you, your skills and where you can't apply in this town. */
create or replace function public.job_status(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r_id bigint;
  j public.jobs;
  v_owed numeric := 0;
  v_hours numeric := 0;
  v_left numeric;
  x record;
begin
  select id into r_id from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  select * into j from public.jobs where user_id = p_user and round_id = r_id and ends_at > now() order by hired_at desc limit 1;
  select greatest(0, public.setting('job_max_hours_day') - coalesce((select hours from public.job_days where user_id = p_user and day = (now() at time zone 'UTC')::date), 0)) into v_left;
  for x in select jb.*, (select public.skill_level(minutes) from public.job_skills s where s.user_id = p_user and s.skill = jb.skill) as lvl
           from public.jobs jb where jb.user_id = p_user and jb.paid_until < least(jb.ends_at, now()) loop
    v_hours := v_hours + extract(epoch from (least(x.ends_at, now()) - x.paid_until)) / 3600.0;
    v_owed := v_owed + x.pay_hour * (1 + coalesce(x.lvl, 0) * public.setting('job_skill_bonus'))
      * extract(epoch from (least(x.ends_at, now()) - x.paid_until)) / 3600.0;
  end loop;
  if v_hours > v_left and v_hours > 0 then v_owed := v_owed * v_left / v_hours; end if;
  return jsonb_build_object(
    'job', case when j.id is null then null else jsonb_build_object('place', j.place, 'place_name', j.place_name, 'job', j.job, 'title', j.title,
      'skill', j.skill, 'pay_hour', j.pay_hour, 'hired_at', j.hired_at, 'ends_at', j.ends_at) end,
    'owed', round(v_owed, 2),
    'tax', public.setting('job_tax'),
    'hours_left_today', round(greatest(0, v_left - v_hours), 3),
    'skip_minutes', public.setting('job_skip_interview_minutes'),
    'skill_bonus', public.setting('job_skill_bonus'),
    'skill_minutes', public.setting('job_skill_minutes'),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('skill', skill, 'minutes', round(minutes, 1), 'level', public.skill_level(minutes)) order by minutes desc)
      from public.job_skills where user_id = p_user), '[]'::jsonb),
    'banned', coalesce((select jsonb_agg(place) from public.job_bans where user_id = p_user and round_id = r_id), '[]'::jsonb)
  );
end $$;

-- ============================================================ the books
-- Job pay is new mint (the tax on it goes into the pool, like any other fee).
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.place_visits, public.jobs, public.job_bans, public.job_skills, public.job_days from public, anon, authenticated;
  grant all on table public.place_visits, public.jobs, public.job_bans, public.job_skills, public.job_days to service_role;
  revoke all on sequence public.jobs_id_seq from public, anon, authenticated;
  grant all on sequence public.jobs_id_seq to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.pay_fee(uuid, text, text, numeric)', 'public.my_visits(uuid)', 'public.job_collect(uuid)',
    'public.job_hire(uuid, text, text, text, text, text, numeric, boolean, int, int)', 'public.job_quit(uuid)', 'public.job_status(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
