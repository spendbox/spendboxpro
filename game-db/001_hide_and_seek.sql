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
  ('join_minutes',       10,   'Join window before hiding starts'),
  ('hide_minutes',       60,   'Hide phase length'),
  ('seek_minutes',       60,   'Seek phase length'),
  ('second_move_fee',    100,  'Fee for a hider move during the seek phase'),
  ('signup_coins',       500,  'Coins at signup (once per verified phone)'),
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
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  phone text unique,
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
  status text not null default 'join' check (status in ('join', 'hide', 'seek', 'done')),
  join_ends_at timestamptz not null,
  hide_ends_at timestamptz not null,
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
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor')), 0) as created,
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

-- ============================================================ signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_coins numeric := 0; v_phone text := nullif(new.phone, '');
begin
  -- Signup coins: only for a phone number nobody has used before. A repeat number still gets
  -- an account, but with no coins and no phone on the profile.
  if v_phone is not null and not exists (select 1 from public.profiles where phone = v_phone) then
    v_coins := public.setting('signup_coins');
  else
    v_phone := null;
  end if;
  insert into public.profiles (id, phone, coins) values (new.id, v_phone, v_coins) on conflict do nothing;
  if v_coins > 0 then
    perform public.log_coins(new.id, null, 'signup', v_coins);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

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
  if not found then raise exception 'Unknown player'; end if;
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
-- Run every minute. Starts rounds, places hiders, opens seeking, ends rounds.
create or replace function public.tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_carry numeric;
  v_join int := public.setting('join_minutes')::int;
  v_hide int := public.setting('hide_minutes')::int;
  v_seek int := public.setting('seek_minutes')::int;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status <> 'done' for update;

  if not found then
    select value into v_carry from public.game_state where key = 'carry';
    insert into public.rounds (join_ends_at, hide_ends_at, seek_ends_at, pool)
    values (now() + make_interval(mins => v_join),
            now() + make_interval(mins => v_join + v_hide),
            now() + make_interval(mins => v_join + v_hide + v_seek),
            coalesce(v_carry, 0));
    update public.game_state set value = 0 where key = 'carry';
    return 'round created';
  end if;

  if r.status = 'join' and now() >= r.join_ends_at then
    if r.hiders_total = 0 then
      -- Nobody is hiding: keep the window open and push the whole round back.
      update public.rounds set
        join_ends_at = now() + make_interval(mins => v_join),
        hide_ends_at = now() + make_interval(mins => v_join + v_hide),
        seek_ends_at = now() + make_interval(mins => v_join + v_hide + v_seek)
        where id = r.id;
      return 'join extended (no hiders)';
    end if;
    -- Random placement on distinct tiles.
    with t as (
      select g, row_number() over (order by random()) rn from generate_series(0, r.tile_count - 1) g
    ), h as (
      select user_id, row_number() over (order by random()) rn
      from public.entries where round_id = r.id and role = 'hider'
    )
    update public.entries e set tile = t.g
    from h join t on t.rn = h.rn
    where e.round_id = r.id and e.user_id = h.user_id;
    update public.rounds set status = 'hide' where id = r.id;
    v_out := 'hiding started';
    r.status := 'hide';
  end if;

  if r.status = 'hide' and now() >= r.hide_ends_at then
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
  select * into r from public.rounds where status in ('hide', 'seek') for update;
  if not found then raise exception 'You cannot move right now'; end if;
  select * into e from public.entries where round_id = r.id and user_id = p_user and role = 'hider' for update;
  if not found then raise exception 'You are not hiding in this round'; end if;
  if e.caught then raise exception 'You have been caught'; end if;
  if e.moves >= 2 then raise exception 'No moves left'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That tile is not on the map'; end if;
  if p_tile = e.tile then raise exception 'You are already on that tile'; end if;

  if r.status = 'hide' then
    if e.moves >= 1 then raise exception 'Your free move is used. You can move once more in the seek hour'; end if;
  else
    v_fee := public.setting('second_move_fee');
  end if;

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
    select e.user_id, e.stake, pr.hider_rounds from public.entries e
    join public.profiles pr on pr.id = e.user_id
    where e.round_id = r.id and e.role = 'hider' and not e.caught and e.tile = p_tile
    order by e.created_at, e.user_id
  loop
    v_n := v_n + 1;
    v_caught := v_caught + 1;
    if v_n > 3 then
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

  v_cost := round(public.setting('sweep_base_price') * power(2 * p_radius + 1, 2) / 9, 2);
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
    from public.entries where round_id = p_round and role = 'hider' and not caught;
  select coalesce(sum(least(real_spent, v_cap)), 0) into v_seeker_w
    from public.entries where round_id = p_round and role = 'seeker';

  -- Surviving hiders, in proportion to stake. Nobody left: the share rolls into the next round.
  if v_hider_w > 0 then
    for x in select user_id, stake_weight from public.entries
             where round_id = p_round and role = 'hider' and not caught loop
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
    where id in (select user_id from public.entries where round_id = p_round and role = 'hider');
  update public.profiles set seeker_rounds = seeker_rounds + 1
    where id in (select user_id from public.entries where round_id = p_round and role = 'seeker');
end $$;

-- ============================================================ daily upkeep & sponsors
create or replace function public.daily_upkeep() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_floor numeric := public.setting('topup_floor'); v_n int := 0; x record;
begin
  for x in select id, coins from public.profiles where coins < v_floor and not frozen loop
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
            'daily_upkeep', 'sponsor_deposit', 'log_coins', 'burn', 'handle_new_user')
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
