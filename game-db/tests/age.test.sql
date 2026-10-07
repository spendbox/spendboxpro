\set ON_ERROR_STOP on
-- Part 12: adults only (date of birth) and 4-digit sign-in codes.
-- Load after supabase-stub.sql and every numbered part (001 … 012), on a fresh database.
-- Every check raises an error (so the run stops) if something is wrong.
insert into auth.users (email) values ('adult@x.com'), ('kid@x.com'), ('teen@x.com');

do $$
declare
  a uuid := (select id from profiles where email_key = 'adult@x.com');
  k uuid := (select id from profiles where email_key = 'kid@x.com');
  t uuid := (select id from profiles where email_key = 'teen@x.com');
  bot uuid := (select id from profiles where is_bot limit 1);
  r text;
begin
  -- Adults: saved once, then never asked (or changed) again.
  r := set_birth_date(a, (current_date - interval '30 years')::date);
  assert r = 'ok', 'adult should be ok, got ' || r;
  assert (select birth_date from profiles where id = a) = (current_date - interval '30 years')::date, 'birth date saved';
  r := set_birth_date(a, date '1950-01-01');
  assert r = 'already_set', 'second time should be already_set, got ' || r;
  assert (select birth_date from profiles where id = a) = (current_date - interval '30 years')::date, 'birth date unchanged';

  -- Silly dates are refused and nothing is saved.
  assert set_birth_date(k, current_date + 1) = 'invalid', 'future date';
  assert set_birth_date(k, date '1850-05-05') = 'invalid', 'too old';
  assert set_birth_date(k, null) = 'invalid', 'missing date';
  assert set_birth_date(bot, date '1990-01-01') = 'invalid', 'bot';
  assert set_birth_date(gen_random_uuid(), date '1990-01-01') = 'invalid', 'unknown player';
  assert (select birth_date is null and not frozen from profiles where id = k), 'nothing saved for invalid dates';

  -- Exactly 18 today is fine; 18 tomorrow is not.
  r := set_birth_date(t, (current_date - interval '18 years')::date);
  assert r = 'ok', '18th birthday today should be ok, got ' || r;
  r := set_birth_date(k, (current_date - interval '18 years' + interval '1 day')::date);
  assert r = 'under_18', 'one day short of 18 should be under_18, got ' || r;
  assert (select birth_date is null and frozen and age_blocked_at is not null from profiles where id = k),
    'under-18: date not saved, account frozen and marked';
  -- Trying again with an older date doesn't help.
  r := set_birth_date(k, date '1980-01-01');
  assert r = 'blocked', 'retry after under_18 should be blocked, got ' || r;
  assert (select birth_date is null from profiles where id = k), 'still no date after retry';
  -- And the game refuses them (frozen).
  perform tick();  -- opens a round to join
  begin
    perform join_round(k, 'seeker');
    raise exception 'under-18 should not be able to join';
  exception when others then
    assert sqlerrm like '%frozen%', 'join refused because frozen, got ' || sqlerrm;
  end;
  raise notice 'birth dates: ok';
end $$;

-- 4-digit codes: 5 wrong tries per code, 15 per day, codes expire.
do $$
declare r text;
begin
  insert into email_codes (email, code_hash, expires_at) values ('c@x.com', 'right', now() + interval '10 minutes');
  assert check_email_code('nobody@x.com', 'right') = 'expired', 'no code at all';
  assert check_email_code('c@x.com', 'wrong1') = 'wrong', 'wrong 1';
  assert check_email_code('c@x.com', 'right') = 'ok', 'right code works';
  assert not exists (select 1 from email_codes where email = 'c@x.com'), 'used code is gone';
  assert check_email_code('c@x.com', 'right') = 'expired', 'code works only once';

  insert into email_codes (email, code_hash, expires_at) values ('c@x.com', 'right', now() + interval '10 minutes');
  for i in 1..4 loop
    assert check_email_code('c@x.com', 'nope') = 'wrong', 'wrong try ' || i;
  end loop;
  assert check_email_code('c@x.com', 'nope') = 'too_many', '5th wrong try ends this code';
  assert check_email_code('c@x.com', 'right') = 'too_many', 'even the right code is refused after 5 wrong tries';

  -- A new code (the app upserts these columns) gives 5 more tries, up to 15 a day.
  for n in 1..2 loop
    update email_codes set code_hash = 'right', attempts = 0, expires_at = now() + interval '10 minutes' where email = 'c@x.com';
    for i in 1..5 loop perform check_email_code('c@x.com', 'nope'); end loop;
  end loop;
  assert (select wrong_total from email_codes where email = 'c@x.com') = 15, '15 wrong in total';
  update email_codes set code_hash = 'right', attempts = 0, expires_at = now() + interval '10 minutes' where email = 'c@x.com';
  r := check_email_code('c@x.com', 'right');
  assert r = 'locked', 'locked for the day, got ' || r;
  -- After 24 hours the daily count starts again.
  update email_codes set wrong_window_started_at = now() - interval '25 hours' where email = 'c@x.com';
  r := check_email_code('c@x.com', 'right');
  assert r = 'ok', 'works again the next day, got ' || r;

  insert into email_codes (email, code_hash, expires_at) values ('old@x.com', 'right', now() - interval '1 second');
  assert check_email_code('old@x.com', 'right') = 'expired', 'expired code refused';
  raise notice 'sign-in codes: ok';
end $$;

-- Only the server may call the new functions.
do $$ begin
  assert not has_function_privilege('anon', 'public.set_birth_date(uuid, date)', 'execute'), 'anon cannot set birth dates';
  assert not has_function_privilege('authenticated', 'public.set_birth_date(uuid, date)', 'execute'), 'players cannot set birth dates';
  assert not has_function_privilege('authenticated', 'public.check_email_code(text, text)', 'execute'), 'players cannot check codes';
  assert has_function_privilege('service_role', 'public.check_email_code(text, text)', 'execute'), 'server can check codes';
  assert has_function_privilege('service_role', 'public.set_birth_date(uuid, date)', 'execute'), 'server can set birth dates';
  raise notice 'permissions: ok';
end $$;
