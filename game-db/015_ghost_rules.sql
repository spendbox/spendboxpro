-- HIDE & SEEK, part 15: ghosts' move limits, the hunt runs the full hour, stronger drones,
-- quicker searches, and a bot that doesn't bolt the moment it's swept.
-- Run once in Supabase → SQL Editor, after 014_chat_rooms.sql.
--
-- - Ghosts (hiders) can move once per game at levels 1–9, twice at 10–19, three times at 20+.
-- - Catching every ghost no longer ends the round early: the hunt carries on to the end.
-- - A drone sweep pins ghosts for 60 seconds. A drone that spots someone needs 90 seconds to
--   recharge (10 seconds otherwise).
-- - Searches cool down faster.
-- - Caught players' details (name, face, level) travel with the catch, for "big fish" news and
--   so people can message them.

insert into public.game_settings (key, value, note) values
  ('sweep_found_cooldown_seconds', 90, 'Drone recharge after a sweep that spotted someone'),
  ('ghost_moves_level_1', 1, 'Moves per game for ghosts at levels 1–9'),
  ('ghost_moves_level_10', 2, 'Moves per game for ghosts at levels 10–19'),
  ('ghost_moves_level_20', 3, 'Moves per game for ghosts at level 20 and up')
on conflict (key) do nothing;
update public.game_settings set value = 60 where key = 'sweep_freeze_seconds';
update public.game_settings set value = 1 where key = 'search_cooldown_seconds';
update public.game_settings set value = 3 where key = 'search_fast_window_seconds';
update public.game_settings set value = 10 where key = 'search_cooldown_max';

alter table public.entries add column if not exists last_sweep_found boolean not null default false;

-- How many moves a ghost gets per game, by level.
create or replace function public.moves_allowed(p_user uuid) returns int
language sql stable as $$
  select (case when level >= 20 then public.setting('ghost_moves_level_20')
               when level >= 10 then public.setting('ghost_moves_level_10')
               else public.setting('ghost_moves_level_1') end)::int
  from public.profiles where id = p_user
$$;

-- The bot waits a while after being swept before it slips away (so its move doesn't give the
-- sweep away to everyone).
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
  -- Lie low for at least 2 minutes after the sweep, then go at a random moment.
  if now() < e.last_swept_at + interval '2 minutes' or random() > 0.35 then return 'lying low'; end if;
  loop
    v_try := v_try + 1;
    exit when v_try > 40;
    v_tile := floor(random() * r.tile_count)::int;
    continue when v_tile = e.tile or v_tile = any(e.visited);
    continue when exists (select 1 from public.searches where round_id = p_round and tile = v_tile);
    continue when exists (select 1 from public.entries where round_id = p_round and role = 'hider' and not caught and tile = v_tile);
    perform public.move_hider(v_bot, v_tile);
    return 'slipped away';
  end loop;
  return 'no tile';
end $$;

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
    v_heat := greatest(0, v_heat - floor(v_elapsed / 8)::int);
    if v_elapsed < public.setting('search_fast_window_seconds') then v_heat := least(v_heat + 1, 6); end if;
  else
    v_heat := 0;
  end if;
  update public.profiles set search_heat = v_heat, last_search_at = now() where id = p_user;
  return least(v_max, v_base * power(2, v_heat))::int;
end $$;

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
    select e.user_id, pr.is_bot, pr.username, pr.avatar, pr.level, (e.shield_bought and not e.shield_saved) as shielded
    from public.entries e
    join public.profiles pr on pr.id = e.user_id
    where e.round_id = p_round and e.role = 'hider' and not e.caught and e.tile = p_tile
    order by pr.is_bot desc, e.created_at, e.user_id
  loop
    if not h.is_bot then v_n := v_n + 1; else v_bot_found := true; end if;
    if h.shielded and not h.is_bot then
      v_shielded := v_shielded + 1;
      v_reward := v_reward + public.shield_save(p_round, h.user_id, p_user, greatest(v_n, 1));
      v_saved := v_saved || jsonb_build_array(jsonb_build_object('name', h.username, 'avatar', h.avatar, 'user', h.user_id, 'level', h.level));
      continue;
    end if;
    v_caught := v_caught + 1;
    v_reward := v_reward + public.catch_hider(p_round, h.user_id, p_user, greatest(v_n, 1));
    v_found := v_found || jsonb_build_array(jsonb_build_object(
      'name', case when h.is_bot then r.bot_name else h.username end,
      'avatar', case when h.is_bot then null else h.avatar end,
      'user', case when h.is_bot then null else h.user_id end,
      'level', case when h.is_bot then null else h.level end,
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
  if en.user_id is not null and en.role = 'hider' then raise exception 'Ghosts cannot search'; end if;
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
  return res || jsonb_build_object(
    'result', case when (res->>'caught')::int > 0 then 'caught' when (res->>'shielded')::int > 0 then 'shielded'
                   when (res->>'decoys')::int > 0 then 'decoy' else 'empty' end,
    'cost', v_cost, 'cooldown', v_cool);
end $$;

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
  if en.user_id is not null and en.role = 'hider' then raise exception 'Ghosts cannot search'; end if;
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
  return jsonb_build_object(
    'result', case when v_caught > 0 then 'caught' when v_shielded > 0 then 'shielded' when v_decoys > 0 then 'decoy' else 'empty' end,
    'caught', v_caught, 'shielded', v_shielded, 'decoys', v_decoys, 'reward', v_reward, 'bot', v_bot,
    'names', array_to_string(v_names, ', '), 'cost', v_cost, 'cooldown', v_cool, 'area', true);
end $$;

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
  if found and en.role = 'hider' then raise exception 'Ghosts cannot sweep'; end if;
  -- A drone that spotted someone needs a longer recharge.
  if found and en.last_sweep_found then v_cool := public.setting('sweep_found_cooldown_seconds')::int; end if;
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
  update public.entries set last_sweep_at = now(), last_sweep_found = false where round_id = r.id and user_id = p_user;

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
  if v_count + v_decoys > 0 then
    update public.entries set last_sweep_found = true where round_id = r.id and user_id = p_user;
  end if;
  return jsonb_build_object('found', v_count + v_decoys > 0, 'cost', v_cost, 'checked_at', now(),
                            'next_price', public.sweep_price(r.id, p_radius),
                            'cooldown', case when v_count + v_decoys > 0 then public.setting('sweep_found_cooldown_seconds')::int
                                             else public.setting('sweep_cooldown_seconds')::int end,
                            'freeze', v_freeze);
end $$;

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
  if not found then raise exception 'You are not a ghost in this round'; end if;
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
  if not v_bot and e.moves >= public.moves_allowed(p_user) then
    raise exception 'You''ve used all your moves this game (% at your level). Level up for more.', public.moves_allowed(p_user);
  end if;
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

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('moves_allowed', 'bot_think', 'search_gate', 'search_resolve', 'search_tile', 'search_area', 'sweep', 'move_hider')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
