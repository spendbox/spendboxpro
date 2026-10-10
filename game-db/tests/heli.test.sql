\set ON_ERROR_STOP on
-- Part 33: helicopter rides are chat rooms with people on board, like the other rides.
\ir ../033_helicopters.sql
\o /dev/null
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
-- Running part 33 again changes nothing.
\ir ../033_helicopters.sql
\o /dev/null
select pg_temp.check(chat_room_ok('v:heli:0') and chat_room_ok('v:heli:1'), 'a helicopter is a chat room');
select pg_temp.check(chat_room_ok('v:train:2') and chat_room_ok('b:12:g') and chat_room_ok('balloon:3'), 'the other rooms still are');
select pg_temp.check(not chat_room_ok('v:rocket:1') and not chat_room_ok('v:heli:x'), 'made-up rides are not');
select pg_temp.check(npc_id_ok('npc:v:heli:1:4') and npc_id_ok('npc:v:boat:0:2'), 'people can be on board');
\o
select 'heli: all checks passed' as result;
