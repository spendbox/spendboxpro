-- HIDE & SEEK, part 7: fairer payouts, a clean pool every round, shields, longer drone
-- freezes and passive income.
-- Run once in Supabase → SQL Editor, after 006_avatars_badges_balloons.sql.
--
-- - Every round's pool starts at 0. Nothing carries over, and the bot no longer gets coins
--   (its moves are free and add nothing to the pool).
-- - At the end of a round the pool is split 80 / 10 / 10:
--     someone survived  → survivors 80% (plus their stake back), seekers 10%, 10% burns;
--     everyone was found → seekers 80% (by what they spent), the hiders who played 10%, 10% burns.
-- - Hiders can buy a one-time shield (100 coins). While it's up they can't move. When a seeker
--   finds them, the seeker is still paid and the hider still loses their stake, but the shield
--   teleports them to a nearby free spot and they stay in the game.
-- - A drone sweep pins hiders for 1 minute.
-- - Passive income: players under 100 coins slowly earn coins back, up to 100 in 24 hours.

insert into public.game_settings (key, value, note) values
  ('pool_win_share', 0.8, 'Share of the pool for the winning side (survivors, or seekers if everyone was found)'),
  ('pool_other_share', 0.1, 'Share of the pool for the other side (the rest burns)'),
  ('shield_price', 100, 'A hider''s one-time shield'),
  ('passive_target', 100, 'Passive income tops players up towards this many coins'),
  ('passive_per_day', 100, 'Most passive income per player in 24 hours')
on conflict (key) do nothing;
update public.game_settings set value = 60 where key = 'sweep_freeze_seconds';
-- The old daily top-up is replaced by passive income.
update public.game_settings set value = 0 where key = 'topup_floor';

alter table public.entries add column if not exists shield_bought boolean not null default false;
alter table public.entries add column if not exists shield_saved boolean not null default false;
alter table public.profiles add column if not exists passive_at timestamptz;

-- ============================================================ no more carry-over, no bot coins
do $$
declare v_carry numeric; v_bot numeric;
begin
  select value into v_carry from public.game_state where key = 'carry';
  if coalesce(v_carry, 0) > 0 then
    perform public.burn(null, v_carry, 'carry-over retired');
    update public.game_state set value = 0 where key = 'carry';
  end if;
  select coins into v_bot from public.profiles where id = '00000000-0000-0000-0000-00000000b07a';
  if coalesce(v_bot, 0) > 0 then
    perform public.burn(null, v_bot, 'bot coins retired');
    update public.profiles set coins = 0 where id = '00000000-0000-0000-0000-00000000b07a';
  end if;
end $$;

create or replace function public.tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  v_id bigint;
  v_join int := public.setting('join_minutes')::int;
  v_seek int := public.setting('seek_minutes')::int;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status <> 'done' for update;

  if not found then
    -- A fresh city with an empty pool.
    insert into public.rounds (join_ends_at, seek_ends_at, pool, tile_count, hiders_total, hiders_remaining, bot_name)
    values (now() + make_interval(mins => v_join),
            now() + make_interval(mins => v_join + v_seek),
            0, public.setting('base_tiles')::int, 1, 1, 'Seed Bot')
    returning id into v_id;
    update public.rounds set bot_name = coalesce(
      (select name from public.bot_names order by id offset (v_id % greatest((select count(*) from public.bot_names), 1)) limit 1),
      'Seed Bot') where id = v_id;
    insert into public.entries (round_id, user_id, role) values (v_id, v_bot, 'hider');
    return 'round created';
  end if;

  if r.status = 'join' and now() >= r.join_ends_at then
    with t as (
      select g, row_number() over (order by random()) rn from generate_series(0, r.tile_count - 1) g
    ), h as (
      select user_id, row_number() over (order by random()) rn
      from public.entries where round_id = r.id and role = 'hider'
    )
    update public.entries e set tile = t.g
    from h join t on t.rn = h.rn
    where e.round_id = r.id and e.user_id = h.user_id;
    update public.rounds set status = 'seek' where id = r.id;
    v_out := 'seeking started';
    r.status := 'seek';
  end if;

  if r.status = 'seek' and now() >= r.seek_ends_at then
    perform public.finalize_round(r.id);
    return 'round finished';
  end if;

  if r.status = 'seek' then
    begin
      v_out := v_out || ' / bot: ' || public.bot_think(r.id);
    exception when others then
      v_out := v_out || ' / bot error: ' || sqlerrm;
    end;
  end if;
  return v_out;
end $$;

-- ============================================================ payouts: 80 / 10 / 10
create or replace function public.finalize_round(p_round bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_win numeric;
  v_other numeric;
  v_cap numeric := public.setting('seeker_share_cap');
  v_survivors int;
  v_paid numeric := 0;
  v_hider_pot numeric;
  v_seeker_pot numeric;
  v_w numeric;
  v_share numeric;
  x record;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or r.status = 'done' then return; end if;
  update public.rounds set status = 'done', finished_at = now() where id = p_round;

  v_win := round(r.pool * public.setting('pool_win_share'), 2);
  v_other := round(r.pool * public.setting('pool_other_share'), 2);

  -- Real players still hidden (the bot never takes a share).
  select count(*) into v_survivors
    from public.entries e join public.profiles p on p.id = e.user_id
    where e.round_id = p_round and e.role = 'hider' and not e.caught and not p.is_bot;

  -- Survivors get their stake back.
  for x in select e.user_id, e.stake from public.entries e join public.profiles p on p.id = e.user_id
           where e.round_id = p_round and e.role = 'hider' and not e.caught and not p.is_bot and e.stake > 0 loop
    update public.profiles set coins = coins + x.stake where id = x.user_id;
    perform public.log_coins(x.user_id, p_round, 'stake_return', x.stake);
  end loop;

  if v_survivors > 0 then
    v_hider_pot := v_win;    -- survivors win
    v_seeker_pot := v_other;
  else
    v_hider_pot := v_other;  -- everyone was found: seekers win
    v_seeker_pot := v_win;
  end if;

  -- Hiders' pot: survivors if any, otherwise every real hider who played. Split by what they
  -- put in (stake, moves, shield).
  select coalesce(sum(greatest(e.stake_weight, 1)), 0) into v_w
    from public.entries e join public.profiles p on p.id = e.user_id
    where e.round_id = p_round and e.role = 'hider' and not p.is_bot and (v_survivors = 0 or not e.caught);
  if v_w > 0 and v_hider_pot > 0 then
    for x in select e.user_id, greatest(e.stake_weight, 1) w
             from public.entries e join public.profiles p on p.id = e.user_id
             where e.round_id = p_round and e.role = 'hider' and not p.is_bot and (v_survivors = 0 or not e.caught) loop
      v_share := round(v_hider_pot * x.w / v_w, 2);
      update public.profiles set coins = coins + v_share where id = x.user_id;
      update public.entries set payout = payout + v_share where round_id = p_round and user_id = x.user_id;
      perform public.log_coins(x.user_id, p_round, 'pool_hider', v_share);
      v_paid := v_paid + v_share;
    end loop;
  end if;

  -- Seekers' pot, in proportion to real coins spent (capped per person). Bonus coins never count.
  select coalesce(sum(least(real_spent, v_cap)), 0) into v_w
    from public.entries where round_id = p_round and role = 'seeker' and real_spent > 0;
  if v_w > 0 and v_seeker_pot > 0 then
    for x in select user_id, least(real_spent, v_cap) w from public.entries
             where round_id = p_round and role = 'seeker' and real_spent > 0 loop
      v_share := round(v_seeker_pot * x.w / v_w, 2);
      update public.profiles set coins = coins + v_share where id = x.user_id;
      update public.entries set payout = payout + v_share where round_id = p_round and user_id = x.user_id;
      perform public.log_coins(x.user_id, p_round, 'pool_seeker', v_share);
      v_paid := v_paid + v_share;
    end loop;
  end if;

  -- The bank's 10%, any pot nobody could take, and rounding dust burn. Nothing carries over.
  perform public.burn(p_round, r.pool - v_paid, 'bank');

  update public.profiles set hider_rounds = hider_rounds + 1
    where not is_bot and id in (select user_id from public.entries where round_id = p_round and role = 'hider');
  update public.profiles set seeker_rounds = seeker_rounds + 1
    where id in (select user_id from public.entries where round_id = p_round and role = 'seeker');
end $$;

-- ============================================================ paying for a find
-- The money side of a find (same rules as catch_hider), without marking anyone caught.
create or replace function public.pay_for_find(p_round bigint, p_hider uuid, p_finder uuid, p_index int default 1)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  h record;
  v_share numeric := 0;
begin
  select e.stake, pr.hider_rounds into h
    from public.entries e join public.profiles pr on pr.id = e.user_id
    where e.round_id = p_round and e.user_id = p_hider;
  if coalesce(h.stake, 0) <= 0 then return 0; end if;
  if p_index > 3 then
    perform public.burn(p_round, h.stake, 'stacked stake beyond 3');
  elsif public.linked_accounts(p_finder, p_hider) then
    insert into public.flags (round_id, finder_id, hider_id, reason) values (p_round, p_finder, p_hider, 'linked accounts');
    perform public.burn(p_round, h.stake * public.setting('finder_share'), 'linked accounts: no payout');
    update public.rounds set pool = pool + h.stake * (1 - public.setting('finder_share')) where id = p_round;
  elsif h.hider_rounds < public.setting('new_hider_rounds') then
    v_share := round(h.stake * public.setting('new_hider_finder_share'), 2);
    perform public.burn(p_round, h.stake - v_share, 'new hider stake');
    perform public.log_coins(p_finder, p_round, 'catch_reward', v_share);
  else
    v_share := round(h.stake * public.setting('finder_share'), 2);
    update public.rounds set pool = pool + (h.stake - v_share) where id = p_round;
    perform public.log_coins(p_finder, p_round, 'catch_reward', v_share);
  end if;
  if v_share > 0 then
    update public.profiles set coins = coins + v_share where id = p_finder;
  end if;
  return v_share;
end $$;

-- ============================================================ shields
create or replace function public.buy_shield(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_price numeric := public.setting('shield_price');
begin
  select * into r from public.rounds where status <> 'done' for update;
  if not found then raise exception 'No round is on right now'; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found then raise exception 'Only hiders can use a shield'; end if;
  if e.caught then raise exception 'You have been caught'; end if;
  if e.shield_bought then raise exception 'You can only use one shield per game'; end if;
  update public.profiles set coins = coins - v_price where id = p_user and coins >= v_price and not is_bot;
  if not found then raise exception 'You need % coins for a shield', v_price; end if;
  perform public.log_coins(p_user, r.id, 'shield', -v_price);
  update public.rounds set pool = pool + v_price where id = r.id;
  update public.entries set shield_bought = true, stake_weight = stake_weight + v_price
    where round_id = r.id and user_id = p_user;
  return jsonb_build_object('shield', true, 'cost', v_price);
end $$;

-- A shielded hider was found: the seeker is paid and the stake is gone, but the hider pops up
-- on a free spot nearby and plays on. Returns what the finder earned.
create or replace function public.shield_save(p_round bigint, p_hider uuid, p_finder uuid, p_index int) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  e public.entries;
  r public.rounds;
  v_share numeric;
  v_to int;
  v_radius int;
begin
  select * into r from public.rounds where id = p_round;
  select * into e from public.entries where round_id = p_round and user_id = p_hider for update;
  v_share := public.pay_for_find(p_round, p_hider, p_finder, p_index);
  -- Somewhere close that nobody's hiding in (it might have been searched: the shield can't tell).
  foreach v_radius in array array[2, 4, 8] loop
    select g into v_to from generate_series(0, r.tile_count - 1) g
      where g <> e.tile and public.in_area(g, e.tile, v_radius)
        and not exists (select 1 from public.entries x where x.round_id = p_round and x.role = 'hider' and not x.caught and x.tile = g)
      order by random() limit 1;
    exit when v_to is not null;
  end loop;
  if v_to is null then v_to := e.tile; end if;
  update public.entries set
      shield_saved = true,
      tile = v_to,
      visited = case when v_to <> e.tile then array_append(visited, e.tile) else visited end,
      stake = 0,
      stake_weight = greatest(stake_weight - e.stake, 0),
      payout = 0,
      frozen_until = null
    where round_id = p_round and user_id = p_hider;
  perform public.notify(p_hider, p_round, 'shield',
    format('Your shield blocked %s''s find! You lost your stake but you''re still in, teleported nearby. You can move again.',
           coalesce((select username from public.profiles where id = p_finder), 'a seeker')), v_to);
  perform public.notify(p_finder, p_round, 'shielded',
    format('You found %s, but their shield teleported them somewhere nearby. You still got %s coins.',
           coalesce((select username from public.profiles where id = p_hider), 'a hider'), v_share), e.tile);
  return v_share;
end $$;

-- ============================================================ hider moves
-- As before, except: no moving while a shield is up, and the bot's moves are free (its coins
-- aren't real, so they don't go into the pool).
create or replace function public.move_hider(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_bot boolean;
  v_fee numeric := public.setting('second_move_fee');
  v_cool int := public.setting('move_cooldown_seconds')::int;
  v_frac numeric;
  v_cap int;
  v_old int;
  v_wait int;
  v_traps int := 0;
  t record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'You can only move while the search is on'; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found then raise exception 'You are not hiding in this round'; end if;
  if e.caught then raise exception 'You have been caught'; end if;
  if e.shield_bought and not e.shield_saved then raise exception 'Your shield is up, so you can''t move until it''s been used'; end if;
  if e.frozen_until is not null and e.frozen_until > now() then
    raise exception 'A drone has you pinned. You can move in % seconds',
      ceil(extract(epoch from (e.frozen_until - now())))::int;
  end if;
  if e.last_move_at is not null and e.last_move_at > now() - make_interval(secs => v_cool) then
    v_wait := ceil(extract(epoch from (e.last_move_at + make_interval(secs => v_cool) - now())))::int;
    raise exception 'You can move again in % seconds', v_wait;
  end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  if p_tile = e.tile then raise exception 'You are already there'; end if;
  if p_tile = any(e.visited) then raise exception 'You can''t go back to a spot you''ve already left'; end if;

  v_frac := r.searched_count::numeric / greatest(r.tile_count, 1);
  if v_frac < public.setting('unlock_fraction')
     and exists (select 1 from public.searches where round_id = r.id and tile = p_tile) then
    raise exception 'That spot has already been searched. Pick somewhere else';
  end if;
  v_cap := least(public.setting('max_hiders_per_tile')::int, 1 + floor(v_frac * public.setting('max_hiders_per_tile'))::int);
  if (select count(*) from public.entries
      where round_id = r.id and role = 'hider' and not caught and tile = p_tile) >= v_cap then
    raise exception 'That spot is full';
  end if;

  select is_bot into v_bot from public.profiles where id = p_user;
  if v_bot then
    v_fee := 0;
  else
    update public.profiles set coins = coins - v_fee where id = p_user and coins >= v_fee;
    if not found then raise exception 'You need % coins to move', v_fee; end if;
    perform public.log_coins(p_user, r.id, 'move_fee', -v_fee);
    update public.rounds set pool = pool + v_fee where id = r.id;
  end if;

  v_old := e.tile;
  update public.entries set
      tile = p_tile,
      moves = moves + 1,
      stake_weight = stake_weight + v_fee,
      visited = array_append(visited, v_old),
      last_move_at = now()
    where round_id = r.id and user_id = p_user;
  insert into public.events (round_id, kind, tile, detail)
    values (r.id, 'moved', v_old, jsonb_build_object('name',
      case when v_bot then r.bot_name else (select username from public.profiles where id = p_user) end,
      'user', case when v_bot then null else p_user end, 'bot', v_bot));

  for t in
    select s.id, s.seeker_id, s.tile, s.radius from (
      select sw.*, row_number() over (partition by sw.seeker_id order by sw.id desc) rn
      from public.sweeps sw where sw.round_id = r.id
    ) s
    where s.rn <= public.setting('traps_per_seeker') and public.in_area(p_tile, s.tile, s.radius)
  loop
    v_traps := v_traps + 1;
    perform public.notify(t.seeker_id, r.id, 'trap', 'Your drone trap just picked up someone moving into its area!', t.tile);
  end loop;
  if v_traps > 0 then
    perform public.notify(p_user, r.id, 'trapped',
      case when v_traps = 1 then 'You walked into a drone trap. The seeker who set it knows someone''s there.'
           else format('You walked into %s drone traps. Their seekers know someone''s there.', v_traps) end,
      p_tile);
  end if;
  return jsonb_build_object('moved_to', p_tile, 'fee', v_fee, 'trapped', v_traps, 'cooldown', v_cool);
end $$;

-- The bot moves for free now (no coin check).
create or replace function public.bot_think(p_round bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  e public.entries;
  r public.rounds;
  v_tile int;
  v_try int := 0;
  v_swept boolean;
begin
  select * into r from public.rounds where id = p_round;
  select * into e from public.entries where round_id = p_round and user_id = v_bot;
  if not found or e.caught or r.status <> 'seek' then return 'idle'; end if;
  if e.frozen_until is not null and e.frozen_until > now() then return 'pinned'; end if;
  if e.last_move_at is not null and e.last_move_at > now() - make_interval(secs => public.setting('move_cooldown_seconds')::int) then
    return 'cooling down';
  end if;
  v_swept := e.last_swept_at is not null and e.last_swept_at > coalesce(e.last_move_at, '-infinity'::timestamptz);
  if not v_swept then return 'staying'; end if;
  if e.moves >= public.setting('bot_max_moves') then return 'out of moves'; end if;
  loop
    v_try := v_try + 1;
    exit when v_try > 40;
    v_tile := floor(random() * r.tile_count)::int;
    continue when v_tile = e.tile or v_tile = any(e.visited);
    continue when exists (select 1 from public.searches where round_id = p_round and tile = v_tile);
    continue when exists (select 1 from public.entries where round_id = p_round and role = 'hider' and not caught and tile = v_tile);
    perform public.move_hider(v_bot, v_tile);
    return 'fled a sweep';
  end loop;
  return 'no tile';
end $$;

-- ============================================================ searching
-- As before, plus shields: a shielded hider is paid out like a catch but teleports and plays on.
create or replace function public.search_tile(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  v_cost numeric;
  v_bonus_used numeric;
  v_real numeric;
  v_caught int := 0;
  v_shielded int := 0;
  v_reward numeric := 0;
  v_n int := 0;
  v_bot_found boolean := false;
  v_found jsonb := '[]'::jsonb;
  v_saved jsonb := '[]'::jsonb;
  v_before boolean;
  h record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Seeking is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  select * into p from public.profiles where id = p_user for update;
  if p.frozen then raise exception 'This account is frozen'; end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if found and en.role = 'hider' then raise exception 'Hiders cannot search'; end if;
  if not found then perform public.join_round(p_user, 'seeker'); select * into p from public.profiles where id = p_user; end if;

  v_before := exists (select 1 from public.searches where round_id = r.id and tile = p_tile);

  if p.free_search_day is distinct from current_date then
    v_cost := 0;
    update public.profiles set free_search_day = current_date where id = p_user;
  else
    v_cost := public.search_price(r.searched_count, r.tile_count);
  end if;

  v_bonus_used := least(p.bonus_coins, v_cost);
  v_real := v_cost - v_bonus_used;
  if p.coins < v_real then raise exception 'Not enough coins (a search costs %)', v_cost; end if;
  if v_cost > 0 then
    update public.profiles set bonus_coins = bonus_coins - v_bonus_used, coins = coins - v_real where id = p_user;
    if v_bonus_used > 0 then
      perform public.log_coins(p_user, r.id, 'search_fee', -v_bonus_used, true);
      perform public.burn(r.id, v_bonus_used, 'search fee (bonus)', true);
    end if;
    if v_real > 0 then
      perform public.log_coins(p_user, r.id, 'search_fee', -v_real);
      update public.rounds set pool = pool + v_real where id = r.id;
    end if;
    update public.entries set real_spent = real_spent + v_real where round_id = r.id and user_id = p_user;
  end if;

  for h in
    select e.user_id, pr.is_bot, pr.username, pr.avatar, (e.shield_bought and not e.shield_saved) as shielded
    from public.entries e
    join public.profiles pr on pr.id = e.user_id
    where e.round_id = r.id and e.role = 'hider' and not e.caught and e.tile = p_tile
    order by pr.is_bot desc, e.created_at, e.user_id
  loop
    if not h.is_bot then v_n := v_n + 1; else v_bot_found := true; end if;
    if h.shielded and not h.is_bot then
      v_shielded := v_shielded + 1;
      v_reward := v_reward + public.shield_save(r.id, h.user_id, p_user, greatest(v_n, 1));
      v_saved := v_saved || jsonb_build_array(jsonb_build_object('name', h.username, 'avatar', h.avatar));
      continue;
    end if;
    v_caught := v_caught + 1;
    v_reward := v_reward + public.catch_hider(r.id, h.user_id, p_user, greatest(v_n, 1));
    v_found := v_found || jsonb_build_array(jsonb_build_object(
      'name', case when h.is_bot then r.bot_name else h.username end,
      'avatar', case when h.is_bot then null else h.avatar end,
      'bot', h.is_bot));
    perform public.notify(h.user_id, r.id, 'caught', format('%s found you. Better luck next round!', coalesce(p.username, 'A seeker')), p_tile);
  end loop;

  insert into public.searches (round_id, tile, seeker_id, cost, caught) values (r.id, p_tile, p_user, v_cost, v_caught + v_shielded);
  update public.rounds set
      searched_count = searched_count + case when v_before then 0 else 1 end,
      hiders_remaining = hiders_remaining - v_caught
    where id = r.id;
  insert into public.events (round_id, kind, tile) values (r.id, 'searched', p_tile);
  if v_caught > 0 then
    insert into public.events (round_id, kind, tile, detail)
      values (r.id, 'caught', p_tile, jsonb_build_object('how', 'search', 'finder', p.username, 'count', v_caught, 'bot', v_bot_found, 'hiders', v_found));
  end if;
  if v_shielded > 0 then
    insert into public.events (round_id, kind, tile, detail)
      values (r.id, 'shielded', p_tile, jsonb_build_object('finder', p.username, 'count', v_shielded, 'hiders', v_saved));
  end if;
  if r.hiders_remaining - v_caught <= 0 then perform public.finalize_round(r.id); end if;

  return jsonb_build_object('result', case when v_caught > 0 then 'caught' when v_shielded > 0 then 'shielded' else 'empty' end,
                            'cost', v_cost, 'caught', v_caught, 'shielded', v_shielded, 'reward', v_reward, 'bot', v_bot_found,
                            'searched_before', v_before,
                            'names', (select coalesce(string_agg(x->>'name', ', '), '') from jsonb_array_elements(v_found || v_saved) x));
end $$;

-- ============================================================ passive income
-- Players under 100 coins earn coins back over time: up to 100 in any 24 hours, never above
-- 100 in total. Called whenever the player opens the game (and by the daily job).
create or replace function public.accrue_passive(p_user uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_target numeric := public.setting('passive_target');
  v_day numeric := public.setting('passive_per_day');
  v_rate numeric;      -- coins per second
  v_amt numeric;
  v_recent numeric;
begin
  select * into p from public.profiles where id = p_user for update;
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

create or replace function public.daily_upkeep() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; x record;
begin
  for x in select id from public.profiles where coins < public.setting('passive_target') and not frozen and not is_bot loop
    if public.accrue_passive(x.id) > 0 then v_n := v_n + 1; end if;
  end loop;
  return jsonb_build_object('passive_paid', v_n);
end $$;

create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding', 'balloon', 'passive')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('tick', 'finalize_round', 'pay_for_find', 'buy_shield', 'shield_save', 'move_hider', 'bot_think',
            'search_tile', 'accrue_passive', 'daily_upkeep')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
