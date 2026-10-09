\set ON_ERROR_STOP on
-- Part 21: every game starts on the hour (UTC) with a 3-minute join window and ends on the
-- next hour mark; the next countdown starts straight away; finding everyone doesn't end it.
\ir ../021_hourly_rounds.sql
select value as join_minutes from game_settings where key = 'join_minutes';
-- Make sure a game is on, play it to the end, and let the next tick set up the next one.
select tick() as make_sure;
update rounds set join_ends_at = now() - interval '2 seconds' where status = 'join';
select tick() as hunt_starts;
update rounds set seek_ends_at = now() - interval '1 second' where status = 'seek';
select tick() = 'round finished' as finished;
select tick() = 'round created' as next_game_created;
do $$
declare r public.rounds;
begin
  select * into r from rounds where status <> 'done';
  if not found then raise exception 'no new game after the last one finished'; end if;
  if r.status <> 'join' then raise exception 'new game should be in its join window, is %', r.status; end if;
  if extract(minute from r.seek_ends_at at time zone 'UTC') <> 0 or extract(second from r.seek_ends_at at time zone 'UTC') <> 0 then
    raise exception 'hunt should end on the hour, ends at %', r.seek_ends_at;
  end if;
  if r.seek_ends_at <= now() or r.seek_ends_at > now() + interval '2 hours' then raise exception 'odd end time %', r.seek_ends_at; end if;
  if r.join_ends_at < now() then raise exception 'join window already over'; end if;
  if r.seek_ends_at - r.join_ends_at < interval '15 minutes' then raise exception 'hunt too short: % to %', r.join_ends_at, r.seek_ends_at; end if;
  if r.join_ends_at <> date_trunc('hour', r.seek_ends_at at time zone 'UTC') at time zone 'UTC' - interval '57 minutes'
     and r.join_ends_at > now() + interval '61 seconds' then
    raise exception 'join window should end 3 minutes past the hour (or a minute from now when late), is %', r.join_ends_at;
  end if;
  raise notice 'ok: game % joins until % and hunts until % (UTC)', r.id,
    to_char(r.join_ends_at at time zone 'UTC', 'HH24:MI:SS'), to_char(r.seek_ends_at at time zone 'UTC', 'HH24:MI:SS');
end $$;
-- A game that's still running isn't touched by another tick.
select tick() as again;
select count(*) = 1 as one_open_game from rounds where status <> 'done';
