-- Newtown, part 33: helicopter rides.
-- Helicopters fly sightseeing loops over the town (see src/app/play/city/aircraft.ts), and like
-- the other rides each one is a chat room ("v:heli:<n>") with people on board ("npc:v:heli:<n>:<k>").
-- Safe to run more than once. Run after parts 1-32.

create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'
    or p_room ~ '^v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7}$',
    false)
$$;

create or replace function public.npc_id_ok(p_npc text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(char_length(p_npc) <= 60 and p_npc ~
    '^npc:(b:[0-9]{1,7}(:(g|r|o|f[0-9]{1,3}))?|balloon:[0-9]{1,2}|v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7}):[0-7]$', false)
$$;
