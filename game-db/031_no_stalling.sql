-- Newtown, part 31: no more winning a duel by sitting still.
-- - Once one player has thrown, the other has duel_throw_seconds (20) to throw. If they don't,
--   the player who threw gets the point. (Before, a ghost could just never throw and win when
--   the minute ran out level.) The same goes for a throw still waiting when the minute ends:
--   it counts before the duel is settled.
-- - A missed throw shows in the duel's throws with no move for the player who missed it.
-- - A hunter who loses is told "You lost 10 mint" (no more "went into the prize pool").
-- Safe to run more than once. Run after parts 1-30.

insert into public.game_settings (key, value, note) values
  ('duel_throw_seconds', 20, 'Once one player throws, how long the other has to throw before losing the point')
on conflict (key) do update set note = excluded.note;

alter table public.duels add column if not exists move_by timestamptz;

-- A duel as one of its players sees it (as in part 29, plus move_by: when the throw that's
-- waiting runs out, null if nobody is waiting on anybody). A missed throw is null in throws.
create or replace function public.duel_view(d public.duels, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with side as (select (p_user = d.ghost_id) as g)
  select jsonb_build_object(
    'id', d.id, 'game', d.game, 'status', d.status,
    'role', case when side.g then 'ghost' else 'hunter' end,
    'opponent', (select jsonb_build_object('id', p.id, 'name', p.username, 'avatar', p.avatar, 'level', p.level)
                 from public.profiles p where p.id = case when side.g then d.hunter_id else d.ghost_id end),
    'me', case when side.g then d.ghost_score else d.hunter_score end,
    'them', case when side.g then d.hunter_score else d.ghost_score end,
    'first_to', public.setting('duel_first_to')::int,
    'throws', coalesce((select jsonb_agg(jsonb_build_object(
                 'me', case when side.g then t->>'g' else t->>'h' end,
                 'them', case when side.g then t->>'h' else t->>'g' end,
                 'w', case when t->>'w' = 'tie' then 'tie'
                           when (t->>'w' = 'ghost') = side.g then 'me' else 'them' end) order by o)
               from jsonb_array_elements(d.throws) with ordinality x(t, o)), '[]'::jsonb),
    'my_move', case when side.g then d.ghost_move else d.hunter_move end,
    'they_moved', case when side.g then d.hunter_move is not null else d.ghost_move is not null end,
    'answer_by', d.answer_by, 'ends_at', d.ends_at, 'move_by', d.move_by, 'now', now(),
    'throw_seconds', public.setting('duel_throw_seconds')::int,
    'winner', case when d.winner is null then null when (d.winner = 'ghost') = side.g then 'me' else 'them' end,
    'reason', d.reason, 'fee', d.fee, 'reward', d.reward, 'portion', d.portion)
  from side
$$;

-- Settle a duel (the caller holds the game's lock). p_winner: 'ghost', 'hunter', or null to
-- call it off (the hunter gets the fee back). p_reason: score, time, no_answer, gave_up,
-- cancelled, game_over.
create or replace function public.duel_finish(p_duel bigint, p_winner text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  d public.duels;
  g public.entries;
  h public.entries;
  v_g text;
  v_h text;
  v_out int := public.setting('ghost_out_losses')::int;
  v_portion numeric := 0;
  v_reward numeric := 0;
  v_is_out boolean := false;
  v_golden boolean := false;
begin
  select * into d from public.duels where id = p_duel for update;
  if not found or d.status not in ('asked', 'playing') then return; end if;
  select username into v_g from public.profiles where id = d.ghost_id;
  select username into v_h from public.profiles where id = d.hunter_id;

  if p_winner is null then
    -- Called off: the hunter gets the fee back.
    update public.profiles set coins = coins + d.fee where id = d.hunter_id;
    perform public.log_coins(d.hunter_id, d.round_id, 'duel_refund', d.fee, false, 'Duel called off');
    update public.duels set status = 'void', reason = p_reason, finished_at = now(), ghost_move = null, hunter_move = null where id = p_duel;
    return;
  end if;

  select * into g from public.entries where round_id = d.round_id and user_id = d.ghost_id for update;
  select * into h from public.entries where round_id = d.round_id and user_id = d.hunter_id for update;

  if p_winner = 'hunter' then
    -- The fee back, and a slice of the ghost's stake: 80% to the hunter, 20% to the pool.
    update public.profiles set coins = coins + d.fee where id = d.hunter_id;
    perform public.log_coins(d.hunter_id, d.round_id, 'duel_refund', d.fee, false, 'Beat ' || coalesce(v_g, 'a ghost'));
    v_is_out := g.duel_losses + 1 >= v_out;
    v_portion := case when v_is_out then greatest(g.stake, 0)
                      else least(greatest(g.stake, 0), round(public.setting('hider_stake') / greatest(v_out, 1), 2)) end;
    if v_portion > 0 then
      if public.linked_accounts(d.hunter_id, d.ghost_id) then
        insert into public.flags (round_id, finder_id, hider_id, reason) values (d.round_id, d.hunter_id, d.ghost_id, 'linked accounts (duel)');
        v_reward := 0;
      else
        v_reward := round(v_portion * public.setting('finder_share'), 2);
      end if;
      if v_reward > 0 then
        update public.profiles set coins = coins + v_reward where id = d.hunter_id;
        perform public.log_coins(d.hunter_id, d.round_id, 'duel_reward', v_reward, false, 'Beat ' || coalesce(v_g, 'a ghost'));
      end if;
      perform public.pool_or_burn(d.round_id, v_portion - v_reward, 'Duel: ghost stake');
    end if;
    update public.entries
       set stake = greatest(stake - v_portion, 0), duel_losses = duel_losses + 1,
           caught = caught or v_is_out, caught_by = case when v_is_out then d.hunter_id else caught_by end
     where round_id = d.round_id and user_id = d.ghost_id;
    if v_is_out and not g.caught then
      update public.rounds set hiders_remaining = greatest(hiders_remaining - 1, 0) where id = d.round_id;
    end if;
    update public.entries set duel_wins = duel_wins + 1, last_duel_at = now() where round_id = d.round_id and user_id = d.hunter_id;
    perform public.notify(d.ghost_id, d.round_id, 'duel_lost', case when v_is_out
      then format('%s beat you. That''s %s losses: you''re out of this game.', coalesce(v_h, 'A hunter'), v_out)
      else format('%s beat you and took %s mint of your stake. %s more loss%s and you''re out.', coalesce(v_h, 'A hunter'),
                  v_portion, v_out - g.duel_losses - 1, case when v_out - g.duel_losses - 1 = 1 then '' else 'es' end) end);
    perform public.notify(d.hunter_id, d.round_id, 'duel_won',
      format('You beat %s! +%s mint, and your %s mint back.', coalesce(v_g, 'the ghost'), v_reward, d.fee)
      || case when h.duel_wins + 1 = public.setting('hunter_pool_wins')::int
              then format(' That''s %s wins: you''re in the prize pool!', h.duel_wins + 1) else '' end);
  else
    -- The ghost wins: the hunter's fee goes into the prize pool.
    perform public.pool_or_burn(d.round_id, d.fee, 'Duel fee');
    v_golden := not g.golden and g.duel_wins + 1 >= public.setting('ghost_golden_wins');
    update public.entries set duel_wins = duel_wins + 1, golden = golden or v_golden
     where round_id = d.round_id and user_id = d.ghost_id;
    update public.entries set duel_losses = duel_losses + 1, last_duel_at = now() where round_id = d.round_id and user_id = d.hunter_id;
    perform public.notify(d.ghost_id, d.round_id, 'duel_won', case when v_golden
      then format('You beat %s! That''s %s wins: you''re golden. Safe for the rest of the game, and in the prize pool!',
                  coalesce(v_h, 'a hunter'), g.duel_wins + 1)
      else format('You beat %s! %s more win%s and you turn golden.', coalesce(v_h, 'a hunter'),
                  public.setting('ghost_golden_wins')::int - g.duel_wins - 1,
                  case when public.setting('ghost_golden_wins')::int - g.duel_wins - 1 = 1 then '' else 's' end) end);
    perform public.notify(d.hunter_id, d.round_id, 'duel_lost',
      format('%s beat you%s. You lost %s mint.', coalesce(v_g, 'The ghost'),
             case p_reason when 'time' then ' (time ran out level, and a draw goes to the ghost)' else '' end, trim_scale(d.fee)));
  end if;

  update public.duels
     set status = 'done', winner = p_winner, reason = p_reason, portion = v_portion, reward = v_reward,
         finished_at = now(), ghost_move = null, hunter_move = null
   where id = p_duel;
  insert into public.events (round_id, kind, tile, detail)
    values (d.round_id, 'duel', g.tile, jsonb_build_object(
      'ghost', v_g, 'hunter', v_h, 'winner', p_winner, 'reason', p_reason,
      'out', v_is_out, 'golden', v_golden,
      'avatar', (select avatar from public.profiles where id = case when p_winner = 'ghost' then d.ghost_id else d.hunter_id end)));
end $$;

-- Is anything about this duel due? (an unanswered challenge, a throw nobody answered, the
-- end of the minute)
create or replace function public.duel_due(d public.duels) returns boolean
language sql stable as $$
  select coalesce((d.status = 'asked' and d.answer_by <= now())
      or (d.status = 'playing' and (d.ends_at <= now() or d.move_by <= now())), false)
$$;

-- One point (the caller holds the game's lock): add the throw, give the point, clear the
-- moves and the throw clock, and settle the duel if someone has got there. p_w: ghost,
-- hunter or tie; a missed throw is a null move.
create or replace function public.duel_point(p_duel bigint, p_g text, p_h text, p_w text) returns void
language plpgsql security definer set search_path = public as $$
declare d public.duels; v_first int := public.setting('duel_first_to')::int;
begin
  update public.duels
     set throws = throws || jsonb_build_array(jsonb_build_object('g', p_g, 'h', p_h, 'w', p_w)),
         ghost_score = ghost_score + (p_w = 'ghost')::int,
         hunter_score = hunter_score + (p_w = 'hunter')::int,
         ghost_move = null, hunter_move = null, move_by = null
   where id = p_duel returning * into d;
  if d.ghost_score >= v_first then perform public.duel_finish(p_duel, 'ghost', 'score');
  elsif d.hunter_score >= v_first then perform public.duel_finish(p_duel, 'hunter', 'score');
  end if;
end $$;

-- Settle duels that are due: an unanswered challenge is a loss for the ghost; a throw the other
-- player didn't answer in time is a point for whoever threw; a duel that ran out of time goes
-- to whoever is ahead (level: the ghost). The caller holds the game's lock.
create or replace function public.duel_tidy(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
declare d public.duels; v_n int := 0;
begin
  for d in select * from public.duels where round_id = p_round and status in ('asked', 'playing')
             and ((status = 'asked' and answer_by <= now()) or (status = 'playing' and (ends_at <= now() or move_by <= now())))
           order by id loop
    if d.status = 'asked' then
      perform public.duel_finish(d.id, 'hunter', 'no_answer');
    else
      -- One of them threw and the other didn't: the point goes to the one who threw.
      if (d.ghost_move is null) <> (d.hunter_move is null) then
        perform public.duel_point(d.id, d.ghost_move, d.hunter_move, case when d.ghost_move is not null then 'ghost' else 'hunter' end);
      end if;
      select * into d from public.duels where id = d.id;
      if d.status = 'playing' and d.ends_at <= now() then
        perform public.duel_finish(d.id, case when d.hunter_score > d.ghost_score then 'hunter' else 'ghost' end, 'time');
      elsif d.status = 'playing' then
        update public.duels set move_by = null where id = d.id and ghost_move is null and hunter_move is null;
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Any duel in this game that's due? (cheap: only live duels are looked at)
create or replace function public.duel_stale(p_round bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.duels d where d.round_id = p_round and d.status in ('asked', 'playing') and public.duel_due(d))
$$;

-- Throw rock, paper or scissors. The first throw of a point starts the other player's
-- duel_throw_seconds; when both have thrown, the point goes to the winner (a tie is thrown
-- again). First to duel_first_to wins the duel. Returns duel_view().
-- Errors: no_duel, not_yours, bad_move, not_playing.
create or replace function public.duel_move(p_user uuid, p_duel bigint, p_move text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  if p_move is null or p_move not in ('rock', 'paper', 'scissors') then raise exception 'bad_move'; end if;
  d := public.duel_lock(p_user, p_duel);  -- settles anything that's due first
  if d.status <> 'playing' then
    if d.status in ('done', 'void') then return public.duel_view(d, p_user); end if;
    raise exception 'not_playing';
  end if;
  if p_user = d.ghost_id and d.ghost_move is null then
    update public.duels set ghost_move = p_move where id = p_duel returning * into d;
  elsif p_user = d.hunter_id and d.hunter_move is null then
    update public.duels set hunter_move = p_move where id = p_duel returning * into d;
  end if;
  if d.ghost_move is not null and d.hunter_move is not null then
    perform public.duel_point(p_duel, d.ghost_move, d.hunter_move,
      case when d.ghost_move = d.hunter_move then 'tie' when public.rps_beats(d.ghost_move, d.hunter_move) then 'ghost' else 'hunter' end);
  elsif d.move_by is null then
    update public.duels set move_by = now() + make_interval(secs => public.setting('duel_throw_seconds')::int) where id = p_duel;
  end if;
  select * into d from public.duels where id = p_duel;
  return public.duel_view(d, p_user);
end $$;

-- One duel, as its player sees it now (settling it first if anything is due).
-- Errors: no_duel, not_yours.
create or replace function public.duel_state(p_user uuid, p_duel bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_duel;
  if not found then raise exception 'no_duel'; end if;
  if p_user not in (d.ghost_id, d.hunter_id) then raise exception 'not_yours'; end if;
  if public.duel_due(d) then
    d := public.duel_lock(p_user, p_duel);
  end if;
  return public.duel_view(d, p_user);
end $$;

-- ============================================================ privacy & access
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('duel_view', 'duel_finish', 'duel_due', 'duel_point', 'duel_tidy', 'duel_stale', 'duel_move', 'duel_state')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
