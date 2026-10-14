\set ON_ERROR_STOP on
-- Part 95: events on the map. Hosting (the rules and the limits), going, coming in (the ticket,
-- early doors, a full room), the start notice, the host's share once it's over, calling it off
-- (tickets back), ending early, the stage, reputation, and running it twice.
\ir ../095_events.sql
\ir ../095_events.sql
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
  -- It's over: the host gets 90%, the rest burns, and is told how it went.
  perform pg_temp.check(event_settle(id1) = 'on', 'nothing to settle while it''s on');
  perform pg_temp.shift(id1, now() - interval '3 hours', now() - interval '1 minute');
  perform event_sweep('lagos');
  perform pg_temp.check((select status from hosted_events where id = id1) = 'closed', 'settled by the sweep');
  perform pg_temp.check((select coins from profiles where id = a) = 1270, 'the host has 90% of the tickets');
  perform pg_temp.check(event_settle(id1) = 'closed' and (select coins from profiles where id = a) = 1270, 'paid only once');
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
end $$;

\o
\echo 'events: all ok'
