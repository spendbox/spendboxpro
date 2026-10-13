-- Newtown, part 74: the simple life (docs/MONEY.md, docs/STARTER_ROOMS.md). Real Lagos prices and
-- modest money: a new life starts with ₦250,000 and a free room to live in (one free move, given
-- back when you buy a home of your own or stop playing for 60 days). Jobs, side hustles, bills,
-- food and the body-and-mind meters are switched off: money comes from the daily gift, games,
-- events and top-ups.
--
-- Safe to run more than once.

-- ============================================================ starting money
update public.game_settings set value = 166.67, note = 'Mint to start a life on the real map with (once): ₦250,000 in Lagos'
  where key = 'start_grant';
