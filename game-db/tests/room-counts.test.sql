\set ON_ERROR_STOP on
-- Part 127: who's in which room, from the minute's ping. Counting by room on a part of the map,
-- only those online, rides wherever they are, leaving a room; running the part twice.
\ir ../127_room_counts.sql
\ir ../127_room_counts.sql
\o /dev/null
insert into auth.users (email) values ('r1@rc.test'), ('r2@rc.test'), ('r3@rc.test');
update profiles set username = 'RC' || substr(email_key, 2, 1) where email_key like '%@rc.test';
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key like '%@rc.test';
update lives set seen_at = now() where user_id in (select id from profiles where email_key like '%@rc.test');
do $$
declare
  a uuid := (select id from profiles where email_key = 'r1@rc.test');
  b uuid := (select id from profiles where email_key = 'r2@rc.test');
  c uuid := (select id from profiles where email_key = 'r3@rc.test');
  v jsonb;
begin
  perform life_in_room(a, 'b:5000:g', 10, 10);
  perform life_in_room(b, 'b:5000:g', 10, 10);
  perform life_in_room(c, 'balloon:2', null, null);
  v := room_counts('lagos', 0, 20, 0, 20);
  if (v->>'b:5000:g')::int <> 2 or (v->>'balloon:2')::int <> 1 then raise exception 'FAILED: counts %', v; end if;
  v := room_counts('lagos', 100, 120, 100, 120);
  if v ? 'b:5000:g' or not v ? 'balloon:2' then raise exception 'FAILED: another part of the map %', v; end if;
  perform life_in_room(b, '', null, null);
  update lives set seen_at = now() - interval '10 minutes' where user_id = c;
  v := room_counts('lagos', 0, 20, 0, 20);
  if (v->>'b:5000:g')::int <> 1 or v ? 'balloon:2' then raise exception 'FAILED: after leaving and going quiet %', v; end if;
end $$;
\o
\echo 'room counts: all ok'
