-- Newtown, part 34: the phone camera and gallery.
-- Everyone signed in has a phone. Pictures they take (of the town, or selfies with their avatar)
-- are saved to their gallery, which belongs to their account: it goes with them from round to
-- round and town to town. The pictures themselves are files in a private storage bucket
-- ("photos", 1.5 MB each at most); this table remembers whose they are. A gallery holds
-- phone_gallery_max (300) pictures: taking one more lets the oldest go.
-- Safe to run more than once. Run after parts 1-33.

insert into public.game_settings (key, value, note) values
  ('phone_gallery_max', 300, 'Phone gallery: most pictures one person keeps (the oldest go first)'),
  ('phone_photos_per_hour', 120, 'Phone camera: most pictures one person can save in an hour')
on conflict (key) do update set note = excluded.note;

create table if not exists public.phone_photos (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  path text not null unique,
  kind text not null default 'photo' check (kind in ('photo', 'selfie')),
  place text check (char_length(place) <= 80),
  city text check (char_length(city) <= 60),
  width int not null default 0,
  height int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists phone_photos_user_idx on public.phone_photos (user_id, created_at desc, id desc);
alter table public.phone_photos enable row level security; -- no policies: only the server reads it

-- Save a picture that was just uploaded to storage. Returns the new row and the storage paths of
-- any old pictures that had to go to make room (the server deletes those files).
create or replace function public.phone_photo_add(
  p_user uuid, p_path text, p_kind text, p_place text, p_city text, p_width int, p_height int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_row public.phone_photos;
  v_gone text[];
  v_max int := public.setting('phone_gallery_max')::int;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if p_path is null or p_path !~ ('^' || p_user::text || '/[0-9]{1,16}-[a-z0-9]{1,12}\.jpg$') then raise exception 'bad_path'; end if;
  if (select count(*) from public.phone_photos where user_id = p_user and created_at > now() - interval '1 hour')
     >= public.setting('phone_photos_per_hour') then
    raise exception 'too_many';
  end if;
  insert into public.phone_photos (user_id, path, kind, place, city, width, height)
  values (p_user, p_path, case when p_kind = 'selfie' then 'selfie' else 'photo' end,
          nullif(left(btrim(coalesce(p_place, '')), 80), ''), nullif(left(btrim(coalesce(p_city, '')), 60), ''),
          greatest(0, least(coalesce(p_width, 0), 10000)), greatest(0, least(coalesce(p_height, 0), 10000)))
  returning * into v_row;
  with gone as (
    delete from public.phone_photos where id in (
      select id from public.phone_photos where user_id = p_user
      order by created_at desc, id desc offset greatest(v_max, 1)
    ) returning path
  )
  select coalesce(array_agg(path), '{}') into v_gone from gone;
  return jsonb_build_object('photo', to_jsonb(v_row), 'removed', to_jsonb(v_gone));
end $$;

-- One person's gallery, newest first.
create or replace function public.phone_photos_list(p_user uuid, p_limit int default 120, p_before bigint default null)
returns setof public.phone_photos
language sql stable security definer set search_path = public as $$
  select * from public.phone_photos
  where user_id = p_user and (p_before is null or id < p_before)
  order by created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 120), 300))
$$;

-- Delete one of your own pictures. Returns its storage path (the server deletes the file), or
-- null when it isn't yours or is already gone.
create or replace function public.phone_photo_delete(p_user uuid, p_id bigint) returns text
language sql security definer set search_path = public as $$
  delete from public.phone_photos where id = p_id and user_id = p_user returning path
$$;

-- The pictures: private (only the server hands out short-lived links), JPEG, 1.5 MB at most.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('photos', 'photos', false, 1572864, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $$;

do $$
begin
  revoke all on table public.phone_photos from public, anon, authenticated;
  grant all on table public.phone_photos to service_role;
  revoke all on sequence public.phone_photos_id_seq from public, anon, authenticated;
  grant all on sequence public.phone_photos_id_seq to service_role;
end $$;
revoke all on function public.phone_photo_add(uuid, text, text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.phone_photo_add(uuid, text, text, text, text, int, int) to service_role;
revoke all on function public.phone_photos_list(uuid, int, bigint) from public, anon, authenticated;
grant execute on function public.phone_photos_list(uuid, int, bigint) to service_role;
revoke all on function public.phone_photo_delete(uuid, bigint) from public, anon, authenticated;
grant execute on function public.phone_photo_delete(uuid, bigint) to service_role;
