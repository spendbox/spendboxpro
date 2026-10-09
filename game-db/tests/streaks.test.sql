\set ON_ERROR_STOP on
-- Part 27: daily streaks and the new level curve. A day counts once; yesterday keeps it going;
-- one missed day is saved by the week's freeze (once a week); more starts again. Milestones pay
-- mint (every time) and a badge (the first time). Games, quests and gifts count (triggers).
-- XP and mint for levels; the top level; the refill cap; the one-time start for players who
-- already played every day; running part 27 again; books; nothing open to the app's clients.
-- Run part 27 again first: it must be safe to re-run.
\ir ../027_streaks_levels.sql
-- Only the 'ok …' lines and the books check at the end are printed (query results go nowhere).
\o /dev/null

create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled))
$$;
create temp table books_st as select pg_temp.gap() as gap_before;
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
-- Stops the run with FAILED when something isn't right, and prints 'ok <what>' when it is.
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
-- Prints 'ok <what>: <error>' when the call fails as it should (and the error starts with p_code).
create function pg_temp.fails(what text, p_code text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  if sqlerrm not like p_code || '%' then raise exception 'FAILED: % gave "%" (expected %)', what, sqlerrm, p_code; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;
-- Set a player's streak as if they last counted p_last (and nothing counted since).
create function pg_temp.set_streak(u uuid, n int, p_last date, p_freeze date default null) returns void language sql as $$
  delete from streak_days where user_id = u and day > p_last;
  insert into streaks (user_id, current, best, last_day, freeze_used_on) values (u, n, n, p_last, p_freeze)
  on conflict (user_id) do update set current = n, best = greatest(streaks.best, n), last_day = p_last, freeze_used_on = p_freeze;
$$;
create function pg_temp.xp(u uuid) returns int language sql as $$ select level_xp from profiles where id = u $$;
create function pg_temp.coins(u uuid) returns numeric language sql as $$ select coins from profiles where id = u $$;

insert into auth.users (email) values ('st1@streak.test'), ('st2@streak.test'), ('st3@streak.test'), ('st4@streak.test'),
                                      ('st5@streak.test'), ('st6@streak.test');
update profiles set username = 'Qsade' where email_key = 'st1@streak.test';
update profiles set username = 'Qsbisi' where email_key = 'st2@streak.test';
update profiles set username = 'Qschike', frozen = true where email_key = 'st3@streak.test';
update profiles set username = 'Qsdayo' where email_key = 'st4@streak.test';
update profiles set username = 'Qsemeka' where email_key = 'st5@streak.test';
update profiles set username = 'Qsfemi' where email_key = 'st6@streak.test';

-- ============================================================ privacy
select pg_temp.check(not has_table_privilege('anon', 'public.streaks', 'select')
  and not has_table_privilege('authenticated', 'public.streak_days', 'select')
  and has_table_privilege('service_role', 'public.streaks', 'update')
  and (select relrowsecurity from pg_class where oid = 'public.streaks'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.streak_days'::regclass),
  'streaks are server-only (RLS on, no access for anon or signed-in clients)');
select pg_temp.check(not has_function_privilege('authenticated', 'public.streak_touch(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.streak_of(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.upgrade_level(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.streak_touch(uuid,text)', 'execute'),
  'streak and level functions are server-only');
select pg_temp.check(not has_table_privilege('anon', 'public.coin_supply_daily', 'select')
  and has_table_privilege('service_role', 'public.coin_supply_daily', 'select'), 'the coin books are server-only');

-- ============================================================ a day counts once
do $$
declare a uuid := pg_temp.uid('st1@streak.test'); res jsonb; x0 int;
begin
  res := streak_of(a);
  perform pg_temp.check((res->>'current')::int = 0 and (res->>'best')::int = 0 and not (res->>'today')::boolean
                        and jsonb_array_length(res->'week') = 7 and res->'week'->>6 = 'today' and res->'week'->>0 = 'missed'
                        and (res->>'next')::int = 3 and (res->>'next_reward')::numeric = 10 and (res->>'freeze_ready')::boolean,
                        'a new player: no streak yet, next stop 3 days (10 mint), freeze ready');
  perform pg_temp.fails('only known actions count', 'bad_action', format('select streak_touch(%L, %L)', a, 'dance'));
  x0 := pg_temp.xp(a);
  res := streak_touch(a, 'ride');
  perform pg_temp.check((res->>'new_day')::boolean and (res->>'current')::int = 1 and (res->>'today')::boolean
                        and res->'week'->>6 = 'done' and pg_temp.xp(a) = x0 + 5, 'first thing today: day 1, +5 XP');
  res := streak_touch(a, 'game');
  perform pg_temp.check(not (res->>'new_day')::boolean and (res->>'current')::int = 1 and pg_temp.xp(a) = x0 + 5,
                        'the second thing today changes nothing');
  perform pg_temp.check((select action from streak_days where user_id = a and day = streak_today()) = 'ride',
                        'the day remembers what counted first');
end $$;

-- ============================================================ yesterday, milestones, badges
do $$
declare a uuid := pg_temp.uid('st1@streak.test'); res jsonb; c0 numeric; n0 int;
begin
  perform pg_temp.set_streak(a, 2, streak_today() - 1);
  res := streak_of(a);
  perform pg_temp.check((res->>'current')::int = 2 and (res->>'alive')::boolean and not (res->>'today')::boolean
                        and not (res->>'freeze_needed')::boolean, 'played yesterday: the streak is alive, today not done yet');
  c0 := pg_temp.coins(a);
  res := streak_touch(a, 'quest');
  perform pg_temp.check((res->>'current')::int = 3 and (res->>'reward')::numeric = 10 and pg_temp.coins(a) = c0 + 10,
                        'day 3: +10 mint');
  perform pg_temp.check((select count(*) from ledger where user_id = a and kind = 'streak_reward' and amount = 10) = 1,
                        'the reward is in the ledger as streak_reward');
  perform pg_temp.check((select count(*) from badges where user_id = a and badge = 'streak_3') = 1, 'the 3-day badge');
  perform pg_temp.check((select body from notifications where user_id = a and kind = 'streak' order by id desc limit 1)
                        like '3-day streak! +10 mint%', 'a notification at the milestone');
  perform pg_temp.check((res->>'next')::int = 7 and (res->>'next_reward')::numeric = 25, 'next stop: 7 days (25 mint)');

  -- Reaching 3 again later pays again, but there's still one badge.
  perform pg_temp.set_streak(a, 2, streak_today() - 1);
  c0 := pg_temp.coins(a);
  n0 := (select count(*) from notifications where user_id = a and kind = 'streak');
  res := streak_touch(a, 'gift');
  perform pg_temp.check(pg_temp.coins(a) = c0 + 10 and (select count(*) from badges where user_id = a and badge = 'streak_3') = 1
                        and (select count(*) from notifications where user_id = a and kind = 'streak') = n0 + 1,
                        'reaching 3 days again pays again, still one badge');
  perform pg_temp.check((select best from streaks where user_id = a) = 3, 'best is kept');

  -- 100 days: 500 mint and the badge. 200 days: 500 more, no new badge.
  perform pg_temp.set_streak(a, 99, streak_today() - 1);
  c0 := pg_temp.coins(a);
  res := streak_touch(a, 'game');
  perform pg_temp.check((res->>'current')::int = 100 and pg_temp.coins(a) = c0 + 500
                        and exists (select 1 from badges where user_id = a and badge = 'streak_100'), '100 days: +500 mint and the badge');
  perform pg_temp.check((res->>'next')::int = 200 and (res->>'next_reward')::numeric = 500, 'after 100, every 100 days pays');
  perform pg_temp.set_streak(a, 199, streak_today() - 1);
  c0 := pg_temp.coins(a);
  res := streak_touch(a, 'game');
  perform pg_temp.check((res->>'current')::int = 200 and pg_temp.coins(a) = c0 + 500
                        and not exists (select 1 from badges where user_id = a and badge = 'streak_200'), '200 days: +500 mint');
  perform pg_temp.set_streak(a, 4, streak_today() - 1);
  c0 := pg_temp.coins(a);
  res := streak_touch(a, 'game');
  perform pg_temp.check((res->>'current')::int = 5 and (res->>'reward')::numeric = 0 and pg_temp.coins(a) = c0
                        and (select best from streaks where user_id = a) = 200, 'an ordinary day pays nothing; best stays 200');
end $$;

-- ============================================================ the freeze
do $$
declare b uuid := pg_temp.uid('st2@streak.test'); res jsonb; c0 numeric;
begin
  -- Missed yesterday, freeze not used: the streak is still alive and the freeze will save it.
  perform pg_temp.set_streak(b, 6, streak_today() - 2);
  res := streak_of(b);
  perform pg_temp.check((res->>'current')::int = 6 and (res->>'alive')::boolean and (res->>'freeze_needed')::boolean,
                        'missed one day: still alive, the freeze will save it');
  c0 := pg_temp.coins(b);
  res := streak_touch(b, 'hug');
  perform pg_temp.check((res->>'froze')::boolean and (res->>'current')::int = 7 and pg_temp.coins(b) = c0 + 25
                        and (select freeze_used_on from streaks where user_id = b) = streak_today() - 1,
                        'the freeze covers yesterday: day 7, +25 mint');
  perform pg_temp.check(res->'week'->>5 = 'freeze' and res->'week'->>6 = 'done' and not (res->>'freeze_ready')::boolean,
                        'the week shows the frozen day; no freeze left this week');
  perform pg_temp.check((select froze from streak_days where user_id = b and day = streak_today()), 'the day remembers the freeze');

  -- Freeze already used this week: missing a day starts again.
  perform pg_temp.set_streak(b, 9, streak_today() - 2, streak_today() - 1);
  res := streak_of(b);
  perform pg_temp.check((res->>'current')::int = 0 and not (res->>'alive')::boolean, 'freeze already used: the streak is broken');
  res := streak_touch(b, 'game');
  perform pg_temp.check((res->>'current')::int = 1 and not (res->>'froze')::boolean, '... and starts again from 1');

  -- A freeze used last week doesn't count against this one.
  perform pg_temp.set_streak(b, 9, streak_today() - 2, streak_today() - 9);
  res := streak_touch(b, 'game');
  perform pg_temp.check((res->>'current')::int = 10 and (res->>'froze')::boolean, 'last week''s freeze: this week''s is still there');

  -- Two days missed: starts again (best kept).
  perform pg_temp.set_streak(b, 12, streak_today() - 3);
  res := streak_of(b);
  perform pg_temp.check((res->>'current')::int = 0 and (res->>'best')::int = 12, 'two days missed: broken, best kept');
  res := streak_touch(b, 'game');
  perform pg_temp.check((res->>'current')::int = 1 and (res->>'best')::int = 12, '... starts again from 1');
end $$;

-- ============================================================ who doesn't count
select pg_temp.check(streak_touch(pg_temp.uid('st3@streak.test'), 'game') is null
  and not exists (select 1 from streak_days where user_id = pg_temp.uid('st3@streak.test')), 'paused accounts don''t count');
select pg_temp.check(streak_touch('00000000-0000-0000-0000-00000000b07a', 'game') is null, 'the bot doesn''t count');

-- ============================================================ what counts on its own
do $$
declare d uuid := pg_temp.uid('st4@streak.test'); e uuid := pg_temp.uid('st5@streak.test'); f uuid := pg_temp.uid('st6@streak.test');
        r bigint := (select max(id) from rounds); q bigint; x0 int;
begin
  -- Joining a game: +10 XP and the day (+5 XP).
  x0 := pg_temp.xp(d);
  insert into entries (round_id, user_id, role) values (r, d, 'seeker');
  perform pg_temp.check(pg_temp.xp(d) = x0 + 15 and (select action from streak_days where user_id = d and day = streak_today()) = 'game',
                        'joining a game: +10 XP and a streak day (+5 XP)');
  -- Finishing a side quest: +10 XP and the day.
  x0 := pg_temp.xp(e);
  insert into quests (user_id, quest_key, source, progress, expires_at)
  values (e, (select key from quest_catalog limit 1), 'seat', '[0]', now() + interval '1 hour') returning id into q;
  update quests set status = 'done', completed_at = now() where id = q;
  perform pg_temp.check(pg_temp.xp(e) = x0 + 15 and (select action from streak_days where user_id = e and day = streak_today()) = 'quest',
                        'finishing a side quest: +10 XP and a streak day');
  update quests set status = 'expired' where id = q;
  perform pg_temp.check(pg_temp.xp(e) = x0 + 15, 'a quest changing again gives nothing more');
  -- Giving mint: the giver's day.
  update profiles set seeker_rounds = greatest(seeker_rounds, 1) where id = f;
  perform pg_temp.set_coins(f, 500);
  perform give_coins(f, d, 20);
  perform pg_temp.check((select action from streak_days where user_id = f and day = streak_today()) = 'gift',
                        'giving mint: a streak day for the giver');
end $$;

-- ============================================================ levels
select pg_temp.check(level_need(1) = 15 and level_need(19) = 15 and level_need(20) = 30 and level_need(21) = 35 and level_need(99) = 425,
  'XP per level: 15 up to level 20, then 30 and 5 more each level (425 at 99)');
select pg_temp.check(level_cost(1) = 10 and level_cost(19) = 190 and level_cost(20) = 250 and level_cost(99) = 4200,
  'mint per level: 10 × level up to 20, then 50 × (level − 15)');
select pg_temp.check((select sum(level_cost(l)) from generate_series(1, 19) l) = 1900
  and (select sum(level_need(l)) from generate_series(1, 19) l) = 285, 'level 20 takes 285 XP and 1,900 mint in all');
do $$
declare a uuid := pg_temp.uid('st5@streak.test'); res jsonb; burn0 numeric;
begin
  update profiles set level = 1, level_xp = 10 where id = a;
  perform pg_temp.set_coins(a, 1000);
  res := level_info(a);
  perform pg_temp.check((res->>'xp')::int = 10 and (res->>'next_xp')::int = 15 and (res->>'next_cost')::numeric = 10
                        and not (res->>'can_upgrade')::boolean and not (res->>'max')::boolean
                        and (res->>'xp_game')::int = 10 and (res->>'xp_quest')::int = 10 and (res->>'xp_streak')::int = 5,
                        'level info: 10 of 15 XP, 10 mint, not yet');
  perform pg_temp.fails('needs XP first', 'Earn 5 more XP', format('select upgrade_level(%L)', a));
  update profiles set level_xp = 40 where id = a;
  burn0 := (select coalesce(sum(amount), 0) from ledger where kind = 'burn' and note = 'level up');
  res := upgrade_level(a);
  perform pg_temp.check((res->>'level')::int = 2 and (res->>'cost')::numeric = 10 and pg_temp.xp(a) = 25 and pg_temp.coins(a) = 990
                        and (select coalesce(sum(amount), 0) from ledger where kind = 'burn' and note = 'level up') = burn0 + 10,
                        'level up: 10 mint burned, the spare XP carries over');
  update profiles set level = 20, level_xp = 30 where id = a;
  perform pg_temp.set_coins(a, 100);
  perform pg_temp.fails('needs the mint too', 'You need 250', format('select upgrade_level(%L)', a));
  update profiles set level = 100, level_xp = 9999 where id = a;
  perform pg_temp.set_coins(a, 100000);
  res := level_info(a);
  perform pg_temp.check((res->>'max')::boolean and not (res->>'can_upgrade')::boolean, 'level 100 is the top');
  perform pg_temp.fails('no level 101', 'You''re at the top level', format('select upgrade_level(%L)', a));
  update profiles set level = 1, level_xp = 0 where id = a;
end $$;

-- ============================================================ the refill stops growing at level 40
do $$
declare a uuid := pg_temp.uid('st4@streak.test'); b uuid := pg_temp.uid('st6@streak.test'); c uuid := pg_temp.uid('st2@streak.test');
        ga numeric; gb numeric;
begin
  perform pg_temp.set_coins(a, 0);
  perform pg_temp.set_coins(b, 0);
  perform pg_temp.set_coins(c, 0);
  update profiles set level = 40, passive_at = now() - interval '3 days' where id = a;
  update profiles set level = 70, passive_at = now() - interval '3 days' where id = b;
  update profiles set level = 5, passive_at = now() - interval '3 days' where id = c;
  ga := accrue_passive(a);
  gb := accrue_passive(b);
  perform pg_temp.check(ga = 1075 and gb = 1075, format('level 40 and level 70 both refill 1,075 a day (%s, %s)', ga, gb));
  perform pg_temp.check(accrue_passive(c) = 200, 'level 5 still refills 200 a day');
  update profiles set level = 1 where id in (a, b, c);
end $$;

-- ============================================================ running part 27 again
-- Players already playing every day start with their run of days; re-running keeps everything.
do $$
declare a uuid := pg_temp.uid('st6@streak.test'); r bigint[];
begin
  select array_agg(id order by id desc) into r from (select id from rounds order by id desc limit 8) x;
  delete from entries where user_id = a;
  -- Played today, yesterday, and 5 days in a row a fortnight ago.
  insert into entries (round_id, user_id, role, created_at) values
    (r[1], a, 'seeker', now()), (r[2], a, 'seeker', now() - interval '1 day'),
    (r[3], a, 'seeker', now() - interval '10 days'), (r[4], a, 'seeker', now() - interval '11 days'),
    (r[5], a, 'seeker', now() - interval '12 days'), (r[6], a, 'seeker', now() - interval '13 days'),
    (r[7], a, 'seeker', now() - interval '14 days');
  delete from streak_days where user_id = a;
  delete from streaks where user_id = a;
end $$;
update game_settings set value = 11 where key = 'streak_reward_3';
create temp table before_rerun as
  select (select count(*) from streaks) as n, (select sum(level_xp) from profiles) as xp, (select current from streaks where user_id = pg_temp.uid('st1@streak.test')) as cur;
\ir ../027_streaks_levels.sql
\o /dev/null
select pg_temp.check((select current from streaks where user_id = pg_temp.uid('st6@streak.test')) = 2
  and (select best from streaks where user_id = pg_temp.uid('st6@streak.test')) = 5
  and (select last_day from streaks where user_id = pg_temp.uid('st6@streak.test')) = streak_today(),
  'a player already playing every day starts with their run (2 days, best 5)');
select pg_temp.check((select count(*) from streaks) = n + 1 and (select sum(level_xp) from profiles) = xp
  and (select current from streaks where user_id = pg_temp.uid('st1@streak.test')) = cur,
  'part 27 re-run keeps every streak and XP') from before_rerun;
select pg_temp.check(setting('streak_reward_3') = 11, 'part 27 re-run keeps changed settings');
update game_settings set value = 10 where key = 'streak_reward_3';

\o
select gap_before, pg_temp.gap() as gap_after from books_st;  -- must be equal
