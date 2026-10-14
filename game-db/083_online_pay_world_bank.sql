-- Newtown, part 83 (docs/MONEY.md):
--   1. Pay for being online: every active minute (part 73's active_ping) pays a little
--      (online_pay_minute, ₦500 in Lagos), up to online_pay_daily_minutes a day (4 hours).
--   2. The World Bank: one pot of money the city collects from games (Newtown's cut of every
--      challenge pool, and challenge fees). Players see it grow; stealing from it is coming soon.
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('online_pay_minute', 0.33, 'Mint paid for each active minute online (₦500 in Lagos)'),
  ('online_pay_daily_minutes', 240, 'How many active minutes a day are paid for')
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- What this needs from part 73 (the same definitions, so it works even if 73 hasn't been run).
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

-- ============================================================ pay for being online
/**
 * A minute of you being active (part 73), paid for: { minutes (today), paid (mint, this ping),
 * rate (mint a minute), left (paid minutes left today) }.
 */
create or replace function public.online_ping(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_after int;
  v_counted boolean;
  v_rate numeric := coalesce(public.setting('online_pay_minute'), 0);
  v_cap int := coalesce(public.setting('online_pay_daily_minutes'), 0)::int;
  v_paid numeric := 0;
begin
  v_after := public.active_ping(p_user);
  -- Paid only if this very call counted the minute (active_ping stamps last_ping with this
  -- transaction's now(); a ping that came too soon, or lost a race to another, leaves it older).
  v_counted := exists (select 1 from public.activity_days where user_id = p_user and day = public.lagos_day() and last_ping = now());
  if v_counted and v_after <= v_cap and v_rate > 0 and exists (select 1 from public.lives where user_id = p_user) then
    v_paid := v_rate;
    update public.profiles set coins = coins + v_paid where id = p_user;
    perform public.log_coins(p_user, null, 'online_pay', v_paid, false, 'Paid for being online');
  end if;
  return jsonb_build_object('minutes', v_after, 'paid', v_paid, 'rate', v_rate, 'left', greatest(0, v_cap - v_after));
end $$;

-- ============================================================ the World Bank
create table if not exists public.world_bank (
  id int primary key default 1 check (id = 1),
  balance numeric(16,2) not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.world_bank enable row level security;
create table if not exists public.world_bank_ledger (
  id bigserial primary key,
  amount numeric(14,2) not null,
  kind text not null check (char_length(kind) <= 30),
  note text,
  created_at timestamptz not null default now()
);
alter table public.world_bank_ledger enable row level security;

-- Opened with everything games have paid the city so far (only the first time).
insert into public.world_bank (id, balance)
select 1, coalesce((select sum(amount) from public.ledger where kind = 'burn' and note = 'Challenge pools'), 0)
        + coalesce((select -sum(amount) from public.ledger where kind = 'challenge_fee' and amount < 0), 0)
on conflict (id) do nothing;

/** Money a game pays the city goes into the World Bank. */
create or replace function public.world_bank_take() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric := 0;
begin
  if new.kind = 'burn' and new.note = 'Challenge pools' then v_amount := new.amount;
  elsif new.kind = 'challenge_fee' and new.amount < 0 then v_amount := -new.amount;
  end if;
  if v_amount > 0 then
    update public.world_bank set balance = balance + v_amount, updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (v_amount, new.kind, new.note);
  end if;
  return new;
end $$;
drop trigger if exists world_bank_take on public.ledger;
create trigger world_bank_take after insert on public.ledger
  for each row when (new.kind in ('burn', 'challenge_fee')) execute function public.world_bank_take();

/** What's in the World Bank, and what came in today. */
create or replace function public.world_bank_view() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.world_bank where id = 1), 0),
    'today', coalesce((select sum(amount) from public.world_bank_ledger where created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos')), 0)
  )
$$;

-- ============================================================ what you've earned, by kind
/** Your earnings by ledger kind, in all and today (Lagos day): for Things › Assets. */
create or replace function public.earnings_summary(p_user uuid, p_kinds text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(kind, jsonb_build_object('total', total, 'today', today)), '{}'::jsonb)
  from (
    select kind, sum(amount) as total,
           coalesce(sum(amount) filter (where created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos')), 0) as today
    from public.ledger
    where user_id = p_user and kind = any(p_kinds) and amount > 0
    group by kind
  ) k
$$;

do $$
declare f text;
begin
  revoke all on table public.world_bank, public.world_bank_ledger from public, anon, authenticated;
  grant all on table public.world_bank, public.world_bank_ledger to service_role;
  foreach f in array array['public.online_ping(uuid)', 'public.world_bank_take()', 'public.world_bank_view()', 'public.earnings_summary(uuid, text[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- The daily new-mint report counts online pay too.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                   'daily_gift', 'challenge_bonus', 'first_step', 'property_income', 'tutorial',
                                                   'online_pay')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;
revoke all on public.coin_supply_daily from public, anon, authenticated;
grant select on public.coin_supply_daily to service_role;
