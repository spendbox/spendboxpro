\set ON_ERROR_STOP on
-- Part 131: Masquerade. Matching, choosing, unmasking, and the rules round it.

\ir ../028_hugs_gifts.sql
\ir ../056_dating.sql
\ir ../060_find_people.sql
\ir ../131_masquerade.sql
\ir ../131_masquerade.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
create function pg_temp.fails(what text, p_code text, q text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'should fail: %', what;
exception when others then
  if sqlerrm like 'should fail%' then raise; end if;
  if sqlerrm not like p_code || '%' then raise exception 'FAILED: % gave "%" (expected %)', what, sqlerrm, p_code; end if;
  raise notice 'ok %: %', what, sqlerrm;
end $$;

insert into auth.users (email) values ('m1@masq.test'), ('m2@masq.test'), ('m3@masq.test'), ('m4@masq.test'), ('m5@masq.test'), ('m6@masq.test'), ('m7@masq.test'),
  ('o1@masq.test'), ('o2@masq.test'), ('o3@masq.test'), ('o4@masq.test');

do $$
declare
  u1 uuid := pg_temp.uid('m1@masq.test');
  u2 uuid := pg_temp.uid('m2@masq.test');
  u3 uuid := pg_temp.uid('m3@masq.test');
  u4 uuid := pg_temp.uid('m4@masq.test');
  s bigint;
  s2 bigint;
  v text;
begin
  -- Alone: you wait. Someone else for the same thing: matched at once, nearest first.
  perform pg_temp.check(masq_join(u1, 'lagos', 'friends', 0, 0, 'Yaba', 'sa', 5, 10, 'anyone', 18, 80, 1) is null, 'the first one waits');
  perform pg_temp.check((select count(*) from masq_queue) = 1, 'and is on the waiting list');
  s := masq_join(u2, 'lagos', 'friends', 3, 4, 'Ikeja', 'sb', 5, 10, 'anyone', 18, 80, 1);
  perform pg_temp.check(s is not null, 'the second is matched with them');
  perform pg_temp.check((select a = pg_temp.uid('m1@masq.test') and b = pg_temp.uid('m2@masq.test') and a_area = 'Yaba' and b_area = 'Ikeja' from masq_sessions where id = s), 'as a and b, each with their area');
  perform pg_temp.check((select count(*) from masq_queue) = 0, 'and both leave the waiting list');
  perform pg_temp.check(masq_join(u1, 'lagos', 'friends', 0, 0, 'Yaba', 'zz', 5, 10, 'anyone', 18, 80, 1) = s, 'asking again gives the same masquerade');

  -- Dating needs dating switched on; friends and dating never mix.
  perform pg_temp.fails('a spicy link-up, but not open to dating', 'dating_off', format('select masq_join(%L, %L, %L, 0, 0, null, %L, 5, 10, ''anyone'', 18, 80, 3)', u3, 'lagos', 'linkup', 'x'));
  perform pg_temp.fails('dating, but not open to it', 'dating_off', format('select masq_join(%L, %L, %L, 0, 0, null, %L, 5, 10, ''anyone'', 18, 80, 1)', u3, 'lagos', 'dating', 'x'));
  update profiles set dating_open = true where id in (u3, u4);
  perform pg_temp.check(masq_join(u3, 'lagos', 'dating', 0, 0, null, 'sc', 5, 10, 'anyone', 18, 80, 1) is null, 'dating: waits');
  perform pg_temp.check(masq_join(u4, 'lagos', 'friends', 0, 0, null, 'sd', 5, 10, 'anyone', 18, 80, 1) is null, 'friends never meet someone here for dating');
  s2 := masq_join(u4, 'lagos', 'dating', 0, 0, null, 'sd', 5, 10, 'anyone', 18, 80, 1);
  perform pg_temp.check(s2 is not null, 'two here for dating are matched');

  -- Choosing: not before time's up; both unmask: unmasked.
  perform pg_temp.fails('unmask too soon', 'not_yet', format('select masq_choose(%L, %s, %L, 2)', u1, s, 'unmask'));
  update masq_sessions set ends_at = now() - interval '1 second' where id = s;
  perform pg_temp.check(masq_choose(u1, s, 'unmask', 2) = 'live', 'one unmask: still waiting for the other');
  perform pg_temp.check(masq_choose(u2, s, 'unmask', 2) = 'unmasked', 'both unmask: unmasked');
  perform pg_temp.fails('someone else''s', 'gone', format('select masq_choose(%L, %s, %L, 2)', u3, s, 'pass'));

  -- Two more minutes, once, if both ask.
  update masq_sessions set ends_at = now() - interval '1 second' where id = s2;
  perform masq_choose(u3, s2, 'more', 2);
  perform pg_temp.check(masq_choose(u4, s2, 'more', 2) = 'live', 'both ask for more');
  perform pg_temp.check((select extended and ends_at > now() + interval '100 seconds' and a_choice is null from masq_sessions where id = s2), 'two more minutes, choices cleared');
  update masq_sessions set ends_at = now() - interval '1 second' where id = s2;
  perform masq_choose(u3, s2, 'more', 2);
  perform pg_temp.check(masq_choose(u4, s2, 'more', 2) = 'live' and (select ends_at < now() from masq_sessions where id = s2), 'only once');
  perform pg_temp.check(masq_choose(u3, s2, 'pass', 2) = 'ended', 'a pass ends it');
  perform pg_temp.check((select ended_why = 'pass' and ended_by = pg_temp.uid('m3@masq.test') from masq_sessions where id = s2), 'saying who passed (kept on the server only)');

  -- Messages: only yours, not too fast.
  update masq_sessions set status = 'live', ends_at = now() + interval '5 minutes' where id = s;
  perform masq_say(u1, s, 'Hello there');
  perform pg_temp.fails('too fast', 'too_fast', format('select masq_say(%L, %s, %L)', u1, s, 'again'));
  perform masq_say(u2, s, 'Hi!');
  perform pg_temp.check((select count(*) from masq_messages where session_id = s) = 2, 'messages kept, by side');
  perform pg_temp.fails('not yours', 'gone', format('select masq_say(%L, %s, %L)', u3, s, 'hey'));
  perform pg_temp.check(masq_next_question(u1, s) = 1, 'another question');

  -- Not the same pair again within a day; never again after a report; not blocked people.
  perform masq_choose(u1, s, 'left', 2);
  perform pg_temp.check(masq_join(u1, 'lagos', 'friends', 0, 0, null, 'x1', 5, 10, 'anyone', 18, 80, 1) is null, 'a waits again');
  perform pg_temp.check(masq_join(u2, 'lagos', 'friends', 0, 0, null, 'x2', 5, 10, 'anyone', 18, 80, 1) is null, 'b is not matched with a again today');
  perform masq_cancel(u1);
  perform masq_cancel(u2);
  perform pg_temp.check((select count(*) from masq_queue) = 0, 'taking your mask off the list');
  insert into blocks (blocker, blocked) values (u3, u1);
  perform pg_temp.check(masq_join(u3, 'lagos', 'friends', 0, 0, null, 'x3', 5, 10, 'anyone', 18, 80, 1) is null and masq_join(u1, 'lagos', 'friends', 0, 0, null, 'x4', 5, 10, 'anyone', 18, 80, 1) is null, 'blocked people are never matched');
  perform masq_cancel(u1);
  perform masq_cancel(u3);

  -- Time's up and nobody decided: it ends by itself.
  s := masq_join(u4, 'lagos', 'friends', 0, 0, null, 'y1', 5, 10, 'anyone', 18, 80, 1);
  s := coalesce(s, masq_join(u2, 'lagos', 'friends', 0, 0, null, 'y2', 5, 10, 'anyone', 18, 80, 1));
  perform pg_temp.check(s is not null, 'a new pair');
  update masq_sessions set ends_at = now() - interval '2 minutes' where id = s;
  perform masq_expire(60);
  perform pg_temp.check((select status = 'ended' and ended_why = 'timeout' from masq_sessions where id = s), 'undecided ones end by themselves');

  -- Spicy link-ups only meet spicy link-ups.
  perform pg_temp.check(masq_join(u3, 'lagos', 'linkup', 0, 0, null, 'l1', 5, 10, 'anyone', 18, 80, 3) is null, 'a link-up waits');
  perform pg_temp.check(masq_join(u4, 'lagos', 'dating', 0, 0, null, 'l2', 5, 10, 'anyone', 18, 80, 3) is null, 'dating never meets a link-up');
  perform masq_cancel(u3);
  perform masq_cancel(u4);

  -- Who you'd like to meet, both ways: sex and age; and each one's spice is kept.
  update profiles set gender = 'male', birth_date = current_date - interval '25 years' where id = pg_temp.uid('m5@masq.test');
  update profiles set gender = 'female', birth_date = current_date - interval '30 years' where id = pg_temp.uid('m6@masq.test');
  update profiles set gender = null, birth_date = current_date - interval '40 years' where id = pg_temp.uid('m7@masq.test');
  perform pg_temp.check(masq_join(pg_temp.uid('m5@masq.test'), 'abuja', 'friends', 0, 0, null, 'g1', 5, 10, 'women', 18, 28, 0) is null, 'he waits for women 18 to 28');
  perform pg_temp.check(masq_join(pg_temp.uid('m6@masq.test'), 'abuja', 'friends', 0, 0, null, 'g2', 5, 10, 'men', 20, 35, 3) is null, 'she is 30: too old for his range, so she waits too');
  perform pg_temp.check(masq_join(pg_temp.uid('m7@masq.test'), 'abuja', 'friends', 0, 0, null, 'g3', 5, 10, 'anyone', 18, 99, 2) is null, 'no sex given: nobody asking for men or women meets them');
  perform masq_cancel(pg_temp.uid('m5@masq.test'));
  s := masq_join(pg_temp.uid('m5@masq.test'), 'abuja', 'friends', 0, 0, null, 'g4', 5, 10, 'women', 18, 35, 0);
  perform pg_temp.check(s is not null and (select b = pg_temp.uid('m5@masq.test') and a = pg_temp.uid('m6@masq.test') from masq_sessions where id = s), 'he widens his range: matched with her, each fitting the other');
  perform pg_temp.check((select a_spice = 3 and b_spice = 0 from masq_sessions where id = s), 'each one''s spice kept');

  -- At most so many a day.
  perform pg_temp.fails('too many today', 'too_many', format('select masq_join(%L, %L, %L, 0, 0, null, %L, 5, 1, ''anyone'', 18, 80, 1)', u4, 'lagos', 'friends', 'z'));
end $$;

-- Open to Masquerade: nobody waiting, so someone open to it is asked (one at a time, nearest first).
do $$
declare
  j uuid := pg_temp.uid('o1@masq.test');
  near uuid := pg_temp.uid('o2@masq.test');
  far uuid := pg_temp.uid('o3@masq.test');
  j2 uuid := pg_temp.uid('o4@masq.test');
  inv bigint;
  s bigint;
begin
  perform pg_temp.check(masq_set_open(near, true, 'kano', 'friends', 10, 0, 'Near', 'anyone', 18, 80, 2, 'tok-near') = 'tok-near', 'switched on: their channel''s secret');
  perform pg_temp.check(masq_set_open(near, true, 'kano', 'friends', 10, 0, 'Near', 'anyone', 18, 80, 2, 'other') = 'tok-near', 'kept fresh: the same secret');
  perform masq_set_open(far, true, 'kano', 'friends', 900, 0, 'Far', 'anyone', 18, 80, 0, 'tok-far');
  perform pg_temp.fails('open for dating, but not open to it', 'dating_off', format('select masq_set_open(%L, true, %L, %L, 0, 0, null, %L, 18, 80, 1, %L)', far, 'kano', 'dating', 'anyone', 't'));

  perform pg_temp.check(masq_join(j, 'kano', 'friends', 0, 0, 'Here', 'sj', 5, 10, 'anyone', 18, 80, 1) is null, 'masked up: waits');
  perform pg_temp.check((select to_user = near and status = 'asking' and from_area = 'Here' from masq_invites where from_user = j), 'the nearest one open to it is asked');
  perform masq_join(j, 'kano', 'friends', 0, 0, 'Here', 'sj', 5, 10, 'anyone', 18, 80, 1);
  perform pg_temp.check((select count(*) from masq_invites where from_user = j) = 1, 'one at a time');

  -- Not now: the next one is asked; the first isn't asked again for a while.
  inv := (select id from masq_invites where from_user = j and to_user = near);
  perform pg_temp.check(masq_answer(near, inv, false, 'x', 5, 10) is null, 'not now');
  perform masq_join(j, 'kano', 'friends', 0, 0, 'Here', 'sj', 5, 10, 'anyone', 18, 80, 1);
  perform pg_temp.check((select to_user = far from masq_invites where from_user = j and status = 'asking'), 'passed to the next person');
  perform pg_temp.fails('not yours to answer', 'gone', format('select masq_answer(%L, %s, true, %L, 5, 10)', near, (select id from masq_invites where to_user = far), 'x'));

  -- Yes: the masquerade starts, the one who waited is a.
  inv := (select id from masq_invites where to_user = far and status = 'asking');
  s := masq_answer(far, inv, true, 'sf', 5, 10);
  perform pg_temp.check(s is not null and (select a = j and b = far and a_area = 'Here' and b_area = 'Far' and a_spice = 1 and b_spice = 0 from masq_sessions where id = s), 'yes: matched, each with their area and spice');
  perform pg_temp.check(masq_join(j, 'kano', 'friends', 0, 0, 'Here', 'zz', 5, 10, 'anyone', 18, 80, 1) = s, 'the one who waited finds it on their next look');
  perform pg_temp.check(masq_answer(far, inv, true, 'sf', 5, 10) = s, 'saying yes twice: the same one');
  perform pg_temp.check((select count(*) from masq_queue where user_id = j) = 0, 'off the waiting list');

  -- Too late, or they found someone else: missed.
  perform masq_choose(j, s, 'left', 2);
  perform masq_set_open(far, false, 'kano', 'friends', 0, 0, null, 'anyone', 18, 80, 1, 'x');
  perform pg_temp.check(not exists (select 1 from masq_open where user_id = far), 'switched off');
  perform masq_join(j2, 'kano', 'friends', 0, 0, null, 's2', 5, 10, 'anyone', 18, 80, 1);
  perform pg_temp.check(not exists (select 1 from masq_invites where from_user = j2), 'nobody asked: one said no just now, the other switched off');
  update masq_invites set created_at = now() - interval '10 minutes' where to_user = near;
  perform masq_join(j2, 'kano', 'friends', 0, 0, null, 's2', 5, 10, 'anyone', 18, 80, 1);
  inv := (select id from masq_invites where from_user = j2 and status = 'asking');
  perform pg_temp.check((select to_user = near from masq_invites where id = inv), 'after a rest, asked again (by someone else)');
  update masq_invites set expires_at = now() - interval '10 seconds' where id = inv;
  perform pg_temp.fails('too late', 'missed', format('select masq_answer(%L, %s, true, %L, 5, 10)', near, inv, 'x'));
  update masq_invites set created_at = now() - interval '10 minutes' where to_user = near;
  delete from masq_invites where from_user = j2;
  perform masq_join(j2, 'kano', 'friends', 0, 0, null, 's2', 5, 10, 'anyone', 18, 80, 1);
  inv := (select id from masq_invites where from_user = j2 and status = 'asking');
  perform masq_cancel(j2);
  perform pg_temp.check((select status = 'missed' from masq_invites where id = inv), 'taking the mask off stops the asking');
  perform pg_temp.fails('they''d gone', 'missed', format('select masq_answer(%L, %s, true, %L, 5, 10)', near, inv, 'x'));

  -- Only who fits, both ways; switched off or gone quiet: not asked.
  update masq_invites set created_at = now() - interval '2 days';
  update profiles set gender = 'male' where id = j2;
  perform masq_set_open(near, true, 'kano', 'friends', 10, 0, 'Near', 'women', 18, 80, 2, 'tok-near');
  perform masq_set_open(far, false, 'kano', 'friends', 0, 0, null, 'anyone', 18, 80, 1, 'x');
  perform masq_join(j2, 'kano', 'friends', 0, 0, null, 's2', 5, 10, 'anyone', 18, 80, 1);
  perform pg_temp.check(not exists (select 1 from masq_invites where from_user = j2 and status = 'asking'), 'not asked: she''d like to meet women; he switched off');
  perform masq_set_open(near, true, 'kano', 'friends', 10, 0, 'Near', 'anyone', 18, 80, 2, 'tok-near');
  update masq_open set seen_at = now() - interval '5 minutes' where user_id = near;
  perform masq_join(j2, 'kano', 'friends', 0, 0, null, 's2', 5, 10, 'anyone', 18, 80, 1);
  perform pg_temp.check(not exists (select 1 from masq_invites where from_user = j2 and status = 'asking'), 'not asked: gone quiet');
  perform masq_cancel(j2);
end $$;
