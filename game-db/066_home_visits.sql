-- Newtown, part 66: visiting each other's homes (docs/HOME_PLANNER.md, "Visiting"). Going into
-- someone else's home, you knock (or ring): they get told and let you in, or not. Friends walk
-- straight in, and so does everyone while the home is having a party. Visitors can sign the
-- home's guest book (or leave a note at the door when nobody answers).
--
-- Safe to run more than once. Run after part 64.

-- Knocks at a door: who, at whose home, and the answer.
create table if not exists public.home_knocks (
  id bigserial primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  unit text not null check (char_length(unit) <= 120),
  visitor_id uuid not null references public.profiles (id) on delete cascade,
  visitor_name text not null check (char_length(visitor_name) <= 40),
  status text not null default 'waiting' check (status in ('waiting', 'in', 'not_now')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists home_knocks_owner_idx on public.home_knocks (owner_id, created_at desc);
create index if not exists home_knocks_visitor_idx on public.home_knocks (visitor_id, created_at desc);

-- The guest book: a line from each visit (or a note left at the door).
create table if not exists public.home_guestbook (
  id bigserial primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null check (char_length(author_name) <= 40),
  body text not null check (char_length(body) between 1 and 200),
  at_door boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists home_guestbook_owner_idx on public.home_guestbook (owner_id, created_at desc);

-- A party: the home is open to everyone until `until`.
create table if not exists public.home_parties (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  unit text not null check (char_length(unit) <= 120),
  title text check (title is null or char_length(title) <= 60),
  until timestamptz not null
);

do $$
begin
  revoke all on table public.home_knocks, public.home_guestbook, public.home_parties from public, anon, authenticated;
  grant all on table public.home_knocks, public.home_guestbook, public.home_parties to service_role;
  revoke all on sequence public.home_knocks_id_seq, public.home_guestbook_id_seq from public, anon, authenticated;
  grant all on sequence public.home_knocks_id_seq, public.home_guestbook_id_seq to service_role;
end $$;
