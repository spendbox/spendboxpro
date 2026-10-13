-- Newtown database, set-up part 2 of 4 (made by scripts/sql-setup-parts.mjs from game-db/).
-- Paste the parts into a NEW Supabase project's SQL Editor in order, running each before the next.

-- ======================================================== 017_world_events.sql
-- HIDE & SEEK, part 17: world events, the world ends when every ghost is caught, the bot's
-- last words, big fish, bigger daily refills at higher levels, and rides as chat rooms.
-- Run once in Supabase → SQL Editor, after 016_place_rooms.sql.
--
-- - World events: 100 kinds (see src/lib/world-events.ts). Every hunt gets 2–4 of them at
--   random times (always at least one). Some pay coins to the first players who tap them,
--   some change the rules for a few minutes ("twists"):
--     double_coins (catches pay twice), ghost_amnesty (one free extra move), drone_storm
--     (half-price sweeps), lucky_street (free searches in an area), safe_house (nobody can be
--     found in an area), blackout_district (no searching in an area), bounty_board (extra
--     coins for catching one named ghost), bot_tantrum (the bot moves), and more that only
--     change what people see.
-- - Catching every ghost (and the bot) ends the world straight away again.
-- - The bot says something when it's caught.
-- - Big fish: anyone holding 10,000+ coins. Catches of big fish are announced.
-- - Passive income: 100 a day at level 1, +25 for every level after that.

insert into public.game_settings (key, value, note) values
  ('big_fish_coins', 10000, 'Players with at least this many coins count as big fish'),
  ('passive_per_level', 25, 'Extra daily passive income (and refill target) per level above 1'),
  ('bounty_coins', 100, 'Extra coins for catching the ghost on the bounty board'),
  ('world_events_min', 2, 'Fewest world events per hunt'),
  ('world_events_max', 4, 'Most world events per hunt'),
  ('world_event_twist_share', 0.3, 'Share of world events that are rule-changing twists')
on conflict (key) do nothing;

-- ============================================================ the catalog
create table if not exists public.world_event_kinds (
  n int primary key,
  key text unique not null,
  category text not null,
  needs text not null,
  minutes int not null,
  twist boolean not null default false,
  reward_coins int not null default 0,
  reward_slots int not null default 0,
  radius int not null default 0
);
alter table public.world_event_kinds enable row level security;
insert into public.world_event_kinds (n, key, category, needs, minutes, twist, reward_coins, reward_slots, radius) values
  (1, 'hospital_emergency', 'emergency', 'hospital', 4, false, 0, 0, 0),
  (2, 'robbery', 'emergency', 'road', 4, false, 0, 0, 0),
  (3, 'power_outage', 'city', 'any', 5, false, 0, 0, 0),
  (4, 'building_fire', 'emergency', 'office', 5, false, 0, 0, 0),
  (5, 'street_party', 'party', 'plaza', 6, false, 0, 0, 0),
  (6, 'fireworks', 'party', 'stadium', 4, false, 0, 0, 0),
  (7, 'flash_flood', 'weather', 'road', 5, false, 0, 0, 0),
  (8, 'water_main', 'city', 'road', 4, false, 0, 0, 0),
  (9, 'runaway_cows', 'mystery', 'road', 4, false, 0, 0, 0),
  (10, 'zoo_escape', 'mystery', 'park', 4, false, 0, 0, 0),
  (11, 'film_shoot', 'city', 'plaza', 6, false, 0, 0, 0),
  (12, 'ufo', 'mystery', 'sky', 3, false, 0, 0, 0),
  (13, 'circus_parade', 'party', 'road', 5, false, 0, 0, 0),
  (14, 'marathon', 'party', 'road', 6, false, 0, 0, 0),
  (15, 'train_breakdown', 'transport', 'station', 5, false, 0, 0, 0),
  (16, 'rig_flare', 'emergency', 'oilrig', 4, false, 0, 0, 0),
  (17, 'lightning_strike', 'weather', 'tower', 2, false, 0, 0, 0),
  (18, 'bird_swarm', 'mystery', 'sky', 3, false, 0, 0, 0),
  (19, 'money_spill', 'city', 'road', 3, false, 20, 10, 0),
  (20, 'celebrity_visit', 'party', 'hotel', 5, false, 0, 0, 0),
  (21, 'bank_alarm', 'emergency', 'office', 4, false, 0, 0, 0),
  (22, 'car_chase', 'emergency', 'road', 3, false, 0, 0, 0),
  (23, 'jewel_heist', 'emergency', 'tower', 4, false, 0, 0, 0),
  (24, 'gas_leak', 'emergency', 'road', 4, false, 0, 0, 0),
  (25, 'scaffold_collapse', 'emergency', 'construction', 4, false, 0, 0, 0),
  (26, 'cat_rescue', 'city', 'park', 3, false, 0, 0, 0),
  (27, 'stuck_lift', 'city', 'tower', 4, false, 0, 0, 0),
  (28, 'bridge_inspection', 'transport', 'bridge', 5, false, 0, 0, 0),
  (29, 'tyre_pileup', 'transport', 'road', 4, false, 0, 0, 0),
  (30, 'rooftop_helicopter', 'emergency', 'tower', 3, false, 0, 0, 0),
  (31, 'prison_van', 'emergency', 'road', 4, false, 0, 0, 0),
  (32, 'pickpocket_chase', 'emergency', 'market', 3, false, 0, 0, 0),
  (33, 'rainbow', 'weather', 'river', 4, false, 0, 0, 0),
  (34, 'hailstorm', 'weather', 'any', 3, false, 0, 0, 0),
  (35, 'harmattan', 'weather', 'any', 6, false, 0, 0, 0),
  (36, 'power_plant_lightning', 'weather', 'power', 3, false, 0, 0, 0),
  (37, 'eclipse', 'weather', 'sky', 3, false, 0, 0, 0),
  (38, 'shooting_stars', 'weather', 'sky', 4, false, 0, 0, 0),
  (39, 'sea_fog', 'weather', 'water', 5, false, 0, 0, 0),
  (40, 'heatwave', 'weather', 'park', 5, false, 0, 0, 0),
  (41, 'tornado', 'weather', 'outskirts', 3, false, 0, 0, 0),
  (42, 'butterflies', 'mystery', 'park', 4, false, 0, 0, 0),
  (43, 'whale_sighting', 'mystery', 'water', 4, false, 0, 0, 0),
  (44, 'market_monkeys', 'mystery', 'market', 4, false, 0, 0, 0),
  (45, 'wedding_convoy', 'party', 'road', 4, false, 0, 0, 0),
  (46, 'carnival', 'party', 'road', 6, false, 0, 0, 0),
  (47, 'masquerade', 'party', 'road', 5, false, 0, 0, 0),
  (48, 'owambe', 'party', 'plaza', 6, false, 0, 0, 0),
  (49, 'stadium_concert', 'party', 'stadium', 6, false, 0, 0, 0),
  (50, 'new_year', 'party', 'plaza', 4, false, 0, 0, 0),
  (51, 'rooftop_fashion', 'party', 'tower', 5, false, 0, 0, 0),
  (52, 'street_football', 'party', 'road', 5, false, 0, 0, 0),
  (53, 'graduation', 'party', 'campus', 5, false, 0, 0, 0),
  (54, 'food_festival', 'party', 'plaza', 6, false, 0, 0, 0),
  (55, 'drumming_circle', 'party', 'plaza', 5, false, 0, 0, 0),
  (56, 'tower_light_show', 'party', 'tower', 4, false, 0, 0, 0),
  (57, 'air_show', 'transport', 'sky', 3, false, 0, 0, 0),
  (58, 'balloon_race', 'transport', 'sky', 5, false, 0, 0, 0),
  (59, 'cruise_ship', 'transport', 'port', 6, false, 0, 0, 0),
  (60, 'stuck_cargo_ship', 'transport', 'port', 6, false, 0, 0, 0),
  (61, 'free_bus', 'transport', 'road', 5, false, 0, 0, 0),
  (62, 'emergency_landing', 'transport', 'airport', 4, false, 0, 0, 0),
  (63, 'train_delay', 'transport', 'station', 5, false, 0, 0, 0),
  (64, 'bike_race', 'transport', 'road', 4, false, 0, 0, 0),
  (65, 'taxi_strike', 'transport', 'road', 5, false, 0, 0, 0),
  (66, 'royal_motorcade', 'transport', 'road', 4, false, 0, 0, 0),
  (67, 'market_day', 'city', 'market', 6, false, 0, 0, 0),
  (68, 'black_friday', 'city', 'mall', 6, false, 0, 0, 0),
  (69, 'water_tanker', 'city', 'house', 4, false, 0, 0, 0),
  (70, 'ribbon_cutting', 'city', 'construction', 3, false, 0, 0, 0),
  (71, 'demolition', 'city', 'construction', 3, false, 0, 0, 0),
  (72, 'street_mural', 'city', 'plaza', 6, false, 0, 0, 0),
  (73, 'blackout_party', 'party', 'house', 5, false, 0, 0, 0),
  (74, 'lost_dog', 'city', 'park', 5, false, 15, 5, 0),
  (75, 'lottery_winner', 'city', 'plaza', 3, false, 0, 0, 0),
  (76, 'flash_mob', 'party', 'plaza', 3, false, 0, 0, 0),
  (77, 'museum_ghost', 'mystery', 'museum', 4, false, 0, 0, 0),
  (78, 'haunted_house', 'mystery', 'house', 5, false, 0, 0, 0),
  (79, 'treasure_chest', 'mystery', 'water', 4, false, 50, 1, 0),
  (80, 'crop_circle', 'mystery', 'park', 6, false, 0, 0, 0),
  (81, 'giant_duck', 'mystery', 'water', 6, false, 0, 0, 0),
  (82, 'dino_balloon', 'party', 'road', 5, false, 0, 0, 0),
  (83, 'time_capsule', 'mystery', 'construction', 4, false, 10, 5, 0),
  (84, 'meteor', 'mystery', 'outskirts', 4, false, 0, 0, 0),
  (85, 'pirate_ship', 'mystery', 'water', 5, false, 0, 0, 0),
  (86, 'vanishing_act', 'mystery', 'tower', 2, false, 0, 0, 0),
  (87, 'rooftop_proposal', 'party', 'tower', 3, false, 0, 0, 0),
  (88, 'fog_of_war', 'twist', 'any', 2, true, 0, 0, 0),
  (89, 'double_coins', 'twist', 'any', 5, true, 0, 0, 0),
  (90, 'ghost_amnesty', 'twist', 'any', 4, true, 0, 0, 0),
  (91, 'drone_storm', 'twist', 'any', 3, true, 0, 0, 0),
  (92, 'lucky_street', 'twist', 'road', 3, true, 0, 0, 1),
  (93, 'bot_tantrum', 'twist', 'any', 1, true, 0, 0, 0),
  (94, 'spotlight', 'twist', 'any', 3, true, 0, 0, 2),
  (95, 'golden_balloon', 'twist', 'sky', 3, true, 50, 1, 0),
  (96, 'quiet_hour', 'twist', 'any', 5, true, 0, 0, 0),
  (97, 'bounty_board', 'twist', 'any', 6, true, 0, 0, 0),
  (98, 'safe_house', 'twist', 'any', 3, true, 0, 0, 1),
  (99, 'blackout_district', 'twist', 'any', 2, true, 0, 0, 2),
  (100, 'final_countdown', 'twist', 'any', 5, true, 0, 0, 0)
on conflict (n) do update set key = excluded.key, category = excluded.category, needs = excluded.needs, minutes = excluded.minutes,
  twist = excluded.twist, reward_coins = excluded.reward_coins, reward_slots = excluded.reward_slots, radius = excluded.radius;

-- ============================================================ scheduled events
create table if not exists public.world_events (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  key text not null,
  tile int not null,
  radius int not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reward_coins int not null default 0,
  reward_slots int not null default 0,
  claimed int not null default 0,
  started boolean not null default false,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists world_events_round_idx on public.world_events (round_id, starts_at);
alter table public.world_events enable row level security; -- only the server reads it

create table if not exists public.world_event_claims (
  event_id bigint not null references public.world_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.world_event_claims enable row level security;

/** Is a world event of this kind happening right now in the open round? */
create or replace function public.event_on(p_round bigint, p_key text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.world_events
                 where round_id = p_round and key = p_key and now() >= starts_at and now() < ends_at)
$$;

/** Is this tile inside the area of a world event of this kind that's happening now? */
create or replace function public.event_area(p_round bigint, p_key text, p_tile int) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.world_events
                 where round_id = p_round and key = p_key and now() >= starts_at and now() < ends_at
                   and public.in_area(p_tile, tile, greatest(radius, 1)))
$$;

-- Picks this hunt's events: 2–4 kinds at random times (at least one, never two of a kind).
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
  -- Sometimes the last five minutes get the final-countdown treatment.
  if random() < 0.35 then
    insert into public.world_events (round_id, key, tile, starts_at, ends_at)
      values (p_round, 'final_countdown', 0, r.seek_ends_at - interval '5 minutes', r.seek_ends_at);
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

-- Schedule the events as soon as the hunt starts.
create or replace function public.rounds_plan_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'seek' and old.status = 'join' then
    perform public.plan_world_events(new.id);
  end if;
  return new;
exception when others then
  raise warning 'world events not planned: %', sqlerrm;
  return new;
end $$;
drop trigger if exists rounds_plan_events on public.rounds;
create trigger rounds_plan_events after update of status on public.rounds
  for each row execute function public.rounds_plan_events();

-- Runs with the round clock: starts events (the bot's tantrum happens here) and makes sure a
-- running hunt always has its events.
create or replace function public.world_event_tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  w record;
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  e public.entries;
  v_tile int;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status = 'seek';
  if not found then return 'no hunt'; end if;
  perform public.plan_world_events(r.id);
  for w in select * from public.world_events where round_id = r.id and not started and now() >= starts_at and now() < ends_at for update loop
    update public.world_events set started = true where id = w.id;
    v_out := 'started ' || w.key;
    if w.key = 'bot_tantrum' then
      select * into e from public.entries where round_id = r.id and user_id = v_bot;
      if found and not e.caught then
        select g into v_tile from generate_series(0, r.tile_count - 1) g
          where g <> e.tile
            and not exists (select 1 from public.searches s where s.round_id = r.id and s.tile = g)
            and not exists (select 1 from public.entries x where x.round_id = r.id and x.role = 'hider' and not x.caught and x.tile = g)
          order by random() limit 1;
        if v_tile is not null then
          update public.entries set tile = v_tile, visited = array_append(visited, e.tile), moves = moves + 1, last_move_at = now()
            where round_id = r.id and user_id = v_bot;
          insert into public.events (round_id, kind, tile, detail)
            values (r.id, 'moved', e.tile, jsonb_build_object('name', r.bot_name, 'bot', true, 'user', null));
        end if;
      end if;
    end if;
  end loop;
  return v_out;
end $$;

-- Tap an event that pays (a money spill, a treasure chest, the golden balloon…): the first few
-- players get the coins, once each.
create or replace function public.claim_world_event(p_user uuid, p_event bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w public.world_events;
  p public.profiles;
begin
  select * into w from public.world_events where id = p_event for update;
  if not found or now() < w.starts_at or now() >= w.ends_at then raise exception 'That one''s gone'; end if;
  if w.reward_coins <= 0 then raise exception 'Nothing to collect here'; end if;
  if w.claimed >= w.reward_slots then raise exception 'Too late! Someone got there first'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot or p.frozen then raise exception 'Unknown player'; end if;
  insert into public.world_event_claims (event_id, user_id) values (p_event, p_user);
  update public.world_events set claimed = claimed + 1 where id = p_event;
  update public.profiles set coins = coins + w.reward_coins where id = p_user;
  perform public.log_coins(p_user, w.round_id, 'event_reward', w.reward_coins);
  return jsonb_build_object('coins', w.reward_coins, 'left', w.reward_slots - w.claimed - 1);
exception when unique_violation then
  raise exception 'You already collected this one';
end $$;

-- The bot's last words when it's found (said in every chat room).
create or replace function public.bot_last_words(p_round bigint, p_finder text) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_a text[] := array['Noooo!', 'Well, well, well.', 'Okay, you got me.', 'Ugh.', 'Fine. FINE.', 'Impossible!', 'Hmph.',
                      'Caught at last.', 'Unbelievable.', 'Ah, there it is.', 'Wahala!', 'Ehn ehn!', 'Oya, fair enough.'];
  v_b text[] := array['%s found me fair and square.', '%s, you have sharp eyes.', 'I was this close to winning, %s.',
                      'Who taught you to search like that, %s?', 'Enjoy your 200 coins, %s.', '%s, I''ll remember this.',
                      'Next round, %s. Next round.', 'Respect to %s. Big respect.', '%s must have cheated. Joking. Mostly.',
                      'I should never have hidden there, %s.', 'Tell everyone %s is a legend.', 'My circuits are crying, %s.'];
  v_c text[] := array['I''ll be back.', 'Good game, everyone.', 'Off to the bot jail I go.', 'Somebody hold my coins.',
                      'Rematch?', 'Catch you in the next city.', 'Beep boop, I''m out.', 'Remember me.', ''];
  v_body text;
begin
  select * into r from public.rounds where id = p_round;
  v_body := trim(v_a[1 + floor(random() * array_length(v_a, 1))::int] || ' '
    || format(v_b[1 + floor(random() * array_length(v_b, 1))::int], coalesce(p_finder, 'Hunter')) || ' '
    || v_c[1 + floor(random() * array_length(v_c, 1))::int]);
  insert into public.chat_messages (round_id, sender_id, sender_name, sender_role, room, body)
    values (p_round, '00000000-0000-0000-0000-00000000b07a', coalesce(r.bot_name, 'The bot') || ' (bot)', 'hider', '*', left(v_body, 500));
exception when others then
  raise warning 'bot last words failed: %', sqlerrm;
end $$;

-- ============================================================ rides are chat rooms too
create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'
    or p_room ~ '^v:(train|bus|car|boat|ferris|slide):[0-9]{1,7}$',
    false)
$$;
alter table public.chat_messages drop constraint if exists chat_messages_room_check;
alter table public.chat_messages add constraint chat_messages_room_check check (
  (recipient_id is not null and room is null)
  or (recipient_id is null and room is not null and (room = '*' or room = 'city' or public.chat_room_ok(room)))
);

create or replace function public.sweep_price(p_round bigint, p_radius int) returns numeric
language sql stable as $$
  select round(public.setting('sweep_base_price') * (2 * p_radius + 1) * (2 * p_radius + 1) / 9
    * (1 + public.setting('sweep_price_growth') * coalesce((select sweep_count from public.rounds where id = p_round), 0))
    * (case when public.event_on(p_round, 'drone_storm') then 0.5 else 1 end), 2)
$$;

create or replace function public.move_price(p_round bigint) returns numeric
language sql stable as $$
  select case when public.event_on(p_round, 'ghost_amnesty') then 0
    else round(public.setting('move_fee_start') * (1 + public.setting('move_fee_growth') * coalesce(r.move_count, 0)), 2) end
  from public.rounds r where r.id = p_round
$$;

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
  -- World events: double coins pays the catch twice; a bounty pays extra for one ghost.
  if v_share > 0 and public.event_on(p_round, 'double_coins') then
    perform public.log_coins(p_finder, p_round, 'event_bonus', v_share);
    v_bonus := v_bonus + v_share;
  end if;
  if not h.is_bot and exists (select 1 from public.world_events w where w.round_id = p_round and w.key = 'bounty_board'
       and now() between w.starts_at and w.ends_at and (w.detail->>'user')::uuid = p_hider) then
    perform public.log_coins(p_finder, p_round, 'event_bonus', public.setting('bounty_coins'));
    v_bonus := v_bonus + public.setting('bounty_coins');
  end if;
  update public.entries set caught = true, caught_by = p_finder, payout = case when h.is_bot then 0 else v_share end
    where round_id = p_round and user_id = p_hider;
  if v_share + v_bonus > 0 then
    update public.profiles set coins = coins + v_share + v_bonus where id = p_finder;
  end if;
  return v_share + v_bonus;
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
    select e.user_id, pr.is_bot, pr.username, pr.avatar, pr.level, pr.coins, (e.shield_bought and not e.shield_saved) as shielded
    from public.entries e
    join public.profiles pr on pr.id = e.user_id
    where e.round_id = p_round and e.role = 'hider' and not e.caught and e.tile = p_tile
      and not public.event_area(p_round, 'safe_house', p_tile)
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
      'bigfish', (not h.is_bot and h.coins >= public.setting('big_fish_coins')),
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
  -- The bot doesn't go quietly.
  if v_bot_found then perform public.bot_last_words(p_round, v_name); end if;
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
  if public.event_area(r.id, 'blackout_district', p_tile) then raise exception 'It''s too dark to search there right now (blackout)'; end if;
  v_cool := public.search_gate(p_user);
  if en.user_id is null then perform public.join_round(p_user, 'seeker'); end if;
  select * into p from public.profiles where id = p_user;

  if p.free_search_day is distinct from current_date then
    v_cost := 0;
    update public.profiles set free_search_day = current_date where id = p_user;
  else
    v_cost := public.search_price(r.searched_count, r.tile_count);
  end if;
  if public.event_area(r.id, 'lucky_street', p_tile) then v_cost := 0; end if;
  perform public.charge_hunter(r.id, p_user, v_cost, 'search_fee');

  res := public.search_resolve(r.id, p_user, p_tile, v_cost, false);
  -- Every ghost (and the bot) found: this world ends now.
  if (select hiders_remaining from public.rounds where id = r.id) <= 0 then perform public.finalize_round(r.id); end if;
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
  if public.event_area(r.id, 'blackout_district', p_tile) then raise exception 'It''s too dark to search there right now (blackout)'; end if;
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
  if public.event_area(r.id, 'blackout_district', p_tile) then raise exception 'It''s too dark for drones there right now (blackout)'; end if;
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
  if not v_bot and e.moves >= public.moves_allowed(p_user) + (case when public.event_on(r.id, 'ghost_amnesty') then 1 else 0 end) then
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

create or replace function public.accrue_passive(p_user uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_target numeric;
  v_day numeric;
  v_rate numeric;      -- coins per second
  v_amt numeric;
  v_recent numeric;
begin
  select * into p from public.profiles where id = p_user for update;
  -- Higher levels refill more each day (100, then +25 per level).
  v_day := public.setting('passive_per_day') + public.setting('passive_per_level') * greatest(coalesce(p.level, 1) - 1, 0);
  v_target := public.setting('passive_target') + public.setting('passive_per_level') * greatest(coalesce(p.level, 1) - 1, 0);
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

-- Only one clock tick at a time: if another one is already running (the scheduled job, or a
-- page load), skip straight away instead of queueing behind it.
create or replace function public.tick_with_extras() returns text
language plpgsql security definer set search_path = public as $$
declare v text; r public.rounds;
begin
  if not pg_try_advisory_xact_lock(hashtext('hideseek-tick')) then
    return 'busy';
  end if;
  v := public.tick();
  begin
    v := v || ' / events: ' || public.world_event_tick();
  exception when others then
    v := v || ' / events error: ' || sqlerrm;
  end;
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

create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('event_on', 'event_area', 'plan_world_events', 'rounds_plan_events', 'world_event_tick', 'claim_world_event',
            'bot_last_words', 'search_resolve', 'search_tile', 'search_area', 'sweep', 'sweep_price', 'move_price', 'move_hider',
            'catch_hider', 'accrue_passive', 'tick_with_extras')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
grant execute on function public.chat_room_ok(text) to service_role;

-- ======================================================== 018_npcs.sql
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

-- ======================================================== 019_activities.sql
-- HIDE & SEEK, part 19: things to do inside buildings: mini games, seats and side quests,
-- spraying coins in clubs, and giving coins to other players.
-- Run once in Supabase → SQL Editor, after 018_npcs.sql.
-- Safe to run again: it only adds what is missing, refreshes the quest list and replaces functions.
--
-- - Side quests ("Today you are a thief…"): a few steps (visit places, sit down, talk to the
--   regulars, play a mini game…), 30 minutes to finish, and a reward: coins, and sometimes a
--   special move (steal some coins from a player, a hint, a free search, an extra move…).
--   People sitting down get offered quests most often (35% a roll), regulars who hand out
--   quests 60%, and anyone else now and then (3%). At most 3 quests a day each.
--   The quest list mirrors src/lib/quests.ts (keys, titles, steps, rewards). Change both.
-- - Steps the server can check itself (coins given or sprayed, searches, drone sweeps, event
--   rewards) are counted here. The rest are reported by the app, slowed down: a timed step can't
--   grow faster than the clock, and other steps grow by at most 2 every 2 seconds.
-- - Stealing: only with a finished quest that unlocked it. Takes 1–5% of the target's coins
--   (at most 100). The target is told who did it and can't be robbed again for 24 hours.
-- - Giving coins: 1–10,000 at a time, at most 20,000 a day per giver (gifts and spraying
--   together) and 10,000 a day to the same person. Not to yourself or the bot, and frozen
--   accounts can neither give nor receive. Givers must have played at least one game.
-- - Spraying (clubs): shower 10–500 coins over up to 10 dancers; it's split between them.
-- - Mini game rewards: 2–10 coins for a good score, at most 5 rewarded games a day, with a
--   short wait between claims. Scores come from the player's phone, so rewards stay tiny.
--
-- Coin books: quest rewards ('quest_reward') and mini game rewards ('activity_reward') are new
-- coins, counted as created in coin_supply_daily. Gifts ('gift_sent'/'gift_received'), spraying
-- ('spray_sent'/'spray_received') and stealing ('steal'/'stolen') only move coins between
-- players, so they are not.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('quest_chance_seat',        0.35, 'Chance a player sitting down is offered a side quest (each roll)'),
  ('quest_chance_npc',         0.6,  'Chance a regular who hands out quests has one for you'),
  ('quest_chance_random',      0.03, 'Chance of a surprise side quest (each roll)'),
  ('quest_chance_order',       0.1,  'Chance ordering food or a drink comes with a side quest'),
  ('quest_roll_seconds_seat',  60,   'Seconds between side quest rolls from sitting down'),
  ('quest_roll_seconds_npc',   20,   'Seconds between side quest rolls from regulars'),
  ('quest_roll_seconds_random',120,  'Seconds between surprise side quest rolls'),
  ('quest_roll_seconds_order', 60,   'Seconds between side quest rolls from ordering'),
  ('quests_per_day',           3,    'Most side quests one player can get in a day'),
  ('quest_minutes',            30,   'Minutes a player has to finish a side quest'),
  ('quest_action_minutes',     120,  'Minutes a special move (steal, hint…) stays usable after finishing'),
  ('quest_report_gap_seconds', 2,    'Seconds between progress reports on the same quest step'),
  ('quest_time_slack_seconds', 3,    'Extra seconds allowed on timed quest steps (phone clocks drift)'),
  ('steal_pct_min',            1,    'A theft takes at least this percent of the target''s coins'),
  ('steal_pct_max',            5,    'A theft takes at most this percent of the target''s coins'),
  ('steal_max',                100,  'Most coins one theft can take'),
  ('steal_safe_hours',         24,   'Hours a robbed player is safe from thieves'),
  ('gift_max',                 10000,'Most coins in one gift'),
  ('gift_daily_max',           20000,'Most coins one player can give away (gifts and spraying) a day'),
  ('gift_pair_daily_max',      10000,'Most coins one player can give the same person a day'),
  ('gift_min_rounds',          1,    'Games a player must have played before giving coins away'),
  ('spray_min',                10,   'Smallest spray on a dance floor'),
  ('spray_max',                500,  'Biggest spray on a dance floor'),
  ('spray_max_targets',        10,   'Most dancers one spray is split between'),
  ('activity_rewards_per_day', 5,    'Most rewarded mini games per player per day'),
  ('activity_game_cooldown_seconds', 60, 'Seconds between reward claims for the same mini game'),
  ('activity_any_cooldown_seconds',  15, 'Seconds between any two mini game reward claims')
on conflict (key) do nothing;

-- ============================================================ side quests
-- The list of quests (a copy of src/lib/quests.ts). steps: [{ "type", "target", … }], where
-- target is seconds for timed steps (sit_seconds, stay_seconds, survive_minutes), coins for
-- spray and gift, and a count for everything else.
create table if not exists public.quest_catalog (
  key text primary key,
  title text not null,
  role text not null,
  brief text not null,
  fits text not null default 'any' check (fits in ('any', 'ghost', 'hunter')),
  reward int not null default 0 check (reward between 0 and 500),
  action text check (action in ('steal', 'hint', 'spy', 'free_search', 'free_move')),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 6),
  enabled boolean not null default true
);

-- Quests players got: one active at a time each.
create table if not exists public.quests (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_key text not null references public.quest_catalog (key) on update cascade,
  round_id bigint,
  source text not null,
  status text not null default 'active' check (status in ('active', 'done', 'expired', 'dropped')),
  progress jsonb not null,                  -- one number per step
  reports jsonb not null default '{}',      -- step index → when it was last reported (epoch seconds)
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  reward numeric(14,2) not null default 0,  -- coins paid when it was finished
  action text,                              -- the special move it unlocked
  action_until timestamptz,
  action_used_at timestamptz,
  action_result jsonb
);
create unique index if not exists quests_one_active on public.quests (user_id) where status = 'active';
create index if not exists quests_user_idx on public.quests (user_id, started_at desc);

-- When each player last rolled for a quest from each source (seat, npc, random, order).
create table if not exists public.quest_rolls (
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null,
  rolled_at timestamptz not null default now(),
  primary key (user_id, source)
);

-- ============================================================ gifts, spraying, thefts
create table if not exists public.coin_gifts (
  id bigserial primary key,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('gift', 'spray')),
  amount numeric(14,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists coin_gifts_from_idx on public.coin_gifts (from_id, created_at desc);
create index if not exists coin_gifts_pair_idx on public.coin_gifts (from_id, to_id, created_at desc);
create index if not exists coin_gifts_to_idx on public.coin_gifts (to_id, created_at desc);

create table if not exists public.steals (
  id bigserial primary key,
  thief_id uuid references public.profiles (id) on delete set null,
  target_id uuid not null references public.profiles (id) on delete cascade,
  quest_id bigint references public.quests (id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists steals_target_idx on public.steals (target_id, created_at desc);

-- ============================================================ mini game rewards
-- A score of min_score earns coins_min, top_score (or more) earns coins_max, in between is in
-- between. Scores above cap_score can't happen in the game, so they're refused.
create table if not exists public.activity_games (
  game text primary key,
  min_score numeric not null,
  top_score numeric not null,
  cap_score numeric not null,
  coins_min int not null check (coins_min >= 0),
  coins_max int not null check (coins_max >= coins_min and coins_max <= 20)
);
insert into public.activity_games (game, min_score, top_score, cap_score, coins_min, coins_max) values
  ('archery', 30,  55,  60,   2, 8),   -- 6 arrows, 10 points each
  ('darts',   120, 300, 360,  2, 8),   -- 6 darts, treble 20 = 60
  ('reflex',  20,  45,  90,   2, 8),   -- targets hit in 30 seconds
  ('pool',    2,   6,   6,    2, 8),   -- balls potted (6 on the table)
  ('rps',     1,   1,   1,    3, 3),   -- won a Rock-Paper-Scissors duel
  ('dice',    1,   1,   1,    3, 3),   -- won a dice duel
  ('cards',   5,   12,  51,   2, 8),   -- Higher or Lower streak
  ('trivia',  4,   7,   7,    2, 10),  -- right answers out of 7
  ('dance',   400, 950, 1000, 2, 10),  -- dance-off score
  ('karaoke', 50,  95,  100,  2, 6),   -- hype meter
  ('stairs',  40,  90,  160,  2, 5)    -- steps in 10 seconds
on conflict (game) do update set min_score = excluded.min_score, top_score = excluded.top_score,
  cap_score = excluded.cap_score, coins_min = excluded.coins_min, coins_max = excluded.coins_max;

create table if not exists public.activity_claims (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null,
  score numeric not null,
  coins numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists activity_claims_user_idx on public.activity_claims (user_id, created_at desc);

-- ============================================================ the quest list
insert into public.quest_catalog (key, title, role, brief, fits, reward, action, steps) values
  ('thief', 'Thief', 'Today you are a thief.', 'Case the joint: wander into 2 places and sit somewhere quietly for 30 seconds. Then pick a player and swipe a few of their coins (1–5%, at most 100).', 'any', 5, 'steal',
   '[{"type":"visit_rooms","count":2,"target":2},{"type":"sit_seconds","seconds":30,"target":30}]'),
  ('pickpocket', 'Pickpocket', 'Today you are a pickpocket.', 'Lobbies are busy. Slip through 2 of them and chat up a regular as a distraction. Then pick a player and swipe a few of their coins (1–5%, at most 100).', 'any', 5, 'steal',
   '[{"type":"visit_kind","kind":"lobby","count":2,"target":2},{"type":"talk_npcs","count":1,"target":1}]'),
  ('cat_burglar', 'Cat burglar', 'Today you are a cat burglar.', 'Climb onto 2 rooftops and lie low up there for 45 seconds. Then pick a player and swipe a few of their coins (1–5%, at most 100).', 'any', 5, 'steal',
   '[{"type":"visit_kind","kind":"roof","count":2,"target":2},{"type":"stay_seconds","kind":"roof","seconds":45,"target":45}]'),
  ('heist_planner', 'Heist planner', 'Today you are planning a heist.', 'Scout 2 office floors, sweet-talk 2 regulars, then sit and wait for your moment (30 seconds). Then pick a player and swipe a few of their coins (1–5%, at most 100).', 'any', 10, 'steal',
   '[{"type":"visit_kind","kind":"floor","count":2,"target":2},{"type":"talk_npcs","count":2,"target":2},{"type":"sit_seconds","seconds":30,"target":30}]'),
  ('trickster', 'Trickster', 'Today you are a trickster.', 'Beat someone at Rock-Paper-Scissors while they''re not looking. Then pick a player and swipe a few of their coins (1–5%, at most 100).', 'any', 5, 'steal',
   '[{"type":"win_duel","count":1,"game":"rps","target":1}]'),
  ('card_cheat', 'Card cheat', 'Today you are a card cheat.', 'Play Higher or Lower and get a streak of 4 or more. Then pick a player and swipe a few of their coins (1–5%, at most 100).', 'any', 5, 'steal',
   '[{"type":"play_game","count":1,"game":"cards","minScore":4,"target":1}]'),
  ('detective', 'Detective', 'Today you are a detective.', 'Ask around: talk to 3 different regulars. They''ll point you in the right direction.', 'any', 10, 'hint',
   '[{"type":"talk_npcs","count":3,"target":3}]'),
  ('private_eye', 'Private eye', 'Today you are a private eye.', 'Stake out 2 office floors and sit and watch for 20 seconds. You''ll get a tip-off.', 'any', 10, 'hint',
   '[{"type":"visit_kind","kind":"floor","count":2,"target":2},{"type":"sit_seconds","seconds":20,"target":20}]'),
  ('spy', 'Spy', 'Today you are a spy.', 'Sit in a lobby for 30 seconds, hiding behind a newspaper. Then you can follow one hunter''s searches.', 'any', 5, 'spy',
   '[{"type":"sit_seconds","seconds":30,"kind":"lobby","target":30}]'),
  ('lookout', 'Lookout', 'Today you are the lookout.', 'Take a seat on a rooftop and keep watch for a full minute. You''ll spot something.', 'any', 10, 'hint',
   '[{"type":"sit_seconds","seconds":60,"kind":"roof","target":60}]'),
  ('informant', 'Informant', 'Today you are an informant.', 'Gossip with 2 regulars and ride a balloon to see the whole city. Then you can follow one hunter''s searches.', 'any', 10, 'spy',
   '[{"type":"talk_npcs","count":2,"target":2},{"type":"ride_kind","kind":"balloon","count":1,"target":1}]'),
  ('apprentice_hunter', 'Apprentice hunter', 'Today you are learning the hunt.', 'Search 3 spots and send your drone once. Your teacher will give you a hint.', 'hunter', 10, 'hint',
   '[{"type":"search_tiles","count":3,"target":3},{"type":"sweep","count":1,"target":1}]'),
  ('bounty_hunter', 'Bounty hunter', 'Today you are a bounty hunter.', 'Search 5 spots. Keep at it and your next search is on the house.', 'hunter', 10, 'free_search',
   '[{"type":"search_tiles","count":5,"target":5}]'),
  ('drone_pilot', 'Drone pilot', 'Today you fly the drones.', 'Send your drone out twice. Then enjoy a free search.', 'hunter', 15, 'free_search',
   '[{"type":"sweep","count":2,"target":2}]'),
  ('decoy_master', 'Decoy master', 'Today you are the decoy master.', 'Pop into 3 places to confuse everyone, and stay hidden for 3 minutes. You''ll earn an extra move.', 'ghost', 10, 'free_move',
   '[{"type":"visit_rooms","count":3,"target":3},{"type":"survive_minutes","minutes":3,"target":180}]'),
  ('escape_artist', 'Escape artist', 'Today you are an escape artist.', 'Stay hidden for 8 minutes without being caught. Then you get one extra move.', 'ghost', 15, 'free_move',
   '[{"type":"survive_minutes","minutes":8,"target":480}]'),
  ('ghost_whisperer', 'Ghost whisperer', 'Today you whisper with ghosts.', 'Stay hidden for 5 minutes and say hi to a regular. You''ll learn where the hunters are looking.', 'ghost', 15, 'hint',
   '[{"type":"survive_minutes","minutes":5,"target":300},{"type":"talk_npcs","count":1,"target":1}]'),
  ('shadow', 'Shadow', 'Today you are a shadow.', 'Sit still in a quiet corner for 45 seconds and stay hidden for 4 minutes. Then you can follow a hunter''s searches.', 'ghost', 10, 'spy',
   '[{"type":"sit_seconds","seconds":45,"target":45},{"type":"survive_minutes","minutes":4,"target":240}]'),
  ('courier', 'Courier', 'Today you are a courier.', 'Deliver a parcel of 50 coins to any player (tap someone, then Give coins).', 'any', 30, null,
   '[{"type":"gift","coins":50,"target":50}]'),
  ('philanthropist', 'Philanthropist', 'Today you are a philanthropist.', 'Share the love: give 100 coins in total to at least 2 different players.', 'any', 50, null,
   '[{"type":"gift","coins":100,"target":100},{"type":"gift_people","count":2,"target":2}]'),
  ('good_samaritan', 'Good Samaritan', 'Today you are a Good Samaritan.', 'Give 20 coins to someone who could use them.', 'any', 20, null,
   '[{"type":"gift","coins":20,"target":20}]'),
  ('messenger', 'Messenger', 'Today you carry messages.', 'Run between 2 different buildings and pass a word to a regular in each.', 'any', 25, null,
   '[{"type":"visit_buildings","count":2,"target":2},{"type":"talk_npcs","count":2,"target":2}]'),
  ('party_starter', 'Party starter', 'Today you start the party.', 'Hit a club dance floor, do a dance-off and spray 100 coins on the dancers.', 'any', 40, null,
   '[{"type":"play_game","count":1,"game":"dance","target":1},{"type":"spray","coins":100,"target":100}]'),
  ('big_spender', 'Big spender', 'Today you are the big spender.', 'Make it rain: spray 300 coins on a dance floor.', 'any', 60, null,
   '[{"type":"spray","coins":300,"target":300}]'),
  ('dance_machine', 'Dance machine', 'Today you are a dance machine.', 'Score 600 or more in a dance-off.', 'any', 30, null,
   '[{"type":"play_game","count":1,"game":"dance","minScore":600,"target":1}]'),
  ('dj', 'DJ for a day', 'Today you are the DJ.', 'Pick 2 tunes on a jukebox or DJ deck and keep the room moving.', 'any', 15, null,
   '[{"type":"play_game","count":2,"game":"jukebox","target":2}]'),
  ('karaoke_star', 'Karaoke star', 'Today you are a karaoke star.', 'Grab the mic and get the hype meter to 60 or more.', 'any', 25, null,
   '[{"type":"play_game","count":1,"game":"karaoke","minScore":60,"target":1}]'),
  ('pianist', 'Pianist', 'Today you are the house pianist.', 'Play the piano, then sing one karaoke song.', 'any', 20, null,
   '[{"type":"play_game","count":1,"game":"piano","target":1},{"type":"play_game","count":1,"game":"karaoke","target":1}]'),
  ('sharpshooter', 'Sharpshooter', 'Today you are a sharpshooter.', 'Score 40 or more at archery. Mind the wind!', 'any', 25, null,
   '[{"type":"play_game","count":1,"game":"archery","minScore":40,"target":1}]'),
  ('darts_pro', 'Darts pro', 'Today you are a darts pro.', 'Score 150 or more in one game of darts.', 'any', 25, null,
   '[{"type":"play_game","count":1,"game":"darts","minScore":150,"target":1}]'),
  ('arcade_ace', 'Arcade ace', 'Today you are an arcade ace.', 'Hit 25 or more targets in the arcade reflex game.', 'any', 20, null,
   '[{"type":"play_game","count":1,"game":"reflex","minScore":25,"target":1}]'),
  ('pool_shark', 'Pool shark', 'Today you are a pool shark.', 'Pot 3 or more balls in one game of trick-shot pool.', 'any', 25, null,
   '[{"type":"play_game","count":1,"game":"pool","minScore":3,"target":1}]'),
  ('quiz_master', 'Quiz master', 'Today you are the quiz master.', 'Get 5 or more right in a room trivia quiz.', 'any', 30, null,
   '[{"type":"play_game","count":1,"game":"trivia","minScore":5,"target":1}]'),
  ('champion', 'Champion', 'Today you are the champion.', 'Win 2 duels against other players (Rock-Paper-Scissors or dice).', 'any', 40, null,
   '[{"type":"win_duel","count":2,"target":2}]'),
  ('high_roller', 'High roller', 'Today you are a high roller.', 'Roll the dice 3 times (duel someone or practise).', 'any', 15, null,
   '[{"type":"play_game","count":3,"game":"dice","target":3}]'),
  ('hustler', 'Hustler', 'Today you are a hustler.', 'Play any 3 mini games inside buildings.', 'any', 20, null,
   '[{"type":"play_game","count":3,"target":3}]'),
  ('stair_sprinter', 'Stair sprinter', 'Today you are training for the stair race.', 'Do a stair sprint with 50 steps or more.', 'any', 15, null,
   '[{"type":"play_game","count":1,"game":"stairs","minScore":50,"target":1}]'),
  ('food_critic', 'Food critic', 'Today you are a food critic.', 'Order something at 3 different restaurants and judge every bite.', 'any', 25, null,
   '[{"type":"order_food","count":3,"where":"restaurant","target":3}]'),
  ('mixologist', 'Mixologist', 'Today you are a mixologist.', 'Try mocktails at 2 different bars.', 'any', 15, null,
   '[{"type":"order_food","count":2,"where":"bar","target":2}]'),
  ('street_food_tour', 'Street food tour', 'Today you are on a food tour.', 'Take a car ride, then order at 2 different places.', 'any', 25, null,
   '[{"type":"ride_kind","kind":"car","count":1,"target":1},{"type":"order_food","count":2,"target":2}]'),
  ('tourist', 'Tourist', 'Today you are a tourist.', 'See the sights: ride a hot-air balloon and a boat.', 'any', 30, null,
   '[{"type":"ride_kind","kind":"balloon","count":1,"target":1},{"type":"ride_kind","kind":"boat","count":1,"target":1}]'),
  ('photographer', 'Photographer', 'Today you are a photographer.', 'Visit 3 rooftops for the best shots of the city.', 'any', 25, null,
   '[{"type":"visit_kind","kind":"roof","count":3,"target":3}]'),
  ('night_owl', 'Night owl', 'Today you are a night owl.', 'Spend 2 quiet minutes on a rooftop, watching the city lights.', 'any', 20, null,
   '[{"type":"stay_seconds","kind":"roof","seconds":120,"target":120}]'),
  ('globetrotter', 'Globetrotter', 'Today you are a globetrotter.', 'Step inside 4 different buildings.', 'any', 30, null,
   '[{"type":"visit_buildings","count":4,"target":4}]'),
  ('lift_rider', 'Lift rider', 'Today you ride the lifts.', 'Visit 3 different upstairs floors.', 'any', 20, null,
   '[{"type":"visit_kind","kind":"floor","count":3,"target":3}]'),
  ('high_flyer', 'High flyer', 'Today you are a high flyer.', 'Ride a balloon and stand on a rooftop.', 'any', 25, null,
   '[{"type":"ride_kind","kind":"balloon","count":1,"target":1},{"type":"visit_kind","kind":"roof","count":1,"target":1}]'),
  ('commuter', 'Commuter', 'Today you are a commuter.', 'Ride a train and a car across the city.', 'any', 25, null,
   '[{"type":"ride_kind","kind":"train","count":1,"target":1},{"type":"ride_kind","kind":"car","count":1,"target":1}]'),
  ('sailor', 'Sailor', 'Today you are a sailor.', 'Take 2 boat rides.', 'any', 25, null,
   '[{"type":"ride_kind","kind":"boat","count":2,"target":2}]'),
  ('treasure_hunter', 'Treasure hunter', 'Today you hunt treasure.', 'Grab a reward from a city event or a coin balloon before anyone else.', 'any', 40, null,
   '[{"type":"claim_event","count":1,"target":1}]'),
  ('socialite', 'Socialite', 'Today you are a socialite.', 'Visit 2 places and chat with 4 different regulars.', 'any', 25, null,
   '[{"type":"visit_rooms","count":2,"target":2},{"type":"talk_npcs","count":4,"target":4}]'),
  ('regular', 'The regular', 'Today you are a regular.', 'Sit down for 90 seconds in total. Everyone knows your face by now.', 'any', 20, null,
   '[{"type":"sit_seconds","seconds":90,"target":90}]'),
  ('town_crier', 'Town crier', 'Today you are the town crier.', 'Spread the news: visit 3 places and talk to 3 regulars.', 'any', 30, null,
   '[{"type":"visit_rooms","count":3,"target":3},{"type":"talk_npcs","count":3,"target":3}]')
on conflict (key) do update set title = excluded.title, role = excluded.role, brief = excluded.brief, fits = excluded.fits,
  reward = excluded.reward, action = excluded.action, steps = excluded.steps, enabled = true;
update public.quest_catalog set enabled = false
 where key <> all (array['thief', 'pickpocket', 'cat_burglar', 'heist_planner', 'trickster', 'card_cheat', 
'detective', 'private_eye', 'spy', 'lookout', 'informant', 'apprentice_hunter', 'bounty_hunter', 
'drone_pilot', 'decoy_master', 'escape_artist', 'ghost_whisperer', 'shadow', 'courier', 'philanthropist', 
'good_samaritan', 'messenger', 'party_starter', 'big_spender', 'dance_machine', 'dj', 'karaoke_star', 
'pianist', 'sharpshooter', 'darts_pro', 'arcade_ace', 'pool_shark', 'quiz_master', 'champion', 'high_roller', 
'hustler', 'stair_sprinter', 'food_critic', 'mixologist', 'street_food_tour', 'tourist', 'photographer', 
'night_owl', 'globetrotter', 'lift_rider', 'high_flyer', 'commuter', 'sailor', 'treasure_hunter', 
'socialite', 'regular', 'town_crier']);

-- ============================================================ helpers
-- The tile at grid spot (x, z): the opposite of spiral_xy (part 2).
create or replace function public.spiral_n(p_x int, p_z int) returns int
language plpgsql immutable as $$
declare
  k int := greatest(abs(p_x), abs(p_z));
  m int := (2 * k + 1) * (2 * k + 1);
begin
  if k = 0 then return 0; end if;
  if p_z = -k then return m - (k - p_x) - 1; end if;
  if p_x = -k then return m - 3 * k - p_z - 1; end if;
  if p_z = k then return m - 5 * k - p_x - 1; end if;
  return m - 7 * k + p_z - 1;
end $$;

-- Lock players' rows always in the same order (by id), so two people giving each other
-- coins at the same moment can't get stuck waiting for each other.
create or replace function public.lock_players(p_ids uuid[]) returns void
language plpgsql as $$
begin
  perform 1 from public.profiles where id = any(p_ids) order by id for update;
end $$;

-- A quest as the app sees it.
create or replace function public.quest_state(p_id bigint) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'key', q.quest_key, 'title', c.title, 'role', c.role, 'brief', c.brief,
    'status', q.status, 'progress', q.progress,
    'targets', (select coalesce(jsonb_agg((s->>'target')::numeric order by o), '[]'::jsonb)
                from jsonb_array_elements(c.steps) with ordinality e(s, o)),
    'startedAt', q.started_at, 'expiresAt', q.expires_at, 'completedAt', q.completed_at,
    'reward', c.reward, 'paid', q.reward, 'action', c.action, 'actionUntil', q.action_until,
    'actionUsed', q.action_used_at is not null, 'actionResult', q.action_result, 'roundId', q.round_id)
  from public.quests q join public.quest_catalog c on c.key = q.quest_key
  where q.id = p_id
$$;

-- Finish a quest if every step is done: pay its reward once and unlock its special move.
-- Returns the coins paid (0 when it isn't finished, or was already).
create or replace function public.quest_finish(p_id bigint) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  q public.quests;
  c public.quest_catalog;
  v_round bigint;
begin
  select * into q from public.quests where id = p_id for update;
  if not found or q.status <> 'active' then return 0; end if;
  select * into c from public.quest_catalog where key = q.quest_key;
  if exists (select 1 from jsonb_array_elements(c.steps) with ordinality e(s, o)
             where coalesce((q.progress ->> (o - 1)::int)::numeric, 0) < (s ->> 'target')::numeric) then
    return 0;
  end if;
  update public.quests
     set status = 'done', completed_at = now(), reward = c.reward, action = c.action,
         action_until = case when c.action is not null
                             then now() + make_interval(mins => public.setting('quest_action_minutes')::int) end
   where id = p_id;
  if c.reward > 0 then
    update public.profiles set coins = coins + c.reward where id = q.user_id;
    perform public.log_coins(q.user_id, q.round_id, 'quest_reward', c.reward, false, 'Side quest: ' || c.title);
  end if;
  select max(id) into v_round from public.rounds;
  perform public.notify(q.user_id, v_round, 'quest', format('Side quest complete: %s!%s%s', c.title,
    case when c.reward > 0 then format(' +%s coins.', c.reward) else '' end,
    case when c.action is not null then ' Open the quest card to use your special move.' else '' end));
  return c.reward;
end $$;

-- Count the steps the server can check by itself (coins given or sprayed since the quest
-- started, searches, drone sweeps, event and balloon rewards), then finish the quest if it's
-- done. Returns the coins paid.
create or replace function public.quest_sync(p_id bigint) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  q public.quests;
  c public.quest_catalog;
  s jsonb;
  o bigint;
  v numeric;
  v_prog jsonb;
begin
  select * into q from public.quests where id = p_id for update;
  if not found or q.status <> 'active' then return 0; end if;
  select * into c from public.quest_catalog where key = q.quest_key;
  v_prog := q.progress;
  for s, o in select e.s, e.o from jsonb_array_elements(c.steps) with ordinality e(s, o) loop
    v := case s ->> 'type'
      when 'gift' then (select coalesce(sum(g.amount), 0) from public.coin_gifts g
                        where g.from_id = q.user_id and g.kind = 'gift' and g.created_at >= q.started_at)
      when 'gift_people' then (select count(distinct g.to_id) from public.coin_gifts g
                               where g.from_id = q.user_id and g.kind = 'gift' and g.created_at >= q.started_at)
      when 'spray' then (select coalesce(sum(g.amount), 0) from public.coin_gifts g
                         where g.from_id = q.user_id and g.kind = 'spray' and g.created_at >= q.started_at)
      when 'search_tiles' then (select count(*) from public.searches x
                                where x.seeker_id = q.user_id and x.created_at >= q.started_at)
      when 'sweep' then (select count(*) from public.sweeps x
                         where x.seeker_id = q.user_id and x.created_at >= q.started_at)
      when 'claim_event' then (select count(*) from public.ledger l
                               where l.user_id = q.user_id and l.kind in ('event_reward', 'balloon')
                                 and l.amount > 0 and l.created_at >= q.started_at)
    end;
    if v is not null then
      v := least(v, (s ->> 'target')::numeric);
      if v <> coalesce((v_prog ->> (o - 1)::int)::numeric, 0) then
        v_prog := jsonb_set(v_prog, array[(o - 1)::text], to_jsonb(v));
      end if;
    end if;
  end loop;
  if v_prog is distinct from q.progress then
    update public.quests set progress = v_prog where id = p_id;
  end if;
  return public.quest_finish(p_id);
end $$;

-- ============================================================ side quests
-- Maybe hand a player a side quest. p_source: 'seat' (they sat down), 'npc' (a regular offers
-- one), 'random' (a surprise) or 'order' (they ordered food or a drink). Each source can roll
-- once in a while (quest_roll_seconds_<source>), with its own chance (quest_chance_<source>).
-- p_keys narrows the pick (e.g. a chef hands out food quests); null = any quest.
-- Returns { id, key, title, role, brief } or null (no quest this time).
create or replace function public.offer_quest(p_user uuid, p_source text, p_keys text[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  c public.quest_catalog;
  v_role text;
  v_caught boolean;
  v_round bigint;
  v_fit text[];
  v_roll timestamptz;
  v_recent text[];
  v_id bigint;
begin
  if p_source is null or p_source not in ('seat', 'npc', 'random', 'order') then raise exception 'bad_source'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;

  update public.quests set status = 'expired' where user_id = p_user and status = 'active' and expires_at <= now();
  if exists (select 1 from public.quests where user_id = p_user and status = 'active') then return null; end if;
  if (select count(*) from public.quests where user_id = p_user and started_at >= date_trunc('day', now()))
     >= public.setting('quests_per_day') then
    return null;
  end if;

  -- One roll per source every so often (asking again and again doesn't help).
  select rolled_at into v_roll from public.quest_rolls where user_id = p_user and source = p_source;
  if v_roll is not null and v_roll > now() - make_interval(secs => coalesce(public.setting('quest_roll_seconds_' || p_source), 60)) then
    return null;
  end if;
  insert into public.quest_rolls (user_id, source, rolled_at) values (p_user, p_source, now())
    on conflict (user_id, source) do update set rolled_at = excluded.rolled_at;
  if random() >= coalesce(public.setting('quest_chance_' || p_source), 0) then return null; end if;

  -- Ghost quests for ghosts still hiding, hunter quests for hunters, the rest for anyone.
  select e.role, e.caught, r.id into v_role, v_caught, v_round
    from public.entries e join public.rounds r on r.id = e.round_id
   where r.status <> 'done' and e.user_id = p_user;
  v_fit := case when v_role = 'hider' and not coalesce(v_caught, false) then array['any', 'ghost']
                when v_role = 'seeker' then array['any', 'hunter']
                else array['any'] end;
  select coalesce(array_agg(quest_key), '{}') into v_recent
    from public.quests where user_id = p_user and started_at > now() - interval '24 hours';

  select * into c from public.quest_catalog
   where enabled and fits = any(v_fit) and (p_keys is null or key = any(p_keys)) and not (key = any(v_recent))
   order by random() limit 1;
  if not found then
    select * into c from public.quest_catalog
     where enabled and fits = any(v_fit) and not (key = any(v_recent)) order by random() limit 1;
  end if;
  if not found then
    select * into c from public.quest_catalog where enabled and fits = any(v_fit) order by random() limit 1;
  end if;
  if not found then return null; end if;

  if v_round is null then select max(id) into v_round from public.rounds; end if;
  insert into public.quests (user_id, quest_key, round_id, source, progress, expires_at)
  values (p_user, c.key, v_round, p_source,
          (select jsonb_agg(0) from jsonb_array_elements(c.steps)),
          now() + make_interval(mins => public.setting('quest_minutes')::int))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', c.key, 'title', c.title, 'role', c.role, 'brief', c.brief);
end $$;

-- The player's side quest: the active one, or a finished one whose special move is still
-- waiting to be used. Null when there's none.
create or replace function public.my_quest(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if exists (select 1 from public.quests where user_id = p_user and status = 'active') then
    perform public.lock_players(array[p_user]);  -- the player first, then their quest
    update public.quests set status = 'expired' where user_id = p_user and status = 'active' and expires_at <= now();
    select id into v_id from public.quests where user_id = p_user and status = 'active';
    if found then
      perform public.quest_sync(v_id);
      return public.quest_state(v_id);
    end if;
  end if;
  select id into v_id from public.quests
   where user_id = p_user and status = 'done' and action is not null and action_used_at is null and action_until > now()
   order by completed_at desc limit 1;
  if found then return public.quest_state(v_id); end if;
  return null;
end $$;

-- The app reports progress on one step (0-based) of the player's quest. Slowed down:
--   timed steps (sit_seconds, stay_seconds, survive_minutes, in seconds) can't grow faster than
--   the clock; survive_minutes only counts for a ghost still hiding in a running hunt;
--   other steps grow by at most 2 per report, one report per step every few seconds;
--   steps the server checks itself ignore the number and are recounted.
-- Returns { quest, applied, completed, reward }.
create or replace function public.quest_progress(p_user uuid, p_quest bigint, p_step int, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q public.quests;
  s jsonb;
  v_type text;
  v_target numeric;
  v_cur numeric;
  v_last numeric;
  v_now numeric := extract(epoch from now());
  v_allowed numeric := 0;
  v_reward numeric := 0;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 3600 then raise exception 'bad_amount'; end if;
  perform public.lock_players(array[p_user]);
  select * into q from public.quests where id = p_quest and user_id = p_user for update;
  if not found then raise exception 'no_quest'; end if;
  if q.status = 'active' and q.expires_at <= now() then
    update public.quests set status = 'expired' where id = q.id;
    q.status := 'expired';
  end if;
  if q.status <> 'active' then
    return jsonb_build_object('quest', public.quest_state(q.id), 'applied', 0, 'completed', false, 'reward', 0);
  end if;

  select c.steps -> p_step into s from public.quest_catalog c where c.key = q.quest_key;
  if p_step is null or p_step < 0 or s is null then raise exception 'bad_step'; end if;
  v_type := s ->> 'type';
  v_target := (s ->> 'target')::numeric;

  if v_type in ('gift', 'gift_people', 'spray', 'search_tiles', 'sweep', 'claim_event') then
    v_reward := public.quest_sync(q.id);
  else
    v_cur := coalesce((q.progress ->> p_step)::numeric, 0);
    v_last := coalesce((q.reports ->> p_step::text)::numeric, extract(epoch from q.started_at));
    if v_type in ('sit_seconds', 'stay_seconds', 'survive_minutes') then
      v_allowed := least(p_amount, greatest(0, v_now - v_last) + public.setting('quest_time_slack_seconds'));
      if v_type = 'survive_minutes' and not exists (
        select 1 from public.entries e join public.rounds r on r.id = e.round_id
         where r.status = 'seek' and e.user_id = p_user and e.role = 'hider' and not e.caught) then
        v_allowed := 0;
      end if;
    elsif q.reports ? p_step::text and v_now - v_last < public.setting('quest_report_gap_seconds') then
      v_allowed := 0;  -- too soon after the last report for this step
    else
      v_allowed := least(p_amount, 2);
    end if;
    v_allowed := floor(greatest(0, least(v_allowed, v_target - v_cur)));
    if v_allowed > 0 then
      update public.quests
         set progress = jsonb_set(progress, array[p_step::text], to_jsonb(v_cur + v_allowed)),
             reports = reports || jsonb_build_object(p_step::text, v_now)
       where id = q.id;
      v_reward := public.quest_finish(q.id);
    end if;
  end if;
  return jsonb_build_object('quest', public.quest_state(q.id), 'applied', v_allowed,
    'completed', (select status = 'done' from public.quests where id = q.id), 'reward', v_reward);
end $$;

-- Give up on the active quest (it still counts towards the day's 3).
create or replace function public.quest_drop(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.quests set status = 'dropped' where user_id = p_user and status = 'active';
  return jsonb_build_object('dropped', found);
end $$;

-- A finished quest's special move, if it's still waiting (locked for the caller's transaction).
create or replace function public.quest_perk(p_user uuid, p_action text) returns public.quests
language sql security definer set search_path = public as $$
  select * from public.quests
   where user_id = p_user and status = 'done' and action = p_action and action_used_at is null and action_until > now()
   order by completed_at desc limit 1
   for update
$$;

-- A thief's special move: take 1–5% (at most 100) of another player's coins. Only with a
-- finished quest that unlocked it, and never from someone robbed in the last 24 hours.
-- Returns { amount, target, balance }.
create or replace function public.quest_steal(p_thief uuid, p_target uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.profiles;
  th public.profiles;
  q public.quests;
  v_pct numeric;
  v_amount numeric;
  v_round bigint;
begin
  if p_target is null or p_target = p_thief then raise exception 'steal_self'; end if;
  perform public.lock_players(array[p_thief, p_target]);
  select * into th from public.profiles where id = p_thief;
  if not found or th.is_bot then raise exception 'unknown_player'; end if;
  if th.frozen then raise exception 'frozen'; end if;
  select * into t from public.profiles where id = p_target;
  if not found or t.username is null then raise exception 'unknown_target'; end if;
  if t.is_bot then raise exception 'target_bot'; end if;
  if t.frozen then raise exception 'target_frozen'; end if;

  q := public.quest_perk(p_thief, 'steal');
  if q.id is null then raise exception 'no_steal'; end if;
  if exists (select 1 from public.steals where target_id = p_target
              and created_at > now() - make_interval(hours => public.setting('steal_safe_hours')::int)) then
    raise exception 'target_safe';
  end if;

  v_pct := public.setting('steal_pct_min') + random() * (public.setting('steal_pct_max') - public.setting('steal_pct_min'));
  v_amount := least(public.setting('steal_max'), floor(t.coins * v_pct / 100));
  if v_amount < 1 then raise exception 'target_broke'; end if;

  select max(id) into v_round from public.rounds;
  update public.profiles set coins = coins - v_amount where id = p_target;
  update public.profiles set coins = coins + v_amount where id = p_thief;
  perform public.log_coins(p_thief, v_round, 'steal', v_amount, false, 'Stole from ' || t.username);
  perform public.log_coins(p_target, v_round, 'stolen', -v_amount, false, 'Stolen by ' || coalesce(th.username, 'a thief'));
  insert into public.steals (thief_id, target_id, quest_id, amount) values (p_thief, p_target, q.id, v_amount);
  update public.quests
     set action_used_at = now(),
         action_result = jsonb_build_object('kind', 'steal', 'target', t.username, 'amount', v_amount)
   where id = q.id;
  perform public.notify(p_target, v_round, 'stolen', format(
    '%s was on a Thief quest and stole %s coins from you! Thieves can''t touch you for the next %s hours.',
    coalesce(th.username, 'Someone'), v_amount, public.setting('steal_safe_hours')));
  return jsonb_build_object('amount', v_amount, 'target', t.username,
    'balance', (select coins from public.profiles where id = p_thief));
end $$;

-- The other special moves: 'hint', 'spy', 'free_search', 'free_move'. If the move can't be
-- used right now (no hunt running, nothing to see yet…) it stays waiting.
-- Returns what happened, e.g. { kind: 'ghost_near', tile, radius } or { kind: 'spy', name, tiles }.
create or replace function public.quest_action(p_user uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  q public.quests;
  r public.rounds;
  e public.entries;
  v_tile int;
  v_hint int;
  v_xy int[];
  v_kind text;
  v_hunter uuid;
  v_name text;
  v_res jsonb;
begin
  if p_action is null or p_action not in ('hint', 'spy', 'free_search', 'free_move') then raise exception 'bad_action'; end if;
  perform public.lock_players(array[p_user]);
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  q := public.quest_perk(p_user, p_action);
  if q.id is null then raise exception 'no_perk'; end if;

  if p_action in ('hint', 'spy', 'free_move') then
    select * into r from public.rounds where status = 'seek';
    if not found then raise exception 'no_hunt'; end if;
  end if;

  if p_action = 'hint' then
    select * into e from public.entries where round_id = r.id and user_id = p_user;
    if e.role = 'hider' and not e.caught then
      -- Ghosts: somewhere the hunters searched recently.
      select x.tile into v_tile from (
        select s.tile from public.searches s where s.round_id = r.id order by s.created_at desc limit 6) x
       order by random() limit 1;
      v_kind := 'hunters_near';
    else
      -- Everyone else: near a ghost still hiding (real players before the bot).
      select en.tile into v_tile from public.entries en join public.profiles pr on pr.id = en.user_id
       where en.round_id = r.id and en.role = 'hider' and not en.caught and en.tile is not null and en.user_id <> p_user
       order by pr.is_bot, random() limit 1;
      v_kind := 'ghost_near';
    end if;
    if v_tile is null then raise exception 'nothing_yet'; end if;
    -- Blur it: a spot up to 2 tiles away (that's on the map).
    v_xy := public.spiral_xy(v_tile);
    for i in 1 .. 10 loop
      v_hint := public.spiral_n(v_xy[1] + floor(random() * 5)::int - 2, v_xy[2] + floor(random() * 5)::int - 2);
      exit when v_hint < r.tile_count;
    end loop;
    if v_hint is null or v_hint >= r.tile_count then v_hint := v_tile; end if;
    v_res := jsonb_build_object('kind', v_kind, 'tile', v_hint, 'radius', 2, 'roundId', r.id);

  elsif p_action = 'spy' then
    select en.user_id, pr.username into v_hunter, v_name
      from public.entries en join public.profiles pr on pr.id = en.user_id
     where en.round_id = r.id and en.role = 'seeker' and en.user_id <> p_user
       and exists (select 1 from public.searches s where s.round_id = r.id and s.seeker_id = en.user_id)
     order by random() limit 1;
    if v_hunter is null then raise exception 'nothing_yet'; end if;
    v_res := jsonb_build_object('kind', 'spy', 'name', coalesce(v_name, 'A hunter'), 'roundId', r.id,
      'tiles', (select jsonb_agg(x.tile order by x.created_at desc) from (
                  select s.tile, s.created_at from public.searches s
                   where s.round_id = r.id and s.seeker_id = v_hunter order by s.created_at desc limit 5) x));

  elsif p_action = 'free_search' then
    if p.free_search_day is distinct from current_date then raise exception 'already_free'; end if;
    update public.profiles set free_search_day = null where id = p_user;
    v_res := jsonb_build_object('kind', 'free_search');

  else -- free_move
    select * into e from public.entries
     where round_id = r.id and user_id = p_user and role = 'hider' and not caught for update;
    if not found then raise exception 'not_ghost'; end if;
    if e.moves < 1 then raise exception 'no_moves_used'; end if;
    update public.entries set moves = moves - 1 where round_id = r.id and user_id = p_user;
    v_res := jsonb_build_object('kind', 'free_move');
  end if;

  update public.quests set action_used_at = now(), action_result = v_res where id = q.id;
  return v_res;
end $$;

-- ============================================================ giving coins
-- Checks shared by gifts and spraying: may this player give coins away (amount more today)?
create or replace function public.gift_check(p public.profiles, p_amount numeric) returns void
language plpgsql set search_path = public as $$
declare
  v_today numeric;
begin
  if p.id is null or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.seeker_rounds + p.hider_rounds < public.setting('gift_min_rounds') then raise exception 'new_player'; end if;
  select coalesce(sum(amount), 0) into v_today from public.coin_gifts
   where from_id = p.id and created_at >= date_trunc('day', now());
  if v_today + p_amount > public.setting('gift_daily_max') then
    raise exception 'daily_cap:%', greatest(public.setting('gift_daily_max') - v_today, 0);
  end if;
  if p.coins < p_amount then raise exception 'not_enough'; end if;
end $$;

-- Give coins to another player (1–10,000 whole coins). Returns { amount, to, balance, left_today }.
create or replace function public.give_coins(p_from uuid, p_to uuid, p_amount numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.profiles;
  t public.profiles;
  v_note text := nullif(btrim(left(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g'), 80)), '');
  v_pair numeric;
  v_round bigint;
  v_q bigint;
begin
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 1 or p_amount > public.setting('gift_max') then
    raise exception 'bad_amount';
  end if;
  if p_to is null or p_to = p_from then raise exception 'gift_self'; end if;
  perform public.lock_players(array[p_from, p_to]);
  select * into f from public.profiles where id = p_from;
  select * into t from public.profiles where id = p_to;
  if t.id is null or t.username is null then raise exception 'unknown_target'; end if;
  if t.is_bot then raise exception 'target_bot'; end if;
  if t.frozen then raise exception 'target_frozen'; end if;
  perform public.gift_check(f, p_amount);
  select coalesce(sum(amount), 0) into v_pair from public.coin_gifts
   where from_id = p_from and to_id = p_to and created_at >= date_trunc('day', now());
  if v_pair + p_amount > public.setting('gift_pair_daily_max') then
    raise exception 'pair_cap:%', greatest(public.setting('gift_pair_daily_max') - v_pair, 0);
  end if;

  select max(id) into v_round from public.rounds;
  update public.profiles set coins = coins - p_amount where id = p_from;
  update public.profiles set coins = coins + p_amount where id = p_to;
  perform public.log_coins(p_from, v_round, 'gift_sent', -p_amount, false, 'To ' || t.username || coalesce(': ' || v_note, ''));
  perform public.log_coins(p_to, v_round, 'gift_received', p_amount, false, 'From ' || f.username || coalesce(': ' || v_note, ''));
  insert into public.coin_gifts (from_id, to_id, kind, amount, note) values (p_from, p_to, 'gift', p_amount, v_note);
  perform public.notify(p_to, v_round, 'gift', format('%s gave you %s coins%s', f.username, p_amount,
    coalesce(': "' || v_note || '"', '!')));

  select id into v_q from public.quests where user_id = p_from and status = 'active' and expires_at > now();
  if found then perform public.quest_sync(v_q); end if;
  return jsonb_build_object('amount', p_amount, 'to', t.username,
    'balance', (select coins from public.profiles where id = p_from),
    'left_today', public.setting('gift_daily_max') - (select coalesce(sum(amount), 0) from public.coin_gifts
                                                       where from_id = p_from and created_at >= date_trunc('day', now())));
end $$;

-- Spraying: shower 10–500 coins over up to 10 dancers, split between them as evenly as whole
-- coins allow. Returns { amount, shares: [{ id, name, coins }], balance }.
create or replace function public.spray_coins(p_from uuid, p_targets uuid[], p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.profiles;
  v_ids uuid[];
  n int;
  v_per numeric;
  v_extra int;
  v_round bigint;
  v_shares jsonb;
  v_q bigint;
  x record;
begin
  if p_amount is null or p_amount <> trunc(p_amount)
     or p_amount < public.setting('spray_min') or p_amount > public.setting('spray_max') then
    raise exception 'bad_amount';
  end if;
  -- Real players only (not you, not the bot, not frozen), at most spray_max_targets of them.
  select coalesce(array_agg(id), '{}') into v_ids from (
    select id from public.profiles
     where id = any(coalesce(p_targets, '{}')) and id <> p_from and not is_bot and not frozen and username is not null
     order by random() limit public.setting('spray_max_targets')::int) x;
  n := coalesce(array_length(v_ids, 1), 0);
  if n = 0 then raise exception 'no_dancers'; end if;

  perform public.lock_players(v_ids || p_from);
  select * into f from public.profiles where id = p_from;
  perform public.gift_check(f, p_amount);

  v_per := floor(p_amount / n);
  v_extra := (p_amount - v_per * n)::int;
  select max(id) into v_round from public.rounds;
  update public.profiles set coins = coins - p_amount where id = p_from;
  perform public.log_coins(p_from, v_round, 'spray_sent', -p_amount, false, format('Sprayed %s dancers', n));
  v_shares := '[]'::jsonb;
  for x in select pr.id, pr.username, row_number() over (order by random()) as rn
             from public.profiles pr where pr.id = any(v_ids) loop
    declare v_share numeric := v_per + case when x.rn <= v_extra then 1 else 0 end;
    begin
      continue when v_share <= 0;
      update public.profiles set coins = coins + v_share where id = x.id;
      perform public.log_coins(x.id, v_round, 'spray_received', v_share, false, 'Sprayed by ' || f.username);
      insert into public.coin_gifts (from_id, to_id, kind, amount) values (p_from, x.id, 'spray', v_share);
      perform public.notify(x.id, v_round, 'spray', format('%s sprayed you %s coins on the dance floor!', f.username, v_share));
      v_shares := v_shares || jsonb_build_object('id', x.id, 'name', x.username, 'coins', v_share);
    end;
  end loop;

  select id into v_q from public.quests where user_id = p_from and status = 'active' and expires_at > now();
  if found then perform public.quest_sync(v_q); end if;
  return jsonb_build_object('amount', p_amount, 'shares', v_shares,
    'balance', (select coins from public.profiles where id = p_from));
end $$;

-- ============================================================ mini game rewards
-- A finished mini game (score from the player's phone, so it's only trusted a little).
-- Pays 2–10 coins for a good score, at most activity_rewards_per_day times a day, with a short
-- wait between claims. Returns { coins, left_today, reason } where reason is null when paid,
-- otherwise 'low_score', 'daily_limit' or 'too_soon'.
create or replace function public.claim_activity_reward(p_user uuid, p_game text, p_score numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  g public.activity_games;
  v_today int;
  v_coins numeric := 0;
  v_reason text;
  v_per_day int := public.setting('activity_rewards_per_day')::int;
  v_round bigint;
begin
  select * into g from public.activity_games where game = p_game;
  if not found then raise exception 'bad_game'; end if;
  if p_score is null or p_score < 0 or p_score > g.cap_score then raise exception 'bad_score'; end if;
  perform public.lock_players(array[p_user]);
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;

  select count(*) into v_today from public.activity_claims
   where user_id = p_user and coins > 0 and created_at >= date_trunc('day', now());
  if exists (select 1 from public.activity_claims where user_id = p_user
              and created_at > now() - make_interval(secs => public.setting('activity_any_cooldown_seconds')))
     or exists (select 1 from public.activity_claims where user_id = p_user and game = p_game
              and created_at > now() - make_interval(secs => public.setting('activity_game_cooldown_seconds'))) then
    return jsonb_build_object('coins', 0, 'reason', 'too_soon', 'left_today', greatest(v_per_day - v_today, 0));
  end if;

  if p_score < g.min_score then
    v_reason := 'low_score';
  elsif v_today >= v_per_day then
    v_reason := 'daily_limit';
  else
    v_coins := g.coins_min + round((g.coins_max - g.coins_min)
      * least(1, greatest(0, (p_score - g.min_score) / nullif(g.top_score - g.min_score, 0))));
    v_coins := coalesce(v_coins, g.coins_max);  -- min = top: a win pays the full amount
  end if;
  insert into public.activity_claims (user_id, game, score, coins) values (p_user, p_game, p_score, v_coins);
  if v_coins > 0 then
    select max(id) into v_round from public.rounds;
    update public.profiles set coins = coins + v_coins where id = p_user;
    perform public.log_coins(p_user, v_round, 'activity_reward', v_coins, false, 'Mini game: ' || p_game);
    v_today := v_today + 1;
  end if;
  return jsonb_build_object('coins', v_coins, 'reason', v_reason, 'left_today', greatest(v_per_day - v_today, 0));
end $$;

-- ============================================================ coin books
-- Created coins now include quest and mini game rewards (and everything from parts 10, 17, 18).
-- Gifts, spraying and thefts only move coins between players.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['quest_catalog', 'quests', 'quest_rolls', 'coin_gifts', 'steals', 'activity_games', 'activity_claims'] loop
    execute format('alter table public.%I enable row level security', t);  -- no policies: only the server reads them
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  foreach t in array array['quests_id_seq', 'coin_gifts_id_seq', 'steals_id_seq', 'activity_claims_id_seq'] loop
    execute format('revoke all on sequence public.%I from public, anon, authenticated', t);
    execute format('grant usage, select on sequence public.%I to service_role', t);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('spiral_n', 'lock_players', 'quest_state', 'quest_finish', 'quest_sync', 'offer_quest', 'my_quest',
            'quest_progress', 'quest_drop', 'quest_perk', 'quest_steal', 'quest_action', 'gift_check', 'give_coins',
            'spray_coins', 'claim_activity_reward')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 020_sports.sql
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

-- ======================================================== 021_hourly_rounds.sql
-- Newtown, part 21: games on the hour.
-- Every game starts at the top of an hour (UTC): a 3-minute join window (ghosts sign up), then
-- the hunt until the next hour mark, on the dot. Then the next game's countdown starts straight
-- away. A game that's already running on the old timing (say it started at 7:16) is pulled in
-- to end at the next hour mark, so from then on every countdown starts at 8:00, 9:00... on the
-- dot. Catching every ghost no longer ends the game early: the hunt always runs to the hour.
-- Safe to run more than once (run it again if you ran an earlier copy). Run after parts 1-20.

insert into public.game_settings (key, value, note) values
  ('join_minutes', 3, 'Join window at the start of every hour (minutes)'),
  ('min_hunt_minutes', 15, 'A game created later than this many minutes before the hour waits for the next hour')
on conflict (key) do update set note = excluded.note;
-- The join window is now 3 minutes (it used to be 10).
update public.game_settings set value = 3 where key = 'join_minutes' and value = 10;

-- The round clock: games are lined up on the hour.
create or replace function public.tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  v_id bigint;
  v_join int := public.setting('join_minutes')::int;
  v_min_hunt int := coalesce(public.setting('min_hunt_minutes')::int, 15);
  v_hour timestamptz := date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC';
  v_join_end timestamptz;
  v_next timestamptz;
  v_pick int;
  h record;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status <> 'done' for update;

  -- Keep every game on the hour: one still running to an odd time (started on the old timing)
  -- is pulled in to end at the next hour mark, so the next countdown starts on the dot.
  if found and r.seek_ends_at > now()
     and r.seek_ends_at <> date_trunc('hour', r.seek_ends_at at time zone 'UTC') at time zone 'UTC' then
    v_next := v_hour + interval '1 hour';
    update public.rounds
      set seek_ends_at = v_next,
          join_ends_at = least(join_ends_at, v_next - interval '1 minute')
      where id = r.id
      returning * into r;
  end if;

  if not found then
    -- Too late in this hour for a proper hunt: line up for the next hour instead.
    if now() > v_hour + make_interval(mins => 60 - v_min_hunt) then
      v_hour := v_hour + interval '1 hour';
    end if;
    -- Join until 3 minutes past the hour (at least a minute from now, if we're running late).
    v_join_end := greatest(v_hour + make_interval(mins => v_join), now() + interval '1 minute');
    -- A fresh city with an empty pool; the hunt ends on the next hour mark.
    insert into public.rounds (join_ends_at, seek_ends_at, pool, tile_count, hiders_total, hiders_remaining, bot_name)
    values (v_join_end, v_hour + interval '1 hour', 0, public.setting('base_tiles')::int, 1, 1, 'Seed Bot')
    returning id into v_id;
    update public.rounds set bot_name = coalesce(
      (select name from public.bot_names order by id offset (v_id % greatest((select count(*) from public.bot_names), 1)) limit 1),
      'Seed Bot') where id = v_id;
    insert into public.entries (round_id, user_id, role) values (v_id, v_bot, 'hider');
    return 'round created';
  end if;

  if r.status = 'join' and now() >= r.join_ends_at then
    -- Drop each ghost on a random free spot. Picks spots directly instead of shuffling the
    -- whole town, so it stays quick however big the town gets (ghosts never fill more than
    -- a twentieth of it, so a free spot turns up in a try or two).
    for h in select user_id from public.entries where round_id = r.id and role = 'hider' order by random() loop
      for k in 1..200 loop
        v_pick := floor(random() * r.tile_count)::int;
        exit when not exists (select 1 from public.entries x where x.round_id = r.id and x.tile = v_pick);
      end loop;
      update public.entries set tile = v_pick where round_id = r.id and user_id = h.user_id;
    end loop;
    update public.rounds set status = 'seek' where id = r.id;
    v_out := 'seeking started';
    r.status := 'seek';
  end if;

  if r.status = 'seek' and now() >= r.seek_ends_at then
    perform public.finalize_round(r.id);
    -- The next game is set up on the next tick (seconds later: any open screen asks for one),
    -- and its countdown is pinned to the hour, so it still starts on time.
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

-- Searching: the same as part 17, except that finding the last ghost no longer ends the game.
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
  if public.event_area(r.id, 'blackout_district', p_tile) then raise exception 'It''s too dark to search there right now (blackout)'; end if;
  v_cool := public.search_gate(p_user);
  if en.user_id is null then perform public.join_round(p_user, 'seeker'); end if;
  select * into p from public.profiles where id = p_user;

  if p.free_search_day is distinct from current_date then
    v_cost := 0;
    update public.profiles set free_search_day = current_date where id = p_user;
  else
    v_cost := public.search_price(r.searched_count, r.tile_count);
  end if;
  if public.event_area(r.id, 'lucky_street', p_tile) then v_cost := 0; end if;
  perform public.charge_hunter(r.id, p_user, v_cost, 'search_fee');

  res := public.search_resolve(r.id, p_user, p_tile, v_cost, false);
  -- Every ghost found? The hunt still runs to the top of the hour (part 21).
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
  if public.event_area(r.id, 'blackout_district', p_tile) then raise exception 'It''s too dark to search there right now (blackout)'; end if;
  v_cool := public.search_gate(p_user);
  if en.user_id is null then perform public.join_round(p_user, 'seeker'); end if;

  v_cost := round(public.search_price(r.searched_count, r.tile_count) * public.setting('big_search_multiplier'), 2);
  perform public.charge_hunter(r.id, p_user, v_cost, 'search_fee');
  insert into public.events (round_id, kind, tile, detail) values (r.id, 'area_search', p_tile, jsonb_build_object('radius', 1));

  -- The 3x3 block around the spot, worked out directly (no scan of the whole town).
  for v_tile in
    select t from (
      select public.npc_xy_tile(c[1] + dx, c[2] + dy) t
      from (select public.spiral_xy(p_tile) c) s, generate_series(-1, 1) dx, generate_series(-1, 1) dy
    ) n where t < r.tile_count order by t
  loop
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

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('tick', 'search_tile', 'search_area')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 022_pool_and_ads.sql
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

-- ======================================================== 023_houses.sql
-- Newtown, part 23: player houses (phase 1).
-- Every player can design one simple house from what the town already draws: a style
-- (cottage, bungalow, modern, duplex, villa), a wall colour, a roof colour, a room style for
-- inside and a name for the sign (24 characters at most). The lists mirror src/lib/houses.ts:
-- change both together, and never rename an id (saved houses use them).
-- Run once in Supabase → SQL Editor, after 022 (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- - Showing it: a player switches "Show my house in the game" on. Every new game takes a
--   snapshot of the houses switched on at that moment (round_houses), and the city puts them in
--   the busiest part of that game's town. Switching off, or changing the design, only counts
--   from the next game: the game already running keeps its snapshot.
-- - Each house standing in a game adds tiles_per_house (5) spots to that game's town, on top of
--   the usual starting spots (base_tiles) and the spots each ghost adds.
-- - At most houses_per_round_max (500) houses stand in one game. When more are switched on, the
--   ones that have waited longest go first (waiting since they were switched on, or since they
--   last stood in a game), so everybody takes turns.
-- - Bots, paused (frozen) and under-18 accounts never get a house in the game.
-- - Edits: at most house_saves_per_day (30) saved changes a day. Names go through a small
--   filter for slurs and obvious insults (also spaced out or with punctuation in between).
--
-- Coin books: houses are free for now. Nothing here moves any mint (no ledger rows at all), so
-- the coin books are untouched. (Switching a house off gives nothing back, as nothing was paid.)
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('tiles_per_house',      5,   'Extra spots each player house standing in a game adds to its town'),
  ('houses_per_round_max', 500, 'Most player houses standing in one game (the longest-waiting go first)'),
  ('house_saves_per_day',  30,  'Most changes one player can save to their house in a day')
on conflict (key) do update set note = excluded.note;

-- ============================================================ the catalog
-- True if p_value is one of the choices for p_kind ('style', 'wall', 'roof' or 'interior').
-- A copy of the lists in src/lib/houses.ts (colours in lower case).
create or replace function public.house_choice_ok(p_kind text, p_value text) returns boolean
language sql immutable as $$
  select coalesce(case p_kind
    when 'style' then p_value = any (array['cottage', 'bungalow', 'modern', 'duplex', 'villa'])
    when 'wall' then p_value = any (array['#f8f9fa', '#ffe8cc', '#fff3bf', '#d3f9d8', '#d0ebff',
                                          '#e5dbff', '#ffdeeb', '#e9ecef', '#c5a880', '#868e96'])
    when 'roof' then p_value = any (array['#c92a2a', '#e8590c', '#5c3d2e', '#2b8a3e', '#1864ab',
                                          '#5f3dc4', '#343a40', '#adb5bd'])
    when 'interior' then p_value = any (array['living', 'lounge', 'studio', 'party', 'dining'])
  end, false)
$$;

-- Tidies a house name the same way as cleanHouseName in src/lib/houses.ts: letters, numbers,
-- spaces and ' & . , ! - only, single spaces, at most 24 characters.
create or replace function public.house_clean_name(p_name text) returns text
language plpgsql stable as $$
declare v text := coalesce(p_name, '');
begin
  if current_setting('server_encoding') = 'UTF8' then v := normalize(v, NFKC); end if;
  v := regexp_replace(v, '[^[:alnum:][:space:]''&.,!-]', '', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  return btrim(left(v, 24));
end $$;

-- True if a name contains a slur or an obvious insult. Kept small on purpose: it checks each
-- word in lower case, with common look-alikes swapped back (sh1t, $lut), punctuation dropped
-- (f.u.c.k), letters typed with spaces in between joined up (f u c k) and stretched letters
-- squeezed (fuuuck).
create or replace function public.house_name_rude(p_name text) returns boolean
language plpgsql immutable as $$
declare
  -- Rude anywhere inside a word.
  v_inside constant text[] := array['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore',
    'slut', 'wanker', 'twat', 'bastard', 'asshole', 'dickhead', 'retard', 'hitler', 'paedophile', 'pedophile'];
  -- Rude only as a whole word (inside other words they are harmless: spicy, therapist, Nazir).
  v_whole constant text[] := array['fag', 'fags', 'spic', 'chink', 'kike', 'nazi', 'nazis', 'rape', 'rapist',
    'pedo', 'paedo', 'porn', 'sex', 'pussy', 'tits', 'penis', 'idiot', 'moron',
    'ashawo', 'ashewo', 'olosho', 'werey', 'mumu', 'olodo'];
  v text;
  w text;
  v_words text[] := '{}';
  v_run text := '';
begin
  v := translate(lower(coalesce(p_name, '')), '0134578@$!|', 'oieastbasii');
  v := regexp_replace(v, '[^[:alnum:][:space:]]', '', 'g');
  foreach w in array regexp_split_to_array(btrim(v), '\s+') loop
    if char_length(w) = 1 then
      v_run := v_run || w;
    else
      if v_run <> '' then v_words := v_words || v_run; v_run := ''; end if;
      if w <> '' then v_words := v_words || w; end if;
    end if;
  end loop;
  if v_run <> '' then v_words := v_words || v_run; end if;
  foreach w in array v_words loop
    foreach v in array array[w, regexp_replace(w, '(.)\1+', '\1', 'g')] loop
      if v = any (v_whole) then return true; end if;
      if exists (select 1 from unnest(v_inside) b where strpos(v, b) > 0) then return true; end if;
    end loop;
  end loop;
  return false;
end $$;

-- ============================================================ tables
-- Each player's house (one each).
create table if not exists public.houses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 24),
  style text not null default 'cottage' check (public.house_choice_ok('style', style)),
  wall text not null default '#ffe8cc' check (public.house_choice_ok('wall', wall)),
  roof text not null default '#c92a2a' check (public.house_choice_ok('roof', roof)),
  interior text not null default 'living' check (public.house_choice_ok('interior', interior)),
  published boolean not null default false,  -- "Show my house in the game"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,                  -- when it was last switched on
  last_stood_at timestamptz,                 -- when it last stood in a game (for taking turns)
  saves_day date,                            -- the day saves_today counts for
  saves_today int not null default 0
);
create index if not exists houses_waiting_idx on public.houses (published_at) where published;

-- The houses standing in each game: a copy taken when the game is created, so switching off or
-- editing a house never changes a game that's already running. Slot 0, 1, 2… is the order they
-- were placed in (the longest-waiting house gets slot 0).
create table if not exists public.round_houses (
  round_id bigint not null references public.rounds (id) on delete cascade,
  slot int not null check (slot >= 0),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) <= 24),
  style text not null,
  wall text not null,
  roof text not null,
  interior text not null,
  owner_name text not null,
  primary key (round_id, slot),
  unique (round_id, user_id)
);
create index if not exists round_houses_user_idx on public.round_houses (user_id);

-- ============================================================ what the app shows
-- A player's house: { saved, design: { name, style, wall, roof, interior } or null, published,
-- standing (in the current game), slot (in the current game, or null), round_id (the current
-- game), owner (the player's name), saves_left (today), tiles_per_house }.
create or replace function public.my_house(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with h as (select * from public.houses where user_id = p_user),
       r as (select id from public.rounds order by id desc limit 1),
       s as (select rh.slot from public.round_houses rh join r on rh.round_id = r.id where rh.user_id = p_user)
  select jsonb_build_object(
    'saved', exists (select 1 from h),
    'design', (select jsonb_build_object('name', name, 'style', style, 'wall', wall, 'roof', roof, 'interior', interior) from h),
    'published', coalesce((select published from h), false),
    'standing', exists (select 1 from s),
    'slot', (select slot from s),
    'round_id', (select id from r),
    'owner', (select username from public.profiles where id = p_user),
    'saves_left', greatest(coalesce(public.setting('house_saves_per_day'), 30)::int
                           - coalesce((select saves_today from h where saves_day = current_date), 0), 0),
    'tiles_per_house', coalesce(public.setting('tiles_per_house'), 5))
$$;

-- The houses standing in one game, in slot order:
-- [{ slot, user_id, name, style, wall, roof, interior, owner }].
create or replace function public.round_houses_of(p_round bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slot', slot, 'user_id', user_id, 'name', name, 'style', style,
           'wall', wall, 'roof', roof, 'interior', interior, 'owner', owner_name) order by slot), '[]'::jsonb)
  from public.round_houses where round_id = p_round
$$;

-- ============================================================ saving and showing
-- Save a player's house design (every choice is checked against the catalog; the name is
-- tidied and filtered). Saving the same design again is free and doesn't count towards the
-- daily limit. Returns my_house plus { changed }.
-- Errors: unknown_player, bot, frozen, bad_style, bad_wall, bad_roof, bad_interior, rude_name,
-- too_many_saves:<limit>.
create or replace function public.save_house(
  p_user uuid, p_name text, p_style text, p_wall text, p_roof text, p_interior text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  h public.houses;
  v_name text := public.house_clean_name(p_name);
  v_wall text := lower(btrim(coalesce(p_wall, '')));
  v_roof text := lower(btrim(coalesce(p_roof, '')));
  v_max int := coalesce(public.setting('house_saves_per_day'), 30)::int;
  v_used int;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'unknown_player'; end if;
  if p.is_bot then raise exception 'bot'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not public.house_choice_ok('style', p_style) then raise exception 'bad_style'; end if;
  if not public.house_choice_ok('wall', v_wall) then raise exception 'bad_wall'; end if;
  if not public.house_choice_ok('roof', v_roof) then raise exception 'bad_roof'; end if;
  if not public.house_choice_ok('interior', p_interior) then raise exception 'bad_interior'; end if;
  if public.house_name_rude(v_name) then raise exception 'rude_name'; end if;

  select * into h from public.houses where user_id = p_user for update;
  if found then
    if (h.name, h.style, h.wall, h.roof, h.interior) = (v_name, p_style, v_wall, v_roof, p_interior) then
      return public.my_house(p_user) || jsonb_build_object('changed', false);
    end if;
    v_used := case when h.saves_day = current_date then h.saves_today else 0 end;
    if v_used >= v_max then raise exception 'too_many_saves:%', v_max; end if;
    update public.houses
       set name = v_name, style = p_style, wall = v_wall, roof = v_roof, interior = p_interior,
           updated_at = now(), saves_day = current_date, saves_today = v_used + 1
     where user_id = p_user;
  else
    if v_max < 1 then raise exception 'too_many_saves:%', v_max; end if;
    insert into public.houses (user_id, name, style, wall, roof, interior, saves_day, saves_today)
    values (p_user, v_name, p_style, v_wall, v_roof, p_interior, current_date, 1)
    on conflict (user_id) do nothing;  -- two first saves at the same moment: the other one won
  end if;
  return public.my_house(p_user) || jsonb_build_object('changed', true);
end $$;

-- Switch "Show my house in the game" on or off. Takes effect from the next game: the game
-- that's running keeps its houses. Switching off is always allowed and is free (nothing to
-- refund: houses cost nothing for now). Returns my_house.
-- Errors (switching on): unknown_player, no_house, bot, frozen, no_name.
create or replace function public.set_house_published(p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  h public.houses;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'unknown_player'; end if;
  select * into h from public.houses where user_id = p_user for update;
  if not found then
    if coalesce(p_on, false) then raise exception 'no_house'; end if;
    return public.my_house(p_user);
  end if;
  if coalesce(p_on, false) then
    if p.is_bot then raise exception 'bot'; end if;
    if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
    if nullif(btrim(coalesce(p.username, '')), '') is null then raise exception 'no_name'; end if;
    if not h.published then
      update public.houses set published = true, published_at = now() where user_id = p_user;
    end if;
  elsif h.published then
    update public.houses set published = false where user_id = p_user;
  end if;
  return public.my_house(p_user);
end $$;

-- ============================================================ every new game
-- Every new game takes a snapshot of the houses switched on (longest-waiting first, at most
-- houses_per_round_max, no bots, paused or under-18 accounts) and grows its town by
-- tiles_per_house spots for each one. A problem here never stops the game from starting.
create or replace function public.rounds_place_houses() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_max int := greatest(coalesce(public.setting('houses_per_round_max'), 500), 0)::int;
  v_tiles int := greatest(coalesce(public.setting('tiles_per_house'), 5), 0)::int;
  v_at timestamptz := clock_timestamp();
  v_n int;
begin
  if new.status = 'done' or v_max = 0 then return null; end if;
  with picked as (
    select h.user_id, h.name, h.style, h.wall, h.roof, h.interior,
           coalesce(nullif(btrim(p.username), ''), 'A player') as owner_name,
           (row_number() over (order by greatest(h.published_at, h.last_stood_at), h.published_at, h.user_id) - 1)::int as slot
      from public.houses h
      join public.profiles p on p.id = h.user_id
     where h.published and not p.is_bot and not p.frozen and p.age_blocked_at is null
     order by greatest(h.published_at, h.last_stood_at), h.published_at, h.user_id
     limit v_max
  ), placed as (
    insert into public.round_houses (round_id, slot, user_id, name, style, wall, roof, interior, owner_name)
    select new.id, slot, user_id, name, style, wall, roof, interior, owner_name from picked
    on conflict do nothing
    returning user_id
  )
  update public.houses set last_stood_at = v_at where user_id in (select user_id from placed);

  select count(*) into v_n from public.round_houses where round_id = new.id;
  if v_n > 0 and v_tiles > 0 then
    update public.rounds set tile_count = tile_count + v_n * v_tiles where id = new.id;
  end if;
  return null;
exception when others then
  raise warning 'houses not placed in game %: %', new.id, sqlerrm;
  return null;
end $$;
drop trigger if exists rounds_place_houses on public.rounds;
create trigger rounds_place_houses after insert on public.rounds
  for each row execute function public.rounds_place_houses();

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['houses', 'round_houses'] loop
    execute format('alter table public.%I enable row level security', t);  -- no policies: only the server reads them
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('house_choice_ok', 'house_clean_name', 'house_name_rude', 'my_house', 'round_houses_of', 'save_house',
            'set_house_published', 'rounds_place_houses')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 024_play_style.sql
-- Newtown, part 24: play styles ("This game you were The Explorer: 5 buildings visited…").
-- Run once in Supabase → SQL Editor, after parts 1–23.
-- Safe to run again: it only adds what is missing, refreshes the style rules and replaces
-- functions (the play_diary_hours setting keeps any value you changed).
--
-- At the end of a game every player gets a play style: one of twelve (The Explorer, The Tourist,
-- The Detective, The Phantom, The Escape Artist, The Socialite, The Party Animal, The Foodie,
-- The High Roller, The Master Thief, The Gamer, The Sports Fan). Over time each player builds up
-- a mix ("40% Explorer, 25% Detective…").
--
-- - The app keeps a diary of the game on the player's phone (buildings, rides, food, time in the
--   club…) and sends it once, when the results open: save_play_diary. Each number is capped to a
--   sane maximum (play_counters), unknown numbers are dropped. The phone can fib, but that only
--   changes the player's own fun profile: nothing here ever moves mint.
-- - What the server knows for sure (searches, drone sweeps, catches, ghost moves, staying hidden,
--   shields and decoys, bets, match tickets, gifts, sprays, thefts, side quests, town events,
--   chat messages, mini game claims, chats with the locals) is counted here and replaces (or tops
--   up) what the phone says. Food and drink orders are only in the diary: the server doesn't keep
--   each order.
-- - A diary is accepted once per player per game, only for a finished game (within
--   play_diary_hours of the end) the player took part in or visited during: an entry, a check-in
--   (play_check_in, which the app calls once while a game is on), or anything the server counted.
-- - The style is worked out here, the same way as src/lib/play-style.ts: points per style =
--   weight × number (up to a cap) from play_style_rules; most points wins; a dead heat goes to the
--   rarer style (play_style_kinds.tie); no points at all: The Explorer. Change both together.
-- - Lifetime: each game adds its style mix (points shared out so they add up to 1) to
--   play_style_totals, so my_play_style can show the proportions as bars.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('play_diary_hours', 48, 'Hours after a game ends that its play diary can still be saved')
on conflict (key) do nothing;

-- ============================================================ the styles and their rules
-- A copy of STYLES / COUNTERS / RULES in src/lib/play-style.ts.
create table if not exists public.play_style_kinds (
  style text primary key,
  title text not null,
  tie int not null            -- breaks a dead heat: the lower number wins
);

create table if not exists public.play_counters (
  counter text primary key,
  max int not null check (max >= 0),
  -- who knows it best: the app ('client'), the server ('server': replaces the app's number),
  -- or both ('max': the bigger one counts)
  source text not null check (source in ('client', 'server', 'max'))
);

create table if not exists public.play_style_rules (
  style text not null references public.play_style_kinds (style) on delete cascade on update cascade,
  counter text not null references public.play_counters (counter) on delete cascade on update cascade,
  weight int not null check (weight between 0 and 100),
  cap int not null check (cap between 0 and 10000),
  primary key (style, counter)
);

with v (style, title, tie) as (values
  ('explorer',    'The Explorer',      12),
  ('tourist',     'The Tourist',       10),
  ('detective',   'The Detective',      4),
  ('phantom',     'The Phantom',        2),
  ('escape',      'The Escape Artist',  3),
  ('socialite',   'The Socialite',     11),
  ('party',       'The Party Animal',   7),
  ('foodie',      'The Foodie',         8),
  ('high_roller', 'The High Roller',    5),
  ('thief',       'The Master Thief',   1),
  ('gamer',       'The Gamer',          9),
  ('sports_fan',  'The Sports Fan',     6)
), gone as (
  delete from public.play_style_kinds k where not exists (select 1 from v where v.style = k.style)
)
insert into public.play_style_kinds (style, title, tie) select style, title, tie from v
on conflict (style) do update set title = excluded.title, tie = excluded.tie;

with v (counter, max, source) as (values
  -- only the app sees these
  ('buildings', 60, 'client'), ('rooms', 150, 'client'), ('roofs', 40, 'client'),
  ('clubs', 30, 'client'), ('club_minutes', 70, 'client'), ('restaurants', 30, 'client'),
  ('arenas', 20, 'client'), ('arena_minutes', 70, 'client'),
  ('ride_balloon', 20, 'client'), ('ride_train', 30, 'client'), ('ride_bus', 30, 'client'),
  ('ride_car', 30, 'client'), ('ride_boat', 30, 'client'), ('ride_ferris', 30, 'client'),
  ('ride_slide', 40, 'client'), ('photos', 60, 'client'), ('seats', 60, 'client'),
  ('seat_minutes', 70, 'client'), ('slots', 100, 'client'),
  ('orders_food', 40, 'client'), ('orders_drink', 40, 'client'),
  -- both: the bigger number counts
  ('npc_chats', 60, 'max'), ('arcade_games', 100, 'max'), ('party_games', 60, 'max'), ('games_won', 100, 'max'),
  -- the server knows these for sure
  ('searches', 5000, 'server'), ('sweeps', 1000, 'server'), ('catches', 1000, 'server'),
  ('hunter', 1, 'server'), ('ghost', 1, 'server'), ('survived', 1, 'server'),
  ('moves', 50, 'server'), ('tricks', 3, 'server'),
  ('bets', 100, 'server'), ('bets_won', 100, 'server'), ('bet_mint', 100000, 'server'), ('tickets', 50, 'server'),
  ('gifts', 200, 'server'), ('gift_mint', 1000000, 'server'), ('sprays', 200, 'server'), ('spray_mint', 1000000, 'server'),
  ('steals', 50, 'server'), ('quests_done', 20, 'server'), ('thief_quests', 20, 'server'),
  ('events', 50, 'server'), ('chats', 2000, 'server')
), gone as (
  delete from public.play_counters c where not exists (select 1 from v where v.counter = c.counter)
)
insert into public.play_counters (counter, max, source) select counter, max, source from v
on conflict (counter) do update set max = excluded.max, source = excluded.source;

with v (style, counter, weight, cap) as (values
  ('explorer', 'buildings', 4, 15), ('explorer', 'rooms', 1, 30), ('explorer', 'roofs', 2, 10), ('explorer', 'events', 4, 5),
  ('tourist', 'ride_balloon', 5, 6), ('tourist', 'ride_train', 4, 8), ('tourist', 'ride_bus', 3, 8), ('tourist', 'ride_car', 3, 8),
  ('tourist', 'ride_boat', 4, 8), ('tourist', 'ride_ferris', 4, 6), ('tourist', 'ride_slide', 3, 8), ('tourist', 'photos', 4, 6),
  ('detective', 'catches', 8, 6), ('detective', 'searches', 1, 40), ('detective', 'sweeps', 2, 10), ('detective', 'hunter', 2, 1),
  ('phantom', 'survived', 20, 1), ('phantom', 'ghost', 4, 1),
  ('escape', 'moves', 6, 5), ('escape', 'tricks', 6, 3),
  ('socialite', 'npc_chats', 3, 10), ('socialite', 'gifts', 4, 5), ('socialite', 'chats', 1, 30), ('socialite', 'seat_minutes', 1, 15),
  ('party', 'club_minutes', 1, 30), ('party', 'sprays', 5, 6), ('party', 'clubs', 4, 6), ('party', 'party_games', 3, 10),
  ('foodie', 'orders_food', 4, 10), ('foodie', 'orders_drink', 3, 10), ('foodie', 'restaurants', 3, 6),
  ('high_roller', 'bets', 6, 10), ('high_roller', 'bets_won', 4, 10), ('high_roller', 'slots', 2, 10),
  ('thief', 'steals', 12, 3), ('thief', 'thief_quests', 8, 3), ('thief', 'quests_done', 3, 5),
  ('gamer', 'arcade_games', 3, 15), ('gamer', 'games_won', 2, 15),
  ('sports_fan', 'tickets', 8, 5), ('sports_fan', 'arenas', 4, 5), ('sports_fan', 'arena_minutes', 1, 30)
), gone as (
  delete from public.play_style_rules r where not exists (select 1 from v where v.style = r.style and v.counter = r.counter)
)
insert into public.play_style_rules (style, counter, weight, cap) select style, counter, weight, cap from v
on conflict (style, counter) do update set weight = excluded.weight, cap = excluded.cap;

-- ============================================================ tables
-- "I was in town during this game": the app checks in once while a game is on, so players who
-- only walked around (nothing the server would otherwise see) can still save their diary.
create table if not exists public.play_check_ins (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

-- One diary per player per game: the numbers (app + server, capped), the points per style and
-- the style that won. client = the app's own numbers after capping (kept to compare).
create table if not exists public.play_diaries (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  counters jsonb not null default '{}'::jsonb,
  client jsonb not null default '{}'::jsonb,
  scores jsonb not null default '{}'::jsonb,
  style text not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);
create index if not exists play_diaries_user_idx on public.play_diaries (user_id, created_at desc);

-- Lifetime totals per player: scores = each style's share added up over all games (so the
-- shares add up to games), tops = games each style came out on top.
create table if not exists public.play_style_totals (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  scores jsonb not null default '{}'::jsonb,
  tops jsonb not null default '{}'::jsonb,
  games int not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================ the maths
-- Keep only known numbers: whole, 0 or more, at most their max. Anything else counts as 0.
create or replace function public.play_clean(p_counters jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(c.counter, v.n) filter (where v.n > 0), '{}'::jsonb)
  from public.play_counters c
  cross join lateral (
    select case when jsonb_typeof(p_counters) = 'object' and jsonb_typeof(p_counters -> c.counter) = 'number'
                then least(greatest(floor((p_counters ->> c.counter)::numeric), 0), c.max)
                else 0 end as n
  ) v
$$;

-- The app's numbers plus the server's: 'client' numbers from the app, 'server' numbers from the
-- server, 'max' numbers whichever is bigger. Both sides should already be cleaned.
create or replace function public.play_merge(p_client jsonb, p_server jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(c.counter, v.n) filter (where v.n > 0), '{}'::jsonb)
  from public.play_counters c
  cross join lateral (
    select case c.source
             when 'client' then coalesce((p_client ->> c.counter)::numeric, 0)
             when 'server' then coalesce((p_server ->> c.counter)::numeric, 0)
             else greatest(coalesce((p_client ->> c.counter)::numeric, 0), coalesce((p_server ->> c.counter)::numeric, 0))
           end as n
  ) v
$$;

-- Points for every style: { "explorer": 24, "detective": 0, … }.
create or replace function public.play_scores(p_counters jsonb) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_object_agg(k.style, coalesce(s.score, 0)), '{}'::jsonb)
  from public.play_style_kinds k
  left join (
    select r.style, sum(r.weight * least(coalesce((p_counters ->> r.counter)::numeric, 0), r.cap)) as score
    from public.play_style_rules r
    group by r.style
  ) s on s.style = k.style
$$;

-- The winning style (dead heat: lowest tie number). No points at all: the explorer.
create or replace function public.play_pick(p_scores jsonb) returns text
language sql stable set search_path = public as $$
  select case when coalesce((p_scores ->> k.style)::numeric, 0) > 0 then k.style else 'explorer' end
  from public.play_style_kinds k
  order by coalesce((p_scores ->> k.style)::numeric, 0) desc, k.tie
  limit 1
$$;

-- One game's style mix: each style's share of the points (4 decimals), adding up to exactly 1
-- (the winner takes the rounding). No points: all of it to the winner.
create or replace function public.play_shares(p_scores jsonb, p_top text) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_total numeric;
  v_rest numeric := 0;
  v_out jsonb := '{}'::jsonb;
  k record;
begin
  select coalesce(sum(greatest(coalesce((p_scores ->> style)::numeric, 0), 0)), 0) into v_total from public.play_style_kinds;
  if v_total <= 0 then return jsonb_build_object(p_top, 1); end if;
  for k in
    select style, round(greatest(coalesce((p_scores ->> style)::numeric, 0), 0) / v_total, 4) as s
    from public.play_style_kinds where style <> p_top
  loop
    if k.s > 0 then
      v_out := v_out || jsonb_build_object(k.style, k.s);
      v_rest := v_rest + k.s;
    end if;
  end loop;
  return v_out || jsonb_build_object(p_top, 1 - v_rest);
end $$;

-- Adds two { key: number } objects together.
create or replace function public.play_add(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(key, total), '{}'::jsonb)
  from (
    select key, sum(value::text::numeric) as total
    from (select * from jsonb_each(coalesce(a, '{}'::jsonb)) union all select * from jsonb_each(coalesce(b, '{}'::jsonb))) x
    where jsonb_typeof(value) = 'number'
    group by key
  ) y
$$;

-- What the server knows for sure about one player in one game. Things tied to the game (entries,
-- searches, sweeps, chat, town events, chats with the locals) by its id; the rest (bets, tickets,
-- gifts, sprays, thefts, side quests, mini game claims) by time, from when the game was set up
-- to when it ended. Only numbers above 0 are listed.
create or replace function public.play_server_counts(p_user uuid, p_round bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rounds;
  e public.entries;
  t0 timestamptz;
  t1 timestamptz;
  v jsonb;
begin
  select * into r from public.rounds where id = p_round;
  if not found then return '{}'::jsonb; end if;
  t0 := r.created_at;
  t1 := coalesce(r.finished_at, r.seek_ends_at);
  select * into e from public.entries where round_id = p_round and user_id = p_user;
  v := jsonb_build_object(
    'searches', (select count(*) from public.searches where round_id = p_round and seeker_id = p_user),
    'sweeps', (select count(*) from public.sweeps where round_id = p_round and seeker_id = p_user),
    'catches', (select count(*) from public.entries where round_id = p_round and caught_by = p_user and user_id <> p_user),
    'hunter', case when e.role = 'seeker' then 1 else 0 end,
    'ghost', case when e.role = 'hider' then 1 else 0 end,
    'survived', case when e.role = 'hider' and e.caught is false then 1 else 0 end,
    'moves', case when e.role = 'hider' then greatest(e.moves, 0) else 0 end,
    'tricks', case when e.role = 'hider' then e.shield_bought::int + e.decoy_used::int + e.respawned::int else 0 end,
    'events', (select count(*) from public.world_event_claims c join public.world_events w on w.id = c.event_id
                where w.round_id = p_round and c.user_id = p_user),
    'chats', (select count(*) from public.chat_messages where round_id = p_round and sender_id = p_user),
    'npc_chats', (select count(distinct npc) from public.npc_talks where round_id = p_round and user_id = p_user)
  );
  v := v || (select jsonb_build_object('bets', count(*),
                                       'bets_won', count(*) filter (where settled and payout > amount),
                                       'bet_mint', coalesce(floor(sum(amount)), 0))
             from public.sports_bets where user_id = p_user and created_at >= t0 and created_at < t1);
  v := v || jsonb_build_object('tickets',
             (select count(*) from public.sports_tickets where user_id = p_user and created_at >= t0 and created_at < t1));
  v := v || (select jsonb_build_object('gifts', count(*), 'gift_mint', coalesce(floor(sum(amount)), 0))
             from public.coin_gifts where from_id = p_user and kind = 'gift' and created_at >= t0 and created_at < t1);
  v := v || (select jsonb_build_object('sprays', count(*), 'spray_mint', coalesce(floor(-sum(amount)), 0))
             from public.ledger where user_id = p_user and kind = 'spray_sent' and created_at >= t0 and created_at < t1);
  v := v || jsonb_build_object('steals',
             (select count(*) from public.steals where thief_id = p_user and created_at >= t0 and created_at < t1));
  v := v || (select jsonb_build_object('quests_done', count(*), 'thief_quests', count(*) filter (where action = 'steal'))
             from public.quests where user_id = p_user and status = 'done' and completed_at >= t0 and completed_at < t1);
  v := v || (select jsonb_build_object('arcade_games', count(*) filter (where game not in ('dance', 'karaoke')),
                                       'party_games', count(*) filter (where game in ('dance', 'karaoke')),
                                       'games_won', count(*) filter (where coins > 0))
             from public.activity_claims where user_id = p_user and created_at >= t0 and created_at < t1);
  return coalesce((select jsonb_object_agg(key, value) from jsonb_each(v)
                    where jsonb_typeof(value) = 'number' and value::text::numeric > 0), '{}'::jsonb);
end $$;

-- ============================================================ checking in
-- The app calls this once while a game is on (join window or hunt). Returns the game's id, or
-- null when no game is open.
create or replace function public.play_check_in(p_user uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_round bigint;
begin
  if not exists (select 1 from public.profiles where id = p_user and not is_bot) then raise exception 'unknown_player'; end if;
  select id into v_round from public.rounds where status <> 'done' order by id desc limit 1;
  if v_round is null then return null; end if;
  insert into public.play_check_ins (round_id, user_id) values (v_round, p_user) on conflict do nothing;
  -- Old check-ins aren't needed once their diaries can't be saved any more (about 4 days of games).
  delete from public.play_check_ins where round_id < v_round - 100;
  return v_round;
end $$;

-- ============================================================ saving a game's diary
-- Once per player per game. Returns { round, style, scores, counters, already }. A second call
-- for the same game changes nothing and returns what was saved (already = true).
-- Errors: unknown_player, unknown_round, not_finished, too_late, not_in_game.
create or replace function public.save_play_diary(p_user uuid, p_round bigint, p_counters jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  r public.rounds;
  d public.play_diaries;
  v_client jsonb;
  v_server jsonb;
  v_merged jsonb;
  v_scores jsonb;
  v_style text;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  -- One save at a time per player, so the lifetime totals add up.
  perform pg_advisory_xact_lock(hashtextextended('play_style:' || p_user::text, 0));

  select * into d from public.play_diaries where round_id = p_round and user_id = p_user;
  if found then
    return jsonb_build_object('round', d.round_id, 'style', d.style, 'scores', d.scores, 'counters', d.counters, 'already', true);
  end if;

  select * into r from public.rounds where id = p_round;
  if not found then raise exception 'unknown_round'; end if;
  if r.status <> 'done' then raise exception 'not_finished'; end if;
  if coalesce(r.finished_at, r.seek_ends_at) < now() - make_interval(hours => coalesce(public.setting('play_diary_hours'), 48)::int) then
    raise exception 'too_late';
  end if;

  v_server := public.play_server_counts(p_user, p_round);
  if not (exists (select 1 from public.entries where round_id = p_round and user_id = p_user)
          or exists (select 1 from public.play_check_ins where round_id = p_round and user_id = p_user)
          or v_server <> '{}'::jsonb) then
    raise exception 'not_in_game';
  end if;

  v_client := public.play_clean(p_counters);
  v_merged := public.play_clean(public.play_merge(v_client, v_server));
  v_scores := public.play_scores(v_merged);
  v_style := public.play_pick(v_scores);

  insert into public.play_diaries (round_id, user_id, counters, client, scores, style)
  values (p_round, p_user, v_merged, v_client, v_scores, v_style);

  insert into public.play_style_totals as t (user_id, scores, tops, games)
  values (p_user, public.play_shares(v_scores, v_style), jsonb_build_object(v_style, 1), 1)
  on conflict (user_id) do update
    set scores = public.play_add(t.scores, excluded.scores),
        tops = public.play_add(t.tops, excluded.tops),
        games = t.games + 1,
        updated_at = now();

  return jsonb_build_object('round', p_round, 'style', v_style, 'scores', v_scores, 'counters', v_merged, 'already', false);
end $$;

-- ============================================================ your style over time
-- { games, shares: { style: 0…1 } (adds up to 1), tops: { style: games on top }, recent: [{ round, style, at }] }.
create or replace function public.my_play_style(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t public.play_style_totals;
  v_games int;
begin
  select * into t from public.play_style_totals where user_id = p_user;
  v_games := coalesce(t.games, 0);
  return jsonb_build_object(
    'games', v_games,
    'shares', (select coalesce(jsonb_object_agg(k.style,
                 case when v_games > 0 then round(coalesce((t.scores ->> k.style)::numeric, 0) / v_games, 4) else 0 end), '{}'::jsonb)
               from public.play_style_kinds k),
    'tops', (select coalesce(jsonb_object_agg(k.style, coalesce((t.tops ->> k.style)::int, 0)), '{}'::jsonb)
             from public.play_style_kinds k),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('round', d.round_id, 'style', d.style, 'at', d.created_at)
                                         order by d.created_at desc, d.round_id desc), '[]'::jsonb)
               from (select round_id, style, created_at from public.play_diaries
                      where user_id = p_user order by created_at desc, round_id desc limit 8) d)
  );
end $$;

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['play_style_kinds', 'play_counters', 'play_style_rules', 'play_check_ins', 'play_diaries', 'play_style_totals'] loop
    execute format('alter table public.%I enable row level security', t);  -- no policies: only the server reads them
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('play_clean', 'play_merge', 'play_scores', 'play_pick', 'play_shares', 'play_add', 'play_server_counts',
            'play_check_in', 'save_play_diary', 'my_play_style')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 025_big_towns.sql
-- Newtown, part 25: big towns stay fast.
-- A few rules used to look at every spot in the town to pick one (where a shield drops a ghost,
-- where the bot runs to in a tantrum). That gets slow as towns grow, so they now pick spots
-- directly. Same behaviour, same odds. Safe to run more than once. Run after parts 1-24.

create or replace function public.shield_save(p_round bigint, p_hider uuid, p_finder uuid, p_index int) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_try int;
  v_c int[];
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
  v_c := public.spiral_xy(e.tile);
  foreach v_radius in array array[2, 4, 8] loop
    -- Random spots around the hider, picked directly (no scan of the whole town).
    for k in 1..60 loop
      v_try := public.npc_xy_tile(v_c[1] + floor(random() * (2 * v_radius + 1))::int - v_radius,
                                  v_c[2] + floor(random() * (2 * v_radius + 1))::int - v_radius);
      if v_try <> e.tile and v_try < r.tile_count
         and not exists (select 1 from public.entries x where x.round_id = p_round and x.role = 'hider' and not x.caught and x.tile = v_try) then
        v_to := v_try;
        exit;
      end if;
    end loop;
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

create or replace function public.world_event_tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_try int;
  r public.rounds;
  w record;
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  e public.entries;
  v_tile int;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status = 'seek';
  if not found then return 'no hunt'; end if;
  perform public.plan_world_events(r.id);
  for w in select * from public.world_events where round_id = r.id and not started and now() >= starts_at and now() < ends_at for update loop
    update public.world_events set started = true where id = w.id;
    v_out := 'started ' || w.key;
    if w.key = 'bot_tantrum' then
      select * into e from public.entries where round_id = r.id and user_id = v_bot;
      if found and not e.caught then
        -- A random free spot, picked directly (no scan of the whole town).
        v_tile := null;
        for k in 1..200 loop
          v_try := floor(random() * r.tile_count)::int;
          if v_try <> e.tile
             and not exists (select 1 from public.searches s where s.round_id = r.id and s.tile = v_try)
             and not exists (select 1 from public.entries x where x.round_id = r.id and x.role = 'hider' and not x.caught and x.tile = v_try) then
            v_tile := v_try;
            exit;
          end if;
        end loop;
        if v_tile is not null then
          update public.entries set tile = v_tile, visited = array_append(visited, e.tile), moves = moves + 1, last_move_at = now()
            where round_id = r.id and user_id = v_bot;
          insert into public.events (round_id, kind, tile, detail)
            values (r.id, 'moved', e.tile, jsonb_build_object('name', r.bot_name, 'bot', true, 'user', null));
        end if;
      end if;
    end if;
  end loop;
  return v_out;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('shield_save', 'world_event_tick')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 026_friends.sql
-- Newtown, part 26: friends.
-- Players can add each other as friends. Adding someone sends them a request; once they say
-- yes you're friends in every game from then on (the town changes every hour, your friends
-- don't), and you can see where each other is in each new town. Either of you can remove the
-- other at any time (that also cancels or turns down a request).
-- Run once in Supabase → SQL Editor, after 025 (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- - One row per pair of players: who asked, who was asked, and when it was accepted (null
--   while it's still a request). Asking someone who already asked you makes you friends
--   straight away.
-- - Limits: friends_max (300) friends (and requests sent) each, friend_requests_per_day (40)
--   new requests a day.
-- - Bots, paused (frozen) and under-18 accounts can't send requests and can't be asked.
-- - Each request, and each yes, sends the other player a notification in the current game.
--
-- Coin books: nothing here moves any mint.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('friends_max',             300, 'Most friends (and requests sent) one player can have'),
  ('friend_requests_per_day', 40,  'Most friend requests one player can send in a day')
on conflict (key) do update set note = excluded.note;

-- ============================================================ the table
create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- One row per pair, whichever way round.
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security; -- no policies: only the server reads them

-- ============================================================ what the app shows
-- A player's friends, the requests waiting for them, and the ones they sent:
-- { friends: [{ id, name, avatar, level, since }], incoming: [{ id, name, avatar, level, at }],
--   outgoing: [{ id, name, avatar, level, at }] }, newest first.
create or replace function public.friends_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select f.*, case when f.requester = p_user then f.addressee else f.requester end as other
    from public.friendships f
    where f.requester = p_user or f.addressee = p_user
  ), rows as (
    select m.*, p.username, p.avatar, p.level
    from mine m join public.profiles p on p.id = m.other
  )
  select jsonb_build_object(
    'friends', coalesce((select jsonb_agg(jsonb_build_object('id', other, 'name', username, 'avatar', avatar, 'level', level, 'since', accepted_at)
                          order by accepted_at desc) from rows where accepted_at is not null), '[]'::jsonb),
    'incoming', coalesce((select jsonb_agg(jsonb_build_object('id', other, 'name', username, 'avatar', avatar, 'level', level, 'at', created_at)
                          order by created_at desc) from rows where accepted_at is null and addressee = p_user), '[]'::jsonb),
    'outgoing', coalesce((select jsonb_agg(jsonb_build_object('id', other, 'name', username, 'avatar', avatar, 'level', level, 'at', created_at)
                          order by created_at desc) from rows where accepted_at is null and requester = p_user), '[]'::jsonb))
$$;

-- ============================================================ asking, saying yes, removing
-- Can this player have friends? Errors: unknown_player, bot, frozen.
create or replace function public.friend_check(p_user uuid, p_unknown text) returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.username is null then raise exception '%', p_unknown; end if;
  if p.is_bot then raise exception 'bot'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  return p;
end $$;

-- Ask someone to be friends (or say yes, if they already asked you). Returns
-- { status: 'pending' | 'friends' }. Errors: unknown_player, bot, frozen, self, no_player
-- (the other player), too_many_friends:<max>, too_many_requests:<max>.
create or replace function public.friend_request(p_user uuid, p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  them public.profiles;
  f public.friendships;
  v_round bigint := (select id from public.rounds order by id desc limit 1);
  v_max int := coalesce(public.setting('friends_max'), 300)::int;
  v_day int := coalesce(public.setting('friend_requests_per_day'), 40)::int;
begin
  if p_user = p_other then raise exception 'self'; end if;
  me := public.friend_check(p_user, 'unknown_player');
  them := public.friend_check(p_other, 'no_player');
  -- One pair at a time, so two people asking each other at once can't make two rows.
  perform pg_advisory_xact_lock(hashtextextended(least(p_user, p_other)::text || greatest(p_user, p_other)::text, 26));
  select * into f from public.friendships
  where (requester = p_user and addressee = p_other) or (requester = p_other and addressee = p_user);
  if found then
    if f.accepted_at is not null then return jsonb_build_object('status', 'friends'); end if;
    if f.requester = p_user then return jsonb_build_object('status', 'pending'); end if;
    -- They asked first: that's a yes.
    if (select count(*) from public.friendships where (requester = p_user or addressee = p_user) and accepted_at is not null) >= v_max then
      raise exception 'too_many_friends:%', v_max;
    end if;
    update public.friendships set accepted_at = now() where requester = p_other and addressee = p_user;
    perform public.notify(p_other, v_round, 'friend', coalesce(me.username, 'Someone') || ' is your friend now. You''ll see where they are in every town.');
    return jsonb_build_object('status', 'friends');
  end if;
  if (select count(*) from public.friendships where requester = p_user or addressee = p_user) >= v_max then
    raise exception 'too_many_friends:%', v_max;
  end if;
  if (select count(*) from public.friendships where requester = p_user and created_at > now() - interval '1 day') >= v_day then
    raise exception 'too_many_requests:%', v_day;
  end if;
  insert into public.friendships (requester, addressee) values (p_user, p_other);
  perform public.notify(p_other, v_round, 'friend', coalesce(me.username, 'Someone') || ' wants to be your friend. Open Friends in the menu to say yes.');
  return jsonb_build_object('status', 'pending');
end $$;

-- Say yes to a request. Returns { status: 'friends' }. Errors: unknown_player, bot, frozen,
-- no_request, too_many_friends:<max>.
create or replace function public.friend_accept(p_user uuid, p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  v_round bigint := (select id from public.rounds order by id desc limit 1);
  v_max int := coalesce(public.setting('friends_max'), 300)::int;
begin
  me := public.friend_check(p_user, 'unknown_player');
  perform 1 from public.friendships where requester = p_other and addressee = p_user and accepted_at is null for update;
  if not found then
    if exists (select 1 from public.friendships where ((requester = p_other and addressee = p_user) or (requester = p_user and addressee = p_other))
               and accepted_at is not null) then
      return jsonb_build_object('status', 'friends');
    end if;
    raise exception 'no_request';
  end if;
  if (select count(*) from public.friendships where (requester = p_user or addressee = p_user) and accepted_at is not null) >= v_max then
    raise exception 'too_many_friends:%', v_max;
  end if;
  update public.friendships set accepted_at = now() where requester = p_other and addressee = p_user;
  perform public.notify(p_other, v_round, 'friend', coalesce(me.username, 'Someone') || ' is your friend now. You''ll see where they are in every town.');
  return jsonb_build_object('status', 'friends');
end $$;

-- Remove a friend, cancel a request you sent, or turn one down (no notification either way).
-- Returns { removed: true | false }.
create or replace function public.friend_remove(p_user uuid, p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.friendships
  where (requester = p_user and addressee = p_other) or (requester = p_other and addressee = p_user);
  get diagnostics v_n = row_count;
  return jsonb_build_object('removed', v_n > 0);
end $$;

-- Players to add, by name (at least 2 letters): up to 12 real, active players whose name starts
-- with (or contains) the text, not yourself. [{ id, name, avatar, level }].
create or replace function public.find_players(p_user uuid, p_text text) returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (select lower(btrim(coalesce(p_text, ''))) as t)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', username, 'avatar', avatar, 'level', level)
                  order by starts desc, length(username), username), '[]'::jsonb)
  from (
    select p.id, p.username, p.avatar, p.level, lower(p.username) like (select t from q) || '%' as starts
    from public.profiles p
    where char_length((select t from q)) >= 2
      and p.id <> p_user and p.username is not null and not p.is_bot and not p.frozen and p.age_blocked_at is null
      and strpos(lower(p.username), (select t from q)) > 0
    order by starts desc, length(p.username), p.username
    limit 12
  ) found
$$;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.friendships from public, anon, authenticated;
  grant all on table public.friendships to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('friends_of', 'friend_check', 'friend_request', 'friend_accept', 'friend_remove', 'find_players')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 027_streaks_levels.sql
-- Newtown, part 27: daily streaks and the new level curve.
-- Run once in Supabase → SQL Editor, after 026 (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- Daily streaks
-- - Doing one thing a day keeps your streak going: playing a game, finishing a side quest,
--   giving or spraying mint, a hug or a handshake (part 28), or riding something.
--   Days are UTC days. Each day counts once, however much you do.
-- - Miss one day and the week's free freeze saves your streak (one a week, Monday to Sunday).
--   Miss more and it starts again from 1.
-- - Rewards at 3, 7, 14, 30, 60 and 100 days (and every 100 days after that): a little mint
--   each time you get there, plus a badge the first time.
-- - Players who were already playing every day start with the days they have played in a row.
--
-- New level curve
-- - Levels now need XP as well as mint. XP comes from playing a game (10), finishing a side
--   quest (10) and each day of your streak (5).
-- - Quick and cheap up to level 20: 15 XP and 10 × level mint for each level.
-- - Then harder every level up to 100: 30 XP for level 20 → 21, 5 more for each level after
--   (425 XP for 99 → 100), and 50 × (level − 15) mint (250 at level 20, 4,200 at 99).
-- - Everyone keeps the level they have. Players who had already played enough rounds for their
--   next level under the old rules start with the XP for it.
-- - The daily mint refill still grows by 25 per level, but stops growing at level 40
--   (1,075 a day). It would have been 2,575 a day at level 100.
--
-- Coin books: streak rewards are new mint ('streak_reward', added to coin_supply_daily).
-- Levelling up still burns its mint.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('streak_reward_3',    10,  'Mint for reaching a 3-day streak'),
  ('streak_reward_7',    25,  'Mint for reaching a 7-day streak'),
  ('streak_reward_14',   50,  'Mint for reaching a 14-day streak'),
  ('streak_reward_30',   100, 'Mint for reaching a 30-day streak'),
  ('streak_reward_60',   200, 'Mint for reaching a 60-day streak'),
  ('streak_reward_100',  500, 'Mint for reaching a 100-day streak (and every 100 days after)'),
  ('level_max',          100, 'Highest level'),
  ('level_easy_until',   20,  'Levels below this are the quick, cheap ones'),
  ('level_xp_easy',      15,  'XP for each level below level_easy_until'),
  ('level_xp_hard',      30,  'XP to go from level_easy_until to the next level'),
  ('level_xp_step',      5,   'Extra XP needed for each level after that'),
  ('level_cost_easy',    10,  'Mint to go from level L to L+1 below level_easy_until = this × L'),
  ('level_cost_hard',    50,  'Mint from level_easy_until up = this × (L − level_easy_until + 5)'),
  ('level_xp_game',      10,  'XP for playing a game (joining a round)'),
  ('level_xp_quest',     10,  'XP for finishing a side quest'),
  ('level_xp_streak',    5,   'XP for each day of your streak'),
  ('passive_level_cap',  40,  'The daily refill stops growing at this level')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
alter table public.profiles add column if not exists level_xp int not null default 0;

-- Each player's streak.
create table if not exists public.streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current int not null default 0,
  best int not null default 0,
  last_day date,            -- the last day that counted (UTC)
  freeze_used_on date,      -- the last day a freeze covered
  updated_at timestamptz not null default now()
);
alter table public.streaks enable row level security; -- no policies: only the server reads them

-- Every day that counted: what did it first, the streak that day, and whether the freeze
-- covered the day before. (Also handy for "who came back the next day".)
create table if not exists public.streak_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  action text not null,
  streak int not null default 0,
  froze boolean not null default false,
  reward numeric(14,2) not null default 0,
  at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists streak_days_day_idx on public.streak_days (day);
alter table public.streak_days enable row level security; -- no policies: only the server reads them

-- ============================================================ streaks
create or replace function public.streak_today() returns date
language sql stable as $$ select (now() at time zone 'UTC')::date $$;

-- The streak lengths that pay.
create or replace function public.streak_milestones() returns int[]
language sql immutable as $$ select array[3, 7, 14, 30, 60, 100] $$;

-- Mint for reaching p_days in a row (0 when it isn't a milestone).
create or replace function public.streak_reward(p_days int) returns numeric
language sql stable set search_path = public as $$
  select case when p_days = any (public.streak_milestones()) then coalesce(public.setting('streak_reward_' || p_days), 0)
              when p_days > 100 and p_days % 100 = 0 then coalesce(public.setting('streak_reward_100'), 0)
              else 0 end
$$;

-- The next milestone after p_days.
create or replace function public.streak_next(p_days int) returns int
language sql immutable set search_path = public as $$
  select coalesce((select min(m) from unnest(public.streak_milestones()) m where m > p_days), (p_days / 100 + 1) * 100)
$$;

-- Is the free freeze still there for a day you missed? One a week (ISO weeks, Monday first).
create or replace function public.streak_freeze_ready(p_used date, p_missed date) returns boolean
language sql immutable as $$
  select p_used is null or date_trunc('week', p_used) < date_trunc('week', p_missed)
$$;

-- What the app shows: { current, best, today, alive, freeze_ready, freeze_needed, week, next,
-- next_reward, rewards: { "3": 10, "7": 25, … } }. current is 0 once the streak is broken. today: today already counts.
-- freeze_needed: you missed yesterday, and the freeze will save your streak if you do something
-- today. week: the last 7 days, oldest first ('done', 'freeze', 'missed' or 'today' for today
-- when it doesn't count yet).
create or replace function public.streak_of(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.streaks;
  v_today date := public.streak_today();
  v_alive boolean;
  v_need boolean := false;
  v_current int;
  v_week jsonb;
begin
  select * into s from public.streaks where user_id = p_user;
  v_alive := found and (s.last_day >= v_today - 1
                        or (s.last_day = v_today - 2 and public.streak_freeze_ready(s.freeze_used_on, v_today - 1)));
  v_need := found and s.last_day = v_today - 2 and v_alive;
  v_current := case when v_alive then s.current else 0 end;
  select jsonb_agg(case when d.day = any (done.days) then 'done'
                        when d.day + 1 = any (froze.days) then 'freeze'
                        when d.day = v_today then 'today'
                        else 'missed' end order by d.day)
    into v_week
  from generate_series(v_today - 6, v_today, interval '1 day') as d0(t)
  cross join lateral (select d0.t::date as day) d
  cross join (select coalesce(array_agg(day), '{}') as days from public.streak_days where user_id = p_user and day > v_today - 7) done
  cross join (select coalesce(array_agg(day), '{}') as days from public.streak_days where user_id = p_user and day > v_today - 7 and froze) froze;
  return jsonb_build_object(
    'current', v_current,
    'best', coalesce(s.best, 0),
    'today', coalesce(s.last_day = v_today, false),
    'alive', v_alive,
    'freeze_ready', public.streak_freeze_ready(s.freeze_used_on, v_today),
    'freeze_needed', v_need,
    'week', v_week,
    'next', public.streak_next(v_current),
    'next_reward', public.streak_reward(public.streak_next(v_current)),
    'rewards', (select jsonb_object_agg(m, public.streak_reward(m)) from unnest(public.streak_milestones()) m));
end $$;

-- Count today for this player (once a day; the rest of the day it just says where they are).
-- p_action: game, quest, gift, spray, hug, handshake or ride. Pays the milestone mint, hands
-- out the badge the first time, adds the day's XP and sends a notification at milestones.
-- Returns streak_of() plus { new_day, froze, reward }, or null for bots and paused accounts.
create or replace function public.streak_touch(p_user uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  s public.streaks;
  v_today date := public.streak_today();
  v_n int;
  v_froze boolean := false;
  v_reward numeric;
  v_round bigint;
  v_rows int;
begin
  if p_action is null or p_action not in ('game', 'quest', 'gift', 'spray', 'hug', 'handshake', 'ride') then
    raise exception 'bad_action';
  end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot or p.frozen or p.age_blocked_at is not null then return null; end if;
  insert into public.streak_days (user_id, day, action) values (p_user, v_today, p_action) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return public.streak_of(p_user) || jsonb_build_object('new_day', false, 'froze', false, 'reward', 0);
  end if;
  insert into public.streaks (user_id) values (p_user) on conflict do nothing;
  select * into s from public.streaks where user_id = p_user for update;
  if s.last_day = v_today then
    v_n := s.current;
  elsif s.last_day = v_today - 1 then
    v_n := s.current + 1;
  elsif s.last_day = v_today - 2 and public.streak_freeze_ready(s.freeze_used_on, v_today - 1) then
    v_n := s.current + 1;
    v_froze := true;
  else
    v_n := 1;
  end if;
  v_reward := public.streak_reward(v_n);
  update public.streaks
     set current = v_n, best = greatest(best, v_n), last_day = v_today, updated_at = now(),
         freeze_used_on = case when v_froze then v_today - 1 else freeze_used_on end
   where user_id = p_user;
  update public.streak_days set streak = v_n, froze = v_froze, reward = v_reward where user_id = p_user and day = v_today;
  update public.profiles set level_xp = level_xp + coalesce(public.setting('level_xp_streak'), 0)::int where id = p_user;
  if v_reward > 0 then
    select max(id) into v_round from public.rounds;
    update public.profiles set coins = coins + v_reward where id = p_user;
    perform public.log_coins(p_user, v_round, 'streak_reward', v_reward, false, format('Streak: %s days', v_n));
    if v_n <= 100 and not exists (select 1 from public.badges where user_id = p_user and badge = 'streak_' || v_n) then
      insert into public.badges (user_id, round_id, badge, detail)
      values (p_user, v_round, 'streak_' || v_n, format('Played %s days in a row', v_n))
      on conflict do nothing;
    end if;
    perform public.notify(p_user, v_round, 'streak', format('%s-day streak! +%s mint. Keep it going tomorrow.', v_n, v_reward));
  end if;
  return public.streak_of(p_user) || jsonb_build_object('new_day', true, 'froze', v_froze, 'reward', v_reward);
end $$;

-- ============================================================ levels
-- XP to go from level p_level to the next one.
create or replace function public.level_need(p_level int) returns int
language sql stable set search_path = public as $$
  select case when p_level < public.setting('level_easy_until') then public.setting('level_xp_easy')::int
              else (public.setting('level_xp_hard') + public.setting('level_xp_step') * (p_level - public.setting('level_easy_until')))::int end
$$;

-- Mint to go from level p_level to the next one (burned).
create or replace function public.level_cost(p_level int) returns numeric
language sql stable set search_path = public as $$
  select case when p_level < public.setting('level_easy_until') then public.setting('level_cost_easy') * p_level
              else public.setting('level_cost_hard') * (p_level - public.setting('level_easy_until') + 5) end
$$;

-- Your level and what the next one takes. (rounds_played and next_rounds are still there for
-- older versions of the app: next_rounds is what playing alone would take now.)
create or replace function public.level_info(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_rounds int;
  v_need int;
  v_cost numeric;
  v_max boolean;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'Unknown player'; end if;
  v_rounds := p.hider_rounds + p.seeker_rounds;
  v_need := public.level_need(p.level);
  v_cost := public.level_cost(p.level);
  v_max := p.level >= public.setting('level_max');
  return jsonb_build_object(
    'level', p.level,
    'xp', p.level_xp,
    'next_xp', v_need,
    'next_cost', v_cost,
    'max', v_max,
    'coins', p.coins,
    'rounds_played', v_rounds,
    'next_rounds', v_rounds + ceil(greatest(v_need - p.level_xp, 0) / greatest(public.setting('level_xp_game'), 1))::int,
    'xp_game', public.setting('level_xp_game'),
    'xp_quest', public.setting('level_xp_quest'),
    'xp_streak', public.setting('level_xp_streak'),
    'can_upgrade', not v_max and p.level_xp >= v_need and p.coins >= v_cost);
end $$;

create or replace function public.upgrade_level(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.profiles; v_cost numeric; v_need int;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'Unknown player'; end if;
  if p.level >= public.setting('level_max') then raise exception 'You''re at the top level already!'; end if;
  v_need := public.level_need(p.level);
  v_cost := public.level_cost(p.level);
  if p.level_xp < v_need then
    raise exception 'Earn % more XP to unlock level % (play games, finish side quests, keep your streak)', v_need - p.level_xp, p.level + 1;
  end if;
  if p.coins < v_cost then raise exception 'You need % coins to reach level %', v_cost, p.level + 1; end if;
  update public.profiles set coins = coins - v_cost, level = level + 1, level_xp = level_xp - v_need where id = p_user;
  perform public.log_coins(p_user, null, 'level_up', -v_cost);
  perform public.burn(null, v_cost, 'level up');
  return jsonb_build_object('level', p.level + 1, 'cost', v_cost, 'xp', p.level_xp - v_need);
end $$;

-- The daily refill: 100, then +25 per level, but no more growth after level passive_level_cap.
create or replace function public.accrue_passive(p_user uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_lv int;
  v_target numeric;
  v_day numeric;
  v_rate numeric;      -- coins per second
  v_amt numeric;
  v_recent numeric;
begin
  select * into p from public.profiles where id = p_user for update;
  v_lv := least(coalesce(p.level, 1), coalesce(public.setting('passive_level_cap'), 40)::int);
  v_day := public.setting('passive_per_day') + public.setting('passive_per_level') * greatest(v_lv - 1, 0);
  v_target := public.setting('passive_target') + public.setting('passive_per_level') * greatest(v_lv - 1, 0);
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

-- ============================================================ what counts (triggers)
-- These never get in the way: if anything goes wrong here, the game action still goes ahead.

-- Joining a game: XP and a streak day.
create or replace function public.streak_on_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id and not is_bot) then
    update public.profiles set level_xp = level_xp + coalesce(public.setting('level_xp_game'), 0)::int where id = new.user_id;
    perform public.streak_touch(new.user_id, 'game');
  end if;
  return null;
exception when others then
  raise warning 'streak (game) failed: %', sqlerrm;
  return null;
end $$;
drop trigger if exists entries_streak on public.entries;
create trigger entries_streak after insert on public.entries
  for each row execute function public.streak_on_entry();

-- Finishing a side quest: XP and a streak day.
create or replace function public.streak_on_quest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status = 'active' then
    update public.profiles set level_xp = level_xp + coalesce(public.setting('level_xp_quest'), 0)::int where id = new.user_id;
    perform public.streak_touch(new.user_id, 'quest');
  end if;
  return null;
exception when others then
  raise warning 'streak (quest) failed: %', sqlerrm;
  return null;
end $$;
drop trigger if exists quests_streak on public.quests;
create trigger quests_streak after update of status on public.quests
  for each row execute function public.streak_on_quest();

-- Giving or spraying mint: a streak day for the giver.
create or replace function public.streak_on_gift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.streak_touch(new.from_id, new.kind);
  return null;
exception when others then
  raise warning 'streak (gift) failed: %', sqlerrm;
  return null;
end $$;
drop trigger if exists coin_gifts_streak on public.coin_gifts;
create trigger coin_gifts_streak after insert on public.coin_gifts
  for each row execute function public.streak_on_gift();

-- ============================================================ one-time start
do $$
declare v_today date := public.streak_today();
begin
  -- Players who were already playing every day: their run of days with a game, ending today or
  -- yesterday (and their best run ever).
  insert into public.streaks (user_id, current, best, last_day)
  select r.user_id,
         coalesce(max(r.n) filter (where r.last >= v_today - 1), 0),
         max(r.n),
         max(r.last)
  from (
    select user_id, count(*)::int as n, max(d) as last
    from (select user_id, d, d - (row_number() over (partition by user_id order by d))::int as run
          from (select distinct e.user_id, (e.created_at at time zone 'UTC')::date as d
                from public.entries e join public.profiles p on p.id = e.user_id and not p.is_bot) days) runs
    group by user_id, run
  ) r
  group by r.user_id
  on conflict (user_id) do nothing;

  -- Players who had already played enough rounds for their next level under the old rules
  -- (2 × level rounds) start with the XP for it.
  if not exists (select 1 from public.game_state where key = 'level_xp_seeded') then
    update public.profiles set level_xp = public.level_need(level)
     where not is_bot and hider_rounds + seeker_rounds >= 2 * level and level < public.setting('level_max');
    insert into public.game_state (key, value) values ('level_xp_seeded', 1);
  end if;
end $$;

-- ============================================================ coin books
-- Created mint now includes streak rewards.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['streaks', 'streak_days'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('streak_today', 'streak_milestones', 'streak_reward', 'streak_next', 'streak_freeze_ready', 'streak_of',
            'streak_touch', 'level_need', 'level_cost', 'level_info', 'upgrade_level', 'accrue_passive',
            'streak_on_entry', 'streak_on_quest', 'streak_on_gift')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 028_hugs_gifts.sql
-- Newtown, part 28: hugs, handshakes, "My gifts", thank-yous and blocking.
-- Run once in Supabase → SQL Editor, after 027 (it needs part 27's streaks).
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- - Players can send each other a hug or a handshake. Free, up to hugs_per_day (30) a day in
--   all and hugs_pair_per_day (3) a day to the same person. The other player gets a
--   notification. A hug or a handshake counts towards your daily streak, and two new side
--   quests (Town hugger, Diplomat) count them.
-- - "My gifts" lists what other players sent you (mint gifts, spraying, hugs, handshakes), with
--   a thank-you button for each (the sender gets a notification, once per gift).
-- - Blocking someone stops their hugs, handshakes, mint gifts, private messages and friend
--   requests reaching you, and ends any friendship between you. You can unblock them later.
-- - Bots, paused (frozen) and under-18 accounts can't send or receive hugs and handshakes.
--
-- Coin books: nothing here makes or burns mint (thank-yous are free).
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('hugs_per_day',      30, 'Most hugs and handshakes one player can send in a day'),
  ('hugs_pair_per_day', 3,  'Most hugs and handshakes one player can send the same person in a day')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
create table if not exists public.greetings (
  id bigserial primary key,
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('hug', 'handshake')),
  created_at timestamptz not null default now(),
  thanked_at timestamptz,
  check (from_id <> to_id)
);
create index if not exists greetings_from_idx on public.greetings (from_id, created_at desc);
create index if not exists greetings_to_idx on public.greetings (to_id, created_at desc);
alter table public.greetings enable row level security; -- no policies: only the server reads them

alter table public.coin_gifts add column if not exists thanked_at timestamptz;

create table if not exists public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked);
alter table public.blocks enable row level security; -- no policies: only the server reads them

-- Has p_blocker blocked p_other?
create or replace function public.has_blocked(p_blocker uuid, p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where blocker = p_blocker and blocked = p_other)
$$;

-- ============================================================ hugs and handshakes
-- Send a hug or a handshake. Returns { kind, to, left_today }. Errors: bad_kind, self,
-- unknown_player, no_name, frozen (you), unknown_target, target_bot, target_frozen, blocked
-- (they blocked you), you_blocked (you blocked them), daily_cap:<max>, pair_cap:<max>.
create or replace function public.send_greeting(p_from uuid, p_to uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.profiles;
  t public.profiles;
  v_day timestamptz := date_trunc('day', now());
  v_today int;
  v_round bigint;
  v_q bigint;
begin
  if p_kind is null or p_kind not in ('hug', 'handshake') then raise exception 'bad_kind'; end if;
  if p_to is null or p_to = p_from then raise exception 'self'; end if;
  select * into f from public.profiles where id = p_from;
  if not found or f.is_bot then raise exception 'unknown_player'; end if;
  if f.frozen or f.age_blocked_at is not null then raise exception 'frozen'; end if;
  if f.username is null then raise exception 'no_name'; end if;
  select * into t from public.profiles where id = p_to;
  if not found or t.username is null then raise exception 'unknown_target'; end if;
  if t.is_bot then raise exception 'target_bot'; end if;
  if t.frozen or t.age_blocked_at is not null then raise exception 'target_frozen'; end if;
  if public.has_blocked(p_to, p_from) then raise exception 'blocked'; end if;
  if public.has_blocked(p_from, p_to) then raise exception 'you_blocked'; end if;
  -- One sender at a time, so quick double taps can't slip past the limits.
  perform pg_advisory_xact_lock(hashtextextended(p_from::text, 28));
  select count(*) into v_today from public.greetings where from_id = p_from and created_at >= v_day;
  if v_today >= public.setting('hugs_per_day') then raise exception 'daily_cap:%', public.setting('hugs_per_day')::int; end if;
  if (select count(*) from public.greetings where from_id = p_from and to_id = p_to and created_at >= v_day)
     >= public.setting('hugs_pair_per_day') then
    raise exception 'pair_cap:%', public.setting('hugs_pair_per_day')::int;
  end if;
  insert into public.greetings (from_id, to_id, kind) values (p_from, p_to, p_kind);
  select max(id) into v_round from public.rounds;
  perform public.notify(p_to, v_round, p_kind,
    case p_kind when 'hug' then f.username || ' gave you a hug! Open My gifts to say thank you.'
                else f.username || ' shook your hand! Open My gifts to say thank you.' end);
  select id into v_q from public.quests where user_id = p_from and status = 'active' and expires_at > now();
  if found then perform public.quest_sync(v_q); end if;
  return jsonb_build_object('kind', p_kind, 'to', t.username,
                            'left_today', greatest(public.setting('hugs_per_day')::int - v_today - 1, 0));
end $$;

-- A hug or a handshake keeps your daily streak going (part 27).
create or replace function public.streak_on_greeting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.streak_touch(new.from_id, new.kind);
  return null;
exception when others then
  raise warning 'streak (greeting) failed: %', sqlerrm;
  return null;
end $$;
drop trigger if exists greetings_streak on public.greetings;
create trigger greetings_streak after insert on public.greetings
  for each row execute function public.streak_on_greeting();

-- ============================================================ my gifts
-- What other players sent you in the last 30 days, newest first (at most 80): mint gifts,
-- spraying, hugs and handshakes. { items: [{ kind, id, from, name, avatar, amount, note, at,
-- thanked, blocked }], totals: { hugs, handshakes, mint }, sent_today, left_today }.
create or replace function public.my_gifts(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with got as (
    select g.kind, g.id, g.from_id, g.amount, g.note, g.created_at, g.thanked_at
    from public.coin_gifts g where g.to_id = p_user and g.created_at > now() - interval '30 days'
    union all
    select h.kind, h.id, h.from_id, null, null, h.created_at, h.thanked_at
    from public.greetings h where h.to_id = p_user and h.created_at > now() - interval '30 days'
  ), recent as (
    select * from got order by created_at desc limit 80
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                         'kind', r.kind, 'id', r.id, 'from', r.from_id, 'name', p.username, 'avatar', p.avatar,
                         'amount', r.amount, 'note', r.note, 'at', r.created_at, 'thanked', r.thanked_at is not null,
                         'blocked', public.has_blocked(p_user, r.from_id))
                       order by r.created_at desc)
                       from recent r join public.profiles p on p.id = r.from_id), '[]'::jsonb),
    'totals', jsonb_build_object(
      'hugs', (select count(*) from got where kind = 'hug'),
      'handshakes', (select count(*) from got where kind = 'handshake'),
      'mint', (select coalesce(sum(amount), 0) from got where kind in ('gift', 'spray'))),
    'sent_today', (select count(*) from public.greetings where from_id = p_user and created_at >= date_trunc('day', now())),
    'left_today', greatest(public.setting('hugs_per_day')::int
                           - (select count(*) from public.greetings where from_id = p_user and created_at >= date_trunc('day', now()))::int, 0))
$$;

-- Say thank you for something in My gifts (p_kind: gift, spray, hug or handshake). The sender
-- gets a notification, once per gift. Returns { already }. Errors: unknown_player, no_gift.
create or replace function public.thank_for(p_user uuid, p_kind text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  v_from uuid;
  v_amount numeric;
  v_thanked timestamptz;
  v_round bigint;
begin
  select * into me from public.profiles where id = p_user;
  if not found or me.username is null then raise exception 'unknown_player'; end if;
  if p_kind in ('gift', 'spray') then
    select from_id, amount, thanked_at into v_from, v_amount, v_thanked from public.coin_gifts
     where id = p_id and to_id = p_user and kind = p_kind for update;
  elsif p_kind in ('hug', 'handshake') then
    select from_id, null, thanked_at into v_from, v_amount, v_thanked from public.greetings
     where id = p_id and to_id = p_user and kind = p_kind for update;
  end if;
  if v_from is null then raise exception 'no_gift'; end if;
  if v_thanked is not null then return jsonb_build_object('already', true); end if;
  if p_kind in ('gift', 'spray') then
    update public.coin_gifts set thanked_at = now() where id = p_id;
  else
    update public.greetings set thanked_at = now() where id = p_id;
  end if;
  if not public.has_blocked(p_user, v_from) then
    select max(id) into v_round from public.rounds;
    perform public.notify(v_from, v_round, 'thanks', me.username || ' says thank you for ' ||
      case p_kind when 'hug' then 'the hug!' when 'handshake' then 'the handshake!'
                  when 'spray' then 'the ' || to_char(v_amount, 'FM999,999,990') || ' mint you sprayed!'
                  else 'the ' || to_char(v_amount, 'FM999,999,990') || ' mint!' end);
  end if;
  return jsonb_build_object('already', false);
end $$;

-- ============================================================ blocking
-- Block a player: their hugs, handshakes, mint gifts, private messages and friend requests no
-- longer reach you, and any friendship (or request) between you ends. Returns { blocked }.
-- Errors: self, no_player.
create or replace function public.block_player(p_user uuid, p_other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_other is null or p_other = p_user then raise exception 'self'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then raise exception 'no_player'; end if;
  insert into public.blocks (blocker, blocked) values (p_user, p_other) on conflict do nothing;
  delete from public.friendships
   where (requester = p_user and addressee = p_other) or (requester = p_other and addressee = p_user);
  return jsonb_build_object('blocked', true);
end $$;

-- Unblock a player. Returns { blocked: false }.
create or replace function public.unblock_player(p_user uuid, p_other uuid) returns jsonb
language sql security definer set search_path = public as $$
  with gone as (delete from public.blocks where blocker = p_user and blocked = p_other returning 1)
  select jsonb_build_object('blocked', false)
$$;

-- The players you blocked, newest first: [{ id, name, avatar, at }].
create or replace function public.blocked_players(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.username, 'avatar', p.avatar, 'at', b.created_at)
                  order by b.created_at desc), '[]'::jsonb)
  from public.blocks b join public.profiles p on p.id = b.blocked
  where b.blocker = p_user
$$;

-- Blocked players can't send you mint gifts, private messages or friend requests.
create or replace function public.blocks_gift() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'gift' and public.has_blocked(new.to_id, new.from_id) then raise exception 'blocked'; end if;
  return new;
end $$;
drop trigger if exists coin_gifts_blocks on public.coin_gifts;
create trigger coin_gifts_blocks before insert on public.coin_gifts
  for each row execute function public.blocks_gift();

create or replace function public.blocks_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.recipient_id is not null and public.has_blocked(new.recipient_id, new.sender_id) then raise exception 'blocked'; end if;
  return new;
end $$;
drop trigger if exists chat_messages_blocks on public.chat_messages;
create trigger chat_messages_blocks before insert on public.chat_messages
  for each row execute function public.blocks_message();

create or replace function public.blocks_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.has_blocked(new.addressee, new.requester) or public.has_blocked(new.requester, new.addressee) then
    raise exception 'blocked';
  end if;
  return new;
end $$;
drop trigger if exists friendships_blocks on public.friendships;
create trigger friendships_blocks before insert on public.friendships
  for each row execute function public.blocks_friendship();

-- ============================================================ side quests with hugs
-- A copy of the two new quests in src/lib/quests.ts.
insert into public.quest_catalog (key, title, role, brief, fits, reward, action, steps) values
  ('town_hugger', 'Town hugger', 'Today you are the town hugger.', 'Give 3 different players a hug (tap someone, then Hug).', 'any', 15, null,
   '[{"type":"greet","kind":"hug","count":3,"target":3}]'),
  ('diplomat', 'Diplomat', 'Today you are a diplomat.', 'Shake hands with 2 different players and say hi to a regular.', 'any', 20, null,
   '[{"type":"greet","kind":"handshake","count":2,"target":2},{"type":"talk_npcs","count":1,"target":1}]')
on conflict (key) do update set title = excluded.title, role = excluded.role, brief = excluded.brief, fits = excluded.fits,
  reward = excluded.reward, action = excluded.action, steps = excluded.steps;

-- Count the steps the server can check by itself (as in part 19, plus 'greet': different
-- players hugged or greeted since the quest started), then finish the quest if it's done.
create or replace function public.quest_sync(p_id bigint) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  q public.quests;
  c public.quest_catalog;
  s jsonb;
  o bigint;
  v numeric;
  v_prog jsonb;
begin
  select * into q from public.quests where id = p_id for update;
  if not found or q.status <> 'active' then return 0; end if;
  select * into c from public.quest_catalog where key = q.quest_key;
  v_prog := q.progress;
  for s, o in select e.s, e.o from jsonb_array_elements(c.steps) with ordinality e(s, o) loop
    v := case s ->> 'type'
      when 'gift' then (select coalesce(sum(g.amount), 0) from public.coin_gifts g
                        where g.from_id = q.user_id and g.kind = 'gift' and g.created_at >= q.started_at)
      when 'gift_people' then (select count(distinct g.to_id) from public.coin_gifts g
                               where g.from_id = q.user_id and g.kind = 'gift' and g.created_at >= q.started_at)
      when 'spray' then (select coalesce(sum(g.amount), 0) from public.coin_gifts g
                         where g.from_id = q.user_id and g.kind = 'spray' and g.created_at >= q.started_at)
      when 'greet' then (select count(distinct h.to_id) from public.greetings h
                         where h.from_id = q.user_id and h.created_at >= q.started_at
                           and (s ->> 'kind' is null or h.kind = s ->> 'kind'))
      when 'search_tiles' then (select count(*) from public.searches x
                                where x.seeker_id = q.user_id and x.created_at >= q.started_at)
      when 'sweep' then (select count(*) from public.sweeps x
                         where x.seeker_id = q.user_id and x.created_at >= q.started_at)
      when 'claim_event' then (select count(*) from public.ledger l
                               where l.user_id = q.user_id and l.kind in ('event_reward', 'balloon')
                                 and l.amount > 0 and l.created_at >= q.started_at)
    end;
    if v is not null then
      v := least(v, (s ->> 'target')::numeric);
      if v <> coalesce((v_prog ->> (o - 1)::int)::numeric, 0) then
        v_prog := jsonb_set(v_prog, array[(o - 1)::text], to_jsonb(v));
      end if;
    end if;
  end loop;
  if v_prog is distinct from q.progress then
    update public.quests set progress = v_prog where id = p_id;
  end if;
  return public.quest_finish(p_id);
end $$;

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['greetings', 'blocks'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  revoke all on sequence public.greetings_id_seq from public, anon, authenticated;
  grant all on sequence public.greetings_id_seq to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('has_blocked', 'send_greeting', 'streak_on_greeting', 'my_gifts', 'thank_for', 'block_player', 'unblock_player',
            'blocked_players', 'blocks_gift', 'blocks_message', 'blocks_friendship', 'quest_sync')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 029_ghost_duels.sql
-- Newtown, part 29: ghost duels (the new game).
-- Run once in Supabase → SQL Editor, after 028. Safe to run again: it only adds what is
-- missing and replaces functions (settings you have changed keep their values).
--
-- Ghosts no longer hide, move or get searched. Nobody scans, sweeps or sends drones.
-- - In the first 3 minutes of each game, anyone can join as a ghost (stake hider_stake, 100
--   mint). Everyone else is a hunter; there's nothing to join.
-- - Once the hunt starts, every ghost lights up on the map. Tap a ghost's light to see their
--   stats, chat with them, or challenge them.
-- - A challenge costs the hunter duel_fee (10 mint). The ghost gets a pop-up wherever they are
--   and has duel_answer_seconds (30) to answer; no answer is a loss for the ghost.
-- - Each duel is one quick game picked at random (for now: Rock-Paper-Scissors), first to
--   duel_first_to (2) points, at most duel_seconds (60). Ghosts start with the advantage: if
--   time runs out level, the ghost wins.
-- - Hunter wins: their 10 mint back, plus finder_share (80%) of a slice of the ghost's stake
--   (stake ÷ ghost_out_losses); the other 20% of the slice goes into the prize pool.
--   Ghost wins: the hunter's 10 mint goes into the prize pool.
-- - A ghost who wins ghost_golden_wins (3) duels turns golden: safe for the rest of the game,
--   and in the prize pool. A ghost who loses ghost_out_losses (3) is out: their light goes.
-- - A ghost plays one duel at a time (their light shows they're busy), and so does a hunter.
--   After each duel a hunter waits duel_cooldown_seconds (30) before the next. Nobody can
--   duel themselves, and ghosts can't challenge ghosts.
-- - A hunter who wins hunter_pool_wins (20) duels in one game enters the prize pool.
-- - When the game ends: ghosts still in get what's left of their stake back. Golden ghosts
--   and hunters in the pool share pool_win_share + pool_other_share (90%) of the prize pool
--   equally; the rest burns. If nobody is in the pool, it all burns. Duels still going when
--   the game ends are called off (the hunter gets the 10 mint back).
-- - Town events and side quests that were about hiding and hunting are switched off.
--
-- Coin books: no new mint. Fees and stake slices move between players and the prize pool.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('duel_fee',              10, 'Mint a hunter pays to challenge a ghost (back if they win)'),
  ('duel_answer_seconds',   30, 'How long a ghost has to answer a challenge'),
  ('duel_seconds',          60, 'Longest a duel lasts once it starts'),
  ('duel_first_to',         2,  'Points needed to win a duel (Rock-Paper-Scissors throws)'),
  ('duel_cooldown_seconds', 30, 'Wait after a duel before a hunter can challenge again'),
  ('ghost_golden_wins',     3,  'Duels a ghost must win to turn golden (safe, in the prize pool)'),
  ('ghost_out_losses',      3,  'Duels a ghost can lose before they are out'),
  ('hunter_pool_wins',      20, 'Duels a hunter must win in one game to enter the prize pool')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
alter table public.entries add column if not exists golden boolean not null default false;
alter table public.entries add column if not exists duel_wins int not null default 0;
alter table public.entries add column if not exists duel_losses int not null default 0;
alter table public.entries add column if not exists last_duel_at timestamptz;

create table if not exists public.duels (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  ghost_id uuid not null references public.profiles (id) on delete cascade,
  hunter_id uuid not null references public.profiles (id) on delete cascade,
  game text not null default 'rps',
  status text not null default 'asked' check (status in ('asked', 'playing', 'done', 'void')),
  fee numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  answer_by timestamptz not null,
  started_at timestamptz,
  ends_at timestamptz,
  ghost_score int not null default 0,
  hunter_score int not null default 0,
  ghost_move text check (ghost_move in ('rock', 'paper', 'scissors')),
  hunter_move text check (hunter_move in ('rock', 'paper', 'scissors')),
  throws jsonb not null default '[]',      -- [{ g, h, w: 'ghost' | 'hunter' | 'tie' }]
  winner text check (winner in ('ghost', 'hunter')),
  reason text,                             -- score, time, no_answer, gave_up, cancelled, game_over
  portion numeric(14,2) not null default 0, -- stake the ghost lost
  reward numeric(14,2) not null default 0,  -- what the hunter won on top of the fee
  finished_at timestamptz,
  check (ghost_id <> hunter_id)
);
-- One duel at a time for each ghost and each hunter.
create unique index if not exists duels_live_ghost on public.duels (ghost_id) where status in ('asked', 'playing');
create unique index if not exists duels_live_hunter on public.duels (hunter_id) where status in ('asked', 'playing');
create index if not exists duels_live_round on public.duels (round_id) where status in ('asked', 'playing');
create index if not exists duels_ghost_idx on public.duels (ghost_id, id desc);
create index if not exists duels_hunter_idx on public.duels (hunter_id, id desc);
alter table public.duels enable row level security; -- no policies: only the server reads them

-- ============================================================ helpers
create or replace function public.rps_beats(a text, b text) returns boolean
language sql immutable as $$
  select (a = 'rock' and b = 'scissors') or (a = 'paper' and b = 'rock') or (a = 'scissors' and b = 'paper')
$$;

-- A duel as one of its two players sees it: { id, game, status, role, opponent: { id, name,
-- avatar, level }, me, them, first_to, throws: [{ me, them, w: me|them|tie }], my_move,
-- they_moved, answer_by, ends_at, now, winner: me|them|null, reason, fee, reward, portion }.
create or replace function public.duel_view(d public.duels, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with side as (select (p_user = d.ghost_id) as g)
  select jsonb_build_object(
    'id', d.id, 'game', d.game, 'status', d.status,
    'role', case when side.g then 'ghost' else 'hunter' end,
    'opponent', (select jsonb_build_object('id', p.id, 'name', p.username, 'avatar', p.avatar, 'level', p.level)
                 from public.profiles p where p.id = case when side.g then d.hunter_id else d.ghost_id end),
    'me', case when side.g then d.ghost_score else d.hunter_score end,
    'them', case when side.g then d.hunter_score else d.ghost_score end,
    'first_to', public.setting('duel_first_to')::int,
    'throws', coalesce((select jsonb_agg(jsonb_build_object(
                 'me', case when side.g then t->>'g' else t->>'h' end,
                 'them', case when side.g then t->>'h' else t->>'g' end,
                 'w', case when t->>'w' = 'tie' then 'tie'
                           when (t->>'w' = 'ghost') = side.g then 'me' else 'them' end) order by o)
               from jsonb_array_elements(d.throws) with ordinality x(t, o)), '[]'::jsonb),
    'my_move', case when side.g then d.ghost_move else d.hunter_move end,
    'they_moved', case when side.g then d.hunter_move is not null else d.ghost_move is not null end,
    'answer_by', d.answer_by, 'ends_at', d.ends_at, 'now', now(),
    'winner', case when d.winner is null then null when (d.winner = 'ghost') = side.g then 'me' else 'them' end,
    'reason', d.reason, 'fee', d.fee, 'reward', d.reward, 'portion', d.portion)
  from side
$$;

-- Settle a duel (the caller holds the game's lock). p_winner: 'ghost', 'hunter', or null to
-- call it off (the hunter gets the fee back). p_reason: score, time, no_answer, gave_up,
-- cancelled, game_over.
create or replace function public.duel_finish(p_duel bigint, p_winner text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.duels;
  g public.entries;
  h public.entries;
  v_g text;
  v_h text;
  v_out int := public.setting('ghost_out_losses')::int;
  v_portion numeric := 0;
  v_reward numeric := 0;
  v_is_out boolean := false;
  v_golden boolean := false;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or d.status not in ('asked', 'playing') then return; end if;
  select username into v_g from public.profiles where id = d.ghost_id;
  select username into v_h from public.profiles where id = d.hunter_id;

  if p_winner is null then
    -- Called off: the hunter gets the fee back.
    update public.profiles set coins = coins + d.fee where id = d.hunter_id;
    perform public.log_coins(d.hunter_id, d.round_id, 'duel_refund', d.fee, false, 'Duel called off');
    update public.duels set status = 'void', reason = p_reason, finished_at = now(), ghost_move = null, hunter_move = null where id = p_duel;
    return;
  end if;

  select * into g from public.entries where round_id = d.round_id and user_id = d.ghost_id for update;
  select * into h from public.entries where round_id = d.round_id and user_id = d.hunter_id for update;

  if p_winner = 'hunter' then
    -- The fee back, and a slice of the ghost's stake: 80% to the hunter, 20% to the pool.
    update public.profiles set coins = coins + d.fee where id = d.hunter_id;
    perform public.log_coins(d.hunter_id, d.round_id, 'duel_refund', d.fee, false, 'Beat ' || coalesce(v_g, 'a ghost'));
    v_is_out := g.duel_losses + 1 >= v_out;
    v_portion := case when v_is_out then greatest(g.stake, 0)
                      else least(greatest(g.stake, 0), round(public.setting('hider_stake') / greatest(v_out, 1), 2)) end;
    if v_portion > 0 then
      if public.linked_accounts(d.hunter_id, d.ghost_id) then
        insert into public.flags (round_id, finder_id, hider_id, reason) values (d.round_id, d.hunter_id, d.ghost_id, 'linked accounts (duel)');
        v_reward := 0;
      else
        v_reward := round(v_portion * public.setting('finder_share'), 2);
      end if;
      if v_reward > 0 then
        update public.profiles set coins = coins + v_reward where id = d.hunter_id;
        perform public.log_coins(d.hunter_id, d.round_id, 'duel_reward', v_reward, false, 'Beat ' || coalesce(v_g, 'a ghost'));
      end if;
      perform public.pool_or_burn(d.round_id, v_portion - v_reward, 'Duel: ghost stake');
    end if;
    update public.entries
       set stake = greatest(stake - v_portion, 0), duel_losses = duel_losses + 1,
           caught = caught or v_is_out, caught_by = case when v_is_out then d.hunter_id else caught_by end
     where round_id = d.round_id and user_id = d.ghost_id;
    if v_is_out and not g.caught then
      update public.rounds set hiders_remaining = greatest(hiders_remaining - 1, 0) where id = d.round_id;
    end if;
    update public.entries set duel_wins = duel_wins + 1, last_duel_at = now() where round_id = d.round_id and user_id = d.hunter_id;
    perform public.notify(d.ghost_id, d.round_id, 'duel_lost', case when v_is_out
      then format('%s beat you. That''s %s losses: you''re out of this game.', coalesce(v_h, 'A hunter'), v_out)
      else format('%s beat you and took %s mint of your stake. %s more loss%s and you''re out.', coalesce(v_h, 'A hunter'),
                  v_portion, v_out - g.duel_losses - 1, case when v_out - g.duel_losses - 1 = 1 then '' else 'es' end) end);
    perform public.notify(d.hunter_id, d.round_id, 'duel_won',
      format('You beat %s! +%s mint, and your %s mint back.', coalesce(v_g, 'the ghost'), v_reward, d.fee)
      || case when h.duel_wins + 1 = public.setting('hunter_pool_wins')::int
              then format(' That''s %s wins: you''re in the prize pool!', h.duel_wins + 1) else '' end);
  else
    -- The ghost wins: the hunter's fee goes into the prize pool.
    perform public.pool_or_burn(d.round_id, d.fee, 'Duel fee');
    v_golden := not g.golden and g.duel_wins + 1 >= public.setting('ghost_golden_wins');
    update public.entries set duel_wins = duel_wins + 1, golden = golden or v_golden
     where round_id = d.round_id and user_id = d.ghost_id;
    update public.entries set duel_losses = duel_losses + 1, last_duel_at = now() where round_id = d.round_id and user_id = d.hunter_id;
    perform public.notify(d.ghost_id, d.round_id, 'duel_won', case when v_golden
      then format('You beat %s! That''s %s wins: you''re golden. Safe for the rest of the game, and in the prize pool!',
                  coalesce(v_h, 'a hunter'), g.duel_wins + 1)
      else format('You beat %s! %s more win%s and you turn golden.', coalesce(v_h, 'a hunter'),
                  public.setting('ghost_golden_wins')::int - g.duel_wins - 1,
                  case when public.setting('ghost_golden_wins')::int - g.duel_wins - 1 = 1 then '' else 's' end) end);
    perform public.notify(d.hunter_id, d.round_id, 'duel_lost',
      format('%s beat you%s. Your %s mint went into the prize pool.', coalesce(v_g, 'The ghost'),
             case p_reason when 'time' then ' (time ran out level, and ghosts win a draw)' else '' end, d.fee));
  end if;

  update public.duels
     set status = 'done', winner = p_winner, reason = p_reason, portion = v_portion, reward = v_reward,
         finished_at = now(), ghost_move = null, hunter_move = null
   where id = p_duel;
  insert into public.events (round_id, kind, tile, detail)
    values (d.round_id, 'duel', g.tile, jsonb_build_object(
      'ghost', v_g, 'hunter', v_h, 'winner', p_winner, 'reason', p_reason,
      'out', v_is_out, 'golden', v_golden,
      'avatar', (select avatar from public.profiles where id = case when p_winner = 'ghost' then d.ghost_id else d.hunter_id end)));
end $$;

-- Settle duels whose time is up: an unanswered challenge is a loss for the ghost; a duel that
-- ran out of time goes to whoever is ahead (level: the ghost). The caller holds the game's lock.
create or replace function public.duel_tidy(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
declare d record; v_n int := 0;
begin
  for d in select * from public.duels where round_id = p_round and status in ('asked', 'playing')
             and ((status = 'asked' and answer_by <= now()) or (status = 'playing' and ends_at <= now()))
           order by id loop
    if d.status = 'asked' then
      perform public.duel_finish(d.id, 'hunter', 'no_answer');
    else
      perform public.duel_finish(d.id, case when d.hunter_score > d.ghost_score then 'hunter' else 'ghost' end, 'time');
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Any duel in this game whose time is up? (cheap: only live duels are looked at)
create or replace function public.duel_stale(p_round bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.duels where round_id = p_round and status in ('asked', 'playing')
                 and ((status = 'asked' and answer_by <= now()) or (status = 'playing' and ends_at <= now())))
$$;

-- ============================================================ challenging, answering, playing
-- A hunter challenges a ghost. Returns duel_view(). Errors: no_hunt, self, unknown_player,
-- no_name, frozen, you_are_ghost, not_ghost, ghost_out, ghost_golden, busy, you_busy,
-- cooldown:<seconds>, not_enough:<fee>.
create or replace function public.duel_challenge(p_hunter uuid, p_ghost uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  he public.entries;
  ge public.entries;
  d public.duels;
  v_fee numeric := public.setting('duel_fee');
  v_wait numeric;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'no_hunt'; end if;
  perform public.duel_tidy(r.id);
  if p_hunter = p_ghost then raise exception 'self'; end if;
  select * into p from public.profiles where id = p_hunter for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into he from public.entries where round_id = r.id and user_id = p_hunter;
  if found and he.role = 'hider' then raise exception 'you_are_ghost'; end if;
  select e.* into ge from public.entries e join public.profiles gp on gp.id = e.user_id
   where e.round_id = r.id and e.user_id = p_ghost and e.role = 'hider' and not gp.is_bot;
  if not found then raise exception 'not_ghost'; end if;
  if ge.caught then raise exception 'ghost_out'; end if;
  if ge.golden then raise exception 'ghost_golden'; end if;
  if exists (select 1 from public.duels where ghost_id = p_ghost and status in ('asked', 'playing')) then raise exception 'busy'; end if;
  if exists (select 1 from public.duels where hunter_id = p_hunter and status in ('asked', 'playing')) then raise exception 'you_busy'; end if;
  if he.last_duel_at is not null then
    v_wait := public.setting('duel_cooldown_seconds') - extract(epoch from (now() - he.last_duel_at));
    if v_wait > 0.5 then raise exception 'cooldown:%', ceil(v_wait)::int; end if;
  end if;
  if p.coins < v_fee then raise exception 'not_enough:%', v_fee; end if;
  -- Everyone who isn't a ghost is a hunter: the first challenge puts them in the game.
  if he.user_id is null then perform public.join_round(p_hunter, 'seeker'); end if;
  update public.profiles set coins = coins - v_fee where id = p_hunter;
  perform public.log_coins(p_hunter, r.id, 'duel_fee', -v_fee, false,
    'Challenge: ' || coalesce((select username from public.profiles where id = p_ghost), 'a ghost'));
  insert into public.duels (round_id, ghost_id, hunter_id, game, fee, answer_by)
    values (r.id, p_ghost, p_hunter, 'rps', v_fee, now() + make_interval(secs => public.setting('duel_answer_seconds')::int))
    returning * into d;
  perform public.notify(p_ghost, r.id, 'duel',
    format('%s challenged you to a duel! Answer within %s seconds or you lose it.', p.username, public.setting('duel_answer_seconds')::int));
  return public.duel_view(d, p_hunter);
end $$;

-- Lock the game a duel belongs to, then the duel. Errors: no_duel, not_yours.
create or replace function public.duel_lock(p_user uuid, p_duel bigint) returns public.duels
language plpgsql security definer set search_path = public as $$
declare d public.duels; v_round bigint;
begin
  select round_id into v_round from public.duels where id = p_duel;
  if v_round is null then raise exception 'no_duel'; end if;
  perform 1 from public.rounds where id = v_round for update;
  perform public.duel_tidy(v_round);
  select * into d from public.duels where id = p_duel for update;
  if p_user not in (d.ghost_id, d.hunter_id) then raise exception 'not_yours'; end if;
  return d;
end $$;

-- The ghost answers: the duel starts. Returns duel_view(). Errors: no_duel, not_yours.
-- (Too late: the view shows the duel already lost.)
create or replace function public.duel_answer(p_ghost uuid, p_duel bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  d := public.duel_lock(p_ghost, p_duel);
  if d.ghost_id <> p_ghost then raise exception 'not_yours'; end if;
  if d.status = 'asked' then
    update public.duels set status = 'playing', started_at = now(),
           ends_at = now() + make_interval(secs => public.setting('duel_seconds')::int)
     where id = p_duel returning * into d;
  end if;
  return public.duel_view(d, p_ghost);
end $$;

-- Throw rock, paper or scissors. When both have thrown, the point goes to the winner (a tie is
-- thrown again); first to duel_first_to wins the duel. Returns duel_view().
-- Errors: no_duel, not_yours, bad_move, not_playing.
create or replace function public.duel_move(p_user uuid, p_duel bigint, p_move text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.duels;
  v_w text;
  v_first int := public.setting('duel_first_to')::int;
begin
  if p_move is null or p_move not in ('rock', 'paper', 'scissors') then raise exception 'bad_move'; end if;
  d := public.duel_lock(p_user, p_duel);
  if d.status <> 'playing' then
    if d.status in ('done', 'void') then return public.duel_view(d, p_user); end if;
    raise exception 'not_playing';
  end if;
  if p_user = d.ghost_id and d.ghost_move is null then
    update public.duels set ghost_move = p_move where id = p_duel returning * into d;
  elsif p_user = d.hunter_id and d.hunter_move is null then
    update public.duels set hunter_move = p_move where id = p_duel returning * into d;
  end if;
  if d.ghost_move is not null and d.hunter_move is not null then
    v_w := case when d.ghost_move = d.hunter_move then 'tie'
                when public.rps_beats(d.ghost_move, d.hunter_move) then 'ghost' else 'hunter' end;
    update public.duels
       set throws = throws || jsonb_build_array(jsonb_build_object('g', ghost_move, 'h', hunter_move, 'w', v_w)),
           ghost_score = ghost_score + (v_w = 'ghost')::int,
           hunter_score = hunter_score + (v_w = 'hunter')::int,
           ghost_move = null, hunter_move = null
     where id = p_duel returning * into d;
    if d.ghost_score >= v_first then perform public.duel_finish(p_duel, 'ghost', 'score');
    elsif d.hunter_score >= v_first then perform public.duel_finish(p_duel, 'hunter', 'score');
    end if;
    select * into d from public.duels where id = p_duel;
  end if;
  return public.duel_view(d, p_user);
end $$;

-- Give up: a ghost who won't play (or gives up mid-duel) loses; a hunter who gives up loses
-- too, except while the ghost hasn't answered yet, when it's simply called off (fee back).
-- Returns duel_view().
create or replace function public.duel_give_up(p_user uuid, p_duel bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  d := public.duel_lock(p_user, p_duel);
  if d.status in ('asked', 'playing') then
    if p_user = d.hunter_id and d.status = 'asked' then
      perform public.duel_finish(p_duel, null, 'cancelled');
    else
      perform public.duel_finish(p_duel, case when p_user = d.ghost_id then 'hunter' else 'ghost' end, 'gave_up');
    end if;
  end if;
  select * into d from public.duels where id = p_duel;
  return public.duel_view(d, p_user);
end $$;

-- One duel, as its player sees it now (settling it first if its time is up).
-- Errors: no_duel, not_yours.
create or replace function public.duel_state(p_user uuid, p_duel bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_duel;
  if not found then raise exception 'no_duel'; end if;
  if p_user not in (d.ghost_id, d.hunter_id) then raise exception 'not_yours'; end if;
  if (d.status = 'asked' and d.answer_by <= now()) or (d.status = 'playing' and d.ends_at <= now()) then
    d := public.duel_lock(p_user, p_duel);
  end if;
  return public.duel_view(d, p_user);
end $$;

-- ============================================================ what the map shows
-- The game as the duels see it: { phase, rules, ghosts: [{ id, name, avatar, level, tile,
-- status: free|playing|golden, wins, losses }], me: { role, wins, losses, golden, out,
-- cooldown_until, in_pool }, duel: duel_view() of your live (or just finished) duel }.
-- Ghosts who are out are left off. Settles duels whose time is up first.
create or replace function public.duel_board(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  me public.entries;
  d public.duels;
  v_pool int := public.setting('hunter_pool_wins')::int;
begin
  select * into r from public.rounds where status <> 'done' order by id desc limit 1;
  if not found then return jsonb_build_object('phase', 'none', 'ghosts', '[]'::jsonb); end if;
  if r.status = 'seek' and public.duel_stale(r.id) then
    perform 1 from public.rounds where id = r.id for update;
    perform public.duel_tidy(r.id);
  end if;
  select * into me from public.entries where round_id = r.id and user_id = p_user;
  if p_user is not null then
    select * into d from public.duels where round_id = r.id and (ghost_id = p_user or hunter_id = p_user)
      and (status in ('asked', 'playing') or finished_at > now() - interval '20 seconds')
      order by (status in ('asked', 'playing')) desc, id desc limit 1;
  end if;
  return jsonb_build_object(
    'phase', r.status,
    'rules', jsonb_build_object(
      'fee', public.setting('duel_fee'), 'answer_seconds', public.setting('duel_answer_seconds'),
      'duel_seconds', public.setting('duel_seconds'), 'first_to', public.setting('duel_first_to'),
      'cooldown', public.setting('duel_cooldown_seconds'), 'golden_wins', public.setting('ghost_golden_wins'),
      'out_losses', public.setting('ghost_out_losses'), 'pool_wins', v_pool, 'stake', public.setting('hider_stake')),
    'ghosts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.user_id, 'name', p.username, 'avatar', p.avatar, 'level', p.level, 'tile', e.tile,
               'status', case when e.golden then 'golden'
                              when exists (select 1 from public.duels x where x.ghost_id = e.user_id and x.status in ('asked', 'playing')) then 'playing'
                              else 'free' end,
               'wins', e.duel_wins, 'losses', e.duel_losses) order by e.created_at)
      from public.entries e join public.profiles p on p.id = e.user_id
      where e.round_id = r.id and e.role = 'hider' and not e.caught and not p.is_bot), '[]'::jsonb),
    'me', case when me.user_id is null then jsonb_build_object('role', 'hunter', 'wins', 0, 'losses', 0)
               else jsonb_build_object(
                 'role', case when me.role = 'hider' then 'ghost' else 'hunter' end,
                 'wins', me.duel_wins, 'losses', me.duel_losses, 'golden', me.golden, 'out', me.caught,
                 'stake', me.stake,
                 'cooldown_until', case when me.role = 'seeker' and me.last_duel_at is not null
                                        then me.last_duel_at + make_interval(secs => public.setting('duel_cooldown_seconds')::int) end,
                 'in_pool', me.golden or (me.role = 'seeker' and me.duel_wins >= v_pool)) end,
    'duel', case when d.id is null then null else public.duel_view(d, p_user) end);
end $$;

-- A ghost's card: who they are, this game so far, and their record. Also whether you can
-- challenge them right now (and if not, why). { id, name, avatar, level, status, wins, losses,
-- golden, record: { ghost_wins, ghost_losses, hunter_wins, golden_games, ghost_games },
-- can: true | false, why: busy | golden | out | self | you_are_ghost | cooldown | you_busy |
-- no_hunt | not_enough | null, cooldown_until }.
create or replace function public.ghost_card(p_user uuid, p_ghost uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rounds;
  g public.entries;
  p public.profiles;
  me public.entries;
  v_busy boolean;
  v_why text;
  v_cool timestamptz;
begin
  select * into r from public.rounds where status <> 'done' order by id desc limit 1;
  select * into p from public.profiles where id = p_ghost;
  if not found then raise exception 'no_player'; end if;
  select * into g from public.entries where round_id = r.id and user_id = p_ghost and role = 'hider';
  select * into me from public.entries where round_id = r.id and user_id = p_user;
  v_busy := exists (select 1 from public.duels where ghost_id = p_ghost and status in ('asked', 'playing'));
  if me.last_duel_at is not null and me.role = 'seeker' then
    v_cool := me.last_duel_at + make_interval(secs => public.setting('duel_cooldown_seconds')::int);
    if v_cool <= now() then v_cool := null; end if;
  end if;
  v_why := case
    when p_user = p_ghost then 'self'
    when r.status is distinct from 'seek' then 'no_hunt'
    when g.user_id is null or g.caught then 'out'
    when g.golden then 'golden'
    when me.role = 'hider' then 'you_are_ghost'
    when v_busy then 'busy'
    when exists (select 1 from public.duels where hunter_id = p_user and status in ('asked', 'playing')) then 'you_busy'
    when v_cool is not null then 'cooldown'
    when (select coins from public.profiles where id = p_user) < public.setting('duel_fee') then 'not_enough'
  end;
  return jsonb_build_object(
    'id', p.id, 'name', p.username, 'avatar', p.avatar, 'level', p.level,
    'status', case when g.user_id is null or g.caught then 'out' when g.golden then 'golden' when v_busy then 'playing' else 'free' end,
    'wins', coalesce(g.duel_wins, 0), 'losses', coalesce(g.duel_losses, 0), 'golden', coalesce(g.golden, false),
    'record', jsonb_build_object(
      'ghost_wins', (select count(*) from public.duels where ghost_id = p_ghost and status = 'done' and winner = 'ghost'),
      'ghost_losses', (select count(*) from public.duels where ghost_id = p_ghost and status = 'done' and winner = 'hunter'),
      'hunter_wins', (select count(*) from public.duels where hunter_id = p_ghost and status = 'done' and winner = 'hunter'),
      'golden_games', (select count(*) from public.entries where user_id = p_ghost and golden),
      'ghost_games', p.hider_rounds),
    'can', v_why is null, 'why', v_why, 'cooldown_until', v_cool, 'fee', public.setting('duel_fee'));
end $$;

-- ============================================================ joining as a ghost
-- Anyone signed in can join as a ghost in the join window (no need to have hunted first).
-- Hunters don't join: their first challenge puts them in the game.
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
    if r.status <> 'join' then raise exception 'Ghosts can only join in the first few minutes of a game'; end if;
    if p.coins < v_stake then raise exception 'You need % coins to be a ghost', v_stake; end if;
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

-- ============================================================ the end of a game
create or replace function public.finalize_round(p_round bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  d record;
  x record;
  v_n int;
  v_pot numeric;
  v_share numeric;
  v_paid numeric := 0;
  v_pool int := public.setting('hunter_pool_wins')::int;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or r.status = 'done' then return; end if;
  -- Duels still going are called off (the hunter gets the fee back).
  for d in select id from public.duels where round_id = p_round and status in ('asked', 'playing') loop
    perform public.duel_finish(d.id, null, 'game_over');
  end loop;
  select * into r from public.rounds where id = p_round;
  update public.rounds set status = 'done', finished_at = now() where id = p_round;

  -- Ghosts still in get what's left of their stake back.
  for x in select e.user_id, e.stake from public.entries e join public.profiles p on p.id = e.user_id
           where e.round_id = p_round and e.role = 'hider' and not e.caught and not p.is_bot and e.stake > 0 loop
    update public.profiles set coins = coins + x.stake where id = x.user_id;
    perform public.log_coins(x.user_id, p_round, 'stake_return', x.stake);
  end loop;

  -- The prize pool: golden ghosts and hunters with enough wins share 90% equally.
  select count(*) into v_n from public.entries e join public.profiles p on p.id = e.user_id
   where e.round_id = p_round and not p.is_bot
     and ((e.role = 'hider' and e.golden and not e.caught) or (e.role = 'seeker' and e.duel_wins >= v_pool));
  v_pot := round(r.pool * (public.setting('pool_win_share') + public.setting('pool_other_share')), 2);
  if v_n > 0 and v_pot > 0 then
    v_share := floor(v_pot * 100 / v_n) / 100;
    for x in select e.user_id, e.role from public.entries e join public.profiles p on p.id = e.user_id
             where e.round_id = p_round and not p.is_bot
               and ((e.role = 'hider' and e.golden and not e.caught) or (e.role = 'seeker' and e.duel_wins >= v_pool)) loop
      update public.profiles set coins = coins + v_share where id = x.user_id;
      update public.entries set payout = payout + v_share where round_id = p_round and user_id = x.user_id;
      perform public.log_coins(x.user_id, p_round, case when x.role = 'hider' then 'pool_hider' else 'pool_seeker' end, v_share);
      v_paid := v_paid + v_share;
    end loop;
  end if;
  -- The bank's 10%, a pool nobody won, and rounding dust burn. Nothing carries over.
  perform public.burn(p_round, r.pool - v_paid, 'bank');

  update public.profiles set hider_rounds = hider_rounds + 1
    where not is_bot and id in (select user_id from public.entries where round_id = p_round and role = 'hider');
  update public.profiles set seeker_rounds = seeker_rounds + 1
    where id in (select user_id from public.entries where round_id = p_round and role = 'seeker');
end $$;

-- ============================================================ town events and side quests
-- Events and quests that were about hiding and hunting are switched off (to be replaced).
alter table public.world_event_kinds add column if not exists enabled boolean not null default true;
update public.world_event_kinds set enabled = false
 where key in ('fog_of_war', 'double_coins', 'ghost_amnesty', 'drone_storm', 'lucky_street', 'bot_tantrum',
               'spotlight', 'bounty_board', 'safe_house', 'blackout_district');
update public.quest_catalog set enabled = false
 where key in ('detective', 'private_eye', 'spy', 'lookout', 'informant', 'apprentice_hunter', 'bounty_hunter',
               'drone_pilot', 'decoy_master', 'escape_artist', 'ghost_whisperer', 'shadow');

-- Part 22's planner, picking only events that are switched on.
create or replace function public.plan_world_events(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_count int;
  v_n int := 0;
  v_hunt int;
  k record;
  v_start timestamptz;
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
    where key <> 'final_countdown' and enabled
    order by (case when twist then random() * (1 - public.setting('world_event_twist_share')) * 2
                   else random() * public.setting('world_event_twist_share') * 2 end) desc
    limit v_count
  loop
    -- Somewhere in the hunt, not in the first 2 minutes, finished before the end.
    v_start := r.join_ends_at + make_interval(secs => (120 + floor(random() * greatest(60, (v_hunt - k.minutes - 3) * 60 - 120)))::int);
    insert into public.world_events (round_id, key, tile, radius, starts_at, ends_at, reward_coins, reward_slots, detail)
      values (p_round, k.key, floor(random() * r.tile_count)::int, k.radius, v_start,
              v_start + make_interval(mins => k.minutes), k.reward_coins, k.reward_slots, '{}'::jsonb);
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
begin
  revoke all on table public.duels from public, anon, authenticated;
  grant all on table public.duels to service_role;
  revoke all on sequence public.duels_id_seq from public, anon, authenticated;
  grant all on sequence public.duels_id_seq to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('rps_beats', 'duel_view', 'duel_finish', 'duel_tidy', 'duel_stale', 'duel_challenge', 'duel_lock', 'duel_answer',
            'duel_move', 'duel_give_up', 'duel_state', 'duel_board', 'ghost_card', 'join_round', 'finalize_round',
            'plan_world_events')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ======================================================== 030_no_bot_ghost.sql
-- Newtown, part 30: the bot stops playing, and joining as a ghost takes 2 minutes.
-- - The bot no longer joins every game as a ghost. It sat in the ghost counts, so the game said
--   "1 ghost left" when it meant the bot. Towns still start at 20 x 20 (the base_tiles setting),
--   so nothing else needs it. Its name still signs the town news in the chat.
-- - Ghosts join in the first 2 minutes of the hour (it was 3).
-- Safe to run more than once. Run after parts 1-29.

update public.game_settings set value = 2 where key = 'join_minutes';

-- The game that's on now: take the bot out of it (and out of its ghost counts).
with gone as (
  delete from public.entries e
   using public.rounds r, public.profiles p
   where e.round_id = r.id and r.status <> 'done' and p.id = e.user_id and p.is_bot
  returning e.round_id, e.caught
)
update public.rounds r
   set hiders_total = greatest(r.hiders_total - 1, 0),
       hiders_remaining = greatest(r.hiders_remaining - (case when gone.caught then 0 else 1 end), 0)
  from gone
 where r.id = gone.round_id;

-- The round clock (as in part 21), minus the bot: a new game starts with no ghosts at all.
create or replace function public.tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_id bigint;
  v_join int := public.setting('join_minutes')::int;
  v_min_hunt int := coalesce(public.setting('min_hunt_minutes')::int, 15);
  v_hour timestamptz := date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC';
  v_join_end timestamptz;
  v_next timestamptz;
  v_pick int;
  h record;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status <> 'done' for update;

  -- Keep every game on the hour: one still running to an odd time (started on the old timing)
  -- is pulled in to end at the next hour mark, so the next countdown starts on the dot.
  if found and r.seek_ends_at > now()
     and r.seek_ends_at <> date_trunc('hour', r.seek_ends_at at time zone 'UTC') at time zone 'UTC' then
    v_next := v_hour + interval '1 hour';
    update public.rounds
      set seek_ends_at = v_next,
          join_ends_at = least(join_ends_at, v_next - interval '1 minute')
      where id = r.id
      returning * into r;
  end if;

  if not found then
    -- Too late in this hour for a proper hunt: line up for the next hour instead.
    if now() > v_hour + make_interval(mins => 60 - v_min_hunt) then
      v_hour := v_hour + interval '1 hour';
    end if;
    -- Join until a couple of minutes past the hour (at least a minute from now, if we're late).
    v_join_end := greatest(v_hour + make_interval(mins => v_join), now() + interval '1 minute');
    -- A fresh 20 x 20 town with an empty pool and no ghosts yet; the hunt ends on the next hour mark.
    insert into public.rounds (join_ends_at, seek_ends_at, pool, tile_count, hiders_total, hiders_remaining, bot_name)
    values (v_join_end, v_hour + interval '1 hour', 0, public.setting('base_tiles')::int, 0, 0, 'Seed Bot')
    returning id into v_id;
    -- (The bot's name still signs the town news in the chat.)
    update public.rounds set bot_name = coalesce(
      (select name from public.bot_names order by id offset (v_id % greatest((select count(*) from public.bot_names), 1)) limit 1),
      'Seed Bot') where id = v_id;
    return 'round created';
  end if;

  if r.status = 'join' and now() >= r.join_ends_at then
    -- Give each ghost a random free spot for their light. Picks spots directly instead of
    -- shuffling the whole town, so it stays quick however big the town gets.
    for h in select user_id from public.entries where round_id = r.id and role = 'hider' order by random() loop
      for k in 1..200 loop
        v_pick := floor(random() * r.tile_count)::int;
        exit when not exists (select 1 from public.entries x where x.round_id = r.id and x.tile = v_pick);
      end loop;
      update public.entries set tile = v_pick where round_id = r.id and user_id = h.user_id;
    end loop;
    update public.rounds set status = 'seek' where id = r.id;
    v_out := 'seeking started';
    r.status := 'seek';
  end if;

  if r.status = 'seek' and now() >= r.seek_ends_at then
    perform public.finalize_round(r.id);
    -- The next game is set up on the next tick (seconds later: any open screen asks for one),
    -- and its countdown is pinned to the hour, so it still starts on time.
    return 'round finished';
  end if;
  return v_out;
end $$;
revoke all on function public.tick() from public, anon, authenticated;
grant execute on function public.tick() to service_role;

