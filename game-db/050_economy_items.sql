-- Newtown, part 50: a kinder economy, and things to own.
--
-- Pay. Jobs and side hustles pay four times real Lagos wages (src/lib/world/work.ts PAY_BOOST, in
-- every city), so the caps that check what the game sends go up, and jobs and hustles people
-- already have get the same raise, once.
--
-- Safe to run more than once. Run after parts 1-49.

-- ============================================================ pay four times real wages
update public.game_settings set value = greatest(value, 1000), note = 'Most a job on the real map can pay every 2 hours (mint, before skill bonus)' where key = 'work_pay_max';
update public.game_settings set value = greatest(value, 400), note = 'Most a side hustle can earn every 2 hours (mint, before swing and boost)' where key = 'hustle_pay_max';
insert into public.game_settings (key, value, note) values
  ('pay_boost_done', 0, 'Set to 1 once the jobs and hustles people had got the 4x raise (part 50)')
on conflict (key) do nothing;
do $$
begin
  if public.setting('pay_boost_done') = 0 then
    update public.life_jobs set pay_day = round(pay_day * 4, 2);
    update public.life_hustles set pay_day = round(pay_day * 4, 2);
    update public.game_settings set value = 1 where key = 'pay_boost_done';
  end if;
end $$;
