-- Newtown, part 124: closing the money cheats before opening to 1,000 players (docs/LAUNCH_FIXES.md,
-- stage 1).
-- 1. Game results (challenge_report). The pool is paid only when the other players agree: more
--    than half of those still in (not counting the winner) say the same winner, or everyone else
--    gave up. A player saying someone else won only counts as them losing. A lone "I won", or
--    players who disagree, never pays: after challenge_settle_secs with no agreement, everyone's
--    stake goes back.
-- 2. Brand-new accounts (as for gifts, part 107: under gift_new_days days old or below level
--    gift_new_level) can put at most stake_new_daily_max a day into game pools.
-- 3. Trips: at most trip_max_per_minute a minute, and finding something on the way is rolled here
--    (trip_find), at most trip_find_daily_max a day.
-- 4. Whot! for a pool is dealt and refereed on the server (src/app/play/games/whot-actions.ts):
--    the shuffle and everyone's hands are kept here (whot_games), where no phone can read them,
--    each player is sent only their own hand, every move is checked against whose turn it is, and
--    the server pays the winner (challenge_award). The phones' word on who won isn't asked.
-- 5. Online pay (part 83) only for players the server has seen doing something lately (a trip, a
--    message, a moment answered, joining a game, paying for something) in the last
--    online_pay_active_mins minutes. Minutes still count for the daily gift either way.
--
-- Safe to run more than once. Run after part 123 (or any time after 110).

insert into public.game_settings (key, value, note) values
  ('challenge_settle_secs', 180, 'Seconds after the first result is said before a game with no agreement is called off (stakes back)'),
  ('stake_new_daily_max',   500, 'Most mint a new or low-level player can put into game pools a day'),
  ('trip_max_per_minute',    10, 'Most trips a player can make in a minute'),
  ('trip_find_chance',     0.08, 'Chance of finding something on a trip'),
  ('trip_find_daily_max',     3, 'Most things a player can find on trips a day'),
  ('online_pay_active_mins', 20, 'Online pay only for players who did something the server saw in this many minutes')
on conflict (key) do update set note = excluded.note;

-- ============================================================ 1. game results
-- Whot! games played on the server (4): the game as it stands, never sent to a phone whole.
create table if not exists public.whot_games (
  challenge_id bigint primary key references public.challenges (id) on delete cascade,
  -- { s: the rules' state (hands, market, seed...), pile: the last cards played, at: when this
  --   turn began (ms), missed: turns each seat let run out in a row }.
  game jsonb not null,
  -- Moves played: a move is saved only onto the game it was checked against.
  n int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.whot_games enable row level security;

/**
 * Pay a game's winner the pool less a tenth, or give everyone their stake back (p_winner null).
 * Only for games still being played; the winner must still be in it (else stakes back). For the
 * server's own games and challenge_report. Returns { winner, prize } or { draw: true }.
 */
create or replace function public.challenge_award(p_id bigint, p_winner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  v_prize numeric;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if c.status = 'done' then return jsonb_build_object('winner', c.winner_id, 'prize', c.prize); end if;
  if c.status <> 'playing' then return jsonb_build_object('winner', null, 'draw', true); end if;
  if p_winner is null or not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_winner and left_at is null) then
    perform public.challenge_refund(p_id);
    return jsonb_build_object('winner', null, 'draw', true);
  end if;
  v_prize := round(c.pool * 0.9, 2);
  if v_prize > 0 then
    update public.profiles set coins = coins + v_prize where id = p_winner;
    perform public.log_coins(p_winner, null, 'challenge_win', v_prize, false, 'Won a challenge');
    perform public.burn(null, c.pool - v_prize, 'Challenge pools');
  end if;
  update public.challenges set status = 'done', winner_id = p_winner, prize = v_prize, finished_at = now() where id = p_id;
  return jsonb_build_object('winner', p_winner, 'prize', v_prize);
end $$;

/**
 * A player says how it ended: who won, or a draw (p_draw). p_winner null and p_draw false: just
 * checking. The winner (still in the game) is paid the pool less a tenth when more than half of
 * the other players still in say they won, or when everyone else gave up. More than half of
 * those still in saying draw: stakes back. No agreement challenge_settle_secs after the first
 * answer (a lone claim, or a dispute): stakes back. A game the server plays (whot_games) takes
 * no claims: only everyone else giving up ends it here. Returns the winner once paid ({draw:
 * true} when the stakes went back).
 */
create or replace function public.challenge_report(p_user uuid, p_id bigint, p_winner uuid, p_draw boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  v_in int;
  v_draws int;
  v_first timestamptz;
  v_w uuid;
  v_found int := 0;
  r record;
  v_server boolean := exists (select 1 from public.whot_games where challenge_id = p_id);
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if c.status = 'done' then return jsonb_build_object('winner', c.winner_id, 'prize', c.prize); end if;
  if c.status = 'cancelled' then return jsonb_build_object('winner', null, 'draw', true); end if;
  if c.status <> 'playing' then raise exception 'not_playing'; end if;
  if not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_user) then raise exception 'not_in'; end if;
  if p_winner is not null and not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_winner) then raise exception 'bad_winner'; end if;
  if v_server then
    null;
  elsif coalesce(p_draw, false) then
    update public.challenge_players set says = null, says_draw = true, said_at = coalesce(said_at, now()) where challenge_id = p_id and user_id = p_user;
  elsif p_winner is not null then
    update public.challenge_players set says = p_winner, says_draw = false, said_at = coalesce(said_at, now()) where challenge_id = p_id and user_id = p_user;
  end if;
  select count(*) filter (where left_at is null), count(*) filter (where left_at is null and says_draw), min(said_at)
    into v_in, v_draws, v_first from public.challenge_players where challenge_id = p_id;
  -- A draw: more than half of those still in say so. Stakes back.
  if v_draws > 0 and v_draws * 2 > v_in then
    perform public.challenge_refund(p_id);
    return jsonb_build_object('winner', null, 'draw', true);
  end if;
  -- Who the others agree won: each player still in, against what the other players still in say.
  for r in
    select w.user_id,
           count(o.user_id) as others,
           count(o.user_id) filter (where o.says = w.user_id) as agree,
           exists (select 1 from public.challenge_players g where g.challenge_id = p_id and g.left_at is not null and g.user_id <> w.user_id) as gave_up
    from public.challenge_players w
    left join public.challenge_players o on o.challenge_id = p_id and o.user_id <> w.user_id and o.left_at is null
    where w.challenge_id = p_id and w.left_at is null
    group by w.user_id
  loop
    if (r.others = 0 and r.gave_up) or (not v_server and r.others > 0 and r.agree * 2 > r.others) then
      v_w := r.user_id;
      v_found := v_found + 1;
    end if;
  end loop;
  if v_found <> 1 then
    -- Nobody agreed on (or two players each said the other won): stakes back once it's had time.
    if v_first is not null and v_first < now() - make_interval(secs => coalesce(public.setting('challenge_settle_secs'), 180)::int) then
      perform public.challenge_refund(p_id);
      return jsonb_build_object('winner', null, 'draw', true);
    end if;
    return jsonb_build_object('winner', null, 'waiting', true);
  end if;
  return public.challenge_award(p_id, v_w);
end $$;

/** Tidy up: open ones whose minute is long gone, results nobody agreed on in time (stakes back), and games nobody finished in 45 minutes (stakes back). */
create or replace function public.challenge_sweep(p_region text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.challenges where region = p_region and status = 'open' and starts_at < now() - interval '20 seconds' limit 20 loop
    perform public.challenge_begin(r.id);
  end loop;
  -- Games with a result said a while ago whose players all closed the game: settle them now.
  for r in select distinct on (c.id) c.id, cp.user_id from public.challenges c join public.challenge_players cp on cp.challenge_id = c.id
           where c.region = p_region and c.status = 'playing' and (cp.says is not null or cp.says_draw)
             and cp.said_at < now() - make_interval(secs => coalesce(public.setting('challenge_settle_secs'), 180)::int) limit 20 loop
    perform public.challenge_report(r.user_id, r.id, null, false);
  end loop;
  for r in select id from public.challenges where region = p_region and status = 'playing' and started_at < now() - interval '45 minutes' limit 20 loop
    perform public.challenge_refund(r.id);
  end loop;
end $$;

-- ============================================================ 2. new accounts' stakes
/** How much more this player may put into game pools today: null when there's no limit (as gift_left_today). */
create or replace function public.stake_left_today(p public.profiles) returns numeric
language sql stable set search_path = public as $$
  select case
    when p.created_at > now() - make_interval(days => public.setting('gift_new_days')::int)
      or coalesce(p.level, 1) < public.setting('gift_new_level')
    then greatest(0, public.setting('stake_new_daily_max') - (
      select coalesce(sum(cp.paid), 0) from public.challenge_players cp join public.challenges c on c.id = cp.challenge_id
      where cp.user_id = p.id and cp.joined_at >= date_trunc('day', now()) and c.status <> 'cancelled'))
    else null end
$$;

-- Every way into a game (challenging, hosting, inviting, joining) adds a player row: checked here.
create or replace function public.challenge_stake_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_left numeric;
begin
  select * into p from public.profiles where id = new.user_id;
  v_left := public.stake_left_today(p);
  if v_left is not null and new.paid > v_left then raise exception 'new_stake_cap:%', trim_scale(v_left); end if;
  return new;
end $$;
drop trigger if exists challenge_stake_cap on public.challenge_players;
create trigger challenge_stake_cap before insert on public.challenge_players
  for each row when (new.paid > 0) execute function public.challenge_stake_cap();

-- ============================================================ 5. seen doing something (for online pay)
alter table public.lives add column if not exists acted_at timestamptz;
-- Today's online pay row in the ledger (one a day, added to: online_ping).
alter table public.activity_days add column if not exists pay_ledger bigint;

/** The server saw this player do something just now (written at most every 30 seconds). */
create or replace function public.life_acted(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.lives set acted_at = now() where user_id = p_user and (acted_at is null or acted_at < now() - interval '30 seconds')
$$;

create or replace function public.acted_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then perform public.life_acted(new.user_id); end if;
  return new;
end $$;
drop trigger if exists acted_ledger on public.ledger;
-- Money the player chose to spend (not bills, rent or taxes taken by themselves).
create trigger acted_ledger after insert on public.ledger
  for each row when (new.amount < 0 and new.kind in ('commute', 'challenge_stake', 'challenge_fee', 'game_host', 'game_fee', 'mark', 'gift_sent',
    'spray_sent', 'ticket', 'event_ticket', 'club_entry', 'gym', 'property_buy', 'home_upgrade', 'landmark_buy', 'craft_cost', 'prank', 'bet',
    'hustle_start', 'business_start', 'event_hosting', 'procedure', 'service_hold', 'offer_hold', 'sched_ticket', 'sched_gear', 'duel_fee',
    'market_fee', 'stake', 'heist_stake'))
  execute function public.acted_ledger();

create or replace function public.acted_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.life_acted(new.sender_id);
  return new;
end $$;
drop trigger if exists acted_chat on public.chat_messages;
create trigger acted_chat after insert on public.chat_messages for each row execute function public.acted_chat();

create or replace function public.acted_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.life_acted(new.user_id);
  return new;
end $$;
drop trigger if exists acted_game on public.challenge_players;
create trigger acted_game after insert on public.challenge_players for each row execute function public.acted_user();
do $$
begin
  -- Answering a moment (part 109; skipped before it's run).
  if to_regclass('public.moments') is not null then
    drop trigger if exists acted_moment on public.moments;
    create trigger acted_moment after update of answered_at on public.moments
      for each row when (new.answered_at is not null and old.answered_at is null) execute function public.acted_user();
  end if;
end $$;

/**
 * A minute of you being active (part 73), paid for when the server has seen you do something
 * lately (above): { minutes (today), paid (mint, this ping), rate (mint a minute), left (paid
 * minutes left today), idle (not paid: nothing done lately) }.
 */
create or replace function public.online_ping(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_after int;
  v_counted boolean;
  v_rate numeric := coalesce(public.setting('online_pay_minute'), 0);
  v_cap int := coalesce(public.setting('online_pay_daily_minutes'), 0)::int;
  v_paid numeric := 0;
  v_acted boolean;
  v_row bigint;
begin
  v_after := public.active_ping(p_user);
  -- Paid only if this very call counted the minute (active_ping stamps last_ping with this
  -- transaction's now(); a ping that came too soon, or lost a race to another, leaves it older).
  v_counted := exists (select 1 from public.activity_days where user_id = p_user and day = public.lagos_day() and last_ping = now());
  v_acted := exists (select 1 from public.lives where user_id = p_user
                     and acted_at > now() - make_interval(mins => coalesce(public.setting('online_pay_active_mins'), 20)::int));
  if v_counted and v_acted and v_after <= v_cap and v_rate > 0 then
    v_paid := v_rate;
    update public.profiles set coins = coins + v_paid where id = p_user;
    -- One row in the ledger a day, added to each minute (not a row a minute: 13m rows a month at
    -- 10,000 daily players, docs/COSTS.md).
    update public.ledger set amount = amount + v_paid
      where id = (select pay_ledger from public.activity_days where user_id = p_user and day = public.lagos_day())
        and user_id = p_user and kind = 'online_pay';
    if not found then
      insert into public.ledger (user_id, kind, amount, bonus, note) values (p_user, 'online_pay', v_paid, false, 'Paid for being online')
        returning id into v_row;
      update public.activity_days set pay_ledger = v_row where user_id = p_user and day = public.lagos_day();
    end if;
  end if;
  return jsonb_build_object('minutes', v_after, 'paid', v_paid, 'rate', v_rate, 'left', greatest(0, v_cap - v_after), 'idle', not v_acted);
end $$;

-- ============================================================ 3. trips
alter table public.lives add column if not exists trip_since timestamptz;
alter table public.lives add column if not exists trip_n int not null default 0;
alter table public.lives add column if not exists find_day date;
alter table public.lives add column if not exists find_n int not null default 0;

/** Go into a building: pay the fare (as part 48), at most trip_max_per_minute trips a minute. */
create or replace function public.life_go(p_user uuid, p_place text, p_fare numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_fare numeric := round(least(public.setting('trip_fare_max'), greatest(0, coalesce(p_fare, 0))), 2);
  v_paid numeric := 0;
  v_n int;
begin
  if p_place is null or p_place !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$' then raise exception 'bad_place'; end if;
  update public.lives
    set trip_n = case when trip_since > now() - interval '1 minute' then trip_n + 1 else 1 end,
        trip_since = case when trip_since > now() - interval '1 minute' then trip_since else now() end
    where user_id = p_user returning trip_n into v_n;
  if not found then raise exception 'no_life'; end if;
  if v_n > coalesce(public.setting('trip_max_per_minute'), 10) then raise exception 'too_fast'; end if;
  if v_fare > 0 then
    if public.life_can_spend(p_user, array['travel']) < v_fare then raise exception 'not_enough:%', trim_scale(v_fare); end if;
    v_paid := public.life_spend(p_user, array['travel'], v_fare);
    perform public.log_coins(p_user, null, 'commute', -v_paid, false, 'Fare to ' || p_place);
    perform public.burn(null, v_paid, 'Fares about town');
  end if;
  update public.lives set at_place = p_place where user_id = p_user;
  perform public.life_acted(p_user);
  return v_paid;
end $$;

/** After a trip: did you find something on the way? Rolled here, at most trip_find_daily_max a (Lagos) day. */
create or replace function public.trip_find(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_day date := public.lagos_day();
begin
  if random() >= coalesce(public.setting('trip_find_chance'), 0) then return false; end if;
  update public.lives
    set find_n = case when find_day = v_day then find_n + 1 else 1 end, find_day = v_day
    where user_id = p_user and (find_day is distinct from v_day or find_n < coalesce(public.setting('trip_find_daily_max'), 3));
  return found;
end $$;

do $$
declare f text;
begin
  revoke all on table public.whot_games from public, anon, authenticated;
  grant all on table public.whot_games to service_role;
  foreach f in array array['public.challenge_award(bigint, uuid)', 'public.challenge_report(uuid, bigint, uuid, boolean)', 'public.challenge_sweep(text)', 'public.stake_left_today(public.profiles)',
    'public.challenge_stake_cap()', 'public.life_acted(uuid)', 'public.acted_ledger()', 'public.acted_chat()', 'public.acted_user()',
    'public.online_ping(uuid)', 'public.life_go(uuid, text, numeric)', 'public.trip_find(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
