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
