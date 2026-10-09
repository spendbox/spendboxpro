-- Newtown, part 22: game spending feeds the prize pool, ads pay for button taps, and a
-- 2-minute final countdown.
-- Run once in Supabase → SQL Editor, after 021_hourly_rounds.sql. Safe to run again.
-- If you ever run part 9, 13, 17 or 20 again, run this part again afterwards: those parts
-- hold older copies of functions this part replaces.
--
-- 1. Mint spent during a game goes into the prize pool of the game that's open right now
--    (joining or hunting), instead of disappearing:
--      * respawns (300 mint; they also count towards the ghost's share of the pool, like
--        moves, shields and decoys do)
--      * sports tickets
--      * the sportsbook's 10% cut of each match's betting pool
--    Searches, drone sweeps, moves, shields and decoys already went to the pool. When no game
--    is open at that moment, the mint is burned, as before. Levelling up still burns: it's
--    progression, not game spending. Houses aren't touched here.
--    Still burned on purpose: bonus mint spent on searches and sweeps (the free daily hunter
--    bonus can't turn into winnable mint), the stake penalties when a ghost is caught (stacked
--    beyond 3, linked accounts, new ghosts), the bank's share when a game pays out, and
--    winnings or refunds for accounts that were deleted.
--
--    Coin books: a prize pool is mint that's still held, so this is a transfer. The player's
--    ledger row ('respawn', 'ticket') is the same as before, now with the game's id, and a
--    'pool_fee' row with no player records which game's pool got it (where a 'burn' row used
--    to be). 'pool_fee' is neither created nor burned, so the books stay exact:
--      created − burned = held (coins + bonus_coins) + game_state carry + open round pools
--                         + stakes of bets not settled yet.
--
-- 2. Ads: opening an ad to look at it pays nothing and is a free view for the advertiser.
--    Tapping the ad's button pays the player (ad_view_reward, 5 mint, from the ad's pool) and
--    is the paid view advertisers pay for: once per ad per day, at most ad_rewards_per_day (5)
--    ads a day. The button is "Visit <brand>" when the ad has a link (the tap also counts as
--    a link click) and "Thanks, <brand>!" when it doesn't.
--      ad_open(ad, user, viewer) → { coins: 0, reward, left_today, reason }: counts the free
--        view; reward is what the button would pay this player now (0 with a reason when not).
--      ad_cta(ad, user, viewer)  → { coins, left_today, reason, clicked }: pays, counts.
--
-- 3. The final countdown is the last 2 minutes of the hunt (it was 5).
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings (notes only)
update public.game_settings set note = 'Mint to respawn (goes into the game''s prize pool)' where key = 'respawn_price';
update public.game_settings set note = 'Mint to watch one football match (goes into the open game''s prize pool; burned if no game is open)'
  where key = 'sports_ticket_football';
update public.game_settings set note = 'Mint to watch one basketball game (goes into the open game''s prize pool; burned if no game is open)'
  where key = 'sports_ticket_basketball';
update public.game_settings set note = 'Mint to watch one boxing fight (goes into the open game''s prize pool; burned if no game is open)'
  where key = 'sports_ticket_boxing';
update public.game_settings set note = 'Mint to watch one wrestling bout (goes into the open game''s prize pool; burned if no game is open)'
  where key = 'sports_ticket_wrestling';
update public.game_settings set note = 'Share of a match''s betting pool the house takes: it goes into the open game''s prize pool '
  || '(burned if no game is open). Never taken from the winners'' own stakes' where key = 'bet_burn_share';
update public.game_settings set note = 'Mint a signed-in player gets from an ad''s pool for tapping the ad''s button (a paid view). Looking is free'
  where key = 'ad_view_reward';
update public.game_settings set note = 'Most paid ad button taps per player per day (and only once per ad per day)'
  where key = 'ad_rewards_per_day';
update public.game_settings set note = 'Most looks one viewer can add to one ad''s free views per hour'
  where key = 'ad_free_opens_hourly';

-- ============================================================ the prize pool takes game spending
-- The game that's open right now (joining or hunting), locked so it can't pay out while mint
-- is going into its pool. Null when there's none.
-- Lock order everywhere: the open game first, then players (as searches and payouts do).
create or replace function public.open_pool_round() returns bigint
language sql volatile security definer set search_path = public as $$
  select id from public.rounds where status in ('join', 'seek') order by id limit 1 for update
$$;

-- Mint a player has already paid goes into this game's prize pool, or is burned when that game
-- isn't open (or p_round is null). Returns the game that got it (null = burned).
create or replace function public.pool_or_burn(p_round bigint, p_amount numeric, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_round bigint;
begin
  if coalesce(p_amount, 0) <= 0 then return null; end if;
  if p_round is not null then
    update public.rounds set pool = pool + p_amount where id = p_round and status in ('join', 'seek')
      returning id into v_round;
  end if;
  if v_round is null then
    perform public.burn(p_round, p_amount, p_note);
    return null;
  end if;
  perform public.log_coins(null, v_round, 'pool_fee', p_amount, false, p_note);
  return v_round;
end $$;

-- ============================================================ respawns (from part 9)
-- Respawn: level 20. Caught in the first 30 minutes of the hunt? Pay 300 mint (into the prize
-- pool) to drop back in somewhere random. Once per game, announced to everyone.
create or replace function public.respawn(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  p public.profiles;
  v_price numeric := public.setting('respawn_price');
  v_tile int;
  v_try int;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'You can only respawn while the hunt is on'; end if;
  select * into p from public.profiles where id = p_user for update;
  if p.is_bot then raise exception 'Unknown player'; end if;
  if p.level < public.setting('respawn_level') then raise exception 'Respawning unlocks at level %', public.setting('respawn_level')::int; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found or not e.caught then raise exception 'Only a caught hider can respawn'; end if;
  if e.respawned then raise exception 'You can only respawn once per game'; end if;
  if e.caught_at is null or e.caught_at > r.join_ends_at + make_interval(mins => public.setting('respawn_window_minutes')::int) then
    raise exception 'Respawning is only for players caught in the first % minutes', public.setting('respawn_window_minutes')::int;
  end if;
  if p.coins < v_price then raise exception 'You need % coins to respawn', v_price; end if;
  -- A random spot nobody has searched and no ghost is on, picked directly (no scan of the
  -- whole town, so it stays quick however big the town gets).
  for k in 1..200 loop
    v_try := floor(random() * r.tile_count)::int;
    if not exists (select 1 from public.searches s where s.round_id = r.id and s.tile = v_try)
       and not exists (select 1 from public.entries x where x.round_id = r.id and x.role = 'hider' and not x.caught and x.tile = v_try) then
      v_tile := v_try;
      exit;
    end if;
  end loop;
  if v_tile is null then raise exception 'There''s nowhere left to hide'; end if;
  update public.profiles set coins = coins - v_price, respawn_uses = respawn_uses + 1 where id = p_user;
  perform public.log_coins(p_user, r.id, 'respawn', -v_price);
  perform public.pool_or_burn(r.id, v_price, 'Respawn');
  -- The stake is gone (it was paid out when they were caught); what they paid to come back
  -- counts towards their share of the ghosts' pot, like moves, shields and decoys.
  update public.entries set caught = false, caught_by = null, respawned = true, respawned_at = now(),
         tile = v_tile, stake_weight = greatest(stake_weight - stake, 0) + v_price, stake = 0, payout = 0,
         frozen_until = null, last_move_at = now()
    where round_id = r.id and user_id = p_user;
  update public.rounds set hiders_remaining = hiders_remaining + 1 where id = r.id;
  insert into public.events (round_id, kind, tile, detail)
    values (r.id, 'respawn', null, jsonb_build_object('name', p.username, 'avatar', p.avatar));
  return jsonb_build_object('respawned', true, 'tile', v_tile, 'cost', v_price);
end $$;

-- ============================================================ sports tickets (from part 20)
-- Buy a ticket to watch a match. Once per match: asking again is free and says so. The price
-- goes into the open game's prize pool (burned if no game is open).
-- Returns { ok, already, price, balance, to_pool }.
create or replace function public.buy_ticket(p_user uuid, p_match text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_sport text := public.sports_sport(p_match);
  v_price numeric;
  v_round bigint;
  v_pool bigint;
begin
  if v_sport is null then raise exception 'That match doesn''t exist.'; end if;
  v_price := coalesce(public.setting('sports_ticket_' || v_sport), 0);
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'Please sign in again.'; end if;
  if p.is_bot then raise exception 'The bot can''t buy tickets.'; end if;
  if p.frozen then raise exception 'Your account is paused right now.'; end if;
  if exists (select 1 from public.sports_tickets where match_id = p_match and user_id = p_user) then
    return jsonb_build_object('ok', true, 'already', true, 'price', 0, 'balance', p.coins, 'to_pool', false);
  end if;
  -- Lock order: the open game first, then the player (and check again once locked).
  if v_price > 0 then v_round := public.open_pool_round(); end if;
  select * into p from public.profiles where id = p_user for update;
  if exists (select 1 from public.sports_tickets where match_id = p_match and user_id = p_user) then
    return jsonb_build_object('ok', true, 'already', true, 'price', 0, 'balance', p.coins, 'to_pool', false);
  end if;
  if p.coins < v_price then
    raise exception 'You need % coins for a ticket (you have %).', public.sports_n(v_price), public.sports_n(p.coins);
  end if;
  insert into public.sports_tickets (match_id, user_id, price) values (p_match, p_user, v_price);
  if v_price > 0 then
    update public.profiles set coins = coins - v_price where id = p_user;
    perform public.log_coins(p_user, v_round, 'ticket', -v_price, false, 'Ticket: ' || p_match);
    v_pool := public.pool_or_burn(v_round, v_price, 'Sports ticket: ' || p_match);
  end if;
  return jsonb_build_object('ok', true, 'already', false, 'price', v_price, 'balance', p.coins - v_price,
    'to_pool', v_pool is not null);
end $$;

-- ============================================================ settling (from part 20)
-- Pay out a finished match. Safe to call again and again: only the first call pays.
-- p_winner is the winning option ('home', 'draw', 'away', …), p_options every option the
-- match had. The house cut goes into the open game's prize pool (burned if no game is open).
-- Returns { match, winner, already, pool, winners_stake, cut, cut_round, paid, refunded, bets }.
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
  v_pool_round bigint;
  v_cut_round bigint;
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

  -- Lock order: the open game (which takes the house cut) before any player.
  v_pool_round := public.open_pool_round();

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
  v_cut_round := public.pool_or_burn(v_pool_round, v_cut, 'Sports house cut: ' || p_match);

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
    'winners_stake', v_win, 'cut', v_cut, 'cut_round', v_cut_round, 'paid', v_paid, 'refunded', v_refund, 'bets', v_bets);
end $$;

-- ============================================================ ads: looking is free, the button pays
-- Someone opened an ad (tapped a billboard to look at it). Looking never pays the player and
-- never costs the advertiser: it's a free view, counted at most ad_free_opens_hourly times per
-- viewer per ad per hour so one person can't pump the numbers.
-- Returns { coins: 0, reward, left_today, reason }: reward is what tapping the ad's button
-- would pay this player right now; when that's 0, reason says why: 'signed_out',
-- 'daily_limit', 'already_today' or 'pool_empty'.
create or replace function public.ad_open(p_ad uuid, p_user uuid default null, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(coalesce(nullif(p_viewer, ''), 'anon'), 128);
  v_reward numeric := public.setting('ad_view_reward');
  v_per_day int := public.setting('ad_rewards_per_day')::int;
  v_hourly int := coalesce(public.setting('ad_free_opens_hourly'), 5)::int;
  v_today int := 0;
  v_reason text;
  v_opens int;
  v_signed boolean := false;
  p public.profiles;
begin
  if not exists (select 1 from public.ads where id = p_ad and status in ('live', 'finished')) then
    raise exception 'That ad isn''t showing any more';
  end if;

  insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, p_ad, v_hour) on conflict do nothing;
  update public.ad_view_buckets set opens = opens + 1
    where viewer = v_viewer and ad_id = p_ad and hour = v_hour
    returning opens into v_opens;
  if v_opens <= v_hourly then
    update public.ads set free_views = free_views + 1, opens = opens + 1 where id = p_ad;
    insert into public.ad_daily (ad_id, day, free_views, opens) values (p_ad, current_date, 1, 1)
      on conflict (ad_id, day) do update set free_views = public.ad_daily.free_views + 1, opens = public.ad_daily.opens + 1;
  end if;

  -- Would the button pay this player now? (Nothing is paid here.)
  if p_user is not null then
    select * into p from public.profiles where id = p_user;
    v_signed := found and not p.is_bot and not p.frozen;
  end if;
  if not v_signed then
    v_reason := 'signed_out';
  else
    select count(*) into v_today from public.ad_open_rewards where user_id = p_user and day = current_date;
    if exists (select 1 from public.ad_open_rewards where user_id = p_user and ad_id = p_ad and day = current_date) then
      v_reason := 'already_today';
    elsif v_today >= v_per_day then
      v_reason := 'daily_limit';
    elsif v_reward <= 0 or not (select public.ad_is_paying(a) from public.ads a where a.id = p_ad) then
      v_reason := 'pool_empty';
    end if;
  end if;

  return jsonb_build_object('coins', 0, 'reward', case when v_reason is null then v_reward else 0 end, 'reason', v_reason,
    'left_today', case when v_signed then greatest(v_per_day - v_today, 0) else 0 end);
end $$;

-- Someone tapped the ad's button ("Visit <brand>", or "Thanks, <brand>!" when it has no link).
--   * A signed-in player gets ad_view_reward mint from the ad's pool: once per ad per day, at
--     most ad_rewards_per_day times a day, and only while the pool can pay. That's a paid
--     view: the thing advertisers pay for.
--   * Anyone else (or a player who can't be paid) gets nothing, and it costs nothing.
--   * When the ad has a link, the tap is also a link click (at most 5 per viewer per ad per hour).
-- Returns { coins, left_today, reason, clicked } where reason is null when paid, otherwise
-- 'signed_out', 'daily_limit', 'already_today' or 'pool_empty'.
create or replace function public.ad_cta(p_ad uuid, p_user uuid default null, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reward numeric := public.setting('ad_view_reward');
  v_per_day int := public.setting('ad_rewards_per_day')::int;
  v_today int := 0;
  v_paid numeric := 0;
  v_reason text;
  v_signed boolean := false;
  v_clicked boolean := false;
  p public.profiles;
  a public.ads;
begin
  if not exists (select 1 from public.ads where id = p_ad and status in ('live', 'finished')) then
    raise exception 'That ad isn''t showing any more';
  end if;

  if p_user is not null then
    -- Lock order everywhere: the player first, then the ad.
    select * into p from public.profiles where id = p_user for update;
    v_signed := found and not p.is_bot and not p.frozen;
  end if;

  if not v_signed then
    v_reason := 'signed_out';
  else
    select count(*) into v_today from public.ad_open_rewards where user_id = p_user and day = current_date;
    if exists (select 1 from public.ad_open_rewards where user_id = p_user and ad_id = p_ad and day = current_date) then
      v_reason := 'already_today';
    elsif v_today >= v_per_day then
      v_reason := 'daily_limit';
    else
      select * into a from public.ads where id = p_ad for update;
      if v_reward <= 0 or not public.ad_is_paying(a) then
        v_reason := 'pool_empty';
      else
        -- (ad_open_rewards now records paid button taps: one per player per ad per day.)
        insert into public.ad_open_rewards (user_id, ad_id, day, coins) values (p_user, p_ad, current_date, v_reward);
        -- (The ads trigger marks the ad finished once its pool can't pay another reward.)
        update public.ads set coins_left = coins_left - v_reward, rewarded_views = rewarded_views + 1 where id = p_ad;
        insert into public.ad_daily (ad_id, day, views) values (p_ad, current_date, 1)
          on conflict (ad_id, day) do update set views = public.ad_daily.views + 1;
        update public.profiles set coins = coins + v_reward where id = p_user;
        perform public.log_coins(p_user, null, 'ad_reward', v_reward, false, 'Tapped an ad: ' || a.brand);
        v_paid := v_reward;
        v_today := v_today + 1;
      end if;
    end if;
  end if;

  -- "Visit <brand>" is a link click too (ad_click ignores ads without a link).
  v_clicked := coalesce((public.ad_click(p_ad, p_viewer) ->> 'counted')::boolean, false);

  return jsonb_build_object('coins', v_paid, 'reason', v_reason, 'clicked', v_clicked,
    'left_today', case when v_signed then greatest(v_per_day - v_today, 0) else 0 end);
end $$;

-- ============================================================ a 2-minute final countdown
update public.world_event_kinds set minutes = 2 where key = 'final_countdown';
-- Countdowns already planned for a game that's still on move to its last 2 minutes.
update public.world_events w set starts_at = w.ends_at - interval '2 minutes'
  from public.rounds r
 where r.id = w.round_id and r.status <> 'done' and w.key = 'final_countdown' and not w.started
   and w.ends_at - w.starts_at <> interval '2 minutes';

-- Picks this hunt's events: 2–4 kinds at random times (at least one, never two of a kind).
-- (From part 17; the final countdown now takes the last 2 minutes, its length in the catalog.)
create or replace function public.plan_world_events(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_count int;
  v_n int := 0;
  v_hunt int;
  k record;
  v_start timestamptz;
  v_detail jsonb;
  v_target record;
  v_final int;
begin
  select * into r from public.rounds where id = p_round;
  if not found or exists (select 1 from public.world_events where round_id = p_round) then return 0; end if;
  v_hunt := greatest(5, floor(extract(epoch from (r.seek_ends_at - r.join_ends_at)) / 60)::int);
  v_count := public.setting('world_events_min')::int
             + floor(random() * (public.setting('world_events_max') - public.setting('world_events_min') + 1))::int;
  v_count := greatest(1, v_count);
  for k in
    select * from public.world_event_kinds
    where key <> 'final_countdown'
    order by (case when twist then random() * (1 - public.setting('world_event_twist_share')) * 2
                   else random() * public.setting('world_event_twist_share') * 2 end) desc
    limit v_count
  loop
    -- Somewhere in the hunt, not in the first 2 minutes, finished before the end.
    v_start := r.join_ends_at + make_interval(secs => (120 + floor(random() * greatest(60, (v_hunt - k.minutes - 3) * 60 - 120)))::int);
    v_detail := '{}'::jsonb;
    if k.key = 'bounty_board' then
      select e.user_id, p.username into v_target from public.entries e join public.profiles p on p.id = e.user_id
        where e.round_id = p_round and e.role = 'hider' and not e.caught and not p.is_bot order by random() limit 1;
      if v_target.user_id is null then continue; end if;
      v_detail := jsonb_build_object('user', v_target.user_id, 'name', v_target.username);
    end if;
    insert into public.world_events (round_id, key, tile, radius, starts_at, ends_at, reward_coins, reward_slots, detail)
      values (p_round, k.key, floor(random() * r.tile_count)::int, k.radius, v_start,
              v_start + make_interval(mins => k.minutes), k.reward_coins, k.reward_slots, v_detail);
    v_n := v_n + 1;
  end loop;
  -- Sometimes the last 2 minutes get the final-countdown treatment.
  if random() < 0.35 then
    select minutes into v_final from public.world_event_kinds where key = 'final_countdown';
    insert into public.world_events (round_id, key, tile, starts_at, ends_at)
      values (p_round, 'final_countdown', 0, r.seek_ends_at - make_interval(mins => coalesce(v_final, 2)), r.seek_ends_at);
    v_n := v_n + 1;
  end if;
  -- Always at least one.
  if v_n = 0 then
    insert into public.world_events (round_id, key, tile, starts_at, ends_at)
      values (p_round, 'street_party', floor(random() * r.tile_count)::int, r.join_ends_at + interval '10 minutes', r.join_ends_at + interval '16 minutes');
    v_n := 1;
  end if;
  return v_n;
end $$;

-- ============================================================ privacy & access
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('open_pool_round', 'pool_or_burn', 'respawn', 'buy_ticket', 'settle_match', 'ad_open', 'ad_cta', 'plan_world_events')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
