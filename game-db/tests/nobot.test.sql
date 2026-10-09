\set ON_ERROR_STOP on
-- Part 30: the bot no longer joins games as a ghost (so the ghost counts are only real
-- players), towns still start at 20 x 20, and the join window is 2 minutes.
\ir ../030_no_bot_ghost.sql
\o /dev/null

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok %', what;
end $$;
create function pg_temp.uid(e text) returns uuid language sql as $$ select id from profiles where email_key = e $$;
create function pg_temp.hiders(r bigint) returns bigint language sql as $$
  select count(*) from entries where round_id = r and role = 'hider'
$$;

-- Running part 30 again changes nothing.
\ir ../030_no_bot_ghost.sql

do $$
declare
  r rounds;
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
begin
  perform pg_temp.check(public.setting('join_minutes')::int = 2, 'ghosts join in the first 2 minutes');
  -- The game that was on when part 30 went in: the bot is out, and the counts are real ghosts only.
  select * into r from rounds where status <> 'done';
  if found then
    perform pg_temp.check(not exists (select 1 from entries where round_id = r.id and user_id = v_bot), 'the bot left the game that was on');
    perform pg_temp.check(r.hiders_total = pg_temp.hiders(r.id), format('ghost count %s matches the ghosts (%s)', r.hiders_total, pg_temp.hiders(r.id)));
  end if;

  -- Play every open game out; the next one has no ghosts, no bot and a 20 x 20 town.
  for i in 1..6 loop
    select * into r from rounds where status <> 'done';
    exit when not found;
    if r.status = 'join' then update rounds set join_ends_at = now() - interval '1 second' where id = r.id;
    else update rounds set seek_ends_at = now() - interval '1 second' where id = r.id; end if;
    perform tick();
  end loop;
  perform tick();
  select * into r from rounds where status <> 'done';
  perform pg_temp.check(found and r.status = 'join', 'a new game is waiting for ghosts');
  perform pg_temp.check(r.hiders_total = 0 and r.hiders_remaining = 0, 'a new game starts with no ghosts');
  perform pg_temp.check(not exists (select 1 from entries where round_id = r.id), 'nobody (not even the bot) is in it yet');
  perform pg_temp.check(r.tile_count = public.setting('base_tiles')::int and r.tile_count = 400, 'the town still starts at 20 x 20');
  perform pg_temp.check(r.join_ends_at = r.seek_ends_at - interval '58 minutes' or r.join_ends_at <= now() + interval '61 seconds',
                        format('joining ends 2 minutes past the hour (or a minute from now when late): %s, hunt ends %s', r.join_ends_at, r.seek_ends_at));
end $$;

-- A real ghost joins: the counts go up by one, and the hunt starts with just them.
insert into auth.users (email) values ('nb1@nobot.test');
update profiles set username = 'Qnbone', coins = 500 where email_key = 'nb1@nobot.test';
select join_round(pg_temp.uid('nb1@nobot.test'), 'hider');
do $$
declare r rounds;
begin
  select * into r from rounds where status <> 'done';
  perform pg_temp.check(r.hiders_total = 1 and r.hiders_remaining = 1, 'one real ghost: the game says 1 ghost');
  update rounds set join_ends_at = now() - interval '1 second' where id = r.id;
  perform tick();
  select * into r from rounds where id = r.id;
  perform pg_temp.check(r.status = 'seek', 'the hunt starts');
  perform pg_temp.check((select tile from entries where round_id = r.id and user_id = pg_temp.uid('nb1@nobot.test')) between 0 and r.tile_count - 1,
                        'the ghost has a spot for their light');
  perform pg_temp.check(jsonb_array_length(duel_board(pg_temp.uid('nb1@nobot.test'))->'ghosts') = 1, 'the board lists just the one ghost');
  -- Ticks during the hunt don't bring the bot back.
  perform tick();
  perform pg_temp.check(not exists (select 1 from entries e join profiles p on p.id = e.user_id where e.round_id = r.id and p.is_bot),
                        'no bot during the hunt');
end $$;
\o
select 'nobot: all checks passed' as result;
