-- Newtown, part 37: jobs pay more. Hourly pay in the game tripled (src/lib/jobs.ts: ₥15 to ₥60
-- an hour before skills), so the most a job may pay goes up, and each skill level now adds 10%
-- (was 5%), so a level-10 worker earns double. Jobs already taken keep the pay they were hired at.
-- Safe to run more than once. Run after parts 1-36.

update public.game_settings set value = 100, note = 'Most a job can pay an hour (before skill bonus)' where key = 'job_pay_max';
update public.game_settings set value = 0.10, note = 'Extra pay per skill level' where key = 'job_skill_bonus';
