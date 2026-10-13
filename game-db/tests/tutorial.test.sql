\set ON_ERROR_STOP on
-- Part 80: the walkthrough's steps (name your home, say hi, win a challenge), paid once each, only
-- for what's done after the walkthrough started.
\ir ../078_home_name.sql
\ir ../080_tutorial.sql
\ir ../080_tutorial.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('t@tu.test'), ('f@tu.test');
update profiles set username = 'Tobi', coins = 0 where email_key = 't@tu.test';
update profiles set username = 'Funmi', coins = 0 where email_key = 'f@tu.test';
insert into lives (user_id, region, granted) select id, 'lagos', 0 from profiles where email_key like '%@tu.test';
do $$
declare
  t uuid := (select id from profiles where email_key = 't@tu.test');
  f uuid := (select id from profiles where email_key = 'f@tu.test');
  rw jsonb := '{"name": 13.33, "hi": 33.33, "win": 33.33}';
  v jsonb;
  c bigint;
  r bigint;
begin
  select id into r from rounds limit 1;
  if r is null then insert into rounds (status, join_ends_at, seek_ends_at, finished_at, tile_count) values ('done', now(), now(), now(), 400) returning id into r; end if;
  -- Something done before the walkthrough started doesn't count.
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, body, created_at)
    values (r, t, 'Tobi', 'watcher', f, 'Funmi', 'old hi', now() - interval '1 day');
  v := starter_room_give(t, 'lagos', 'lagos:2,2/0', '{}'::jsonb, 'Room 1', 12, false);
  v := tutorial_check(t, rw);
  perform pg_temp.check(not (v->>'name')::boolean and not (v->>'hi')::boolean and not (v->>'win')::boolean, 'nothing done yet');
  perform home_rename(t, 'lagos:2,2/0', 'Tobi Towers');
  v := tutorial_check(t, rw);
  perform pg_temp.check((v->>'name')::boolean and v->'paid' = '["name"]' and (select coins from profiles where id = t) = 13.33, 'named: paid ₦20,000');
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, body)
    values (r, t, 'Tobi', 'watcher', f, 'Funmi', 'hi!');
  v := tutorial_check(t, rw);
  perform pg_temp.check((v->>'hi')::boolean and v->'paid' = '["hi"]' and (select coins from profiles where id = t) = 46.66, 'said hi: paid ₦50,000');
  insert into challenges (host_id, region, game, stake, x, z, seed, starts_at, status, winner_id, finished_at)
    values (t, 'lagos', 'whot', 0, 1, 1, 1, now(), 'done', t, now()) returning id into c;
  insert into challenge_players (challenge_id, user_id) values (c, t), (c, f);
  v := tutorial_check(t, rw);
  perform pg_temp.check((v->>'win')::boolean and v->'paid' = '["win"]' and (select coins from profiles where id = t) = 79.99, 'won: paid ₦50,000');
  v := tutorial_check(t, rw);
  perform pg_temp.check(v->'paid' = '[]' and (select coins from profiles where id = t) = 79.99, 'never paid twice');
  v := tutorial_check(t, '{"name": 999, "hi": 999, "win": 999}');
  perform pg_temp.check((select max(reward) from tutorial_steps) <= 40, 'rewards are capped');
end $$;
\o
\echo 'tutorial: all ok'
