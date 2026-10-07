-- HIDE & SEEK, part 3: bigger city per hider, player names + PIN sign-in, and chat.
-- Run once in Supabase → SQL Editor, after 002_email_codes_and_city.sql.

-- Each hider now adds 20 tiles to the city.
update public.game_settings set value = 20 where key = 'tiles_per_hider';

-- ============================================================ names and PINs
-- Players pick a name and a 6-digit PIN on first sign-in. The PIN itself is kept by
-- Supabase Auth (as the account password); these columns slow down PIN guessing.
alter table public.profiles add column if not exists pin_set boolean not null default false;
alter table public.profiles add column if not exists pin_failures int not null default 0;
alter table public.profiles add column if not exists pin_locked_until timestamptz;
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- ============================================================ chat
-- One chat per round: when a new map starts, the old chat is gone from view (and the
-- daily job deletes it). recipient_id null = everyone; otherwise a private message.
create table public.chat_messages (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_name text not null,
  sender_role text not null check (sender_role in ('hider', 'seeker', 'watcher')),
  recipient_id uuid references public.profiles (id) on delete cascade,
  recipient_name text,
  body text check (char_length(body) <= 500),
  audio_path text,
  audio_seconds int,
  created_at timestamptz not null default now(),
  check (body is not null or audio_path is not null)
);
create index chat_round_idx on public.chat_messages (round_id, id);
create index chat_private_idx on public.chat_messages (recipient_id, round_id) where recipient_id is not null;

alter table public.chat_messages enable row level security;
-- Everyone signed in sees public messages; private ones only by the two people involved.
-- Messages are written only by the server (which checks names, length and pace).
create policy "read chat" on public.chat_messages for select to authenticated
  using (recipient_id is null or sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- Live updates for the chat.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Voice notes live in a private storage bucket; the server hands out short-lived links.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('voice', 'voice', false, 2000000,
            array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav'])
    on conflict (id) do nothing;
  end if;
end $$;
