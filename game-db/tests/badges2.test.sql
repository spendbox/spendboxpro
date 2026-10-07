\set ON_ERROR_STOP on
-- Part 11: the 50 hard badges. Runs after game.test.sql and round4.test.sql.
-- Builds finished rounds by hand (no ticking), then hands out badges with award_badges().
do $$
declare
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); k3 uuid := gen_random_uuid();
  h1 uuid := gen_random_uuid(); h7 uuid := gen_random_uuid(); h8 uuid := gen_random_uuid();
  h uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                    gen_random_uuid(), gen_random_uuid()];
  x uuid;
  rid bigint;
  prev bigint[] := '{}';
  t timestamptz;
  n int;
  want text;
begin
  -- Players: three hunters (k1 is level 20), and hiders (h[1] is level 12).
  insert into profiles (id, username, email_key, level) values
    (k1, 'Kat', 'kat@t.com', 20), (k2, 'Kit', 'kit@t.com', 10), (k3, 'Kip', 'kip@t.com', 1),
    (h1, 'Hana', 'hana@t.com', 3), (h7, 'Dex', 'dex@t.com', 3), (h8, 'Rio', 'rio@t.com', 20);
  for i in 1..7 loop
    insert into profiles (id, username, email_key, level) values (h[i], 'hider' || i, 'hider' || i || '@t.com', case when i = 1 then 12 else 1 end);
  end loop;

  -- Four earlier rounds: Hana hides and survives each time, Kat finds the bot each time.
  for i in 1..4 loop
    t := now() - make_interval(hours => 5 - i);
    insert into rounds (status, join_ends_at, seek_ends_at, finished_at, tile_count)
      values ('done', t - interval '60 minutes', t, t, 400) returning id into rid;
    prev := prev || rid;
    insert into entries (round_id, user_id, role, tile) values (rid, h1, 'hider', 5), (rid, k1, 'seeker', null);
    insert into entries (round_id, user_id, role, tile, caught, caught_by) values (rid, v_bot, 'hider', 9, true, k1);
  end loop;

  -- The big round.
  t := now();
  insert into rounds (status, join_ends_at, seek_ends_at, finished_at, tile_count, searched_count)
    values ('done', t - interval '60 minutes', t, t, 400, 310) returning id into rid;
  insert into entries (round_id, user_id, role) values (rid, k1, 'seeker'), (rid, k2, 'seeker'), (rid, k3, 'seeker');
  -- Hana: shield saved her, never moved, swept 3 times, walked into a trap; still hidden.
  insert into entries (round_id, user_id, role, tile, shield_bought, shield_saved, last_swept_at)
    values (rid, h1, 'hider', 5, true, true, t - interval '5 minutes');
  insert into notifications (user_id, round_id, kind, body) values
    (h1, rid, 'swept', 's'), (h1, rid, 'swept', 's'), (h1, rid, 'swept', 's'), (h1, rid, 'trapped', 't');
  -- Dex: placed a decoy that Kit searched and Kip swept over; Dex got away.
  insert into entries (round_id, user_id, role, tile, decoy_used) values (rid, h7, 'hider', 50, true);
  insert into decoys (round_id, user_id, tile, created_at, found_by, found_at, outcome)
    values (rid, h7, 60, t - interval '50 minutes', k2, t - interval '10 minutes', 'explode');
  insert into searches (round_id, tile, seeker_id, cost, caught, decoys, created_at) values (rid, 60, k2, 1, 0, 1, t - interval '10 minutes');
  insert into sweeps (round_id, seeker_id, tile, radius, found, created_at) values (rid, k3, 60, 1, true, t - interval '20 minutes');
  -- Rio: caught early, paid to respawn, then got away.
  insert into entries (round_id, user_id, role, tile, respawned, respawned_at) values (rid, h8, 'hider', 70, true, t - interval '40 minutes');
  -- Kat catches hiders 1-5 (hider1 is level 12) with single searches, the last one 30 seconds before the end.
  for i in 1..5 loop
    insert into entries (round_id, user_id, role, tile, caught, caught_by) values (rid, h[i], 'hider', 100 + i, true, k1);
    insert into searches (round_id, tile, seeker_id, cost, caught, created_at)
      values (rid, 100 + i, k1, 1, 1, t - make_interval(secs => case when i = 5 then 30 else 600 * i end));
  end loop;
  -- Kat also finds the bot (3rd round in a row of the bot's last 3 games... and more).
  insert into entries (round_id, user_id, role, tile, caught, caught_by) values (rid, v_bot, 'hider', 9, true, k1);
  insert into searches (round_id, tile, seeker_id, cost, caught, created_at) values (rid, 9, k1, 1, 1, t - interval '15 minutes');
  -- Kit's big search: 9 tiles at once, catching hiders 6 and 7.
  for i in 0..8 loop
    insert into searches (round_id, tile, seeker_id, cost, caught, area, created_at)
      values (rid, 200 + i, k2, 1, case when i < 2 then 1 else 0 end, true, t - interval '7 minutes');
  end loop;
  insert into entries (round_id, user_id, role, tile, caught, caught_by) values
    (rid, h[6], 'hider', 200, true, k2), (rid, h[7], 'hider', 201, true, k2);
  -- Coins: Kat wins 1,200 this round (5,000 in all); four others win a little this week.
  insert into ledger (user_id, round_id, kind, amount) values (k1, rid, 'catch_reward', 1200), (k1, prev[1], 'catch_reward', 3800),
    (k2, rid, 'catch_reward', 10), (k3, rid, 'pool_seeker', 10), (h1, rid, 'pool_hider', 10), (h7, rid, 'pool_hider', 10),
    (k1, rid, 'level_bonus', 1000);
  -- The bot looks like it deserves things too (swept 3 times while hiding in another round) — it must get nothing.
  insert into notifications (user_id, round_id, kind, body) values (v_bot, prev[1], 'swept', 's'), (v_bot, prev[1], 'swept', 's'), (v_bot, prev[1], 'swept', 's');
  update entries set caught = false, caught_by = null where round_id = prev[1] and user_id = v_bot;

  for i in 1..4 loop perform award_badges(prev[i]); end loop;
  n := award_badges(rid);
  raise notice 'badges handed out in the big round: %', n;
  raise notice 'Kat: %', (select string_agg(badge, ', ' order by badge) from badges where user_id = k1 and round_id = rid);
  raise notice 'Kit: %', (select string_agg(badge, ', ' order by badge) from badges where user_id = k2 and round_id = rid);
  raise notice 'Kip: %', (select string_agg(badge, ', ' order by badge) from badges where user_id = k3 and round_id = rid);
  raise notice 'Hana: %', (select string_agg(badge, ', ' order by badge) from badges where user_id = h1 and round_id = rid);
  raise notice 'Dex: %', (select string_agg(badge, ', ' order by badge) from badges where user_id = h7 and round_id = rid);
  raise notice 'Rio: %', (select string_agg(badge, ', ' order by badge) from badges where user_id = h8 and round_id = rid);

  -- What must be there (career badges may have come in an earlier round)...
  for x, want in select * from (values
      (k1, 'hunting_party'), (k1, 'giant_slayer'), (k1, 'buzzer_beater'), (k1, 'perfect_aim'), (k1, 'bot_nemesis'),
      (k1, 'jackpot'), (k1, 'level_5'), (k1, 'level_10'), (k1, 'level_20'), (k1, 'coins_5k'), (k1, 'bounty_hunter'),
      (k1, 'weekly_champ'), (k2, 'wide_net'), (h1, 'untouchable'), (h1, 'radar_proof'), (h1, 'slippery'), (h1, 'turtle'),
      (h1, 'plain_sight'), (h7, 'gotcha'), (h7, 'master_disguise'), (h7, 'smoke_mirrors'), (h8, 'phoenix')) v(who, b) loop
    if not exists (select 1 from badges where user_id = x and badge = want) then
      raise exception 'missing badge % for %', want, (select username from profiles where id = x);
    end if;
  end loop;
  if exists (select 1 from badges where user_id = k3 and badge in ('gotcha', 'master_disguise')) then
    raise exception 'Kip swept the decoy: the decoy badge is Dex''s, not his'; end if;
  -- ...and what must not.
  if exists (select 1 from badges where user_id = k1 and badge in ('level_30', 'titan_slayer', 'unstoppable', 'exterminator', 'coins_25k')) then
    raise exception 'Kat got a badge she has not earned'; end if;
  if exists (select 1 from badges where user_id = h1 and badge in ('phantom', 'statue', 'needle_haystack')) then
    raise exception 'Hana got a badge she has not earned'; end if;
  if exists (select 1 from badges where user_id = v_bot) then raise exception 'the bot must never get badges'; end if;
  -- Career badges only once; awarding again adds nothing.
  if award_badges(rid) <> 0 then raise exception 'awarding a round twice should add nothing'; end if;
  update rounds set finished_at = now() + interval '1 minute' where id = prev[4];
  perform award_badges(prev[4]);
  if (select count(*) from badges where user_id = k1 and badge = 'level_20') <> 1 then raise exception 'Level 20 should be won once'; end if;
  if (select count(*) from badges where user_id = k1 and badge = 'weekly_champ') <> 1 then
    raise exception 'Weekly champion at most once a week'; end if;
  raise notice 'ok hard badges: % different badges handed out so far', (select count(distinct badge) from badges);
end $$;
