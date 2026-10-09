-- Newtown, part 25: big towns stay fast.
-- A few rules used to look at every spot in the town to pick one (where a shield drops a ghost,
-- where the bot runs to in a tantrum). That gets slow as towns grow, so they now pick spots
-- directly. Same behaviour, same odds. Safe to run more than once. Run after parts 1-24.

create or replace function public.shield_save(p_round bigint, p_hider uuid, p_finder uuid, p_index int) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_try int;
  v_c int[];
  e public.entries;
  r public.rounds;
  v_share numeric;
  v_to int;
  v_radius int;
begin
  select * into r from public.rounds where id = p_round;
  select * into e from public.entries where round_id = p_round and user_id = p_hider for update;
  v_share := public.pay_for_find(p_round, p_hider, p_finder, p_index);
  -- Somewhere close that nobody's hiding in (it might have been searched: the shield can't tell).
  v_c := public.spiral_xy(e.tile);
  foreach v_radius in array array[2, 4, 8] loop
    -- Random spots around the hider, picked directly (no scan of the whole town).
    for k in 1..60 loop
      v_try := public.npc_xy_tile(v_c[1] + floor(random() * (2 * v_radius + 1))::int - v_radius,
                                  v_c[2] + floor(random() * (2 * v_radius + 1))::int - v_radius);
      if v_try <> e.tile and v_try < r.tile_count
         and not exists (select 1 from public.entries x where x.round_id = p_round and x.role = 'hider' and not x.caught and x.tile = v_try) then
        v_to := v_try;
        exit;
      end if;
    end loop;
    exit when v_to is not null;
  end loop;
  if v_to is null then v_to := e.tile; end if;
  update public.entries set
      shield_saved = true,
      tile = v_to,
      visited = case when v_to <> e.tile then array_append(visited, e.tile) else visited end,
      stake = 0,
      stake_weight = greatest(stake_weight - e.stake, 0),
      payout = 0,
      frozen_until = null
    where round_id = p_round and user_id = p_hider;
  perform public.notify(p_hider, p_round, 'shield',
    format('Your shield blocked %s''s find! You lost your stake but you''re still in, teleported nearby. You can move again.',
           coalesce((select username from public.profiles where id = p_finder), 'a seeker')), v_to);
  perform public.notify(p_finder, p_round, 'shielded',
    format('You found %s, but their shield teleported them somewhere nearby. You still got %s coins.',
           coalesce((select username from public.profiles where id = p_hider), 'a hider'), v_share), e.tile);
  return v_share;
end $$;

create or replace function public.world_event_tick() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_try int;
  r public.rounds;
  w record;
  v_bot uuid := '00000000-0000-0000-0000-00000000b07a';
  e public.entries;
  v_tile int;
  v_out text := 'idle';
begin
  select * into r from public.rounds where status = 'seek';
  if not found then return 'no hunt'; end if;
  perform public.plan_world_events(r.id);
  for w in select * from public.world_events where round_id = r.id and not started and now() >= starts_at and now() < ends_at for update loop
    update public.world_events set started = true where id = w.id;
    v_out := 'started ' || w.key;
    if w.key = 'bot_tantrum' then
      select * into e from public.entries where round_id = r.id and user_id = v_bot;
      if found and not e.caught then
        -- A random free spot, picked directly (no scan of the whole town).
        v_tile := null;
        for k in 1..200 loop
          v_try := floor(random() * r.tile_count)::int;
          if v_try <> e.tile
             and not exists (select 1 from public.searches s where s.round_id = r.id and s.tile = v_try)
             and not exists (select 1 from public.entries x where x.round_id = r.id and x.role = 'hider' and not x.caught and x.tile = v_try) then
            v_tile := v_try;
            exit;
          end if;
        end loop;
        if v_tile is not null then
          update public.entries set tile = v_tile, visited = array_append(visited, e.tile), moves = moves + 1, last_move_at = now()
            where round_id = r.id and user_id = v_bot;
          insert into public.events (round_id, kind, tile, detail)
            values (r.id, 'moved', e.tile, jsonb_build_object('name', r.bot_name, 'bot', true, 'user', null));
        end if;
      end if;
    end if;
  end loop;
  return v_out;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('shield_save', 'world_event_tick')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
