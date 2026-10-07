\set ON_ERROR_STOP on
-- Part 14: chat in places (buildings, balloons), private messages, pace limits, bot teases.
-- Load after supabase-stub.sql and every numbered part, on a fresh database.
-- Every check raises an error (so the run stops) if something is wrong.
insert into auth.users (email) values ('room1@x.com'), ('room2@x.com'), ('room3@x.com'), ('room4@x.com');
update profiles set username = 'roomie1' where email_key = 'room1@x.com';
update profiles set username = 'roomie2' where email_key = 'room2@x.com';
update profiles set username = 'roomie4' where email_key = 'room4@x.com';
-- room3 has no name yet; room4 gets frozen.
update profiles set frozen = true where email_key = 'room4@x.com';
-- Make sure there is a round to chat in.
do $$ begin if not exists (select 1 from rounds) then perform tick(); end if; end $$;

-- Room names.
do $$
begin
  assert chat_room_ok('b:0') and chat_room_ok('b:1234') and chat_room_ok('balloon:0') and chat_room_ok('balloon:50'), 'good rooms';
  assert not chat_room_ok('balloon:51'), 'balloon 51';
  assert not chat_room_ok('balloon:-1') and not chat_room_ok('b:-3') and not chat_room_ok('b:') and not chat_room_ok('b:1x'), 'bad numbers';
  assert not chat_room_ok('*') and not chat_room_ok('city') and not chat_room_ok(null) and not chat_room_ok('B:1'), 'reserved / odd rooms';
  raise notice 'room names: ok';
end $$;

-- Sending: who, where and what.
do $$
declare
  a uuid := (select id from profiles where email_key = 'room1@x.com');
  b uuid := (select id from profiles where email_key = 'room2@x.com');
  c uuid := (select id from profiles where email_key = 'room3@x.com');
  f uuid := (select id from profiles where email_key = 'room4@x.com');
  bot uuid := '00000000-0000-0000-0000-00000000b07a';
  m chat_messages;
  rid bigint := (select max(id) from rounds);
  procedure_err text;
begin
  m := chat_send(a, 'b:12', null, '  hello   building  ');
  assert m.room = 'b:12' and m.body = 'hello building' and m.recipient_id is null and m.round_id = rid, 'room message saved, tidied';
  assert m.sender_name = 'roomie1', 'sender name from profile';
  assert m.sender_role in ('hider', 'seeker', 'watcher'), 'role set';

  m := chat_send(b, null, a, 'psst');
  assert m.room is null and m.recipient_id = a and m.recipient_name = 'roomie1', 'private message has no room';

  update chat_messages set created_at = now() - interval '5 seconds' where sender_id = b;  -- (pace)
  m := chat_send(b, 'balloon:3', null, null, '1/x/voice.webm', 999);
  assert m.audio_path is not null and m.audio_seconds = 60 and m.body is null, 'voice note, seconds capped';

  -- Refusals.
  begin perform chat_send(c, 'b:1', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'no_name', 'nameless: ' || sqlerrm; end;
  begin perform chat_send(f, 'b:1', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'frozen', 'frozen: ' || sqlerrm; end;
  begin perform chat_send(bot, 'b:1', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'no_name', 'bot: ' || sqlerrm; end;
  begin perform chat_send(gen_random_uuid(), 'b:1', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'no_name', 'stranger: ' || sqlerrm; end;
  begin perform chat_send(a, 'balloon:99', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_room', 'balloon 99: ' || sqlerrm; end;
  begin perform chat_send(a, '*', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_room', 'everywhere room is the bot''s: ' || sqlerrm; end;
  begin perform chat_send(a, 'city', null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_room', 'old city room closed: ' || sqlerrm; end;
  begin perform chat_send(a, 'b:1', b, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_target', 'both room and person: ' || sqlerrm; end;
  begin perform chat_send(a, null, null, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_target', 'neither: ' || sqlerrm; end;
  begin perform chat_send(a, null, a, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_recipient', 'to myself: ' || sqlerrm; end;
  begin perform chat_send(a, null, bot, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_recipient', 'to the bot: ' || sqlerrm; end;
  begin perform chat_send(a, null, c, 'hi'); raise exception 'x';
  exception when others then assert sqlerrm = 'bad_recipient', 'to someone without a name: ' || sqlerrm; end;
  begin perform chat_send(a, 'b:1', null, '   '); raise exception 'x';
  exception when others then assert sqlerrm = 'empty', 'blank: ' || sqlerrm; end;
  begin perform chat_send(a, 'b:1', null, repeat('a', 501)); raise exception 'x';
  exception when others then assert sqlerrm = 'too_long', 'long: ' || sqlerrm; end;
  raise notice 'sending: ok';
end $$;

-- Pace: one a second, ten in twenty seconds.
do $$
declare
  a uuid := (select id from profiles where email_key = 'room1@x.com');
  i int;
begin
  -- a just posted (above), so an instant second message is too fast.
  begin perform chat_send(a, 'b:12', null, 'again'); raise exception 'x';
  exception when others then assert sqlerrm = 'too_fast', 'double tap: ' || sqlerrm; end;
  -- Spread 9 more over the last 20 seconds: 10 in total, so the 11th is refused.
  delete from chat_messages where sender_id = a;
  for i in 1..10 loop
    insert into chat_messages (round_id, sender_id, sender_name, sender_role, room, body, created_at)
      values ((select max(id) from rounds), a, 'roomie1', 'watcher', 'b:12', 'm' || i, now() - make_interval(secs => 2 + i));
  end loop;
  begin perform chat_send(a, 'b:12', null, 'eleventh'); raise exception 'x';
  exception when others then assert sqlerrm = 'too_fast', '11th in 20s: ' || sqlerrm; end;
  -- Once the older ones are past 20 seconds, it's fine again.
  update chat_messages set created_at = now() - interval '30 seconds' where sender_id = a and body in ('m9', 'm10');
  perform chat_send(a, 'b:12', null, 'ok now');
  raise notice 'pace: ok';
end $$;

-- Old-style public messages (no room) land in the closed "City" room; rules hold.
do $$
declare a uuid := (select id from profiles where email_key = 'room1@x.com'); m chat_messages;
begin
  insert into chat_messages (round_id, sender_id, sender_name, sender_role, body)
    values ((select max(id) from rounds), a, 'roomie1', 'watcher', 'old app') returning * into m;
  assert m.room = 'city', 'old-style message goes to city, got ' || coalesce(m.room, 'null');
  begin
    insert into chat_messages (round_id, sender_id, sender_name, sender_role, room, body) values ((select max(id) from rounds), a, 'x', 'watcher', 'b:nope', 'x');
    raise exception 'x';
  exception when check_violation then null; end;
  begin
    insert into chat_messages (round_id, sender_id, sender_name, sender_role, recipient_id, room, body)
      values ((select max(id) from rounds), a, 'x', 'watcher', (select id from profiles where email_key = 'room2@x.com'), 'b:1', 'x');
    raise exception 'x';
  exception when check_violation then null; end;
  assert exists (select 1 from pg_indexes where indexname = 'chat_room_idx'), 'room index';
  raise notice 'constraints: ok';
end $$;

-- The bot's tease goes to every room ('*').
do $$
declare rid bigint; r text; m chat_messages;
begin
  -- A seek round with the bot hiding, its tease due.
  select id into rid from rounds where status = 'seek' order by id desc limit 1;
  if rid is null then
    select id into rid from rounds where status = 'join' order by id desc limit 1;
    if rid is null then perform tick(); select max(id) into rid from rounds; end if;
    update rounds set join_ends_at = now() - interval '1 second' where id = rid and status = 'join';
    perform tick();
  end if;
  assert (select status from rounds where id = rid) = 'seek', 'round is in seek';
  update entries set caught = false where round_id = rid and user_id = '00000000-0000-0000-0000-00000000b07a';
  update rounds set bot_teases = 0, join_ends_at = now() - interval '2 hours' where id = rid;
  r := bot_tease(rid);
  assert r = 'teased', 'bot teased, got ' || r;
  select * into m from chat_messages where round_id = rid and sender_id = '00000000-0000-0000-0000-00000000b07a' order by id desc limit 1;
  assert m.room = '*' and m.recipient_id is null and m.sender_name like '% (bot)', 'tease is shown in every room';
  raise notice 'bot tease: ok';
end $$;

-- Only the server may call these.
do $$
begin
  assert not has_function_privilege('authenticated', 'chat_send(uuid, text, uuid, text, text, int)', 'execute'), 'players cannot call chat_send';
  assert not has_function_privilege('anon', 'bot_tease(bigint)', 'execute'), 'nobody else teases';
  assert has_function_privilege('service_role', 'chat_send(uuid, text, uuid, text, text, int)', 'execute'), 'server can send';
  raise notice 'grants: ok';
end $$;
