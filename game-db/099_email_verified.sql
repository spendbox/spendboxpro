-- Newtown, part 99: new players sign up with their email and a PIN, with no email sent (a free
-- robot check, Cloudflare Turnstile, keeps bots out; src/app/login/actions.ts). Email is only used
-- for "Forgot PIN" now, so an address isn't known to be the player's until a code has reached it:
-- email_verified_at says when (later: a reward for confirming it).
--
-- Safe to run more than once.

alter table public.profiles add column if not exists email_verified_at timestamptz;
-- Everyone who signed up before this got in with a code sent to their email.
update public.profiles set email_verified_at = coalesce(created_at, now())
  where email is not null and email_verified_at is null and pin_set;
