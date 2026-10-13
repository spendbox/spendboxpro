-- Newtown, part 74: prices follow the money (docs/MONEY.md, "Prices"). Money in the game comes big
-- now (a daily gift of ₦400k–6.4m, challenge stakes up to ₦5m), so everyday things cost ten times
-- their real Lagos price (rides, trip fares, club entry, pranks, fines, bribes) and things you own
-- three times (shop items, cars, homes). The prices themselves are worked out in the game's code
-- (src/lib/world/price-level.ts); this raises the database's sanity limits to let them through,
-- and starts new lives with three times the money, so a first home is still within reach.
-- Also run part 67 again (club entry's own limit).
--
-- Safe to run more than once.

update public.game_settings set value = 19500, note = 'Mint to start a life on the real map with (once): ₦29.25m in Lagos'
  where key = 'start_grant';
update public.game_settings set value = greatest(value, 1500) where key = 'ride_fare_max';
update public.game_settings set value = greatest(value, 1000) where key = 'trip_fare_max';
update public.game_settings set value = greatest(value, 300) where key = 'work_fare_max';
update public.game_settings set value = greatest(value, 1000000) where key = 'item_price_max';
