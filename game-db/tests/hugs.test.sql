\set ON_ERROR_STOP on
-- Part 28: hugs, handshakes, My gifts, thank-yous and blocking. Who can send what, the daily
-- limits, notifications, the streak, the hug quests, blocking (hugs, gifts, private messages,
-- friend requests, friendships), unblocking, running part 28 again, books, and that nothing
-- here is open to the app's clients.
-- Run part 28 again first: it must be safe to re-run.
\ir ../028_hugs_gifts.sql
-- Only the 'ok …' lines and the books check at the end are printed (query results go nowhere).
\o /dev/null

create function pg_temp.gap() returns numeric language sql as $$
  select (select sum(created) - sum(burned) from coin_supply_daily)
       - ((select sum(coins + bonus_coins) from profiles) + (select value from game_state where key = 'carry')
          + (select coalesce(sum(pool), 0) from rounds where status <> 'done')
          + (select coalesce(sum(amount), 0) from sports_bets where not settled))
$$;
create temp table books_hg as select pg_temp.gap() as gap_before;
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
create function pg_temp.fails(what text, p_code text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  if sqlerrm not like p_code || '%' then raise exception 'FAILED: % gave "%" (expected %)', what, sqlerrm, p_code; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;

insert into auth.users (email) values ('hg1@hugs.test'), ('hg2@hugs.test'), ('hg3@hugs.test'), ('hg4@hugs.test'),
                                      ('hg5@hugs.test'), ('hg6@hugs.test'), ('hg7@hugs.test');
update profiles set username = 'Qhada', seeker_rounds = 1 where email_key = 'hg1@hugs.test';
update profiles set username = 'Qhbola', seeker_rounds = 1 where email_key = 'hg2@hugs.test';
update profiles set username = 'Qhchidi' where email_key = 'hg3@hugs.test';
update profiles set username = 'Qhdami' where email_key = 'hg4@hugs.test';
update profiles set username = 'Qhefe', frozen = true where email_key = 'hg5@hugs.test';
update profiles set username = 'Qhfola' where email_key = 'hg6@hugs.test';
-- hg7 has no player name yet.

-- ============================================================ privacy
select pg_temp.check(not has_table_privilege('anon', 'public.greetings', 'select')
  and not has_table_privilege('authenticated', 'public.blocks', 'select')
  and has_table_privilege('service_role', 'public.greetings', 'insert')
  and (select relrowsecurity from pg_class where oid = 'public.greetings'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.blocks'::regclass),
  'hugs and blocks are server-only (RLS on, no access for anon or signed-in clients)');
select pg_temp.check(not has_function_privilege('authenticated', 'public.send_greeting(uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.my_gifts(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.block_player(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.thank_for(uuid,text,bigint)', 'execute'),
  'hug, gift and block functions are server-only');

-- ============================================================ hugs and handshakes
do $$
declare a uuid := pg_temp.uid('hg1@hugs.test'); b uuid := pg_temp.uid('hg2@hugs.test'); e uuid := pg_temp.uid('hg5@hugs.test');
        n uuid := pg_temp.uid('hg7@hugs.test'); res jsonb;
begin
  perform pg_temp.fails('only hugs and handshakes', 'bad_kind', format('select send_greeting(%L, %L, %L)', a, b, 'kiss'));
  perform pg_temp.fails('no hugging yourself', 'self', format('select send_greeting(%L, %L, %L)', a, a, 'hug'));
  perform pg_temp.fails('not the bot', 'target_bot', format('select send_greeting(%L, %L, %L)', a, '00000000-0000-0000-0000-00000000b07a', 'hug'));
  perform pg_temp.fails('not a paused account', 'target_frozen', format('select send_greeting(%L, %L, %L)', a, e, 'hug'));
  perform pg_temp.fails('paused accounts can''t hug', 'frozen', format('select send_greeting(%L, %L, %L)', e, a, 'hug'));
  perform pg_temp.fails('a player with no name can''t be hugged', 'unknown_target', format('select send_greeting(%L, %L, %L)', a, n, 'hug'));
  perform pg_temp.fails('or hug', 'no_name', format('select send_greeting(%L, %L, %L)', n, a, 'hug'));

  res := send_greeting(a, b, 'hug');
  perform pg_temp.check(res->>'kind' = 'hug' and res->>'to' = 'Qhbola' and (res->>'left_today')::int = 29, 'a hug: 29 left today');
  perform pg_temp.check((select body from notifications where user_id = b and kind = 'hug' order by id desc limit 1)
                        = 'Qhada gave you a hug! Open My gifts to say thank you.', 'Bola is told about the hug');
  perform pg_temp.check((select action from streak_days where user_id = a and day = streak_today()) = 'hug',
                        'a hug keeps your streak going');
  res := send_greeting(a, b, 'handshake');
  perform pg_temp.check((select body from notifications where user_id = b and kind = 'handshake' order by id desc limit 1)
                        like 'Qhada shook your hand!%', 'and about the handshake');
  perform send_greeting(a, b, 'hug');
  perform pg_temp.fails('3 a day to the same person', 'pair_cap:3', format('select send_greeting(%L, %L, %L)', a, b, 'hug'));
  update game_settings set value = 5 where key = 'hugs_per_day';
  perform send_greeting(a, pg_temp.uid('hg3@hugs.test'), 'hug');
  perform send_greeting(a, pg_temp.uid('hg4@hugs.test'), 'hug');
  perform pg_temp.fails('30 a day in all (5 here)', 'daily_cap:5', format('select send_greeting(%L, %L, %L)', a, pg_temp.uid('hg6@hugs.test'), 'hug'));
  update game_settings set value = 30 where key = 'hugs_per_day';
end $$;

-- ============================================================ my gifts and thank-yous
do $$
declare a uuid := pg_temp.uid('hg1@hugs.test'); b uuid := pg_temp.uid('hg2@hugs.test'); c uuid := pg_temp.uid('hg3@hugs.test');
        res jsonb; hug bigint; gift bigint; n0 int;
begin
  perform pg_temp.set_coins(a, 1000);
  perform give_coins(a, b, 120, 'for lunch');
  res := my_gifts(b);
  perform pg_temp.check(jsonb_array_length(res->'items') = 4 and res->'items'->0->>'kind' = 'gift'
                        and (res->'items'->0->>'amount')::numeric = 120 and res->'items'->0->>'note' = 'for lunch'
                        and res->'items'->0->>'name' = 'Qhada' and not (res->'items'->0->>'thanked')::boolean,
                        'My gifts: the mint gift (newest first), with its note');
  perform pg_temp.check((res->'totals'->>'hugs')::int = 2 and (res->'totals'->>'handshakes')::int = 1
                        and (res->'totals'->>'mint')::numeric = 120, 'totals: 2 hugs, 1 handshake, 120 mint');
  perform pg_temp.check((my_gifts(a)->>'sent_today')::int = 5 and (my_gifts(a)->>'left_today')::int = 25, 'Ada sent 5 today, 25 left');

  select id into hug from greetings where from_id = a and to_id = b and kind = 'hug' order by id limit 1;
  select id into gift from coin_gifts where from_id = a and to_id = b and kind = 'gift' order by id desc limit 1;
  n0 := (select count(*) from notifications where user_id = a and kind = 'thanks');
  res := thank_for(b, 'hug', hug);
  perform pg_temp.check(not (res->>'already')::boolean
                        and (select body from notifications where user_id = a and kind = 'thanks' order by id desc limit 1)
                            = 'Qhbola says thank you for the hug!', 'a thank-you for the hug reaches Ada');
  res := thank_for(b, 'hug', hug);
  perform pg_temp.check((res->>'already')::boolean and (select count(*) from notifications where user_id = a and kind = 'thanks') = n0 + 1,
                        'only one thank-you per hug');
  perform thank_for(b, 'gift', gift);
  perform pg_temp.check((select body from notifications where user_id = a and kind = 'thanks' order by id desc limit 1)
                        = 'Qhbola says thank you for the 120 mint!', 'and for the mint');
  perform pg_temp.check((my_gifts(b)->'items'->0->>'thanked')::boolean, 'My gifts shows it was thanked');
  perform pg_temp.fails('can''t thank for someone else''s gift', 'no_gift', format('select thank_for(%L, %L, %s)', c, 'hug', hug));
  perform pg_temp.fails('the kind has to match', 'no_gift', format('select thank_for(%L, %L, %s)', b, 'handshake', hug));
end $$;

-- ============================================================ blocking
do $$
declare a uuid := pg_temp.uid('hg1@hugs.test'); b uuid := pg_temp.uid('hg2@hugs.test'); r bigint := (select max(id) from rounds);
        res jsonb; ca numeric;
begin
  perform friend_request(a, b);
  perform friend_accept(b, a);
  perform pg_temp.check(friends_of(b)->'friends'->0->>'name' = 'Qhada', 'Ada and Bola are friends');
  perform pg_temp.fails('can''t block yourself', 'self', format('select block_player(%L, %L)', b, b));
  res := block_player(b, a);
  perform pg_temp.check((res->>'blocked')::boolean and jsonb_array_length(friends_of(b)->'friends') = 0
                        and jsonb_array_length(friends_of(a)->'friends') = 0, 'Bola blocks Ada: the friendship ends');
  perform pg_temp.check(blocked_players(b)->0->>'name' = 'Qhada' and jsonb_array_length(blocked_players(a)) = 0, 'Bola''s blocked list');
  perform pg_temp.fails('no hugs from a blocker''s blocked player', 'blocked', format('select send_greeting(%L, %L, %L)', a, b, 'handshake'));
  perform pg_temp.fails('and you can''t hug someone you blocked', 'you_blocked', format('select send_greeting(%L, %L, %L)', b, a, 'hug'));
  ca := (select coins from profiles where id = a);
  perform pg_temp.fails('no mint gifts', 'blocked', format('select give_coins(%L, %L, 10)', a, b));
  perform pg_temp.check((select coins from profiles where id = a) = ca, 'the blocked gift took nothing');
  perform pg_temp.fails('no friend requests', 'blocked', format('select friend_request(%L, %L)', a, b));
  perform pg_temp.fails('no private messages', 'blocked',
    format('insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, body) values (%s, %L, %L, %L, %L, %L, %L)',
           r, a, 'Qhada', 'watcher', b, 'Qhbola', 'hi'));
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, body) values (r, a, 'Qhada', 'watcher', 'hello everyone');
  perform pg_temp.check(true, 'public messages still go through');
  perform pg_temp.check((my_gifts(b)->'items'->0->>'blocked')::boolean, 'My gifts marks gifts from blocked players');
  res := unblock_player(b, a);
  perform pg_temp.check(not (res->>'blocked')::boolean and jsonb_array_length(blocked_players(b)) = 0, 'unblocked');
  perform send_greeting(a, pg_temp.uid('hg6@hugs.test'), 'handshake');
  perform give_coins(a, b, 10);
  perform pg_temp.check(true, 'after unblocking, gifts reach Bola again');
end $$;

-- ============================================================ hug quests
do $$
declare d uuid := pg_temp.uid('hg4@hugs.test'); q bigint; c0 numeric;
begin
  delete from quests where user_id = d and status = 'active';
  insert into quests (user_id, quest_key, source, progress, expires_at)
  values (d, 'town_hugger', 'seat', '[0]', now() + interval '1 hour') returning id into q;
  c0 := (select coins from profiles where id = d);
  perform send_greeting(d, pg_temp.uid('hg1@hugs.test'), 'hug');
  perform send_greeting(d, pg_temp.uid('hg1@hugs.test'), 'hug');
  perform send_greeting(d, pg_temp.uid('hg2@hugs.test'), 'handshake');
  perform pg_temp.check((select progress->>0 from quests where id = q) = '1', 'Town hugger: the same person twice and a handshake count once');
  perform send_greeting(d, pg_temp.uid('hg2@hugs.test'), 'hug');
  perform send_greeting(d, pg_temp.uid('hg3@hugs.test'), 'hug');
  perform pg_temp.check((select status from quests where id = q) = 'done' and (select coins from profiles where id = d) = c0 + 15,
                        'three different players hugged: quest done, +15 mint');
end $$;

-- ============================================================ running part 28 again
update game_settings set value = 4 where key = 'hugs_pair_per_day';
create temp table before_rerun as select (select count(*) from greetings) as g, (select count(*) from coin_gifts where thanked_at is not null) as t;
\ir ../028_hugs_gifts.sql
\o /dev/null
select pg_temp.check((select count(*) from greetings) = g and (select count(*) from coin_gifts where thanked_at is not null) = t,
  'part 28 re-run keeps every hug and thank-you') from before_rerun;
select pg_temp.check(setting('hugs_pair_per_day') = 4, 'part 28 re-run keeps changed settings');
update game_settings set value = 3 where key = 'hugs_pair_per_day';

\o
select gap_before, pg_temp.gap() as gap_after from books_hg;  -- must be equal
