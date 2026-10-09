-- Newtown, part 27: daily streaks and the new level curve.
-- Run once in Supabase → SQL Editor, after 026 (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- Daily streaks
-- - Doing one thing a day keeps your streak going: playing a game, finishing a side quest,
--   giving or spraying mint, a hug or a handshake (part 28), or riding something.
--   Days are UTC days. Each day counts once, however much you do.
-- - Miss one day and the week's free freeze saves your streak (one a week, Monday to Sunday).
--   Miss more and it starts again from 1.
-- - Rewards at 3, 7, 14, 30, 60 and 100 days (and every 100 days after that): a little mint
--   each time you get there, plus a badge the first time.
-- - Players who were already playing every day start with the days they have played in a row.
--
-- New level curve
-- - Levels now need XP as well as mint. XP comes from playing a game (10), finishing a side
--   quest (10) and each day of your streak (5).
-- - Quick and cheap up to level 20: 15 XP and 10 × level mint for each level.
-- - Then harder every level up to 100: 30 XP for level 20 → 21, 5 more for each level after
--   (425 XP for 99 → 100), and 50 × (level − 15) mint (250 at level 20, 4,200 at 99).
-- - Everyone keeps the level they have. Players who had already played enough rounds for their
--   next level under the old rules start with the XP for it.
-- - The daily mint refill still grows by 25 per level, but stops growing at level 40
--   (1,075 a day). It would have been 2,575 a day at level 100.
--
-- Coin books: streak rewards are new mint ('streak_reward', added to coin_supply_daily).
-- Levelling up still burns its mint.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('streak_reward_3',    10,  'Mint for reaching a 3-day streak'),
  ('streak_reward_7',    25,  'Mint for reaching a 7-day streak'),
  ('streak_reward_14',   50,  'Mint for reaching a 14-day streak'),
  ('streak_reward_30',   100, 'Mint for reaching a 30-day streak'),
  ('streak_reward_60',   200, 'Mint for reaching a 60-day streak'),
  ('streak_reward_100',  500, 'Mint for reaching a 100-day streak (and every 100 days after)'),
  ('level_max',          100, 'Highest level'),
  ('level_easy_until',   20,  'Levels below this are the quick, cheap ones'),
  ('level_xp_easy',      15,  'XP for each level below level_easy_until'),
  ('level_xp_hard',      30,  'XP to go from level_easy_until to the next level'),
  ('level_xp_step',      5,   'Extra XP needed for each level after that'),
  ('level_cost_easy',    10,  'Mint to go from level L to L+1 below level_easy_until = this × L'),
  ('level_cost_hard',    50,  'Mint from level_easy_until up = this × (L − level_easy_until + 5)'),
  ('level_xp_game',      10,  'XP for playing a game (joining a round)'),
  ('level_xp_quest',     10,  'XP for finishing a side quest'),
  ('level_xp_streak',    5,   'XP for each day of your streak'),
  ('passive_level_cap',  40,  'The daily refill stops growing at this level')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
alter table public.profiles add column if not exists level_xp int not null default 0;

-- Each player's streak.
create table if not exists public.streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current int not null default 0,
  best int not null default 0,
  last_day date,            -- the last day that counted (UTC)
  freeze_used_on date,      -- the last day a freeze covered
  updated_at timestamptz not null default now()
);
alter table public.streaks enable row level security; -- no policies: only the server reads them

-- Every day that counted: what did it first, the streak that day, and whether the freeze
-- covered the day before. (Also handy for "who came back the next day".)
create table if not exists public.streak_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  action text not null,
  streak int not null default 0,
  froze boolean not null default false,
  reward numeric(14,2) not null default 0,
  at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists streak_days_day_idx on public.streak_days (day);
alter table public.streak_days enable row level security; -- no policies: only the server reads them

-- ============================================================ streaks
create or replace function public.streak_today() returns date
language sql stable as $$ select (now() at time zone 'UTC')::date $$;

-- The streak lengths that pay.
create or replace function public.streak_milestones() returns int[]
language sql immutable as $$ select array[3, 7, 14, 30, 60, 100] $$;

-- Mint for reaching p_days in a row (0 when it isn't a milestone).
create or replace function public.streak_reward(p_days int) returns numeric
language sql stable set search_path = public as $$
  select case when p_days = any (public.streak_milestones()) then coalesce(public.setting('streak_reward_' || p_days), 0)
              when p_days > 100 and p_days % 100 = 0 then coalesce(public.setting('streak_reward_100'), 0)
              else 0 end
$$;

-- The next milestone after p_days.
create or replace function public.streak_next(p_days int) returns int
language sql immutable set search_path = public as $$
  select coalesce((select min(m) from unnest(public.streak_milestones()) m where m > p_days), (p_days / 100 + 1) * 100)
$$;

-- Is the free freeze still there for a day you missed? One a week (ISO weeks, Monday first).
create or replace function public.streak_freeze_ready(p_used date, p_missed date) returns boolean
language sql immutable as $$
  select p_used is null or date_trunc('week', p_used) < date_trunc('week', p_missed)
$$;

-- What the app shows: { current, best, today, alive, freeze_ready, freeze_needed, week, next,
-- next_reward, rewards: { "3": 10, "7": 25, … } }. current is 0 once the streak is broken. today: today already counts.
-- freeze_needed: you missed yesterday, and the freeze will save your streak if you do something
-- today. week: the last 7 days, oldest first ('done', 'freeze', 'missed' or 'today' for today
-- when it doesn't count yet).
create or replace function public.streak_of(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.streaks;
  v_today date := public.streak_today();
  v_alive boolean;
  v_need boolean := false;
  v_current int;
  v_week jsonb;
begin
  select * into s from public.streaks where user_id = p_user;
  v_alive := found and (s.last_day >= v_today - 1
                        or (s.last_day = v_today - 2 and public.streak_freeze_ready(s.freeze_used_on, v_today - 1)));
  v_need := found and s.last_day = v_today - 2 and v_alive;
  v_current := case when v_alive then s.current else 0 end;
  select jsonb_agg(case when d.day = any (done.days) then 'done'
                        when d.day + 1 = any (froze.days) then 'freeze'
                        when d.day = v_today then 'today'
                        else 'missed' end order by d.day)
    into v_week
  from generate_series(v_today - 6, v_today, interval '1 day') as d0(t)
  cross join lateral (select d0.t::date as day) d
  cross join (select coalesce(array_agg(day), '{}') as days from public.streak_days where user_id = p_user and day > v_today - 7) done
  cross join (select coalesce(array_agg(day), '{}') as days from public.streak_days where user_id = p_user and day > v_today - 7 and froze) froze;
  return jsonb_build_object(
    'current', v_current,
    'best', coalesce(s.best, 0),
    'today', coalesce(s.last_day = v_today, false),
    'alive', v_alive,
    'freeze_ready', public.streak_freeze_ready(s.freeze_used_on, v_today),
    'freeze_needed', v_need,
    'week', v_week,
    'next', public.streak_next(v_current),
    'next_reward', public.streak_reward(public.streak_next(v_current)),
    'rewards', (select jsonb_object_agg(m, public.streak_reward(m)) from unnest(public.streak_milestones()) m));
end $$;

-- Count today for this player (once a day; the rest of the day it just says where they are).
-- p_action: game, quest, gift, spray, hug, handshake or ride. Pays the milestone mint, hands
-- out the badge the first time, adds the day's XP and sends a notification at milestones.
-- Returns streak_of() plus { new_day, froze, reward }, or null for bots and paused accounts.
create or replace function public.streak_touch(p_user uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  s public.streaks;
  v_today date := public.streak_today();
  v_n int;
  v_froze boolean := false;
  v_reward numeric;
  v_round bigint;
  v_rows int;
begin
  if p_action is null or p_action not in ('game', 'quest', 'gift', 'spray', 'hug', 'handshake', 'ride') then
    raise exception 'bad_action';
  end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot or p.frozen or p.age_blocked_at is not null then return null; end if;
  insert into public.streak_days (user_id, day, action) values (p_user, v_today, p_action) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return public.streak_of(p_user) || jsonb_build_object('new_day', false, 'froze', false, 'reward', 0);
  end if;
  insert into public.streaks (user_id) values (p_user) on conflict do nothing;
  select * into s from public.streaks where user_id = p_user for update;
  if s.last_day = v_today then
    v_n := s.current;
  elsif s.last_day = v_today - 1 then
    v_n := s.current + 1;
  elsif s.last_day = v_today - 2 and public.streak_freeze_ready(s.freeze_used_on, v_today - 1) then
    v_n := s.current + 1;
    v_froze := true;
  else
    v_n := 1;
  end if;
  v_reward := public.streak_reward(v_n);
  update public.streaks
     set current = v_n, best = greatest(best, v_n), last_day = v_today, updated_at = now(),
         freeze_used_on = case when v_froze then v_today - 1 else freeze_used_on end
   where user_id = p_user;
  update public.streak_days set streak = v_n, froze = v_froze, reward = v_reward where user_id = p_user and day = v_today;
  update public.profiles set level_xp = level_xp + coalesce(public.setting('level_xp_streak'), 0)::int where id = p_user;
  if v_reward > 0 then
    select max(id) into v_round from public.rounds;
    update public.profiles set coins = coins + v_reward where id = p_user;
    perform public.log_coins(p_user, v_round, 'streak_reward', v_reward, false, format('Streak: %s days', v_n));
    if v_n <= 100 and not exists (select 1 from public.badges where user_id = p_user and badge = 'streak_' || v_n) then
      insert into public.badges (user_id, round_id, badge, detail)
      values (p_user, v_round, 'streak_' || v_n, format('Played %s days in a row', v_n))
      on conflict do nothing;
    end if;
    perform public.notify(p_user, v_round, 'streak', format('%s-day streak! +%s mint. Keep it going tomorrow.', v_n, v_reward));
  end if;
  return public.streak_of(p_user) || jsonb_build_object('new_day', true, 'froze', v_froze, 'reward', v_reward);
end $$;

-- ============================================================ levels
-- XP to go from level p_level to the next one.
create or replace function public.level_need(p_level int) returns int
language sql stable set search_path = public as $$
  select case when p_level < public.setting('level_easy_until') then public.setting('level_xp_easy')::int
              else (public.setting('level_xp_hard') + public.setting('level_xp_step') * (p_level - public.setting('level_easy_until')))::int end
$$;

-- Mint to go from level p_level to the next one (burned).
create or replace function public.level_cost(p_level int) returns numeric
language sql stable set search_path = public as $$
  select case when p_level < public.setting('level_easy_until') then public.setting('level_cost_easy') * p_level
              else public.setting('level_cost_hard') * (p_level - public.setting('level_easy_until') + 5) end
$$;

-- Your level and what the next one takes. (rounds_played and next_rounds are still there for
-- older versions of the app: next_rounds is what playing alone would take now.)
create or replace function public.level_info(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_rounds int;
  v_need int;
  v_cost numeric;
  v_max boolean;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'Unknown player'; end if;
  v_rounds := p.hider_rounds + p.seeker_rounds;
  v_need := public.level_need(p.level);
  v_cost := public.level_cost(p.level);
  v_max := p.level >= public.setting('level_max');
  return jsonb_build_object(
    'level', p.level,
    'xp', p.level_xp,
    'next_xp', v_need,
    'next_cost', v_cost,
    'max', v_max,
    'coins', p.coins,
    'rounds_played', v_rounds,
    'next_rounds', v_rounds + ceil(greatest(v_need - p.level_xp, 0) / greatest(public.setting('level_xp_game'), 1))::int,
    'xp_game', public.setting('level_xp_game'),
    'xp_quest', public.setting('level_xp_quest'),
    'xp_streak', public.setting('level_xp_streak'),
    'can_upgrade', not v_max and p.level_xp >= v_need and p.coins >= v_cost);
end $$;

create or replace function public.upgrade_level(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_cost numeric; v_need int;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'Unknown player'; end if;
  if p.level >= public.setting('level_max') then raise exception 'You''re at the top level already!'; end if;
  v_need := public.level_need(p.level);
  v_cost := public.level_cost(p.level);
  if p.level_xp < v_need then
    raise exception 'Earn % more XP to unlock level % (play games, finish side quests, keep your streak)', v_need - p.level_xp, p.level + 1;
  end if;
  if p.coins < v_cost then raise exception 'You need % coins to reach level %', v_cost, p.level + 1; end if;
  update public.profiles set coins = coins - v_cost, level = level + 1, level_xp = level_xp - v_need where id = p_user;
  perform public.log_coins(p_user, null, 'level_up', -v_cost);
  perform public.burn(null, v_cost, 'level up');
  return jsonb_build_object('level', p.level + 1, 'cost', v_cost, 'xp', p.level_xp - v_need);
end $$;

-- The daily refill: 100, then +25 per level, but no more growth after level passive_level_cap.
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
begin
  select * into p from public.profiles where id = p_user for update;
  v_lv := least(coalesce(p.level, 1), coalesce(public.setting('passive_level_cap'), 40)::int);
  v_day := public.setting('passive_per_day') + public.setting('passive_per_level') * greatest(v_lv - 1, 0);
  v_target := public.setting('passive_target') + public.setting('passive_per_level') * greatest(v_lv - 1, 0);
  if not found or p.is_bot or p.frozen or v_day <= 0 then return 0; end if;
  if p.coins >= v_target or p.passive_at is null then
    update public.profiles set passive_at = now() where id = p_user;
    return 0;
  end if;
  v_rate := v_day / 86400.0;
  v_amt := floor(extract(epoch from (now() - p.passive_at)) * v_rate);
  select coalesce(sum(amount), 0) into v_recent from public.ledger
    where user_id = p_user and kind = 'passive' and created_at > now() - interval '24 hours';
  v_amt := least(v_amt, floor(v_target - p.coins), floor(v_day - v_recent));
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

-- ============================================================ what counts (triggers)
-- These never get in the way: if anything goes wrong here, the game action still goes ahead.

-- Joining a game: XP and a streak day.
create or replace function public.streak_on_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id and not is_bot) then
    update public.profiles set level_xp = level_xp + coalesce(public.setting('level_xp_game'), 0)::int where id = new.user_id;
    perform public.streak_touch(new.user_id, 'game');
  end if;
  return null;
exception when others then
  raise warning 'streak (game) failed: %', sqlerrm;
  return null;
end $$;
drop trigger if exists entries_streak on public.entries;
create trigger entries_streak after insert on public.entries
  for each row execute function public.streak_on_entry();

-- Finishing a side quest: XP and a streak day.
create or replace function public.streak_on_quest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status = 'active' then
    update public.profiles set level_xp = level_xp + coalesce(public.setting('level_xp_quest'), 0)::int where id = new.user_id;
    perform public.streak_touch(new.user_id, 'quest');
  end if;
  return null;
exception when others then
  raise warning 'streak (quest) failed: %', sqlerrm;
  return null;
end $$;
drop trigger if exists quests_streak on public.quests;
create trigger quests_streak after update of status on public.quests
  for each row execute function public.streak_on_quest();

-- Giving or spraying mint: a streak day for the giver.
create or replace function public.streak_on_gift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.streak_touch(new.from_id, new.kind);
  return null;
exception when others then
  raise warning 'streak (gift) failed: %', sqlerrm;
  return null;
end $$;
drop trigger if exists coin_gifts_streak on public.coin_gifts;
create trigger coin_gifts_streak after insert on public.coin_gifts
  for each row execute function public.streak_on_gift();

-- ============================================================ one-time start
do $$
declare v_today date := public.streak_today();
begin
  -- Players who were already playing every day: their run of days with a game, ending today or
  -- yesterday (and their best run ever).
  insert into public.streaks (user_id, current, best, last_day)
  select r.user_id,
         coalesce(max(r.n) filter (where r.last >= v_today - 1), 0),
         max(r.n),
         max(r.last)
  from (
    select user_id, count(*)::int as n, max(d) as last
    from (select user_id, d, d - (row_number() over (partition by user_id order by d))::int as run
          from (select distinct e.user_id, (e.created_at at time zone 'UTC')::date as d
                from public.entries e join public.profiles p on p.id = e.user_id and not p.is_bot) days) runs
    group by user_id, run
  ) r
  group by r.user_id
  on conflict (user_id) do nothing;

  -- Players who had already played enough rounds for their next level under the old rules
  -- (2 × level rounds) start with the XP for it.
  if not exists (select 1 from public.game_state where key = 'level_xp_seeded') then
    update public.profiles set level_xp = public.level_need(level)
     where not is_bot and hider_rounds + seeker_rounds >= 2 * level and level < public.setting('level_max');
    insert into public.game_state (key, value) values ('level_xp_seeded', 1);
  end if;
end $$;

-- ============================================================ coin books
-- Created mint now includes streak rewards.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['streaks', 'streak_days'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('streak_today', 'streak_milestones', 'streak_reward', 'streak_next', 'streak_freeze_ready', 'streak_of',
            'streak_touch', 'level_need', 'level_cost', 'level_info', 'upgrade_level', 'accrue_passive',
            'streak_on_entry', 'streak_on_quest', 'streak_on_gift')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
