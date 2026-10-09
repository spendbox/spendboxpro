\set ON_ERROR_STOP on
-- Part 31: once one player throws, the other has 20 seconds; a throw nobody answers is a point
-- for the one who threw (also when the minute runs out), so a ghost can't win by sitting still.
-- A hunter who loses is told "You lost 10 mint".
\ir ../031_no_stalling.sql
\o /dev/null

create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
create function pg_temp.set_coins(u uuid, n numeric) returns void language sql as $$
  select log_coins(u, null, 'topup', n - coins) from profiles where id = u;
  update profiles set coins = n where id = u;
$$;
create function pg_temp.close_games() returns void language plpgsql as $$
declare r rounds;
begin
  for i in 1..6 loop
    select * into r from rounds where status <> 'done';
    exit when not found;
    if r.status = 'join' then update rounds set join_ends_at = now() - interval '1 second' where id = r.id;
    else update rounds set seek_ends_at = now() - interval '1 second' where id = r.id; end if;
    perform tick();
  end loop;
end $$;
-- A fresh duel between the ghost and the hunter, answered and under way.
create function pg_temp.new_duel(g uuid, h uuid) returns bigint language plpgsql as $$
declare d bigint;
begin
  update entries set last_duel_at = null where user_id = h and round_id = (select max(id) from rounds);
  d := (duel_challenge(h, g)->>'id')::bigint;
  perform duel_answer(g, d);
  return d;
end $$;
-- Pretend the throw clock (or the minute) has run out.
create function pg_temp.throw_late(d bigint) returns void language sql as $$ update duels set move_by = now() - interval '1 second' where id = d $$;

-- Running part 31 again changes nothing.
\ir ../031_no_stalling.sql
\o /dev/null

select pg_temp.close_games();
insert into auth.users (email) values ('sg1@stall.test'), ('sg2@stall.test'), ('sh1@stall.test');
update profiles set username = 'Qsghost' where email_key = 'sg1@stall.test';
update profiles set username = 'Qsboo' where email_key = 'sg2@stall.test';
update profiles set username = 'Qshunt' where email_key = 'sh1@stall.test';
select pg_temp.set_coins(pg_temp.uid(e), 1000) from unnest(array['sg1@stall.test', 'sg2@stall.test', 'sh1@stall.test']) e;
select tick();
select join_round(pg_temp.uid('sg1@stall.test'), 'hider');
select join_round(pg_temp.uid('sg2@stall.test'), 'hider');
update rounds set join_ends_at = now() - interval '1 second' where status = 'join';
select tick();

do $$
declare g uuid := pg_temp.uid('sg1@stall.test'); h uuid := pg_temp.uid('sh1@stall.test'); d bigint; v jsonb;
begin
  delete from world_events where round_id = (select id from rounds where status = 'seek');
  perform pg_temp.check(public.setting('duel_throw_seconds')::int = 20, 'the other player has 20 seconds to throw');
  d := pg_temp.new_duel(g, h);
  v := duel_state(h, d);
  perform pg_temp.check(v->>'move_by' is null and (v->>'throw_seconds')::int = 20, 'no throw clock till someone throws');

  -- The hunter throws; the ghost sits still.
  v := duel_move(h, d, 'rock');
  perform pg_temp.check((v->>'move_by')::timestamptz between now() + interval '19 seconds' and now() + interval '21 seconds',
                        'the hunter throws: the ghost has 20 seconds');
  v := duel_state(g, d);
  perform pg_temp.check((v->>'they_moved')::boolean and v->>'move_by' is not null, 'the ghost sees the clock running');
  perform pg_temp.throw_late(d);
  v := duel_state(h, d);
  perform pg_temp.check(v->>'status' = 'playing' and (v->>'me')::int = 1 and (v->>'them')::int = 0
                        and v->'throws'->0->>'me' = 'rock' and v->'throws'->0->>'them' is null and v->'throws'->0->>'w' = 'me'
                        and v->>'move_by' is null and v->>'my_move' is null,
                        'the ghost didn''t throw in time: the point goes to the hunter (no move shown for the ghost)');
  -- And again: the hunter wins the duel without the ghost ever throwing.
  perform duel_move(h, d, 'paper');
  perform pg_temp.throw_late(d);
  v := duel_state(h, d);
  perform pg_temp.check(v->>'status' = 'done' and v->>'winner' = 'me' and v->>'reason' = 'score',
                        'a ghost who never throws loses the duel');
end $$;

do $$
declare g uuid := pg_temp.uid('sg2@stall.test'); h uuid := pg_temp.uid('sh1@stall.test'); d bigint; v jsonb;
begin
  -- The ghost throws, the hunter doesn't: the point goes to the ghost.
  d := pg_temp.new_duel(g, h);
  perform duel_move(g, d, 'scissors');
  perform pg_temp.throw_late(d);
  v := duel_state(g, d);
  perform pg_temp.check((v->>'me')::int = 1 and (v->>'them')::int = 0 and v->'throws'->0->>'them' is null,
                        'it works both ways: the ghost threw, the hunter didn''t, the ghost gets the point');
  -- A normal throw still works, and clears the clock.
  perform duel_move(h, d, 'rock');
  v := duel_move(g, d, 'paper');
  perform pg_temp.check((v->>'me')::int = 2 and v->>'status' = 'done' and v->>'winner' = 'me', 'both throw: paper beats rock, the ghost wins 2-0');
  perform pg_temp.check((select body from notifications where user_id = h and kind = 'duel_lost' order by id desc limit 1)
                        = 'Qsboo beat you. You lost 10 mint.', 'the hunter is told "You lost 10 mint"');
end $$;

do $$
declare g uuid := pg_temp.uid('sg2@stall.test'); h uuid := pg_temp.uid('sh1@stall.test'); d bigint; v jsonb;
begin
  -- The minute runs out with the hunter's throw unanswered (and the throw clock not yet up):
  -- the throw counts first, so the hunter is ahead and wins on time.
  d := pg_temp.new_duel(g, h);
  perform duel_move(h, d, 'rock');
  update duels set ends_at = now() - interval '1 second' where id = d;
  v := duel_state(h, d);
  perform pg_temp.check(v->>'status' = 'done' and v->>'winner' = 'me' and v->>'reason' = 'time' and (v->>'me')::int = 1,
                        'the minute ends with the ghost''s throw missing: the hunter''s throw counts, the hunter wins');
  -- Nobody throws at all: level when time runs out, so the ghost still wins the draw.
  d := pg_temp.new_duel(g, h);
  update duels set ends_at = now() - interval '1 second' where id = d;
  v := duel_state(h, d);
  perform pg_temp.check(v->>'status' = 'done' and v->>'winner' = 'them' and v->>'reason' = 'time', 'nobody throws: a draw still goes to the ghost');
  perform pg_temp.check((select body from notifications where user_id = h and kind = 'duel_lost' order by id desc limit 1)
                        like '%(time ran out level, and a draw goes to the ghost). You lost 10 mint.', 'and the hunter is told why');
end $$;

-- The board settles a throw nobody answered too (the map asks every few seconds).
do $$
declare g uuid := pg_temp.uid('sg2@stall.test'); h uuid := pg_temp.uid('sh1@stall.test'); d bigint;
begin
  d := pg_temp.new_duel(g, h);
  perform duel_move(g, d, 'rock');
  perform pg_temp.throw_late(d);
  perform pg_temp.check(duel_stale((select round_id from duels where id = d)), 'a throw nobody answered counts as due');
  perform duel_board(h);
  perform pg_temp.check((select ghost_score from duels where id = d) = 1, 'the board settles it');
  perform duel_give_up(h, d);
end $$;

select pg_temp.check(not has_function_privilege('authenticated', 'public.duel_point(bigint,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.duel_point(bigint,text,text,text)', 'execute'), 'the new functions are server-only');

\o
select 'stalling: all checks passed' as result;
