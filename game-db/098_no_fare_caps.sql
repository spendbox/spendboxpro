-- Newtown, part 98: getting about isn't capped (src/lib/world/work.ts). Lagos is all of Lagos State
-- now (Badagry to Epe is about 180 km): a long trip costs what it costs, by the kilometre. The
-- limits below were the most a fare could be; they're raised so far that no real fare reaches
-- them, and stay only as a guard against a broken number (₥1,000,000 is ₦1.5bn).
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('fare_max',      1000000, 'A guard only (no real train fare comes near it): fares are not capped'),
  ('work_fare_max', 1000000, 'A guard only (no real trip to work comes near it): fares are not capped'),
  ('trip_fare_max', 1000000, 'A guard only (no real trip comes near it): fares are not capped'),
  ('ride_fare_max', 1000000, 'A guard only (no real ride comes near it): fares are not capped')
-- Running this again sets these back to the numbers here.
on conflict (key) do update set value = excluded.value, note = excluded.note;
