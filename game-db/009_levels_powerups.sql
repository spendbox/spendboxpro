-- HIDE & SEEK, part 9: levels, power-ups (decoys, shields, respawns, big searches), a move
-- price that rises as people move, search cooldowns, and shorter drone freezes.
-- Run once in Supabase → SQL Editor, after 008_badge_collection.sql.
--
-- Levels: after playing enough rounds, players spend coins to level up (the coins burn).
--   Level 3: decoys · Level 5: shields · Level 10: big search (hunters) · Level 20: respawn.
--   Every 5 levels, whoever catches you earns a bigger bonus (forever).
-- Moves: the first move of a round costs 50 coins; every move by anyone makes the next one
--   dearer. After moving, a hider waits 5 minutes before moving again.
-- Searches: a short cooldown after each search that grows if you search too fast.
-- Drone sweeps pin hiders for 30 seconds.

insert into public.game_settings (key, value, note) values
  ('move_fee_start', 50, 'First move of a round costs this'),
  ('move_fee_growth', 0.08, 'Each move by anyone raises the next move''s price by this share of the start price'),
  ('search_cooldown_seconds', 2, 'Wait after each search'),
  ('search_fast_window_seconds', 6, 'Searching again within this many seconds heats you up (longer cooldowns)'),
  ('search_cooldown_max', 30, 'Longest search cooldown'),
  ('level_rounds_per_level', 2, 'Rounds played needed per level (to go from L to L+1 you need 2·L rounds played)'),
  ('level_cost_per_level', 50, 'Coins to go from level L to L+1 = this × L'),
  ('level_bonus_per_5', 25, 'Extra coins for catching a player, per 5 levels they have'),
  ('decoy_level', 3, 'Level needed for decoys'),
  ('decoy_price', 20, 'First decoy costs this; each one you''ve used before adds half again'),
  ('shield_level', 5, 'Level needed for shields'),
  ('big_search_level', 10, 'Level needed for the big 3×3 search'),
  ('big_search_multiplier', 7, 'A big search costs this many normal searches'),
  ('respawn_level', 20, 'Level needed to respawn'),
  ('respawn_price', 300, 'Coins to respawn (they burn, they don''t go to the pool)'),
  ('respawn_window_minutes', 30, 'Only players caught in this many first minutes of the hunt can respawn')
on conflict (key) do nothing;
update public.game_settings set value = 30 where key = 'sweep_freeze_seconds';
update public.game_settings set value = 300 where key = 'move_cooldown_seconds';

alter table public.profiles add column if not exists level int not null default 1;
alter table public.profiles add column if not exists shield_uses int not null default 0;
alter table public.profiles add column if not exists decoy_uses int not null default 0;
alter table public.profiles add column if not exists respawn_uses int not null default 0;
alter table public.profiles add column if not exists search_heat int not null default 0;
alter table public.profiles add column if not exists last_search_at timestamptz;
alter table public.entries add column if not exists decoy_used boolean not null default false;
alter table public.entries add column if not exists respawned boolean not null default false;
alter table public.entries add column if not exists respawned_at timestamptz;
alter table public.entries add column if not exists caught_at timestamptz;
alter table public.searches add column if not exists area boolean not null default false;
alter table public.searches add column if not exists decoys int not null default 0;
alter table public.rounds add column if not exists move_count int not null default 0;

create table if not exists public.decoys (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  tile int not null,
  created_at timestamptz not null default now(),
  found_by uuid references public.profiles (id) on delete set null,
  found_at timestamptz,
  outcome text
);
create index if not exists decoys_round_tile_idx on public.decoys (round_id, tile) where found_at is null;
alter table public.decoys enable row level security; -- no policies: only the server reads them

-- When someone is caught, remember when (respawns depend on it).
create or replace function public.entries_caught_at() returns trigger
language plpgsql as $$
begin
  if new.caught and not coalesce(old.caught, false) then new.caught_at := now(); end if;
  return new;
end $$;
drop trigger if exists entries_caught_at on public.entries;
create trigger entries_caught_at before update of caught on public.entries
  for each row execute function public.entries_caught_at();

-- ============================================================ levels
create or replace function public.level_info(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_rounds int;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'Unknown player'; end if;
  v_rounds := p.hider_rounds + p.seeker_rounds;
  return jsonb_build_object(
    'level', p.level,
    'rounds_played', v_rounds,
    'next_rounds', public.setting('level_rounds_per_level')::int * p.level,
    'next_cost', public.setting('level_cost_per_level') * p.level,
    'coins', p.coins,
    'can_upgrade', v_rounds >= public.setting('level_rounds_per_level')::int * p.level
                   and p.coins >= public.setting('level_cost_per_level') * p.level);
end $$;

create or replace function public.upgrade_level(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_cost numeric; v_need int;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'Unknown player'; end if;
  v_need := public.setting('level_rounds_per_level')::int * p.level;
  v_cost := public.setting('level_cost_per_level') * p.level;
  if p.hider_rounds + p.seeker_rounds < v_need then
    raise exception 'Play % more round(s) to unlock level %', v_need - (p.hider_rounds + p.seeker_rounds), p.level + 1;
  end if;
  if p.coins < v_cost then raise exception 'You need % coins to reach level %', v_cost, p.level + 1; end if;
  update public.profiles set coins = coins - v_cost, level = level + 1 where id = p_user;
  perform public.log_coins(p_user, null, 'level_up', -v_cost);
  perform public.burn(null, v_cost, 'level up');
  return jsonb_build_object('level', p.level + 1, 'cost', v_cost);
end $$;

-- ============================================================ catches pay a level bonus
create or replace function public.catch_hider(p_round bigint, p_hider uuid, p_finder uuid, p_index int default 1)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  h record;
  v_share numeric := 0;
  v_bonus numeric := 0;
begin
  select e.stake, pr.hider_rounds, pr.is_bot, pr.level into h
    from public.entries e join public.profiles pr on pr.id = e.user_id
    where e.round_id = p_round and e.user_id = p_hider;
  if h.is_bot then
    v_share := public.setting('bot_bounty');
    perform public.log_coins(p_finder, p_round, 'bot_bounty', v_share);
  elsif coalesce(h.stake, 0) <= 0 then
    v_share := 0;  -- already lost their stake (a shield save or a respawn)
  elsif p_index > 3 then
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
  -- Catching a seasoned player is worth more: a bonus for every 5 levels they have.
  if not h.is_bot and coalesce(h.level, 1) >= 5 and not public.linked_accounts(p_finder, p_hider) then
    v_bonus := public.setting('level_bonus_per_5') * floor(h.level / 5.0);
    perform public.log_coins(p_finder, p_round, 'level_bonus', v_bonus);
  end if;
  update public.entries set caught = true, caught_by = p_finder, payout = case when h.is_bot then 0 else v_share end
    where round_id = p_round and user_id = p_hider;
  if v_share + v_bonus > 0 then
    update public.profiles set coins = coins + v_share + v_bonus where id = p_finder;
  end if;
  return v_share + v_bonus;
end $$;

-- ============================================================ hunters: paying and pacing
-- Takes a hunter's coins for a search or sweep (bonus coins first, which burn; real coins go
-- to the pool). Returns the real coins paid.
create or replace function public.charge_hunter(p_round bigint, p_user uuid, p_cost numeric, p_kind text) returns numeric
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_bonus numeric; v_real numeric;
begin
  if p_cost <= 0 then return 0; end if;
  select * into p from public.profiles where id = p_user for update;
  v_bonus := least(p.bonus_coins, p_cost);
  v_real := p_cost - v_bonus;
  if p.coins < v_real then raise exception 'Not enough coins (this costs %)', p_cost; end if;
  update public.profiles set bonus_coins = bonus_coins - v_bonus, coins = coins - v_real where id = p_user;
  if v_bonus > 0 then
    perform public.log_coins(p_user, p_round, p_kind, -v_bonus, true);
    perform public.burn(p_round, v_bonus, p_kind || ' (bonus)', true);
  end if;
  if v_real > 0 then
    perform public.log_coins(p_user, p_round, p_kind, -v_real);
    update public.rounds set pool = pool + v_real where id = p_round;
  end if;
  update public.entries set real_spent = real_spent + v_real where round_id = p_round and user_id = p_user;
  return v_real;
end $$;

-- Search cooldown: a couple of seconds normally, doubling each time you search again too fast
-- (up to 30 s), cooling back down when you take your time. Raises if you're still cooling.
-- Returns the cooldown that now applies before your next search.
create or replace function public.search_gate(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_base int := public.setting('search_cooldown_seconds')::int;
  v_max int := public.setting('search_cooldown_max')::int;
  v_heat int;
  v_wait numeric;
  v_elapsed numeric;
begin
  select * into p from public.profiles where id = p_user for update;
  v_heat := p.search_heat;
  if p.last_search_at is not null then
    v_elapsed := extract(epoch from (now() - p.last_search_at));
    v_wait := least(v_max, v_base * power(2, v_heat)) - v_elapsed;
    if v_wait > 0.25 then raise exception 'Slow down: you can search again in % seconds', ceil(v_wait)::int; end if;
    v_heat := greatest(0, v_heat - floor(v_elapsed / 20)::int);
    if v_elapsed < public.setting('search_fast_window_seconds') then v_heat := least(v_heat + 1, 6); end if;
  else
    v_heat := 0;
  end if;
  update public.profiles set search_heat = v_heat, last_search_at = now() where id = p_user;
  return least(v_max, v_base * power(2, v_heat))::int;
end $$;

-- What one search finds on one tile: hiders (caught, or saved by a shield) and decoys.
-- Records the search and the public events. The caller has locked the round row.
create or replace function public.search_resolve(p_round bigint, p_user uuid, p_tile int, p_cost numeric, p_area boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_name text;
  v_caught int := 0;
  v_shielded int := 0;
  v_decoys int := 0;
  v_reward numeric := 0;
  v_n int := 0;
  v_bot_found boolean := false;
  v_found jsonb := '[]'::jsonb;
  v_saved jsonb := '[]'::jsonb;
  v_before boolean;
  v_outcome text;
  h record;
  d record;
begin
  select * into r from public.rounds where id = p_round;
  select username into v_name from public.profiles where id = p_user;
  v_before := exists (select 1 from public.searches where round_id = p_round and tile = p_tile);

  for h in
    select e.user_id, pr.is_bot, pr.username, pr.avatar, (e.shield_bought and not e.shield_saved) as shielded
    from public.entries e
    join public.profiles pr on pr.id = e.user_id
    where e.round_id = p_round and e.role = 'hider' and not e.caught and e.tile = p_tile
    order by pr.is_bot desc, e.created_at, e.user_id
  loop
    if not h.is_bot then v_n := v_n + 1; else v_bot_found := true; end if;
    if h.shielded and not h.is_bot then
      v_shielded := v_shielded + 1;
      v_reward := v_reward + public.shield_save(p_round, h.user_id, p_user, greatest(v_n, 1));
      v_saved := v_saved || jsonb_build_array(jsonb_build_object('name', h.username, 'avatar', h.avatar));
      continue;
    end if;
    v_caught := v_caught + 1;
    v_reward := v_reward + public.catch_hider(p_round, h.user_id, p_user, greatest(v_n, 1));
    v_found := v_found || jsonb_build_array(jsonb_build_object(
      'name', case when h.is_bot then r.bot_name else h.username end,
      'avatar', case when h.is_bot then null else h.avatar end,
      'bot', h.is_bot));
    perform public.notify(h.user_id, p_round, 'caught', format('%s found you. Better luck next round!', coalesce(v_name, 'A hunter')), p_tile);
  end loop;

  -- Decoys: the hunter gets nothing. It goes bang, or a toy pops up.
  for d in select * from public.decoys where round_id = p_round and tile = p_tile and found_at is null for update loop
    v_decoys := v_decoys + 1;
    v_outcome := case when random() < 0.5 then 'explode' else 'toy' end;
    update public.decoys set found_by = p_user, found_at = now(), outcome = v_outcome where id = d.id;
    insert into public.events (round_id, kind, tile, detail)
      values (p_round, 'decoy_found', p_tile, jsonb_build_object('finder', v_name, 'outcome', v_outcome));
    perform public.notify(d.user_id, p_round, 'decoy', format('Your decoy fooled %s!', coalesce(v_name, 'a hunter')), p_tile);
    perform public.notify(p_user, p_round, 'decoy', case when v_outcome = 'explode'
      then 'Boom! That was a decoy. Nobody was there.' else 'A squeaky toy! That was a decoy. Nobody was there.' end, p_tile);
  end loop;

  insert into public.searches (round_id, tile, seeker_id, cost, caught, area, decoys)
    values (p_round, p_tile, p_user, p_cost, v_caught + v_shielded, p_area, v_decoys);
  update public.rounds set
      searched_count = searched_count + case when v_before then 0 else 1 end,
      hiders_remaining = hiders_remaining - v_caught
    where id = p_round;
  if not p_area then insert into public.events (round_id, kind, tile) values (p_round, 'searched', p_tile); end if;
  if v_caught > 0 then
    insert into public.events (round_id, kind, tile, detail)
      values (p_round, 'caught', p_tile, jsonb_build_object('how', case when p_area then 'big_search' else 'search' end,
              'finder', v_name, 'count', v_caught, 'bot', v_bot_found, 'hiders', v_found));
  end if;
  if v_shielded > 0 then
    insert into public.events (round_id, kind, tile, detail)
      values (p_round, 'shielded', p_tile, jsonb_build_object('finder', v_name, 'count', v_shielded, 'hiders', v_saved));
  end if;
  return jsonb_build_object('caught', v_caught, 'shielded', v_shielded, 'decoys', v_decoys, 'reward', v_reward,
                            'bot', v_bot_found, 'searched_before', v_before,
                            'names', (select coalesce(string_agg(x->>'name', ', '), '') from jsonb_array_elements(v_found || v_saved) x));
end $$;

create or replace function public.search_tile(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  v_cost numeric;
  v_cool int;
  res jsonb;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Hunting is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  select * into p from public.profiles where id = p_user;
  if p.frozen then raise exception 'This account is frozen'; end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if en.user_id is not null and en.role = 'hider' then raise exception 'Hiders cannot search'; end if;
  v_cool := public.search_gate(p_user);
  if en.user_id is null then perform public.join_round(p_user, 'seeker'); end if;
  select * into p from public.profiles where id = p_user;

  if p.free_search_day is distinct from current_date then
    v_cost := 0;
    update public.profiles set free_search_day = current_date where id = p_user;
  else
    v_cost := public.search_price(r.searched_count, r.tile_count);
  end if;
  perform public.charge_hunter(r.id, p_user, v_cost, 'search_fee');

  res := public.search_resolve(r.id, p_user, p_tile, v_cost, false);
  if (select hiders_remaining from public.rounds where id = r.id) <= 0 then perform public.finalize_round(r.id); end if;
  return res || jsonb_build_object(
    'result', case when (res->>'caught')::int > 0 then 'caught' when (res->>'shielded')::int > 0 then 'shielded'
                   when (res->>'decoys')::int > 0 then 'decoy' else 'empty' end,
    'cost', v_cost, 'cooldown', v_cool);
end $$;

-- Level 10 hunters: search a whole 3×3 area at once, for 7 normal searches.
create or replace function public.search_area(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  v_cost numeric;
  v_cool int;
  v_tile int;
  res jsonb;
  v_caught int := 0;
  v_shielded int := 0;
  v_decoys int := 0;
  v_reward numeric := 0;
  v_bot boolean := false;
  v_names text[] := '{}';
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Hunting is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  select * into p from public.profiles where id = p_user;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if p.level < public.setting('big_search_level') then
    raise exception 'Big searches unlock at level %', public.setting('big_search_level')::int;
  end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if en.user_id is not null and en.role = 'hider' then raise exception 'Hiders cannot search'; end if;
  v_cool := public.search_gate(p_user);
  if en.user_id is null then perform public.join_round(p_user, 'seeker'); end if;

  v_cost := round(public.search_price(r.searched_count, r.tile_count) * public.setting('big_search_multiplier'), 2);
  perform public.charge_hunter(r.id, p_user, v_cost, 'search_fee');
  insert into public.events (round_id, kind, tile, detail) values (r.id, 'area_search', p_tile, jsonb_build_object('radius', 1));

  for v_tile in select g from generate_series(0, r.tile_count - 1) g where public.in_area(g, p_tile, 1) loop
    res := public.search_resolve(r.id, p_user, v_tile, round(v_cost / 9, 2), true);
    v_caught := v_caught + (res->>'caught')::int;
    v_shielded := v_shielded + (res->>'shielded')::int;
    v_decoys := v_decoys + (res->>'decoys')::int;
    v_reward := v_reward + (res->>'reward')::numeric;
    v_bot := v_bot or (res->>'bot')::boolean;
    if res->>'names' <> '' then v_names := v_names || (res->>'names'); end if;
  end loop;
  if (select hiders_remaining from public.rounds where id = r.id) <= 0 then perform public.finalize_round(r.id); end if;
  return jsonb_build_object(
    'result', case when v_caught > 0 then 'caught' when v_shielded > 0 then 'shielded' when v_decoys > 0 then 'decoy' else 'empty' end,
    'caught', v_caught, 'shielded', v_shielded, 'decoys', v_decoys, 'reward', v_reward, 'bot', v_bot,
    'names', array_to_string(v_names, ', '), 'cost', v_cost, 'cooldown', v_cool, 'area', true);
end $$;

-- ============================================================ sweeps see decoys too
create or replace function public.sweep(p_user uuid, p_tile int, p_radius int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  v_cool int := public.setting('sweep_cooldown_seconds')::int;
  v_freeze int := public.setting('sweep_freeze_seconds')::int;
  v_cost numeric;
  v_count int := 0;
  v_decoys int := 0;
  h record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Hunting is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  if p_radius < 1 or p_radius > 3 then raise exception 'Pick a sweep size'; end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if found and en.role = 'hider' then raise exception 'Hiders cannot sweep'; end if;
  if found and en.last_sweep_at is not null and en.last_sweep_at > now() - make_interval(secs => v_cool) then
    raise exception 'Your drone is recharging. Try again in % seconds',
      ceil(extract(epoch from (en.last_sweep_at + make_interval(secs => v_cool) - now())))::int;
  end if;
  select * into p from public.profiles where id = p_user;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if en.user_id is null then perform public.join_round(p_user, 'seeker'); end if;

  v_cost := public.sweep_price(r.id, p_radius);
  perform public.charge_hunter(r.id, p_user, v_cost, 'sweep_fee');
  update public.rounds set sweep_count = sweep_count + 1 where id = r.id;
  update public.entries set last_sweep_at = now() where round_id = r.id and user_id = p_user;

  for h in
    select e.user_id from public.entries e
    where e.round_id = r.id and e.role = 'hider' and not e.caught and public.in_area(e.tile, p_tile, p_radius)
  loop
    v_count := v_count + 1;
    update public.entries set last_swept_at = now(), frozen_until = now() + make_interval(secs => v_freeze)
      where round_id = r.id and user_id = h.user_id;
    perform public.notify(h.user_id, r.id, 'swept',
      format('A drone just swept your area. You''re pinned for %s seconds.', v_freeze), p_tile);
  end loop;
  -- Decoys fool drones: they read as "someone's here".
  select count(*) into v_decoys from public.decoys
    where round_id = r.id and found_at is null and public.in_area(tile, p_tile, p_radius);

  insert into public.sweeps (round_id, seeker_id, tile, radius, found) values (r.id, p_user, p_tile, p_radius, v_count + v_decoys > 0);
  return jsonb_build_object('found', v_count + v_decoys > 0, 'cost', v_cost, 'checked_at', now(),
                            'next_price', public.sweep_price(r.id, p_radius), 'cooldown', v_cool, 'freeze', v_freeze);
end $$;

-- ============================================================ moving: a price that climbs
create or replace function public.move_price(p_round bigint) returns numeric
language sql stable as $$
  select round(public.setting('move_fee_start') * (1 + public.setting('move_fee_growth') * coalesce(r.move_count, 0)), 2)
  from public.rounds r where r.id = p_round
$$;

create or replace function public.move_hider(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_bot boolean;
  v_fee numeric;
  v_cool int := public.setting('move_cooldown_seconds')::int;
  v_frac numeric;
  v_cap int;
  v_old int;
  v_wait int;
  v_traps int := 0;
  t record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'You can only move while the hunt is on'; end if;
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
    raise exception 'You can move again in %:%', v_wait / 60, lpad((v_wait % 60)::text, 2, '0');
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
    v_fee := public.move_price(r.id);
    update public.profiles set coins = coins - v_fee where id = p_user and coins >= v_fee;
    if not found then raise exception 'You need % coins to move', v_fee; end if;
    perform public.log_coins(p_user, r.id, 'move_fee', -v_fee);
    update public.rounds set pool = pool + v_fee, move_count = move_count + 1 where id = r.id;
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
      case when v_traps = 1 then 'You walked into a drone trap. The hunter who set it knows someone''s there.'
           else format('You walked into %s drone traps. Their hunters know someone''s there.', v_traps) end,
      p_tile);
  end if;
  return jsonb_build_object('moved_to', p_tile, 'fee', v_fee, 'trapped', v_traps, 'cooldown', v_cool,
                            'next_price', public.move_price(r.id));
end $$;

-- ============================================================ power-ups
-- Shields: level 5, one per game, and each one costs more than your last.
create or replace function public.shield_price(p_user uuid) returns numeric
language sql stable as $$
  select round(public.setting('shield_price') * (1 + 0.5 * shield_uses), 2) from public.profiles where id = p_user
$$;

create or replace function public.buy_shield(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  p public.profiles;
  v_price numeric;
begin
  select * into r from public.rounds where status <> 'done' for update;
  if not found then raise exception 'No round is on right now'; end if;
  select * into p from public.profiles where id = p_user for update;
  if p.is_bot then raise exception 'Unknown player'; end if;
  if p.level < public.setting('shield_level') then raise exception 'Shields unlock at level %', public.setting('shield_level')::int; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found then raise exception 'Only hiders can use a shield'; end if;
  if e.caught then raise exception 'You have been caught'; end if;
  if e.shield_bought then raise exception 'You can only use one shield per game'; end if;
  v_price := public.shield_price(p_user);
  if p.coins < v_price then raise exception 'You need % coins for a shield', v_price; end if;
  update public.profiles set coins = coins - v_price, shield_uses = shield_uses + 1 where id = p_user;
  perform public.log_coins(p_user, r.id, 'shield', -v_price);
  update public.rounds set pool = pool + v_price where id = r.id;
  update public.entries set shield_bought = true, stake_weight = stake_weight + v_price
    where round_id = r.id and user_id = p_user;
  return jsonb_build_object('shield', true, 'cost', v_price);
end $$;

-- Decoys: level 3, one per game, placed wherever you point. A hunter who searches it gets
-- nothing; drones read it as "someone's here".
create or replace function public.decoy_price(p_user uuid) returns numeric
language sql stable as $$
  select round(public.setting('decoy_price') * (1 + 0.5 * decoy_uses), 2) from public.profiles where id = p_user
$$;

create or replace function public.place_decoy(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  p public.profiles;
  v_price numeric;
  t record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Decoys can be placed once the hunt is on'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  select * into p from public.profiles where id = p_user for update;
  if p.is_bot then raise exception 'Unknown player'; end if;
  if p.level < public.setting('decoy_level') then raise exception 'Decoys unlock at level %', public.setting('decoy_level')::int; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found then raise exception 'Only hiders can place decoys'; end if;
  if e.caught then raise exception 'You have been caught'; end if;
  if e.decoy_used then raise exception 'You can only place one decoy per game'; end if;
  if p_tile = e.tile then raise exception 'Put your decoy somewhere other than your own hiding spot'; end if;
  v_price := public.decoy_price(p_user);
  if p.coins < v_price then raise exception 'You need % coins for a decoy', v_price; end if;
  update public.profiles set coins = coins - v_price, decoy_uses = decoy_uses + 1 where id = p_user;
  perform public.log_coins(p_user, r.id, 'decoy', -v_price);
  update public.rounds set pool = pool + v_price where id = r.id;
  update public.entries set decoy_used = true, stake_weight = stake_weight + v_price where round_id = r.id and user_id = p_user;
  insert into public.decoys (round_id, user_id, tile) values (r.id, p_user, p_tile);
  -- Everyone hears a decoy went out, but not where (no tile in the public event)...
  insert into public.events (round_id, kind, tile, detail) values (r.id, 'decoy', null, '{}'::jsonb);
  -- ...unless it lands inside a drone trap, whose hunter notices something.
  for t in
    select s.seeker_id, s.tile from (
      select sw.*, row_number() over (partition by sw.seeker_id order by sw.id desc) rn
      from public.sweeps sw where sw.round_id = r.id
    ) s
    where s.rn <= public.setting('traps_per_seeker') and public.in_area(p_tile, s.tile, s.radius)
  loop
    perform public.notify(t.seeker_id, r.id, 'trap', 'Your drone trap noticed something being set down in its area!', t.tile);
  end loop;
  return jsonb_build_object('decoy', true, 'tile', p_tile, 'cost', v_price);
end $$;

-- Respawn: level 20. Caught in the first 30 minutes of the hunt? Pay 300 coins (they burn) to
-- drop back in somewhere random. Once per game, announced to everyone.
create or replace function public.respawn(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  p public.profiles;
  v_price numeric := public.setting('respawn_price');
  v_tile int;
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
  select g into v_tile from generate_series(0, r.tile_count - 1) g
    where not exists (select 1 from public.searches s where s.round_id = r.id and s.tile = g)
      and not exists (select 1 from public.entries x where x.round_id = r.id and x.role = 'hider' and not x.caught and x.tile = g)
    order by random() limit 1;
  if v_tile is null then raise exception 'There''s nowhere left to hide'; end if;
  update public.profiles set coins = coins - v_price, respawn_uses = respawn_uses + 1 where id = p_user;
  perform public.log_coins(p_user, r.id, 'respawn', -v_price);
  perform public.burn(r.id, v_price, 'respawn');
  update public.entries set caught = false, caught_by = null, respawned = true, respawned_at = now(),
         tile = v_tile, stake_weight = greatest(stake_weight - stake, 0), stake = 0, payout = 0,
         frozen_until = null, last_move_at = now()
    where round_id = r.id and user_id = p_user;
  update public.rounds set hiders_remaining = hiders_remaining + 1 where id = r.id;
  insert into public.events (round_id, kind, tile, detail)
    values (r.id, 'respawn', null, jsonb_build_object('name', p.username, 'avatar', p.avatar));
  return jsonb_build_object('respawned', true, 'tile', v_tile, 'cost', v_price);
end $$;

create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding', 'balloon', 'passive',
                                                    'ad_reward', 'level_bonus')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('level_info', 'upgrade_level', 'catch_hider', 'charge_hunter', 'search_gate', 'search_resolve', 'search_tile',
            'search_area', 'sweep', 'move_price', 'move_hider', 'shield_price', 'buy_shield', 'decoy_price', 'place_decoy',
            'respawn', 'entries_caught_at')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
