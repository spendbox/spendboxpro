-- HIDE & SEEK, part 5: repeat searches, sweep freezes, drone traps and personal notifications.
-- Run once in Supabase → SQL Editor, after 004_moves_sweeps_bot_ads.sql.
--
-- - A spot can be searched again (it costs a search; the player is told it was searched before).
-- - Hiders see every searched spot and can't move onto one (until 90% of the city is searched).
-- - A sweep freezes the hiders inside it for 15 seconds.
-- - Each seeker's last 5 sweeps stay active as traps for the rest of the round: a hider who
--   moves into one is detected, and both the seeker and the hider are told. Nobody else knows
--   where the traps are.

insert into public.game_settings (key, value, note) values
  ('sweep_freeze_seconds', 15, 'Hiders caught in a sweep can''t move for this long'),
  ('traps_per_seeker', 5, 'How many of a seeker''s latest sweeps stay active as traps')
on conflict (key) do nothing;

-- Old public sweep announcements gave away where traps are: remove them.
delete from public.events where kind = 'sweep';

-- ============================================================ repeat searches
alter table public.searches drop constraint if exists searches_pkey;
alter table public.searches add column if not exists id bigserial primary key;
create index if not exists searches_round_tile_idx on public.searches (round_id, tile);

-- ============================================================ freezes, sweeps, notifications
alter table public.entries add column if not exists frozen_until timestamptz;

create table if not exists public.sweeps (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  seeker_id uuid not null references public.profiles (id) on delete cascade,
  tile int not null,
  radius int not null,
  found boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists sweeps_round_seeker_idx on public.sweeps (round_id, seeker_id, id desc);
alter table public.sweeps enable row level security; -- no policies: only the server reads them

-- Private messages from the game to one player ("your trap went off", "you were swept").
create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  round_id bigint references public.rounds (id) on delete cascade,
  kind text not null,
  body text not null,
  tile int,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, id desc);
alter table public.notifications enable row level security; -- no policies: only the server reads them

create or replace function public.notify(p_user uuid, p_round bigint, p_kind text, p_body text, p_tile int default null)
returns void language sql as $$
  insert into public.notifications (user_id, round_id, kind, body, tile)
  select p_user, p_round, p_kind, p_body, p_tile
  where not exists (select 1 from public.profiles where id = p_user and is_bot);
$$;

/** Is tile p_tile inside the square of radius p_radius around p_centre? */
create or replace function public.in_area(p_tile int, p_centre int, p_radius int) returns boolean
language sql immutable as $$
  select abs((public.spiral_xy(p_tile))[1] - (public.spiral_xy(p_centre))[1]) <= p_radius
     and abs((public.spiral_xy(p_tile))[2] - (public.spiral_xy(p_centre))[2]) <= p_radius
$$;

-- ============================================================ hider moves
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
  update public.profiles set coins = coins - v_fee where id = p_user and coins >= v_fee;
  if not found then raise exception 'You need % coins to move', v_fee; end if;
  perform public.log_coins(p_user, r.id, 'move_fee', -v_fee);
  update public.rounds set pool = pool + v_fee where id = r.id;

  v_old := e.tile;
  update public.entries set
      tile = p_tile,
      moves = moves + 1,
      stake_weight = stake_weight + case when v_bot then 0 else v_fee end,
      visited = array_append(visited, v_old),
      last_move_at = now()
    where round_id = r.id and user_id = p_user;
  insert into public.events (round_id, kind, tile) values (r.id, 'moved', v_old);

  -- Drone traps: each seeker's latest sweeps keep watching. Walking into one is detected.
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

-- ============================================================ searching (repeats allowed)
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
  v_reward numeric := 0;
  v_n int := 0;
  v_bot_found boolean := false;
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
    select e.user_id, pr.is_bot from public.entries e
    join public.profiles pr on pr.id = e.user_id
    where e.round_id = r.id and e.role = 'hider' and not e.caught and e.tile = p_tile
    order by pr.is_bot desc, e.created_at, e.user_id
  loop
    if not h.is_bot then v_n := v_n + 1; else v_bot_found := true; end if;
    v_caught := v_caught + 1;
    v_reward := v_reward + public.catch_hider(r.id, h.user_id, p_user, greatest(v_n, 1));
    perform public.notify(h.user_id, r.id, 'caught', format('%s found you. Better luck next round!', coalesce(p.username, 'A seeker')), p_tile);
  end loop;

  insert into public.searches (round_id, tile, seeker_id, cost, caught) values (r.id, p_tile, p_user, v_cost, v_caught);
  update public.rounds set
      searched_count = searched_count + case when v_before then 0 else 1 end,
      hiders_remaining = hiders_remaining - v_caught
    where id = r.id;
  insert into public.events (round_id, kind, tile) values (r.id, 'searched', p_tile);
  if v_caught > 0 then
    insert into public.events (round_id, kind, tile, detail)
      values (r.id, 'caught', p_tile, jsonb_build_object('how', 'search', 'finder', p.username, 'count', v_caught, 'bot', v_bot_found));
  end if;
  if r.hiders_remaining - v_caught <= 0 then perform public.finalize_round(r.id); end if;

  return jsonb_build_object('result', case when v_caught > 0 then 'caught' else 'empty' end,
                            'cost', v_cost, 'caught', v_caught, 'reward', v_reward, 'bot', v_bot_found,
                            'searched_before', v_before);
end $$;

-- ============================================================ sweeping (freezes + traps)
create or replace function public.sweep(p_user uuid, p_tile int, p_radius int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  v_cool int := public.setting('sweep_cooldown_seconds')::int;
  v_freeze int := public.setting('sweep_freeze_seconds')::int;
  v_cost numeric;
  v_bonus_used numeric;
  v_real numeric;
  v_count int := 0;
  h record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Seeking is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  if p_radius < 1 or p_radius > 3 then raise exception 'Pick a sweep size'; end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if found and en.role = 'hider' then raise exception 'Hiders cannot sweep'; end if;
  if found and en.last_sweep_at is not null and en.last_sweep_at > now() - make_interval(secs => v_cool) then
    raise exception 'Your drone is recharging. Try again in % seconds',
      ceil(extract(epoch from (en.last_sweep_at + make_interval(secs => v_cool) - now())))::int;
  end if;
  select * into p from public.profiles where id = p_user for update;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if en.user_id is null then
    perform public.join_round(p_user, 'seeker');
    select * into p from public.profiles where id = p_user;
  end if;

  v_cost := public.sweep_price(r.id, p_radius);
  v_bonus_used := least(p.bonus_coins, v_cost);
  v_real := v_cost - v_bonus_used;
  if p.coins < v_real then raise exception 'Not enough coins (this sweep costs %)', v_cost; end if;
  update public.profiles set bonus_coins = bonus_coins - v_bonus_used, coins = coins - v_real where id = p_user;
  if v_bonus_used > 0 then
    perform public.log_coins(p_user, r.id, 'sweep_fee', -v_bonus_used, true);
    perform public.burn(r.id, v_bonus_used, 'sweep fee (bonus)', true);
  end if;
  if v_real > 0 then perform public.log_coins(p_user, r.id, 'sweep_fee', -v_real); end if;
  update public.rounds set pool = pool + v_real, sweep_count = sweep_count + 1 where id = r.id;
  update public.entries set real_spent = real_spent + v_real, last_sweep_at = now() where round_id = r.id and user_id = p_user;

  -- Everyone hiding inside is spotted (yes/no to the seeker), warned, and pinned for a moment.
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

  insert into public.sweeps (round_id, seeker_id, tile, radius, found) values (r.id, p_user, p_tile, p_radius, v_count > 0);
  -- No public event: where seekers sweep (and so where the traps are) stays secret.
  return jsonb_build_object('found', v_count > 0, 'cost', v_cost, 'checked_at', now(),
                            'next_price', public.sweep_price(r.id, p_radius), 'cooldown', v_cool, 'freeze', v_freeze);
end $$;

-- ============================================================ the bot respects freezes
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
  if not v_swept and coalesce(e.last_move_at, r.join_ends_at) > now() - make_interval(mins => public.setting('bot_wander_minutes')::int) then
    return 'staying';
  end if;
  if (select coins from public.profiles where id = v_bot) < public.setting('second_move_fee') then return 'broke'; end if;
  loop
    v_try := v_try + 1;
    exit when v_try > 40;
    v_tile := floor(random() * r.tile_count)::int;
    continue when v_tile = e.tile or v_tile = any(e.visited);
    continue when exists (select 1 from public.searches where round_id = p_round and tile = v_tile);
    continue when exists (select 1 from public.entries where round_id = p_round and role = 'hider' and not caught and tile = v_tile);
    perform public.move_hider(v_bot, v_tile);
    return case when v_swept then 'fled a sweep' else 'wandered' end;
  end loop;
  return 'no tile';
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('move_hider', 'search_tile', 'sweep', 'bot_think', 'notify')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
