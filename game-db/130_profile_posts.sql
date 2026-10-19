-- Newtown, part 130: a few words about yourself and photos on your profile (docs/LITE.md).
--
--   1. "About you" on profiles (up to 160 letters), shown on your card and your profile.
--   2. Who sees your photos: everyone, or only your friends.
--   3. Photos you post on your profile (src/app/api/profile-posts): a public storage bucket,
--      'posts', and a table of them. At most 6 a day each (the server checks).
--
-- Until it's run, profiles show no "About" and posting says it's switched on soon.
-- Safe to run more than once. Run 128 again after it (it keeps new functions closed).

-- ============================================================ 1 and 2. about you, who sees your photos
alter table public.profiles add column if not exists about text;
alter table public.profiles add column if not exists photos_for text not null default 'everyone';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_about_len') then
    alter table public.profiles add constraint profiles_about_len check (about is null or char_length(about) <= 160);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_photos_for_ok') then
    alter table public.profiles add constraint profiles_photos_for_ok check (photos_for in ('everyone', 'friends'));
  end if;
end $$;

-- ============================================================ 3. photos on your profile
create table if not exists public.profile_posts (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  url text not null,
  caption text check (caption is null or char_length(caption) <= 140),
  created_at timestamptz not null default now()
);
create index if not exists profile_posts_user_idx on public.profile_posts (user_id, id desc);
alter table public.profile_posts enable row level security; -- no policies: only the server reads them
revoke all on table public.profile_posts from public, anon, authenticated;
grant all on table public.profile_posts to service_role;
grant usage, select on sequence public.profile_posts_id_seq to service_role;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('posts', 'posts', true, 600000, array['image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
