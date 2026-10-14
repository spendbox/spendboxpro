-- Newtown, part 85:
--   1. Town Hall: one chat for each state (room 'town:<region>', e.g. 'town:lagos') where everyone
--      online can talk. At most one message every 5 seconds each, 300 letters.
--   2. Profile photos: a public storage bucket, 'faces', for the small square photos players can
--      use instead of their drawn face (src/app/api/profile-photo).
--
-- Run it after 057 (and 062). Safe to run more than once.

-- ============================================================ 1. Town Hall
create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|o|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'
    or p_room ~ '^v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7}$'
    or p_room ~ '^town:[a-z0-9-]{2,30}$',
    false)
$$;

-- The latest messages of one room, quickly (Town Hall reads its last 50 often).
create index if not exists chat_room_latest_idx on public.chat_messages (room, id desc) where room like 'town:%';

/** Say something in a state's Town Hall: one message every 5 seconds at most, 300 letters. */
create or replace function public.town_hall_send(p_user uuid, p_region text, p_body text) returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_room text := 'town:' || p_region;
  v_body text := nullif(trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')), '');
begin
  if p_region !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_room'; end if;
  if v_body is null then raise exception 'empty'; end if;
  if char_length(v_body) > 300 then raise exception 'too_long'; end if;
  perform pg_advisory_xact_lock(hashtext('town:' || p_user::text));
  if exists (select 1 from public.chat_messages where sender_id = p_user and room = v_room and created_at > now() - interval '5 seconds') then
    raise exception 'too_fast';
  end if;
  return public.chat_send(p_user, v_room, null, v_body);
end $$;
revoke all on function public.town_hall_send(uuid, text, text) from public, anon, authenticated;
grant execute on function public.town_hall_send(uuid, text, text) to service_role;

-- ============================================================ 2. profile photos
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('faces', 'faces', true, 400000, array['image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
