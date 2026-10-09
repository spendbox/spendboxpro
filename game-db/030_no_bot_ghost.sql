-- Newtown, part 30: the bot stops playing, and joining as a ghost takes 2 minutes.
-- - The bot no longer joins every game as a ghost. It sat in the ghost counts, so the game said
--   "1 ghost left" when it meant the bot. Towns still start at 20 x 20 (the base_tiles setting),
--   so nothing else needs it. Its name still signs the town news in the chat.
-- - Ghosts join in the first 2 minutes of the hour (it was 3).
-- Safe to run more than once. Run after parts 1-29.

update public.game_settings set value = 2 where key = 'join_minutes';

-- The game that's on now: take the bot out of it (and out of its ghost counts).
with gone as (
  delete from public.entries e
   using public.rounds r, public.profiles p
   where e.round_id = r.id and r.status <> 'done' and p.id = e.user_id and p.is_bot
  returning e.round_id, e.caught
)
update public.rounds r
   set hiders_total = greatest(r.hiders_total - 1, 0),
       hiders_remaining = greatest(r.hiders_remaining - (case when gone.caught then 0 else 1 end), 0)
  from gone
 where r.id = gone.round_id;

-- The round clock (as in part 21), minus the bot: a new game starts with no ghosts at all.
create or replace function public.tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_id bigint;
  v_join int := public.setting('join_minutes')::int;
  v_min_hunt int := coalesce(public.setting('min_hunt_minutes')::int, 15);
  v_hour timestamptz := date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC';
  v_join_end timestamptz;
  v_next timestamptz;
  v_pick int;
  h record;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status <> 'done' for update;

  -- Keep every game on the hour: one still running to an odd time (started on the old timing)
  -- is pulled in to end at the next hour mark, so the next countdown starts on the dot.
  if found and r.seek_ends_at > now()
     and r.seek_ends_at <> date_trunc('hour', r.seek_ends_at at time zone 'UTC') at time zone 'UTC' then
    v_next := v_hour + interval '1 hour';
    update public.rounds
      set seek_ends_at = v_next,
          join_ends_at = least(join_ends_at, v_next - interval '1 minute')
      where id = r.id
      returning * into r;
  end if;

  if not found then
    -- Too late in this hour for a proper hunt: line up for the next hour instead.
    if now() > v_hour + make_interval(mins => 60 - v_min_hunt) then
      v_hour := v_hour + interval '1 hour';
    end if;
    -- Join until a couple of minutes past the hour (at least a minute from now, if we're late).
    v_join_end := greatest(v_hour + make_interval(mins => v_join), now() + interval '1 minute');
    -- A fresh 20 x 20 town with an empty pool and no ghosts yet; the hunt ends on the next hour mark.
    insert into public.rounds (join_ends_at, seek_ends_at, pool, tile_count, hiders_total, hiders_remaining, bot_name)
    values (v_join_end, v_hour + interval '1 hour', 0, public.setting('base_tiles')::int, 0, 0, 'Seed Bot')
    returning id into v_id;
    -- (The bot's name still signs the town news in the chat.)
    update public.rounds set bot_name = coalesce(
      (select name from public.bot_names order by id offset (v_id % greatest((select count(*) from public.bot_names), 1)) limit 1),
      'Seed Bot') where id = v_id;
    return 'round created';
  end if;

  if r.status = 'join' and now() >= r.join_ends_at then
    -- Give each ghost a random free spot for their light. Picks spots directly instead of
    -- shuffling the whole town, so it stays quick however big the town gets.
    for h in select user_id from public.entries where round_id = r.id and role = 'hider' order by random() loop
      for k in 1..200 loop
        v_pick := floor(random() * r.tile_count)::int;
        exit when not exists (select 1 from public.entries x where x.round_id = r.id and x.tile = v_pick);
      end loop;
      update public.entries set tile = v_pick where round_id = r.id and user_id = h.user_id;
    end loop;
    update public.rounds set status = 'seek' where id = r.id;
    v_out := 'seeking started';
    r.status := 'seek';
  end if;

  if r.status = 'seek' and now() >= r.seek_ends_at then
    perform public.finalize_round(r.id);
    -- The next game is set up on the next tick (seconds later: any open screen asks for one),
    -- and its countdown is pinned to the hour, so it still starts on time.
    return 'round finished';
  end if;
  return v_out;
end $$;
revoke all on function public.tick() from public, anon, authenticated;
grant execute on function public.tick() to service_role;
