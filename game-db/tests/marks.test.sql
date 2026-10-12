\set ON_ERROR_STOP on
-- Part 52: marks on the map: writing, reactions, votes to take down, paid trees and chipping in, time capsules.

\ir ../052_marks.sql
\ir ../052_marks.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
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


insert into auth.users (email) values ('m1@marks.test'), ('m2@marks.test'), ('m3@marks.test'), ('m4@marks.test'), ('m5@marks.test'), ('m6@marks.test');

do $$
declare
  a uuid := pg_temp.uid('m1@marks.test');
  voters uuid[] := array[pg_temp.uid('m2@marks.test'), pg_temp.uid('m3@marks.test'), pg_temp.uid('m4@marks.test'), pg_temp.uid('m5@marks.test'), pg_temp.uid('m6@marks.test')];
  b uuid := pg_temp.uid('m2@marks.test');
  w bigint;
  t bigint;
  c bigint;
  it bigint;
  v jsonb;
  u uuid;
begin
  perform life_start(a, 'lagos');
  perform life_start(b, 'lagos');
  update profiles set coins = 10000 where id in (a, b);

  -- Writing on a wall: free, the author's name on it, near you.
  w := mark_place(a, 'lagos', 10, 10, 'writing', 'Yaba boys run this street', '#e03131', null, 'A wall in Yaba', 0, 0, null, null);
  v := marks_near(b, 'lagos', 0, 20, 0, 20);
  perform pg_temp.check(jsonb_array_length(v) = 1 and v->0->>'body' = 'Yaba boys run this street', 'writing on the wall');
  perform pg_temp.fails('not empty', 'empty', format('select mark_place(%L, %L, 1, 1, %L, %L, null, null, null, 0, 0, null, null)', a, 'lagos', 'writing', ' '));

  -- Reactions: one each, the author told once, the same again takes it back.
  perform mark_react(b, w, 'laugh');
  perform pg_temp.check((marks_near(a, 'lagos', 0, 20, 0, 20)->0->'reactions'->>'laugh')::int = 1, 'a laugh');
  perform pg_temp.check(marks_liked(a) = 1, 'it counts for reputation');
  perform mark_react(b, w, 'laugh');
  perform pg_temp.check(marks_liked(a) = 0, 'taken back');

  -- Five votes take it down: gone from the map, the author loses reputation.
  perform pg_temp.fails('not your own', 'own', format('select mark_vote(%L, %L)', a, w));
  foreach u in array voters loop perform mark_vote(u, w); end loop;
  perform pg_temp.check((select removed_at is not null from marks where id = w), 'voted down');
  perform pg_temp.check(jsonb_array_length(marks_near(b, 'lagos', 0, 20, 0, 20)) = 0 and (select rep_penalty from lives where user_id = a) = 3, 'gone, reputation lost');

  -- A tree: paid, stands 30 days, others can chip in for more.
  t := mark_place(a, 'lagos', 12, 12, 'tree', 'For Mama', null, null, null, 20, 30, null, null);
  perform pg_temp.check((select coins from profiles where id = a) = 9980, 'paid for the tree');
  perform mark_chip_in(b, t, 10, 15);
  perform pg_temp.check((select expires_at from marks where id = t) > now() + interval '44 days', 'standing longer');

  -- A time capsule with a thing in it: hidden until it opens; the first to open it gets the thing.
  it := item_get(a, 'novel', 'Novel', 'book', 4, '{"mind":0.3}', 'bought', 4);
  c := mark_place(a, 'lagos', 14, 14, 'capsule', 'Hello from 2026!', null, null, null, 5, 0, now() + interval '1 day', it);
  perform pg_temp.check((select x->>'body' from jsonb_array_elements(marks_near(b, 'lagos', 0, 20, 0, 20)) x where (x->>'id')::bigint = c) is null, 'the message is hidden');
  perform pg_temp.fails('not before it opens', 'not_yet', format('select capsule_open(%L, %L)', b, c));
  update marks set opens_at = now() - interval '1 minute' where id = c;
  perform pg_temp.check(capsule_open(b, c) = 'Novel', 'opened: a novel inside');
  perform pg_temp.check((select owner from items where id = it) = b, 'and it is hers');
  perform pg_temp.check(capsule_open(a, c) is null, 'only once');
end $$;
