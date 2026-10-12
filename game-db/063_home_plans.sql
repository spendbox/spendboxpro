-- Newtown, part 63: planning your home (docs/HOME_PLANNER.md). Each player keeps one plan for the
-- home they live in: its rooms and furniture, floor by floor, drawn flat and built in 3D. The
-- game checks every plan before it's saved (src/lib/home-plan.ts cleanPlan); this table only
-- keeps it.
--
-- Safe to run more than once. Run after part 62.

create table if not exists public.home_plans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- The home it was drawn for (lives.home_unit), so moving house starts a fresh plan.
  unit text not null check (char_length(unit) <= 120),
  plan jsonb not null check (pg_column_size(plan) <= 65536),
  updated_at timestamptz not null default now()
);

do $$
begin
  revoke all on table public.home_plans from public, anon, authenticated;
  grant all on table public.home_plans to service_role;
end $$;
