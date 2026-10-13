-- Newtown database, set-up part 1 of 4 (made by scripts/sql-setup-parts.mjs from game-db/).
-- Paste the parts into a NEW Supabase project's SQL Editor in order, running each before the next.

-- ======================================================== 001_hide_and_seek.sql
-- HIDE & SEEK: database + game rules (see the rules spec).
-- Run once on an empty Supabase database (SQL Editor). All tunable numbers live in
-- the game_settings table, so you can change them without touching code.
-- All game actions are functions that only the server (service_role) can call.

create extension if not exists pgcrypto;

-- ============================================================ settings
create table public.game_settings (
  key text primary key,
  value numeric not null,
  note text
);
insert into public.game_settings (key, value, note) values
  ('hider_stake',        100,  'Coins a hider stakes'),
  ('tiles_per_hider',    10,   'Tiles added to the map per hider'),
  ('join_minutes',       10,   'Hiding window: hiders join, then are placed at random'),
  ('base_tiles',         400,  'Map size before any player hides (20 x 20)'),
  ('bot_bounty',         200,  'Coins for finding the seed bot'),
  ('seek_minutes',       60,   'Seek phase length (hiders can move during it)'),
  ('second_move_fee',    100,  'Fee for a hider''s second move (the first is free)'),
  ('signup_coins',       500,  'Coins at signup (once per verified email)'),
  ('seeker_bonus',       50,   'Bonus coins when joining as a seeker (once per day)'),
  ('topup_floor',        100,  'Daily top-up: broke players refilled to this, never more'),
  ('search_price_start', 0.5,  'Tile search price when little of the map is searched'),
  ('search_price_max',   5,    'Tile search price when the whole map is searched'),
  ('sweep_base_price',   2,    'Price of a 3x3 sweep; scales with area'),
  ('unlock_fraction',    0.9,  'Share of tiles searched before locked tiles unlock'),
  ('max_hiders_per_tile',3,    'Most hiders allowed to stack on one tile (rises with % searched)'),
  ('finder_share',       0.8,  'Share of a caught hider''s stake paid to the finder'),
  ('new_hider_rounds',   5,    'Hiders with fewer completed rounds count as new'),
  ('new_hider_finder_share', 0.2, 'Finder share for a new hider (the rest burns)'),
  ('pool_hiders',        0.6,  'Survivor pool share to surviving hiders'),
  ('pool_seekers',       0.2,  'Survivor pool share to seekers (the rest burns)'),
  ('seeker_share_cap',   50,   'Most real coins per seeker counted for the seeker share (decide!)'),
  ('repeat_pair_limit',  2,    'Catches between the same two accounts in 7 days before payouts stop');

create or replace function public.setting(p_key text) returns numeric
language sql stable as $$ select value from public.game_settings where key = p_key $$;

-- ============================================================ players
create table public.profiles (
  id uuid primary key,  -- the auth.users id (the seed bot has no login)
  username text unique,
  email_key text unique,  -- normalised email, so a+1@gmail.com and a@gmail.com count once
  is_bot boolean not null default false,
  device_hash text,
  coins numeric(14,2) not null default 0 check (coins >= 0),
  bonus_coins numeric(14,2) not null default 0 check (bonus_coins >= 0),
  seeker_rounds int not null default 0,
  hider_rounds int not null default 0,
  bonus_day date,
  free_search_day date,
  frozen boolean not null default false,
  created_at timestamptz not null default now()
);

-- Every coin movement. Positive = into the player. Rows with no player (kind 'burn') are coins destroyed.
create table public.ledger (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  round_id bigint,
  kind text not null,
  amount numeric(14,2) not null,
  bonus boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index ledger_user_idx on public.ledger (user_id, created_at desc);
create index ledger_day_idx on public.ledger (created_at);

-- ============================================================ rounds
create table public.rounds (
  id bigserial primary key,
  status text not null default 'join' check (status in ('join', 'seek', 'done')),
  join_ends_at timestamptz not null,
  seek_ends_at timestamptz not null,
  tile_count int not null default 0,
  hiders_total int not null default 0,
  hiders_remaining int not null default 0,
  searched_count int not null default 0,
  pool numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index rounds_one_active on public.rounds ((true)) where status <> 'done';

create table public.entries (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('hider', 'seeker')),
  stake numeric(14,2) not null default 0,
  stake_weight numeric(14,2) not null default 0,
  tile int,
  moves int not null default 0,
  caught boolean not null default false,
  caught_by uuid references public.profiles (id),
  real_spent numeric(14,2) not null default 0,
  payout numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);
create index entries_tile_idx on public.entries (round_id, tile) where role = 'hider';

create table public.searches (
  round_id bigint not null references public.rounds (id) on delete cascade,
  tile int not null,
  seeker_id uuid not null references public.profiles (id),
  cost numeric(14,2) not null,
  caught int not null default 0,
  created_at timestamptz not null default now(),
  primary key (round_id, tile)
);

-- Public announcements (a hider moved away from a tile, a catch happened). Never names a player.
create table public.events (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  kind text not null,
  tile int,
  created_at timestamptz not null default now()
);

create table public.sponsor_deposits (
  id bigserial primary key,
  round_id bigint references public.rounds (id),
  sponsor text not null,
  amount numeric(14,2) not null check (amount > 0),
  reference text unique,
  created_at timestamptz not null default now()
);

create table public.flags (
  id bigserial primary key,
  round_id bigint,
  finder_id uuid,
  hider_id uuid,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.game_state (key text primary key, value numeric not null default 0);
insert into public.game_state (key, value) values ('carry', 0);

-- Daily coin supply: coins created vs destroyed. Tune burn so supply stays flat or grows slowly.
create view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ helpers
create or replace function public.log_coins(
  p_user uuid, p_round bigint, p_kind text, p_amount numeric, p_bonus boolean default false, p_note text default null
) returns void language sql as $$
  insert into public.ledger (user_id, round_id, kind, amount, bonus, note)
  values (p_user, p_round, p_kind, p_amount, p_bonus, p_note);
$$;

create or replace function public.burn(p_round bigint, p_amount numeric, p_note text, p_bonus boolean default false)
returns void language plpgsql as $$
begin
  if p_amount > 0 then
    insert into public.ledger (user_id, round_id, kind, amount, bonus, note)
    values (null, p_round, 'burn', p_amount, p_bonus, p_note);
  end if;
end $$;

create or replace function public.tile_width(p_tiles int) returns int
language sql immutable as $$ select greatest(1, ceil(sqrt(greatest(p_tiles, 1)))::int) $$;

create or replace function public.search_price(p_searched int, p_tiles int) returns numeric
language sql stable as $$
  select round(public.setting('search_price_start')
    + (public.setting('search_price_max') - public.setting('search_price_start'))
      * least(1, p_searched::numeric / greatest(p_tiles, 1)), 2)
$$;

-- ============================================================ seed bot
-- The seed bot hides in every round, never moves, and pays a bounty to whoever finds it.
insert into public.profiles (id, username, is_bot)
values ('00000000-0000-0000-0000-00000000b07a', 'Seed Bot', true);

-- ============================================================ signup (email code)
create or replace function public.email_key(p_email text) returns text
language sql immutable as $$
  select case
    when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(e, '@', 1), '+', 1) || '@' || split_part(e, '@', 2)
  end
  from (select lower(trim(p_email)) e) x
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_coins numeric := 0; v_key text := public.email_key(nullif(new.email, ''));
begin
  -- Signup coins: only for an email nobody has used before. A repeat (e.g. a +alias) still
  -- gets an account, but with no coins.
  if v_key is not null and not exists (select 1 from public.profiles where email_key = v_key) then
    v_coins := public.setting('signup_coins');
  else
    v_key := null;
  end if;
  insert into public.profiles (id, email_key, coins) values (new.id, v_key, v_coins) on conflict do nothing;
  if v_coins > 0 then
    perform public.log_coins(new.id, null, 'signup', v_coins);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_deleted_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end $$;

create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- ============================================================ joining
create or replace function public.join_round(p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_stake numeric := public.setting('hider_stake');
  v_bonus numeric := 0;
begin
  select * into r from public.rounds where status <> 'done' for update;
  if not found then raise exception 'No round is open right now'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'Unknown player'; end if;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if exists (select 1 from public.entries where round_id = r.id and user_id = p_user) then
    raise exception 'You are already in this round';
  end if;

  if p_role = 'hider' then
    if r.status <> 'join' then raise exception 'Hiders can only join during the join window'; end if;
    if p.seeker_rounds < 1 then raise exception 'Complete one round as a seeker before you can hide'; end if;
    if p.coins < v_stake then raise exception 'You need % coins to hide', v_stake; end if;
    update public.profiles set coins = coins - v_stake where id = p_user;
    perform public.log_coins(p_user, r.id, 'stake', -v_stake);
    insert into public.entries (round_id, user_id, role, stake, stake_weight)
      values (r.id, p_user, 'hider', v_stake, v_stake);
    update public.rounds set hiders_total = hiders_total + 1, hiders_remaining = hiders_remaining + 1,
           tile_count = tile_count + public.setting('tiles_per_hider')::int
      where id = r.id;
  elsif p_role = 'seeker' then
    insert into public.entries (round_id, user_id, role) values (r.id, p_user, 'seeker');
    if p.bonus_day is distinct from current_date then
      v_bonus := public.setting('seeker_bonus');
      update public.profiles set bonus_coins = bonus_coins + v_bonus, bonus_day = current_date where id = p_user;
      perform public.log_coins(p_user, r.id, 'seeker_bonus', v_bonus, true);
    end if;
  else
    raise exception 'Role must be hider or seeker';
  end if;
  return jsonb_build_object('round_id', r.id, 'role', p_role, 'bonus_coins', v_bonus);
end $$;

-- ============================================================ round clock
-- Run every minute. Starts rounds (with the seed bot hiding), places hiders, ends rounds.
create or replace function public.tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_carry numeric;
  v_id bigint;
  v_join int := public.setting('join_minutes')::int;
  v_seek int := public.setting('seek_minutes')::int;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status <> 'done' for update;

  if not found then
    select value into v_carry from public.game_state where key = 'carry';
    insert into public.rounds (join_ends_at, seek_ends_at, pool, tile_count, hiders_total, hiders_remaining)
    values (now() + make_interval(mins => v_join),
            now() + make_interval(mins => v_join + v_seek),
            coalesce(v_carry, 0), public.setting('base_tiles')::int, 1, 1)
    returning id into v_id;
    insert into public.entries (round_id, user_id, role)
      select v_id, id, 'hider' from public.profiles where is_bot;
    update public.game_state set value = 0 where key = 'carry';
    return 'round created';
  end if;

  if r.status = 'join' and now() >= r.join_ends_at then
    -- Random placement on distinct tiles, the seed bot included.
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
    v_out := 'round finished';
  end if;
  return v_out;
end $$;

-- ============================================================ hider moves
create or replace function public.move_hider(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_fee numeric := 0;
  v_frac numeric;
  v_cap int;
  v_old int;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'You cannot move right now'; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found or p_user = '00000000-0000-0000-0000-00000000b07a' then
    raise exception 'You are not hiding in this round';
  end if;
  if e.caught then raise exception 'You have been caught'; end if;
  if e.moves >= 2 then raise exception 'No moves left'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That tile is not on the map'; end if;
  if p_tile = e.tile then raise exception 'You are already on that tile'; end if;

  if e.moves = 1 then v_fee := public.setting('second_move_fee'); end if;

  v_frac := r.searched_count::numeric / greatest(r.tile_count, 1);
  if v_frac < public.setting('unlock_fraction')
     and exists (select 1 from public.searches where round_id = r.id and tile = p_tile) then
    raise exception 'That tile is locked';
  end if;
  v_cap := least(public.setting('max_hiders_per_tile')::int, 1 + floor(v_frac * public.setting('max_hiders_per_tile'))::int);
  if (select count(*) from public.entries
      where round_id = r.id and role = 'hider' and not caught and tile = p_tile) >= v_cap then
    raise exception 'That tile is full';
  end if;

  if v_fee > 0 then
    update public.profiles set coins = coins - v_fee where id = p_user and coins >= v_fee;
    if not found then raise exception 'You need % coins to move', v_fee; end if;
    perform public.log_coins(p_user, r.id, 'move_fee', -v_fee);
    update public.rounds set pool = pool + v_fee where id = r.id;
  end if;

  v_old := e.tile;
  update public.entries set tile = p_tile, moves = moves + 1, stake_weight = stake_weight + v_fee
    where round_id = r.id and user_id = p_user;
  insert into public.events (round_id, kind, tile) values (r.id, 'moved', v_old);
  return jsonb_build_object('moved_to', p_tile, 'fee', v_fee, 'moves_used', e.moves + 1);
end $$;

-- ============================================================ seeking
create or replace function public.linked_accounts(p_finder uuid, p_hider uuid) returns boolean
language sql stable as $$
  select exists (
      select 1 from public.profiles a, public.profiles b
      where a.id = p_finder and b.id = p_hider and a.device_hash is not null and a.device_hash = b.device_hash)
    or (select count(*) from public.entries
        where caught_by = p_finder and user_id = p_hider and created_at > now() - interval '7 days')
       >= public.setting('repeat_pair_limit')
$$;

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
  v_share numeric;
  v_n int := 0;
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
      perform public.burn(r.id, v_real, 'search fee');
    end if;
    update public.entries set real_spent = real_spent + v_real where round_id = r.id and user_id = p_user;
  end if;

  for h in
    select e.user_id, e.stake, pr.hider_rounds, pr.is_bot from public.entries e
    join public.profiles pr on pr.id = e.user_id
    where e.round_id = r.id and e.role = 'hider' and not e.caught and e.tile = p_tile
    order by pr.is_bot desc, e.created_at, e.user_id
  loop
    if not h.is_bot then v_n := v_n + 1; end if;
    v_caught := v_caught + 1;
    if h.is_bot then
      -- New coins: the bounty for finding the seed bot.
      v_share := public.setting('bot_bounty');
      update public.entries set caught = true, caught_by = p_user where round_id = r.id and user_id = h.user_id;
      update public.profiles set coins = coins + v_share where id = p_user;
      perform public.log_coins(p_user, r.id, 'bot_bounty', v_share);
      v_reward := v_reward + v_share;
      continue;
    elsif v_n > 3 then
      perform public.burn(r.id, h.stake, 'stacked stake beyond 3');
      v_share := 0;
    elsif public.linked_accounts(p_user, h.user_id) then
      insert into public.flags (round_id, finder_id, hider_id, reason) values (r.id, p_user, h.user_id, 'linked accounts');
      perform public.burn(r.id, h.stake * public.setting('finder_share'), 'linked accounts: no payout');
      update public.rounds set pool = pool + h.stake * (1 - public.setting('finder_share')) where id = r.id;
      v_share := 0;
    elsif h.hider_rounds < public.setting('new_hider_rounds') then
      v_share := round(h.stake * public.setting('new_hider_finder_share'), 2);
      perform public.burn(r.id, h.stake - v_share, 'new hider stake');
    else
      v_share := round(h.stake * public.setting('finder_share'), 2);
      update public.rounds set pool = pool + (h.stake - v_share) where id = r.id;
    end if;
    update public.entries set caught = true, caught_by = p_user, payout = v_share
      where round_id = r.id and user_id = h.user_id;
    if v_share > 0 then
      update public.profiles set coins = coins + v_share where id = p_user;
      perform public.log_coins(p_user, r.id, 'catch_reward', v_share);
      v_reward := v_reward + v_share;
    end if;
  end loop;

  insert into public.searches (round_id, tile, seeker_id, cost, caught) values (r.id, p_tile, p_user, v_cost, v_caught);
  update public.rounds set searched_count = searched_count + 1, hiders_remaining = hiders_remaining - v_caught
    where id = r.id;
  if v_caught > 0 then insert into public.events (round_id, kind, tile) values (r.id, 'caught', p_tile); end if;
  if r.hiders_remaining - v_caught <= 0 then perform public.finalize_round(r.id); end if;

  return jsonb_build_object('result', case when v_caught > 0 then 'caught' else 'empty' end,
                            'cost', v_cost, 'caught', v_caught, 'reward', v_reward);
end $$;

-- Paid sweep: are there hiders near this tile? Yes/no and a count, stamped with the time.
create or replace function public.sweep(p_user uuid, p_tile int, p_radius int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  w int;
  v_cost numeric;
  v_bonus_used numeric;
  v_real numeric;
  v_count int;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Seeking is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That tile is not on the map'; end if;
  if p_radius < 1 or p_radius > 5 then raise exception 'Radius must be 1 to 5'; end if;
  if exists (select 1 from public.entries where round_id = r.id and user_id = p_user and role = 'hider') then
    raise exception 'Hiders cannot sweep';
  end if;
  select * into p from public.profiles where id = p_user for update;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if not exists (select 1 from public.entries where round_id = r.id and user_id = p_user) then
    perform public.join_round(p_user, 'seeker');
    select * into p from public.profiles where id = p_user;
  end if;

  v_cost := round(public.setting('sweep_base_price') * (2 * p_radius + 1) * (2 * p_radius + 1) / 9, 2);
  v_bonus_used := least(p.bonus_coins, v_cost);
  v_real := v_cost - v_bonus_used;
  if p.coins < v_real then raise exception 'Not enough coins (a sweep costs %)', v_cost; end if;
  update public.profiles set bonus_coins = bonus_coins - v_bonus_used, coins = coins - v_real where id = p_user;
  if v_bonus_used > 0 then
    perform public.log_coins(p_user, r.id, 'sweep_fee', -v_bonus_used, true);
    perform public.burn(r.id, v_bonus_used, 'sweep fee (bonus)', true);
  end if;
  if v_real > 0 then
    perform public.log_coins(p_user, r.id, 'sweep_fee', -v_real);
    perform public.burn(r.id, v_real, 'sweep fee');
  end if;
  update public.entries set real_spent = real_spent + v_real where round_id = r.id and user_id = p_user;

  w := public.tile_width(r.tile_count);
  select count(*) into v_count from public.entries e
    where e.round_id = r.id and e.role = 'hider' and not e.caught
      and abs((e.tile % w) - (p_tile % w)) <= p_radius
      and abs((e.tile / w) - (p_tile / w)) <= p_radius;

  return jsonb_build_object('hiders_nearby', v_count, 'found', v_count > 0, 'cost', v_cost, 'checked_at', now());
end $$;

-- ============================================================ payouts
create or replace function public.finalize_round(p_round bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_hiders numeric;
  v_seekers numeric;
  v_hider_w numeric;
  v_seeker_w numeric;
  v_cap numeric := public.setting('seeker_share_cap');
  v_paid numeric := 0;
  v_share numeric;
  x record;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or r.status = 'done' then return; end if;
  update public.rounds set status = 'done', finished_at = now() where id = p_round;

  v_hiders := round(r.pool * public.setting('pool_hiders'), 2);
  v_seekers := round(r.pool * public.setting('pool_seekers'), 2);

  select coalesce(sum(stake_weight), 0) into v_hider_w
    from public.entries where round_id = p_round and role = 'hider' and not caught and stake_weight > 0;
  select coalesce(sum(least(real_spent, v_cap)), 0) into v_seeker_w
    from public.entries where round_id = p_round and role = 'seeker';

  -- Surviving hiders get their stake back, plus a share in proportion to stake.
  -- Nobody left: the share rolls into the next round.
  if v_hider_w > 0 then
    for x in select user_id, stake, stake_weight from public.entries
             where round_id = p_round and role = 'hider' and not caught and stake_weight > 0 loop
      update public.profiles set coins = coins + x.stake where id = x.user_id;
      perform public.log_coins(x.user_id, p_round, 'stake_return', x.stake);
      v_share := round(v_hiders * x.stake_weight / v_hider_w, 2);
      update public.profiles set coins = coins + v_share where id = x.user_id;
      update public.entries set payout = payout + v_share where round_id = p_round and user_id = x.user_id;
      perform public.log_coins(x.user_id, p_round, 'pool_hider', v_share);
      v_paid := v_paid + v_share;
    end loop;
  else
    update public.game_state set value = value + v_hiders where key = 'carry';
    v_paid := v_paid + v_hiders;
  end if;

  -- Seekers, in proportion to real coins spent (capped per person). Bonus coins never count.
  if v_seeker_w > 0 then
    for x in select user_id, least(real_spent, v_cap) w from public.entries
             where round_id = p_round and role = 'seeker' and real_spent > 0 loop
      v_share := round(v_seekers * x.w / v_seeker_w, 2);
      update public.profiles set coins = coins + v_share where id = x.user_id;
      update public.entries set payout = payout + v_share where round_id = p_round and user_id = x.user_id;
      perform public.log_coins(x.user_id, p_round, 'pool_seeker', v_share);
      v_paid := v_paid + v_share;
    end loop;
  else
    perform public.burn(p_round, v_seekers, 'seeker share with no seekers');
    v_paid := v_paid + v_seekers;
  end if;

  -- The bank (20%) and any rounding dust burn.
  perform public.burn(p_round, r.pool - v_paid, 'bank');

  update public.profiles set hider_rounds = hider_rounds + 1
    where not is_bot and id in (select user_id from public.entries where round_id = p_round and role = 'hider');
  update public.profiles set seeker_rounds = seeker_rounds + 1
    where id in (select user_id from public.entries where round_id = p_round and role = 'seeker');
end $$;

-- ============================================================ daily upkeep & sponsors
create or replace function public.daily_upkeep() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_floor numeric := public.setting('topup_floor'); v_n int := 0; x record;
begin
  for x in select id, coins from public.profiles where coins < v_floor and not frozen and not is_bot loop
    update public.profiles set coins = v_floor where id = x.id;
    perform public.log_coins(x.id, null, 'topup', v_floor - x.coins);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('topped_up', v_n);
end $$;

-- A sponsor's real-money deposit becomes coins in a round's survivor pool (the open round by default).
create or replace function public.sponsor_deposit(p_sponsor text, p_amount numeric, p_reference text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare r public.rounds; v_id bigint;
begin
  select * into r from public.rounds where status <> 'done' for update;
  if not found then raise exception 'No round is open'; end if;
  insert into public.sponsor_deposits (round_id, sponsor, amount, reference)
    values (r.id, p_sponsor, p_amount, p_reference) returning id into v_id;
  update public.rounds set pool = pool + p_amount where id = r.id;
  perform public.log_coins(null, r.id, 'sponsor', p_amount, false, p_sponsor);
  return v_id;
end $$;

-- ============================================================ privacy & access
alter table public.game_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.ledger enable row level security;
alter table public.rounds enable row level security;
alter table public.entries enable row level security;
alter table public.searches enable row level security;
alter table public.events enable row level security;
alter table public.sponsor_deposits enable row level security;
alter table public.flags enable row level security;
alter table public.game_state enable row level security;

-- Players can read only: their own profile, ledger and entry; and the public round board and announcements.
-- Nobody can read where hiders are (entries of other players) and nobody can write directly.
create policy "own profile" on public.profiles for select using (id = (select auth.uid()));
create policy "own ledger" on public.ledger for select using (user_id = (select auth.uid()));
create policy "own entry" on public.entries for select using (user_id = (select auth.uid()));
create policy "own searches" on public.searches for select using (seeker_id = (select auth.uid()));
create policy "public rounds" on public.rounds for select using (true);
create policy "public events" on public.events for select using (true);

-- Game actions can only be run by the server.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('join_round', 'tick', 'move_hider', 'search_tile', 'sweep', 'finalize_round',
            'daily_upkeep', 'sponsor_deposit', 'log_coins', 'burn', 'handle_new_user', 'handle_deleted_user')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Run the clock every minute with Supabase's built-in scheduler, if it is switched on.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('hideseek-tick', '* * * * *', 'select public.tick()');
  end if;
exception when others then
  raise notice 'pg_cron not set up (%). The /api/cron route will run the clock instead.', sqlerrm;
end $$;

-- ======================================================== 002_email_codes_and_city.sql
-- HIDE & SEEK, part 2: sign-in codes sent by email (through Resend), and the city layout.
-- Run once in Supabase → SQL Editor, after 001_hide_and_seek.sql.

-- ============================================================ sign-in codes
-- The server makes a 6-digit code, keeps only its fingerprint (hash) here, and emails the code.
create table public.email_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_count int not null default 1,
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);
alter table public.email_codes enable row level security;  -- no policies: only the server can read it

-- ============================================================ city layout
-- Tiles are laid out in a square spiral from the centre of the city: tile 0 is the
-- centre, and every new tile goes on the outside edge, so the city grows outwards
-- without existing tiles moving. The app draws the city with the same formula.
create or replace function public.spiral_xy(p_n int) returns int[]
language plpgsql immutable as $$
declare
  p int := p_n + 1;
  k int;
  t int;
  m int;
begin
  if p_n <= 0 then return array[0, 0]; end if;
  k := ceil((sqrt(p::numeric) - 1) / 2)::int;
  t := 2 * k + 1;
  m := t * t;
  t := t - 1;
  if p >= m - t then return array[k - (m - p), -k]; end if;
  m := m - t;
  if p >= m - t then return array[-k, -k + (m - p)]; end if;
  m := m - t;
  if p >= m - t then return array[-k + (m - p), k]; end if;
  return array[k, k - (m - p - t)];
end $$;

-- Sweep now measures "nearby" on the city layout.
create or replace function public.sweep(p_user uuid, p_tile int, p_radius int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  c int[];
  v_cost numeric;
  v_bonus_used numeric;
  v_real numeric;
  v_count int;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Seeking is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That tile is not on the map'; end if;
  if p_radius < 1 or p_radius > 5 then raise exception 'Radius must be 1 to 5'; end if;
  if exists (select 1 from public.entries where round_id = r.id and user_id = p_user and role = 'hider') then
    raise exception 'Hiders cannot sweep';
  end if;
  select * into p from public.profiles where id = p_user for update;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if not exists (select 1 from public.entries where round_id = r.id and user_id = p_user) then
    perform public.join_round(p_user, 'seeker');
    select * into p from public.profiles where id = p_user;
  end if;

  v_cost := round(public.setting('sweep_base_price') * (2 * p_radius + 1) * (2 * p_radius + 1) / 9, 2);
  v_bonus_used := least(p.bonus_coins, v_cost);
  v_real := v_cost - v_bonus_used;
  if p.coins < v_real then raise exception 'Not enough coins (a sweep costs %)', v_cost; end if;
  update public.profiles set bonus_coins = bonus_coins - v_bonus_used, coins = coins - v_real where id = p_user;
  if v_bonus_used > 0 then
    perform public.log_coins(p_user, r.id, 'sweep_fee', -v_bonus_used, true);
    perform public.burn(r.id, v_bonus_used, 'sweep fee (bonus)', true);
  end if;
  if v_real > 0 then
    perform public.log_coins(p_user, r.id, 'sweep_fee', -v_real);
    perform public.burn(r.id, v_real, 'sweep fee');
  end if;
  update public.entries set real_spent = real_spent + v_real where round_id = r.id and user_id = p_user;

  c := public.spiral_xy(p_tile);
  select count(*) into v_count from public.entries e
    cross join lateral (select public.spiral_xy(e.tile) xy) s
    where e.round_id = r.id and e.role = 'hider' and not e.caught
      and abs(s.xy[1] - c[1]) <= p_radius
      and abs(s.xy[2] - c[2]) <= p_radius;

  return jsonb_build_object('hiders_nearby', v_count, 'found', v_count > 0, 'cost', v_cost, 'checked_at', now());
end $$;

revoke all on function public.sweep(uuid, int, int) from public, anon, authenticated;
grant execute on function public.sweep(uuid, int, int) to service_role;

-- ======================================================== 003_names_pins_chat.sql
-- HIDE & SEEK, part 3: bigger city per hider, player names + PIN sign-in, and chat.
-- Run once in Supabase → SQL Editor, after 002_email_codes_and_city.sql.

-- Each hider now adds 20 tiles to the city.
update public.game_settings set value = 20 where key = 'tiles_per_hider';

-- ============================================================ names and PINs
-- Players pick a name and a 6-digit PIN on first sign-in. The PIN itself is kept by
-- Supabase Auth (as the account password); these columns slow down PIN guessing.
alter table public.profiles add column if not exists pin_set boolean not null default false;
alter table public.profiles add column if not exists pin_failures int not null default 0;
alter table public.profiles add column if not exists pin_locked_until timestamptz;
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- ============================================================ chat
-- One chat per round: when a new map starts, the old chat is gone from view (and the
-- daily job deletes it). recipient_id null = everyone; otherwise a private message.
create table public.chat_messages (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_name text not null,
  sender_role text not null check (sender_role in ('hider', 'seeker', 'watcher')),
  recipient_id uuid references public.profiles (id) on delete cascade,
  recipient_name text,
  body text check (char_length(body) <= 500),
  audio_path text,
  audio_seconds int,
  created_at timestamptz not null default now(),
  check (body is not null or audio_path is not null)
);
create index chat_round_idx on public.chat_messages (round_id, id);
create index chat_private_idx on public.chat_messages (recipient_id, round_id) where recipient_id is not null;

alter table public.chat_messages enable row level security;
-- Everyone signed in sees public messages; private ones only by the two people involved.
-- Messages are written only by the server (which checks names, length and pace).
create policy "read chat" on public.chat_messages for select to authenticated
  using (recipient_id is null or sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Live updates for the chat.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Voice notes live in a private storage bucket; the server hands out short-lived links.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('voice', 'voice', false, 2000000,
            array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav'])
    on conflict (id) do nothing;
  end if;
end $$;

-- ======================================================== 004_moves_sweeps_bot_ads.sql
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

-- ======================================================== 005_traps_freezes_notifications.sql
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

-- ======================================================== 006_avatars_badges_balloons.sql
-- HIDE & SEEK, part 6: avatars, names on moves and catches, a calmer bot that teases in chat,
-- badges, coin balloons and visitor counts.
-- Run once in Supabase → SQL Editor, after 005_traps_freezes_notifications.sql.

insert into public.game_settings (key, value, note) values
  ('bot_max_moves', 3, 'The bot moves at most this many times a round, and only when swept'),
  ('bot_teases', 2, 'How many times the bot taunts the City chat each round'),
  ('balloon_coins', 5, 'Coins in each coin balloon'),
  ('balloons_per_day', 10, 'Most coin balloons one player can pop per day'),
  ('balloon_minutes', 4, 'A new coin balloon can drift by every this many minutes')
on conflict (key) do nothing;

-- ============================================================ avatars
-- A face each player designs (skin, hair, eyes, clothes...). Stored as a small JSON object.
alter table public.profiles add column if not exists avatar jsonb;

-- ============================================================ chat from the bot
alter table public.rounds add column if not exists bot_teases int not null default 0;

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
  -- Everyone sees who slipped away (so they can be chased, or messaged).
  insert into public.events (round_id, kind, tile, detail)
    values (r.id, 'moved', v_old, jsonb_build_object('name',
      case when v_bot then (select bot_name from public.rounds where id = r.id) else (select username from public.profiles where id = p_user) end,
      'user', case when v_bot then null else p_user end, 'bot', v_bot));

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
  v_found jsonb := '[]'::jsonb;
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
    v_found := v_found || jsonb_build_array(jsonb_build_object(
      'name', case when h.is_bot then r.bot_name else (select username from public.profiles where id = h.user_id) end,
      'avatar', case when h.is_bot then null else (select avatar from public.profiles where id = h.user_id) end,
      'bot', h.is_bot));
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
      values (r.id, 'caught', p_tile, jsonb_build_object('how', 'search', 'finder', p.username, 'count', v_caught, 'bot', v_bot_found, 'hiders', v_found));
  end if;
  if r.hiders_remaining - v_caught <= 0 then perform public.finalize_round(r.id); end if;

  return jsonb_build_object('result', case when v_caught > 0 then 'caught' else 'empty' end,
                            'cost', v_cost, 'caught', v_caught, 'reward', v_reward, 'bot', v_bot_found,
                            'searched_before', v_before);
end $$;

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
  -- The bot only runs when a drone has swept it, and at most a few times a round.
  v_swept := e.last_swept_at is not null and e.last_swept_at > coalesce(e.last_move_at, '-infinity'::timestamptz);
  if not v_swept then return 'staying'; end if;
  if e.moves >= public.setting('bot_max_moves') then return 'out of moves'; end if;
  if (select coins from public.profiles where id = v_bot) < public.setting('second_move_fee') then return 'broke'; end if;
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

-- The bot pipes up in the City chat a couple of times a round, while it's still hidden.
-- Messages are stitched together from pieces so they rarely repeat.
create or replace function public.bot_tease(p_round bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_due timestamptz;
  v_open text[] := array['Psst.', 'Hello, detectives.', 'Still looking?', 'Ahem.', 'Knock knock.', 'Is it hot in here or is it just me?',
    'Breaking news:', 'Fun fact:', 'Hmm.', 'Okay, okay.', 'Dear seekers,', 'Quick update from the shadows:'];
  v_mid text[] := array[
    'I can hear you tapping the wrong roofs.', 'I''ve had %s coins of searches walk right past me.', 'The pool is %s coins. Imagine.',
    'You''ve checked %s spots and I''m still comfy.', 'I can see a drone. It can''t see me.', 'I''m closer than you think. Or am I?',
    'Somebody just searched next door. Rude.', '%s minutes left and I''ve barely broken a sweat.', 'My hiding spot has a lovely view.',
    'I''ve moved %s times. Or have I?', 'Try the tall buildings. Actually, don''t.', 'There are %s of you and one of me.'];
  v_end text[] := array['😏', '🙈', 'Toodles!', 'Catch me if you can.', 'Not even warm.', 'Good luck with that.', 'Tick tock.', '👀',
    'I believe in you. Sort of.', 'Back to my nap.', ''];
  v_mid_pick text;
  v_body text;
  v_seekers int;
begin
  select * into r from public.rounds where id = p_round;
  if r.status <> 'seek' or r.bot_teases >= public.setting('bot_teases') then return 'quiet'; end if;
  select * into e from public.entries where round_id = p_round and user_id = '00000000-0000-0000-0000-00000000b07a';
  if not found or e.caught then return 'quiet'; end if;
  -- Spread the teases over the hunt: the first after ~8-15 min, the next after ~30-40 min.
  v_due := r.join_ends_at + make_interval(mins => (case when r.bot_teases = 0 then 8 + (r.id % 8) else 30 + (r.id % 11) end)::int);
  if now() < v_due then return 'waiting'; end if;
  select count(*) into v_seekers from public.entries where round_id = p_round and role = 'seeker';
  v_mid_pick := v_mid[1 + floor(random() * array_length(v_mid, 1))::int];
  v_body := format(v_mid_pick,
    case
      when v_mid_pick like '%%coins of searches%%' then (select coalesce(round(sum(cost)), 0)::text from public.searches where round_id = p_round)
      when v_mid_pick like '%%pool%%' then round(r.pool)::text
      when v_mid_pick like '%%checked%%' then r.searched_count::text
      when v_mid_pick like '%%minutes left%%' then greatest(1, ceil(extract(epoch from (r.seek_ends_at - now())) / 60))::text
      when v_mid_pick like '%%moved%%' then e.moves::text
      when v_mid_pick like '%%of you%%' then greatest(v_seekers, 2)::text
      else ''
    end);
  v_body := trim(v_open[1 + floor(random() * array_length(v_open, 1))::int] || ' ' || v_body || ' ' ||
                 v_end[1 + floor(random() * array_length(v_end, 1))::int]);
  insert into public.chat_messages (round_id, sender_id, sender_name, sender_role, body)
    values (p_round, '00000000-0000-0000-0000-00000000b07a', coalesce(r.bot_name, 'The bot') || ' (bot)', 'hider', left(v_body, 500));
  update public.rounds set bot_teases = bot_teases + 1 where id = p_round;
  return 'teased';
end $$;

-- The round clock now also gives the bot its say in chat.
create or replace function public.tick_with_extras() returns text
language plpgsql security definer set search_path = public as $$
declare v text; r public.rounds;
begin
  v := public.tick();
  select * into r from public.rounds where status = 'seek';
  if found then
    begin
      v := v || ' / chat: ' || public.bot_tease(r.id);
    exception when others then
      v := v || ' / chat error: ' || sqlerrm;
    end;
  end if;
  return v;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('hideseek-tick');
    perform cron.schedule('hideseek-tick', '* * * * *', 'select public.tick_with_extras()');
  end if;
exception when others then
  raise notice 'pg_cron not updated (%)', sqlerrm;
end $$;

-- ============================================================ badges
-- Earned in a round and kept for good. Players can share them.
create table if not exists public.badges (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  round_id bigint references public.rounds (id) on delete set null,
  badge text not null,
  detail text,
  earned_at timestamptz not null default now(),
  unique (user_id, round_id, badge)
);
create index if not exists badges_user_idx on public.badges (user_id, earned_at desc);
alter table public.badges enable row level security;

create or replace function public.award_badges(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  v_n int := 0;
  v_first uuid;
  v_survivors int;
begin
  -- Survivors: made it to the end without being caught.
  select count(*) into v_survivors from public.entries where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'survivor', 'Stayed hidden till the end' from public.entries
    where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'ghost', 'Survived without moving once' from public.entries
    where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot and moves = 0
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'escape_artist', format('Survived after %s moves', moves) from public.entries
    where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot and moves >= 3
  on conflict do nothing;
  if v_survivors = 1 then
    insert into public.badges (user_id, round_id, badge, detail)
      select user_id, p_round, 'last_standing', 'The only hider left standing' from public.entries
      where round_id = p_round and role = 'hider' and not caught and user_id <> v_bot
    on conflict do nothing;
  end if;
  -- Finders.
  insert into public.badges (user_id, round_id, badge, detail)
    select caught_by, p_round, 'bot_hunter', 'Found the bot' from public.entries
    where round_id = p_round and user_id = v_bot and caught and caught_by is not null
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select caught_by, p_round, 'hat_trick', format('Caught %s hiders in one round', count(*)) from public.entries
    where round_id = p_round and caught and caught_by is not null and user_id <> v_bot
    group by caught_by having count(*) >= 3
  on conflict do nothing;
  select seeker_id into v_first from public.searches where round_id = p_round and caught > 0 order by created_at limit 1;
  if v_first is not null then
    insert into public.badges (user_id, round_id, badge, detail) values (v_first, p_round, 'first_blood', 'First catch of the round')
    on conflict do nothing;
  end if;
  insert into public.badges (user_id, round_id, badge, detail)
    select s.seeker_id, p_round, 'sharpshooter', 'Found someone with their very first search' from public.searches s
    where s.round_id = p_round and s.caught > 0
      and s.id = (select min(id) from public.searches s2 where s2.round_id = p_round and s2.seeker_id = s.seeker_id)
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'trapper', 'A drone trap caught someone sneaking in' from public.notifications
    where round_id = p_round and kind = 'trap' group by user_id
  on conflict do nothing;
  insert into public.badges (user_id, round_id, badge, detail)
    select user_id, p_round, 'big_win', format('Won %s coins in one round', round(sum(amount)))
    from public.ledger where round_id = p_round and user_id is not null and user_id <> v_bot
      and kind in ('catch_reward', 'bot_bounty', 'pool_hider', 'pool_seeker')
    group by user_id having sum(amount) >= 300
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Badges are handed out as each round finishes.
create or replace function public.badges_on_finish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    perform public.award_badges(new.id);
  end if;
  return new;
exception when others then
  raise warning 'badges failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists rounds_award_badges on public.rounds;
create trigger rounds_award_badges after update of status on public.rounds
  for each row execute function public.badges_on_finish();

-- ============================================================ coin balloons
-- Now and then a balloon carrying coins drifts by, just for one player. Popping it pays a few
-- coins, up to a daily limit. Each (player, day, slot) can only be claimed once.
create table if not exists public.balloon_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  slot int not null,
  coins numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, slot)
);
alter table public.balloon_claims enable row level security;

create or replace function public.claim_balloon(p_user uuid, p_slot int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_coins numeric := public.setting('balloon_coins');
  v_today int;
begin
  select count(*) into v_today from public.balloon_claims where user_id = p_user and day = current_date;
  if v_today >= public.setting('balloons_per_day') then raise exception 'That''s all the coin balloons for today. More tomorrow!'; end if;
  insert into public.balloon_claims (user_id, day, slot, coins) values (p_user, current_date, p_slot, v_coins);
  update public.profiles set coins = coins + v_coins where id = p_user;
  perform public.log_coins(p_user, null, 'balloon', v_coins);
  return jsonb_build_object('coins', v_coins, 'left_today', public.setting('balloons_per_day') - v_today - 1);
exception when unique_violation then
  raise exception 'Someone already popped that one';
end $$;

create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding', 'balloon')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ visitor count
create table if not exists public.site_counters (key text primary key, value bigint not null default 0);
insert into public.site_counters (key, value) values ('visits', 0) on conflict do nothing;
alter table public.site_counters enable row level security;

create or replace function public.count_visit() returns bigint
language sql security definer set search_path = public as $$
  update public.site_counters set value = value + 1 where key = 'visits' returning value;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('move_hider', 'search_tile', 'bot_think', 'bot_tease', 'tick_with_extras', 'award_badges', 'badges_on_finish', 'claim_balloon', 'count_visit')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 007_shields_payouts_passive.sql
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

-- ======================================================== 008_badge_collection.sql
-- HIDE & SEEK, part 8: the badge collection grows from 10 to 50 badges.
-- Hiding, seeking, drone play, career milestones, social and rare "you were there" badges.
-- Run once in Supabase → SQL Editor, after the 007 file (it is safe to run again).
--
-- Badges come in two kinds:
--   * round badges, won for something that happened in one round (they can be won again
--     in later rounds, and the menu shows "×3" etc.);
--   * career badges (milestones, first round, balloons...), won once ever. They remember the
--     round in which they were earned.
-- The bot never gets badges.

-- Hider shields (added by part 7 too; repeated here so this file also works on its own).
alter table public.entries add column if not exists shield_bought boolean not null default false,
                           add column if not exists shield_saved boolean not null default false;

-- Career badges look players up across all their rounds; these keep that quick.
create index if not exists entries_user_round_idx on public.entries (user_id, round_id);
create index if not exists entries_caught_by_idx on public.entries (caught_by) where caught_by is not null;
create index if not exists badges_user_badge_idx on public.badges (user_id, badge);

create or replace function public.award_badges(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  v_n int := 0;
  r public.rounds;
  v_end timestamptz;
  v_day date;
  v_hour int;
  v_dow int;
  -- Won once ever, not once per round.
  v_career text[] := array['rounds_5', 'rounds_25', 'rounds_100', 'catches_10', 'catches_50', 'survive_5', 'survive_25',
                           'coins_1k', 'coins_10k', 'streak_3', 'streak_7', 'bot_buster', 'shield_master',
                           'welcome', 'balloon_popper'];
begin
  select * into r from public.rounds where id = p_round;
  if not found then return 0; end if;
  v_end := coalesce(r.finished_at, now());
  v_day := (v_end at time zone 'UTC')::date;
  v_hour := extract(hour from v_end at time zone 'UTC')::int;
  v_dow := extract(isodow from v_end at time zone 'UTC')::int;

  with
  -- Everyone who played this round (bot left out), the hiders, and the survivors.
  ent as (select * from public.entries where round_id = p_round and user_id <> v_bot),
  hid as (select * from ent where role = 'hider'),
  surv as (select * from hid where not caught),
  -- All hiders including the bot, for "how did the round go" questions.
  allh as (select * from public.entries where round_id = p_round and role = 'hider'),
  hstat as (select count(*) as n, count(*) filter (where caught) as caught_n from allh),
  seekers as (select count(*) as n from public.entries where round_id = p_round and role = 'seeker'),
  srch as (select * from public.searches where round_id = p_round),
  swp as (select * from public.sweeps where round_id = p_round),
  noti as (select * from public.notifications where round_id = p_round),
  chat as (select * from public.chat_messages where round_id = p_round),
  players as (select distinct user_id from ent),

  -- Career numbers for the players in this round (finished rounds, this one included).
  hist as (
    select e.user_id, e.round_id, e.role, e.caught, e.shield_saved, r2.finished_at
    from public.entries e join public.rounds r2 on r2.id = e.round_id
    where e.user_id in (select user_id from players) and (r2.status = 'done' or r2.id = p_round)
  ),
  career as (
    select user_id, count(*) as rounds_n,
           count(*) filter (where role = 'hider' and not caught) as survived_n,
           count(*) filter (where shield_saved) as shields_n
    from hist group by user_id
  ),
  catches as (
    select caught_by as user_id, count(*) as n, count(*) filter (where user_id = v_bot) as bots
    from public.entries where caught and caught_by in (select user_id from players) group by caught_by
  ),
  won as (
    select user_id, sum(amount) as n from public.ledger
    where user_id in (select user_id from players) and kind in ('catch_reward', 'bot_bounty', 'pool_hider', 'pool_seeker')
    group by user_id
  ),
  pops as (
    select user_id, count(*) as n from public.balloon_claims where user_id in (select user_id from players) group by user_id
  ),
  -- Play streak: days in a row (UTC) with at least one finished round, ending today.
  days as (select distinct user_id, (finished_at at time zone 'UTC')::date as d from hist where finished_at is not null),
  isl as (select user_id, d, d - (row_number() over (partition by user_id order by d))::int as g from days),
  streak as (
    select a.user_id, count(*) as n from isl a join isl b on b.user_id = a.user_id and b.d = v_day and b.g = a.g
    group by a.user_id
  ),

  cand(user_id, badge, detail) as (
    -- ======================================== Hiding
    select user_id, 'survivor', 'Stayed hidden till the end' from surv
    union all
    select user_id, 'ghost', 'Survived without moving once' from surv where moves = 0
    union all
    select user_id, 'escape_artist', format('Survived after %s moves', moves) from surv where moves >= 3
    union all
    select user_id, 'last_standing', 'The only hider left standing' from surv where (select count(*) from surv) = 1
    union all
    select s.user_id, 'crowd_dodger', format('Survived with %s seekers hunting', k.n) from surv s, seekers k where k.n >= 5
    union all
    select s.user_id, 'against_odds', format('Survived when %s of %s hiders were found', h.caught_n, h.n)
      from surv s, hstat h where h.n >= 4 and h.caught_n * 4 >= h.n * 3
    union all
    select user_id, 'shield_saved', 'Your shield blocked a find' from hid where shield_saved
    union all
    select s.user_id, 'hot_streak', 'Stayed hidden 3 hiding rounds in a row' from surv s
      where (select count(*) filter (where not x.caught) from (
               select e2.caught from public.entries e2 join public.rounds r2 on r2.id = e2.round_id
               where e2.user_id = s.user_id and e2.role = 'hider' and e2.round_id <= p_round
                 and (r2.status = 'done' or r2.id = p_round)
               order by e2.round_id desc limit 3) x) = 3
    union all
    select user_id, 'last_second', 'Moved in the final minute and got away' from surv
      where last_move_at is not null and last_move_at >= v_end - interval '60 seconds'

    -- ======================================== Seeking
    union all
    select caught_by, 'bot_hunter', 'Found the bot' from allh where user_id = v_bot and caught and caught_by is not null
    union all
    select caught_by, 'hat_trick', format('Caught %s hiders in one round', count(*)) from hid
      where caught and caught_by is not null group by caught_by having count(*) >= 3
    union all
    select x.seeker_id, 'first_blood', 'First catch of the round'
      from (select seeker_id from srch where caught > 0 order by id limit 1) x
    union all
    select s.seeker_id, 'sharpshooter', 'Found someone with their very first search' from srch s
      where s.caught > 0 and s.id = (select min(id) from srch s2 where s2.seeker_id = s.seeker_id)
    union all
    select distinct seeker_id, 'double_trouble', format('Found %s hiders with one search', caught) from srch where caught >= 2
    union all
    select distinct seeker_id, 'freebie_find', 'Found someone with a free search' from srch where caught > 0 and cost = 0
    union all
    select x.seeker_id, 'the_closer', 'Found the last hider and ended the round'
      from (select seeker_id from srch where caught > 0 order by id desc limit 1) x, hstat h
      where h.n > 0 and h.caught_n = h.n
    union all
    select s.seeker_id, 'comeback_kid', format('Missed %s times, then found someone', count(*)) from srch s
      join (select seeker_id, min(id) as hit from srch where caught > 0 group by seeker_id) f on f.seeker_id = s.seeker_id
      where s.caught = 0 and s.id < f.hit group by s.seeker_id having count(*) >= 5
    union all
    select distinct seeker_id, 'quick_draw', 'Found someone in the first minute of seeking' from srch
      where caught > 0 and created_at <= r.join_ends_at + interval '60 seconds'
    union all
    select x.caught_by, 'clean_sweep', format('Found all %s hiders yourself', h.n)
      from (select min(caught_by::text)::uuid as caught_by from allh
            having count(*) >= 2 and bool_and(caught) and count(distinct caught_by) = 1) x, hstat h
      where x.caught_by is not null

    -- ======================================== Drones
    union all
    select user_id, 'trapper', 'A drone trap caught someone sneaking in' from noti where kind = 'trap' group by user_id
    union all
    select user_id, 'trap_master', format('Your traps went off %s times', count(*)) from noti
      where kind = 'trap' group by user_id having count(*) >= 3
    union all
    select s.user_id, 'close_shave', 'Got swept by a drone and still got away' from surv s
      where s.last_swept_at is not null or exists (select 1 from noti n where n.user_id = s.user_id and n.kind = 'swept')
    union all
    select s.user_id, 'drone_dodger', 'Walked into a drone trap and still got away' from surv s
      where exists (select 1 from noti n where n.user_id = s.user_id and n.kind = 'trapped')
    union all
    select seeker_id, 'drone_pilot', format('Flew %s drone sweeps in one round', count(*)) from swp
      group by seeker_id having count(*) >= 5
    union all
    select seeker_id, 'drone_ace', format('%s sweeps spotted someone', count(*)) from swp
      where swp.found group by seeker_id having count(*) >= 3
    union all
    select distinct s.seeker_id, 'drone_combo', 'Spotted someone with a drone, then found them' from srch s
      where s.caught > 0 and exists (select 1 from swp w where w.seeker_id = s.seeker_id and w.found
                                       and w.created_at <= s.created_at
                                       and public.in_area(s.tile, w.tile, w.radius))

    -- ======================================== Milestones (once ever)
    union all
    select user_id, 'rounds_5', 'Played 5 rounds' from career where rounds_n >= 5
    union all
    select user_id, 'rounds_25', 'Played 25 rounds' from career where rounds_n >= 25
    union all
    select user_id, 'rounds_100', 'Played 100 rounds' from career where rounds_n >= 100
    union all
    select user_id, 'survive_5', 'Survived 5 rounds' from career where survived_n >= 5
    union all
    select user_id, 'survive_25', 'Survived 25 rounds' from career where survived_n >= 25
    union all
    select user_id, 'shield_master', 'Saved by a shield 3 times' from career where shields_n >= 3
    union all
    select user_id, 'catches_10', 'Found 10 hiders' from catches where n >= 10
    union all
    select user_id, 'catches_50', 'Found 50 hiders' from catches where n >= 50
    union all
    select user_id, 'bot_buster', 'Found the bot 5 times' from catches where bots >= 5
    union all
    select user_id, 'coins_1k', 'Won 1,000 coins in total' from won where n >= 1000
    union all
    select user_id, 'coins_10k', 'Won 10,000 coins in total' from won where n >= 10000
    union all
    select user_id, 'streak_3', 'Played 3 days in a row' from streak where n >= 3
    union all
    select user_id, 'streak_7', 'Played 7 days in a row' from streak where n >= 7

    -- ======================================== Social
    union all
    select sender_id, 'chatterbox', format('Sent %s chat messages in one round', count(*)) from chat
      group by sender_id having count(*) >= 10
    union all
    select distinct sender_id, 'on_air', 'Sent a voice note' from chat where audio_path is not null
    union all
    select distinct sender_id, 'whisper', 'Sent a private message' from chat where recipient_id is not null
    union all
    select p.user_id, 'party_time', format('Played in a round with %s players', (select count(*) from players))
      from players p where (select count(*) from players) >= 20

    -- ======================================== Rare
    union all
    select user_id, 'welcome', 'Played your first round' from players
    union all
    select user_id, 'big_win', format('Won %s coins in one round', round(sum(amount))) from public.ledger
      where round_id = p_round and user_id is not null
        and kind in ('catch_reward', 'bot_bounty', 'pool_hider', 'pool_seeker')
      group by user_id having sum(amount) >= 300
    union all
    select user_id, 'high_roller', format('Played for a pool of %s coins', round(r.pool)) from players where r.pool >= 1000
    union all
    select user_id, 'night_owl', 'Played a round that ended after midnight' from players where v_hour < 5
    union all
    select user_id, 'early_bird', 'Played a round that ended before 8 in the morning' from players where v_hour between 5 and 7
    union all
    select user_id, 'weekend_warrior', 'Played a round at the weekend' from players where v_dow in (6, 7)
    union all
    select user_id, 'balloon_popper', 'Popped 10 coin balloons' from pops where n >= 10
  )
  insert into public.badges (user_id, round_id, badge, detail)
    select c.user_id, p_round, c.badge, c.detail
    from cand c join public.profiles p on p.id = c.user_id and not p.is_bot
    where c.user_id <> v_bot
      and not (c.badge = any (v_career)
               and exists (select 1 from public.badges b where b.user_id = c.user_id and b.badge = c.badge))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Badges are handed out once the round has fully finished: the trigger now waits until the
-- end of the transaction, so the round's payouts are already in the ledger ("Big Win" and
-- "Coin Collector" need them).
create or replace function public.badges_on_finish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    perform public.award_badges(new.id);
  end if;
  return new;
exception when others then
  raise warning 'badges failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists rounds_award_badges on public.rounds;
create constraint trigger rounds_award_badges after update of status on public.rounds
  deferrable initially deferred
  for each row execute function public.badges_on_finish();

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('award_badges', 'badges_on_finish')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 009_levels_powerups.sql
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

-- ======================================================== 010_ads_sponsors.sql
-- HIDE & SEEK, part 10: paid billboard ads and sponsored prize pools.
-- Run once in Supabase → SQL Editor, after 009 (or after 008 if there is no 009).
--
-- Billboard ads are sold in "slots": 1 slot = a guaranteed number of billboard views
-- (ad_views_per_slot, 1,000 by default), delivered within ad_days (7) days. Every billboard
-- in every city rotates through the live ads, so what we sell is a share of views, not a
-- number of billboards. Ads are served more often when they are behind schedule (views
-- still to deliver ÷ time left), so every campaign finishes on time. An ad that is late
-- keeps showing until it has had all its views.
--
-- Sponsored pools: a brand pays to add coins to a round's prize pool ("Prize pool by …").
-- One sponsor per round. If the current round is still in its hiding window, the coins go
-- in straight away; otherwise they wait for the next new round.
--
-- Everything here is used by the server only (service_role). Nobody can read these tables
-- from the browser.

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('ad_views_per_slot',        1000, 'Billboard views in one ad slot'),
  ('ad_slot_price_ngn',        5000, 'Price of one ad slot in naira'),
  ('ad_days',                  7,    'Days we promise to deliver an ad''s views in'),
  ('ad_max_slots',             50,   'Most slots one advertiser can buy at once'),
  ('ad_viewer_hourly_cap',     30,   'Most views one viewer can add to one ad in an hour'),
  ('ad_open_coins',            2,    'Coins a signed-in player gets for opening (tapping) an ad'),
  ('ad_open_rewards_per_day',  10,   'Most paid ad opens per player per day'),
  ('sponsor_coins_per_ngn',    0.2,  'Coins added to a prize pool per naira a sponsor pays (0.2 = 5 naira a coin)'),
  ('sponsor_min_ngn',          5000, 'Smallest prize pool sponsorship in naira')
on conflict (key) do nothing;

-- ============================================================ ads
create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'reviewing', 'live', 'rejected', 'finished', 'held')),
  brand text not null check (char_length(brand) between 1 and 60),
  headline text not null check (char_length(headline) between 1 and 60),
  link_url text check (link_url is null or (link_url ~ '^https://' and char_length(link_url) <= 500)),
  image_path text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  slots int not null check (slots between 1 and 50),
  views_bought int not null check (views_bought > 0),
  views_delivered int not null default 0,
  clicks int not null default 0,
  opens int not null default 0,
  amount_kobo bigint not null check (amount_kobo > 0),
  paystack_reference text not null unique,
  policy_accepted_at timestamptz not null,
  paid_at timestamptz,
  review_started_at timestamptz,
  review_notes text,
  starts_at timestamptz,
  ends_at timestamptz,
  finished_at timestamptz,
  last_report_day date,
  final_report_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ads_status_idx on public.ads (status, created_at);

-- One row per ad per day, for the daily report emails.
create table if not exists public.ad_daily (
  ad_id uuid not null references public.ads (id) on delete cascade,
  day date not null,
  views int not null default 0,
  opens int not null default 0,
  clicks int not null default 0,
  primary key (ad_id, day)
);

-- Rate limit: how much one viewer (a hashed IP + browser, never stored in the clear) has
-- added to one ad this hour. Old rows are cleared by ad_housekeeping().
create table if not exists public.ad_view_buckets (
  viewer text not null,
  ad_id uuid not null references public.ads (id) on delete cascade,
  hour timestamptz not null,
  views int not null default 0,
  opens int not null default 0,
  clicks int not null default 0,
  primary key (viewer, ad_id, hour)
);
create index if not exists ad_view_buckets_hour_idx on public.ad_view_buckets (hour);

-- Coins paid to players for opening ads (one per player per ad per day).
create table if not exists public.ad_open_rewards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ad_id uuid not null references public.ads (id) on delete cascade,
  day date not null,
  coins numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ad_id, day)
);
create index if not exists ad_open_rewards_day_idx on public.ad_open_rewards (user_id, day);

-- When an ad goes live (by the AI review, or by the owner changing status to 'live' in the
-- Table Editor), its 7-day window starts. Ads that have all their views are finished.
create or replace function public.ads_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    if new.starts_at is null then new.starts_at := now(); end if;
    if new.ends_at is null then
      new.ends_at := new.starts_at + make_interval(days => public.setting('ad_days')::int);
    end if;
  end if;
  if new.status = 'live' and new.views_delivered >= new.views_bought then
    new.status := 'finished';
  end if;
  if new.status = 'finished' and new.finished_at is null then new.finished_at := now(); end if;
  return new;
end $$;
drop trigger if exists ads_before_update on public.ads;
create trigger ads_before_update before update on public.ads
  for each row execute function public.ads_before_update();

-- ============================================================ serving ads
-- A weighted random pick of up to p_n live ads, without repeats. Weight = views still to
-- deliver ÷ hours left (at least 1 hour, so late ads get a strong push). Uses the
-- Efraimidis–Spirakis trick: order by -ln(random()) / weight.
create or replace function public.ad_serve(p_n int)
returns table (id uuid, image_path text, headline text, brand text, link_url text)
language sql volatile security definer set search_path = public as $$
  select a.id, a.image_path, a.headline, a.brand, a.link_url
  from public.ads a
  where a.status = 'live' and a.views_delivered < a.views_bought
  order by -ln(greatest(random(), 1e-12))
           / ((a.views_bought - a.views_delivered)::float8
              / greatest(extract(epoch from (coalesce(a.ends_at, now()) - now())) / 3600.0, 1.0))
  limit greatest(0, least(coalesce(p_n, 24), 40))
$$;

-- Adds a viewer's billboard views: p_views is {"<ad id>": count, ...}. Each viewer can add at
-- most ad_viewer_hourly_cap views to an ad per hour; anything over that is ignored.
create or replace function public.ad_track_views(p_views jsonb, p_viewer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cap int := public.setting('ad_viewer_hourly_cap')::int;
  v_hour timestamptz := date_trunc('hour', now());
  v_counted int := 0;
  v_ad uuid;
  v_want int;
  v_old int;
  v_add int;
  v_room int;
  x record;
begin
  if p_views is null or jsonb_typeof(p_views) <> 'object' or coalesce(p_viewer, '') = '' then
    return jsonb_build_object('counted', 0);
  end if;
  for x in select key, value from jsonb_each(p_views) order by key limit 40 loop
    continue when x.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    continue when jsonb_typeof(x.value) <> 'number';
    v_want := least(greatest(floor((x.value #>> '{}')::numeric), 0), v_cap)::int;
    continue when v_want <= 0;
    v_ad := x.key::uuid;
    continue when not exists (select 1 from public.ads a where a.id = v_ad and a.status = 'live');

    -- Lock order everywhere: the viewer's bucket first, then the ad.
    insert into public.ad_view_buckets (viewer, ad_id, hour) values (left(p_viewer, 128), v_ad, v_hour)
      on conflict do nothing;
    select b.views into v_old from public.ad_view_buckets b
      where b.viewer = left(p_viewer, 128) and b.ad_id = v_ad and b.hour = v_hour for update;
    continue when v_old >= v_cap;
    select a.views_bought - a.views_delivered into v_room from public.ads a
      where a.id = v_ad and a.status = 'live' for update;
    continue when not found or v_room <= 0;
    v_add := least(v_want, v_cap - v_old, v_room);
    continue when v_add <= 0;

    -- (The ads trigger marks the ad finished once it has all its views.)
    update public.ads a set views_delivered = a.views_delivered + v_add where a.id = v_ad;
    update public.ad_view_buckets b set views = b.views + v_add
      where b.viewer = left(p_viewer, 128) and b.ad_id = v_ad and b.hour = v_hour;
    insert into public.ad_daily (ad_id, day, views) values (v_ad, current_date, v_add)
      on conflict (ad_id, day) do update set views = public.ad_daily.views + excluded.views;
    v_counted := v_counted + v_add;
  end loop;
  return jsonb_build_object('counted', v_counted);
end $$;

-- Someone tapped a billboard to look at the ad. Counts an "open" (at most 5 per viewer per
-- ad per hour). A signed-in player also gets a few coins: once per ad per day, and at most
-- ad_open_rewards_per_day times a day. Returns the coins paid and how many paid opens are left today.
create or replace function public.ad_open(p_ad uuid, p_user uuid default null, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(coalesce(nullif(p_viewer, ''), 'anon'), 128);
  v_coins numeric := public.setting('ad_open_coins');
  v_per_day int := public.setting('ad_open_rewards_per_day')::int;
  v_today int := 0;
  v_paid numeric := 0;
  v_opens int;
  p public.profiles;
begin
  if not exists (select 1 from public.ads where id = p_ad and status in ('live', 'finished')) then
    raise exception 'That ad isn''t showing any more';
  end if;

  insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, p_ad, v_hour) on conflict do nothing;
  update public.ad_view_buckets set opens = opens + 1
    where viewer = v_viewer and ad_id = p_ad and hour = v_hour
    returning opens into v_opens;
  if v_opens <= 5 then
    update public.ads set opens = opens + 1 where id = p_ad;
    insert into public.ad_daily (ad_id, day, opens) values (p_ad, current_date, 1)
      on conflict (ad_id, day) do update set opens = public.ad_daily.opens + 1;
  end if;

  if p_user is not null then
    select * into p from public.profiles where id = p_user for update;
    if found and not p.is_bot and not p.frozen then
      select count(*) into v_today from public.ad_open_rewards where user_id = p_user and day = current_date;
      if v_coins > 0 and v_today < v_per_day
         and exists (select 1 from public.ads where id = p_ad and status = 'live') then
        insert into public.ad_open_rewards (user_id, ad_id, day, coins)
          values (p_user, p_ad, current_date, v_coins) on conflict do nothing;
        if found then
          update public.profiles set coins = coins + v_coins where id = p_user;
          perform public.log_coins(p_user, null, 'ad_reward', v_coins);
          v_paid := v_coins;
          v_today := v_today + 1;
        end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('coins', v_paid,
    'left_today', case when p_user is null then 0 else greatest(v_per_day - v_today, 0) end);
end $$;

-- Someone followed the ad's link (at most 5 counted per viewer per ad per hour).
create or replace function public.ad_click(p_ad uuid, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(coalesce(nullif(p_viewer, ''), 'anon'), 128);
  v_clicks int;
begin
  if not exists (select 1 from public.ads where id = p_ad and status in ('live', 'finished') and link_url is not null) then
    return jsonb_build_object('counted', false);
  end if;
  insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, p_ad, v_hour) on conflict do nothing;
  update public.ad_view_buckets set clicks = clicks + 1
    where viewer = v_viewer and ad_id = p_ad and hour = v_hour
    returning clicks into v_clicks;
  if v_clicks > 5 then return jsonb_build_object('counted', false); end if;
  update public.ads set clicks = clicks + 1 where id = p_ad;
  insert into public.ad_daily (ad_id, day, clicks) values (p_ad, current_date, 1)
    on conflict (ad_id, day) do update set clicks = public.ad_daily.clicks + 1;
  return jsonb_build_object('counted', true);
end $$;

-- ============================================================ paying for an ad
-- Paystack confirmed a payment of p_amount_kobo for this reference. Marks the ad paid (once)
-- and hands out the right to run the AI review: claimed = true for exactly one caller (or
-- again if a review got stuck for 5+ minutes). Safe to call many times.
create or replace function public.ad_paid(p_reference text, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.ads; v_claimed boolean := false;
begin
  select * into a from public.ads where paystack_reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if a.status = 'pending_payment' then
    if p_amount_kobo < a.amount_kobo then
      return jsonb_build_object('found', true, 'id', a.id, 'status', a.status, 'claimed', false, 'short', true);
    end if;
    a.status := 'paid';
    update public.ads set status = 'paid', paid_at = now() where id = a.id;
  end if;
  if a.status = 'paid' or (a.status = 'reviewing' and a.review_started_at < now() - interval '5 minutes') then
    update public.ads set status = 'reviewing', review_started_at = now() where id = a.id;
    a.status := 'reviewing';
    v_claimed := true;
  end if;
  return jsonb_build_object('found', true, 'id', a.id, 'status', a.status, 'claimed', v_claimed);
end $$;

-- The review's verdict: 'live', 'rejected' or 'held' (for the owner to check by hand).
create or replace function public.ad_set_review(p_ad uuid, p_status text, p_notes text) returns text
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_status not in ('live', 'rejected', 'held') then raise exception 'Bad review status'; end if;
  update public.ads set status = p_status, review_notes = left(p_notes, 1000)
    where id = p_ad and status = 'reviewing'
    returning status into v_status;
  return coalesce(v_status, (select status from public.ads where id = p_ad));
end $$;

-- ============================================================ sponsored prize pools
alter table public.rounds add column if not exists sponsor_name text;
alter table public.rounds add column if not exists sponsor_logo text;
alter table public.rounds add column if not exists sponsor_coins numeric(14,2) not null default 0;

create table if not exists public.pool_sponsors (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'queued', 'applied', 'refunded')),
  brand text not null check (char_length(brand) between 1 and 60),
  logo_path text,
  logo_url text,
  coins numeric(14,2) not null check (coins > 0),
  amount_kobo bigint not null check (amount_kobo > 0),
  paystack_reference text not null unique,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  round_id bigint references public.rounds (id),
  paid_at timestamptz,
  applied_at timestamptz,
  report_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pool_sponsors_queue_idx on public.pool_sponsors (status, paid_at);

-- Puts a sponsor's coins into a round's pool. New coins, so they are logged as 'sponsor'.
create or replace function public.sponsor_apply(p_sponsor uuid, p_round bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare s public.pool_sponsors;
begin
  select * into s from public.pool_sponsors where id = p_sponsor and status = 'queued' for update;
  if not found then return false; end if;
  update public.rounds set pool = pool + s.coins, sponsor_name = s.brand, sponsor_logo = s.logo_url,
         sponsor_coins = s.coins
    where id = p_round and status <> 'done' and sponsor_name is null;
  if not found then return false; end if;
  perform public.log_coins(null, p_round, 'sponsor', s.coins, false, 'Prize pool by ' || s.brand);
  update public.pool_sponsors set status = 'applied', round_id = p_round, applied_at = now() where id = s.id;
  return true;
end $$;

-- Paystack confirmed a sponsor's payment. Queues it (once), then puts it into the current
-- round straight away if that round is still in its hiding window and has no sponsor yet.
create or replace function public.sponsor_paid(p_reference text, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.pool_sponsors; r public.rounds; v_new boolean := false;
begin
  select * into s from public.pool_sponsors where paystack_reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if s.status = 'pending_payment' then
    if p_amount_kobo < s.amount_kobo then
      return jsonb_build_object('found', true, 'id', s.id, 'status', s.status, 'short', true);
    end if;
    update public.pool_sponsors set status = 'queued', paid_at = now() where id = s.id;
    s.status := 'queued';
    s.paid_at := now();
    v_new := true;
    -- Only jump the queue if nobody else is waiting.
    if not exists (select 1 from public.pool_sponsors where status = 'queued' and id <> s.id) then
      select * into r from public.rounds where status = 'join' and sponsor_name is null for update;
      if found and public.sponsor_apply(s.id, r.id) then
        s.status := 'applied';
        s.round_id := r.id;
      end if;
    end if;
  end if;
  return jsonb_build_object('found', true, 'id', s.id, 'status', s.status, 'round_id', s.round_id,
    'coins', s.coins, 'newly_paid', v_new, 'queued_ahead',
    (select count(*) from public.pool_sponsors q where q.status = 'queued' and q.paid_at < coalesce(s.paid_at, now())));
end $$;

-- Every new round takes the oldest waiting sponsor (if any).
create or replace function public.rounds_take_sponsor() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if new.sponsor_name is null then
    select id into v_id from public.pool_sponsors where status = 'queued'
      order by paid_at, created_at limit 1 for update skip locked;
    if v_id is not null then perform public.sponsor_apply(v_id, new.id); end if;
  end if;
  return null;
exception when others then
  raise warning 'sponsor not applied: %', sqlerrm;
  return null;
end $$;
drop trigger if exists rounds_take_sponsor on public.rounds;
create trigger rounds_take_sponsor after insert on public.rounds
  for each row execute function public.rounds_take_sponsor();

-- ============================================================ upkeep
-- Clears old rate-limit rows and unpaid checkouts (returns their image paths so the server
-- can delete the files too).
create or replace function public.ad_housekeeping() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_paths text[]; v_buckets int;
begin
  delete from public.ad_view_buckets where hour < now() - interval '3 hours';
  get diagnostics v_buckets = row_count;
  with gone as (
    delete from public.ads where status = 'pending_payment' and created_at < now() - interval '3 days'
    returning image_path
  ), gone_sponsors as (
    delete from public.pool_sponsors where status = 'pending_payment' and created_at < now() - interval '3 days'
    returning logo_path
  )
  select coalesce(array_agg(p) filter (where p is not null), '{}') into v_paths
  from (select image_path p from gone union all select logo_path from gone_sponsors) x;
  return jsonb_build_object('buckets_cleared', v_buckets, 'paths', to_jsonb(v_paths));
end $$;

-- ============================================================ coin books
-- Ad rewards are new coins.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
alter table public.ads enable row level security;
alter table public.ad_daily enable row level security;
alter table public.ad_view_buckets enable row level security;
alter table public.ad_open_rewards enable row level security;
alter table public.pool_sponsors enable row level security;

-- Ad images (and sponsor logos) are public pictures, 2 MB at most.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ads', 'ads', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('ads_before_update', 'ad_serve', 'ad_track_views', 'ad_open', 'ad_click', 'ad_paid', 'ad_set_review',
            'sponsor_apply', 'sponsor_paid', 'rounds_take_sponsor', 'ad_housekeeping')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 011_badges_hard.sql
-- HIDE & SEEK, part 11: 50 more badges (100 in all), and these ones are HARD.
-- Long hiding streaks, huge catches, decoys, shields, respawns, big searches, levels,
-- giant coin totals, a 30-day streak and "top of the weekly leaderboard".
-- Run once in Supabase → SQL Editor, after part 8 (and part 9 if you have it). Safe to run again.
--
-- Same two kinds as part 8:
--   * round badges can be won again in later rounds (the menu shows "×3");
--   * career badges are won once ever.
-- The bot never gets badges. Everything is checked when a round finishes.

-- ============================================================ columns this file reads
-- (Part 9 adds these for real; repeated here so this file also works on its own.)
alter table public.profiles add column if not exists level int not null default 1,
                            add column if not exists shield_uses int not null default 0,
                            add column if not exists decoy_uses int not null default 0,
                            add column if not exists respawn_uses int not null default 0;
alter table public.entries add column if not exists shield_bought boolean not null default false,
                           add column if not exists shield_saved boolean not null default false,
                           add column if not exists decoy_used boolean not null default false,
                           add column if not exists respawned boolean not null default false,
                           add column if not exists respawned_at timestamptz;
alter table public.searches add column if not exists area boolean not null default false,
                            add column if not exists decoys int not null default 0;

-- A hider's decoy: a fake hider on a tile. Searching it finds nothing; sweeps over it say "yes".
create table if not exists public.decoys (
  id bigserial primary key,
  round_id bigint references public.rounds (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  tile int not null,
  created_at timestamptz default now(),
  found_by uuid,
  found_at timestamptz,
  outcome text
);
alter table public.decoys add column if not exists found_by uuid,
                          add column if not exists found_at timestamptz,
                          add column if not exists outcome text;
alter table public.decoys enable row level security;  -- no policies here: only the server reads them
create index if not exists decoys_round_idx on public.decoys (round_id);
create index if not exists decoys_user_idx on public.decoys (user_id);
create index if not exists ledger_kind_day_idx on public.ledger (kind, created_at);

-- ============================================================ the badge rules (all 100)
create or replace function public.award_badges(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  v_n int := 0;
  r public.rounds;
  v_end timestamptz;
  v_day date;
  v_hour int;
  v_dow int;
  -- Won once ever, not once per round.
  v_career text[] := array['rounds_5', 'rounds_25', 'rounds_100', 'catches_10', 'catches_50', 'survive_5', 'survive_25',
                           'coins_1k', 'coins_10k', 'streak_3', 'streak_7', 'bot_buster', 'shield_master',
                           'welcome', 'balloon_popper',
                           -- part 11
                           'bounty_hunter', 'illusionist', 'immortal',
                           'level_5', 'level_10', 'level_20', 'level_30', 'level_50',
                           'coins_5k', 'coins_25k', 'coins_100k', 'rounds_50', 'rounds_250', 'rounds_500',
                           'streak_14', 'streak_30', 'catches_100', 'catches_500', 'survive_50', 'survive_100',
                           'bot_terminator', 'collector_80'];
begin
  select * into r from public.rounds where id = p_round;
  if not found then return 0; end if;
  v_end := coalesce(r.finished_at, now());
  v_day := (v_end at time zone 'UTC')::date;
  v_hour := extract(hour from v_end at time zone 'UTC')::int;
  v_dow := extract(isodow from v_end at time zone 'UTC')::int;

  with
  -- Everyone who played this round (bot left out), the hiders, and the survivors.
  ent as (select * from public.entries where round_id = p_round and user_id <> v_bot),
  hid as (select * from ent where role = 'hider'),
  surv as (select * from hid where not caught),
  -- All hiders including the bot, for "how did the round go" questions.
  allh as (select * from public.entries where round_id = p_round and role = 'hider'),
  hstat as (select count(*) as n, count(*) filter (where caught) as caught_n from allh),
  seekers as (select count(*) as n from public.entries where round_id = p_round and role = 'seeker'),
  srch as (select * from public.searches where round_id = p_round),
  swp as (select * from public.sweeps where round_id = p_round),
  noti as (select * from public.notifications where round_id = p_round),
  chat as (select * from public.chat_messages where round_id = p_round),
  dec as (select * from public.decoys where round_id = p_round and user_id <> v_bot),
  players as (select distinct user_id from ent),
  lvl as (select id as user_id, level from public.profiles where id in (select user_id from players)),

  -- Career numbers for the players in this round (finished rounds, this one included).
  hist as (
    select e.user_id, e.round_id, e.role, e.caught, e.shield_saved, e.respawned, r2.finished_at
    from public.entries e join public.rounds r2 on r2.id = e.round_id
    where e.user_id in (select user_id from players) and (r2.status = 'done' or r2.id = p_round)
  ),
  career as (
    select user_id, count(*) as rounds_n,
           count(*) filter (where role = 'hider' and not caught) as survived_n,
           count(*) filter (where shield_saved) as shields_n,
           count(*) filter (where respawned and not caught) as phoenix_n
    from hist group by user_id
  ),
  -- Hiding rounds survived in a row, up to and including this one.
  last_caught as (
    select user_id, max(round_id) as rid from hist where role = 'hider' and caught and round_id <= p_round group by user_id
  ),
  hrun as (
    select h.user_id, count(*) as n from hist h left join last_caught l on l.user_id = h.user_id
    where h.role = 'hider' and h.round_id <= p_round and h.round_id > coalesce(l.rid, 0)
    group by h.user_id
  ),
  catches as (
    select caught_by as user_id, count(*) as n, count(*) filter (where user_id = v_bot) as bots
    from public.entries where caught and caught_by in (select user_id from players) group by caught_by
  ),
  won as (
    select user_id, sum(amount) as n from public.ledger
    where user_id in (select user_id from players)
      and kind in ('catch_reward', 'bot_bounty', 'pool_hider', 'pool_seeker', 'level_bonus')
    group by user_id
  ),
  bounty as (
    select user_id, sum(amount) as n from public.ledger
    where user_id in (select user_id from players) and kind = 'level_bonus' group by user_id
  ),
  pops as (
    select user_id, count(*) as n from public.balloon_claims where user_id in (select user_id from players) group by user_id
  ),
  owned as (
    select user_id, count(distinct badge) as n from public.badges
    where user_id in (select user_id from players) and badge <> 'collector_80' group by user_id
  ),
  decoy_career as (
    select user_id, count(*) as n from public.decoys
    where user_id in (select user_id from players) and found_by is not null group by user_id
  ),
  -- How many different hunters each decoy in this round fooled (searched it, or swept over it).
  fooled as (
    select d.user_id, count(distinct x.hunter) as n
    from dec d
    cross join lateral (
      select s.seeker_id as hunter from srch s
        where s.tile = d.tile and s.decoys > 0 and s.created_at >= d.created_at
      union
      select w.seeker_id from swp w
        where w.found and w.created_at >= d.created_at and (d.found_at is null or w.created_at <= d.found_at)
          and public.in_area(d.tile, w.tile, w.radius)
      union
      select d.found_by where d.found_by is not null
    ) x
    where x.hunter <> v_bot
    group by d.user_id
  ),
  -- Play streak: days in a row (UTC) with at least one finished round, ending today.
  days as (select distinct user_id, (finished_at at time zone 'UTC')::date as d from hist where finished_at is not null),
  isl as (select user_id, d, d - (row_number() over (partition by user_id order by d))::int as g from days),
  streak as (
    select a.user_id, count(*) as n from isl a join isl b on b.user_id = a.user_id and b.d = v_day and b.g = a.g
    group by a.user_id
  ),
  -- The last 3 rounds the bot played: was it found by the same person every time?
  bot3 as (
    select min(caught_by::text)::uuid as user_id from (
      select e.caught, e.caught_by from public.entries e join public.rounds r2 on r2.id = e.round_id
      where e.user_id = v_bot and e.round_id <= p_round and (r2.status = 'done' or r2.id = p_round)
      order by e.round_id desc limit 3) x
    having count(*) = 3 and bool_and(caught) and count(distinct caught_by) = 1
  ),
  -- The weekly leaderboard (coins won in the 7 days up to the end of this round).
  week as (
    select l.user_id, sum(l.amount) as n from public.ledger l join public.profiles p on p.id = l.user_id and not p.is_bot
    where l.kind in ('catch_reward', 'bot_bounty', 'pool_hider', 'pool_seeker')
      and l.created_at > v_end - interval '7 days' and l.created_at <= v_end and l.user_id <> v_bot
    group by l.user_id
  ),
  champ as (
    select user_id from week
    where n > 0 and n = (select max(n) from week) and (select count(*) from week where n > 0) >= 5
  ),
  -- A level-10 hunter's big search: every tile row of it shares the seeker and the time.
  bigs as (
    select seeker_id, sum(caught) as caught from srch where area group by seeker_id, created_at
  ),

  cand(user_id, badge, detail) as (
    -- ======================================== Hiding
    select user_id, 'survivor', 'Stayed hidden till the end' from surv
    union all
    select user_id, 'ghost', 'Survived without moving once' from surv where moves = 0
    union all
    select user_id, 'escape_artist', format('Survived after %s moves', moves) from surv where moves >= 3
    union all
    select user_id, 'last_standing', 'The only hider left standing' from surv where (select count(*) from surv) = 1
    union all
    select s.user_id, 'crowd_dodger', format('Survived with %s hunters on the prowl', k.n) from surv s, seekers k where k.n >= 5
    union all
    select s.user_id, 'against_odds', format('Survived when %s of %s hiders were found', h.caught_n, h.n)
      from surv s, hstat h where h.n >= 4 and h.caught_n * 4 >= h.n * 3
    union all
    select user_id, 'shield_saved', 'Your shield blocked a find' from hid where shield_saved
    union all
    select s.user_id, 'hot_streak', 'Stayed hidden 3 hiding rounds in a row' from surv s
      where (select count(*) filter (where not x.caught) from (
               select e2.caught from public.entries e2 join public.rounds r2 on r2.id = e2.round_id
               where e2.user_id = s.user_id and e2.role = 'hider' and e2.round_id <= p_round
                 and (r2.status = 'done' or r2.id = p_round)
               order by e2.round_id desc limit 3) x) = 3
    union all
    select user_id, 'last_second', 'Moved in the final minute and got away' from surv
      where last_move_at is not null and last_move_at >= v_end - interval '60 seconds'

    -- ======================================== Seeking
    union all
    select caught_by, 'bot_hunter', 'Found the bot' from allh where user_id = v_bot and caught and caught_by is not null
    union all
    select caught_by, 'hat_trick', format('Caught %s hiders in one round', count(*)) from hid
      where caught and caught_by is not null group by caught_by having count(*) >= 3
    union all
    select x.seeker_id, 'first_blood', 'First catch of the round'
      from (select seeker_id from srch where caught > 0 order by id limit 1) x
    union all
    select s.seeker_id, 'sharpshooter', 'Found someone with their very first search' from srch s
      where s.caught > 0 and s.id = (select min(id) from srch s2 where s2.seeker_id = s.seeker_id)
    union all
    select distinct seeker_id, 'double_trouble', format('Found %s hiders with one search', caught) from srch where caught >= 2
    union all
    select distinct seeker_id, 'freebie_find', 'Found someone with a free search' from srch where caught > 0 and cost = 0
    union all
    select x.seeker_id, 'the_closer', 'Found the last hider and ended the round'
      from (select seeker_id from srch where caught > 0 order by id desc limit 1) x, hstat h
      where h.n > 0 and h.caught_n = h.n
    union all
    select s.seeker_id, 'comeback_kid', format('Missed %s times, then found someone', count(*)) from srch s
      join (select seeker_id, min(id) as hit from srch where caught > 0 group by seeker_id) f on f.seeker_id = s.seeker_id
      where s.caught = 0 and s.id < f.hit group by s.seeker_id having count(*) >= 5
    union all
    select distinct seeker_id, 'quick_draw', 'Found someone in the first minute of hunting' from srch
      where caught > 0 and created_at <= r.join_ends_at + interval '60 seconds'
    union all
    select x.caught_by, 'clean_sweep', format('Found all %s hiders yourself', h.n)
      from (select min(caught_by::text)::uuid as caught_by from allh
            having count(*) >= 2 and bool_and(caught) and count(distinct caught_by) = 1) x, hstat h
      where x.caught_by is not null

    -- ======================================== Drones
    union all
    select user_id, 'trapper', 'A drone trap caught someone sneaking in' from noti where kind = 'trap' group by user_id
    union all
    select user_id, 'trap_master', format('Your traps went off %s times', count(*)) from noti
      where kind = 'trap' group by user_id having count(*) >= 3
    union all
    select s.user_id, 'close_shave', 'Got swept by a drone and still got away' from surv s
      where s.last_swept_at is not null or exists (select 1 from noti n where n.user_id = s.user_id and n.kind = 'swept')
    union all
    select s.user_id, 'drone_dodger', 'Walked into a drone trap and still got away' from surv s
      where exists (select 1 from noti n where n.user_id = s.user_id and n.kind = 'trapped')
    union all
    select seeker_id, 'drone_pilot', format('Flew %s drone sweeps in one round', count(*)) from swp
      group by seeker_id having count(*) >= 5
    union all
    select seeker_id, 'drone_ace', format('%s sweeps spotted someone', count(*)) from swp
      where swp.found group by seeker_id having count(*) >= 3
    union all
    select distinct s.seeker_id, 'drone_combo', 'Spotted someone with a drone, then found them' from srch s
      where s.caught > 0 and exists (select 1 from swp w where w.seeker_id = s.seeker_id and w.found
                                       and w.created_at <= s.created_at
                                       and public.in_area(s.tile, w.tile, w.radius))

    -- ======================================== Milestones (once ever)
    union all
    select user_id, 'rounds_5', 'Played 5 rounds' from career where rounds_n >= 5
    union all
    select user_id, 'rounds_25', 'Played 25 rounds' from career where rounds_n >= 25
    union all
    select user_id, 'rounds_100', 'Played 100 rounds' from career where rounds_n >= 100
    union all
    select user_id, 'survive_5', 'Survived 5 rounds' from career where survived_n >= 5
    union all
    select user_id, 'survive_25', 'Survived 25 rounds' from career where survived_n >= 25
    union all
    select user_id, 'shield_master', 'Saved by a shield 3 times' from career where shields_n >= 3
    union all
    select user_id, 'catches_10', 'Found 10 hiders' from catches where n >= 10
    union all
    select user_id, 'catches_50', 'Found 50 hiders' from catches where n >= 50
    union all
    select user_id, 'bot_buster', 'Found the bot 5 times' from catches where bots >= 5
    union all
    select user_id, 'coins_1k', 'Won 1,000 coins in total' from won where n >= 1000
    union all
    select user_id, 'coins_10k', 'Won 10,000 coins in total' from won where n >= 10000
    union all
    select user_id, 'streak_3', 'Played 3 days in a row' from streak where n >= 3
    union all
    select user_id, 'streak_7', 'Played 7 days in a row' from streak where n >= 7

    -- ======================================== Social
    union all
    select sender_id, 'chatterbox', format('Sent %s chat messages in one round', count(*)) from chat
      group by sender_id having count(*) >= 10
    union all
    select distinct sender_id, 'on_air', 'Sent a voice note' from chat where audio_path is not null
    union all
    select distinct sender_id, 'whisper', 'Sent a private message' from chat where recipient_id is not null
    union all
    select p.user_id, 'party_time', format('Played in a round with %s players', (select count(*) from players))
      from players p where (select count(*) from players) >= 20

    -- ======================================== Rare
    union all
    select user_id, 'welcome', 'Played your first round' from players
    union all
    select user_id, 'big_win', format('Won %s coins in one round', round(sum(amount))) from public.ledger
      where round_id = p_round and user_id is not null
        and kind in ('catch_reward', 'bot_bounty', 'pool_hider', 'pool_seeker', 'level_bonus')
      group by user_id having sum(amount) >= 300
    union all
    select user_id, 'high_roller', format('Played for a pool of %s coins', round(r.pool)) from players where r.pool >= 1000
    union all
    select user_id, 'night_owl', 'Played a round that ended after midnight' from players where v_hour < 5
    union all
    select user_id, 'early_bird', 'Played a round that ended before 8 in the morning' from players where v_hour between 5 and 7
    union all
    select user_id, 'weekend_warrior', 'Played a round at the weekend' from players where v_dow in (6, 7)
    union all
    select user_id, 'balloon_popper', 'Popped 10 coin balloons' from pops where n >= 10

    -- ================================================================================
    -- PART 11: the hard fifty
    -- ======================================== Hiding (hard)
    union all
    select s.user_id, 'untouchable', format('Stayed hidden %s hiding rounds in a row', h.n)
      from surv s join hrun h on h.user_id = s.user_id where h.n >= 5 and h.n % 5 = 0
    union all
    select s.user_id, 'radar_proof', format('Swept %s times and still got away', count(*))
      from surv s join noti n on n.user_id = s.user_id and n.kind = 'swept'
      group by s.user_id having count(*) >= 3
    union all
    select s.user_id, 'slippery', 'Walked into a trap AND got swept, and still got away' from surv s
      where exists (select 1 from noti n where n.user_id = s.user_id and n.kind = 'trapped')
        and (s.last_swept_at is not null or exists (select 1 from noti n where n.user_id = s.user_id and n.kind = 'swept'))
    union all
    select s.user_id, 'needle_haystack', format('Survived with %s hunters on the prowl', k.n) from surv s, seekers k where k.n >= 50
    union all
    select user_id, 'plain_sight', format('Survived when %s of %s spots were searched', r.searched_count, r.tile_count)
      from surv where r.tile_count > 0 and r.searched_count * 4 >= r.tile_count * 3
    union all
    select s.user_id, 'statue', format('Never moved, no shield, %s hunters, still hidden', k.n) from surv s, seekers k
      where k.n >= 20 and s.moves = 0 and not s.shield_bought and not s.respawned
    union all
    select s.user_id, 'last_legend', format('The only one of %s hiders left standing', (select count(*) from allh)) from surv s
      where (select count(*) from allh) >= 10 and (select count(*) from allh where not caught) = 1

    -- ======================================== Hunting (hard)
    union all
    select caught_by, 'hunting_party', format('Caught %s hiders in one round', count(*)) from hid
      where caught and caught_by is not null group by caught_by having count(*) >= 5
    union all
    select user_id, 'bot_nemesis', 'Found the bot 3 rounds in a row' from bot3 where user_id is not null
    union all
    select distinct seeker_id, 'buzzer_beater', 'Caught someone in the last minute of the round' from srch
      where caught > 0 and created_at >= r.seek_ends_at - interval '60 seconds'
    union all
    select h.caught_by, 'giant_slayer', format('Caught a level %s player', max(p.level)) from hid h
      join public.profiles p on p.id = h.user_id
      where h.caught and h.caught_by is not null and p.level >= 10 group by h.caught_by
    union all
    select h.caught_by, 'titan_slayer', format('Caught a level %s player', max(p.level)) from hid h
      join public.profiles p on p.id = h.user_id
      where h.caught and h.caught_by is not null and p.level >= 25 group by h.caught_by
    union all
    select seeker_id, 'perfect_aim', format('%s searches, %s finds. Not one miss', count(*), count(*)) from srch
      where not area group by seeker_id having count(*) >= 3 and bool_and(caught > 0)
    union all
    select user_id, 'bounty_hunter', format('Earned %s coins in level bonuses', round(n)) from bounty where n >= 1000

    -- ======================================== Drones (hard)
    union all
    select seeker_id, 'eye_in_sky', format('%s sweeps spotted someone', count(*)) from swp
      where swp.found group by seeker_id having count(*) >= 5
    union all
    select user_id, 'spider_web', format('Your traps went off %s times', count(*)) from noti
      where kind = 'trap' group by user_id having count(*) >= 5

    -- ======================================== Powers (decoys, shields, respawns, big searches)
    union all
    select user_id, 'gotcha', 'Your decoy fooled a hunter' from fooled where n >= 1
    union all
    select user_id, 'master_disguise', format('Your decoy fooled %s hunters', n) from fooled where n >= 2
    union all
    select f.user_id, 'smoke_mirrors', 'Your decoy fooled a hunter and you got away' from fooled f
      where f.n >= 1 and f.user_id in (select user_id from surv)
    union all
    select user_id, 'turtle', 'Your shield saved you, you never moved, and you got away' from surv
      where shield_saved and moves = 0
    union all
    select user_id, 'phoenix', 'Came back after being caught, then got away' from surv where respawned
    union all
    select distinct seeker_id, 'wide_net', format('One big search caught %s hiders', caught) from bigs where caught >= 2
    union all
    select user_id, 'illusionist', format('Hunters fell for your decoys %s times', n) from decoy_career where n >= 10

    -- ======================================== Levels (once ever)
    union all
    select user_id, 'level_5', 'Reached level 5' from lvl where level >= 5
    union all
    select user_id, 'level_10', 'Reached level 10' from lvl where level >= 10
    union all
    select user_id, 'level_20', 'Reached level 20' from lvl where level >= 20
    union all
    select user_id, 'level_30', 'Reached level 30' from lvl where level >= 30

    -- ======================================== Milestones (hard, once ever)
    union all
    select user_id, 'coins_5k', 'Won 5,000 coins in total' from won where n >= 5000
    union all
    select user_id, 'coins_25k', 'Won 25,000 coins in total' from won where n >= 25000
    union all
    select user_id, 'rounds_50', 'Played 50 rounds' from career where rounds_n >= 50
    union all
    select user_id, 'rounds_250', 'Played 250 rounds' from career where rounds_n >= 250
    union all
    select user_id, 'streak_14', 'Played 14 days in a row' from streak where n >= 14
    union all
    select user_id, 'catches_100', 'Found 100 hiders' from catches where n >= 100
    union all
    select user_id, 'survive_50', 'Survived 50 rounds' from career where survived_n >= 50
    union all
    select user_id, 'survive_100', 'Survived 100 rounds' from career where survived_n >= 100
    union all
    select user_id, 'bot_terminator', 'Found the bot 25 times' from catches where bots >= 25

    -- ======================================== Rare (hard)
    union all
    select user_id, 'weekly_champ', 'Top of the weekly leaderboard' from champ
      where user_id in (select user_id from players)
        and not exists (select 1 from public.badges b where b.user_id = champ.user_id and b.badge = 'weekly_champ'
                          and b.earned_at > v_end - interval '7 days')
    union all
    select p.user_id, 'festival', format('Played in a round with %s players', (select count(*) from players))
      from players p where (select count(*) from players) >= 100
    union all
    select user_id, 'whale', format('Played for a pool of %s coins', round(r.pool)) from players where r.pool >= 10000
    union all
    select user_id, 'jackpot', format('Won %s coins in one round', round(sum(amount))) from public.ledger
      where round_id = p_round and user_id is not null
        and kind in ('catch_reward', 'bot_bounty', 'pool_hider', 'pool_seeker', 'level_bonus')
      group by user_id having sum(amount) >= 1000

    -- ======================================== Legendary (the hardest of all)
    union all
    select s.user_id, 'phantom', format('Stayed hidden %s hiding rounds in a row', h.n)
      from surv s join hrun h on h.user_id = s.user_id where h.n >= 10 and h.n % 10 = 0
    union all
    select caught_by, 'unstoppable', format('Caught %s hiders in one round', count(*)) from hid
      where caught and caught_by is not null group by caught_by having count(*) >= 10
    union all
    select x.caught_by, 'exterminator', format('Found all %s hiders yourself', h.n)
      from (select min(caught_by::text)::uuid as caught_by from allh
            having count(*) >= 5 and bool_and(caught) and count(distinct caught_by) = 1) x, hstat h
      where x.caught_by is not null
    union all
    select user_id, 'immortal', 'Came back from being caught and got away 5 times' from career where phoenix_n >= 5
    union all
    select user_id, 'level_50', 'Reached level 50' from lvl where level >= 50
    union all
    select user_id, 'coins_100k', 'Won 100,000 coins in total' from won where n >= 100000
    union all
    select user_id, 'rounds_500', 'Played 500 rounds' from career where rounds_n >= 500
    union all
    select user_id, 'streak_30', 'Played 30 days in a row' from streak where n >= 30
    union all
    select user_id, 'catches_500', 'Found 500 hiders' from catches where n >= 500
    union all
    select user_id, 'collector_80', format('Collected %s different badges', n) from owned where n >= 80
  )
  insert into public.badges (user_id, round_id, badge, detail)
    select distinct on (c.user_id, c.badge) c.user_id, p_round, c.badge, c.detail
    from cand c join public.profiles p on p.id = c.user_id and not p.is_bot
    where c.user_id <> v_bot
      and not (c.badge = any (v_career)
               and exists (select 1 from public.badges b where b.user_id = c.user_id and b.badge = c.badge))
    order by c.user_id, c.badge, c.detail
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Same trigger as part 8: badges are handed out at the end of the transaction that
-- finishes the round, so the round's payouts are already in the ledger.
create or replace function public.badges_on_finish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    perform public.award_badges(new.id);
  end if;
  return new;
exception when others then
  raise warning 'badges failed: %', sqlerrm;
  return new;
end $$;
drop trigger if exists rounds_award_badges on public.rounds;
create constraint trigger rounds_award_badges after update of status on public.rounds
  deferrable initially deferred
  for each row execute function public.badges_on_finish();

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('award_badges', 'badges_on_finish')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 012_age_codes.sql
-- HIDE & SEEK, part 12: adults only (18+), and 4-digit sign-in codes.
-- Run once in Supabase → SQL Editor, after 011 (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces the two functions.

-- ============================================================ date of birth
-- Players give their date of birth once, on the welcome screen. It is private: players can
-- only ever read their own profile, and the app never shows it to anyone else.
alter table public.profiles add column if not exists birth_date date;
-- Set when someone tells us they are under 18. Their account is also frozen, so the game
-- refuses every action, and the welcome screen just shows a friendly "adults only" note.
alter table public.profiles add column if not exists age_blocked_at timestamptz;

-- Saves a player's date of birth, after checking it on the server.
-- Answers: 'ok', 'already_set', 'blocked' (said under 18 before), 'invalid' or 'under_18'.
-- An under-18 answer is final: the date is NOT saved, the account is frozen and marked,
-- so they can't simply try again with a different year.
create or replace function public.set_birth_date(p_user uuid, p_birth date) returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then return 'invalid'; end if;
  if p.age_blocked_at is not null then return 'blocked'; end if;
  if p.birth_date is not null then return 'already_set'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then return 'invalid'; end if;
  if p_birth > (current_date - interval '18 years')::date then
    update public.profiles set frozen = true, age_blocked_at = now() where id = p_user;
    return 'under_18';
  end if;
  update public.profiles set birth_date = p_birth where id = p_user;
  return 'ok';
end $$;

-- ============================================================ 4-digit sign-in codes
-- Codes are now 4 digits (easier to type), so guessing is limited more tightly:
--   * 5 wrong tries per code, and each code works for 10 minutes (as before);
--   * at most 15 wrong tries per email address in any 24 hours, across all codes;
--   * checking a code happens in one locked step here, so many guesses sent at the same
--     moment can't slip past the limits.
alter table public.email_codes add column if not exists wrong_total int not null default 0;
alter table public.email_codes add column if not exists wrong_window_started_at timestamptz not null default now();

-- p_hash is the code's fingerprint, made by the server with its secret key.
-- Answers: 'ok' (code used up), 'wrong', 'expired', 'too_many' (this code) or 'locked' (24 hours).
create or replace function public.check_email_code(p_email text, p_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.email_codes;
begin
  select * into c from public.email_codes where email = p_email for update;
  if not found then return 'expired'; end if;
  if c.wrong_window_started_at < now() - interval '24 hours' then
    update public.email_codes set wrong_total = 0, wrong_window_started_at = now() where email = p_email;
    c.wrong_total := 0;
  end if;
  if c.wrong_total >= 15 then return 'locked'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'too_many'; end if;
  if c.code_hash = p_hash then
    delete from public.email_codes where email = p_email;
    return 'ok';
  end if;
  update public.email_codes set attempts = attempts + 1, wrong_total = wrong_total + 1 where email = p_email;
  return case when c.attempts + 1 >= 5 then 'too_many' else 'wrong' end;
end $$;

revoke all on function public.set_birth_date(uuid, date) from public, anon, authenticated;
grant execute on function public.set_birth_date(uuid, date) to service_role;
revoke all on function public.check_email_code(text, text) from public, anon, authenticated;
grant execute on function public.check_email_code(text, text) to service_role;

-- ======================================================== 013_ads_v2.sql
-- HIDE & SEEK, part 13: ads paid for with a coin pool, and advertiser accounts.
-- Run once in Supabase → SQL Editor, after 012_age_codes.sql.
-- Safe to run again: it only adds what is missing and replaces functions.
--
-- How ads work now:
--   * An advertiser picks a weekly budget (from ₦5,000) and 1–8 weeks. What they pay loads the
--     ad with a COIN POOL: 1 coin per ₦5 (ad_coins_per_ngn = 0.2).
--   * A player who taps a billboard to look at the ad gets 5 coins (ad_view_reward) out of that
--     pool. Each player can earn this at most 5 times a day (ad_rewards_per_day), and only once
--     per ad per day. These paid taps are the "views" the advertiser pays for.
--   * Taps by people who get no coins (watchers without an account, players over their daily
--     limit, a second look the same day) are counted as FREE views: nothing leaves the pool.
--     Link clicks are counted too. Billboards simply being on screen ("seen on billboards")
--     are counted for interest only and never cost anything.
--   * An ad stops showing when its pool can't pay another reward or its weeks are over.
--     Coins left at the end just expire (they were never created, see below).
--   * No automatic picture check: an ad goes live as soon as Paystack confirms the payment.
--
-- Coin books: the pool is only a budget counter on the ad. Coins are created (ledger kind
-- 'ad_reward') at the moment a player is paid, exactly as before, so coin_supply_daily
-- stays correct and unused pool coins never existed.
--
-- Advertisers get an account from their email the first time they book (separate from
-- players). They manage their ads at /advertiser, signing in with a link from any of our
-- emails or a 4-digit email code.
--
-- Sponsored prize pools (part 10) keep working for anything already paid, but the website no
-- longer sells new ones. Several paid sponsors queue: one per round, in order.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('ad_coins_per_ngn',     0.2,      'Coins loaded into an ad''s pool per naira paid (0.2 = 1 coin per ₦5)'),
  ('ad_view_reward',       5,        'Coins a signed-in player gets from an ad''s pool for tapping it'),
  ('ad_rewards_per_day',   5,        'Most paid ad taps per player per day (and only once per ad per day)'),
  ('ad_min_weekly_ngn',    5000,     'Smallest weekly ad budget in naira (also the smallest top-up)'),
  ('ad_max_weeks',         8,        'Most weeks one ad can run for'),
  ('ad_max_ngn',           10000000, 'Largest single ad payment in naira'),
  ('ad_free_opens_hourly', 5,        'Most taps one viewer can add to one ad''s numbers per hour'),
  ('ad_link_days',         30,       'Days a "Manage your ad" email link keeps working'),
  ('ad_session_days',      30,       'Days an advertiser stays signed in on a device')
on conflict (key) do nothing;

-- ============================================================ advertisers
create table if not exists public.advertisers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 200),
  name text,
  phone text,
  created_at timestamptz not null default now()
);

-- "Manage your ad" links. Only a fingerprint (sha-256) of each link's secret is stored.
create table if not exists public.advertiser_links (
  token_hash text primary key,
  advertiser_id uuid not null references public.advertisers (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists advertiser_links_expiry_idx on public.advertiser_links (expires_at);

-- 4-digit sign-in codes for advertisers (kept apart from the players' email_codes).
create table if not exists public.advertiser_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_count int not null default 1,
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  wrong_total int not null default 0,
  wrong_window_started_at timestamptz not null default now()
);

-- Finds or makes the advertiser for an email. Name and phone are filled in only if missing,
-- so someone typing another person's email can't change their details.
create or replace function public.advertiser_for_email(p_email text, p_name text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  insert into public.advertisers (email, name, phone) values (v_email, nullif(trim(p_name), ''), nullif(trim(p_phone), ''))
    on conflict (email) do update
      set name = coalesce(public.advertisers.name, excluded.name),
          phone = coalesce(public.advertisers.phone, excluded.phone)
    returning id into v_id;
  return v_id;
end $$;

-- Saves a new "Manage your ad" link (the server makes the secret and passes its fingerprint).
create or replace function public.advertiser_link_new(p_advertiser uuid, p_hash text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_exp timestamptz := now() + make_interval(days => public.setting('ad_link_days')::int);
begin
  insert into public.advertiser_links (token_hash, advertiser_id, expires_at) values (p_hash, p_advertiser, v_exp)
    on conflict (token_hash) do nothing;
  return v_exp;
end $$;

-- Who a link belongs to (null when it's unknown or has expired).
create or replace function public.advertiser_link_check(p_hash text) returns uuid
language sql stable security definer set search_path = public as $$
  select advertiser_id from public.advertiser_links where token_hash = p_hash and expires_at > now()
$$;

-- Same rules as the players' check_email_code (game-db/012): 5 wrong tries per code, codes
-- last 10 minutes (the server sets expires_at), at most 15 wrong tries per email a day, all
-- in one locked step. Answers: 'ok', 'wrong', 'expired', 'too_many' or 'locked'.
create or replace function public.check_advertiser_code(p_email text, p_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.advertiser_codes;
begin
  select * into c from public.advertiser_codes where email = p_email for update;
  if not found then return 'expired'; end if;
  if c.wrong_window_started_at < now() - interval '24 hours' then
    update public.advertiser_codes set wrong_total = 0, wrong_window_started_at = now() where email = p_email;
    c.wrong_total := 0;
  end if;
  if c.wrong_total >= 15 then return 'locked'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'too_many'; end if;
  if c.code_hash = p_hash then
    delete from public.advertiser_codes where email = p_email;
    return 'ok';
  end if;
  update public.advertiser_codes set attempts = attempts + 1, wrong_total = wrong_total + 1 where email = p_email;
  return case when c.attempts + 1 >= 5 then 'too_many' else 'wrong' end;
end $$;

-- ============================================================ ads: new columns
-- Ads are no longer sold in slots of views, so those two columns are now optional.
alter table public.ads alter column slots drop not null;
alter table public.ads alter column views_bought drop not null;

alter table public.ads add column if not exists advertiser_id uuid references public.advertisers (id) on delete set null;
alter table public.ads add column if not exists weeks int check (weeks is null or weeks between 1 and 52);
alter table public.ads add column if not exists coins_total numeric(14,2);
alter table public.ads add column if not exists coins_left numeric(14,2) not null default 0 check (coins_left >= 0);
alter table public.ads add column if not exists paused boolean not null default false;
alter table public.ads add column if not exists rewarded_views int not null default 0;
alter table public.ads add column if not exists free_views int not null default 0;
create index if not exists ads_advertiser_idx on public.ads (advertiser_id, created_at desc);

-- "Seen on billboards" used to be views_delivered; give it a clear name (moved once).
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'ads' and column_name = 'sightings') then
    alter table public.ads add column sightings bigint not null default 0;
    update public.ads set sightings = views_delivered;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'ad_daily' and column_name = 'sightings') then
    alter table public.ad_daily add column sightings int not null default 0;
    alter table public.ad_daily add column free_views int not null default 0;
    -- ad_daily.views now means paid (rewarded) taps; the old numbers were billboard sightings.
    update public.ad_daily set sightings = views, views = 0;
  end if;
end $$;

-- Top-ups: more budget (and optionally more weeks) for an ad that's running or finished.
create table if not exists public.ad_topups (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads (id) on delete cascade,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid')),
  coins numeric(14,2) not null check (coins > 0),
  weeks int not null default 0 check (weeks between 0 and 52),
  amount_kobo bigint not null check (amount_kobo > 0),
  paystack_reference text not null unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ad_topups_ad_idx on public.ad_topups (ad_id, created_at);

-- Old pictures replaced by an edit are deleted a day later (games may still be showing them).
create table if not exists public.ad_retired_images (
  path text primary key,
  retired_at timestamptz not null default now()
);

-- ============================================================ moving old ads over
-- Every ad gets an advertiser account from its contact email.
insert into public.advertisers (email, name, phone)
select distinct on (lower(contact_email)) lower(contact_email), contact_name, contact_phone
from public.ads where contact_email ~ '@'
order by lower(contact_email), created_at
on conflict (email) do nothing;
update public.ads a set advertiser_id = v.id
from public.advertisers v where a.advertiser_id is null and v.email = lower(a.contact_email);

-- Old "slots of views" ads become coin-pool ads (once: only rows with no pool yet).
--   * Paid ads still waiting for the old picture check go live now, with their full pool.
--   * Live ads keep the part of their pool they haven't used (the share of views not yet
--     delivered) and get at least 7 more days to use it.
--   * Finished, rejected and unpaid ads get a pool for the record (empty unless unpaid).
update public.ads set
  coins_total = floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn')),
  weeks = coalesce(weeks, 1),
  coins_left = case
    when status in ('paid', 'reviewing', 'held') then floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn'))
    when status = 'live' then floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn')
                                    * greatest(coalesce(views_bought, 0) - views_delivered, 0)
                                    / greatest(coalesce(views_bought, 1), 1))
    else 0 end,
  ends_at = case when status = 'live' then greatest(coalesce(ends_at, now()), now() + interval '7 days') else ends_at end
where coins_total is null;

-- ============================================================ the ad's clock and finish line
-- Going live starts the ad's weeks. An ad that can't pay another reward is finished.
create or replace function public.ads_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    if new.starts_at is null then new.starts_at := now(); end if;
    if new.ends_at is null then
      new.ends_at := new.starts_at + make_interval(days => 7 * coalesce(new.weeks, 1));
    end if;
  end if;
  if new.status = 'live' and new.coins_total is not null and new.coins_left < public.setting('ad_view_reward') then
    new.status := 'finished';
  end if;
  if new.status = 'finished' and new.finished_at is null then new.finished_at := now(); end if;
  if new.status = 'live' then new.finished_at := null; end if;
  return new;
end $$;
drop trigger if exists ads_before_update on public.ads;
create trigger ads_before_update before update on public.ads
  for each row execute function public.ads_before_update();

-- Paid ads that were waiting for the old picture check go live now (their weeks start now).
update public.ads set status = 'live' where status in ('paid', 'reviewing', 'held') and paid_at is not null;
-- Live ads whose pool can't pay another reward are finished.
update public.ads set status = 'finished'
  where status = 'live' and coins_total is not null and coins_left < public.setting('ad_view_reward');

-- ============================================================ serving ads
-- True when an ad can pay a reward right now.
create or replace function public.ad_is_paying(a public.ads) returns boolean
language sql stable set search_path = public as $$
  select a.status = 'live' and not a.paused and a.coins_left >= public.setting('ad_view_reward')
     and coalesce(a.starts_at, now()) <= now() and (a.ends_at is null or a.ends_at > now())
$$;

-- A weighted random pick of up to p_n paying ads, without repeats. Weight = coins left ÷ hours
-- left (at least 1 hour), so every ad spends its pool evenly over its weeks.
create or replace function public.ad_serve(p_n int)
returns table (id uuid, image_path text, headline text, brand text, link_url text)
language sql volatile security definer set search_path = public as $$
  select a.id, a.image_path, a.headline, a.brand, a.link_url
  from public.ads a
  where public.ad_is_paying(a)
  order by -ln(greatest(random(), 1e-12))
           / (a.coins_left::float8
              / greatest(extract(epoch from (coalesce(a.ends_at, now()) - now())) / 3600.0, 1.0))
  limit greatest(0, least(coalesce(p_n, 24), 40))
$$;

-- "Seen on billboards": p_views is {"<ad id>": count, ...}. Never costs the advertiser
-- anything. Each viewer adds at most ad_viewer_hourly_cap sightings per ad per hour.
create or replace function public.ad_track_views(p_views jsonb, p_viewer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cap int := public.setting('ad_viewer_hourly_cap')::int;
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(p_viewer, 128);
  v_counted int := 0;
  v_ad uuid;
  v_want int;
  v_old int;
  v_add int;
  x record;
begin
  if p_views is null or jsonb_typeof(p_views) <> 'object' or coalesce(p_viewer, '') = '' then
    return jsonb_build_object('counted', 0);
  end if;
  for x in select key, value from jsonb_each(p_views) order by key limit 40 loop
    continue when x.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    continue when jsonb_typeof(x.value) <> 'number';
    v_want := least(greatest(floor((x.value #>> '{}')::numeric), 0), v_cap)::int;
    continue when v_want <= 0;
    v_ad := x.key::uuid;
    continue when not exists (select 1 from public.ads a where a.id = v_ad and a.status = 'live');

    insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, v_ad, v_hour) on conflict do nothing;
    select b.views into v_old from public.ad_view_buckets b
      where b.viewer = v_viewer and b.ad_id = v_ad and b.hour = v_hour for update;
    v_add := least(v_want, v_cap - v_old);
    continue when v_add <= 0;
    update public.ad_view_buckets b set views = b.views + v_add
      where b.viewer = v_viewer and b.ad_id = v_ad and b.hour = v_hour;
    update public.ads a set sightings = a.sightings + v_add where a.id = v_ad;
    insert into public.ad_daily (ad_id, day, sightings) values (v_ad, current_date, v_add)
      on conflict (ad_id, day) do update set sightings = public.ad_daily.sightings + excluded.sightings;
    v_counted := v_counted + v_add;
  end loop;
  return jsonb_build_object('counted', v_counted);
end $$;

-- Someone tapped a billboard to look at the ad.
--   * A signed-in player gets ad_view_reward coins from the ad's pool: once per ad per day,
--     at most ad_rewards_per_day times a day, and only while the pool can pay. That's a
--     rewarded view: the thing advertisers pay for.
--   * Anyone else (or a player who can't be paid) is a free view: counted, costs nothing.
--     Free views and opens count at most ad_free_opens_hourly times per viewer per ad per hour.
-- Returns { coins, left_today, reason } where reason is null when paid, otherwise
-- 'signed_out', 'daily_limit', 'already_today' or 'pool_empty'.
create or replace function public.ad_open(p_ad uuid, p_user uuid default null, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(coalesce(nullif(p_viewer, ''), 'anon'), 128);
  v_reward numeric := public.setting('ad_view_reward');
  v_per_day int := public.setting('ad_rewards_per_day')::int;
  v_hourly int := coalesce(public.setting('ad_free_opens_hourly'), 5)::int;
  v_today int := 0;
  v_paid numeric := 0;
  v_reason text;
  v_opens int;
  v_signed boolean := false;
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
        insert into public.ad_open_rewards (user_id, ad_id, day, coins) values (p_user, p_ad, current_date, v_reward);
        -- (The ads trigger marks the ad finished once its pool can't pay another reward.)
        update public.ads set coins_left = coins_left - v_reward, rewarded_views = rewarded_views + 1, opens = opens + 1
          where id = p_ad;
        insert into public.ad_daily (ad_id, day, views, opens) values (p_ad, current_date, 1, 1)
          on conflict (ad_id, day) do update set views = public.ad_daily.views + 1, opens = public.ad_daily.opens + 1;
        update public.profiles set coins = coins + v_reward where id = p_user;
        perform public.log_coins(p_user, null, 'ad_reward', v_reward, false, 'Looked at an ad');
        v_paid := v_reward;
        v_today := v_today + 1;
      end if;
    end if;
  end if;

  if v_paid = 0 then
    -- A free view, limited per viewer so one person can't pump the numbers.
    insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, p_ad, v_hour) on conflict do nothing;
    update public.ad_view_buckets set opens = opens + 1
      where viewer = v_viewer and ad_id = p_ad and hour = v_hour
      returning opens into v_opens;
    if v_opens <= v_hourly then
      update public.ads set free_views = free_views + 1, opens = opens + 1 where id = p_ad;
      insert into public.ad_daily (ad_id, day, free_views, opens) values (p_ad, current_date, 1, 1)
        on conflict (ad_id, day) do update set free_views = public.ad_daily.free_views + 1, opens = public.ad_daily.opens + 1;
    end if;
  end if;

  return jsonb_build_object('coins', v_paid, 'reason', v_reason,
    'left_today', case when v_signed then greatest(v_per_day - v_today, 0) else 0 end);
end $$;

-- Someone followed the ad's link (at most 5 counted per viewer per ad per hour).
create or replace function public.ad_click(p_ad uuid, p_viewer text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_viewer text := left(coalesce(nullif(p_viewer, ''), 'anon'), 128);
  v_clicks int;
begin
  if not exists (select 1 from public.ads where id = p_ad and status in ('live', 'finished') and link_url is not null) then
    return jsonb_build_object('counted', false);
  end if;
  insert into public.ad_view_buckets (viewer, ad_id, hour) values (v_viewer, p_ad, v_hour) on conflict do nothing;
  update public.ad_view_buckets set clicks = clicks + 1
    where viewer = v_viewer and ad_id = p_ad and hour = v_hour
    returning clicks into v_clicks;
  if v_clicks > 5 then return jsonb_build_object('counted', false); end if;
  update public.ads set clicks = clicks + 1 where id = p_ad;
  insert into public.ad_daily (ad_id, day, clicks) values (p_ad, current_date, 1)
    on conflict (ad_id, day) do update set clicks = public.ad_daily.clicks + 1;
  return jsonb_build_object('counted', true);
end $$;

-- ============================================================ paying
-- Paystack confirmed a payment for this ad. The first confirmation fills the pool and puts the
-- ad live (newly_paid = true, so the caller sends the emails once). Safe to call many times.
create or replace function public.ad_paid(p_reference text, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.ads; v_new boolean := false;
begin
  select * into a from public.ads where paystack_reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if a.status = 'pending_payment' then
    if p_amount_kobo < a.amount_kobo then
      return jsonb_build_object('found', true, 'id', a.id, 'status', a.status, 'newly_paid', false, 'short', true);
    end if;
    update public.ads set status = 'live', paid_at = now(),
           coins_total = coalesce(coins_total, floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn'))),
           coins_left = coalesce(coins_total, floor(amount_kobo / 100.0 * public.setting('ad_coins_per_ngn')))
      where id = a.id
      returning * into a;
    v_new := true;
  end if;
  return jsonb_build_object('found', true, 'id', a.id, 'status', a.status, 'newly_paid', v_new,
    'advertiser_id', a.advertiser_id);
end $$;

-- Paystack confirmed a top-up. Adds the coins (and weeks) once. If the ad's time is over, it
-- gets at least one more week, so the new coins can be used.
create or replace function public.ad_topup_paid(p_reference text, p_amount_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.ad_topups; a public.ads; v_weeks int; v_new boolean := false;
begin
  select * into t from public.ad_topups where paystack_reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  select * into a from public.ads where id = t.ad_id for update;
  if t.status = 'pending_payment' then
    if p_amount_kobo < t.amount_kobo then
      return jsonb_build_object('found', true, 'id', t.id, 'ad_id', t.ad_id, 'status', t.status, 'newly_paid', false, 'short', true);
    end if;
    v_weeks := t.weeks;
    if v_weeks = 0 and (a.ends_at is null or a.ends_at < now() + interval '1 day') then v_weeks := 1; end if;
    update public.ad_topups set status = 'paid', paid_at = now(), weeks = v_weeks where id = t.id;
    update public.ads set
      coins_total = coalesce(coins_total, 0) + t.coins,
      coins_left = coins_left + t.coins,
      weeks = coalesce(weeks, 1) + v_weeks,
      ends_at = case when v_weeks > 0 then greatest(coalesce(ends_at, now()), now()) + make_interval(days => 7 * v_weeks)
                     else ends_at end,
      status = case when status in ('live', 'finished') then 'live' else status end,
      final_report_at = null
    where id = a.id
    returning * into a;
    t.status := 'paid';
    v_new := true;
  end if;
  return jsonb_build_object('found', true, 'id', t.id, 'ad_id', t.ad_id, 'status', t.status, 'newly_paid', v_new,
    'advertiser_id', a.advertiser_id, 'coins', t.coins);
end $$;

-- ============================================================ advertiser changes
-- Changes the headline, link and/or picture of the advertiser's own ad (null = keep). Goes
-- live straight away. Returns false when the ad isn't theirs.
create or replace function public.ad_edit(p_ad uuid, p_advertiser uuid, p_headline text, p_link text, p_clear_link boolean,
                                          p_image_path text)
returns boolean language plpgsql security definer set search_path = public as $$
declare a public.ads;
begin
  select * into a from public.ads where id = p_ad and advertiser_id = p_advertiser and status <> 'pending_payment' for update;
  if not found then return false; end if;
  if p_image_path is not null and p_image_path <> a.image_path then
    insert into public.ad_retired_images (path) values (a.image_path) on conflict do nothing;
  end if;
  update public.ads set
    headline = coalesce(nullif(trim(p_headline), ''), headline),
    link_url = case when p_clear_link then null else coalesce(p_link, link_url) end,
    image_path = coalesce(p_image_path, image_path)
  where id = p_ad;
  return true;
end $$;

-- Pauses or resumes the advertiser's own ad. (The weeks keep counting while paused.)
create or replace function public.ad_set_paused(p_ad uuid, p_advertiser uuid, p_paused boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.ads set paused = p_paused where id = p_ad and advertiser_id = p_advertiser and status <> 'pending_payment';
  return found;
end $$;

-- ============================================================ upkeep
-- Finishes ads whose weeks are over, clears old rate-limit rows, unpaid checkouts, expired
-- links and codes, and returns picture paths that can now be deleted from storage.
create or replace function public.ad_housekeeping() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_paths text[]; v_buckets int; v_finished int;
begin
  update public.ads set status = 'finished' where status = 'live' and ends_at < now();
  get diagnostics v_finished = row_count;
  delete from public.ad_view_buckets where hour < now() - interval '3 hours';
  get diagnostics v_buckets = row_count;
  delete from public.ad_topups where status = 'pending_payment' and created_at < now() - interval '3 days';
  delete from public.advertiser_links where expires_at < now();
  delete from public.advertiser_codes where last_sent_at < now() - interval '2 days';
  with gone as (
    delete from public.ads where status = 'pending_payment' and created_at < now() - interval '3 days'
    returning image_path
  ), gone_sponsors as (
    delete from public.pool_sponsors where status = 'pending_payment' and created_at < now() - interval '3 days'
    returning logo_path
  ), retired as (
    delete from public.ad_retired_images r where r.retired_at < now() - interval '1 day'
      and not exists (select 1 from public.ads a where a.image_path = r.path)
    returning path
  )
  select coalesce(array_agg(p) filter (where p is not null), '{}') into v_paths
  from (select image_path p from gone union all select logo_path from gone_sponsors union all select path from retired) x;
  return jsonb_build_object('buckets_cleared', v_buckets, 'finished', v_finished, 'paths', to_jsonb(v_paths));
end $$;

-- ============================================================ privacy & access
alter table public.advertisers enable row level security;
alter table public.advertiser_links enable row level security;
alter table public.advertiser_codes enable row level security;
alter table public.ad_topups enable row level security;
alter table public.ad_retired_images enable row level security;
do $$
declare t text;
begin
  foreach t in array array['ads', 'ad_daily', 'ad_view_buckets', 'ad_open_rewards', 'pool_sponsors', 'advertisers',
                           'advertiser_links', 'advertiser_codes', 'ad_topups', 'ad_retired_images'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('ads_before_update', 'ad_is_paying', 'ad_serve', 'ad_track_views', 'ad_open', 'ad_click', 'ad_paid',
            'ad_set_review', 'ad_topup_paid', 'ad_edit', 'ad_set_paused', 'ad_housekeeping',
            'advertiser_for_email', 'advertiser_link_new', 'advertiser_link_check', 'check_advertiser_code',
            'sponsor_apply', 'sponsor_paid', 'rounds_take_sponsor')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 014_chat_rooms.sql
-- HIDE & SEEK, part 14: chat in places (buildings and hot-air balloons) instead of one city room.
-- Run once in Supabase → SQL Editor, after 013_ads_v2.sql (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces three functions.
--
-- How rooms work:
--   room = 'b:<tile>'      everyone inside that building
--   room = 'balloon:<k>'   everyone riding hot-air balloon k (0 … 50)
--   room = '*'             a message shown in every room (the bot's teases)
--   room = null            a private message (recipient_id is set)
-- Who is inside which place is tracked live in the browser (Realtime presence), not here.

-- ============================================================ room column
alter table public.chat_messages add column if not exists room text;

-- Messages from before this part were in the one "City" room; park them in a room nobody
-- can enter so they never show up in a building.
update public.chat_messages set room = 'city' where room is null and recipient_id is null;

alter table public.chat_messages drop constraint if exists chat_messages_room_check;
alter table public.chat_messages add constraint chat_messages_room_check check (
  (recipient_id is not null and room is null)
  or (recipient_id is null and room is not null and (
        room = '*' or room = 'city'
        or room ~ '^b:[0-9]{1,7}$'
        or room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'))
);

-- Anything still written the old way (no room, not private) goes to the old "City" room,
-- so an older copy of the app keeps working while the new one goes live.
create or replace function public.chat_default_room() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.room is null and new.recipient_id is null then new.room := 'city'; end if;
  return new;
end $$;
drop trigger if exists chat_default_room on public.chat_messages;
create trigger chat_default_room before insert on public.chat_messages
  for each row execute function public.chat_default_room();

create index if not exists chat_room_idx on public.chat_messages (round_id, room, id);
-- For the "not so fast" check (recent messages by one person).
create index if not exists chat_sender_idx on public.chat_messages (sender_id, created_at desc);

-- ============================================================ room names
-- True for a room a player can post in: 'b:<tile>' or 'balloon:<0..50>'.
create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_room ~ '^b:[0-9]{1,7}$' or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$', false)
$$;

-- ============================================================ sending
-- Every player message goes through here (the server calls it after checking the login).
-- Exactly one of p_room / p_to. Text up to 500 characters, or a voice note.
-- Pace: at most 1 message a second and 10 messages in 20 seconds per person.
-- Errors (the app turns these into friendly words):
--   no_name, frozen, no_round, bad_target, bad_room, bad_recipient, empty, too_long, too_fast
create or replace function public.chat_send(
  p_user uuid, p_room text, p_to uuid, p_body text, p_audio_path text default null, p_audio_seconds int default null
) returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_round bigint;
  v_role text;
  v_to_name text;
  v_body text;
  v_recent int;
  v_last timestamptz;
  m public.chat_messages;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot or p.username is null or trim(p.username) = '' then raise exception 'no_name'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  select max(id) into v_round from public.rounds;
  if v_round is null then raise exception 'no_round'; end if;

  if (p_room is null) = (p_to is null) then raise exception 'bad_target'; end if;
  if p_room is not null and not public.chat_room_ok(p_room) then raise exception 'bad_room'; end if;
  if p_to is not null then
    if p_to = p_user then raise exception 'bad_recipient'; end if;
    select username into v_to_name from public.profiles where id = p_to and not is_bot and username is not null;
    if v_to_name is null then raise exception 'bad_recipient'; end if;
  end if;

  v_body := nullif(trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')), '');
  if v_body is null and p_audio_path is null then raise exception 'empty'; end if;
  if char_length(v_body) > 500 then raise exception 'too_long'; end if;

  -- One person at a time, so quick double taps can't slip past the pace check.
  perform pg_advisory_xact_lock(hashtext('chat:' || p_user::text));
  select count(*), max(created_at) into v_recent, v_last
    from public.chat_messages where sender_id = p_user and created_at > now() - interval '20 seconds';
  if v_recent >= 10 or (v_last is not null and v_last > now() - interval '1 second') then
    raise exception 'too_fast';
  end if;

  select coalesce(role, 'watcher') into v_role from public.entries where round_id = v_round and user_id = p_user;
  insert into public.chat_messages
    (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, room, body, audio_path, audio_seconds)
  values
    (v_round, p_user, p.username, coalesce(v_role, 'watcher'), p_to, v_to_name, p_room, v_body, p_audio_path,
     case when p_audio_path is null then null else greatest(1, least(60, coalesce(p_audio_seconds, 1))) end)
  returning * into m;
  return m;
end $$;

-- ============================================================ the bot's teases
-- Same as part 6, but the tease now goes to every room at once (room '*'), because the
-- database can't see who is standing where.
create or replace function public.bot_tease(p_round bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  v_due timestamptz;
  v_open text[] := array['Psst.', 'Hello, detectives.', 'Still looking?', 'Ahem.', 'Knock knock.', 'Is it hot in here or is it just me?',
    'Breaking news:', 'Fun fact:', 'Hmm.', 'Okay, okay.', 'Dear seekers,', 'Quick update from the shadows:'];
  v_mid text[] := array[
    'I can hear you tapping the wrong roofs.', 'I''ve had %s coins of searches walk right past me.', 'The pool is %s coins. Imagine.',
    'You''ve checked %s spots and I''m still comfy.', 'I can see a drone. It can''t see me.', 'I''m closer than you think. Or am I?',
    'Somebody just searched next door. Rude.', '%s minutes left and I''ve barely broken a sweat.', 'My hiding spot has a lovely view.',
    'I''ve moved %s times. Or have I?', 'Try the tall buildings. Actually, don''t.', 'There are %s of you and one of me.'];
  v_end text[] := array['😏', '🙈', 'Toodles!', 'Catch me if you can.', 'Not even warm.', 'Good luck with that.', 'Tick tock.', '👀',
    'I believe in you. Sort of.', 'Back to my nap.', ''];
  v_mid_pick text;
  v_body text;
  v_seekers int;
begin
  select * into r from public.rounds where id = p_round;
  if r.status <> 'seek' or r.bot_teases >= public.setting('bot_teases') then return 'quiet'; end if;
  select * into e from public.entries where round_id = p_round and user_id = '00000000-0000-0000-0000-00000000b07a';
  if not found or e.caught then return 'quiet'; end if;
  -- Spread the teases over the hunt: the first after ~8-15 min, the next after ~30-40 min.
  v_due := r.join_ends_at + make_interval(mins => (case when r.bot_teases = 0 then 8 + (r.id % 8) else 30 + (r.id % 11) end)::int);
  if now() < v_due then return 'waiting'; end if;
  select count(*) into v_seekers from public.entries where round_id = p_round and role = 'seeker';
  v_mid_pick := v_mid[1 + floor(random() * array_length(v_mid, 1))::int];
  v_body := format(v_mid_pick,
    case
      when v_mid_pick like '%%coins of searches%%' then (select coalesce(round(sum(cost)), 0)::text from public.searches where round_id = p_round)
      when v_mid_pick like '%%pool%%' then round(r.pool)::text
      when v_mid_pick like '%%checked%%' then r.searched_count::text
      when v_mid_pick like '%%minutes left%%' then greatest(1, ceil(extract(epoch from (r.seek_ends_at - now())) / 60))::text
      when v_mid_pick like '%%moved%%' then e.moves::text
      when v_mid_pick like '%%of you%%' then greatest(v_seekers, 2)::text
      else ''
    end);
  v_body := trim(v_open[1 + floor(random() * array_length(v_open, 1))::int] || ' ' || v_body || ' ' ||
                 v_end[1 + floor(random() * array_length(v_end, 1))::int]);
  insert into public.chat_messages (round_id, sender_id, sender_name, sender_role, room, body)
    values (p_round, '00000000-0000-0000-0000-00000000b07a', coalesce(r.bot_name, 'The bot') || ' (bot)', 'hider', '*', left(v_body, 500));
  update public.rounds set bot_teases = bot_teases + 1 where id = p_round;
  return 'teased';
end $$;

-- ============================================================ who may call what
-- Only the server (service role) runs these; players never call them directly.
revoke all on function public.chat_send(uuid, text, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.chat_send(uuid, text, uuid, text, text, int) to service_role;
revoke all on function public.bot_tease(bigint) from public, anon, authenticated;
grant execute on function public.bot_tease(bigint) to service_role;
grant execute on function public.chat_room_ok(text) to service_role;

-- ======================================================== 015_ghost_rules.sql
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

-- ======================================================== 016_place_rooms.sql
-- HIDE & SEEK, part 16: every level of a building is its own chat room.
-- Run once in Supabase → SQL Editor, after 015_ghost_rules.sql.
-- Safe to run again: it only replaces one function and one rule, and re-states who may call what.
--
-- How rooms work now:
--   room = 'b:<tile>:g'      the ground floor of the building on that tile
--   room = 'b:<tile>:f<n>'   floor n of that building (1 … 200)
--   room = 'b:<tile>:r'      the rooftop of that building
--   room = 'b:<tile>'        the whole building (the old way; still accepted so older copies of the app keep working)
--   room = 'balloon:<k>'     everyone riding hot-air balloon k (0 … 50)
--   room = '*'               a message shown in every room (the bot's teases)
--   room = null              a private message (recipient_id is set)
-- chat_send (part 14) already asks chat_room_ok, so it learns the new rooms from here.

-- ============================================================ room names
-- True for a room a player can post in (see the list above; not '*' or the old 'city').
create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$',
    false)
$$;

-- ============================================================ the rule on the table
-- The same list, checked on every saved message (anything already saved still fits).
alter table public.chat_messages drop constraint if exists chat_messages_room_check;
alter table public.chat_messages add constraint chat_messages_room_check check (
  (recipient_id is not null and room is null)
  or (recipient_id is null and room is not null and (
        room = '*' or room = 'city'
        or room ~ '^b:[0-9]{1,7}(:(g|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
        or room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'))
);

-- ============================================================ who may call what
-- Same as part 14: only the server (service role) sends; players never call these directly.
revoke all on function public.chat_send(uuid, text, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.chat_send(uuid, text, uuid, text, text, int) to service_role;
grant execute on function public.chat_room_ok(text) to service_role;

