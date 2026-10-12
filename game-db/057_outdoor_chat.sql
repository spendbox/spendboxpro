-- Newtown, part 57: chat in open-air places (a park, a plaza, a landmark's main entrance).
--
-- Places have levels: g (ground), f1..f200 (floors), r (the roof) and o (open air at street level).
-- Chat only took the first three, so talking in a park or at Unilag's main gate failed.
--
-- Safe to run more than once. Run after parts 1-56.

create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|o|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'
    or p_room ~ '^v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7}$',
    false)
$$;
