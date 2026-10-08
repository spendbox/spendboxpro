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

create or replace function public.tick_with_extras() returns text
language plpgsql security definer set search_path = public as $$
declare v text; r public.rounds;
begin
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
