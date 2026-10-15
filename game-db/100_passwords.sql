-- Newtown, part 100: real passwords instead of 6-digit PINs (src/app/login/actions.ts). Players
-- from before passwords still get in with their old PIN, then the game asks them to make a
-- password; password_set says who has. Wrong tries still count in pin_failures / pin_locked_until.
--
-- Safe to run more than once. Passwords work before it's run; until then players from before
-- passwords just aren't asked to make one.

alter table public.profiles add column if not exists password_set boolean not null default false;
