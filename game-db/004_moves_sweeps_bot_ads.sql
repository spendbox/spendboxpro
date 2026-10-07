-- HIDE & SEEK, part 4: free-roaming hiders, fairer sweeps, a Seed Bot that plays,
-- search and sweep fees that feed the survivor pool, public event notices, and ad requests.
-- Run once in Supabase → SQL Editor, after 003_names_pins_chat.sql.

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('move_cooldown_seconds', 60,  'Seconds a hider must wait between moves'),
  ('sweep_cooldown_seconds', 10, 'Seconds a seeker must wait between sweeps'),
  ('sweep_price_growth',    0.05, 'Each sweep this round makes the next one this much dearer (0.05 = +5%)'),
  ('bot_coins',             500,  'Coins the Seed Bot gets at the start of every round (to pay for moves)'),
  ('bot_wander_minutes',    8,    'The Seed Bot moves on its own after this long without moving'),
  ('searched_visible_fraction', 0.7, 'Players see only the most recent share of searched tiles')
on conflict (key) do nothing;
update public.game_settings set value = 100, note = 'Every hider move costs this (goes to the survivor pool)'
  where key = 'second_move_fee';

-- ============================================================ new columns
alter table public.entries add column if not exists visited int[] not null default '{}';
alter table public.entries add column if not exists last_move_at timestamptz;
alter table public.entries add column if not exists last_sweep_at timestamptz;
alter table public.entries add column if not exists last_swept_at timestamptz;
alter table public.rounds add column if not exists sweep_count int not null default 0;
alter table public.rounds add column if not exists bot_name text;
alter table public.events add column if not exists detail jsonb;

create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ Seed Bot names
create table if not exists public.bot_names (id serial primary key, name text not null unique);
alter table public.bot_names enable row level security;
insert into public.bot_names (name) values
  ('Shadow'), ('Whisper'), ('Ghost'), ('Mango'), ('Pixel'), ('Biscuit'), ('Nimbus'), ('Echo'),
  ('Pepper'), ('Rascal'), ('Cinder'), ('Juno'), ('Ziggy'), ('Pebble'), ('Comet'), ('Blink'),
  ('Rusty'), ('Velvet'), ('Sprout'), ('Domino'), ('Chili'), ('Marble'), ('Noodle'), ('Orbit'),
  ('Tango'), ('Kiwi'), ('Fable'), ('Gizmo'), ('Hazel'), ('Indigo'), ('Jinx'), ('Lotus'),
  ('Maverick'), ('Nova'), ('Oreo'), ('Puzzle'), ('Quill'), ('Ripple'), ('Sable'), ('Tofu'),
  ('Umber'), ('Vesper'), ('Wren'), ('Yoyo'), ('Zephyr'), ('Bramble'), ('Cobalt'), ('Dusk'),
  ('Ember'), ('Fizz'), ('Glimmer'), ('Hush'), ('Ivy'), ('Jasper'), ('Koko'), ('Lumen'),
  ('Mischief'), ('Nutmeg'), ('Onyx'), ('Pippin'), ('Quasar'), ('Riddle'), ('Sly'), ('Tinker')
on conflict (name) do nothing;

-- ============================================================ catching a hider
-- One place for the catch rules (used by searches, and by hiders who walk into a searched tile).
-- Returns what the finder earned. The caller updates hiders_remaining and announces it.
create or replace function public.catch_hider(p_round bigint, p_hider uuid, p_finder uuid, p_index int default 1)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  h record;
  v_share numeric := 0;
begin
  select e.stake, pr.hider_rounds, pr.is_bot into h
    from public.entries e join public.profiles pr on pr.id = e.user_id
    where e.round_id = p_round and e.user_id = p_hider;
  if h.is_bot then
    -- New coins: the bounty for finding the Seed Bot.
    v_share := public.setting('bot_bounty');
    perform public.log_coins(p_finder, p_round, 'bot_bounty', v_share);
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
  update public.entries set caught = true, caught_by = p_finder, payout = case when h.is_bot then 0 else v_share end
    where round_id = p_round and user_id = p_hider;
  if v_share > 0 then
    update public.profiles set coins = coins + v_share where id = p_finder;
  end if;
  return v_share;
end $$;

-- ============================================================ hider moves
-- Hiders can move as often as they like during the search: every move costs the move fee
-- (into the survivor pool), there is a cooldown, and they can never go back to a tile
-- they have left. Stepping onto a tile that was already searched (and has not unlocked
-- again) gives them away: they are caught by whoever searched it.
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
  v_finder uuid;
  v_wait int;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'You can only move while the search is on'; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found then raise exception 'You are not hiding in this round'; end if;
  if e.caught then raise exception 'You have been caught'; end if;
  if e.last_move_at is not null and e.last_move_at > now() - make_interval(secs => v_cool) then
    v_wait := ceil(extract(epoch from (e.last_move_at + make_interval(secs => v_cool) - now())))::int;
    raise exception 'You can move again in % seconds', v_wait;
  end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That tile is not on the map'; end if;
  if p_tile = e.tile then raise exception 'You are already there'; end if;
  if p_tile = any(e.visited) then raise exception 'You can''t go back to a tile you''ve already left'; end if;

  v_frac := r.searched_count::numeric / greatest(r.tile_count, 1);
  v_cap := least(public.setting('max_hiders_per_tile')::int, 1 + floor(v_frac * public.setting('max_hiders_per_tile'))::int);
  if (select count(*) from public.entries
      where round_id = r.id and role = 'hider' and not caught and tile = p_tile) >= v_cap then
    raise exception 'That tile is full';
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

  -- Walked into a searched tile that is still locked: caught on the spot.
  if v_frac < public.setting('unlock_fraction') then
    select seeker_id into v_finder from public.searches where round_id = r.id and tile = p_tile;
    if v_finder is not null then
      perform public.catch_hider(r.id, p_user, v_finder, 1);
      update public.rounds set hiders_remaining = hiders_remaining - 1 where id = r.id;
      insert into public.events (round_id, kind, tile, detail)
        values (r.id, 'caught', p_tile, jsonb_build_object('how', 'walked_in',
          'finder', (select username from public.profiles where id = v_finder), 'bot', v_bot));
      if r.hiders_remaining - 1 <= 0 then perform public.finalize_round(r.id); end if;
      return jsonb_build_object('moved_to', p_tile, 'fee', v_fee, 'caught', true);
    end if;
  end if;
  return jsonb_build_object('moved_to', p_tile, 'fee', v_fee, 'caught', false, 'cooldown', v_cool);
end $$;

-- ============================================================ searching
-- Search fees now go into the survivor pool (real coins only: bonus coins still burn,
-- so free coins can never turn into winnings).
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
  h record;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Seeking is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That tile is not on the map'; end if;
  select * into p from public.profiles where id = p_user for update;
  if p.frozen then raise exception 'This account is frozen'; end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if found and en.role = 'hider' then raise exception 'Hiders cannot search'; end if;
  if not found then perform public.join_round(p_user, 'seeker'); select * into p from public.profiles where id = p_user; end if;

  if exists (select 1 from public.searches where round_id = r.id and tile = p_tile) then
    return jsonb_build_object('result', 'already_searched', 'cost', 0);
  end if;

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
  end loop;

  insert into public.searches (round_id, tile, seeker_id, cost, caught) values (r.id, p_tile, p_user, v_cost, v_caught);
  update public.rounds set searched_count = searched_count + 1, hiders_remaining = hiders_remaining - v_caught
    where id = r.id;
  insert into public.events (round_id, kind, tile) values (r.id, 'searched', p_tile);
  if v_caught > 0 then
    insert into public.events (round_id, kind, tile, detail)
      values (r.id, 'caught', p_tile, jsonb_build_object('how', 'search', 'finder', p.username, 'count', v_caught, 'bot', v_bot_found));
  end if;
  if r.hiders_remaining - v_caught <= 0 then perform public.finalize_round(r.id); end if;

  return jsonb_build_object('result', case when v_caught > 0 then 'caught' else 'empty' end,
                            'cost', v_cost, 'caught', v_caught, 'reward', v_reward, 'bot', v_bot_found);
end $$;

-- ============================================================ sweeping
-- A sweep says only yes or no. It has a cooldown, gets dearer every time anyone sweeps
-- this round, its fee goes into the survivor pool, and hiders inside are warned.
create or replace function public.sweep_price(p_round bigint, p_radius int) returns numeric
language sql stable as $$
  select round(public.setting('sweep_base_price') * (2 * p_radius + 1) * (2 * p_radius + 1) / 9
    * (1 + public.setting('sweep_price_growth') * coalesce((select sweep_count from public.rounds where id = p_round), 0)), 2)
$$;

create or replace function public.sweep(p_user uuid, p_tile int, p_radius int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  c int[];
  v_cool int := public.setting('sweep_cooldown_seconds')::int;
  v_cost numeric;
  v_bonus_used numeric;
  v_real numeric;
  v_count int;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Seeking is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That tile is not on the map'; end if;
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
  if v_real > 0 then
    perform public.log_coins(p_user, r.id, 'sweep_fee', -v_real);
  end if;
  update public.rounds set pool = pool + v_real, sweep_count = sweep_count + 1 where id = r.id;
  update public.entries set real_spent = real_spent + v_real, last_sweep_at = now() where round_id = r.id and user_id = p_user;

  c := public.spiral_xy(p_tile);
  with inside as (
    select e.user_id from public.entries e
      cross join lateral (select public.spiral_xy(e.tile) xy) s
      where e.round_id = r.id and e.role = 'hider' and not e.caught
        and abs(s.xy[1] - c[1]) <= p_radius and abs(s.xy[2] - c[2]) <= p_radius
  )
  update public.entries set last_swept_at = now()
    where round_id = r.id and user_id in (select user_id from inside);
  get diagnostics v_count = row_count;

  insert into public.events (round_id, kind, tile, detail) values (r.id, 'sweep', p_tile, jsonb_build_object('radius', p_radius));
  return jsonb_build_object('found', v_count > 0, 'cost', v_cost, 'checked_at', now(),
                            'next_price', public.sweep_price(r.id, p_radius), 'cooldown', v_cool);
end $$;

-- ============================================================ the Seed Bot plays
-- The bot gets fresh coins every round, moves under the same rules as everyone (fee,
-- cooldown, no going back), and runs when it notices a sweep over it.
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

-- Round clock: as before, plus the bot's name, coins and moves.
create or replace function public.tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  v_carry numeric;
  v_id bigint;
  v_left numeric;
  v_join int := public.setting('join_minutes')::int;
  v_seek int := public.setting('seek_minutes')::int;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status <> 'done' for update;

  if not found then
    select value into v_carry from public.game_state where key = 'carry';
    insert into public.rounds (join_ends_at, seek_ends_at, pool, tile_count, hiders_total, hiders_remaining, bot_name)
    values (now() + make_interval(mins => v_join),
            now() + make_interval(mins => v_join + v_seek),
            coalesce(v_carry, 0), public.setting('base_tiles')::int, 1, 1, 'Seed Bot')
    returning id into v_id;
    update public.rounds set bot_name = coalesce(
      (select name from public.bot_names order by id offset (v_id % greatest((select count(*) from public.bot_names), 1)) limit 1),
      'Seed Bot') where id = v_id;
    insert into public.entries (round_id, user_id, role) values (v_id, v_bot, 'hider');
    -- Fresh coins for the bot: whatever it had left burns, then it gets its round budget.
    select coins into v_left from public.profiles where id = v_bot;
    if v_left > 0 then perform public.burn(v_id, v_left, 'bot leftover'); end if;
    update public.profiles set coins = public.setting('bot_coins') where id = v_bot;
    perform public.log_coins(v_bot, v_id, 'bot_funding', public.setting('bot_coins'));
    update public.game_state set value = 0 where key = 'carry';
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

-- ============================================================ ad requests
-- "Advertise here": people tap a billboard and leave their details. Pricing comes later.
create table if not exists public.ad_requests (
  id bigserial primary key,
  round_id bigint,
  billboard text not null,
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  contact text not null,
  message text,
  created_at timestamptz not null default now()
);
alter table public.ad_requests enable row level security;

-- ============================================================ access
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('catch_hider', 'move_hider', 'search_tile', 'sweep', 'bot_think', 'tick')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ============================================================ sign-in by email + PIN
-- Keep each player's sign-in email on their profile, so returning players can type their
-- email and PIN.
alter table public.profiles add column if not exists email text;
update public.profiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null;
create index if not exists profiles_email_idx on public.profiles (email);
