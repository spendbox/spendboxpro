\set ON_ERROR_STOP on
-- Part 16: every building level (ground, floors 1–200, rooftop) is its own chat room.
-- Load after supabase-stub.sql and every numbered part up to 016, on a fresh database.
-- Every check raises an error (so the run stops) if something is wrong.

-- Running part 16 a second time is safe.
\ir ../016_place_rooms.sql

insert into auth.users (email) values ('lvl1@x.com'), ('lvl2@x.com');
update profiles set username = 'leveller1' where email_key = 'lvl1@x.com';
update profiles set username = 'leveller2' where email_key = 'lvl2@x.com';
do $$ begin if not exists (select 1 from rounds) then perform tick(); end if; end $$;

-- Room names: levels, the old whole-building rooms, balloons.
do $$
declare
  good text[] := array['b:12:g', 'b:12:r', 'b:12:f1', 'b:12:f9', 'b:12:f10', 'b:12:f99', 'b:12:f100', 'b:12:f199', 'b:12:f200',
                       'b:0:g', 'b:1234567:r', 'b:1234567:f42', 'b:12', 'b:0', 'balloon:0', 'balloon:50'];
  bad text[] := array['b:12:f0', 'b:12:f201', 'b:12:f01', 'b:12:f1000', 'b:12:f', 'b:12:f-1', 'b:12:G', 'b:12:R', 'b:12:F4',
                      'b:12:x', 'b:12:', 'b:12:g:1', 'b:12:gr', 'b:12:rf1', 'b::g', 'b:12345678:g', 'b:12:f4 ', ' b:12:g',
                      'balloon:3:g', 'balloon:51', 'balloon:', '*', 'city', 'B:12:g', E'b:12:g\n'];
  r text;
begin
  foreach r in array good loop assert chat_room_ok(r), 'should be a room: ' || r; end loop;
  foreach r in array bad loop assert not chat_room_ok(r), 'should not be a room: ' || r; end loop;
  assert not chat_room_ok(null), 'null is not a room';
  raise notice 'level room names: ok';
end $$;

-- Sending to each level: every level keeps its own messages.
do $$
declare
  a uuid := (select id from profiles where email_key = 'lvl1@x.com');
  b uuid := (select id from profiles where email_key = 'lvl2@x.com');
  m chat_messages;
  rid bigint := (select max(id) from rounds);
begin
  m := chat_send(a, 'b:12:f4', null, 'hello floor four');
  assert m.room = 'b:12:f4' and m.body = 'hello floor four' and m.recipient_id is null and m.round_id = rid, 'floor message saved';
  update chat_messages set created_at = now() - interval '5 seconds' where sender_id = a;  -- (pace)
  m := chat_send(a, 'b:12:g', null, 'hello ground');
  assert m.room = 'b:12:g', 'ground message saved';
  update chat_messages set created_at = now() - interval '10 seconds' where sender_id = a;
  m := chat_send(a, 'b:12:r', null, 'hello roof');
  assert m.room = 'b:12:r', 'rooftop message saved';
  update chat_messages set created_at = now() - interval '15 seconds' where sender_id = a;
  m := chat_send(a, 'b:12', null, 'old app, whole building');
  assert m.room = 'b:12', 'old whole-building room still works';

  m := chat_send(b, 'b:12:f200', null, null, '1/x/voice.webm', 7);
  assert m.room = 'b:12:f200' and m.audio_seconds = 7 and m.body is null, 'voice note on the top floor';
  update chat_messages set created_at = now() - interval '5 seconds' where sender_id = b;

  -- What one level sees (same query the app uses: this room plus the bot's every-room teases).
  assert (select count(*) from chat_messages where round_id = rid and room in ('b:12:f4', '*') and sender_id = a) = 1, 'floor 4 sees only floor 4';
  assert (select count(*) from chat_messages where round_id = rid and room in ('b:12:g', '*') and sender_id = a) = 1, 'ground sees only ground';
  assert not exists (select 1 from chat_messages where room = 'b:12:f4' and body = 'hello roof'), 'roof stays on the roof';

  -- Refusals.
  begin perform chat_send(b, 'b:12:f201', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_room', 'floor 201: ' || sqlerrm; end;
  begin perform chat_send(b, 'b:12:f0', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_room', 'floor 0: ' || sqlerrm; end;
  begin perform chat_send(b, 'b:12:basement', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_room', 'basement: ' || sqlerrm; end;
  begin perform chat_send(b, 'balloon:2:r', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_room', 'balloon roof: ' || sqlerrm; end;
  begin perform chat_send(b, 'b:12:g', a, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_target', 'level and person: ' || sqlerrm; end;
  raise notice 'sending to levels: ok';
end $$;

-- The table's own rule agrees.
do $$
declare
  a uuid := (select id from profiles where email_key = 'lvl1@x.com');
  b uuid := (select id from profiles where email_key = 'lvl2@x.com');
  rid bigint := (select max(id) from rounds);
begin
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, room, body)
    values (rid, a, 'leveller1', 'watcher', 'b:7:f150', 'direct insert');
  begin
    insert into chat_messages (round_id, sender_id, sender_name, sender_role, room, body) values (rid, a, 'x', 'watcher', 'b:7:f201', 'x');
    raise exception 'x';
  exception when check_violation then null; end;
  begin
    insert into chat_messages (round_id, sender_id, sender_name, sender_role, room, body) values (rid, a, 'x', 'watcher', 'b:7:attic', 'x');
    raise exception 'x';
  exception when check_violation then null; end;
  -- A private message never has a room, level or not.
  begin
    insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, room, body)
      values (rid, a, 'x', 'watcher', b, 'b:7:g', 'x');
    raise exception 'x';
  exception when check_violation then null; end;
  -- The old "City" room and the bot's '*' still fit (they're already in the table).
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, body) values (rid, a, 'leveller1', 'watcher', 'old app');
  assert (select room from chat_messages where body = 'old app' and sender_id = a) = 'city', 'old-style message still goes to city';
  raise notice 'table rule: ok';
end $$;

-- Only the server may send.
do $$
begin
  assert not has_function_privilege('authenticated', 'chat_send(uuid, text, uuid, text, text, int)', 'execute'), 'players cannot call chat_send';
  assert not has_function_privilege('anon', 'chat_send(uuid, text, uuid, text, text, int)', 'execute'), 'guests cannot call chat_send';
  assert has_function_privilege('service_role', 'chat_send(uuid, text, uuid, text, text, int)', 'execute'), 'server can send';
  assert has_function_privilege('service_role', 'chat_room_ok(text)', 'execute'), 'server can check rooms';
  raise notice 'grants: ok';
end $$;
