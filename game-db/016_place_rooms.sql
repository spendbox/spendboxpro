-- HIDE & SEEK, part 16: every level of a building is its own chat room.
-- Run once in Supabase → SQL Editor, after 015_ghost_rules.sql.
-- Safe to run again: it only replaces one function and one rule, and re-states who may call what.
--
-- How rooms work now:
--   room = 'b:<tile>:g'      the ground floor of the building on that tile
--   room = 'b:<tile>:f<n>'   floor n of that building (1 … 200)
--   room = 'b:<tile>:r'      the rooftop of that building
--   room = 'b:<tile>'        the whole building (the old way; still accepted so older copies of the app keep working)
--   room = 'balloon:<k>'     everyone riding hot-air balloon k (0 … 50)
--   room = '*'               a message shown in every room (the bot's teases)
--   room = null              a private message (recipient_id is set)
-- chat_send (part 14) already asks chat_room_ok, so it learns the new rooms from here.

-- ============================================================ room names
-- True for a room a player can post in (see the list above; not '*' or the old 'city').
create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$',
    false)
$$;

-- ============================================================ the rule on the table
-- The same list, checked on every saved message (anything already saved still fits).
alter table public.chat_messages drop constraint if exists chat_messages_room_check;
alter table public.chat_messages add constraint chat_messages_room_check check (
  (recipient_id is not null and room is null)
  or (recipient_id is null and room is not null and (
        room = '*' or room = 'city'
        or room ~ '^b:[0-9]{1,7}(:(g|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
        or room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'))
);

-- ============================================================ who may call what
-- Same as part 14: only the server (service role) sends; players never call these directly.
revoke all on function public.chat_send(uuid, text, uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.chat_send(uuid, text, uuid, text, text, int) to service_role;
grant execute on function public.chat_room_ok(text) to service_role;
