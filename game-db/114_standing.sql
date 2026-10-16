-- Newtown, part 114: standing and quiet badges (docs/LIFE_WHEEL.md, phase 4). From what you've
-- lived, the game works out Trust, Fame and Legacy, and badges earned by patterns over weeks
-- (src/lib/world/standing.ts). This keeps:
--
--   - with each moment, what the game noted at the time: the trust it moved, whether anyone saw it,
--     the effect it left (the rules read these back later);
--   - each player's standing, worked out at most every few minutes, for the "most legendary lives"
--     board (Legacy only grows);
--   - each player's badges: when earned, when they quietly show up, whether they've been seen,
--     whether they've faded, and whether the player shows them on their card (not unless they choose).
--
-- Safe to run more than once. Run after part 113.

alter table public.moments add column if not exists marks jsonb;

create table if not exists public.life_standing (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  trust int not null default 50,
  fame int not null default 0,
  legacy int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists life_standing_legacy_idx on public.life_standing (legacy desc);

create table if not exists public.life_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null check (char_length(badge) <= 40),
  earned_at timestamptz not null default now(),
  -- It shows up quietly a while after it's earned.
  visible_at timestamptz not null default now(),
  -- When the player first saw it (null: new).
  seen_at timestamptz,
  -- A character badge can fade if you change (and come back if you change back).
  faded_at timestamptz,
  -- On your card for others to see (private until you choose).
  shown boolean not null default false,
  primary key (user_id, badge)
);

do $$
begin
  revoke all on table public.life_standing, public.life_badges from public, anon, authenticated;
  grant all on table public.life_standing, public.life_badges to service_role;
end $$;
