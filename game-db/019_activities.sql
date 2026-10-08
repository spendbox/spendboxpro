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
