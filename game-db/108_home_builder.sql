-- Newtown, part 108: the house builder (docs/HOME_BUILDER.md). Homes can now be much bigger (up to
-- a palace, 30 × 22 m a floor, six floors, with pools), so one save can cost more and a plan can
-- be bigger. The game still works out every price from the plan itself (src/lib/home-plan.ts).
--
-- Safe to run more than once. Run after part 107.

-- The most one save can cost: ₦7.5bn in mint (a grand mansion, built in one go, is well under it).
insert into public.game_settings (key, value, note) values
  ('home_upgrade_max', 5000000, 'Most one save of a home plan can cost (mint, a sanity check)')
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- A plan of a big home (six floors of rooms and furniture) needs more room than 64 KB.
alter table public.home_plans drop constraint if exists home_plans_plan_check;
alter table public.home_plans drop constraint if exists home_plans_plan_size;
alter table public.home_plans add constraint home_plans_plan_size check (pg_column_size(plan) <= 262144);
