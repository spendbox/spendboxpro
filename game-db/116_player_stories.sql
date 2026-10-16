-- Newtown, part 116: other players in your story (docs/LIFE_WHEEL.md, phase 6). Moments about a real
-- player (src/lib/world/player-moments.ts): you lend Ade money in yours, and Ade gets "Pay them
-- back?" in theirs. This keeps:
--
--   - who can be in your story: friends (the default), anyone in your city who also says so, or nobody;
--   - the next part of a story waiting for a player (a link): which moment, from whom, its amount,
--     when it's due, and when it was opened; links not opened within a week lapse;
--   - how each player feels about each other player they've shared stories with (allies and rivals).
--
-- Real money between players goes through give_coins (part 107), with its limits and its notice.
-- Safe to run more than once. Run after part 115.

create table if not exists public.story_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- 'friends': only friends; 'everyone': anyone in the city who says so too; 'nobody'.
  open text not null default 'friends' check (open in ('friends', 'everyone', 'nobody')),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_links (
  id bigserial primary key,
  to_user uuid not null references public.profiles (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  moment text not null check (char_length(moment) <= 40),
  -- The amount (naira) and anything else the moment fills in.
  vars jsonb not null default '{}'::jsonb,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  check (to_user <> from_user)
);
create index if not exists story_links_due_idx on public.story_links (to_user, due_at) where opened_at is null;
create index if not exists story_links_from_idx on public.story_links (from_user, created_at desc);

create table if not exists public.player_bonds (
  user_id uuid not null references public.profiles (id) on delete cascade,
  other uuid not null references public.profiles (id) on delete cascade,
  -- How user_id feels about other, from −10 to 10.
  feeling int not null default 0 check (feeling between -10 and 10),
  -- Stories shared.
  together int not null default 0,
  last_at timestamptz not null default now(),
  primary key (user_id, other),
  check (user_id <> other)
);

do $$
begin
  revoke all on table public.story_prefs, public.story_links, public.player_bonds from public, anon, authenticated;
  grant all on table public.story_prefs, public.story_links, public.player_bonds to service_role;
  revoke all on sequence public.story_links_id_seq from public, anon, authenticated;
  grant all on sequence public.story_links_id_seq to service_role;
end $$;

/** How p_user feels about p_other changes by p_feel (kept from −10 to 10), and they've shared one more story. */
create or replace function public.player_bond_add(p_user uuid, p_other uuid, p_feel int)
returns int
language sql security definer set search_path = public as $$
  insert into public.player_bonds (user_id, other, feeling, together)
    values (p_user, p_other, greatest(-10, least(10, coalesce(p_feel, 0))), 1)
  on conflict (user_id, other) do update
    set feeling = greatest(-10, least(10, public.player_bonds.feeling + coalesce(p_feel, 0))),
        together = public.player_bonds.together + 1,
        last_at = now()
  returning feeling
$$;

do $$
begin
  revoke all on function public.player_bond_add(uuid, uuid, int) from public, anon, authenticated;
  grant execute on function public.player_bond_add(uuid, uuid, int) to service_role;
end $$;
