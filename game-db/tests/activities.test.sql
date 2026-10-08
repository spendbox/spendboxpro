\set ON_ERROR_STOP on
-- Part 19: side quests, stealing, gifts, spraying, mini game rewards.
-- Earlier tests re-run older parts (round7 re-runs part 17, which resets coin_supply_daily),
-- so run part 19 again first (it's safe to run twice).
\ir ../019_activities.sql
-- Earlier test files may set balances by hand, so check that this part adds no gap of its own.
create temp table books as select (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')) as gap_before;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
-- Prints 'ok <what>: <error>' when the call fails as it should.
create function pg_temp.fails(what text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;

insert into auth.users (email) values ('qa1@act.test'), ('qa2@act.test'), ('qa3@act.test'), ('qa4@act.test'), ('qa5@act.test');
update profiles set username = 'Tunde', seeker_rounds = 2 where email_key = 'qa1@act.test';
update profiles set username = 'Ngozi', seeker_rounds = 1 where email_key = 'qa2@act.test';
update profiles set username = 'Kemi', hider_rounds = 1 where email_key = 'qa3@act.test';
update profiles set username = 'Bayo' where email_key = 'qa4@act.test';                     -- never played
update profiles set username = 'Musa', seeker_rounds = 1 where email_key = 'qa5@act.test';
select pg_temp.set_coins(pg_temp.uid(e), 5000) from unnest(array['qa1@act.test', 'qa2@act.test', 'qa3@act.test', 'qa4@act.test']) e;
select pg_temp.set_coins(pg_temp.uid('qa5@act.test'), 10);
update game_settings set value = 0 where key in ('quest_roll_seconds_seat', 'quest_roll_seconds_npc', 'quest_roll_seconds_random', 'quest_roll_seconds_order');

-- ============================================================ gifts
do $$
declare t uuid := pg_temp.uid('qa1@act.test'); n uuid := pg_temp.uid('qa2@act.test'); k uuid := pg_temp.uid('qa3@act.test');
        b uuid := pg_temp.uid('qa4@act.test'); res jsonb;
begin
  perform pg_temp.fails('no gifting yourself', format('select give_coins(%L, %L, 10)', t, t));
  perform pg_temp.fails('no gifting the bot', format('select give_coins(%L, %L, 10)', t, '00000000-0000-0000-0000-00000000b07a'));
  perform pg_temp.fails('whole coins only', format('select give_coins(%L, %L, 1.5)', t, n));
  perform pg_temp.fails('not zero', format('select give_coins(%L, %L, 0)', t, n));
  perform pg_temp.fails('at most 10,000', format('select give_coins(%L, %L, 10001)', t, n));
  perform pg_temp.fails('new players can''t give yet', format('select give_coins(%L, %L, 10)', b, n));
  perform pg_temp.fails('not more than you have', format('select give_coins(%L, %L, 6000)', t, n));
  update profiles set frozen = true where id = n;
  perform pg_temp.fails('frozen players can''t receive', format('select give_coins(%L, %L, 10)', t, n));
  perform pg_temp.fails('frozen players can''t give', format('select give_coins(%L, %L, 10)', n, t));
  update profiles set frozen = false where id = n;

  res := give_coins(t, n, 100, '  thanks   for the   tip  ');
  raise notice 'gift 100: amount % to % balance % left today %', res->>'amount', res->>'to', res->>'balance', res->>'left_today';
  raise notice 'ngozi now has %', (select coins from profiles where id = n);
  raise notice 'ledger: %', (select string_agg(kind || ' ' || amount || ' (' || note || ')', ', ' order by id) from ledger where user_id in (t, n) and kind like 'gift%');
  raise notice 'ngozi told: %', (select body from notifications where user_id = n and kind = 'gift' order by id desc limit 1);

  -- Same person, capped per day.
  update game_settings set value = 300 where key = 'gift_pair_daily_max';
  perform pg_temp.fails('pair cap (100 + 250 > 300)', format('select give_coins(%L, %L, 250)', t, n));
  perform give_coins(t, n, 200);
  update game_settings set value = 10000 where key = 'gift_pair_daily_max';
  -- Everyone together, capped per day (300 given so far).
  update game_settings set value = 500 where key = 'gift_daily_max';
  perform pg_temp.fails('daily cap (300 + 250 > 500)', format('select give_coins(%L, %L, 250)', t, k));
  res := give_coins(t, k, 200);
  raise notice 'up to the daily cap: left today %', res->>'left_today';
  update game_settings set value = 20000 where key = 'gift_daily_max';
end $$;

-- ============================================================ spraying
do $$
declare t uuid := pg_temp.uid('qa1@act.test'); n uuid := pg_temp.uid('qa2@act.test'); k uuid := pg_temp.uid('qa3@act.test');
        b uuid := pg_temp.uid('qa4@act.test'); res jsonb; before numeric;
begin
  perform pg_temp.fails('spray at least 10', format('select spray_coins(%L, array[%L]::uuid[], 7)', k, n));
  perform pg_temp.fails('spray at most 500', format('select spray_coins(%L, array[%L]::uuid[], 501)', k, n));
  perform pg_temp.fails('nobody to spray', format('select spray_coins(%L, array[%L, %L]::uuid[], 50)', k, k, '00000000-0000-0000-0000-00000000b07a'));
  select coins into before from profiles where id = k;
  -- Kemi sprays 100 over Tunde, Ngozi and Bayo (plus herself and the bot, who are skipped).
  res := spray_coins(k, array[t, n, b, k, '00000000-0000-0000-0000-00000000b07a']::uuid[], 100);
  raise notice 'spray split: % (total %)', (select string_agg(x->>'coins', '+' order by (x->>'coins')::numeric desc) from jsonb_array_elements(res->'shares') x),
    (select sum((x->>'coins')::numeric) from jsonb_array_elements(res->'shares') x);
  raise notice 'kemi paid %', before - (select coins from profiles where id = k);
  raise notice 'spray ledger rows: % sent, % received', (select count(*) from ledger where user_id = k and kind = 'spray_sent'),
    (select count(*) from ledger where user_id in (t, n, b) and kind = 'spray_received');
  raise notice 'bayo told: %', (select body from notifications where user_id = b and kind = 'spray' order by id desc limit 1);
end $$;

-- ============================================================ side quests
do $$
declare t uuid := pg_temp.uid('qa1@act.test'); n uuid := pg_temp.uid('qa2@act.test'); res jsonb; q bigint; paid numeric;
begin
  update game_settings set value = 0 where key = 'quest_chance_seat';
  raise notice 'no luck sitting: %', offer_quest(t, 'seat');
  update game_settings set value = 1 where key in ('quest_chance_seat', 'quest_chance_npc');
  perform pg_temp.fails('unknown source', format('select offer_quest(%L, %L)', t, 'magic'));

  -- A regular hands Tunde the courier quest: give 50 coins to anyone (the server counts it).
  res := offer_quest(t, 'npc', array['courier']);
  raise notice 'offered: % (%)', res->>'title', res->>'role';
  q := (res->>'id')::bigint;
  raise notice 'one quest at a time: %', offer_quest(t, 'seat');
  paid := (select coins from profiles where id = t);
  perform give_coins(t, n, 50);
  raise notice 'courier done: %, reward paid % (balance change %)', (select status from quests where id = q),
    (select reward from quests where id = q), (select coins from profiles where id = t) - paid;
  res := quest_progress(t, q, 0, 1);
  raise notice 'reporting again pays nothing: applied %, reward %', res->>'applied', res->>'reward';
  raise notice 'paid once: % quest_reward rows', (select count(*) from ledger where user_id = t and kind = 'quest_reward');
  raise notice 'tunde told: %', (select body from notifications where user_id = t and kind = 'quest' order by id desc limit 1);
  raise notice 'no quest left to show: %', my_quest(t);

  -- The thief quest: visit 2 places, sit 30 seconds, then steal.
  res := offer_quest(t, 'seat', array['thief']);
  q := (res->>'id')::bigint;
  raise notice 'offered: %, targets %', res->>'title', my_quest(t)->'targets';
  perform pg_temp.fails('bad step', format('select quest_progress(%L, %s, 5, 1)', t, q));
  perform pg_temp.fails('not your quest', format('select quest_progress(%L, %s, 0, 1)', n, q));
  res := quest_progress(t, q, 0, 1);
  raise notice 'visit 1: applied %', res->>'applied';
  res := quest_progress(t, q, 0, 1);
  raise notice 'too fast: applied %', res->>'applied';
  update quests set reports = jsonb_build_object('0', extract(epoch from now()) - 5) where id = q;
  res := quest_progress(t, q, 0, 9);
  raise notice 'a few seconds later (asked for 9): applied %, progress %', res->>'applied', res->'quest'->'progress';
  res := quest_progress(t, q, 1, 30);
  raise notice 'sat 30 s straight after starting: only % counted', res->>'applied';
  update quests set started_at = now() - interval '40 seconds', reports = reports - '1' where id = q;
  res := quest_progress(t, q, 1, 30);
  raise notice '40 s later: progress %, completed %, reward %', res->'quest'->'progress', res->>'completed', res->>'reward';
  raise notice 'steal unlocked: %, until set %', res->'quest'->>'action', (res->'quest'->>'actionUntil') is not null;
  raise notice 'still shown (move waiting): %', my_quest(t)->>'key';

  -- Third quest of the day is the last.
  update game_settings set value = 3 where key = 'quests_per_day';
  res := offer_quest(n, 'seat');
  raise notice 'ngozi gets one: %', res is not null;
  perform quest_drop(n);
  perform offer_quest(n, 'seat');
  perform quest_drop(n);
  perform offer_quest(n, 'seat');
  perform quest_drop(n);
  raise notice 'fourth quest today: %', offer_quest(n, 'seat');
  raise notice 'ngozi quests today: %', (select count(*) from quests where user_id = n);
end $$;

-- ============================================================ stealing
do $$
declare t uuid := pg_temp.uid('qa1@act.test'); n uuid := pg_temp.uid('qa2@act.test'); k uuid := pg_temp.uid('qa3@act.test');
        m uuid := pg_temp.uid('qa5@act.test'); res jsonb; before_t numeric; before_k numeric; q bigint;
begin
  perform pg_temp.fails('no steal without the quest', format('select quest_steal(%L, %L)', n, k));
  perform pg_temp.fails('not from yourself', format('select quest_steal(%L, %L)', t, t));
  perform pg_temp.fails('not from the bot', format('select quest_steal(%L, %L)', t, '00000000-0000-0000-0000-00000000b07a'));
  perform pg_temp.fails('nothing worth taking (10 coins)', format('select quest_steal(%L, %L)', t, m));
  select coins into before_t from profiles where id = t;
  select coins into before_k from profiles where id = k;
  res := quest_steal(t, k);
  raise notice 'stole between 1%% and 5%% (at most 100): %', (res->>'amount')::numeric between greatest(1, floor(before_k * 0.01)) and least(100, floor(before_k * 0.05));
  raise notice 'coins moved exactly: %', (select coins from profiles where id = t) - before_t = (res->>'amount')::numeric
    and before_k - (select coins from profiles where id = k) = (res->>'amount')::numeric;
  raise notice 'ledger kinds: %', (select string_agg(kind, ', ' order by id) from ledger where user_id in (t, k) and kind in ('steal', 'stolen'));
  raise notice 'kemi told: %', (select body like 'Tunde was on a Thief quest and stole%' from notifications where user_id = k and kind = 'stolen' order by id desc limit 1);
  perform pg_temp.fails('the move is used up', format('select quest_steal(%L, %L)', t, n));

  -- Ngozi finishes a thief quest too, but Kemi was just robbed: safe for 24 hours.
  insert into quests (user_id, quest_key, source, status, progress, expires_at, completed_at, action, action_until)
  values (n, 'thief', 'seat', 'done', '[2, 30]', now() + interval '30 minutes', now(), 'steal', now() + interval '2 hours')
  returning id into q;
  perform pg_temp.fails('robbed in the last 24 hours', format('select quest_steal(%L, %L)', n, k));
  update steals set created_at = now() - interval '25 hours' where target_id = k;
  res := quest_steal(n, k);
  raise notice 'a day later it works: %', (res->>'amount')::numeric > 0;
  -- An expired move can't be used.
  insert into quests (user_id, quest_key, source, status, progress, expires_at, completed_at, action, action_until)
  values (k, 'thief', 'seat', 'done', '[2, 30]', now() - interval '3 hours', now() - interval '3 hours', 'steal', now() - interval '1 hour');
  perform pg_temp.fails('the move ran out of time', format('select quest_steal(%L, %L)', k, t));
end $$;

-- ============================================================ other special moves
do $$
declare t uuid := pg_temp.uid('qa1@act.test'); res jsonb;
begin
  insert into quests (user_id, quest_key, source, status, progress, expires_at, completed_at, action, action_until)
  values (t, 'bounty_hunter', 'seat', 'done', '[5]', now() + interval '30 minutes', now(), 'free_search', now() + interval '2 hours');
  update profiles set free_search_day = null where id = t;
  perform pg_temp.fails('free search already waiting', format('select quest_action(%L, %L)', t, 'free_search'));
  update profiles set free_search_day = current_date where id = t;
  res := quest_action(t, 'free_search');
  raise notice 'free search: %, free again: %', res->>'kind', (select free_search_day is null from profiles where id = t);
  perform pg_temp.fails('used up', format('select quest_action(%L, %L)', t, 'free_search'));
  perform pg_temp.fails('no hint without the quest', format('select quest_action(%L, %L)', t, 'hint'));
  perform pg_temp.fails('unknown move', format('select quest_action(%L, %L)', t, 'teleport'));
end $$;

-- ============================================================ mini game rewards
do $$
declare t uuid := pg_temp.uid('qa1@act.test'); res jsonb; g text; before numeric;
begin
  perform pg_temp.fails('unknown game', format('select claim_activity_reward(%L, %L, 10)', t, 'chess'));
  perform pg_temp.fails('impossible score', format('select claim_activity_reward(%L, %L, 61)', t, 'archery'));
  perform pg_temp.fails('negative score', format('select claim_activity_reward(%L, %L, -1)', t, 'archery'));
  res := claim_activity_reward(t, 'archery', 10);
  raise notice 'low score: % coins (%)', res->>'coins', res->>'reason';
  res := claim_activity_reward(t, 'archery', 60);
  raise notice 'straight after: % coins (%)', res->>'coins', res->>'reason';
  update game_settings set value = 0 where key in ('activity_any_cooldown_seconds', 'activity_game_cooldown_seconds');
  select coins into before from profiles where id = t;
  res := claim_activity_reward(t, 'archery', 30);  raise notice 'archery 30: % coins', res->>'coins';
  res := claim_activity_reward(t, 'archery', 55);  raise notice 'archery 55: % coins', res->>'coins';
  res := claim_activity_reward(t, 'trivia', 7);    raise notice 'trivia 7/7: % coins', res->>'coins';
  res := claim_activity_reward(t, 'rps', 1);       raise notice 'rps win: % coins, % left today', res->>'coins', res->>'left_today';
  res := claim_activity_reward(t, 'dance', 675);   raise notice 'dance 675: % coins, % left today', res->>'coins', res->>'left_today';
  res := claim_activity_reward(t, 'darts', 300);   raise notice 'sixth game: % coins (%)', res->>'coins', res->>'reason';
  raise notice 'paid in total: % (ledger %)', (select coins from profiles where id = t) - before,
    (select sum(amount) from ledger where user_id = t and kind = 'activity_reward');
  update game_settings set value = 15 where key = 'activity_any_cooldown_seconds';
  update game_settings set value = 60 where key = 'activity_game_cooldown_seconds';
end $$;

-- ============================================================ tidy up and check the books
update game_settings set value = 0.35 where key = 'quest_chance_seat';
update game_settings set value = 0.6 where key = 'quest_chance_npc';
update game_settings set value = 60 where key = 'quest_roll_seconds_seat';
update game_settings set value = 20 where key = 'quest_roll_seconds_npc';
update game_settings set value = 120 where key = 'quest_roll_seconds_random';
update game_settings set value = 60 where key = 'quest_roll_seconds_order';
select (select sum(created) from coin_supply_daily) > 0 as created_counted,
       (select coalesce(sum(amount), 0) from ledger where kind in ('gift_sent', 'gift_received', 'spray_sent', 'spray_received', 'steal', 'stolen')) as transfers_net_zero;
select gap_before, (select sum(created) - sum(burned) from coin_supply_daily) - ((select sum(coins+bonus_coins) from profiles) + (select value from game_state where key='carry') + (select coalesce(sum(pool),0) from rounds where status <> 'done')) as gap_after from books;  -- must be equal
