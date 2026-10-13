\set ON_ERROR_STOP on
-- Part 72: the first steps' rewards: paid once each, only when it really happened, only for new lives.
\ir ../071_chat_read.sql
\ir ../072_first_steps.sql
\ir ../072_first_steps.sql
\o /dev/null
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('n@fs.test'), ('o@fs.test'), ('f@fs.test');
update profiles set username = 'Nkem' where email_key = 'n@fs.test';
update profiles set username = 'Old' where email_key = 'o@fs.test';
update profiles set username = 'Femi' where email_key = 'f@fs.test';
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key like '%@fs.test';
update lives set started_at = now() - interval '30 days' where user_id = pg_temp.uid('o@fs.test');
update profiles set coins = 100 where email_key like '%@fs.test';
do $$
declare
  n uuid := pg_temp.uid('n@fs.test');
  o uuid := pg_temp.uid('o@fs.test');
  f uuid := pg_temp.uid('f@fs.test');
  r bigint := (select id from rounds order by id desc limit 1);
  v jsonb;
begin
  if r is null then
    insert into rounds (status, join_ends_at, seek_ends_at, finished_at, tile_count) values ('done', now(), now(), now(), 400) returning id into r;
  end if;
  v := first_steps_check(n, 3.33);
  perform pg_temp.check(not (v->>'hi')::boolean and jsonb_array_length(v->'paid') = 0, 'nothing done: nothing paid');
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, body) values (r, n, 'Nkem', 'watcher', f, 'Femi', 'hi!');
  v := first_steps_check(n, 3.33);
  perform pg_temp.check((v->>'hi')::boolean and v->'paid' = '["hi"]'::jsonb, 'said hi: paid for it');
  perform pg_temp.check((select coins from profiles where id = n) = 103.33, 'the reward is in');
  v := first_steps_check(n, 3.33);
  perform pg_temp.check(jsonb_array_length(v->'paid') = 0 and (select coins from profiles where id = n) = 103.33, 'paid once only');
  perform pg_temp.check(not (v->>'challenge')::boolean and not (v->>'out')::boolean, 'the others not done yet');
  v := first_steps_check(n, 9999);
  perform pg_temp.check((v->>'reward')::numeric = 20, 'the reward is capped');
  -- An old life: marked done, never paid.
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, body) values (r, o, 'Old', 'watcher', f, 'Femi', 'hello');
  v := first_steps_check(o, 3.33);
  perform pg_temp.check((v->>'hi')::boolean and (select coins from profiles where id = o) = 100, 'an old life is not paid');
end $$;
\o
\echo 'first steps: all ok'
