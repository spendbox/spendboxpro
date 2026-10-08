-- HIDE & SEEK, part 18: the city's people (NPCs) can whisper real clues and hand out small gifts.
-- Run once in Supabase → SQL Editor, after 017_world_events.sql.
-- Safe to run again: it only adds what is missing and replaces its own functions (and the coin
-- supply view, with every kind of created coin so far).
--
-- The NPCs themselves live in the app (src/lib/npcs.ts): who they are and what they say is
-- worked out from the place and the round, the same for everyone, with nothing stored. Only
-- two things need the database, because they touch real secrets and real coins:
--
--   npc_hint(user, npc)  A gossip's REAL clue, rough on purpose: the middle tile of a 9×9 area
--                        near a random uncaught ghost (never any ghost's own tile, the bot's
--                        included), and about how many ghosts are in that area ("about 3").
--                        Rare: each NPC makes up their mind once per player per round (25%
--                        chance they know something), a player gets at most 1 real clue per
--                        round, and only while the hunt is on. Null otherwise.
--   npc_gift(user, npc)  A generous NPC gives 5–20 coins, sometimes: each NPC makes up their
--                        mind once per player per round, and a player gets at most 3 NPC gifts a
--                        day. Ledger kind 'npc_gift' (created coins, so coin_supply_daily counts
--                        them).
-- The app checks that the NPC really is a gossip / a generous type before asking (their
-- personality comes from their id and the round). NPC ids look like 'npc:<room>:<n>'.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('npc_hint_chance',         0.25, 'Chance a gossip NPC really knows something (decided once per NPC per player per round)'),
  ('npc_hints_per_round',     1,    'Most real NPC clues one player gets per round'),
  ('npc_hint_asks_per_round', 8,    'Most NPCs one player can ask for clues per round (after that they all go quiet)'),
  ('npc_hint_radius',         4,    'Clue areas are (2r+1)×(2r+1) tiles around the middle: 4 = 9×9'),
  ('npc_hint_wobble',         3,    'How far (in tiles) the middle of a clue area can be from the ghost it is about (never more than the radius)'),
  ('npc_gift_chance',         0.4,  'Chance a generous NPC gives coins (decided once per NPC per player per round)'),
  ('npc_gift_min',            5,    'Smallest NPC gift in coins'),
  ('npc_gift_max',            20,   'Biggest NPC gift in coins'),
  ('npc_gifts_per_day',       3,    'Most NPC gifts one player gets per day'),
  ('npc_gift_asks_per_day',   12,   'Most generous NPCs one player can ask per day')
on conflict (key) do nothing;

-- ============================================================ what NPCs decided
-- One row per (round, player, NPC, kind): what that NPC told / gave that player this round.
-- hint: tile = middle of the clue area and count = "about how many" (both null: knew nothing).
-- gift: coins given (0 = nothing this time).
create table if not exists public.npc_talks (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  npc text not null check (char_length(npc) between 5 and 60),
  kind text not null check (kind in ('hint', 'gift')),
  tile int,
  count int,
  coins numeric(14,2),
  created_at timestamptz not null default now(),
  primary key (round_id, user_id, npc, kind)
);
create index if not exists npc_talks_user_idx on public.npc_talks (user_id, kind, created_at desc);
alter table public.npc_talks enable row level security;

-- ============================================================ helpers
-- True for an NPC id the app can make: 'npc:' + a room (building level, open-air spot,
-- balloon or ride) + ':' + 0…7.
create or replace function public.npc_id_ok(p_npc text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(char_length(p_npc) <= 60 and p_npc ~
    '^npc:(b:[0-9]{1,7}(:(g|r|o|f[0-9]{1,3}))?|balloon:[0-9]{1,2}|v:(train|bus|car|boat|ferris|slide):[0-9]{1,7}):[0-7]$', false)
$$;

-- The tile at grid (x, y): the opposite of spiral_xy (part 2), so spiral_xy(npc_xy_tile(x, y)) = [x, y].
create or replace function public.npc_xy_tile(p_x int, p_y int) returns int
language plpgsql immutable set search_path = public as $$
declare
  k int := greatest(abs(p_x), abs(p_y));
  big int := (2 * k + 1) * (2 * k + 1);
begin
  if k = 0 then return 0; end if;
  if p_y = -k then return big - (k - p_x) - 1; end if;            -- bottom side
  if p_x = -k then return big - 2 * k - (p_y + k) - 1; end if;    -- left side
  if p_y = k then return big - 4 * k - (p_x + k) - 1; end if;     -- top side
  return big - 6 * k - (k - p_y) - 1;                             -- right side
end $$;

-- ============================================================ a gossip's clue
-- Null when: the hunt isn't on, this NPC knows nothing (decided once per player per round),
-- the player already had their real clue this round, or there's nobody left to tell about.
-- Asking the same NPC again in the same round gives the same answer (repeat = true).
-- Errors: bad_npc, no_player, frozen.
create or replace function public.npc_hint(p_user uuid, p_npc text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  r public.rounds;
  t public.npc_talks;
  v_radius int := greatest(1, coalesce(public.setting('npc_hint_radius'), 4)::int);
  v_wobble int;
  v_target int;
  v_xy int[];
  v_try int;
  v_c int;
  v_centre int;
  v_n int;
  v_about int;
begin
  if not public.npc_id_ok(p_npc) then raise exception 'bad_npc'; end if;
  -- One at a time per player (the limits below count rows).
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'no_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  select * into r from public.rounds where status = 'seek' and seek_ends_at > now() order by id desc limit 1;
  if not found then return null; end if;

  select * into t from public.npc_talks where round_id = r.id and user_id = p_user and npc = p_npc and kind = 'hint';
  if found then
    if t.tile is null then return null; end if;
    return jsonb_build_object('tile', t.tile, 'count', t.count, 'radius', v_radius, 'repeat', true);
  end if;
  if (select count(*) from public.npc_talks where round_id = r.id and user_id = p_user and kind = 'hint')
     >= coalesce(public.setting('npc_hint_asks_per_round'), 8) then
    return null;
  end if;

  v_wobble := least(v_radius, greatest(0, coalesce(public.setting('npc_hint_wobble'), 3)::int));
  if (select count(*) from public.npc_talks where round_id = r.id and user_id = p_user and kind = 'hint' and tile is not null)
       < coalesce(public.setting('npc_hints_per_round'), 1)
     and random() < coalesce(public.setting('npc_hint_chance'), 0.25) then
    -- A random ghost still hiding (not the player themselves; the bot counts).
    select e.tile into v_target from public.entries e
     where e.round_id = r.id and e.role = 'hider' and not e.caught and e.tile is not null and e.user_id <> p_user
     order by random() limit 1;
    if v_target is not null then
      v_xy := public.spiral_xy(v_target);
      -- The middle of the area: a few tiles off, on the map, and never on any ghost's own tile.
      for v_try in 1..60 loop
        v_c := public.npc_xy_tile(v_xy[1] + floor(random() * (2 * v_wobble + 1))::int - v_wobble,
                                  v_xy[2] + floor(random() * (2 * v_wobble + 1))::int - v_wobble);
        continue when v_c >= r.tile_count;
        continue when exists (select 1 from public.entries e
                               where e.round_id = r.id and e.role = 'hider' and not e.caught and e.tile = v_c);
        v_centre := v_c;
        exit;
      end loop;
    end if;
  end if;

  if v_centre is not null then
    select count(*) into v_n from public.entries e
     where e.round_id = r.id and e.role = 'hider' and not e.caught and e.tile is not null
       and public.in_area(e.tile, v_centre, v_radius);
    -- "About": exact when it's one or two, otherwise give or take one.
    v_about := case when v_n <= 2 then greatest(v_n, 1) else greatest(2, v_n + floor(random() * 3)::int - 1) end;
  end if;
  insert into public.npc_talks (round_id, user_id, npc, kind, tile, count) values (r.id, p_user, p_npc, 'hint', v_centre, v_about);
  if v_centre is null then return null; end if;
  return jsonb_build_object('tile', v_centre, 'count', v_about, 'radius', v_radius, 'repeat', false);
end $$;

-- ============================================================ a generous NPC's gift
-- { coins, why, left_today }. coins = 0 with why: no_round, already (this NPC already decided
-- this round), daily_cap (3 NPC gifts today), tired (asked too many NPCs today), no_luck.
-- Errors: bad_npc, no_player, frozen.
create or replace function public.npc_gift(p_user uuid, p_npc text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_round bigint;
  t public.npc_talks;
  v_given int;
  v_asked int;
  v_cap int := coalesce(public.setting('npc_gifts_per_day'), 3)::int;
  v_min int := greatest(1, coalesce(public.setting('npc_gift_min'), 5)::int);
  v_max int;
  v_coins numeric;
begin
  if not public.npc_id_ok(p_npc) then raise exception 'bad_npc'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'no_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  select max(id) into v_round from public.rounds;
  if v_round is null then return jsonb_build_object('coins', 0, 'why', 'no_round'); end if;

  select * into t from public.npc_talks where round_id = v_round and user_id = p_user and npc = p_npc and kind = 'gift';
  if found then return jsonb_build_object('coins', 0, 'why', 'already', 'given', t.coins); end if;

  select count(*) filter (where coins > 0), count(*) into v_given, v_asked
    from public.npc_talks where user_id = p_user and kind = 'gift' and created_at >= current_date::timestamptz;
  if v_given >= v_cap then return jsonb_build_object('coins', 0, 'why', 'daily_cap', 'left_today', 0); end if;
  if v_asked >= coalesce(public.setting('npc_gift_asks_per_day'), 12) then
    return jsonb_build_object('coins', 0, 'why', 'tired', 'left_today', v_cap - v_given);
  end if;

  if random() >= coalesce(public.setting('npc_gift_chance'), 0.4) then
    insert into public.npc_talks (round_id, user_id, npc, kind, coins) values (v_round, p_user, p_npc, 'gift', 0);
    return jsonb_build_object('coins', 0, 'why', 'no_luck', 'left_today', v_cap - v_given);
  end if;
  v_max := greatest(v_min, coalesce(public.setting('npc_gift_max'), 20)::int);
  v_coins := v_min + floor(random() * (v_max - v_min + 1));
  insert into public.npc_talks (round_id, user_id, npc, kind, coins) values (v_round, p_user, p_npc, 'gift', v_coins);
  update public.profiles set coins = coins + v_coins where id = p_user;
  perform public.log_coins(p_user, v_round, 'npc_gift', v_coins, false, p_npc);
  return jsonb_build_object('coins', v_coins, 'left_today', v_cap - v_given - 1);
end $$;

-- ============================================================ coin supply
-- Every kind of created coin so far (parts 1–17), NPC gifts, and the side-quest kinds from
-- part 19 (listed here too, so running the parts in any order keeps the books right).
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ who may call what
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('npc_hint', 'npc_gift', 'npc_xy_tile', 'npc_id_ok')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
revoke all on public.npc_talks from public, anon, authenticated;
grant all on public.npc_talks to service_role;
