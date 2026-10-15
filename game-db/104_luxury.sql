-- Newtown, part 104: luxury things (src/lib/world/items.ts): watches like a Patek Philippe Nautilus
-- or a Richard Mille, a Rolls-Royce Cullinan, a Ben Enwonwu painting. They cost hundreds of
-- millions of naira, so the dearest single thing allowed goes up from 200,000 mint (₦300m) to
-- 2,000,000 mint (₦3bn). Selling and listing them use the same cap.
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('item_price_max', 2000000, 'Dearest item or car (mint, a sanity check): luxury watches and cars cost hundreds of millions')
on conflict (key) do update set value = greatest(public.game_settings.value, excluded.value), note = excluded.note;
