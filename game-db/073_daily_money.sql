-- Newtown, part 73: money that comes to you (docs/MONEY.md). Three things:
--   1. Active time: the game counts the minutes you're actually doing something (a ping a minute
--      at most, while the game is open and you've touched it lately), per day, in Lagos time.
--   2. The daily gift, once a day: the server works out how much (yesterday's active time, your
--      streak of days, how long you've played, your reputation) and this pays it, capped.
--   3. A prize from Newtown for every challenge won (on top of the pot), up to 5 a day.
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('daily_gift_max',        40,   'Most mint one daily gift can be (the server works the amount out; this is the ceiling)'),
  ('challenge_bonus',       3.33, 'Mint Newtown adds for each challenge won (on top of the pot)'),
  ('challenge_bonus_daily', 5,    'How many challenge wins a day get the Newtown prize')
on conflict (key) do update set note = excluded.note;

-- The day in Lagos (days start at midnight there).
create or replace function public.lagos_day(p_at timestamptz default now()) returns date
language sql stable as $$ select (p_at at time zone 'Africa/Lagos')::date $$;

-- ============================================================ active time
create table if not exists public.activity_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  minutes int not null default 0,
  last_ping timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.activity_days enable row level security;

/** A minute of you being active (counted at most once every 50 seconds, 10 hours a day at most). Returns today's minutes. */
create or replace function public.active_ping(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.lagos_day();
  v_min int;
begin
  insert into public.activity_days (user_id, day, minutes, last_ping) values (p_user, v_day, 1, now())
  on conflict (user_id, day) do update
    set minutes = least(public.activity_days.minutes + 1, 600), last_ping = now()
    where public.activity_days.last_ping < now() - interval '50 seconds';
  select minutes into v_min from public.activity_days where user_id = p_user and day = v_day;
  return coalesce(v_min, 0);
end $$;

-- ============================================================ the daily gift
create table if not exists public.daily_gifts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  amount numeric(14,2) not null,
  streak int not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_gifts enable row level security;

/** What the gift would be made of today: claimed already?, the streak it would be, yesterday's active minutes, days playing. */
create or replace function public.daily_gift_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'claimed', exists (select 1 from public.daily_gifts where user_id = p_user and day = public.lagos_day()),
    'streak', coalesce((select streak from public.daily_gifts where user_id = p_user and day = public.lagos_day() - 1), 0) + 1,
    'today_streak', (select streak from public.daily_gifts where user_id = p_user and day = public.lagos_day()),
    'today_amount', (select amount from public.daily_gifts where user_id = p_user and day = public.lagos_day()),
    'active_yesterday', coalesce((select minutes from public.activity_days where user_id = p_user and day = public.lagos_day() - 1), 0),
    'active_today', coalesce((select minutes from public.activity_days where user_id = p_user and day = public.lagos_day()), 0),
    'days_playing', coalesce((select greatest(0, public.lagos_day() - public.lagos_day(started_at)) from public.lives where user_id = p_user), 0)
  )
$$;

/** Take today's gift (p_amount in mint, worked out by the server; capped). Once a day. */
create or replace function public.daily_gift_claim(p_user uuid, p_amount numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.lagos_day();
  v_streak int;
  v_amount numeric := round(least(greatest(coalesce(p_amount, 0), 0), coalesce(public.setting('daily_gift_max'), 40)), 2);
begin
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  v_streak := coalesce((select streak from public.daily_gifts where user_id = p_user and day = v_day - 1), 0) + 1;
  insert into public.daily_gifts (user_id, day, amount, streak) values (p_user, v_day, v_amount, v_streak)
  on conflict (user_id, day) do nothing;
  if not found then
    return jsonb_build_object('already', true);
  end if;
  update public.profiles set coins = coins + v_amount where id = p_user;
  perform public.log_coins(p_user, null, 'daily_gift', v_amount, false, 'Daily gift');
  if coalesce(p_note, '') <> '' then perform public.notify(p_user, null, 'daily_gift', left(p_note, 200)); end if;
  return jsonb_build_object('amount', v_amount, 'streak', v_streak);
end $$;

-- ============================================================ Newtown's prize for a challenge won
create or replace function public.challenge_bonus_pay() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bonus numeric := coalesce(public.setting('challenge_bonus'), 0);
  v_today int;
begin
  if new.status <> 'done' or old.status = 'done' or new.winner_id is null or v_bonus <= 0 then return new; end if;
  -- Only a real game: at least two people put a stake in.
  if (select count(*) from public.challenge_players where challenge_id = new.id and paid > 0) < 2 then return new; end if;
  select count(*) into v_today from public.ledger
    where user_id = new.winner_id and kind = 'challenge_bonus' and created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos');
  if v_today >= coalesce(public.setting('challenge_bonus_daily'), 5) then return new; end if;
  update public.profiles set coins = coins + v_bonus where id = new.winner_id;
  perform public.log_coins(new.winner_id, null, 'challenge_bonus', v_bonus, false, 'Newtown prize for a challenge won');
  perform public.notify(new.winner_id, null, 'challenge', 'Newtown added a prize for your win. Well played!');
  return new;
end $$;

do $$
begin
  if to_regclass('public.challenges') is not null then
    drop trigger if exists challenge_bonus on public.challenges;
    create trigger challenge_bonus after update of status on public.challenges
      for each row execute function public.challenge_bonus_pay();
  end if;
end $$;

revoke all on function public.active_ping(uuid), public.daily_gift_status(uuid), public.daily_gift_claim(uuid, numeric, text), public.challenge_bonus_pay() from public, anon, authenticated;

-- The daily new-mint report counts the new kinds too: the daily gift, Newtown's challenge prize and
-- the first steps' rewards (part 72).
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                   'daily_gift', 'challenge_bonus', 'first_step')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;
revoke all on public.coin_supply_daily from public, anon, authenticated;
grant select on public.coin_supply_daily to service_role;
