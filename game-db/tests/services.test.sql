\set ON_ERROR_STOP on
-- Part 44: services. Only property owners offer; in-game prices are held and paid on confirmation
-- (less VAT) with the service's effect; declines refund; requests can be taken; jobs marked done pay
-- by themselves after a while.
\ir ../044_services.sql
\ir ../044_services.sql
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

insert into auth.users (email) values ('s1@svc.test'), ('s2@svc.test');
update profiles set username = 'Provider' where email_key = 's1@svc.test';
update profiles set username = 'Buyer' where email_key = 's2@svc.test';

do $$
declare
  a uuid := pg_temp.uid('s1@svc.test');
  b uuid := pg_temp.uid('s2@svc.test');
  o uuid;
  r uuid;
  j uuid;
  v jsonb;
begin
  perform life_start(a, 'lagos');
  perform life_start(b, 'lagos');
  perform pg_temp.fails('only owners offer', 'not_owner', format('select service_offer(%L, %L, %L, %L, %L, 50, %L, null, null)', a, 'game', 'home', 'Home makeover', 'I arrange homes beautifully', 'Yaba'));
  perform property_buy(a, 'lagos', 'lagos:500,500/0', '{"id":"lagos:500,500","kind":"flats","units":[{"id":"lagos:500,500/0"}]}', 100, 'home', 30, 'Flat', 1);
  o := service_offer(a, 'game', 'home', 'Home makeover', 'I arrange homes beautifully', 50, 'Yaba', null, null);
  perform service_offer(a, 'real', 'Hair and beauty', 'Braids at home', 'Braids and cornrows in your home', 15000, 'Yaba', '08012345678', null);
  v := service_board(b);
  perform pg_temp.check(jsonb_array_length(v->'offers') = 2 and not (v->>'canOffer')::boolean, 'the board lists offers; a non-owner can''t offer');

  update profiles set coins = 100 where id = b;
  update lives set mind = 50 where user_id = b;
  j := service_book(b, o, '{"mind": 5}');
  perform pg_temp.check((select coins from profiles where id = b) = 50, 'the price is held');
  perform pg_temp.fails('only the provider marks it done', 'not_now', format('select service_job(%L, %L, %L)', b, j, 'done'));
  perform service_job(a, j, 'done');
  update profiles set coins = 0 where id = a;
  perform service_job(b, j, 'confirm');
  perform pg_temp.check((select coins from profiles where id = a) = 46.25 and (select mind from lives where user_id = b) = 55, 'confirmed: paid less VAT, and the buyer feels better');

  -- Declined: the buyer gets it back.
  j := service_book(b, o, null);
  perform service_job(a, j, 'decline');
  perform pg_temp.check((select coins from profiles where id = b) = 50, 'declined: refunded');

  -- A request taken by an owner; done and left: pays by itself after 6 hours.
  r := service_request(b, 'game', 'party', 'Birthday party', 'Plan a small birthday party for me', 30, 'Surulere', null, null);
  j := service_take(a, r, '{"mind": 8}');
  perform pg_temp.check((select status from service_requests where id = r) = 'taken' and (select coins from profiles where id = b) = 20, 'request taken, budget held');
  perform service_job(a, j, 'done');
  update service_jobs set done_at = now() - interval '7 hours' where id = j;
  perform service_board(b);
  perform pg_temp.check((select status from service_jobs where id = j) = 'paid', 'paid by itself after 6 hours');
  perform pg_temp.fails('can''t book your own', 'own', format('select service_book(%L, %L, null)', a, o));
end $$;

\o
select 'services: all checks passed' as result;
