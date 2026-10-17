-- Newtown, part 123: scheduled games, starting with Police & Thieves (docs/POLICE_THIEVES.md).
-- A scheduled game starts at set times of day (Police & Thieves: 2am, 10am and 6pm Lagos time,
-- 01:00, 09:00 and 17:00 UTC). Players sign up for the next one on a side (police or thieves:
-- a side can never get more than one ahead of the other), pay the ticket and buy their gear
-- (guns, grenades, rocket launchers, tanks...: the game sends each price, from src/lib/cops.ts).
-- Everything spent goes into the pool, less a tenth for the house. At the start the players are
-- shared into matches of up to 8 a side (round-robin by when they signed up, so the matches are
-- even) and each match gets its share of the pool. When a match ends, each phone sends in how it
-- ended; the winning side's players share their match's pool by what each of them did.
--
-- Trusting the phones' results: a side's win counts when a player on the OTHER side says so too
-- (owning up to a loss), or, in a match with players on one side only, when most of them agree.
-- Each player's share uses the middle value (median) of what the phones say they did, so one
-- phone can't puff itself up. Nobody agrees within 3 minutes of the end: everyone gets back their
-- part of the pool. A side made of bots that wins: its pool goes into the jackpot, which is added
-- to the next game's matches that have people on both sides.
--
-- Safe to run more than once. Run after part 122.

create table if not exists public.sched_games (
  game text primary key,
  hours_utc int[] not null,
  warmup_secs int not null,
  play_secs int not null,
  grace_secs int not null default 180,
  side_size int not null default 8,
  house_cut numeric not null default 0.1,
  -- Most one player can spend on one game (ticket and gear, mint).
  max_spend numeric not null default 500,
  note text
);
insert into public.sched_games (game, hours_utc, warmup_secs, play_secs, grace_secs, side_size, house_cut, max_spend, note) values
  ('cops-robbers', '{1,9,17}', 30, 600, 180, 8, 0.1, 500, 'Police & Thieves: 2am, 10am and 6pm Lagos time')
on conflict (game) do update set hours_utc = excluded.hours_utc, warmup_secs = excluded.warmup_secs, play_secs = excluded.play_secs,
  grace_secs = excluded.grace_secs, side_size = excluded.side_size, house_cut = excluded.house_cut, max_spend = excluded.max_spend, note = excluded.note;

create table if not exists public.sched_sessions (
  id bigserial primary key,
  game text not null references public.sched_games (game),
  starts_at timestamptz not null,
  fight_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'playing', 'done')),
  rooms int not null default 0,
  created_at timestamptz not null default now(),
  unique (game, starts_at)
);

create table if not exists public.sched_players (
  session_id bigint not null references public.sched_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- 0 police, 1 thieves.
  side smallint not null check (side in (0, 1)),
  joined_at timestamptz not null default clock_timestamp(),
  spent numeric(14,2) not null default 0,
  gear jsonb not null default '{}',
  room int,
  -- What this player's phone said at the end: {w: winning side (-1 a draw), s: {user: [activity, takedowns, downs, loot]}}.
  report jsonb,
  reported_at timestamptz,
  prize numeric(14,2) not null default 0,
  primary key (session_id, user_id)
);
create index if not exists sched_players_user_idx on public.sched_players (user_id, session_id desc);

create table if not exists public.sched_rooms (
  session_id bigint not null references public.sched_sessions (id) on delete cascade,
  room int not null,
  seed bigint not null,
  pool numeric(14,2) not null default 0,
  status text not null default 'playing' check (status in ('playing', 'done')),
  -- 0 or 1 the side that won, -1 a draw, -2 nobody agreed (everyone's part back).
  winner smallint,
  result jsonb,
  settled_at timestamptz,
  primary key (session_id, room)
);

create table if not exists public.sched_jackpot (
  game text primary key references public.sched_games (game),
  amount numeric(14,2) not null default 0
);

/** The session that starts at p_starts (made the first time it's asked for). Only real start times, and only the next one or one being played. */
create or replace function public.sched_session(p_game text, p_starts timestamptz) returns public.sched_sessions
language plpgsql security definer set search_path = public as $$
declare
  g public.sched_games;
  s public.sched_sessions;
begin
  select * into g from public.sched_games where game = p_game;
  if not found then raise exception 'bad_game'; end if;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts for update;
  if found then return s; end if;
  if extract(hour from p_starts at time zone 'UTC')::int <> all (g.hours_utc)
     or date_trunc('hour', p_starts) <> p_starts then raise exception 'bad_time'; end if;
  -- Not too far ahead (the next one only), not already over.
  if p_starts > now() + interval '9 hours' or p_starts + make_interval(secs => g.warmup_secs + g.play_secs) < now() then raise exception 'bad_time'; end if;
  insert into public.sched_sessions (game, starts_at, fight_at, ends_at)
    values (p_game, p_starts, p_starts + make_interval(secs => g.warmup_secs), p_starts + make_interval(secs => g.warmup_secs + g.play_secs))
    on conflict (game, starts_at) do nothing;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts for update;
  return s;
end $$;

/** Who's signed up for a session, on each side. */
create or replace function public.sched_counts(p_session bigint) returns int[]
language sql stable security definer set search_path = public as $$
  select array[count(*) filter (where side = 0), count(*) filter (where side = 1)]::int[] from public.sched_players where session_id = p_session
$$;

/**
 * Sign up for a session on a side (0 police, 1 thieves), paying the ticket (p_ticket, mint, from
 * Fun money then the wallet). A side can't get ahead of the other by more than one: if it's
 * ahead, choose the other side (or wait for someone to join it). Already in: changes your side
 * if that keeps it even. Errors: side_full, started, not_enough:<mint>, frozen.
 */
create or replace function public.sched_join(p_user uuid, p_game text, p_starts timestamptz, p_side int, p_ticket numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  g public.sched_games;
  p public.profiles;
  me public.sched_players;
  c int[];
  v_ticket numeric := round(least(50, greatest(0, coalesce(p_ticket, 0))), 2);
begin
  if p_side not in (0, 1) then raise exception 'bad_side'; end if;
  s := public.sched_session(p_game, p_starts);
  select * into g from public.sched_games where game = p_game;
  if now() >= s.starts_at then raise exception 'started'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  c := public.sched_counts(s.id);
  select * into me from public.sched_players where session_id = s.id and user_id = p_user;
  if found then
    if me.side = p_side then return public.sched_mine(p_user, s.id); end if;
    -- Changing sides: only to the smaller side (so it stays even).
    if c[p_side + 1] >= c[me.side + 1] then raise exception 'side_full'; end if;
    update public.sched_players set side = p_side, joined_at = clock_timestamp() where session_id = s.id and user_id = p_user;
    return public.sched_mine(p_user, s.id);
  end if;
  if c[p_side + 1] > c[(1 - p_side) + 1] then raise exception 'side_full'; end if;
  if v_ticket > 0 then
    if public.life_can_spend(p_user, array['fun']) < v_ticket then raise exception 'not_enough:%', trim_scale(v_ticket); end if;
    perform public.life_spend(p_user, array['fun'], v_ticket);
    perform public.log_coins(p_user, null, 'sched_ticket', -v_ticket, false, 'Ticket: ' || p_game);
  end if;
  insert into public.sched_players (session_id, user_id, name, side, spent)
    values (s.id, p_user, coalesce(nullif(p.username, ''), 'Player'), p_side, v_ticket);
  return public.sched_mine(p_user, s.id);
end $$;

/**
 * Buy gear for a session you're signed up for (before it starts): p_qty of p_item at p_price each
 * (mint, the game's own price), up to p_max of it. Errors: not_in, started, too_many, spend_cap,
 * not_enough:<mint>.
 */
create or replace function public.sched_buy(p_user uuid, p_game text, p_starts timestamptz, p_item text, p_qty int, p_price numeric, p_max int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  g public.sched_games;
  me public.sched_players;
  v_qty int := greatest(1, least(10, coalesce(p_qty, 1)));
  v_price numeric := round(least(250, greatest(0, coalesce(p_price, 0))), 2);
  v_have int;
  v_cost numeric;
begin
  if p_item is null or p_item !~ '^[a-z]{2,16}$' then raise exception 'bad_item'; end if;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts for update;
  if not found then raise exception 'not_in'; end if;
  select * into g from public.sched_games where game = p_game;
  if now() >= s.starts_at then raise exception 'started'; end if;
  select * into me from public.sched_players where session_id = s.id and user_id = p_user for update;
  if not found then raise exception 'not_in'; end if;
  v_have := coalesce((me.gear ->> p_item)::int, 0);
  if v_have + v_qty > greatest(1, least(10, coalesce(p_max, 1))) then raise exception 'too_many'; end if;
  v_cost := round(v_price * v_qty, 2);
  if me.spent + v_cost > g.max_spend then raise exception 'spend_cap'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['fun']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['fun'], v_cost);
    perform public.log_coins(p_user, null, 'sched_gear', -v_cost, false, 'Gear: ' || p_item);
  end if;
  update public.sched_players set gear = jsonb_set(gear, array[p_item], to_jsonb(v_have + v_qty)), spent = spent + v_cost
    where session_id = s.id and user_id = p_user;
  return public.sched_mine(p_user, s.id);
end $$;

/** Pull out before it starts: everything you spent comes back to your wallet. */
create or replace function public.sched_leave(p_user uuid, p_game text, p_starts timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  me public.sched_players;
begin
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts for update;
  if not found then return jsonb_build_object('in', false); end if;
  if now() >= s.starts_at then raise exception 'started'; end if;
  delete from public.sched_players where session_id = s.id and user_id = p_user returning * into me;
  if found and me.spent > 0 then
    update public.profiles set coins = coins + me.spent where id = p_user;
    perform public.log_coins(p_user, null, 'sched_refund', me.spent, false, 'Pulled out: ' || p_game);
  end if;
  return jsonb_build_object('in', false);
end $$;

/** You in a session: your side, gear, what you've spent, your match and prize (in: false if you're not signed up). */
create or replace function public.sched_mine(p_user uuid, p_session bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('in', true, 'side', side, 'gear', gear, 'spent', spent, 'room', room, 'prize', prize, 'reported', report is not null)
       from public.sched_players where session_id = p_session and user_id = p_user),
    jsonb_build_object('in', false))
$$;

/**
 * Start a session once its time has come (any call does it; doing it again does nothing): share
 * the players into matches (as many as it takes for up to side_size a side, round-robin by
 * sign-up), give each match its pool (what its players spent, less the house's cut) and a seed for
 * its map, and the jackpot to the matches with people on both sides.
 */
create or replace function public.sched_begin(p_session bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  g public.sched_games;
  c int[];
  n int;
  v_total numeric;
  v_jack numeric;
  v_both int;
begin
  select * into s from public.sched_sessions where id = p_session for update;
  if not found or s.status <> 'open' or now() < s.starts_at then return; end if;
  select * into g from public.sched_games where game = s.game;
  c := public.sched_counts(s.id);
  if c[1] + c[2] = 0 then
    update public.sched_sessions set status = 'done' where id = s.id;
    return;
  end if;
  n := greatest(1, ceil(greatest(c[1], c[2])::numeric / g.side_size)::int);
  update public.sched_players sp set room = r.room
    from (select user_id, ((row_number() over (partition by side order by joined_at, user_id) - 1) % n + 1)::int as room
            from public.sched_players where session_id = s.id) r
    where sp.session_id = s.id and sp.user_id = r.user_id;
  insert into public.sched_rooms (session_id, room, seed, pool)
    select s.id, k, floor(random() * 2000000000)::bigint,
           round(coalesce((select sum(spent) from public.sched_players where session_id = s.id and room = k), 0) * (1 - g.house_cut), 2)
      from generate_series(1, n) k
    on conflict do nothing;
  select coalesce(sum(spent), 0) into v_total from public.sched_players where session_id = s.id;
  perform public.burn(null, round(v_total * g.house_cut, 2), 'Scheduled games: ' || s.game);
  -- The jackpot, shared between the matches with people on both sides.
  select count(*) into v_both from public.sched_rooms r where r.session_id = s.id
    and exists (select 1 from public.sched_players where session_id = s.id and room = r.room and side = 0)
    and exists (select 1 from public.sched_players where session_id = s.id and room = r.room and side = 1);
  select amount into v_jack from public.sched_jackpot where game = s.game for update;
  if coalesce(v_jack, 0) > 0 and v_both > 0 then
    update public.sched_rooms r set pool = pool + round(v_jack / v_both, 2) where r.session_id = s.id
      and exists (select 1 from public.sched_players where session_id = s.id and room = r.room and side = 0)
      and exists (select 1 from public.sched_players where session_id = s.id and room = r.room and side = 1);
    update public.sched_jackpot set amount = 0 where game = s.game;
  end if;
  update public.sched_sessions set status = 'playing', rooms = n where id = s.id;
end $$;

/** The middle value of some numbers (0 for none). */
create or replace function public.sched_median(p numeric[]) returns numeric
language sql immutable as $$
  select coalesce((select percentile_cont(0.5) within group (order by v) from unnest(p) v), 0)::numeric
$$;

/**
 * Settle a match from what the phones said (see the top of this file). p_force: the grace time
 * after the end is over, so settle with what there is. Returns the result ({waiting: true} until
 * it can be settled): the winner and everyone's line on the leaderboard (activity, takedowns,
 * downs, loot, prize).
 */
create or replace function public.sched_settle(p_session bigint, p_room int, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.sched_rooms;
  h0 int;
  h1 int;
  v_reps int;
  v_w int;
  cand int;
  v_votes int;
  v_total numeric;
  v_spent numeric;
  v_paid numeric := 0;
  v_jack boolean := false;
  v_game text;
  pl record;
  v_rows jsonb := '[]';
  v_act numeric[];
  v_prize numeric;
  v_n int;
begin
  select * into r from public.sched_rooms where session_id = p_session and room = p_room for update;
  if not found then raise exception 'gone'; end if;
  if r.status = 'done' then return r.result; end if;
  select game into v_game from public.sched_sessions where id = p_session;
  select count(*) filter (where side = 0), count(*) filter (where side = 1), count(*) filter (where report is not null)
    into h0, h1, v_reps from public.sched_players where session_id = p_session and room = p_room;
  -- Which result stands.
  foreach cand in array array[0, 1, -1] loop
    select count(*) into v_votes from public.sched_players where session_id = p_session and room = p_room and (report ->> 'w')::int = cand;
    if cand >= 0 and exists (select 1 from public.sched_players where session_id = p_session and room = p_room and side <> cand and (report ->> 'w')::int = cand) then
      v_w := cand;
    elsif cand = -1 and h0 > 0 and h1 > 0
      and exists (select 1 from public.sched_players where session_id = p_session and room = p_room and side = 0 and (report ->> 'w')::int = -1)
      and exists (select 1 from public.sched_players where session_id = p_session and room = p_room and side = 1 and (report ->> 'w')::int = -1) then
      v_w := cand;
    elsif (h0 = 0 or h1 = 0) and v_votes * 2 > (h0 + h1) then
      v_w := cand;
    end if;
    exit when v_w is not null;
  end loop;
  if v_w is null then
    if not p_force then return jsonb_build_object('waiting', true); end if;
    -- Time's up: everyone who said agrees (the others never said), or it's nobody's.
    cand := null;
    select min((report ->> 'w')::int) into cand from public.sched_players where session_id = p_session and room = p_room and report is not null
      having count(distinct (report ->> 'w')::int) = 1;
    v_w := coalesce(cand, -2);
  end if;
  -- Everyone's numbers: the middle of what the phones said.
  create temp table if not exists sched_tally (user_id uuid, side int, name text, spent numeric, a numeric, k numeric, d numeric, l numeric) on commit drop;
  -- ("where true": Supabase refuses a DELETE without a WHERE when the game calls it.)
  delete from sched_tally where true;
  for pl in select * from public.sched_players where session_id = p_session and room = p_room loop
    select array[
        public.sched_median(array_agg(least(1000000, greatest(0, coalesce((x.report -> 's' -> pl.user_id::text ->> 0)::numeric, 0))))),
        public.sched_median(array_agg(least(999, greatest(0, coalesce((x.report -> 's' -> pl.user_id::text ->> 1)::numeric, 0))))),
        public.sched_median(array_agg(least(999, greatest(0, coalesce((x.report -> 's' -> pl.user_id::text ->> 2)::numeric, 0))))),
        public.sched_median(array_agg(least(999, greatest(0, coalesce((x.report -> 's' -> pl.user_id::text ->> 3)::numeric, 0)))))]
      into v_act
      from public.sched_players x where x.session_id = p_session and x.room = p_room and x.report is not null;
    insert into sched_tally values (pl.user_id, pl.side, pl.name, pl.spent, round(coalesce(v_act[1], 0)), round(coalesce(v_act[2], 0)), round(coalesce(v_act[3], 0)), round(coalesce(v_act[4], 0)));
  end loop;
  if v_w in (0, 1) then
    select count(*), coalesce(sum(a), 0) into v_n, v_total from sched_tally where side = v_w;
    if v_n = 0 then
      v_jack := true;
    else
      for pl in select * from sched_tally where side = v_w loop
        v_prize := round(r.pool * (case when v_total > 0 then pl.a / v_total else 1.0 / v_n end), 2);
        if v_prize > 0 then
          update public.profiles set coins = coins + v_prize where id = pl.user_id;
          perform public.log_coins(pl.user_id, null, 'sched_win', v_prize, false, 'Won: ' || v_game);
          update public.sched_players set prize = v_prize where session_id = p_session and user_id = pl.user_id;
          v_paid := v_paid + v_prize;
        end if;
      end loop;
    end if;
  else
    -- A draw, or nobody agreed: everyone's part of the pool back.
    select coalesce(sum(spent), 0) into v_spent from sched_tally;
    for pl in select * from sched_tally loop
      v_prize := round(r.pool * (case when v_spent > 0 then pl.spent / v_spent else 0 end), 2);
      if v_prize > 0 then
        update public.profiles set coins = coins + v_prize where id = pl.user_id;
        perform public.log_coins(pl.user_id, null, 'sched_refund', v_prize, false, 'A draw: ' || v_game);
        update public.sched_players set prize = v_prize where session_id = p_session and user_id = pl.user_id;
        v_paid := v_paid + v_prize;
      end if;
    end loop;
  end if;
  if v_jack then
    insert into public.sched_jackpot (game, amount) values (v_game, r.pool) on conflict (game) do update set amount = sched_jackpot.amount + excluded.amount;
  elsif r.pool - v_paid > 0 then
    perform public.burn(null, r.pool - v_paid, 'Scheduled games: rounding');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('i', t.user_id, 'n', t.name, 'tm', t.side, 'a', t.a, 'k', t.k, 'd', t.d, 'l', t.l,
           'p', (select prize from public.sched_players where session_id = p_session and user_id = t.user_id)) order by t.a desc), '[]')
    into v_rows from sched_tally t;
  update public.sched_rooms set status = 'done', winner = v_w, settled_at = now(),
      result = jsonb_build_object('w', v_w, 'pool', r.pool, 'jackpot', v_jack, 'rows', v_rows)
    where session_id = p_session and room = p_room;
  if not exists (select 1 from public.sched_rooms where session_id = p_session and status <> 'done') then
    update public.sched_sessions set status = 'done' where id = p_session;
  end if;
  return jsonb_build_object('w', v_w, 'pool', r.pool, 'jackpot', v_jack, 'rows', v_rows);
end $$;

/** Tidy up a game: start sessions whose time has come, settle matches whose grace time is over. */
create or replace function public.sched_sweep(p_game text) returns void
language plpgsql security definer set search_path = public as $$
declare x record;
begin
  for x in select id from public.sched_sessions where game = p_game and status = 'open' and starts_at <= now() limit 5 loop
    perform public.sched_begin(x.id);
  end loop;
  for x in select r.session_id, r.room from public.sched_rooms r join public.sched_sessions s on s.id = r.session_id
           join public.sched_games g on g.game = s.game
           where s.game = p_game and r.status = 'playing' and s.ends_at + make_interval(secs => g.grace_secs) < now() limit 20 loop
    perform public.sched_settle(x.session_id, x.room, true);
  end loop;
end $$;

/**
 * A session as the lobby shows it: when, how many on each side, the pool so far (and the jackpot),
 * you in it, and the last finished game's leaderboard (the top 10 across its matches, and you).
 * Nothing is made by asking.
 */
create or replace function public.sched_status(p_user uuid, p_game text, p_starts timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  g public.sched_games;
  c int[] := array[0, 0];
  v_pool numeric := 0;
  v_jack numeric;
  v_last bigint;
  v_board jsonb;
  v_mine jsonb := jsonb_build_object('in', false);
begin
  perform public.sched_sweep(p_game);
  select * into g from public.sched_games where game = p_game;
  if not found then raise exception 'bad_game'; end if;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts;
  if found then
    c := public.sched_counts(s.id);
    if s.status = 'open' then
      select round(coalesce(sum(spent), 0) * (1 - g.house_cut), 2) into v_pool from public.sched_players where session_id = s.id;
    else
      select coalesce(sum(pool), 0) into v_pool from public.sched_rooms where session_id = s.id;
    end if;
    if p_user is not null then v_mine := public.sched_mine(p_user, s.id); end if;
  end if;
  select amount into v_jack from public.sched_jackpot where game = p_game;
  select id into v_last from public.sched_sessions where game = p_game and status = 'done' and rooms > 0 order by starts_at desc limit 1;
  if v_last is not null then
    select jsonb_build_object(
        'starts_at', (select starts_at from public.sched_sessions where id = v_last),
        'rows', coalesce((select jsonb_agg(t.x) from (
            select e as x from public.sched_rooms r, jsonb_array_elements(r.result -> 'rows') e where r.session_id = v_last
            order by (e ->> 'p')::numeric desc, (e ->> 'a')::numeric desc limit 10) t), '[]'),
        'wins', (select jsonb_agg(jsonb_build_object('room', room, 'w', winner, 'pool', pool)) from public.sched_rooms where session_id = v_last),
        'me', (select jsonb_build_object('side', side, 'prize', prize, 'room', room) from public.sched_players where session_id = v_last and user_id = p_user))
      into v_board;
  end if;
  return jsonb_build_object(
    'status', coalesce(s.status, 'open'), 'police', c[1], 'thieves', c[2], 'pool', v_pool, 'jackpot', coalesce(v_jack, 0),
    'rooms', coalesce(s.rooms, 0), 'me', v_mine, 'last', v_board);
end $$;

/**
 * A match of a session that has started (it starts it, if its time has come): its seed, pool,
 * times and who's in it (each with their side and gear). p_room null: your own match (or the
 * first, to watch). Each player comes with their avatar (worn in their side's uniform). Returns
 * {status: 'open'} before the start.
 */
create or replace function public.sched_room(p_user uuid, p_game text, p_starts timestamptz, p_room int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  r public.sched_rooms;
  v_room int;
begin
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts;
  if not found then return jsonb_build_object('status', 'none'); end if;
  perform public.sched_begin(s.id);
  select * into s from public.sched_sessions where id = s.id;
  if s.status = 'open' then return jsonb_build_object('status', 'open'); end if;
  v_room := coalesce(p_room, (select room from public.sched_players where session_id = s.id and user_id = p_user), 1);
  select * into r from public.sched_rooms where session_id = s.id and room = v_room;
  if not found then return jsonb_build_object('status', s.status, 'rooms', s.rooms); end if;
  return jsonb_build_object(
    'status', s.status, 'room', v_room, 'rooms', s.rooms, 'seed', r.seed, 'pool', r.pool,
    'fight_at', s.fight_at, 'ends_at', s.ends_at, 'done', r.status = 'done', 'result', r.result,
    'me', public.sched_mine(p_user, s.id),
    'roster', coalesce((select jsonb_agg(jsonb_build_object('i', sp.user_id, 'n', sp.name, 'tm', sp.side, 'g', sp.gear, 'a', pr.avatar) order by sp.side, sp.joined_at)
                          from public.sched_players sp join public.profiles pr on pr.id = sp.user_id where sp.session_id = s.id and sp.room = v_room), '[]'));
end $$;

/**
 * Your phone says how your match ended: p_winner (0 police, 1 thieves, -1 a draw) and what everyone
 * did (p_scores: {user: [activity, takedowns, downs, loot]}). Only from 15 seconds before the end
 * (the server knows when it ends), only once. Returns the result once it's settled.
 */
create or replace function public.sched_report(p_user uuid, p_game text, p_starts timestamptz, p_winner int, p_scores jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  me public.sched_players;
begin
  if p_winner not in (-1, 0, 1) or jsonb_typeof(coalesce(p_scores, 'null')) <> 'object' then raise exception 'bad_report'; end if;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts;
  if not found then raise exception 'gone'; end if;
  select * into me from public.sched_players where session_id = s.id and user_id = p_user;
  if not found or me.room is null then raise exception 'not_in'; end if;
  if now() < s.ends_at - interval '15 seconds' then raise exception 'too_early'; end if;
  update public.sched_players set report = jsonb_build_object('w', p_winner, 's', p_scores), reported_at = now()
    where session_id = s.id and user_id = p_user and report is null;
  return public.sched_settle(s.id, me.room, false);
end $$;

do $$
declare f text;
begin
  revoke all on table public.sched_games, public.sched_sessions, public.sched_players, public.sched_rooms, public.sched_jackpot from public, anon, authenticated;
  grant all on table public.sched_games, public.sched_sessions, public.sched_players, public.sched_rooms, public.sched_jackpot to service_role;
  grant usage on sequence public.sched_sessions_id_seq to service_role;
  foreach f in array array[
    'sched_session(text, timestamptz)', 'sched_counts(bigint)', 'sched_join(uuid, text, timestamptz, int, numeric)',
    'sched_buy(uuid, text, timestamptz, text, int, numeric, int)', 'sched_leave(uuid, text, timestamptz)', 'sched_mine(uuid, bigint)',
    'sched_begin(bigint)', 'sched_median(numeric[])', 'sched_settle(bigint, int, boolean)', 'sched_sweep(text)',
    'sched_status(uuid, text, timestamptz)', 'sched_room(uuid, text, timestamptz, int)', 'sched_report(uuid, text, timestamptz, int, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

alter table public.sched_games enable row level security;
alter table public.sched_sessions enable row level security;
alter table public.sched_players enable row level security;
alter table public.sched_rooms enable row level security;
alter table public.sched_jackpot enable row level security;
