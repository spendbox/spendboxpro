-- Newtown, part 21: games on the hour.
-- Every game starts at the top of an hour (UTC): a 3-minute join window (ghosts sign up), then
-- the hunt until the next hour mark, on the dot. Then the next game's countdown starts straight
-- away. A game that's already running on the old timing (say it started at 7:16) is pulled in
-- to end at the next hour mark, so from then on every countdown starts at 8:00, 9:00... on the
-- dot. Catching every ghost no longer ends the game early: the hunt always runs to the hour.
-- Safe to run more than once (run it again if you ran an earlier copy). Run after parts 1-20.

insert into public.game_settings (key, value, note) values
  ('join_minutes', 3, 'Join window at the start of every hour (minutes)'),
  ('min_hunt_minutes', 15, 'A game created later than this many minutes before the hour waits for the next hour')
on conflict (key) do update set note = excluded.note;
-- The join window is now 3 minutes (it used to be 10).
update public.game_settings set value = 3 where key = 'join_minutes' and value = 10;

-- The round clock: games are lined up on the hour.
create or replace function public.tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
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
    -- Join until 3 minutes past the hour (at least a minute from now, if we're running late).
    v_join_end := greatest(v_hour + make_interval(mins => v_join), now() + interval '1 minute');
    -- A fresh city with an empty pool; the hunt ends on the next hour mark.
    insert into public.rounds (join_ends_at, seek_ends_at, pool, tile_count, hiders_total, hiders_remaining, bot_name)
    values (v_join_end, v_hour + interval '1 hour', 0, public.setting('base_tiles')::int, 1, 1, 'Seed Bot')
    returning id into v_id;
    update public.rounds set bot_name = coalesce(
      (select name from public.bot_names order by id offset (v_id % greatest((select count(*) from public.bot_names), 1)) limit 1),
      'Seed Bot') where id = v_id;
    insert into public.entries (round_id, user_id, role) values (v_id, v_bot, 'hider');
    return 'round created';
  end if;

  if r.status = 'join' and now() >= r.join_ends_at then
    -- Drop each ghost on a random free spot. Picks spots directly instead of shuffling the
    -- whole town, so it stays quick however big the town gets (ghosts never fill more than
    -- a twentieth of it, so a free spot turns up in a try or two).
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

  if r.status = 'seek' then
    begin
      v_out := v_out || ' / bot: ' || public.bot_think(r.id);
    exception when others then
      v_out := v_out || ' / bot error: ' || sqlerrm;
    end;
  end if;
  return v_out;
end $$;

-- Searching: the same as part 17, except that finding the last ghost no longer ends the game.
create or replace function public.search_tile(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  v_cost numeric;
  v_cool int;
  res jsonb;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Hunting is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  select * into p from public.profiles where id = p_user;
  if p.frozen then raise exception 'This account is frozen'; end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if en.user_id is not null and en.role = 'hider' then raise exception 'Ghosts cannot search'; end if;
  if public.event_area(r.id, 'blackout_district', p_tile) then raise exception 'It''s too dark to search there right now (blackout)'; end if;
  v_cool := public.search_gate(p_user);
  if en.user_id is null then perform public.join_round(p_user, 'seeker'); end if;
  select * into p from public.profiles where id = p_user;

  if p.free_search_day is distinct from current_date then
    v_cost := 0;
    update public.profiles set free_search_day = current_date where id = p_user;
  else
    v_cost := public.search_price(r.searched_count, r.tile_count);
  end if;
  if public.event_area(r.id, 'lucky_street', p_tile) then v_cost := 0; end if;
  perform public.charge_hunter(r.id, p_user, v_cost, 'search_fee');

  res := public.search_resolve(r.id, p_user, p_tile, v_cost, false);
  -- Every ghost found? The hunt still runs to the top of the hour (part 21).
  return res || jsonb_build_object(
    'result', case when (res->>'caught')::int > 0 then 'caught' when (res->>'shielded')::int > 0 then 'shielded'
                   when (res->>'decoys')::int > 0 then 'decoy' else 'empty' end,
    'cost', v_cost, 'cooldown', v_cool);
end $$;

create or replace function public.search_area(p_user uuid, p_tile int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  en public.entries;
  v_cost numeric;
  v_cool int;
  v_tile int;
  res jsonb;
  v_caught int := 0;
  v_shielded int := 0;
  v_decoys int := 0;
  v_reward numeric := 0;
  v_bot boolean := false;
  v_names text[] := '{}';
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Hunting is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That spot is not in the city'; end if;
  select * into p from public.profiles where id = p_user;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if p.level < public.setting('big_search_level') then
    raise exception 'Big searches unlock at level %', public.setting('big_search_level')::int;
  end if;
  select * into en from public.entries where round_id = r.id and user_id = p_user;
  if en.user_id is not null and en.role = 'hider' then raise exception 'Ghosts cannot search'; end if;
  if public.event_area(r.id, 'blackout_district', p_tile) then raise exception 'It''s too dark to search there right now (blackout)'; end if;
  v_cool := public.search_gate(p_user);
  if en.user_id is null then perform public.join_round(p_user, 'seeker'); end if;

  v_cost := round(public.search_price(r.searched_count, r.tile_count) * public.setting('big_search_multiplier'), 2);
  perform public.charge_hunter(r.id, p_user, v_cost, 'search_fee');
  insert into public.events (round_id, kind, tile, detail) values (r.id, 'area_search', p_tile, jsonb_build_object('radius', 1));

  -- The 3x3 block around the spot, worked out directly (no scan of the whole town).
  for v_tile in
    select t from (
      select public.npc_xy_tile(c[1] + dx, c[2] + dy) t
      from (select public.spiral_xy(p_tile) c) s, generate_series(-1, 1) dx, generate_series(-1, 1) dy
    ) n where t < r.tile_count order by t
  loop
    res := public.search_resolve(r.id, p_user, v_tile, round(v_cost / 9, 2), true);
    v_caught := v_caught + (res->>'caught')::int;
    v_shielded := v_shielded + (res->>'shielded')::int;
    v_decoys := v_decoys + (res->>'decoys')::int;
    v_reward := v_reward + (res->>'reward')::numeric;
    v_bot := v_bot or (res->>'bot')::boolean;
    if res->>'names' <> '' then v_names := v_names || (res->>'names'); end if;
  end loop;
  return jsonb_build_object(
    'result', case when v_caught > 0 then 'caught' when v_shielded > 0 then 'shielded' when v_decoys > 0 then 'decoy' else 'empty' end,
    'caught', v_caught, 'shielded', v_shielded, 'decoys', v_decoys, 'reward', v_reward, 'bot', v_bot,
    'names', array_to_string(v_names, ', '), 'cost', v_cost, 'cooldown', v_cool, 'area', true);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('tick', 'search_tile', 'search_area')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
