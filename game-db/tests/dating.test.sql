\set ON_ERROR_STOP on
-- Part 56: dating, opt-in, and nothing without a yes.

\ir ../056_dating.sql
\ir ../056_dating.sql
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

insert into auth.users (email) values ('d1@date.test'), ('d2@date.test'), ('d3@date.test');

do $$
declare
  a uuid := pg_temp.uid('d1@date.test');
  b uuid := pg_temp.uid('d2@date.test');
  c uuid := pg_temp.uid('d3@date.test');
  q bigint;
  v jsonb;
  mind0 numeric;
begin
  perform life_start(a, 'lagos');
  perform life_start(b, 'lagos');
  perform life_start(c, 'lagos');

  -- Opt-in: nobody can be asked until they've switched it on.
  perform pg_temp.fails('you first', 'you_closed', format('select date_ask(%L, %L, %L, null)', a, b, 'date'));
  perform dating_set(a, true, 'Jollof critic', true);
  perform pg_temp.fails('they haven''t', 'they_closed', format('select date_ask(%L, %L, %L, null)', a, b, 'date'));
  perform dating_set(b, true, null, true);
  perform pg_temp.fails('a date first', 'not_together', format('select date_ask(%L, %L, %L, null)', a, b, 'kiss'));

  -- A no, and it can't be asked again today.
  q := date_ask(a, b, 'date', 'Suya at Lekki?');
  perform pg_temp.fails('one ask at a time', 'waiting', format('select date_ask(%L, %L, %L, null)', a, b, 'date'));
  perform pg_temp.check(date_answer(b, q, false) = 'no', 'not now');
  perform pg_temp.fails('no means no today', 'said_no', format('select date_ask(%L, %L, %L, null)', a, b, 'date'));

  -- A yes: a couple, and both feel better.
  q := date_ask(b, a, 'date', null);
  perform pg_temp.check((dating_mine(a)->'asked'->0->>'id')::bigint = q, 'asked out');
  mind0 := (select mind from lives where user_id = a);
  perform date_answer(a, q, true);
  perform pg_temp.check(partner_of(a) = b and partner_of(b) = a and (select mind from lives where user_id = a) > mind0, 'together');
  perform pg_temp.check(exists (select 1 from gossip where kind = 'couple'), 'the gossip column noticed');
  perform dating_set(c, true, null, true);
  perform pg_temp.fails('one at a time', 'they_taken', format('select date_ask(%L, %L, %L, null)', c, a, 'date'));

  -- Moments: each one asked, each one a yes or a no.
  q := date_ask(a, b, 'kiss', null);
  perform pg_temp.check((dating_with(b, a)->'theyAsked'->>'act') = 'kiss' and (dating_with(a, b)->>'together')::boolean, 'a kiss asked');
  perform pg_temp.check(date_answer(b, q, true) = 'kiss', 'a yes');
  perform pg_temp.check((select status from date_asks where id = q) = 'yes', 'answered');
  q := date_ask(b, a, 'make_out_plus', null);
  perform date_withdraw(b, q);
  perform pg_temp.fails('withdrawn', 'gone', format('select date_answer(%L, %L, true)', a, q));

  -- Either can end it, any time; the other is told.
  perform date_end(b);
  perform pg_temp.check(partner_of(a) is null and exists (select 1 from notifications where user_id = a and kind = 'dating' and body like '%ended things%'), 'ended kindly');
  perform pg_temp.fails('not together now', 'not_together', format('select date_ask(%L, %L, %L, null)', a, b, 'hug'));

  -- Switching off turns down what's waiting.
  q := date_ask(c, a, 'date', null);
  perform dating_set(a, false, null, true);
  perform pg_temp.check((select status from date_asks where id = q) = 'no', 'off means no');
end $$;
