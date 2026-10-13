-- Newtown, part 69: starter packs bring more than mint (docs/PACKS.md). Each paid pack's gifts
-- (a phone, a car...) are given once, marked here. Packs bought before this was run get their
-- gifts the next time the player opens the game.
--
-- Safe to run more than once.

alter table public.starter_payments add column if not exists perks_at timestamptz;
