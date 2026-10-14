\set ON_ERROR_STOP on
-- Part 86: Town Hall replies, reactions, photos, deleting (yours for everyone; others' hidden,
-- gone at 3), and nothing over 24 hours old. Run after town-hall.test.sql.
\ir ../086_town_hall_more.sql
\ir ../086_town_hall_more.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('t1@th.test'), ('t2@th.test'), ('t3@th.test'), ('t4@th.test');
update profiles set username = 'Town' || split_part(email_key, '@', 1) where email_key like 't_@th.test';
do $$
declare
  a uuid := (select id from profiles where email_key = 't1@th.test');
  b uuid := (select id from profiles where email_key = 't2@th.test');
  c uuid := (select id from profiles where email_key = 't3@th.test');
  d uuid := (select id from profiles where email_key = 't4@th.test');
  m1 chat_messages;
  m2 chat_messages;
  f jsonb;
  r jsonb;
begin
  if not exists (select 1 from rounds) then insert into rounds default values; end if;
  m1 := town_hall_post(a, 'lagos', 'Who wants suya?', null, null);
  m2 := town_hall_post(b, 'lagos', 'Me!', m1.id, null);
  perform pg_temp.check(m2.reply_to = m1.id, 'a reply remembers what it answers');
  perform town_hall_post(c, 'lagos', null, null, 'town/' || c || '/abcdefgh12.jpg');
  perform pg_temp.check((select image_path from chat_messages where sender_id = c and room = 'town:lagos' order by id desc limit 1) = 'town/' || c || '/abcdefgh12.jpg', 'a photo goes with its message');
  perform town_hall_react(b, m1.id, '😂');
  perform town_hall_react(c, m1.id, '😂');
  perform town_hall_react(c, m1.id, '🔥');
  f := town_hall_feed('lagos');
  perform pg_temp.check((select (x->'reactions'->>'😂')::int = 1 and (x->'reactions'->>'🔥')::int = 1 from jsonb_array_elements(f) x where (x->>'id')::bigint = m1.id), 'one reaction each, changed not added');
  perform pg_temp.check((select x->'reply'->>'name' from jsonb_array_elements(f) x where (x->>'id')::bigint = m2.id) = (select username from profiles where id = a), 'the feed shows what a reply answers');
  r := town_hall_delete(b, m1.id);
  perform pg_temp.check(r->>'result' = 'hidden' and exists (select 1 from chat_messages where id = m1.id), 'someone else''s message: hidden for you only');
  perform town_hall_delete(c, m1.id);
  r := town_hall_delete(d, m1.id);
  perform pg_temp.check(r->>'result' = 'removed' and not exists (select 1 from chat_messages where id = m1.id), 'three people delete it: gone for everyone');
  r := town_hall_delete(b, m2.id);
  perform pg_temp.check(r->>'result' = 'deleted' and not exists (select 1 from chat_messages where id = m2.id), 'your own: gone at once');
  update chat_messages set created_at = now() - interval '25 hours' where sender_id = c and room = 'town:lagos';
  perform pg_temp.check(not exists (select 1 from jsonb_array_elements(town_hall_feed('lagos')) x where (x->>'from')::uuid = c), 'nothing over 24 hours old is shown');
  perform pg_temp.check((select count(*) from town_hall_expired(10)) >= 1, 'and it''s listed for removal');
  perform pg_temp.check(people_on_map(a, 'lagos', -9999, 9999, -9999, 9999, 50) is not null, 'people on the map still load');
end $$;
\o
\echo 'town hall, more: all ok'
