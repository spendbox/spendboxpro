-- HIDE & SEEK, part 12: adults only (18+), and 4-digit sign-in codes.
-- Run once in Supabase → SQL Editor, after 011 (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces the two functions.

-- ============================================================ date of birth
-- Players give their date of birth once, on the welcome screen. It is private: players can
-- only ever read their own profile, and the app never shows it to anyone else.
alter table public.profiles add column if not exists birth_date date;
-- Set when someone tells us they are under 18. Their account is also frozen, so the game
-- refuses every action, and the welcome screen just shows a friendly "adults only" note.
alter table public.profiles add column if not exists age_blocked_at timestamptz;

-- Saves a player's date of birth, after checking it on the server.
-- Answers: 'ok', 'already_set', 'blocked' (said under 18 before), 'invalid' or 'under_18'.
-- An under-18 answer is final: the date is NOT saved, the account is frozen and marked,
-- so they can't simply try again with a different year.
create or replace function public.set_birth_date(p_user uuid, p_birth date) returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then return 'invalid'; end if;
  if p.age_blocked_at is not null then return 'blocked'; end if;
  if p.birth_date is not null then return 'already_set'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then return 'invalid'; end if;
  if p_birth > (current_date - interval '18 years')::date then
    update public.profiles set frozen = true, age_blocked_at = now() where id = p_user;
    return 'under_18';
  end if;
  update public.profiles set birth_date = p_birth where id = p_user;
  return 'ok';
end $$;

-- ============================================================ 4-digit sign-in codes
-- Codes are now 4 digits (easier to type), so guessing is limited more tightly:
--   * 5 wrong tries per code, and each code works for 10 minutes (as before);
--   * at most 15 wrong tries per email address in any 24 hours, across all codes;
--   * checking a code happens in one locked step here, so many guesses sent at the same
--     moment can't slip past the limits.
alter table public.email_codes add column if not exists wrong_total int not null default 0;
alter table public.email_codes add column if not exists wrong_window_started_at timestamptz not null default now();

-- p_hash is the code's fingerprint, made by the server with its secret key.
-- Answers: 'ok' (code used up), 'wrong', 'expired', 'too_many' (this code) or 'locked' (24 hours).
create or replace function public.check_email_code(p_email text, p_hash text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.email_codes;
begin
  select * into c from public.email_codes where email = p_email for update;
  if not found then return 'expired'; end if;
  if c.wrong_window_started_at < now() - interval '24 hours' then
    update public.email_codes set wrong_total = 0, wrong_window_started_at = now() where email = p_email;
    c.wrong_total := 0;
  end if;
  if c.wrong_total >= 15 then return 'locked'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'too_many'; end if;
  if c.code_hash = p_hash then
    delete from public.email_codes where email = p_email;
    return 'ok';
  end if;
  update public.email_codes set attempts = attempts + 1, wrong_total = wrong_total + 1 where email = p_email;
  return case when c.attempts + 1 >= 5 then 'too_many' else 'wrong' end;
end $$;

revoke all on function public.set_birth_date(uuid, date) from public, anon, authenticated;
grant execute on function public.set_birth_date(uuid, date) to service_role;
revoke all on function public.check_email_code(text, text) from public, anon, authenticated;
grant execute on function public.check_email_code(text, text) to service_role;
