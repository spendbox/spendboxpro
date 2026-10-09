-- HIDE & SEEK, part 20: the stadium. Pay to watch simulated matches (football, basketball,
-- boxing, wrestling) and bet coins on who wins.
-- Run once in Supabase → SQL Editor, after 019_activities.sql.
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- - The matches themselves are made up by the app (src/lib/sports/): every match has an id like
--   "football:12345", a kick-off time and a short list of things to bet on (home, draw, away…).
--   The database doesn't know the schedule, so the server passes the kick-off time and the
--   allowed options in with every bet, and the final result when a match is over.
-- - Tickets: watching a match costs sports_ticket_<sport> coins (20 for football, 15 for the
--   rest), once per match. The price is burned.
-- - Bets: bet_min–bet_max whole coins (10–500), at most bet_max on one match in total and
--   bet_daily_max (2,000) a day, only until kick-off. Several bets on one match are fine.
-- - Settling (pari-mutuel): all the coins bet on a match make the pool. The house keeps
--   bet_burn_share (10%) of it, which is burned, and the rest is shared between the winning bets
--   in proportion to their stakes (whole coins; any coin left over from rounding goes to the
--   biggest winning stakes). The house cut never comes out of the winners' own stakes, so a
--   winning bet always gets at least its coins back. If nobody picked the winner, or everyone
--   bet on the same thing, every bet is refunded in full and nothing is burned.
--
-- Coin books: bets and tickets never create coins. Placing a bet moves coins from the player into
-- the match's pool ('bet', negative), which holds them until the match is settled; winnings
-- ('bet_win') and refunds ('bet_refund') move them back out to players, and the house cut and
-- ticket prices are burned ('burn', with a note; the player's side of a ticket is 'ticket').
-- None of these are "created" kinds in coin_supply_daily. So from now on:
--   created − burned = coins held by players (coins + bonus_coins) + game_state carry
--                      + open round pools + stakes of bets not settled yet.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('sports_ticket_football',   20,   'Coins to watch one football match (burned)'),
  ('sports_ticket_basketball', 15,   'Coins to watch one basketball game (burned)'),
  ('sports_ticket_boxing',     15,   'Coins to watch one boxing fight (burned)'),
  ('sports_ticket_wrestling',  15,   'Coins to watch one wrestling bout (burned)'),
  ('bet_min',                  10,   'Smallest bet on a match'),
  ('bet_max',                  500,  'Most one player can bet on one match (all their bets on it together)'),
  ('bet_daily_max',            2000, 'Most one player can bet in a day (all matches together)'),
  ('bet_burn_share',           0.10, 'Share of a match''s betting pool the house keeps (burned). Never taken from the winners'' own stakes')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
-- Who bought a ticket to watch which match (one each).
create table if not exists public.sports_tickets (
  match_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  price numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index if not exists sports_tickets_user_idx on public.sports_tickets (user_id, created_at desc);

-- Every bet. user_id goes empty if the player deletes their account: the stake stays in the
-- pool, and anything it would have won is burned instead.
create table if not exists public.sports_bets (
  id bigserial primary key,
  match_id text not null,
  user_id uuid references public.profiles (id) on delete set null,
  option text not null,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  settled boolean not null default false,
  payout numeric(14,2)
);
create index if not exists sports_bets_match_idx on public.sports_bets (match_id, option);
create index if not exists sports_bets_user_idx on public.sports_bets (user_id, created_at desc);
create index if not exists sports_bets_open_idx on public.sports_bets (match_id) where not settled;

-- Finished matches that have been settled (one row each).
create table if not exists public.sports_results (
  match_id text primary key,
  winner text not null,
  score text,
  summary text,
  pool numeric(14,2) not null default 0,     -- all the coins bet on it
  cut numeric(14,2) not null default 0,      -- burned by the house
  paid numeric(14,2) not null default 0,     -- paid back to players (winnings or refunds)
  refunded boolean not null default false,   -- everyone got their stake back
  settled_at timestamptz not null default now()
);

-- ============================================================ helpers
-- 1234.5 → '1,234' (for friendly messages).
create or replace function public.sports_n(p numeric) returns text
language sql immutable as $$ select to_char(floor(coalesce(p, 0)), 'FM999,999,999,990') $$;

-- The sport a match id belongs to ('football:12345' → 'football'), or null if it isn't one.
create or replace function public.sports_sport(p_match text) returns text
language sql immutable as $$
  select case when p_match ~ '^(football|basketball|boxing|wrestling):[A-Za-z0-9_-]{1,40}$'
              then split_part(p_match, ':', 1) end
$$;

-- Only one bet or settlement on the same match at a time.
create or replace function public.sports_lock(p_match text) returns void
language sql as $$ select pg_advisory_xact_lock(hashtextextended('sports:' || p_match, 0)) $$;

-- Coins bet on each option of a match: { "home": 120, "away": 40 }.
create or replace function public.match_pool(p_match text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(option, total), '{}'::jsonb)
  from (select option, sum(amount) as total from public.sports_bets where match_id = p_match group by option) x
$$;

-- ============================================================ tickets
-- Buy a ticket to watch a match. Once per match: asking again is free and says so.
-- Returns { ok, already, price, balance }.
create or replace function public.buy_ticket(p_user uuid, p_match text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_sport text := public.sports_sport(p_match);
  v_price numeric;
begin
  if v_sport is null then raise exception 'That match doesn''t exist.'; end if;
  v_price := coalesce(public.setting('sports_ticket_' || v_sport), 0);
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'Please sign in again.'; end if;
  if p.is_bot then raise exception 'The bot can''t buy tickets.'; end if;
  if p.frozen then raise exception 'Your account is paused right now.'; end if;
  if exists (select 1 from public.sports_tickets where match_id = p_match and user_id = p_user) then
    return jsonb_build_object('ok', true, 'already', true, 'price', 0, 'balance', p.coins);
  end if;
  if p.coins < v_price then
    raise exception 'You need % coins for a ticket (you have %).', public.sports_n(v_price), public.sports_n(p.coins);
  end if;
  insert into public.sports_tickets (match_id, user_id, price) values (p_match, p_user, v_price);
  if v_price > 0 then
    update public.profiles set coins = coins - v_price where id = p_user;
    perform public.log_coins(p_user, null, 'ticket', -v_price, false, 'Ticket: ' || p_match);
    perform public.burn(null, v_price, 'Sports ticket: ' || p_match);
  end if;
  return jsonb_build_object('ok', true, 'already', false, 'price', v_price, 'balance', p.coins - v_price);
end $$;

-- ============================================================ bets
-- Bet coins on one option of a match. The server passes the match's kick-off time and the
-- options people may bet on (from the schedule). Returns
-- { ok, id, option, amount, pool, mine (this player's total on the match), left_today, balance }.
create or replace function public.place_bet(
  p_user uuid, p_match text, p_option text, p_amount numeric, p_kickoff timestamptz, p_options text[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_min numeric := public.setting('bet_min');
  v_max numeric := public.setting('bet_max');
  v_day_max numeric := public.setting('bet_daily_max');
  v_today numeric;
  v_match numeric;
  v_id bigint;
  v_pool jsonb;
begin
  if public.sports_sport(p_match) is null or p_kickoff is null then raise exception 'That match doesn''t exist.'; end if;
  if p_options is null or p_option is null or not (p_option = any(p_options)) then
    raise exception 'Pick who you think will win.';
  end if;
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount < v_min or p_amount > v_max then
    raise exception 'Bet between % and % whole coins.', public.sports_n(v_min), public.sports_n(v_max);
  end if;
  perform public.sports_lock(p_match);
  if now() >= p_kickoff or exists (select 1 from public.sports_results where match_id = p_match) then
    raise exception 'Bets are closed: it''s kicked off';
  end if;

  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'Please sign in again.'; end if;
  if p.is_bot then raise exception 'The bot can''t bet.'; end if;
  if p.frozen then raise exception 'Your account is paused right now.'; end if;

  select coalesce(sum(amount), 0) into v_match from public.sports_bets where match_id = p_match and user_id = p_user;
  if v_match + p_amount > v_max then
    if v_max - v_match < v_min then
      raise exception 'You''ve bet the most allowed on this match (% coins).', public.sports_n(v_max);
    end if;
    raise exception 'You can bet % more coins on this match.', public.sports_n(v_max - v_match);
  end if;
  select coalesce(sum(amount), 0) into v_today from public.sports_bets
   where user_id = p_user and created_at >= date_trunc('day', now());
  if v_today + p_amount > v_day_max then
    if v_day_max - v_today < v_min then
      raise exception 'That''s today''s betting limit (% coins). Come back tomorrow!', public.sports_n(v_day_max);
    end if;
    raise exception 'You can bet % more coins today.', public.sports_n(v_day_max - v_today);
  end if;
  if p.coins < p_amount then
    raise exception 'You need % coins for that bet (you have %).', public.sports_n(p_amount), public.sports_n(p.coins);
  end if;

  update public.profiles set coins = coins - p_amount where id = p_user;
  perform public.log_coins(p_user, null, 'bet', -p_amount, false, format('Bet on %s: %s', p_option, p_match));
  insert into public.sports_bets (match_id, user_id, option, amount) values (p_match, p_user, p_option, p_amount)
  returning id into v_id;

  -- Every allowed option, with 0 for the ones nobody has backed yet.
  v_pool := public.match_pool(p_match);
  select jsonb_object_agg(o, coalesce((v_pool ->> o)::numeric, 0)) into v_pool from unnest(p_options) o;
  return jsonb_build_object('ok', true, 'id', v_id, 'option', p_option, 'amount', p_amount, 'pool', v_pool,
    'mine', v_match + p_amount, 'left_today', v_day_max - v_today - p_amount, 'balance', p.coins - p_amount);
end $$;

-- ============================================================ settling
-- Pay out a finished match. Safe to call again and again: only the first call pays.
-- p_winner is the winning option ('home', 'draw', 'away', …), p_options every option the
-- match had. Returns { match, winner, already, pool, winners_stake, cut, paid, refunded, bets }.
create or replace function public.settle_match(
  p_match text, p_winner text, p_score text, p_summary text, p_options text[] default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.sports_results;
  v_total numeric;
  v_win numeric;
  v_sides int;
  v_bets int;
  v_share numeric := least(greatest(coalesce(public.setting('bet_burn_share'), 0), 0), 1);
  v_cut numeric := 0;
  v_pot numeric;
  v_paid numeric := 0;
  v_left numeric;
  v_refund boolean;
  v_round bigint;
  v_score text := nullif(btrim(left(coalesce(p_score, ''), 80)), '');
  x record;
begin
  if public.sports_sport(p_match) is null then raise exception 'That match doesn''t exist.'; end if;
  if p_winner is null or (p_options is not null and not (p_winner = any(p_options))) then
    raise exception 'Unknown winner % for %', p_winner, p_match;
  end if;
  perform public.sports_lock(p_match);

  select * into r from public.sports_results where match_id = p_match;
  if found then
    -- Already settled. A stray bet that somehow slipped in afterwards just gets its coins back.
    for x in select * from public.sports_bets where match_id = p_match and not settled order by user_id, id for update loop
      update public.sports_bets set settled = true, payout = x.amount where id = x.id;
      if x.user_id is not null then
        update public.profiles set coins = coins + x.amount where id = x.user_id;
        perform public.log_coins(x.user_id, null, 'bet_refund', x.amount, false, 'Bet refunded: ' || p_match);
      else
        perform public.burn(null, x.amount, 'Sports bet refund (account gone): ' || p_match);
      end if;
    end loop;
    return jsonb_build_object('match', p_match, 'winner', r.winner, 'already', true, 'pool', r.pool, 'cut', r.cut,
      'paid', r.paid, 'refunded', r.refunded);
  end if;

  -- The open bets (locked). Their payout column is worked out first, then everyone is paid.
  perform 1 from public.sports_bets where match_id = p_match and not settled for update;
  select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where option = p_winner), 0),
         count(distinct option), count(*)
    into v_total, v_win, v_sides, v_bets
    from public.sports_bets where match_id = p_match and not settled;
  v_refund := v_total > 0 and (v_win = 0 or v_sides = 1);

  if v_refund then
    update public.sports_bets set payout = amount where match_id = p_match and not settled;
  elsif v_total > 0 then
    -- The house cut: bet_burn_share of the pool, but never more than the losing stakes.
    v_cut := least(floor(v_total * v_share), v_total - v_win);
    v_pot := v_total - v_cut;
    update public.sports_bets
       set payout = case when option = p_winner then floor(v_pot * amount / v_win) else 0 end
     where match_id = p_match and not settled;
    -- Coins left over from rounding down: one each to the biggest winning stakes (earliest first).
    select v_pot - coalesce(sum(payout), 0) into v_left from public.sports_bets where match_id = p_match and not settled;
    if floor(v_left) > 0 then
      update public.sports_bets set payout = payout + 1
       where id in (select id from public.sports_bets where match_id = p_match and not settled and option = p_winner
                     order by amount desc, id limit floor(v_left)::int);
    end if;
  end if;
  select coalesce(sum(payout), 0) into v_paid from public.sports_bets where match_id = p_match and not settled;
  v_cut := v_total - v_paid;  -- exactly what isn't paid back (a fraction of a coin included, if any)
  perform public.burn(null, v_cut, 'Sports house cut: ' || p_match);

  -- Pay each player once (in id order, so two settlements never wait on each other).
  select max(id) into v_round from public.rounds;
  for x in select user_id, sum(payout) as payout from public.sports_bets
            where match_id = p_match and not settled group by user_id order by user_id loop
    if x.user_id is null then
      perform public.burn(null, x.payout, 'Sports winnings (account gone): ' || p_match);
      continue;
    end if;
    if x.payout > 0 then
      update public.profiles set coins = coins + x.payout where id = x.user_id;
      perform public.log_coins(x.user_id, null, case when v_refund then 'bet_refund' else 'bet_win' end, x.payout, false,
        case when v_refund then 'Bet refunded: ' else 'Bet won: ' end || p_match);
    end if;
    perform public.notify(x.user_id, v_round, 'sports', case
      when v_refund then format('Bet refunded: %s coins back (%s).', public.sports_n(x.payout),
                                case when v_sides = 1 then 'everyone backed the same side' else 'nobody picked the winner' end)
      when x.payout > 0 then format('You won your bet! +%s coins%s.', public.sports_n(x.payout), coalesce(' (' || v_score || ')', ''))
      else format('Your bet lost%s. Better luck next match!', coalesce(' (' || v_score || ')', '')) end);
  end loop;
  update public.sports_bets set settled = true where match_id = p_match and not settled;

  insert into public.sports_results (match_id, winner, score, summary, pool, cut, paid, refunded)
  values (p_match, p_winner, v_score, left(p_summary, 500), v_total, v_cut, v_paid, v_refund);
  return jsonb_build_object('match', p_match, 'winner', p_winner, 'already', false, 'pool', v_total,
    'winners_stake', v_win, 'cut', v_cut, 'paid', v_paid, 'refunded', v_refund, 'bets', v_bets);
end $$;

-- ============================================================ what the app shows
-- For the match feed: the pool, whether this player holds a ticket, and whether it's settled.
-- Returns { pool, ticket, settled }.
create or replace function public.match_state(p_match text, p_user uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pool', public.match_pool(p_match),
    'ticket', p_user is not null and exists (select 1 from public.sports_tickets where match_id = p_match and user_id = p_user),
    'settled', exists (select 1 from public.sports_results where match_id = p_match))
$$;

-- For the sportsbook: several matches at once, plus the player's coins and the rules. Returns
-- { pools: { match: { option: coins } }, mine: { match: { option: coins } }, tickets: [match…],
--   settled: [match…], coins, today (coins bet today), limits: { min, max, daily_max, burn_share },
--   prices: { sport: ticket price } }.
create or replace function public.sports_board(p_user uuid, p_matches text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pools', (select coalesce(jsonb_object_agg(m, public.match_pool(m)), '{}'::jsonb) from unnest(p_matches[1:20]) m),
    'mine', (select coalesce(jsonb_object_agg(match_id, opts), '{}'::jsonb) from (
               select match_id, jsonb_object_agg(option, total) as opts from (
                 select match_id, option, sum(amount) as total from public.sports_bets
                  where p_user is not null and user_id = p_user and match_id = any(p_matches[1:20])
                  group by match_id, option) a
                group by match_id) b),
    'tickets', (select coalesce(jsonb_agg(match_id), '[]'::jsonb) from public.sports_tickets
                 where p_user is not null and user_id = p_user and match_id = any(p_matches[1:20])),
    'settled', (select coalesce(jsonb_agg(match_id), '[]'::jsonb) from public.sports_results where match_id = any(p_matches[1:20])),
    'coins', (select coins from public.profiles where id = p_user),
    'today', (select coalesce(sum(amount), 0) from public.sports_bets
               where p_user is not null and user_id = p_user and created_at >= date_trunc('day', now())),
    'limits', jsonb_build_object('min', public.setting('bet_min'), 'max', public.setting('bet_max'),
                                 'daily_max', public.setting('bet_daily_max'), 'burn_share', public.setting('bet_burn_share')),
    'prices', jsonb_build_object('football', public.setting('sports_ticket_football'),
                                 'basketball', public.setting('sports_ticket_basketball'),
                                 'boxing', public.setting('sports_ticket_boxing'),
                                 'wrestling', public.setting('sports_ticket_wrestling')))
$$;

-- A player's last 30 bets, newest first, with how they ended:
-- [{ id, match, option, amount, at, settled, payout, winner, score, refunded }].
create or replace function public.my_bets(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'match', b.match_id, 'option', b.option, 'amount', b.amount, 'at', b.created_at,
           'settled', b.settled, 'payout', b.payout, 'winner', r.winner, 'score', r.score, 'refunded', coalesce(r.refunded, false))
         order by b.id desc), '[]'::jsonb)
  from (select * from public.sports_bets where user_id = p_user order by id desc limit 30) b
  left join public.sports_results r on r.match_id = b.match_id
$$;

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['sports_tickets', 'sports_bets', 'sports_results'] loop
    execute format('alter table public.%I enable row level security', t);  -- no policies: only the server reads them
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  revoke all on sequence public.sports_bets_id_seq from public, anon, authenticated;
  grant usage, select on sequence public.sports_bets_id_seq to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('sports_n', 'sports_sport', 'sports_lock', 'match_pool', 'buy_ticket', 'place_bet', 'settle_match',
            'match_state', 'sports_board', 'my_bets')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
