\set ON_ERROR_STOP on
-- Part 95: events on the map. Hosting (the rules and the limits), going, coming in (the ticket,
-- early doors, a full room), the start notice, the host's share once it's over, calling it off
-- (tickets back), ending early, the stage, reputation, and running it twice.
\ir ../095_events.sql
\ir ../096_event_refund.sql
\ir ../097_party_sizes.sql
\ir ../101_event_audience.sql
\ir ../095_events.sql
\ir ../096_event_refund.sql
\ir ../097_party_sizes.sql
\ir ../103_call_off_refunds.sql
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
-- Host an event (the usual numbers: price cap 400, 3 a day).
create function pg_temp.host(u uuid, starts timestamptz, mins int, price numeric, cap int default 300) returns bigint language sql as $$
  select (event_open(u, 'lagos', 'party', 'street_party', 'Ada''s street party', 'Bring your dancing shoes', 5, 5, 'Awolowo Road', true,
                     starts, mins, price, 400, cap, 3)->>'id')::bigint
$$;
-- Move an event in time (instead of waiting).
create function pg_temp.shift(p_id bigint, starts timestamptz, ends timestamptz) returns void language sql as $$
  update hosted_events set starts_at = starts, ends_at = ends where id = p_id
$$;

insert into auth.users (email) values ('a@ev.test'), ('b@ev.test'), ('c@ev.test'), ('d@ev.test'), ('e@ev.test');
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key like '%@ev.test' and email_key <> 'e@ev.test';
update profiles set coins = 1000 where email_key like '%@ev.test';

do $$
declare
  a uuid := pg_temp.uid('a@ev.test');
  b uuid := pg_temp.uid('b@ev.test');
  c uuid := pg_temp.uid('c@ev.test');
  d uuid := pg_temp.uid('d@ev.test');
  e uuid := pg_temp.uid('e@ev.test');
  v jsonb;
  id1 bigint;
  id2 bigint;
  id3 bigint;
  id4 bigint;
  coins0 numeric;
  tax0 numeric;
  bank0 numeric;
begin
  -- The rules for hosting.
  perform pg_temp.fails('a title is needed', 'bad_title', format($q$select event_open(%L, 'lagos', 'party', 'rave', ' x ', '', 0, 0, '', false, now(), 60, 0, 400, 100, 3)$q$, a));
  perform pg_temp.fails('only parties and stages', 'bad_kind', format($q$select event_open(%L, 'lagos', 'market', 'rave', 'Big sale', '', 0, 0, '', false, now(), 60, 0, 400, 100, 3)$q$, a));
  perform pg_temp.fails('at most a week ahead', 'too_far', format($q$select event_open(%L, 'lagos', 'party', 'rave', 'Rave', '', 0, 0, '', false, now() + interval '9 days', 60, 0, 400, 100, 3)$q$, a));
  perform pg_temp.fails('15 minutes to 4 hours', 'bad_length', format($q$select event_open(%L, 'lagos', 'party', 'rave', 'Rave', '', 0, 0, '', false, now(), 600, 0, 400, 100, 3)$q$, a));
  perform pg_temp.fails('no ticket over the most', 'bad_price', format($q$select event_open(%L, 'lagos', 'party', 'rave', 'Rave', '', 0, 0, '', false, now(), 60, 401, 400, 100, 3)$q$, a));
  perform pg_temp.fails('no life, no hosting', 'no_life', format($q$select event_open(%L, 'lagos', 'party', 'rave', 'Rave', '', 0, 0, '', false, now(), 60, 0, 400, 100, 3)$q$, e));

  -- A party tomorrow with a ₥100 ticket.
  id1 := pg_temp.host(a, now() + interval '1 day', 120, 100);
  perform pg_temp.check(event_hosting(a) = id1, 'hosting it');
  perform pg_temp.check((select going from hosted_event_guests where event_id = id1 and user_id = a), 'the host is going');
  perform pg_temp.fails('one event at a time', 'busy', format('select pg_temp.host(%L, now(), 60, 0)', a));
  -- People say they're going; one changes their mind.
  v := event_rsvp(b, id1, true);
  v := event_rsvp(c, id1, true);
  perform pg_temp.check((v->>'count')::int = 3, 'three going: ' || v::text);
  v := event_rsvp(c, id1, false);
  perform pg_temp.check((v->>'count')::int = 2, 'one is not going after all');
  perform pg_temp.fails('the host is always going', 'host', format('select event_rsvp(%L, %s, false)', a, id1));
  perform pg_temp.fails('not in before the doors open', 'not_yet', format('select event_enter(%L, %s, 5)', b, id1));
  -- It starts: the people going are told (once).
  perform pg_temp.shift(id1, now() - interval '1 minute', now() + interval '2 hours');
  v := event_sweep('lagos');
  perform pg_temp.check(v ? b::text and not v ? a::text and not v ? c::text, 'those going are told it started (not the host, not who said no): ' || v::text);
  perform pg_temp.check(exists (select 1 from notifications where user_id = b and kind = 'event' and body like '%has started%'), 'b has the notice');
  perform pg_temp.check(jsonb_array_length(event_sweep('lagos')) = 0, 'told only once');
  -- Coming in: the ticket once, then free to come and go.
  v := event_enter(b, id1, 5);
  perform pg_temp.check((v->>'paid')::numeric = 100 and (select coins from profiles where id = b) = 900, 'b paid the ticket');
  v := event_enter(b, id1, 5);
  perform pg_temp.check((v->>'already')::boolean and (select coins from profiles where id = b) = 900, 'coming back in is free');
  v := event_enter(c, id1, 5);
  v := event_enter(d, id1, 5);
  v := event_enter(a, id1, 5);
  perform pg_temp.check((v->>'paid')::numeric = 0, 'the host comes in free');
  perform pg_temp.check((select pool from hosted_events where id = id1) = 300, 'three tickets held');
  perform pg_temp.check((select coins from profiles where id = a) = 1000, 'the host isn''t paid before it''s over');
  perform pg_temp.fails('a stranger can''t set the stage', 'not_host', format($q$select event_stage(%L, %s, '{"mode":"none"}')$q$, b, id1));
  perform event_stage(a, id1, '{"mode": "video", "video": "dQw4w9WgXcQ", "playing": true}');
  perform pg_temp.check((select stage->>'video' from hosted_events where id = id1) = 'dQw4w9WgXcQ', 'the host sets the stage');
  perform pg_temp.fails('the stage is kept small', 'bad_stage', format('select event_stage(%L, %s, %L)', a, id1, jsonb_build_object('x', repeat('y', 9000))));
  -- It's over: tickets are taxed like pay. ₥300 of tickets: ₥20.93 VAT (7.5% inside the price),
  -- ₥279.07 earned, ₥19.53 income tax (7%), ₥259.54 to the host. Taxes go to the treasuries.
  tax0 := (select coalesce(sum(amount), 0) from treasury_ledger where kind in ('vat', 'income_tax'));
  bank0 := (select balance from world_bank where id = 1);
  perform pg_temp.check(event_settle(id1) = 'on', 'nothing to settle while it''s on');
  perform pg_temp.shift(id1, now() - interval '3 hours', now() - interval '1 minute');
  perform event_sweep('lagos');
  perform pg_temp.check((select status from hosted_events where id = id1) = 'closed', 'settled by the sweep');
  perform pg_temp.check((select coins from profiles where id = a) = 1259.54, 'the host has the tickets less VAT and income tax');
  perform pg_temp.check((select coalesce(sum(amount), 0) from treasury_ledger where kind in ('vat', 'income_tax')) - tax0 = 40.46, 'VAT and income tax went to the treasuries');
  perform pg_temp.check(exists (select 1 from ledger where user_id = a and kind = 'income_tax' and amount = -19.53), 'the income tax shows on the host''s pay slips');
  perform pg_temp.check((select balance from world_bank where id = 1) - bank0 = 40.46, 'the World Bank counts the VAT and income tax');
  perform pg_temp.check((life_earnings(a, 7)->>'total')::numeric >= 279.07, 'ticket sales count as earnings in Finance');
  perform pg_temp.check(event_settle(id1) = 'closed' and (select coins from profiles where id = a) = 1259.54, 'paid only once');
  perform pg_temp.check(exists (select 1 from notifications where user_id = a and body like '%3 people came%'), 'the host is told how it went');
  perform pg_temp.check(event_hosting(a) is null, 'free to host another');
  perform pg_temp.fails('too late to come in', 'over', format('select event_enter(%L, %s, 5)', b, id1));
  perform pg_temp.check((event_rep(a)->>'hosted')::int = 1, 'hosting one that 3 people came to counts');
  perform pg_temp.check((event_rep(b)->>'attended')::int = 1, 'going to one counts');

  -- A small one, full; then called off: tickets back.
  id2 := pg_temp.host(a, now(), 60, 50, 2);
  v := event_enter(b, id2, 5);
  v := event_enter(a, id2, 5);
  perform pg_temp.fails('full', 'full', format('select event_enter(%L, %s, 5)', c, id2));
  perform pg_temp.fails('only the host can call it off', 'not_host', format('select event_cancel(%L, %s)', b, id2));
  perform pg_temp.check(event_cancel(a, id2) = 'cancelled', 'called off');
  perform pg_temp.check((select coins from profiles where id = b) = 900, 'the ticket is back');
  perform pg_temp.check(exists (select 1 from notifications where user_id = b and body like '%called off%'), 'b is told');
  perform pg_temp.fails('can''t come into one called off', 'cancelled', format('select event_enter(%L, %s, 5)', c, id2));
  perform pg_temp.check((event_rep(b)->>'attended')::int = 1, 'one called off doesn''t count');

  -- Three a day at most; the host can end one early.
  id3 := pg_temp.host(a, now() + interval '1 hour', 60, 0);
  perform pg_temp.fails('only the host can end it', 'not_host', format('select event_end(%L, %s)', b, id3));
  perform pg_temp.fails('can''t end before it starts', 'not_started', format('select event_end(%L, %s)', a, id3));
  perform pg_temp.shift(id3, now(), now() + interval '1 hour');
  perform pg_temp.check(event_end(a, id3) = 'closed', 'ended early and settled');
  perform pg_temp.fails('three a day', 'too_many', format('select pg_temp.host(%L, now(), 60, 0)', a));

  -- Hosting a party costs: paid at once, back if it's called off before it starts.
  coins0 := (select coins from profiles where id = c);
  v := event_open(c, 'lagos', 'party', 'street_party', 'Chi''s street party', '', 50, 50, 'Allen Avenue', true, now() + interval '1 day', 60, 0, 400, 50, 3, 70, 16);
  id4 := (v->>'id')::bigint;
  perform pg_temp.check((v->>'fee')::numeric = 70 and (select coins from profiles where id = c) = coins0 - 70, 'the hosting fee is paid');
  perform pg_temp.fails('not enough for the fee', 'not_enough', format($q$select event_open(%L, 'lagos', 'party', 'rave', 'Rave', '', 200, 200, '', true, now(), 60, 0, 400, 50, 3, 99999, 16)$q$, d));
  -- Another street party on the same stretch at the same time: no. Further along, or later: yes.
  perform pg_temp.fails('street parties don''t overlap', 'street_taken', format($q$select event_open(%L, 'lagos', 'party', 'rave', 'Rave', '', 55, 52, 'Allen Avenue', true, now() + interval '1 day 30 minutes', 60, 0, 400, 50, 3, 0, 16)$q$, d));
  v := event_open(d, 'lagos', 'party', 'rave', 'Rave', '', 55, 52, 'Allen Avenue', true, now() + interval '1 day 2 hours', 60, 0, 400, 50, 3, 0, 16);
  perform pg_temp.check((v->>'id') is not null, 'the same street later is fine');
  perform event_cancel(d, (v->>'id')::bigint);
  v := event_open(d, 'lagos', 'party', 'rave', 'Rave', '', 80, 50, 'Allen Avenue', true, now() + interval '1 day', 60, 0, 400, 50, 3, 0, 16);
  perform pg_temp.check((v->>'id') is not null, 'further along the road is fine');
  perform event_cancel(d, (v->>'id')::bigint);
  perform pg_temp.check(event_cancel(c, id4) = 'cancelled', 'called off');
  perform pg_temp.check((select coins from profiles where id = c) = coins0, 'called off before it starts: the fee is back');
  -- Once it has started, the fee is spent (the city's when it ends)... unless fewer than 10 came
  -- (part 96): then it all comes back.
  v := event_open(c, 'lagos', 'party', 'owambe', 'Quiet owambe', '', 50, 50, 'Allen Avenue', true, now(), 60, 0, 400, 50, 3, 70, 16);
  id4 := (v->>'id')::bigint;
  perform event_enter(b, id4, 5);
  perform pg_temp.check(event_end(c, id4) = 'closed', 'ended with 1 guest');
  perform pg_temp.check((select coins from profiles where id = c) = coins0, 'fewer than 10 came: the fee is back');
  perform pg_temp.check(exists (select 1 from notifications where user_id = c and body like '%Fewer than 10 came, so your ₥70 hosting fee is back%'), 'and the host is told');
  perform pg_temp.check(not exists (select 1 from treasury_ledger where kind = 'event_permit' and note like 'Event permit: Quiet owambe%'), 'no permit for it');
  -- Enough came (the line set to 1 here, as if 10 had): the fee is the state's.
  update game_settings set value = 1 where key = 'event_min_guests';
  bank0 := (select balance from world_bank where id = 1);
  v := event_open(c, 'lagos', 'party', 'owambe', 'Owambe', '', 50, 50, 'Allen Avenue', true, now(), 60, 0, 400, 50, 3, 70, 16);
  id4 := (v->>'id')::bigint;
  perform event_enter(b, id4, 5);
  perform pg_temp.check(event_end(c, id4) = 'closed', 'ended');
  update game_settings set value = 10 where key = 'event_min_guests';
  perform pg_temp.check((select coins from profiles where id = c) = coins0 - 70, 'enough came: the fee is spent');
  -- Called off after it started, with nobody in: the fee comes back too.
  -- (Paid from Fun money, back into the wallet: b's money in all is the same.)
  coins0 := (select coins from profiles where id = b) + (select coalesce(sum(balance), 0) from life_pots where user_id = b);
  v := event_open(b, 'lagos', 'party', 'rave', 'Empty rave', '', 70, 70, 'Allen Avenue', true, now(), 60, 0, 400, 50, 3, 40, 16);
  perform pg_temp.check(event_cancel(b, (v->>'id')::bigint) = 'cancelled', 'called off after it started');
  perform pg_temp.check((select coins from profiles where id = b) + (select coalesce(sum(balance), 0) from life_pots where user_id = b) = coins0, 'with nobody in: the fee is back');
  perform pg_temp.check(exists (select 1 from treasury_ledger where kind = 'event_permit' and note like 'Event permit: Owambe%'), 'the permit went to the state');
  perform pg_temp.check((select balance from world_bank where id = 1) - bank0 = 70, 'the World Bank counts the permit (and not before the party started)');

  -- A paid event called off while it's on: whoever came in gets their ticket back, and is told
  -- (part 103), even if they never said they were going.
  v := event_open(c, 'lagos', 'party', 'rave', 'Paid rave', '', 90, 90, 'Club Quilox', false, now(), 60, 5, 400, 50, 50, 0, 16);
  coins0 := (select coins from profiles where id = d) + (select coalesce(sum(balance), 0) from life_pots where user_id = d);
  perform event_enter(d, (v->>'id')::bigint, 5);
  perform pg_temp.check((select coins from profiles where id = d) + (select coalesce(sum(balance), 0) from life_pots where user_id = d) = coins0 - 5, 'the ticket is paid going in');
  update hosted_event_guests set going = false where user_id = d and event_id = (v->>'id')::bigint;
  perform pg_temp.check(event_cancel(c, (v->>'id')::bigint) = 'cancelled', 'a paid party called off while it''s on');
  perform pg_temp.check((select coins from profiles where id = d) + (select coalesce(sum(balance), 0) from life_pots where user_id = d) = coins0, 'whoever came in gets their ticket back');
  perform pg_temp.check(exists (select 1 from notifications where user_id = d and body like '"Paid rave" was called off%paid back%'), 'and is told, going or not');

  -- Parties of any size (part 97): a carnival 1 km round for 10,000 people; another one whose area
  -- would meet it can't be on at the same time, one far enough away can.
  insert into lives (user_id, region, granted) values (e, 'lagos', 1000) on conflict do nothing;
  v := event_open(e, 'lagos', 'party', 'rave', 'Lekki Carnival', '', 300, 300, 'Admiralty Way', true, now() + interval '2 days', 120, 0, 400, 10000, 3, 0, 16, 1000);
  perform pg_temp.check((select radius_m from hosted_events where id = (v->>'id')::bigint) = 1000 and (select capacity from hosted_events where id = (v->>'id')::bigint) = 10000, 'a carnival for 10,000');
  perform pg_temp.fails('their areas would meet', 'street_taken', format($q$select event_open(%L, 'lagos', 'party', 'rave', 'Rival carnival', '', 318, 300, 'Admiralty Way', true, now() + interval '2 days', 60, 0, 400, 300, 3, 0, 16, 1000)$q$, b));
  perform pg_temp.fails('no bigger than 10,000', 'bad_capacity', format($q$select event_open(%L, 'lagos', 'party', 'rave', 'Too big', '', 900, 900, '', true, now() + interval '2 days', 60, 0, 400, 20000, 3, 0, 16, 1000)$q$, b));
  perform pg_temp.fails('talks are one spot', 'bad_size', format($q$select event_open(%L, 'lagos', 'stage', 'talk', 'Big talk', '', 900, 900, '', false, now() + interval '2 days', 60, 0, 400, 100, 3, 0, 16, 1000)$q$, b));
  perform event_cancel(e, (v->>'id')::bigint);
  -- The events list's counts, worked out in the database (however many guests).
  v := event_counts(array[id1], b);
  perform pg_temp.check((v->0->>'going')::int = (select count(*) from hosted_event_guests where event_id = id1 and going)
    and (v->0->>'came')::int = (select count(*) from hosted_event_guests where event_id = id1 and entered_at is not null)
    and (v->0->>'me_in')::boolean, 'event counts: going, came in, and you');

  -- The walkthrough's third mission is going to an event now (not winning a challenge).
  update hosted_event_guests set entered_at = entered_at - interval '1 hour' where user_id = b;
  v := tutorial_check(b, '{"name": 1, "hi": 1, "win": 5}');
  perform pg_temp.check(not (v->>'win')::boolean, 'mission 3 not done yet (earlier events don''t count)');
  v := event_open(d, 'lagos', 'stage', 'talk', 'Money talk', '', 60, 60, 'Terra Kulture', false, now(), 60, 0, 400, 50, 3, 0, 16);
  perform event_enter(b, (v->>'id')::bigint, 5);
  coins0 := (select coins from profiles where id = b);
  v := tutorial_check(b, '{"name": 1, "hi": 1, "win": 5}');
  perform pg_temp.check((v->>'win')::boolean and v->'paid' ? 'win', 'going into an event does mission 3');
  perform pg_temp.check((select coins from profiles where id = b) = coins0 + 5, 'and pays its reward');
  v := tutorial_check(b, '{"name": 1, "hi": 1, "win": 5}');
  perform pg_temp.check(not (v->'paid' ? 'win') and (select coins from profiles where id = b) = coins0 + 5, 'paid once');

  -- Who hears about a new event: the nearest, twice as many as it holds, or everyone within 4 km.
  insert into profiles (id, username) select ('00000000-0000-0000-0000-0000000001'||lpad(i::text, 2, '0'))::uuid, 'aud' || i from generate_series(10, 19) i;
  insert into lives (user_id, region, home_unit) select ('00000000-0000-0000-0000-0000000001'||lpad(i::text, 2, '0'))::uuid, 'aud',
    'aud:' || (case when i < 15 then (i - 10) * 8 else (i - 14) * 100 end) || ',0/1' from generate_series(10, 19) i;
  perform pg_temp.check(cardinality(event_tell('aud', 0, 0, 2, 40, '{}', 'hi')) = 5, 'a small party tells everyone within 4 km');
  perform pg_temp.check(cardinality(event_tell('aud', 0, 0, 8, 40, '{}', 'hi')) = 8, 'a bigger one, the nearest twice its size');
  perform pg_temp.check(event_tell('aud', 1000, 0, 2, 40, '{}', 'hi') @> array['00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0000-000000000119']::uuid[], 'far from everyone, still the nearest');
  perform pg_temp.check(cardinality(event_tell('aud', 0, 0, 2, 40, array['00000000-0000-0000-0000-000000000110']::uuid[], 'hi')) = 4, 'friends (told apart) are left out');
  perform pg_temp.check((select count(*) from notifications where body = 'hi') = 19, 'each one gets a notice');

end $$;

\o
\echo 'events: all ok'
