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
