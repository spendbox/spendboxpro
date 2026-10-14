\set ON_ERROR_STOP on
-- Part 93: reputation from taking part (time, real conversations, kindness, people), quietly and fairly.
\ir ../093_engagement_rep.sql
\ir ../093_engagement_rep.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  v jsonb;
  k int;
begin
  insert into auth.users (id, email) values (a, a || '@t.test'), (b, b || '@t.test'), (c, c || '@t.test');
  v := engagement_parts(a);
  perform pg_temp.check((v->>'time')::int = 0 and (v->>'talk')::int = 0, 'nothing done: nothing earned');
  -- An hour a day for 30 days.
  for k in 0..29 loop insert into activity_days (user_id, day, minutes) values (a, current_date - k, 60) on conflict do nothing; end loop;
  v := engagement_parts(a);
  perform pg_temp.check((v->>'time')::int between 20 and 40, 'an hour a day for a month: time counts: ' || v::text);
  -- Spam: 200 messages to b that b never answers.
  for k in 1..200 loop insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, body) values ((select max(id) from rounds), a, 'A', 'watcher', b, 'B', 'hi'); end loop;
  v := engagement_parts(a);
  perform pg_temp.check((v->>'talk')::int = 0, 'messages nobody answers earn nothing');
  -- b writes back today: one real conversation.
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, recipient_name, body) values ((select max(id) from rounds), b, 'B', 'watcher', a, 'A', 'hello!');
  v := engagement_parts(a);
  perform pg_temp.check((v->>'talk')::int > 0, 'a conversation both ways counts');
  -- Hugs: 20 in a day only count as 5.
  for k in 1..20 loop insert into greetings (from_id, to_id, kind) values (a, c, 'hug'); end loop;
  v := engagement_parts(a);
  perform pg_temp.check((v->>'kind')::int between 1 and 10, 'greetings count, a few a day: ' || v::text);
  -- A friend.
  insert into friendships (requester, addressee, accepted_at) values (a, c, now());
  perform pg_temp.check((engagement_parts(a)->>'people')::int >= 2, 'friends count');
  -- Kept for an hour.
  v := engagement_rep(a);
  insert into friendships (requester, addressee, accepted_at) values (a, b, now());
  perform pg_temp.check(engagement_rep(a) = v, 'worked out at most once an hour');
  update rep_engagement set computed_at = now() - interval '2 hours' where user_id = a;
  perform pg_temp.check((engagement_rep(a)->>'people')::int > (v->>'people')::int, 'and again after');
  -- Old activity fades.
  delete from activity_days where user_id = c;
  for k in 0..29 loop insert into activity_days (user_id, day, minutes) values (c, current_date - 30 - k, 60) on conflict do nothing; end loop;
  perform pg_temp.check((engagement_parts(c)->>'time')::int < (engagement_parts(a)->>'time')::int / 2, 'a month away: it fades');
  -- Caps.
  for k in 0..59 loop insert into activity_days (user_id, day, minutes) values (b, current_date - k, 600) on conflict do nothing; end loop;
  perform pg_temp.check((engagement_parts(b)->>'time')::int <= 50, 'never more than 50 for time');
end $$;
\o
\echo 'engagement reputation: all ok'
