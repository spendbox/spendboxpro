\set ON_ERROR_STOP on
-- Part 85: Town Hall, one chat per state, one message every 5 seconds each.
\ir ../085_town_hall_faces.sql
\ir ../085_town_hall_faces.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('th@th.test');
update profiles set username = 'TownTolu' where email_key = 'th@th.test';
do $$
declare
  u uuid := (select id from profiles where email_key = 'th@th.test');
  m chat_messages;
  failed boolean := false;
begin
  if not exists (select 1 from rounds) then insert into rounds default values; end if;
  m := town_hall_send(u, 'lagos', '  Hello   Lagos!  ');
  perform pg_temp.check(m.room = 'town:lagos' and m.body = 'Hello Lagos!', 'a message goes into the state''s Town Hall');
  begin
    perform town_hall_send(u, 'lagos', 'again');
  exception when others then failed := sqlerrm like '%too_fast%';
  end;
  perform pg_temp.check(failed, 'not twice in 5 seconds');
  failed := false;
  begin
    perform town_hall_send(u, 'Lagos!', 'hi');
  exception when others then failed := sqlerrm like '%bad_room%';
  end;
  perform pg_temp.check(failed, 'only real region names');
  perform pg_temp.check(chat_room_ok('b:12:g') and chat_room_ok('town:lagos') and not chat_room_ok('town:'), 'other rooms still work');
end $$;
\o
\echo 'town hall: all ok'
