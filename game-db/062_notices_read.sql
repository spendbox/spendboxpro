-- Newtown, part 62: notices you've read and cleared. Each notice remembers when you read it (the
-- counters on the phone count only unread ones, the same on every device) and whether you swiped
-- it away (it's gone from your lists). Also: photos in private messages (a selfie sent to someone).
--
-- Safe to run more than once. Run after part 61.

alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists dismissed_at timestamptz;
create index if not exists notifications_unread_idx on public.notifications (user_id, id desc) where read_at is null and dismissed_at is null;

-- A picture in a message: the photo's path in the phone_photos storage bucket.
alter table public.chat_messages add column if not exists image_path text check (image_path is null or char_length(image_path) <= 200);

-- Sending one: the message is written by chat_send as usual (names, places, pace all checked
-- there), with the picture attached as it's written, so it arrives live with the picture.
create or replace function public.chat_image_from_setting() returns trigger
language plpgsql as $$
begin
  if new.image_path is null then
    new.image_path := nullif(current_setting('newtown.chat_image', true), '');
  end if;
  return new;
end $$;

drop trigger if exists chat_messages_image on public.chat_messages;
create trigger chat_messages_image before insert on public.chat_messages
  for each row execute function public.chat_image_from_setting();

create or replace function public.chat_send_photo(p_user uuid, p_room text, p_to uuid, p_path text, p_caption text default null)
returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  m public.chat_messages;
begin
  if p_path is null or p_path !~ ('^chat/' || p_user::text || '/[A-Za-z0-9._-]{1,80}$') then raise exception 'bad_target'; end if;
  perform set_config('newtown.chat_image', p_path, true);
  m := public.chat_send(p_user, p_room, p_to, coalesce(nullif(trim(coalesce(p_caption, '')), ''), 'Sent a photo'));
  perform set_config('newtown.chat_image', '', true);
  return m;
end $$;

revoke all on function public.chat_send_photo(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.chat_send_photo(uuid, text, uuid, text, text) to service_role;
