\set ON_ERROR_STOP on
-- Part 73: active time, the daily gift (once a day, a streak, capped) and Newtown's prize for a
-- challenge won (only real games, up to 5 a day).
\ir ../073_daily_money.sql
\ir ../073_daily_money.sql
\o /dev/null
update game_settings set value = 1.33 where key = 'challenge_bonus';
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
insert into auth.users (email) values ('a@dm.test'), ('b@dm.test'), ('c@dm.test');
update profiles set username = 'Ama' where email_key = 'a@dm.test';
update profiles set username = 'Ben' where email_key = 'b@dm.test';
update profiles set username = 'Cy' where email_key = 'c@dm.test';
insert into lives (user_id, region, granted) select id, 'lagos', 1000 from profiles where email_key in ('a@dm.test', 'b@dm.test');
update profiles set coins = 1000 where email_key like '%@dm.test';
do $$
declare
  a uuid := pg_temp.uid('a@dm.test');
  b uuid := pg_temp.uid('b@dm.test');
  c uuid := pg_temp.uid('c@dm.test');
  v jsonb;
  m int;
  id1 bigint;
begin
  -- Active time: one minute per ping, not faster.
  m := active_ping(a);
  m := active_ping(a);
  perform pg_temp.check(m = 1, 'pings closer than 50 seconds count once');
  update activity_days set last_ping = now() - interval '1 minute' where user_id = a;
  m := active_ping(a);
  perform pg_temp.check(m = 2, 'a ping a minute later counts');

  -- The gift: once a day, with a streak.
  v := daily_gift_status(a);
  perform pg_temp.check(not (v->>'claimed')::boolean and (v->>'streak')::int = 1 and (v->>'active_today')::int = 2, 'status before the gift');
  v := daily_gift_claim(a, 5, 'Your daily gift');
  perform pg_temp.check((v->>'amount')::numeric = 5 and (v->>'streak')::int = 1, 'the gift is paid');
  perform pg_temp.check((select coins from profiles where id = a) = 1005, 'the gift is in');
  perform pg_temp.check(exists (select 1 from notifications where user_id = a and kind = 'daily_gift'), 'told about it');
  v := daily_gift_claim(a, 5, 'again');
  perform pg_temp.check((v->>'already')::boolean and (select coins from profiles where id = a) = 1005, 'once a day');
  v := daily_gift_claim(b, 999, '');
  perform pg_temp.check((v->>'amount')::numeric = 40, 'the gift is capped');
end $$;

do $$
declare
  a uuid := pg_temp.uid('a@dm.test');
  b uuid := pg_temp.uid('b@dm.test');
  c uuid := pg_temp.uid('c@dm.test');
  v jsonb;
  ok boolean := false;
  id1 bigint;
begin
  -- Yesterday's gift makes today's a streak of 2.
  delete from daily_gifts where user_id = a;
  insert into daily_gifts (user_id, day, amount, streak) values (a, lagos_day() - 1, 5, 3);
  v := daily_gift_status(a);
  perform pg_temp.check((v->>'streak')::int = 4, 'a streak carries on from yesterday');
  -- No life, no gift.
  begin
    v := daily_gift_claim(c, 5, '');
  exception when others then
    ok := sqlerrm like 'no_life%';
  end;
  perform pg_temp.check(ok, 'no life: no gift');

  -- Newtown's prize: a real game won.
  update profiles set coins = 1000 where id in (a, b);
  v := challenge_open(a, 'lagos', 'whot', 10, 5, 5, 4, 33.33, 480);
  id1 := (v->>'id')::bigint;
  v := challenge_join(b, id1);
  update challenges set starts_at = now() - interval '1 second' where id = id1;
  perform challenge_begin(id1);
  v := challenge_report(b, id1, a, false);
  perform pg_temp.check((select coins from profiles where id = a) = 1000 - 10 + 18 + 1.33, 'won: the pot and Newtown''s prize');
  perform pg_temp.check((select coins from profiles where id = b) = 990, 'the loser gets no prize');
end $$;
\o
\echo 'daily money: all ok'
