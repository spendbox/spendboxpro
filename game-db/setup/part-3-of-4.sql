-- Newtown database, set-up part 3 of 4 (made by scripts/sql-setup-parts.mjs from game-db/).
-- Paste the parts into a NEW Supabase project's SQL Editor in order, running each before the next.

-- ======================================================== 031_no_stalling.sql
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

-- ======================================================== 032_bank_heist.sql
-- Newtown, part 32: rob the bank (a huge risk).
-- Every city has a grand bank, and its vault holds the game's prize pool. Anyone signed in can
-- try to rob it while a game is on, once an hour:
-- - The quiet job: stake heist_quiet_stake (100) mint; heist_quiet_chance (25%) of getting away
--   with heist_quiet_share (10%) of the vault.
-- - The big heist: stake heist_big_stake (300) mint; heist_big_chance (10%) of getting away with
--   heist_big_share (35%) of the vault.
-- - Got away: the stake back, plus the loot (out of the prize pool, at most heist_max_loot).
-- - Caught: the stake is lost, and a fine of heist_fine_share (10%) of the mint you have left (at
--   most heist_fine_max, 1,000). Both go into the prize pool. Everyone hears about it either way.
-- The server rolls the dice; the screen only shows the drama. No new mint: it moves between the
-- robber and the prize pool.
-- Safe to run more than once. Run after parts 1-31.

insert into public.game_settings (key, value, note) values
  ('heist_quiet_stake',   100,  'Bank robbery, quiet job: mint staked'),
  ('heist_quiet_chance',  0.25, 'Bank robbery, quiet job: chance of getting away'),
  ('heist_quiet_share',   0.10, 'Bank robbery, quiet job: share of the vault (prize pool) taken'),
  ('heist_big_stake',     300,  'Bank robbery, big heist: mint staked'),
  ('heist_big_chance',    0.10, 'Bank robbery, big heist: chance of getting away'),
  ('heist_big_share',     0.35, 'Bank robbery, big heist: share of the vault (prize pool) taken'),
  ('heist_max_loot',      5000, 'Most mint one robbery can take'),
  ('heist_fine_share',    0.10, 'Caught robbing the bank: fine, as a share of the mint left'),
  ('heist_fine_max',      1000, 'Caught robbing the bank: biggest fine'),
  ('heist_min_vault',     100,  'The vault (prize pool) needs at least this much to be worth robbing'),
  ('heist_cooldown_minutes', 60, 'Wait between bank robbery attempts')
on conflict (key) do update set note = excluded.note;

create table if not exists public.bank_heists (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null check (plan in ('quiet', 'big')),
  stake numeric(14,2) not null,
  success boolean not null,
  loot numeric(14,2) not null default 0,
  fine numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bank_heists_user_idx on public.bank_heists (user_id, created_at desc);
alter table public.bank_heists enable row level security; -- no policies: only the server reads it

-- What the robbery screen shows: what's in the vault, the two plans (stake, chance, what you'd
-- take right now), and whether you can try now (and if not, why). why: no_game, cooldown,
-- empty_vault, not_enough, frozen, no_name, or null.
create or replace function public.bank_heist_info(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_last timestamptz;
  v_until timestamptz;
  v_max numeric := public.setting('heist_max_loot');
  v_why text;
begin
  select * into r from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  select * into p from public.profiles where id = p_user;
  select max(created_at) into v_last from public.bank_heists where user_id = p_user;
  if v_last is not null then
    v_until := v_last + make_interval(mins => public.setting('heist_cooldown_minutes')::int);
    if v_until <= now() then v_until := null; end if;
  end if;
  v_why := case
    when r.id is null then 'no_game'
    when p.id is null or p.username is null then 'no_name'
    when p.frozen or p.age_blocked_at is not null then 'frozen'
    when v_until is not null then 'cooldown'
    when r.pool < public.setting('heist_min_vault') then 'empty_vault'
    when p.coins < public.setting('heist_quiet_stake') then 'not_enough'
  end;
  return jsonb_build_object(
    'vault', coalesce(r.pool, 0),
    'coins', coalesce(p.coins, 0),
    'cooldown_until', v_until,
    'can', v_why is null,
    'why', v_why,
    'fine_share', public.setting('heist_fine_share'),
    'fine_max', public.setting('heist_fine_max'),
    'min_vault', public.setting('heist_min_vault'),
    'plans', jsonb_build_array(
      jsonb_build_object('key', 'quiet', 'stake', public.setting('heist_quiet_stake'), 'chance', public.setting('heist_quiet_chance'),
                         'loot', least(round(coalesce(r.pool, 0) * public.setting('heist_quiet_share'), 2), v_max)),
      jsonb_build_object('key', 'big', 'stake', public.setting('heist_big_stake'), 'chance', public.setting('heist_big_chance'),
                         'loot', least(round(coalesce(r.pool, 0) * public.setting('heist_big_share'), 2), v_max))));
end $$;

-- Try to rob the bank with plan 'quiet' or 'big'. Returns { success, plan, stake, loot, fine,
-- coins, vault }. Errors: bad_plan, no_game, unknown_player, no_name, frozen, cooldown:<seconds>,
-- empty_vault, not_enough:<stake>.
create or replace function public.bank_heist(p_user uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_last timestamptz;
  v_wait numeric;
  v_stake numeric;
  v_chance numeric;
  v_share numeric;
  v_loot numeric := 0;
  v_fine numeric := 0;
  v_ok boolean;
  v_name text;
begin
  if p_plan is null or p_plan not in ('quiet', 'big') then raise exception 'bad_plan'; end if;
  select * into r from public.rounds where status in ('join', 'seek') order by id desc limit 1 for update;
  if not found then raise exception 'no_game'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select max(created_at) into v_last from public.bank_heists where user_id = p_user;
  if v_last is not null then
    v_wait := public.setting('heist_cooldown_minutes') * 60 - extract(epoch from (now() - v_last));
    if v_wait > 0.5 then raise exception 'cooldown:%', ceil(v_wait)::int; end if;
  end if;
  if r.pool < public.setting('heist_min_vault') then raise exception 'empty_vault'; end if;
  v_stake := public.setting(case when p_plan = 'big' then 'heist_big_stake' else 'heist_quiet_stake' end);
  v_chance := public.setting(case when p_plan = 'big' then 'heist_big_chance' else 'heist_quiet_chance' end);
  v_share := public.setting(case when p_plan = 'big' then 'heist_big_share' else 'heist_quiet_share' end);
  if p.coins < v_stake then raise exception 'not_enough:%', v_stake; end if;
  v_name := p.username;

  -- The stake goes down first.
  update public.profiles set coins = coins - v_stake where id = p_user;
  perform public.log_coins(p_user, r.id, 'heist_stake', -v_stake, false, 'Bank robbery (' || p_plan || ')');
  v_ok := random() < v_chance;
  if v_ok then
    -- Got away: the stake back, and the loot out of the vault (the prize pool).
    v_loot := least(round(r.pool * v_share, 2), public.setting('heist_max_loot'));
    update public.rounds set pool = pool - v_loot where id = r.id;
    perform public.log_coins(null, r.id, 'pool_heist', -v_loot, false, 'Bank robbed by ' || v_name);
    update public.profiles set coins = coins + v_stake + v_loot where id = p_user;
    perform public.log_coins(p_user, r.id, 'heist_stake_back', v_stake, false, 'Bank robbery: got away');
    perform public.log_coins(p_user, r.id, 'heist_loot', v_loot, false, 'Bank robbery: the loot');
    perform public.notify(p_user, r.id, 'heist', format('You robbed the bank and got away with %s mint!', trim_scale(v_loot)));
  else
    -- Caught: the stake and a fine go into the prize pool.
    select least(round(greatest(coins, 0) * public.setting('heist_fine_share'), 2), public.setting('heist_fine_max')) into v_fine
      from public.profiles where id = p_user;
    update public.profiles set coins = coins - v_fine where id = p_user;
    if v_fine > 0 then perform public.log_coins(p_user, r.id, 'heist_fine', -v_fine, false, 'Caught robbing the bank'); end if;
    perform public.pool_or_burn(r.id, v_stake + v_fine, 'Bank robbery: caught');
    perform public.notify(p_user, r.id, 'heist', format('The police caught you robbing the bank. You lost %s mint.', trim_scale(v_stake + v_fine)));
  end if;
  insert into public.bank_heists (round_id, user_id, plan, stake, success, loot, fine) values (r.id, p_user, p_plan, v_stake, v_ok, v_loot, v_fine);
  insert into public.events (round_id, kind, tile, detail)
    values (r.id, 'heist', null, jsonb_build_object('name', v_name, 'success', v_ok, 'loot', v_loot, 'lost', v_stake + v_fine, 'plan', p_plan, 'avatar', p.avatar));
  return jsonb_build_object('success', v_ok, 'plan', p_plan, 'stake', v_stake, 'loot', v_loot, 'fine', v_fine,
    'coins', (select coins from public.profiles where id = p_user), 'vault', (select pool from public.rounds where id = r.id));
end $$;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.bank_heists from public, anon, authenticated;
  grant all on table public.bank_heists to service_role;
  revoke all on sequence public.bank_heists_id_seq from public, anon, authenticated;
  grant all on sequence public.bank_heists_id_seq to service_role;
end $$;
revoke all on function public.bank_heist_info(uuid) from public, anon, authenticated;
grant execute on function public.bank_heist_info(uuid) to service_role;
revoke all on function public.bank_heist(uuid, text) from public, anon, authenticated;
grant execute on function public.bank_heist(uuid, text) to service_role;

-- ======================================================== 033_helicopters.sql
-- Newtown, part 33: helicopter rides.
-- Helicopters fly sightseeing loops over the town (see src/app/play/city/aircraft.ts), and like
-- the other rides each one is a chat room ("v:heli:<n>") with people on board ("npc:v:heli:<n>:<k>").
-- Safe to run more than once. Run after parts 1-32.

create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'
    or p_room ~ '^v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7}$',
    false)
$$;

create or replace function public.npc_id_ok(p_npc text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(char_length(p_npc) <= 60 and p_npc ~
    '^npc:(b:[0-9]{1,7}(:(g|r|o|f[0-9]{1,3}))?|balloon:[0-9]{1,2}|v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7}):[0-7]$', false)
$$;

-- ======================================================== 034_phone_photos.sql
-- Newtown, part 34: the phone camera and gallery.
-- Everyone signed in has a phone. Pictures they take (of the town, or selfies with their avatar)
-- are saved to their gallery, which belongs to their account: it goes with them from round to
-- round and town to town. The pictures themselves are files in a private storage bucket
-- ("photos", 1.5 MB each at most); this table remembers whose they are. A gallery holds
-- phone_gallery_max (300) pictures: taking one more lets the oldest go.
-- Safe to run more than once. Run after parts 1-33.

insert into public.game_settings (key, value, note) values
  ('phone_gallery_max', 300, 'Phone gallery: most pictures one person keeps (the oldest go first)'),
  ('phone_photos_per_hour', 120, 'Phone camera: most pictures one person can save in an hour')
on conflict (key) do update set note = excluded.note;

create table if not exists public.phone_photos (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  path text not null unique,
  kind text not null default 'photo' check (kind in ('photo', 'selfie')),
  place text check (char_length(place) <= 80),
  city text check (char_length(city) <= 60),
  width int not null default 0,
  height int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists phone_photos_user_idx on public.phone_photos (user_id, created_at desc, id desc);
alter table public.phone_photos enable row level security; -- no policies: only the server reads it

-- Save a picture that was just uploaded to storage. Returns the new row and the storage paths of
-- any old pictures that had to go to make room (the server deletes those files).
create or replace function public.phone_photo_add(
  p_user uuid, p_path text, p_kind text, p_place text, p_city text, p_width int, p_height int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_row public.phone_photos;
  v_gone text[];
  v_max int := public.setting('phone_gallery_max')::int;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if p_path is null or p_path !~ ('^' || p_user::text || '/[0-9]{1,16}-[a-z0-9]{1,12}\.jpg$') then raise exception 'bad_path'; end if;
  if (select count(*) from public.phone_photos where user_id = p_user and created_at > now() - interval '1 hour')
     >= public.setting('phone_photos_per_hour') then
    raise exception 'too_many';
  end if;
  insert into public.phone_photos (user_id, path, kind, place, city, width, height)
  values (p_user, p_path, case when p_kind = 'selfie' then 'selfie' else 'photo' end,
          nullif(left(btrim(coalesce(p_place, '')), 80), ''), nullif(left(btrim(coalesce(p_city, '')), 60), ''),
          greatest(0, least(coalesce(p_width, 0), 10000)), greatest(0, least(coalesce(p_height, 0), 10000)))
  returning * into v_row;
  with gone as (
    delete from public.phone_photos where id in (
      select id from public.phone_photos where user_id = p_user
      order by created_at desc, id desc offset greatest(v_max, 1)
    ) returning path
  )
  select coalesce(array_agg(path), '{}') into v_gone from gone;
  return jsonb_build_object('photo', to_jsonb(v_row), 'removed', to_jsonb(v_gone));
end $$;

-- One person's gallery, newest first.
create or replace function public.phone_photos_list(p_user uuid, p_limit int default 120, p_before bigint default null)
returns setof public.phone_photos
language sql stable security definer set search_path = public as $$
  select * from public.phone_photos
  where user_id = p_user and (p_before is null or id < p_before)
  order by created_at desc, id desc
  limit greatest(1, least(coalesce(p_limit, 120), 300))
$$;

-- Delete one of your own pictures. Returns its storage path (the server deletes the file), or
-- null when it isn't yours or is already gone.
create or replace function public.phone_photo_delete(p_user uuid, p_id bigint) returns text
language sql security definer set search_path = public as $$
  delete from public.phone_photos where id = p_id and user_id = p_user returning path
$$;

-- The pictures: private (only the server hands out short-lived links), JPEG, 1.5 MB at most.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('photos', 'photos', false, 1572864, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $$;

do $$
begin
  revoke all on table public.phone_photos from public, anon, authenticated;
  grant all on table public.phone_photos to service_role;
  revoke all on sequence public.phone_photos_id_seq from public, anon, authenticated;
  grant all on sequence public.phone_photos_id_seq to service_role;
end $$;
revoke all on function public.phone_photo_add(uuid, text, text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.phone_photo_add(uuid, text, text, text, text, int, int) to service_role;
revoke all on function public.phone_photos_list(uuid, int, bigint) from public, anon, authenticated;
grant execute on function public.phone_photos_list(uuid, int, bigint) to service_role;
revoke all on function public.phone_photo_delete(uuid, bigint) from public, anon, authenticated;
grant execute on function public.phone_photo_delete(uuid, bigint) to service_role;

-- ======================================================== 035_fees_and_jobs.sql
-- Newtown, part 35: first-visit fees, train fares, and jobs.
--
-- Fees. The first time you go into a place in a town (each hourly town is a new world) costs a
-- little mint, ₥0.10 for a house up to ₥5 for an international airport (the game works out the
-- price from what the place is). Going back is free for the rest of that town. Boarding a train
-- (a bullet train or the monorail) costs a fare every time. A share of every fee goes into the
-- prize pool (fee_pool_share); the rest is burned.
--
-- Jobs. Any commercial building can give you a job. You apply with a short trivia interview
-- about the town (the game asks and marks it); score below the job's pass mark and you can't
-- apply there again in that town. A job pays mint by the hour while the town lasts, up to
-- job_max_hours_day paid hours a day; pay is taxed (job_tax, into the prize pool). Every paid
-- minute adds to a skill (hospitality, finance...), and with a skill you get the same kind of
-- job in later towns without an interview, and a little more pay for each skill level.
--
-- Safe to run more than once. Run after parts 1-34.

insert into public.game_settings (key, value, note) values
  ('fee_pool_share',       0.5,  'Share of first-visit fees and train fares that goes into the prize pool (the rest burns)'),
  ('visit_fee_min',        0.1,  'Cheapest first visit to a place'),
  ('visit_fee_max',        5,    'Dearest first visit to a place'),
  ('fare_max',             5,    'Dearest train fare'),
  ('job_tax',              0.10, 'Tax on job pay (into the prize pool)'),
  ('job_max_hours_day',    8,    'Most paid job hours a day'),
  ('job_pay_max',          60,   'Most a job can pay an hour (before skill bonus)'),
  ('job_skill_bonus',      0.05, 'Extra pay per skill level'),
  ('job_skill_max_level',  10,   'Highest skill level'),
  ('job_skill_minutes',    30,   'Paid minutes for each skill level'),
  ('job_skip_interview_minutes', 10, 'Paid minutes in a skill before the same kind of job needs no interview')
on conflict (key) do update set note = excluded.note;

-- ============================================================ first visits and fares
create table if not exists public.place_visits (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (char_length(place) <= 40),
  fee numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id, place)
);

/**
 * Pay a fee: p_kind 'visit' (once per place per town; p_key is the place, e.g. 'b:123') or 'fare'
 * (every time; p_key is the ride, e.g. 'v:train:0'). Returns the fee paid (0 for a place you've
 * already been to this town) and your mint.
 */
create or replace function public.pay_fee(p_user uuid, p_kind text, p_key text, p_fee numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_fee numeric;
  v_pool numeric;
begin
  if p_kind is null or p_kind not in ('visit', 'fare') then raise exception 'bad_kind'; end if;
  if p_key is null or char_length(p_key) > 40 then raise exception 'bad_place'; end if;
  select * into r from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  if not found then return jsonb_build_object('paid', 0, 'first', false, 'coins', (select coins from public.profiles where id = p_user)); end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if p_kind = 'visit' then
    v_fee := round(least(public.setting('visit_fee_max'), greatest(public.setting('visit_fee_min'), coalesce(p_fee, 0))), 2);
    if exists (select 1 from public.place_visits where round_id = r.id and user_id = p_user and place = p_key) then
      return jsonb_build_object('paid', 0, 'first', false, 'coins', p.coins);
    end if;
  else
    v_fee := round(least(public.setting('fare_max'), greatest(0.1, coalesce(p_fee, 0))), 2);
  end if;
  if p.coins < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
  update public.profiles set coins = coins - v_fee where id = p_user;
  perform public.log_coins(p_user, r.id, case when p_kind = 'visit' then 'visit_fee' else 'fare' end, -v_fee, false,
    case when p_kind = 'visit' then 'First visit: ' else 'Fare: ' end || p_key);
  v_pool := round(v_fee * public.setting('fee_pool_share'), 2);
  perform public.pool_or_burn(r.id, v_pool, case when p_kind = 'visit' then 'First-visit fees' else 'Train fares' end);
  perform public.burn(r.id, v_fee - v_pool, case when p_kind = 'visit' then 'First-visit fees' else 'Train fares' end);
  if p_kind = 'visit' then
    insert into public.place_visits (round_id, user_id, place, fee) values (r.id, p_user, p_key, v_fee);
  end if;
  return jsonb_build_object('paid', v_fee, 'first', p_kind = 'visit', 'coins', p.coins - v_fee);
end $$;

/** The places you've already been to in this town (so the game knows what's free). */
create or replace function public.my_visits(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(v.place), '[]'::jsonb)
  from public.place_visits v
  where v.user_id = p_user and v.round_id = (select id from public.rounds where status in ('join', 'seek') order by id desc limit 1)
$$;

-- ============================================================ jobs
create table if not exists public.jobs (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (char_length(place) <= 40),
  place_name text not null check (char_length(place_name) <= 80),
  job text not null check (job ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 60),
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  pay_hour numeric(14,2) not null check (pay_hour > 0),
  interviewed boolean not null default true,
  hired_at timestamptz not null default now(),
  ends_at timestamptz not null,
  paid_until timestamptz not null default now()
);
create index if not exists jobs_user_idx on public.jobs (user_id, hired_at desc);
-- One job at a time in a town.
create unique index if not exists jobs_one_open on public.jobs (round_id, user_id) where ends_at > paid_until;

create table if not exists public.job_bans (
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null,
  score int not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id, place)
);

create table if not exists public.job_skills (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  minutes numeric(12,2) not null default 0,
  primary key (user_id, skill)
);

-- What's been paid today (for the daily cap): paid hours per player per UTC day.
create table if not exists public.job_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  hours numeric(10,4) not null default 0,
  primary key (user_id, day)
);

create or replace function public.skill_level(p_minutes numeric) returns int
language sql stable set search_path = public as $$
  select least(public.setting('job_skill_max_level')::int, floor(coalesce(p_minutes, 0) / public.setting('job_skill_minutes'))::int)
$$;

/**
 * Collect the pay owed for your jobs (the open one up to now, finished ones up to their end):
 * pay × hours (plus the skill bonus), capped at job_max_hours_day paid hours a day, taxed into
 * the prize pool. Adds the paid minutes to the job's skill. Returns gross, tax, net and hours.
 */
create or replace function public.job_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  j public.jobs;
  r_now bigint;
  v_until timestamptz;
  v_hours numeric;
  v_left numeric;
  v_level int;
  v_rate numeric;
  v_gross numeric := 0;
  v_tax numeric;
  v_paid_hours numeric := 0;
  v_day date := (now() at time zone 'UTC')::date;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  select id into r_now from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  insert into public.job_days (user_id, day) values (p_user, v_day) on conflict do nothing;
  select greatest(0, public.setting('job_max_hours_day') - hours) into v_left from public.job_days where user_id = p_user and day = v_day for update;
  for j in select * from public.jobs where user_id = p_user and paid_until < least(ends_at, now()) order by hired_at for update loop
    v_until := least(j.ends_at, now());
    v_hours := least(v_left, extract(epoch from (v_until - j.paid_until)) / 3600.0);
    update public.jobs set paid_until = v_until where id = j.id;
    if v_hours <= 0 then continue; end if;
    v_left := v_left - v_hours;
    select public.skill_level(minutes) into v_level from public.job_skills where user_id = p_user and skill = j.skill;
    v_rate := j.pay_hour * (1 + coalesce(v_level, 0) * public.setting('job_skill_bonus'));
    v_gross := v_gross + v_rate * v_hours;
    v_paid_hours := v_paid_hours + v_hours;
    insert into public.job_skills (user_id, skill, minutes) values (p_user, j.skill, v_hours * 60)
      on conflict (user_id, skill) do update set minutes = job_skills.minutes + excluded.minutes;
  end loop;
  update public.job_days set hours = hours + v_paid_hours where user_id = p_user and day = v_day;
  v_gross := round(v_gross, 2);
  v_tax := round(v_gross * public.setting('job_tax'), 2);
  if v_gross > 0 then
    update public.profiles set coins = coins + v_gross - v_tax where id = p_user;
    perform public.log_coins(p_user, r_now, 'job_pay', v_gross, false, 'Job pay');
    if v_tax > 0 then
      perform public.log_coins(p_user, r_now, 'job_tax', -v_tax, false, 'Tax on job pay');
      perform public.pool_or_burn(r_now, v_tax, 'Tax on job pay');
    end if;
  end if;
  return jsonb_build_object('gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax, 'hours', round(v_paid_hours, 3),
    'capped', v_left <= 0, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/**
 * Take a job (the game has already held the interview and says how it went: p_score out of
 * p_out_of against p_pass). No interview (p_interviewed false) only if you have the skill.
 * A failed interview bars you from that place for the rest of the town. Taking a new job ends
 * the one you had (its pay is collected first).
 */
create or replace function public.job_hire(
  p_user uuid, p_place text, p_place_name text, p_job text, p_title text, p_skill text, p_pay numeric,
  p_interviewed boolean, p_score int, p_pass int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_pay jsonb;
  v_id bigint;
begin
  select * into r from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  if not found then raise exception 'no_game'; end if;
  if r.seek_ends_at <= now() + interval '1 minute' then raise exception 'too_late'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if p_place is null or char_length(p_place) > 40 or p_job !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' then raise exception 'bad_job'; end if;
  if coalesce(p_pay, 0) <= 0 or p_pay > public.setting('job_pay_max') then raise exception 'bad_job'; end if;
  if exists (select 1 from public.job_bans where round_id = r.id and user_id = p_user and place = p_place) then raise exception 'banned'; end if;
  if exists (select 1 from public.jobs where round_id = r.id and user_id = p_user and place = p_place and ends_at > now()) then raise exception 'already'; end if;
  if not p_interviewed then
    if coalesce((select minutes from public.job_skills where user_id = p_user and skill = p_skill), 0) < public.setting('job_skip_interview_minutes') then
      raise exception 'interview_needed';
    end if;
  elsif coalesce(p_score, 0) < coalesce(p_pass, 1) then
    insert into public.job_bans (round_id, user_id, place, score) values (r.id, p_user, p_place, coalesce(p_score, 0)) on conflict do nothing;
    return jsonb_build_object('hired', false, 'score', p_score, 'pass', p_pass);
  end if;
  -- Leave the job you had (paid up first).
  v_pay := public.job_collect(p_user);
  update public.jobs set ends_at = greatest(paid_until, now()) where user_id = p_user and round_id = r.id and ends_at > now();
  update public.jobs set paid_until = ends_at where user_id = p_user and round_id = r.id and paid_until > ends_at;
  insert into public.jobs (round_id, user_id, place, place_name, job, title, skill, pay_hour, interviewed, ends_at, paid_until)
    values (r.id, p_user, p_place, left(coalesce(p_place_name, 'Work'), 80), p_job, left(p_title, 60), p_skill, round(p_pay, 2), p_interviewed, r.seek_ends_at, now())
    returning id into v_id;
  return jsonb_build_object('hired', true, 'id', v_id, 'ends_at', r.seek_ends_at, 'collected', v_pay);
end $$;

/** Leave your job (pay collected first). */
create or replace function public.job_quit(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_pay jsonb;
begin
  v_pay := public.job_collect(p_user);
  update public.jobs set ends_at = greatest(paid_until, least(ends_at, now())) where user_id = p_user and ends_at > now();
  return jsonb_build_object('collected', v_pay);
end $$;

/** Your job, the pay waiting for you, your skills and where you can't apply in this town. */
create or replace function public.job_status(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r_id bigint;
  j public.jobs;
  v_owed numeric := 0;
  v_hours numeric := 0;
  v_left numeric;
  x record;
begin
  select id into r_id from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  select * into j from public.jobs where user_id = p_user and round_id = r_id and ends_at > now() order by hired_at desc limit 1;
  select greatest(0, public.setting('job_max_hours_day') - coalesce((select hours from public.job_days where user_id = p_user and day = (now() at time zone 'UTC')::date), 0)) into v_left;
  for x in select jb.*, (select public.skill_level(minutes) from public.job_skills s where s.user_id = p_user and s.skill = jb.skill) as lvl
           from public.jobs jb where jb.user_id = p_user and jb.paid_until < least(jb.ends_at, now()) loop
    v_hours := v_hours + extract(epoch from (least(x.ends_at, now()) - x.paid_until)) / 3600.0;
    v_owed := v_owed + x.pay_hour * (1 + coalesce(x.lvl, 0) * public.setting('job_skill_bonus'))
      * extract(epoch from (least(x.ends_at, now()) - x.paid_until)) / 3600.0;
  end loop;
  if v_hours > v_left and v_hours > 0 then v_owed := v_owed * v_left / v_hours; end if;
  return jsonb_build_object(
    'job', case when j.id is null then null else jsonb_build_object('place', j.place, 'place_name', j.place_name, 'job', j.job, 'title', j.title,
      'skill', j.skill, 'pay_hour', j.pay_hour, 'hired_at', j.hired_at, 'ends_at', j.ends_at) end,
    'owed', round(v_owed, 2),
    'tax', public.setting('job_tax'),
    'hours_left_today', round(greatest(0, v_left - v_hours), 3),
    'skip_minutes', public.setting('job_skip_interview_minutes'),
    'skill_bonus', public.setting('job_skill_bonus'),
    'skill_minutes', public.setting('job_skill_minutes'),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('skill', skill, 'minutes', round(minutes, 1), 'level', public.skill_level(minutes)) order by minutes desc)
      from public.job_skills where user_id = p_user), '[]'::jsonb),
    'banned', coalesce((select jsonb_agg(place) from public.job_bans where user_id = p_user and round_id = r_id), '[]'::jsonb)
  );
end $$;

-- ============================================================ the books
-- Job pay is new mint (the tax on it goes into the pool, like any other fee).
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.place_visits, public.jobs, public.job_bans, public.job_skills, public.job_days from public, anon, authenticated;
  grant all on table public.place_visits, public.jobs, public.job_bans, public.job_skills, public.job_days to service_role;
  revoke all on sequence public.jobs_id_seq from public, anon, authenticated;
  grant all on sequence public.jobs_id_seq to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.pay_fee(uuid, text, text, numeric)', 'public.my_visits(uuid)', 'public.job_collect(uuid)',
    'public.job_hire(uuid, text, text, text, text, text, numeric, boolean, int, int)', 'public.job_quit(uuid)', 'public.job_status(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 036_minigames.sql
-- Newtown, part 36: rewards for the 100 minigames (src/app/play/minigames).
-- A good score earns a little mint: bronze ₥2, silver ₥4, gold ₥6 (the game works out the
-- grade from the score, so the amounts are kept tiny), at most minigame_daily_rewards rewarded
-- games a day, and one reward per game every minigame_cooldown_seconds. Paid as
-- 'activity_reward' (counted as new mint in coin_supply_daily, like the older room games).
-- Safe to run more than once. Run after parts 1-35.

insert into public.game_settings (key, value, note) values
  ('minigame_daily_rewards',    10, 'Minigames: rewarded games a day'),
  ('minigame_cooldown_seconds', 45, 'Minigames: wait between rewards for the same game'),
  ('minigame_coins_bronze',     2,  'Minigames: mint for a bronze score'),
  ('minigame_coins_silver',     4,  'Minigames: mint for a silver score'),
  ('minigame_coins_gold',       6,  'Minigames: mint for a gold score')
on conflict (key) do update set note = excluded.note;

create table if not exists public.minigame_rewards (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9-]{2,30}$'),
  grade int not null check (grade between 1 and 3),
  coins numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists minigame_rewards_user_idx on public.minigame_rewards (user_id, created_at desc);

/** Claim mint for a minigame score of grade 1-3. Returns coins (0 with a reason when not paid) and rewards left today. */
create or replace function public.claim_minigame_reward(p_user uuid, p_game text, p_grade int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  r_id bigint;
  v_today int;
  v_last timestamptz;
  v_coins numeric;
  v_max int := public.setting('minigame_daily_rewards')::int;
begin
  if p_game is null or p_game !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_game'; end if;
  if p_grade is null or p_grade < 1 or p_grade > 3 then raise exception 'bad_score'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select count(*) into v_today from public.minigame_rewards where user_id = p_user and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  if v_today >= v_max then return jsonb_build_object('coins', 0, 'left_today', 0, 'reason', 'daily_limit'); end if;
  select max(created_at) into v_last from public.minigame_rewards where user_id = p_user and game = p_game;
  if v_last is not null and v_last > now() - make_interval(secs => public.setting('minigame_cooldown_seconds')) then
    return jsonb_build_object('coins', 0, 'left_today', v_max - v_today, 'reason', 'too_soon');
  end if;
  v_coins := public.setting(case p_grade when 3 then 'minigame_coins_gold' when 2 then 'minigame_coins_silver' else 'minigame_coins_bronze' end);
  select id into r_id from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  update public.profiles set coins = coins + v_coins where id = p_user;
  perform public.log_coins(p_user, r_id, 'activity_reward', v_coins, false, 'Minigame: ' || p_game);
  insert into public.minigame_rewards (user_id, game, grade, coins) values (p_user, p_game, p_grade, v_coins);
  return jsonb_build_object('coins', v_coins, 'left_today', v_max - v_today - 1, 'reason', null);
end $$;

do $$
begin
  revoke all on table public.minigame_rewards from public, anon, authenticated;
  grant all on table public.minigame_rewards to service_role;
  revoke all on sequence public.minigame_rewards_id_seq from public, anon, authenticated;
  grant all on sequence public.minigame_rewards_id_seq to service_role;
  revoke all on function public.claim_minigame_reward(uuid, text, int) from public, anon, authenticated;
  grant execute on function public.claim_minigame_reward(uuid, text, int) to service_role;
end $$;

-- ======================================================== 037_better_pay.sql
-- Newtown, part 37: jobs pay more. Hourly pay in the game tripled (src/lib/jobs.ts: ₥15 to ₥60
-- an hour before skills), so the most a job may pay goes up, and each skill level now adds 10%
-- (was 5%), so a level-10 worker earns double. Jobs already taken keep the pay they were hired at.
-- Safe to run more than once. Run after parts 1-36.

update public.game_settings set value = 100, note = 'Most a job can pay an hour (before skill bonus)' where key = 'job_pay_max';
update public.game_settings set value = 0.10, note = 'Extra pay per skill level' where key = 'job_skill_bonus';

-- ======================================================== 038_property.sql
-- Newtown, part 38: owning property on the real map (docs/PROPERTY.md).
--
-- A life on the real map starts with a budget (start_grant, once) and buying a home. Every
-- building and unit on the map has a permanent id ("lagos:12,-40" and "lagos:12,-40/3"); the game
-- works out what each unit is worth (land + building, from the map) and the database checks and
-- records the rest:
--
--  - buying a unit nobody owns (from the city): its price is burned, a purchase tax goes to the
--    treasuries; the building is saved exactly as bought, so it stands as bought whatever the map
--    does later; the first home you buy is your home (your primary residence) until you choose
--    another of yours;
--  - letting a unit out (not your home): it earns rent by the second while let, collected when you
--    ask, less a rent tax to the treasuries;
--  - naming a building you own all of.
--
-- Treasuries: every purchase tax and rent tax goes to the state's treasury and the country's
-- (treasury_state_share to the state, the rest to the country). Anyone can read them (balance and
-- every movement); spending them comes later (governors, presidents).
--
-- New mint: 'start_grant' and 'rent' (added to coin_supply_daily). Purchase prices are burned.
-- Money in treasuries has left the players without being burned: created - burned = players'
-- mint + treasuries.
--
-- Safe to run more than once. Run after parts 1-37.

insert into public.game_settings (key, value, note) values
  ('start_grant',          5000, 'Mint to start a life on the real map with (once)'),
  ('property_buy_tax',     0.03, 'Tax on buying property (into the treasuries)'),
  ('property_rent_tax',    0.10, 'Tax on rent (into the treasuries)'),
  ('treasury_state_share', 0.7,  'Share of each tax that goes to the state (the rest to the country)'),
  ('property_price_max',   100000000, 'Dearest unit the game will sell (a sanity check)')
on conflict (key) do update set note = excluded.note;
-- For a while lives started with 60,000; move that back to 5,000 (a value set by hand stays).
update public.game_settings set value = 5000 where key = 'start_grant' and value = 60000;

-- ============================================================ lives, buildings, units
create table if not exists public.lives (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  region text not null check (char_length(region) <= 30),
  -- Your home: one of your units (null until you buy one).
  home_unit text,
  granted numeric(14,2) not null default 0,
  started_at timestamptz not null default now()
);

-- A building as first bought (its kind, storeys, units, look), so it always stands as bought.
create table if not exists public.property_buildings (
  building_id text primary key check (building_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$'),
  region text not null,
  snapshot jsonb not null,
  name text check (name is null or char_length(name) between 2 and 40),
  created_at timestamptz not null default now()
);
create index if not exists property_buildings_region_idx on public.property_buildings (region);

create table if not exists public.property_units (
  unit_id text primary key check (unit_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$'),
  building_id text not null references public.property_buildings (building_id),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) <= 60),
  use text not null check (use in ('home', 'shop', 'office', 'industry', 'land')),
  area numeric(12,1) not null check (area > 0),
  price numeric(14,2) not null check (price > 0),
  -- Rent while let: mint per real day (the game works it out from the unit's value).
  rent_day numeric(14,2) not null default 0 check (rent_day >= 0),
  let boolean not null default false,
  collected_at timestamptz not null default now(),
  bought_at timestamptz not null default now()
);
create index if not exists property_units_owner_idx on public.property_units (owner_id);
create index if not exists property_units_building_idx on public.property_units (building_id);

create table if not exists public.property_sales (
  id bigserial primary key,
  unit_id text not null,
  seller_id uuid references public.profiles (id) on delete set null, -- null: the city
  buyer_id uuid references public.profiles (id) on delete set null,
  price numeric(14,2) not null,
  tax numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists property_sales_unit_idx on public.property_sales (unit_id, created_at desc);

-- ============================================================ treasuries
create table if not exists public.treasuries (
  id text primary key check (char_length(id) <= 30), -- 'ng' (Nigeria), 'ng-la' (Lagos State)
  name text not null,
  parent text references public.treasuries (id),
  balance numeric(16,2) not null default 0
);
create table if not exists public.treasury_ledger (
  id bigserial primary key,
  treasury text not null references public.treasuries (id),
  amount numeric(14,2) not null, -- positive in, negative spent
  kind text not null check (char_length(kind) <= 30),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists treasury_ledger_idx on public.treasury_ledger (treasury, created_at desc);

insert into public.treasuries (id, name, parent) values ('ng', 'Federal Republic of Nigeria', null) on conflict (id) do nothing;
insert into public.treasuries (id, name, parent) values ('ng-la', 'Lagos State', 'ng') on conflict (id) do nothing;

/** Which state treasury a region's taxes go to. */
create or replace function public.region_treasury(p_region text) returns text
language sql immutable as $$ select case p_region when 'lagos' then 'ng-la' else 'ng' end $$;

/** Split a tax between the state and the country, and record it. */
create or replace function public.pay_tax(p_region text, p_amount numeric, p_kind text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_state text := public.region_treasury(p_region);
  v_country text;
  v_state_part numeric;
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  select coalesce(parent, id) into v_country from public.treasuries where id = v_state;
  v_state_part := case when v_country = v_state then p_amount else round(p_amount * public.setting('treasury_state_share'), 2) end;
  update public.treasuries set balance = balance + v_state_part where id = v_state;
  insert into public.treasury_ledger (treasury, amount, kind, note) values (v_state, v_state_part, p_kind, p_note);
  if p_amount - v_state_part > 0 then
    update public.treasuries set balance = balance + (p_amount - v_state_part) where id = v_country;
    insert into public.treasury_ledger (treasury, amount, kind, note) values (v_country, p_amount - v_state_part, p_kind, p_note);
  end if;
end $$;

-- ============================================================ starting a life
/** Start (or carry on) your life in a region: the starting budget the first time. */
create or replace function public.life_start(p_user uuid, p_region text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  v_grant numeric := public.setting('start_grant');
begin
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_region'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user;
  if found then
    return jsonb_build_object('started', false, 'coins', p.coins, 'home', l.home_unit, 'region', l.region);
  end if;
  insert into public.lives (user_id, region, granted) values (p_user, p_region, v_grant);
  update public.profiles set coins = coins + v_grant where id = p_user;
  perform public.log_coins(p_user, null, 'start_grant', v_grant, false, 'Starting a life in ' || p_region);
  return jsonb_build_object('started', true, 'coins', p.coins + v_grant, 'home', null, 'region', p_region, 'granted', v_grant);
end $$;

-- ============================================================ buying
/**
 * Buy a unit nobody owns yet, from the city, at the price the game worked out (p_price, mint).
 * p_snapshot: the building as the map has it now (saved if this is its first sale).
 * p_rent_day: what it would earn a day if let. Returns your mint and whether it's your home now.
 */
create or replace function public.property_buy(
  p_user uuid, p_region text, p_unit text, p_snapshot jsonb, p_price numeric, p_use text, p_area numeric, p_label text, p_rent_day numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  v_building text := split_part(p_unit, '/', 1);
  v_price numeric := round(p_price, 2);
  v_tax numeric;
  v_home boolean := false;
begin
  if p_unit is null or p_unit !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$' or split_part(v_building, ':', 1) <> p_region then raise exception 'bad_unit'; end if;
  if v_price is null or v_price <= 0 or v_price > public.setting('property_price_max') then raise exception 'bad_price'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  -- Your first purchase must be a home.
  if l.home_unit is null and p_use <> 'home' then raise exception 'home_first'; end if;
  if exists (select 1 from public.property_units where unit_id = p_unit) then raise exception 'taken'; end if;
  v_tax := round(v_price * public.setting('property_buy_tax'), 2);
  if p.coins < v_price + v_tax then raise exception 'not_enough:%', trim_scale(v_price + v_tax); end if;

  insert into public.property_buildings (building_id, region, snapshot) values (v_building, p_region, p_snapshot)
  on conflict (building_id) do nothing;
  insert into public.property_units (unit_id, building_id, owner_id, label, use, area, price, rent_day)
  values (p_unit, v_building, p_user, left(p_label, 60), p_use, p_area, v_price, greatest(0, round(coalesce(p_rent_day, 0), 2)));
  insert into public.property_sales (unit_id, seller_id, buyer_id, price, tax) values (p_unit, null, p_user, v_price, v_tax);

  update public.profiles set coins = coins - v_price - v_tax where id = p_user;
  perform public.log_coins(p_user, null, 'property_buy', -(v_price + v_tax), false, 'Bought ' || p_unit);
  perform public.burn(null, v_price, 'Property bought from the city');
  perform public.pay_tax(p_region, v_tax, 'property_tax', 'Tax on buying ' || p_unit);

  if l.home_unit is null then
    update public.lives set home_unit = p_unit where user_id = p_user;
    v_home := true;
  end if;
  return jsonb_build_object('coins', p.coins - v_price - v_tax, 'home', v_home, 'tax', v_tax);
end $$;

-- ============================================================ your home, letting, naming
/** Make one of your homes your home (your primary residence). */
create or replace function public.property_set_home(p_user uuid, p_unit text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.property_units where unit_id = p_unit and owner_id = p_user and use = 'home') then raise exception 'not_yours'; end if;
  update public.property_units set let = false, collected_at = now() where unit_id = p_unit and let;
  update public.lives set home_unit = p_unit where user_id = p_user;
end $$;

/** Collect the rent your let units have earned so far (less the rent tax). Returns what you got. */
create or replace function public.property_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u record;
  v_gross numeric := 0;
  v_tax numeric := 0;
  v_rent numeric;
  v_unit_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  for u in select * from public.property_units where owner_id = p_user and let and rent_day > 0 for update loop
    v_rent := round(u.rent_day * extract(epoch from (now() - u.collected_at)) / 86400, 2);
    if v_rent <= 0 then continue; end if;
    v_unit_tax := round(v_rent * public.setting('property_rent_tax'), 2);
    perform public.pay_tax(split_part(u.unit_id, ':', 1), v_unit_tax, 'rent_tax', 'Rent tax on ' || u.unit_id);
    update public.property_units set collected_at = now() where unit_id = u.unit_id;
    v_gross := v_gross + v_rent;
    v_tax := v_tax + v_unit_tax;
  end loop;
  if v_gross - v_tax > 0 then
    update public.profiles set coins = coins + (v_gross - v_tax) where id = p_user;
    perform public.log_coins(p_user, null, 'rent', v_gross - v_tax, false, 'Rent');
  end if;
  return jsonb_build_object('rent', v_gross - v_tax, 'tax', v_tax, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Let one of your units out (or stop): not your home. Collects what it's earned first. */
create or replace function public.property_let(p_user uuid, p_unit text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_home text;
  v_out jsonb;
begin
  if not exists (select 1 from public.property_units where unit_id = p_unit and owner_id = p_user) then raise exception 'not_yours'; end if;
  select home_unit into v_home from public.lives where user_id = p_user;
  if p_on and v_home = p_unit then raise exception 'is_home'; end if;
  v_out := public.property_collect(p_user);
  update public.property_units set let = coalesce(p_on, false), collected_at = now() where unit_id = p_unit;
  return v_out;
end $$;

/** Name a building you own every unit of (null to clear). */
create or replace function public.property_rename(p_user uuid, p_building text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_units int;
  v_mine int;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  select jsonb_array_length(snapshot -> 'units') into v_units from public.property_buildings where building_id = p_building;
  if v_units is null then raise exception 'not_yours'; end if;
  select count(*) into v_mine from public.property_units where building_id = p_building and owner_id = p_user;
  if v_mine < v_units then raise exception 'not_all_yours'; end if;
  update public.property_buildings set name = v_name where building_id = p_building;
end $$;

-- ============================================================ reading
/** Your life: home, mint, every unit you own (with rent waiting to be collected). */
create or replace function public.my_assets(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'life', (select to_jsonb(l) - 'user_id' from public.lives l where l.user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unit', u.unit_id, 'building', u.building_id, 'label', u.label, 'use', u.use, 'area', u.area,
        'price', u.price, 'rentDay', u.rent_day, 'let', u.let, 'boughtAt', u.bought_at, 'name', b.name,
        'waiting', case when u.let then round(u.rent_day * extract(epoch from (now() - u.collected_at)) / 86400, 2) else 0 end
      ) order by u.bought_at)
      from public.property_units u join public.property_buildings b using (building_id)
      where u.owner_id = p_user), '[]'::jsonb)
  )
$$;

/** Every owned building in a region (as bought, with its name), for drawing them on the map. */
create or replace function public.owned_buildings(p_region text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', building_id, 'building', snapshot, 'name', name)), '[]'::jsonb)
  from public.property_buildings where region = p_region
$$;

/** Who owns which units of a building (by name; null where nobody does yet). */
create or replace function public.building_owners(p_building text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('unit', u.unit_id, 'owner', u.owner_id, 'name', coalesce(p.username, 'A player'))), '[]'::jsonb)
  from public.property_units u join public.profiles p on p.id = u.owner_id
  where u.building_id = p_building
$$;

/** The treasuries: balances and their latest movements (open to everyone). */
create or replace function public.treasury_report() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'balance', t.balance,
    'latest', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('amount', amount, 'kind', kind, 'note', note, 'at', created_at) as x
      from public.treasury_ledger where treasury = t.id order by created_at desc limit 20) s), '[]'::jsonb)
  ) order by t.parent nulls first, t.id), '[]'::jsonb)
  from public.treasuries t
$$;

-- ============================================================ the books
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.lives, public.property_buildings, public.property_units, public.property_sales,
    public.treasuries, public.treasury_ledger from public, anon, authenticated;
  grant all on table public.lives, public.property_buildings, public.property_units, public.property_sales,
    public.treasuries, public.treasury_ledger to service_role;
  revoke all on sequence public.property_sales_id_seq, public.treasury_ledger_id_seq from public, anon, authenticated;
  grant all on sequence public.property_sales_id_seq, public.treasury_ledger_id_seq to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.pay_tax(text, numeric, text, text)', 'public.life_start(uuid, text)',
    'public.property_buy(uuid, text, text, jsonb, numeric, text, numeric, text, numeric)', 'public.property_set_home(uuid, text)',
    'public.property_collect(uuid)', 'public.property_let(uuid, text, boolean)', 'public.property_rename(uuid, text, text)',
    'public.my_assets(uuid)', 'public.owned_buildings(text)', 'public.building_owners(text)', 'public.treasury_report()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 039_work.sql
-- Newtown, part 39: working on the real map, getting there, and your neighbours.
--
-- Jobs. Shops, offices, warehouses, building sites and landmarks (markets, the airport, hospitals,
-- the port...) hire (src/lib/world/work.ts). You need a home first. One job at a time; better jobs
-- need a skill level, and every game day worked (2 real hours) adds to that job's skill. Pay
-- builds up by the game day while you have the job, for up to work_hold_days game days, so come
-- back at least once a game week (14 real hours) to collect it. Pay is new mint; income tax goes
-- to the treasuries (state and country, as in part 38).
--
-- Getting to work. Two trips a game day, home to work and back, by the way you choose (walk,
-- keke, okada, danfo, taxi). The game works out the fare from the map (how far your home is from
-- your job) and passes it in; it's taken off your pay when you collect, and burned (it goes to the
-- drivers, outside the game). Fares are never more than you have.
--
-- Neighbours. Other players whose home is near yours, nearest first (in your building, then
-- around you).
--
-- Safe to run more than once. Run after parts 1-38.

insert into public.game_settings (key, value, note) values
  ('work_income_tax',  0.07, 'Income tax on pay from jobs on the real map (into the treasuries)'),
  ('work_pay_max',     200,  'Most a job on the real map can pay a game day (mint, before skill bonus)'),
  ('work_fare_max',    20,   'Dearest single trip to work (mint)'),
  ('work_hold_days',   7,    'Most game days of pay that wait to be collected'),
  ('work_day_hours',   2,    'Real hours in a game day'),
  ('work_skill_bonus', 0.03, 'Extra pay per skill level (real-map jobs)')
on conflict (key) do update set note = excluded.note;

-- ============================================================ jobs and skills
create table if not exists public.life_jobs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  place_id text not null check (place_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$'),
  place_name text not null check (char_length(place_name) <= 120),
  job text not null check (job ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 60),
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  -- Mint a game day, before the skill bonus (the game works it out from the job).
  pay_day numeric(14,2) not null check (pay_day > 0),
  mode text not null check (mode in ('walk', 'keke', 'okada', 'danfo', 'taxi')),
  hired_at timestamptz not null default now(),
  paid_until timestamptz not null default now()
);
create index if not exists life_jobs_place_idx on public.life_jobs (place_id);

create table if not exists public.life_skills (
  user_id uuid not null references public.profiles (id) on delete cascade,
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  -- Game days worked in it.
  days numeric(12,3) not null default 0,
  primary key (user_id, skill)
);

/** A skill's level from game days worked: 5 days for level 1, 20 for 2, 45 for 3... with no top. */
create or replace function public.life_skill_level(p_days numeric) returns int
language sql immutable as $$ select floor(sqrt(greatest(0, coalesce(p_days, 0)) / 5))::int $$;

/**
 * Collect your pay up to now (at most work_hold_days game days of it): pay with the skill bonus,
 * less income tax and two trips a game day at p_fare_trip (mint, worked out by the game from the
 * map). Adds the days to the job's skill. Returns what happened and your mint.
 */
create or replace function public.life_work_collect(p_user uuid, p_fare_trip numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  j public.life_jobs;
  v_days numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
  v_fares numeric;
  v_net numeric;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  select * into j from public.life_jobs where user_id = p_user for update;
  if not found then
    return jsonb_build_object('days', 0, 'gross', 0, 'tax', 0, 'fares', 0, 'net', 0, 'coins', p.coins);
  end if;
  v_days := least(public.setting('work_hold_days'),
                  greatest(0, extract(epoch from (now() - j.paid_until)) / 3600.0 / public.setting('work_day_hours')));
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = j.skill;
  v_gross := round(j.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus')) * v_days, 2);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  v_fares := round(2 * least(public.setting('work_fare_max'), greatest(0, coalesce(p_fare_trip, 0))) * v_days, 2);
  -- Fares never take you below nothing.
  v_fares := least(v_fares, p.coins + v_gross - v_tax);
  v_net := v_gross - v_tax - v_fares;

  update public.life_jobs set paid_until = now() where user_id = p_user;
  if v_days > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, j.skill, round(v_days, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  if v_gross > 0 then
    update public.profiles set coins = coins + v_net where id = p_user;
    perform public.log_coins(p_user, null, 'work_pay', v_gross, false, 'Pay: ' || j.title || ', ' || left(j.place_name, 60));
    if v_tax > 0 then
      perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
      perform public.pay_tax(j.region, v_tax, 'income_tax', 'Income tax on pay');
    end if;
    if v_fares > 0 then
      perform public.log_coins(p_user, null, 'commute', -v_fares, false, 'Fares to work and back');
      perform public.burn(null, v_fares, 'Fares to work');
    end if;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'gross', v_gross, 'tax', v_tax, 'fares', v_fares, 'net', v_net,
    'coins', (select coins from public.profiles where id = p_user));
end $$;

/**
 * Take a job (the game has checked the job is at that place and what it pays). You need a home,
 * and the job's skill level. The job you had is paid up first (p_old_fare: its fare a trip).
 */
create or replace function public.life_work_take(
  p_user uuid, p_region text, p_place text, p_place_name text, p_job text, p_title text, p_skill text,
  p_pay_day numeric, p_need_level int, p_mode text, p_old_fare numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  v_level int;
  v_out jsonb;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' or p_place is null or p_place !~ ('^' || p_region || ':-?[0-9]+,-?[0-9]+$')
     or p_job !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' then raise exception 'bad_job'; end if;
  if coalesce(p_pay_day, 0) <= 0 or p_pay_day > public.setting('work_pay_max') then raise exception 'bad_job'; end if;
  if p_mode is null or p_mode not in ('walk', 'keke', 'okada', 'danfo', 'taxi') then raise exception 'bad_mode'; end if;
  if exists (select 1 from public.life_jobs where user_id = p_user and place_id = p_place and job = p_job) then raise exception 'already'; end if;
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = p_skill;
  if coalesce(v_level, 0) < coalesce(p_need_level, 0) then raise exception 'need_level:%', p_need_level; end if;

  v_out := public.life_work_collect(p_user, p_old_fare);
  delete from public.life_jobs where user_id = p_user;
  insert into public.life_jobs (user_id, region, place_id, place_name, job, title, skill, pay_day, mode)
    values (p_user, p_region, p_place, left(coalesce(p_place_name, 'Work'), 120), p_job, left(p_title, 60), p_skill, round(p_pay_day, 2), p_mode);
  return jsonb_build_object('hired', true, 'collected', v_out, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Change how you get to work (pay up to now is collected at the old fare first). */
create or replace function public.life_work_mode(p_user uuid, p_mode text, p_old_fare numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if p_mode is null or p_mode not in ('walk', 'keke', 'okada', 'danfo', 'taxi') then raise exception 'bad_mode'; end if;
  if not exists (select 1 from public.life_jobs where user_id = p_user) then raise exception 'no_job'; end if;
  v_out := public.life_work_collect(p_user, p_old_fare);
  update public.life_jobs set mode = p_mode where user_id = p_user;
  return v_out;
end $$;

/** Leave your job (paid up first). */
create or replace function public.life_work_quit(p_user uuid, p_fare_trip numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.life_work_collect(p_user, p_fare_trip);
  delete from public.life_jobs where user_id = p_user;
  return v_out;
end $$;

/** Your job (if any), when it was last paid, and your skills. */
create or replace function public.life_work_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'job', (select jsonb_build_object('place', j.place_id, 'placeName', j.place_name, 'job', j.job, 'title', j.title, 'skill', j.skill,
                                      'payDay', j.pay_day, 'mode', j.mode, 'hiredAt', j.hired_at, 'paidUntil', j.paid_until)
            from public.life_jobs j where j.user_id = p_user),
    'skills', coalesce((select jsonb_object_agg(skill, days) from public.life_skills where user_id = p_user), '{}'::jsonb)
  )
$$;

-- ============================================================ neighbours
/** "lagos:12,-40/3" -> (12, -40). */
create or replace function public.unit_xz(p_unit text, out x int, out z int)
language sql immutable as $$
  select m[1]::int, m[2]::int from regexp_match(p_unit, ':(-?[0-9]+),(-?[0-9]+)(/|$)') m
$$;

/**
 * Players whose home is within p_radius tiles (100 m each) of yours, nearest first: their name,
 * whether they're in your building (and then which unit), and how far.
 */
create or replace function public.life_neighbours(p_user uuid, p_radius int) returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select l.region, l.home_unit, split_part(l.home_unit, '/', 1) as building, (public.unit_xz(l.home_unit)).*
    from public.lives l where l.user_id = p_user and l.home_unit is not null
  ), near as (
    select o.user_id, o.home_unit, split_part(o.home_unit, '/', 1) as building, (public.unit_xz(o.home_unit)).*
    from public.lives o, me
    where o.user_id <> p_user and o.region = me.region and o.home_unit is not null
  )
  select coalesce(jsonb_agg(x order by (x->>'tiles')::numeric, x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'name', coalesce(p.username, 'A neighbour'),
      'sameBuilding', n.building = me.building,
      'unit', case when n.building = me.building then u.label end,
      'building', n.building,
      'tiles', round(sqrt(power(n.x - me.x, 2) + power(n.z - me.z, 2))::numeric, 1)
    ) as x
    from near n cross join me
    join public.profiles p on p.id = n.user_id
    left join public.property_units u on u.unit_id = n.home_unit
    where abs(n.x - me.x) <= least(greatest(coalesce(p_radius, 5), 0), 30) and abs(n.z - me.z) <= least(greatest(coalesce(p_radius, 5), 0), 30)
      and sqrt(power(n.x - me.x, 2) + power(n.z - me.z, 2)) <= least(greatest(coalesce(p_radius, 5), 0), 30)
      and not p.frozen and p.age_blocked_at is null
    order by sqrt(power(n.x - me.x, 2) + power(n.z - me.z, 2))
    limit 40
  ) s
$$;

-- ============================================================ the books
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.life_jobs, public.life_skills from public, anon, authenticated;
  grant all on table public.life_jobs, public.life_skills to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.life_work_collect(uuid, numeric)',
    'public.life_work_take(uuid, text, text, text, text, text, text, numeric, int, text, numeric)',
    'public.life_work_mode(uuid, text, numeric)', 'public.life_work_quit(uuid, numeric)', 'public.life_work_status(uuid)',
    'public.life_neighbours(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 040_living.sql
-- Newtown, part 40: living on the real map. Money pots and a budget, bills, health, school and
-- treats; essential public services paid from taxes. See docs/LIVING.md and
-- src/lib/world/living.ts (the game works out every price and passes it in).
--
-- Pots. Every income (pay, rent) is shared out by your budget: so much into Essentials, Travel,
-- Savings and Treats, the rest into your wallet (your mint). Bills and check-ups come out of
-- Essentials, fares out of Travel, school fees out of Savings, treats out of Treats; whatever a
-- pot can't cover comes from your wallet. Pots are yours: move money between them any time.
--
-- Bills. Your home's electricity (to the power company, burned) and waste collection (to the
-- state) build up by the game day, up to 30 game days at a time, and are paid by themselves; what
-- can't be paid is owed, and owing more than a week of electricity cuts the power until it's paid.
--
-- Health falls a little every game day. Below living_auto_care_below a public clinic check-up
-- happens by itself (when you can pay). Unwell: half pay; bedridden: no work. Private care and
-- treats carry VAT (to the treasuries). A treat with recovery (a BBL) means game days off work.
--
-- School. One course at a time, paid up front (public: the fee goes to the state; private: it
-- leaves the game). It finishes by itself after its game days, counting as experience in its skill
-- and giving its certificate.
--
-- Essential services (public hospitals, schools, universities, government) are paid by the state
-- treasury, then the country's, from taxes; when the treasuries can't pay, it's owed until they
-- can. The Lagos treasury opens with living_treasury_opening (once).
--
-- Rent is now logged in full with its tax shown apart (the books balance with the treasuries).
--
-- Safe to run more than once. Run after parts 1-39.

insert into public.game_settings (key, value, note) values
  ('living_health_decay',     1.5,   'Health lost each game day'),
  ('living_sick_below',       30,    'Below this health: half pay'),
  ('living_bedridden_below',  10,    'Below this health: no work'),
  ('living_auto_care_below',  50,    'Below this health a public clinic check-up happens by itself'),
  ('living_auto_care_gain',   25,    'Health a public clinic check-up gives'),
  ('living_bill_max_day',     50,    'Dearest bill a game day (mint, a sanity check)'),
  ('living_bill_hold_days',   30,    'Most game days of bills charged at once'),
  ('living_cutoff_days',      7,     'Game days of unpaid electricity before the power is cut'),
  ('living_fee_max',          50000, 'Dearest fee for care, a treat or a course (mint, a sanity check)'),
  ('living_treasury_opening', 500000, 'What the Lagos State treasury opens with (once)')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
alter table public.lives add column if not exists health numeric(6,2) not null default 80;
alter table public.lives add column if not exists health_at timestamptz not null default now();
alter table public.lives add column if not exists bills_at timestamptz not null default now();
alter table public.lives add column if not exists power_owed numeric(14,2) not null default 0;
alter table public.lives add column if not exists waste_owed numeric(14,2) not null default 0;
alter table public.lives add column if not exists power_day numeric(10,2) not null default 0;
alter table public.lives add column if not exists budget jsonb not null default '{"essentials":25,"travel":15,"savings":20,"fun":10}';
alter table public.lives add column if not exists recovering_until timestamptz;

alter table public.life_jobs add column if not exists state boolean not null default false;
alter table public.life_jobs add column if not exists owed numeric(14,2) not null default 0;

create table if not exists public.life_pots (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pot text not null check (pot in ('essentials', 'travel', 'savings', 'fun')),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  primary key (user_id, pot)
);

create table if not exists public.life_courses (
  user_id uuid not null references public.profiles (id) on delete cascade,
  course text not null check (course ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 80),
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  grants numeric(10,2) not null default 0,
  cert text check (cert is null or cert ~ '^[a-z_]{2,30}$'),
  fee numeric(14,2) not null default 0,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  done_at timestamptz,
  primary key (user_id, course)
);

create table if not exists public.life_procedures (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  procedure text not null check (procedure ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 60),
  paid numeric(14,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists life_procedures_user_idx on public.life_procedures (user_id, created_at desc);

-- ============================================================ the treasury opens
do $$
declare v numeric := public.setting('living_treasury_opening');
begin
  if not exists (select 1 from public.treasury_ledger where treasury = 'ng-la' and kind = 'opening') then
    update public.treasuries set balance = balance + v where id = 'ng-la';
    insert into public.treasury_ledger (treasury, amount, kind, note) values ('ng-la', v, 'opening', 'Opening balance');
    insert into public.ledger (user_id, round_id, kind, amount, bonus, note) values (null, null, 'treasury_opening', v, false, 'Lagos State treasury opens');
  end if;
end $$;

-- ============================================================ money in and out
/** Pay from your pots in order, then your wallet. Returns what was paid (all of it, or what there was). */
create or replace function public.life_spend(p_user uuid, p_pots text[], p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_left numeric := round(coalesce(p_amount, 0), 2);
  v_take numeric;
  v_bal numeric;
  pt text;
begin
  if v_left <= 0 then return 0; end if;
  foreach pt in array coalesce(p_pots, '{}') loop
    select balance into v_bal from public.life_pots where user_id = p_user and pot = pt for update;
    v_take := least(coalesce(v_bal, 0), v_left);
    if v_take > 0 then
      update public.life_pots set balance = balance - v_take where user_id = p_user and pot = pt;
      v_left := v_left - v_take;
    end if;
    exit when v_left <= 0;
  end loop;
  if v_left > 0 then
    select coins into v_bal from public.profiles where id = p_user for update;
    v_take := least(greatest(coalesce(v_bal, 0), 0), v_left);
    if v_take > 0 then
      update public.profiles set coins = coins - v_take where id = p_user;
      v_left := v_left - v_take;
    end if;
  end if;
  return round(coalesce(p_amount, 0), 2) - v_left;
end $$;

/** What your pots (these ones) and wallet hold together. */
create or replace function public.life_can_spend(p_user uuid, p_pots text[]) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(balance) from public.life_pots where user_id = p_user and pot = any (p_pots)), 0)
       + greatest(coalesce((select coins from public.profiles where id = p_user), 0), 0)
$$;

/** Share an income out by your budget: so much into each pot, the rest into your wallet. */
create or replace function public.life_income(p_user uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_budget jsonb;
  v_left numeric := round(coalesce(p_amount, 0), 2);
  v_part numeric;
  pt text;
begin
  if v_left <= 0 then return; end if;
  select budget into v_budget from public.lives where user_id = p_user;
  foreach pt in array array['essentials', 'travel', 'savings', 'fun'] loop
    v_part := round(p_amount * least(100, greatest(0, coalesce((v_budget ->> pt)::numeric, 0))) / 100, 2);
    v_part := least(v_part, v_left);
    if v_part > 0 then
      insert into public.life_pots (user_id, pot, balance) values (p_user, pt, v_part)
        on conflict (user_id, pot) do update set balance = life_pots.balance + excluded.balance;
      v_left := v_left - v_part;
    end if;
  end loop;
  if v_left > 0 then update public.profiles set coins = coins + v_left where id = p_user; end if;
end $$;

-- ============================================================ the passing of time
/**
 * Bring your life up to now: health falls with the game days; bills for your home (p_power_day,
 * p_waste_day: mint a game day, worked out by the game from your home) are paid from Essentials,
 * then your wallet, or owed; a check-up happens by itself when health is low (p_care_fee, mint);
 * finished courses count. Returns your status.
 */
create or replace function public.life_tick(p_user uuid, p_power_day numeric, p_waste_day numeric, p_care_fee numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_hours numeric := public.setting('work_day_hours');
  v_health numeric;
  v_days numeric;
  v_power numeric;
  v_waste numeric;
  v_paid numeric;
  v_fee numeric := round(least(greatest(coalesce(p_care_fee, 0), 0), public.setting('living_fee_max')), 2);
  c record;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return null; end if;
  perform 1 from public.profiles where id = p_user for update;

  v_health := greatest(0, l.health - public.setting('living_health_decay') * extract(epoch from (now() - l.health_at)) / 3600.0 / v_hours);

  if l.home_unit is not null then
    v_days := least(public.setting('living_bill_hold_days'), greatest(0, extract(epoch from (now() - l.bills_at)) / 3600.0 / v_hours));
    v_power := l.power_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_power_day, 0))) * v_days, 2);
    v_waste := l.waste_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_waste_day, 0))) * v_days, 2);
    v_paid := public.life_spend(p_user, array['essentials'], v_power);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'power_bill', -v_paid, false, 'Electricity');
      perform public.burn(null, v_paid, 'Electricity bills');
    end if;
    v_power := v_power - v_paid;
    v_paid := public.life_spend(p_user, array['essentials'], v_waste);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'waste_bill', -v_paid, false, 'Waste collection');
      perform public.pay_tax(l.region, v_paid, 'waste_bill', 'Waste collection');
    end if;
    v_waste := v_waste - v_paid;
    update public.lives set bills_at = now(), power_owed = v_power, waste_owed = v_waste, power_day = round(greatest(0, coalesce(p_power_day, 0)), 2)
      where user_id = p_user;
  end if;

  -- A check-up by itself when health is low and you can pay for it.
  if v_health < public.setting('living_auto_care_below') and v_fee > 0
     and public.life_can_spend(p_user, array['essentials']) >= v_fee then
    perform public.life_spend(p_user, array['essentials'], v_fee);
    perform public.log_coins(p_user, null, 'health_care', -v_fee, false, 'Check-up at a public clinic (by itself)');
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public clinic fees');
    v_health := least(100, v_health + public.setting('living_auto_care_gain'));
  end if;
  update public.lives set health = round(v_health, 2), health_at = now() where user_id = p_user;

  -- Courses that have finished count as experience.
  for c in select * from public.life_courses where user_id = p_user and done_at is null and ends_at <= now() for update loop
    update public.life_courses set done_at = now() where user_id = p_user and course = c.course;
    insert into public.life_skills (user_id, skill, days) values (p_user, c.skill, c.grants)
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end loop;

  return public.life_status(p_user);
end $$;

-- ============================================================ pay (redone for pots, health and the state)
/**
 * Collect your pay up to now (at most work_hold_days game days): pay with the skill bonus, for the
 * days you could work (none while recovering; half while unwell), less income tax; essential
 * services are paid by the treasuries (what they can't pay is owed). Shared into your pots by your
 * budget, then fares (two trips a day worked, p_fare_trip each) come out of Travel.
 */
create or replace function public.life_work_collect(p_user uuid, p_fare_trip numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  j public.life_jobs;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_rec numeric := 0;
  v_work numeric;
  v_factor numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
  v_due numeric;
  v_paid numeric := 0;
  v_take numeric;
  v_state text;
  v_country text;
  v_income numeric;
  v_fares numeric;
  v_start timestamptz;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  select * into j from public.life_jobs where user_id = p_user for update;
  if not found then
    return jsonb_build_object('days', 0, 'gross', 0, 'tax', 0, 'fares', 0, 'net', 0, 'owed', 0, 'coins', p.coins);
  end if;
  select * into l from public.lives where user_id = p_user;
  v_days := least(public.setting('work_hold_days'), greatest(0, extract(epoch from (now() - j.paid_until)) / 3600.0 / v_hours));
  v_start := now() - make_interval(secs => v_days * v_hours * 3600);
  if l.recovering_until is not null and l.recovering_until > v_start then
    v_rec := least(v_days, extract(epoch from (least(now(), l.recovering_until) - v_start)) / 3600.0 / v_hours);
  end if;
  v_factor := case when coalesce(l.health, 100) < public.setting('living_bedridden_below') then 0
                   when coalesce(l.health, 100) < public.setting('living_sick_below') then 0.5 else 1 end;
  v_work := greatest(0, v_days - v_rec) * case when v_factor = 0 then 0 else 1 end;
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = j.skill;
  v_gross := round(j.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus')) * v_work * v_factor, 2);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);

  if j.state then
    -- Paid by the state (then the country) from taxes; income tax is kept back at source.
    v_due := v_gross - v_tax + j.owed;
    v_state := public.region_treasury(j.region);
    select coalesce(parent, id) into v_country from public.treasuries where id = v_state;
    foreach v_state in array array[v_state, v_country] loop
      exit when v_paid >= v_due;
      select least(balance, v_due - v_paid) into v_take from public.treasuries where id = v_state for update;
      if coalesce(v_take, 0) > 0 then
        update public.treasuries set balance = balance - v_take where id = v_state;
        insert into public.treasury_ledger (treasury, amount, kind, note) values (v_state, -v_take, 'salaries', 'Pay: ' || j.title);
        v_paid := v_paid + v_take;
      end if;
    end loop;
    v_income := v_paid;
    update public.life_jobs set owed = round(v_due - v_paid, 2) where user_id = p_user;
    if v_paid + v_tax > 0 then
      perform public.log_coins(p_user, null, 'public_pay', v_paid + v_tax, false, 'Pay (from the state): ' || j.title);
      if v_tax > 0 then perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax (kept back by the state)'); end if;
    end if;
  else
    v_income := v_gross - v_tax;
    if v_gross > 0 then
      perform public.log_coins(p_user, null, 'work_pay', v_gross, false, 'Pay: ' || j.title || ', ' || left(j.place_name, 60));
      if v_tax > 0 then
        perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
        perform public.pay_tax(j.region, v_tax, 'income_tax', 'Income tax on pay');
      end if;
    end if;
  end if;
  perform public.life_income(p_user, v_income);

  v_fares := round(2 * least(public.setting('work_fare_max'), greatest(0, coalesce(p_fare_trip, 0))) * v_work, 2);
  v_fares := public.life_spend(p_user, array['travel'], v_fares);
  if v_fares > 0 then
    perform public.log_coins(p_user, null, 'commute', -v_fares, false, 'Fares to work and back');
    perform public.burn(null, v_fares, 'Fares to work');
  end if;

  update public.life_jobs set paid_until = now() where user_id = p_user;
  if v_work > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, j.skill, round(v_work, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'worked', round(v_work, 3), 'gross', v_gross, 'tax', v_tax, 'fares', v_fares,
    'net', round(v_income - v_fares, 2), 'owed', (select owed from public.life_jobs where user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Mark a job as an essential public service (paid from taxes): the game says which jobs are. */
create or replace function public.life_work_set_state(p_user uuid, p_state boolean) returns void
language sql security definer set search_path = public as $$
  update public.life_jobs set state = coalesce(p_state, false) where user_id = p_user
$$;

-- ============================================================ rent (redone for pots, tax shown apart)
create or replace function public.property_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u record;
  v_gross numeric := 0;
  v_tax numeric := 0;
  v_rent numeric;
  v_unit_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  for u in select * from public.property_units where owner_id = p_user and let and rent_day > 0 for update loop
    v_rent := round(u.rent_day * extract(epoch from (now() - u.collected_at)) / 86400, 2);
    if v_rent <= 0 then continue; end if;
    v_unit_tax := round(v_rent * public.setting('property_rent_tax'), 2);
    perform public.pay_tax(split_part(u.unit_id, ':', 1), v_unit_tax, 'rent_tax', 'Rent tax on ' || u.unit_id);
    update public.property_units set collected_at = now() where unit_id = u.unit_id;
    v_gross := v_gross + v_rent;
    v_tax := v_tax + v_unit_tax;
  end loop;
  if v_gross > 0 then
    perform public.log_coins(p_user, null, 'rent', v_gross, false, 'Rent');
    if v_tax > 0 then perform public.log_coins(p_user, null, 'rent_tax', -v_tax, false, 'Tax on rent'); end if;
    perform public.life_income(p_user, v_gross - v_tax);
  end if;
  return jsonb_build_object('rent', v_gross - v_tax, 'tax', v_tax, 'coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ your budget and pots
/** Set your budget: percent of each income for each pot (whole numbers, together no more than 100). */
create or replace function public.life_budget_set(p_user uuid, p_budget jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v jsonb := '{}';
  v_sum int := 0;
  v_n int;
  pt text;
begin
  foreach pt in array array['essentials', 'travel', 'savings', 'fun'] loop
    v_n := coalesce((p_budget ->> pt)::int, 0);
    if v_n < 0 or v_n > 100 then raise exception 'bad_budget'; end if;
    v_sum := v_sum + v_n;
    v := v || jsonb_build_object(pt, v_n);
  end loop;
  if v_sum > 100 then raise exception 'bad_budget'; end if;
  update public.lives set budget = v where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
end $$;

/** Move money between your pots and your wallet ('wallet'). */
create or replace function public.life_pot_move(p_user uuid, p_from text, p_to text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  v numeric := round(coalesce(p_amount, 0), 2);
  v_have numeric;
begin
  if p_from = p_to or v <= 0 or p_from not in ('wallet', 'essentials', 'travel', 'savings', 'fun')
     or p_to not in ('wallet', 'essentials', 'travel', 'savings', 'fun') then raise exception 'bad_move'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if p_from = 'wallet' then
    select coins into v_have from public.profiles where id = p_user for update;
    if coalesce(v_have, 0) < v then raise exception 'not_enough:%', trim_scale(v); end if;
    update public.profiles set coins = coins - v where id = p_user;
  else
    select balance into v_have from public.life_pots where user_id = p_user and pot = p_from for update;
    if coalesce(v_have, 0) < v then raise exception 'not_enough:%', trim_scale(v); end if;
    update public.life_pots set balance = balance - v where user_id = p_user and pot = p_from;
  end if;
  if p_to = 'wallet' then
    update public.profiles set coins = coins + v where id = p_user;
  else
    insert into public.life_pots (user_id, pot, balance) values (p_user, p_to, v)
      on conflict (user_id, pot) do update set balance = life_pots.balance + excluded.balance;
  end if;
end $$;

-- ============================================================ care, treats, school
/** Health care (the game says what it is, its fee and VAT in mint, and the health it gives; 100 = full). */
create or replace function public.life_care(p_user uuid, p_care text, p_title text, p_fee numeric, p_vat numeric, p_gain numeric, p_public boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_fee numeric := round(coalesce(p_fee, 0), 2);
  v_vat numeric := round(greatest(coalesce(p_vat, 0), 0), 2);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if p_care !~ '^[a-z_]{2,30}$' or v_fee <= 0 or v_fee > public.setting('living_fee_max') then raise exception 'bad_item'; end if;
  if public.life_can_spend(p_user, array['essentials']) < v_fee + v_vat then raise exception 'not_enough:%', trim_scale(v_fee + v_vat); end if;
  perform public.life_spend(p_user, array['essentials'], v_fee + v_vat);
  perform public.log_coins(p_user, null, 'health_care', -v_fee, false, left(p_title, 60));
  if p_public then
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public clinic fees');
  else
    perform public.burn(null, v_fee, 'Private health care');
  end if;
  if v_vat > 0 then
    perform public.log_coins(p_user, null, 'vat', -v_vat, false, 'VAT');
    perform public.pay_tax(l.region, v_vat, 'vat', 'VAT on ' || left(p_title, 40));
  end if;
  update public.lives set health = least(100, case when p_gain >= 100 then 100 else health + greatest(0, p_gain) end), health_at = now() where user_id = p_user;
  return jsonb_build_object('health', (select health from public.lives where user_id = p_user), 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** A cosmetic procedure (the game says its fee and VAT in mint, and the game days of recovery). */
create or replace function public.life_procedure(p_user uuid, p_procedure text, p_title text, p_fee numeric, p_vat numeric, p_recovery numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_fee numeric := round(coalesce(p_fee, 0), 2);
  v_vat numeric := round(greatest(coalesce(p_vat, 0), 0), 2);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_procedure !~ '^[a-z_]{2,30}$' or v_fee <= 0 or v_fee > public.setting('living_fee_max') or coalesce(p_recovery, 0) < 0 then raise exception 'bad_item'; end if;
  if l.recovering_until > now() then raise exception 'recovering'; end if;
  if public.life_can_spend(p_user, array['fun', 'savings']) < v_fee + v_vat then raise exception 'not_enough:%', trim_scale(v_fee + v_vat); end if;
  perform public.life_spend(p_user, array['fun', 'savings'], v_fee + v_vat);
  perform public.log_coins(p_user, null, 'procedure', -v_fee, false, left(p_title, 60));
  perform public.burn(null, v_fee, 'Cosmetic procedures');
  if v_vat > 0 then
    perform public.log_coins(p_user, null, 'vat', -v_vat, false, 'VAT');
    perform public.pay_tax(l.region, v_vat, 'vat', 'VAT on ' || left(p_title, 40));
  end if;
  insert into public.life_procedures (user_id, procedure, title, paid) values (p_user, p_procedure, left(p_title, 60), v_fee + v_vat);
  if coalesce(p_recovery, 0) > 0 then
    update public.lives set recovering_until = now() + make_interval(secs => p_recovery * public.setting('work_day_hours') * 3600) where user_id = p_user;
  end if;
  return jsonb_build_object('coins', (select coins from public.profiles where id = p_user),
    'recovering_until', (select recovering_until from public.lives where user_id = p_user));
end $$;

/** Start a course (the game says its fee in mint, how many game days, the skill and certificate). */
create or replace function public.life_enrol(
  p_user uuid, p_course text, p_title text, p_skill text, p_grants numeric, p_cert text, p_fee numeric, p_days numeric, p_public boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_fee numeric := round(coalesce(p_fee, 0), 2);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if p_course !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' or (p_cert is not null and p_cert !~ '^[a-z_]{2,30}$')
     or v_fee <= 0 or v_fee > public.setting('living_fee_max') or coalesce(p_days, 0) <= 0 or coalesce(p_grants, 0) < 0 then raise exception 'bad_item'; end if;
  if exists (select 1 from public.life_courses where user_id = p_user and done_at is null) then raise exception 'studying'; end if;
  if exists (select 1 from public.life_courses where user_id = p_user and course = p_course) then raise exception 'done_already'; end if;
  if public.life_can_spend(p_user, array['savings']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
  perform public.life_spend(p_user, array['savings'], v_fee);
  perform public.log_coins(p_user, null, 'school_fees', -v_fee, false, left(p_title, 60));
  if p_public then
    perform public.pay_tax(l.region, v_fee, 'school_fees', 'Public school fees');
  else
    perform public.burn(null, v_fee, 'Private school fees');
  end if;
  insert into public.life_courses (user_id, course, title, skill, grants, cert, fee, ends_at)
    values (p_user, p_course, left(p_title, 80), p_skill, p_grants, p_cert, v_fee, now() + make_interval(secs => p_days * public.setting('work_day_hours') * 3600));
  return jsonb_build_object('coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ reading
/** Your life now: health, bills owed, the power, your budget and pots, school, treats, pay owed. */
create or replace function public.life_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'health', l.health,
    'powerOwed', l.power_owed,
    'wasteOwed', l.waste_owed,
    'powerCut', l.power_day > 0 and l.power_owed > l.power_day * public.setting('living_cutoff_days'),
    'budget', l.budget,
    'recoveringUntil', l.recovering_until,
    'wallet', (select coins from public.profiles where id = p_user),
    'pots', coalesce((select jsonb_object_agg(pot, balance) from public.life_pots where user_id = p_user), '{}'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('course', course, 'title', title, 'cert', cert, 'startedAt', started_at, 'endsAt', ends_at, 'done', done_at is not null) order by started_at)
                         from public.life_courses where user_id = p_user), '[]'::jsonb),
    'procedures', coalesce((select jsonb_agg(jsonb_build_object('procedure', procedure, 'title', title, 'at', created_at) order by created_at desc)
                            from public.life_procedures where user_id = p_user), '[]'::jsonb),
    'payOwed', coalesce((select owed from public.life_jobs where user_id = p_user), 0)
  )
  from public.lives l where l.user_id = p_user
$$;

/** Money in and out over the last p_hours real hours, by kind (the tax on property you bought shown apart). */
create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'commute',
                   'health_care', 'school_fees', 'procedure', 'property_buy', 'start_grant')
    group by kind
    union all
    -- property_buy is logged with its tax: take the tax out and show it apart.
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ============================================================ the books
-- Pay from the state ('public_pay') comes out of the treasuries, so it isn't new mint; the Lagos
-- treasury's opening balance is.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.life_pots, public.life_courses, public.life_procedures from public, anon, authenticated;
  grant all on table public.life_pots, public.life_courses, public.life_procedures to service_role;
  revoke all on sequence public.life_procedures_id_seq from public, anon, authenticated;
  grant all on sequence public.life_procedures_id_seq to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.life_spend(uuid, text[], numeric)', 'public.life_can_spend(uuid, text[])', 'public.life_income(uuid, numeric)',
    'public.life_tick(uuid, numeric, numeric, numeric)', 'public.life_work_collect(uuid, numeric)', 'public.life_work_set_state(uuid, boolean)',
    'public.property_collect(uuid)', 'public.life_budget_set(uuid, jsonb)', 'public.life_pot_move(uuid, text, text, numeric)',
    'public.life_care(uuid, text, text, numeric, numeric, numeric, boolean)', 'public.life_procedure(uuid, text, text, numeric, numeric, numeric)',
    'public.life_enrol(uuid, text, text, text, numeric, text, numeric, numeric, boolean)', 'public.life_status(uuid)', 'public.life_money(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 041_your_day.sql
-- Newtown, part 41: your day. A side hustle beside your main job; Body and Mind; exercise; where your
-- time and money went; interview cooldowns; breakthrough moments. See docs/DAY.md and
-- src/lib/world/day.ts, hustles.ts, interviews.ts, breakthroughs.ts (the game works out the numbers
-- and checks a day fits in 24 hours before it calls these).
--
-- Side hustle. One at a time, a few hours a game day, with a start-up cost (gone once spent). It
-- earns by the game day (up to work_hold_days at a time) with a daily swing, less income tax, shared
-- into your pots. A breakthrough can boost it for a while; a bad call can stall it for a few days.
--
-- Body and Mind. Each game day the game says how your days move them (exercise helps your body;
-- free time helps your mind; long days and owing bills wear you down) and life_tick applies it.
-- Mind below 10 is burnout: no work, like being bedridden. A gym membership is paid by the game day
-- from Essentials. Care can be for the body or the mind (counselling, a therapist, a weekend away).
--
-- Interviews. A failed interview means waiting a game week (14 hours) before trying that job there
-- again. (The questions and marking live in the game: src/lib/world/interviews.ts.)
--
-- Breakthroughs. At most one open at a time, with a cool-down after each; it expires if not answered.
-- Won: a bonus (new mint, shared into pots) and experience for a job; a boost for a side hustle.
-- Lost: nothing, or a stalled side hustle.
--
-- Safe to run more than once. Run after parts 1-40.

insert into public.game_settings (key, value, note) values
  ('hustle_pay_max',       100,  'Most a side hustle can earn a game day (mint, before swing and boost)'),
  ('hustle_start_max',     5000, 'Dearest side hustle to start (mint, a sanity check)'),
  ('life_gym_max_day',     5,    'Dearest gym membership a game day (mint)'),
  ('interview_wait_hours', 14,   'Real hours before trying a failed interview again'),
  ('event_cooldown_hours', 4,    'Real hours after a breakthrough before another can come'),
  ('event_bonus_max',      2000, 'Biggest breakthrough bonus (mint)')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
alter table public.lives add column if not exists mind numeric(6,2) not null default 70;
alter table public.lives add column if not exists exercise text not null default 'none';
alter table public.lives add column if not exists event_at timestamptz;

create table if not exists public.life_hustles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  hustle text not null check (hustle ~ '^[a-z_]{2,30}$'),
  title text not null check (char_length(title) <= 60),
  skill text not null check (skill ~ '^[a-z_]{2,30}$'),
  pay_day numeric(12,2) not null check (pay_day > 0),
  swing numeric(4,2) not null default 0.3 check (swing between 0 and 1),
  hours numeric(4,2) not null check (hours > 0 and hours <= 8),
  started_at timestamptz not null default now(),
  paid_until timestamptz not null default now(),
  boost numeric(4,2) not null default 1,
  boost_until timestamptz,
  stalled_until timestamptz
);

-- Time spent, a row per kind each time life moves on (hours, for "where your time went").
create table if not exists public.life_hours (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,20}$'),
  hours numeric(10,2) not null,
  created_at timestamptz not null default now()
);
create index if not exists life_hours_user_idx on public.life_hours (user_id, created_at desc);

create table if not exists public.life_interview_fails (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (char_length(place) <= 40),
  job text not null check (job ~ '^[a-z_]{2,30}$'),
  failed_at timestamptz not null default now(),
  primary key (user_id, place, job)
);

create table if not exists public.life_events (
  id text primary key check (id ~ '^[a-z0-9_-]{8,64}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('job', 'hustle')),
  key text not null check (char_length(key) <= 40),
  title text not null check (char_length(title) <= 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'expired')),
  reward jsonb
);
create index if not exists life_events_user_idx on public.life_events (user_id, created_at desc);

-- ============================================================ time passes (body, mind, bills, gym, time)
drop function if exists public.life_tick(uuid, numeric, numeric, numeric);
/**
 * Bring your life up to now: Body and Mind move by p_body_day and p_mind_day each game day (the
 * game works these out from how you live), bills and the gym (p_gym_day) are paid from Essentials,
 * a check-up happens by itself when your body is low, finished courses count, and the hours you
 * spent (p_hours: hours a game day by kind) are written down. Returns your status.
 */
create or replace function public.life_tick(
  p_user uuid, p_power_day numeric, p_waste_day numeric, p_care_fee numeric,
  p_body_day numeric, p_mind_day numeric, p_gym_day numeric, p_hours jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_bdays numeric;
  v_health numeric;
  v_mind numeric;
  v_power numeric;
  v_waste numeric;
  v_paid numeric;
  v_gym numeric;
  v_fee numeric := round(least(greatest(coalesce(p_care_fee, 0), 0), public.setting('living_fee_max')), 2);
  k text;
  c record;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return null; end if;
  perform 1 from public.profiles where id = p_user for update;

  v_days := least(public.setting('living_bill_hold_days'), greatest(0, extract(epoch from (now() - l.health_at)) / 3600.0 / v_hours));
  v_health := least(100, greatest(0, l.health + least(5, greatest(-5, coalesce(p_body_day, -1.5))) * v_days));
  v_mind := least(100, greatest(0, l.mind + least(5, greatest(-5, coalesce(p_mind_day, 0))) * v_days));

  if l.home_unit is not null then
    v_bdays := least(public.setting('living_bill_hold_days'), greatest(0, extract(epoch from (now() - l.bills_at)) / 3600.0 / v_hours));
    v_power := l.power_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_power_day, 0))) * v_bdays, 2);
    v_waste := l.waste_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_waste_day, 0))) * v_bdays, 2);
    v_paid := public.life_spend(p_user, array['essentials'], v_power);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'power_bill', -v_paid, false, 'Electricity');
      perform public.burn(null, v_paid, 'Electricity bills');
    end if;
    v_power := v_power - v_paid;
    v_paid := public.life_spend(p_user, array['essentials'], v_waste);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'waste_bill', -v_paid, false, 'Waste collection');
      perform public.pay_tax(l.region, v_paid, 'waste_bill', 'Waste collection');
    end if;
    v_waste := v_waste - v_paid;
    update public.lives set bills_at = now(), power_owed = v_power, waste_owed = v_waste, power_day = round(greatest(0, coalesce(p_power_day, 0)), 2)
      where user_id = p_user;
  end if;

  -- The gym, by the game day; can't pay, no gym.
  v_gym := round(least(public.setting('life_gym_max_day'), greatest(0, coalesce(p_gym_day, 0))) * v_days, 2);
  if v_gym > 0 then
    v_paid := public.life_spend(p_user, array['essentials'], v_gym);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'gym', -v_paid, false, 'Gym membership');
      perform public.burn(null, v_paid, 'Gym memberships');
    end if;
    if v_paid < v_gym then update public.lives set exercise = 'walk' where user_id = p_user; end if;
  end if;

  -- A check-up by itself when the body is low and you can pay for it.
  if v_health < public.setting('living_auto_care_below') and v_fee > 0
     and public.life_can_spend(p_user, array['essentials']) >= v_fee then
    perform public.life_spend(p_user, array['essentials'], v_fee);
    perform public.log_coins(p_user, null, 'health_care', -v_fee, false, 'Check-up at a public clinic (by itself)');
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public clinic fees');
    v_health := least(100, v_health + public.setting('living_auto_care_gain'));
  end if;
  update public.lives set health = round(v_health, 2), mind = round(v_mind, 2), health_at = now() where user_id = p_user;

  -- Where the time went.
  if v_days > 0.01 and p_hours is not null and jsonb_typeof(p_hours) = 'object' then
    for k in select jsonb_object_keys(p_hours) loop
      if k ~ '^[a-z_]{2,20}$' and coalesce((p_hours ->> k)::numeric, 0) > 0 then
        insert into public.life_hours (user_id, kind, hours) values (p_user, k, round(least(24, (p_hours ->> k)::numeric) * v_days, 2));
      end if;
    end loop;
  end if;

  for c in select * from public.life_courses where user_id = p_user and done_at is null and ends_at <= now() for update loop
    update public.life_courses set done_at = now() where user_id = p_user and course = c.course;
    insert into public.life_skills (user_id, skill, days) values (p_user, c.skill, c.grants)
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end loop;
  update public.life_events set status = 'expired' where user_id = p_user and status = 'open' and expires_at <= now();

  return public.life_status(p_user);
end $$;

/** Body and mind together: how much of a day's work counts (0 bedridden or burnt out, half unwell). */
create or replace function public.life_work_factor(p_health numeric, p_mind numeric) returns numeric
language sql stable set search_path = public as $$
  select case when coalesce(p_health, 100) < public.setting('living_bedridden_below') or coalesce(p_mind, 100) < 10 then 0
              when coalesce(p_health, 100) < public.setting('living_sick_below') then 0.5 else 1 end
$$;

-- ============================================================ main job pay (burnout counts now)
create or replace function public.life_work_collect(p_user uuid, p_fare_trip numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  j public.life_jobs;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_rec numeric := 0;
  v_work numeric;
  v_factor numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
  v_due numeric;
  v_paid numeric := 0;
  v_take numeric;
  v_state text;
  v_country text;
  v_income numeric;
  v_fares numeric;
  v_start timestamptz;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  select * into j from public.life_jobs where user_id = p_user for update;
  if not found then
    return jsonb_build_object('days', 0, 'worked', 0, 'gross', 0, 'tax', 0, 'fares', 0, 'net', 0, 'owed', 0, 'coins', p.coins);
  end if;
  select * into l from public.lives where user_id = p_user;
  v_days := least(public.setting('work_hold_days'), greatest(0, extract(epoch from (now() - j.paid_until)) / 3600.0 / v_hours));
  v_start := now() - make_interval(secs => v_days * v_hours * 3600);
  if l.recovering_until is not null and l.recovering_until > v_start then
    v_rec := least(v_days, extract(epoch from (least(now(), l.recovering_until) - v_start)) / 3600.0 / v_hours);
  end if;
  v_factor := public.life_work_factor(l.health, l.mind);
  v_work := greatest(0, v_days - v_rec) * case when v_factor = 0 then 0 else 1 end;
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = j.skill;
  v_gross := round(j.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus')) * v_work * v_factor, 2);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);

  if j.state then
    v_due := v_gross - v_tax + j.owed;
    v_state := public.region_treasury(j.region);
    select coalesce(parent, id) into v_country from public.treasuries where id = v_state;
    foreach v_state in array array[v_state, v_country] loop
      exit when v_paid >= v_due;
      select least(balance, v_due - v_paid) into v_take from public.treasuries where id = v_state for update;
      if coalesce(v_take, 0) > 0 then
        update public.treasuries set balance = balance - v_take where id = v_state;
        insert into public.treasury_ledger (treasury, amount, kind, note) values (v_state, -v_take, 'salaries', 'Pay: ' || j.title);
        v_paid := v_paid + v_take;
      end if;
    end loop;
    v_income := v_paid;
    update public.life_jobs set owed = round(v_due - v_paid, 2) where user_id = p_user;
    if v_paid + v_tax > 0 then
      perform public.log_coins(p_user, null, 'public_pay', v_paid + v_tax, false, 'Pay (from the state): ' || j.title);
      if v_tax > 0 then perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax (kept back by the state)'); end if;
    end if;
  else
    v_income := v_gross - v_tax;
    if v_gross > 0 then
      perform public.log_coins(p_user, null, 'work_pay', v_gross, false, 'Pay: ' || j.title || ', ' || left(j.place_name, 60));
      if v_tax > 0 then
        perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
        perform public.pay_tax(j.region, v_tax, 'income_tax', 'Income tax on pay');
      end if;
    end if;
  end if;
  perform public.life_income(p_user, v_income);

  v_fares := round(2 * least(public.setting('work_fare_max'), greatest(0, coalesce(p_fare_trip, 0))) * v_work, 2);
  v_fares := public.life_spend(p_user, array['travel'], v_fares);
  if v_fares > 0 then
    perform public.log_coins(p_user, null, 'commute', -v_fares, false, 'Fares to work and back');
    perform public.burn(null, v_fares, 'Fares to work');
  end if;

  update public.life_jobs set paid_until = now() where user_id = p_user;
  if v_work > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, j.skill, round(v_work, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'worked', round(v_work, 3), 'gross', v_gross, 'tax', v_tax, 'fares', v_fares,
    'net', round(v_income - v_fares, 2), 'owed', (select owed from public.life_jobs where user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ side hustles
/** Collect what your side hustle has made (at most work_hold_days game days), less income tax. */
create or replace function public.life_hustle_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  h public.life_hustles;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_start timestamptz;
  v_off numeric := 0;
  v_boost numeric := 0;
  v_work numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  select * into h from public.life_hustles where user_id = p_user for update;
  if not found then return jsonb_build_object('days', 0, 'gross', 0, 'tax', 0, 'net', 0); end if;
  select * into l from public.lives where user_id = p_user;
  v_days := least(public.setting('work_hold_days'), greatest(0, extract(epoch from (now() - h.paid_until)) / 3600.0 / v_hours));
  v_start := now() - make_interval(secs => v_days * v_hours * 3600);
  -- Days it was stalled, or you were away, earn nothing; boosted days earn more.
  if h.stalled_until is not null and h.stalled_until > v_start then
    v_off := least(v_days, extract(epoch from (least(now(), h.stalled_until) - v_start)) / 3600.0 / v_hours);
  end if;
  if l.recovering_until is not null and l.recovering_until > v_start then
    v_off := greatest(v_off, least(v_days, extract(epoch from (least(now(), l.recovering_until) - v_start)) / 3600.0 / v_hours));
  end if;
  v_work := greatest(0, v_days - v_off);
  if h.boost_until is not null and h.boost_until > v_start then
    v_boost := least(v_work, extract(epoch from (least(now(), h.boost_until) - v_start)) / 3600.0 / v_hours);
  end if;
  v_work := v_work * case when public.life_work_factor(l.health, l.mind) = 0 then 0 else 1 end;
  v_boost := least(v_boost, v_work);
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = h.skill;
  v_gross := round(h.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus'))
                   * (v_work + v_boost * (h.boost - 1)) * public.life_work_factor(l.health, l.mind)
                   * (1 + h.swing * (random()::numeric * 2 - 1)), 2);
  v_gross := greatest(0, v_gross);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  update public.life_hustles set paid_until = now() where user_id = p_user;
  if v_gross > 0 then
    perform public.log_coins(p_user, null, 'hustle_pay', v_gross, false, 'Side hustle: ' || h.title);
    if v_tax > 0 then
      perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
      perform public.pay_tax(l.region, v_tax, 'income_tax', 'Income tax on a side hustle');
    end if;
    perform public.life_income(p_user, v_gross - v_tax);
  end if;
  if v_work > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, h.skill, round(v_work, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'worked', round(v_work, 3), 'gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax);
end $$;

/** Start a side hustle (the game says what it earns a day, its swing, hours and start-up cost). The one you had stops. */
create or replace function public.life_hustle_start(
  p_user uuid, p_hustle text, p_title text, p_skill text, p_pay_day numeric, p_swing numeric, p_hours numeric, p_cost numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_cost numeric := round(coalesce(p_cost, 0), 2);
  v_out jsonb;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_hustle !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' or coalesce(p_pay_day, 0) <= 0 or p_pay_day > public.setting('hustle_pay_max')
     or v_cost < 0 or v_cost > public.setting('hustle_start_max') or coalesce(p_hours, 0) <= 0 or p_hours > 8 then raise exception 'bad_item'; end if;
  if exists (select 1 from public.life_hustles where user_id = p_user and hustle = p_hustle) then raise exception 'already'; end if;
  if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
  v_out := public.life_hustle_collect(p_user);
  delete from public.life_hustles where user_id = p_user;
  if v_cost > 0 then
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'hustle_start', -v_cost, false, 'Starting: ' || left(p_title, 50));
    perform public.burn(null, v_cost, 'Side hustle start-up costs');
  end if;
  insert into public.life_hustles (user_id, hustle, title, skill, pay_day, swing, hours)
    values (p_user, p_hustle, left(p_title, 60), p_skill, round(p_pay_day, 2), least(1, greatest(0, coalesce(p_swing, 0.3))), p_hours);
  return jsonb_build_object('collected', v_out, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Stop your side hustle (what it made is collected first). */
create or replace function public.life_hustle_stop(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.life_hustle_collect(p_user);
  delete from public.life_hustles where user_id = p_user;
  return v_out;
end $$;

/** How you exercise: none, walk, football or gym. */
create or replace function public.life_set_exercise(p_user uuid, p_exercise text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_exercise not in ('none', 'walk', 'football', 'gym') then raise exception 'bad_item'; end if;
  update public.lives set exercise = p_exercise where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
end $$;

-- ============================================================ care for body and mind
drop function if exists public.life_care(uuid, text, text, numeric, numeric, numeric, boolean);
/** Care (the game says the fee and VAT in mint, what it gives body and mind, days away, and which pots pay). */
create or replace function public.life_care(
  p_user uuid, p_care text, p_title text, p_fee numeric, p_vat numeric, p_gain numeric, p_mind_gain numeric,
  p_away_days numeric, p_public boolean, p_pots text[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_fee numeric := round(coalesce(p_fee, 0), 2);
  v_vat numeric := round(greatest(coalesce(p_vat, 0), 0), 2);
  v_pots text[] := coalesce(p_pots, array['essentials']);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if p_care !~ '^[a-z_]{2,30}$' or v_fee <= 0 or v_fee > public.setting('living_fee_max') or coalesce(p_away_days, 0) < 0 or p_away_days > 14 then raise exception 'bad_item'; end if;
  if coalesce(p_away_days, 0) > 0 and l.recovering_until > now() then raise exception 'recovering'; end if;
  if public.life_can_spend(p_user, v_pots) < v_fee + v_vat then raise exception 'not_enough:%', trim_scale(v_fee + v_vat); end if;
  perform public.life_spend(p_user, v_pots, v_fee + v_vat);
  perform public.log_coins(p_user, null, 'health_care', -v_fee, false, left(p_title, 60));
  if p_public then
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public care fees');
  else
    perform public.burn(null, v_fee, 'Private care');
  end if;
  if v_vat > 0 then
    perform public.log_coins(p_user, null, 'vat', -v_vat, false, 'VAT');
    perform public.pay_tax(l.region, v_vat, 'vat', 'VAT on ' || left(p_title, 40));
  end if;
  update public.lives set
    health = least(100, case when p_gain >= 100 then 100 else health + greatest(0, coalesce(p_gain, 0)) end),
    mind = least(100, case when p_mind_gain >= 100 then 100 else mind + greatest(0, coalesce(p_mind_gain, 0)) end),
    recovering_until = case when coalesce(p_away_days, 0) > 0 then now() + make_interval(secs => p_away_days * public.setting('work_day_hours') * 3600) else recovering_until end,
    health_at = now()
  where user_id = p_user;
  return jsonb_build_object('health', (select health from public.lives where user_id = p_user), 'mind', (select mind from public.lives where user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ interviews
/** A failed interview: wait before trying that job there again. */
create or replace function public.life_interview_fail(p_user uuid, p_place text, p_job text) returns void
language sql security definer set search_path = public as $$
  insert into public.life_interview_fails (user_id, place, job) values (p_user, left(p_place, 40), p_job)
  on conflict (user_id, place, job) do update set failed_at = now()
$$;

/** When you can try this interview again (null: now). */
create or replace function public.life_interview_wait(p_user uuid, p_place text, p_job text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select failed_at + make_interval(hours => public.setting('interview_wait_hours')::int)
  from public.life_interview_fails
  where user_id = p_user and place = p_place and job = p_job and failed_at + make_interval(hours => public.setting('interview_wait_hours')::int) > now()
$$;

-- ============================================================ breakthroughs
/** Open a breakthrough (the game drew it and keeps the answer): only one at a time, and not too often. Returns whether it opened. */
create or replace function public.life_event_open(p_user uuid, p_id text, p_source text, p_key text, p_title text, p_hours numeric) returns boolean
language plpgsql security definer set search_path = public as $$
declare l public.lives;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return false; end if;
  update public.life_events set status = 'expired' where user_id = p_user and status = 'open' and expires_at <= now();
  if exists (select 1 from public.life_events where user_id = p_user and status = 'open') then return false; end if;
  if l.event_at is not null and l.event_at + make_interval(hours => public.setting('event_cooldown_hours')::int) > now() then return false; end if;
  insert into public.life_events (id, user_id, source, key, title, expires_at)
    values (p_id, p_user, p_source, left(p_key, 40), left(p_title, 60), now() + make_interval(secs => least(greatest(coalesce(p_hours, 2), 0.5), 24) * 3600));
  update public.lives set event_at = now() where user_id = p_user;
  return true;
end $$;

/**
 * Close a breakthrough the game has marked: won (a bonus in mint and experience for a job, a boost
 * for a side hustle) or lost (a stalled side hustle for some). Only the open one, once.
 */
create or replace function public.life_event_close(
  p_user uuid, p_id text, p_won boolean, p_bonus numeric, p_skill text, p_skill_days numeric, p_boost numeric, p_boost_days numeric, p_stall_days numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.life_events;
  l public.lives;
  v_bonus numeric := round(least(greatest(coalesce(p_bonus, 0), 0), public.setting('event_bonus_max')), 2);
  v_day numeric := public.setting('work_day_hours') * 3600;
begin
  select * into e from public.life_events where id = p_id and user_id = p_user for update;
  if not found then raise exception 'no_event'; end if;
  if e.status <> 'open' or e.expires_at <= now() then raise exception 'event_over'; end if;
  select * into l from public.lives where user_id = p_user;
  update public.life_events set status = case when p_won then 'won' else 'lost' end,
    reward = jsonb_build_object('bonus', v_bonus, 'skillDays', p_skill_days, 'boost', p_boost, 'boostDays', p_boost_days, 'stallDays', p_stall_days)
  where id = p_id;
  if p_won then
    if v_bonus > 0 then
      perform public.log_coins(p_user, null, 'bonus', v_bonus, false, 'Breakthrough: ' || e.title);
      perform public.life_income(p_user, v_bonus);
    end if;
    if coalesce(p_skill_days, 0) > 0 and p_skill ~ '^[a-z_]{2,30}$' then
      insert into public.life_skills (user_id, skill, days) values (p_user, p_skill, least(p_skill_days, 30))
        on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
    end if;
    if e.source = 'hustle' and coalesce(p_boost_days, 0) > 0 then
      perform public.life_hustle_collect(p_user);
      update public.life_hustles set boost = least(3, greatest(1, coalesce(p_boost, 1))),
        boost_until = now() + make_interval(secs => least(p_boost_days, 7) * v_day) where user_id = p_user;
    end if;
  elsif e.source = 'hustle' and coalesce(p_stall_days, 0) > 0 then
    perform public.life_hustle_collect(p_user);
    update public.life_hustles set stalled_until = now() + make_interval(secs => least(p_stall_days, 3) * v_day) where user_id = p_user;
  end if;
  return jsonb_build_object('won', p_won, 'bonus', case when p_won then v_bonus else 0 end, 'coins', (select coins from public.profiles where id = p_user));
end $$;

-- ============================================================ reading
create or replace function public.life_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'health', l.health,
    'mind', l.mind,
    'exercise', l.exercise,
    'powerOwed', l.power_owed,
    'wasteOwed', l.waste_owed,
    'powerCut', l.power_day > 0 and l.power_owed > l.power_day * public.setting('living_cutoff_days'),
    'budget', l.budget,
    'recoveringUntil', l.recovering_until,
    'wallet', (select coins from public.profiles where id = p_user),
    'pots', coalesce((select jsonb_object_agg(pot, balance) from public.life_pots where user_id = p_user), '{}'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('course', course, 'title', title, 'cert', cert, 'startedAt', started_at, 'endsAt', ends_at, 'done', done_at is not null) order by started_at)
                         from public.life_courses where user_id = p_user), '[]'::jsonb),
    'procedures', coalesce((select jsonb_agg(jsonb_build_object('procedure', procedure, 'title', title, 'at', created_at) order by created_at desc)
                            from public.life_procedures where user_id = p_user), '[]'::jsonb),
    'payOwed', coalesce((select owed from public.life_jobs where user_id = p_user), 0),
    'hustle', (select jsonb_build_object('hustle', hustle, 'title', title, 'skill', skill, 'payDay', pay_day, 'swing', swing, 'hours', hours,
                                         'paidUntil', paid_until, 'boost', boost, 'boostUntil', boost_until, 'stalledUntil', stalled_until)
               from public.life_hustles where user_id = p_user),
    'event', (select jsonb_build_object('id', id, 'source', source, 'key', key, 'title', title, 'expiresAt', expires_at)
              from public.life_events where user_id = p_user and status = 'open' and expires_at > now() order by created_at desc limit 1)
  )
  from public.lives l where l.user_id = p_user
$$;

/** Hours spent by kind over the last p_hours real hours. */
create or replace function public.life_time(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(kind, total), '{}'::jsonb) from (
    select kind, round(sum(hours), 1) as total from public.life_hours
    where user_id = p_user and created_at >= now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365))
    group by kind
  ) s
$$;

create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'commute',
                   'health_care', 'gym', 'school_fees', 'procedure', 'hustle_start', 'property_buy', 'start_grant')
    group by kind
    union all
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ============================================================ the books
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.life_hustles, public.life_hours, public.life_interview_fails, public.life_events from public, anon, authenticated;
  grant all on table public.life_hustles, public.life_hours, public.life_interview_fails, public.life_events to service_role;
  revoke all on sequence public.life_hours_id_seq from public, anon, authenticated;
  grant all on sequence public.life_hours_id_seq to service_role;
  revoke all on public.coin_supply_daily from public, anon, authenticated;
  grant select on public.coin_supply_daily to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.life_tick(uuid, numeric, numeric, numeric, numeric, numeric, numeric, jsonb)', 'public.life_work_factor(numeric, numeric)',
    'public.life_work_collect(uuid, numeric)', 'public.life_hustle_collect(uuid)',
    'public.life_hustle_start(uuid, text, text, text, numeric, numeric, numeric, numeric)', 'public.life_hustle_stop(uuid)',
    'public.life_set_exercise(uuid, text)', 'public.life_care(uuid, text, text, numeric, numeric, numeric, numeric, numeric, boolean, text[])',
    'public.life_interview_fail(uuid, text, text)', 'public.life_interview_wait(uuid, text, text)',
    'public.life_event_open(uuid, text, text, text, text, numeric)',
    'public.life_event_close(uuid, text, boolean, numeric, text, numeric, numeric, numeric, numeric)',
    'public.life_status(uuid)', 'public.life_time(uuid, int)', 'public.life_money(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 042_starter_packs.sql
-- Newtown, part 42: starter packs. A life can start free (start_grant) or with a pack bought once
-- through Paystack before the first home (src/lib/world/packs.ts). The game starts the payment and,
-- once Paystack confirms it, calls life_pack_paid: the pack's mint arrives (or, if the life already
-- started free, the difference). Mint is never turned back into cash. See docs/PACKS.md.
--
-- Safe to run more than once. Run after parts 1-41.

create table if not exists public.starter_payments (
  reference text primary key check (reference ~ '^pk-[a-z0-9-]{8,60}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  pack text not null check (pack ~ '^[a-z_]{2,20}$'),
  mint numeric(14,2) not null check (mint > 0),
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists starter_payments_user_idx on public.starter_payments (user_id);

/** A pack payment started (once a life has a home, packs are no longer offered). */
create or replace function public.life_pack_start(p_user uuid, p_reference text, p_region text, p_pack text, p_mint numeric, p_kobo bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.lives where user_id = p_user and home_unit is not null) then raise exception 'too_late'; end if;
  if exists (select 1 from public.starter_payments where user_id = p_user and status = 'paid') then raise exception 'already'; end if;
  insert into public.starter_payments (reference, user_id, region, pack, mint, amount_kobo) values (p_reference, p_user, p_region, p_pack, p_mint, p_kobo);
end $$;

/**
 * Paystack confirmed a pack (p_kobo: what was actually paid). Once only: starts the life with the
 * pack's mint, or tops up a life already started free to the pack's amount.
 */
create or replace function public.life_pack_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sp public.starter_payments;
  l public.lives;
  v_add numeric;
begin
  select * into sp from public.starter_payments where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if sp.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'mint', sp.mint); end if;
  if coalesce(p_kobo, 0) < sp.amount_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  update public.starter_payments set status = 'paid', paid_at = now() where reference = p_reference;
  perform 1 from public.profiles where id = sp.user_id for update;
  select * into l from public.lives where user_id = sp.user_id for update;
  if not found then
    insert into public.lives (user_id, region, granted) values (sp.user_id, sp.region, sp.mint);
    v_add := sp.mint;
  else
    v_add := greatest(0, sp.mint - l.granted);
    update public.lives set granted = greatest(granted, sp.mint) where user_id = sp.user_id;
  end if;
  if v_add > 0 then
    update public.profiles set coins = coins + v_add where id = sp.user_id;
    perform public.log_coins(sp.user_id, null, 'start_grant', v_add, false, 'Starter pack: ' || sp.pack);
  end if;
  return jsonb_build_object('found', true, 'new', true, 'mint', sp.mint, 'added', v_add);
end $$;

do $$
begin
  revoke all on table public.starter_payments from public, anon, authenticated;
  grant all on table public.starter_payments to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array['public.life_pack_start(uuid, text, text, text, numeric, bigint)', 'public.life_pack_paid(text, bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 043_business.sql
-- Newtown, part 43: real businesses on the map. A business (an advertiser account, by email) leases
-- one building for a year through Paystack, with its name, logo and real details; it lights up for
-- everyone. Upgrades (a bright sign, a refit into another kind of building, an extra storey from a
-- month in) are paid the same way, and any upgrade puts it on the billboards. Landmarks can't be
-- leased (the game only offers buildings), nor buildings any player owns part of. One live lease per
-- account, and at most one new lease a week. Taps, card views, calls, WhatsApp, website, directions
-- and billboard views are counted for the owner. Prices are worked out by the game
-- (src/lib/world/business.ts). See docs/BUSINESS.md.
--
-- Safe to run more than once. Run after parts 1-42.

create table if not exists public.business_leases (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.advertisers (id) on delete cascade,
  building_id text not null check (building_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$'),
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(name) between 2 and 60),
  category text not null check (char_length(category) <= 40),
  about text not null check (char_length(about) between 10 and 300),
  address text not null check (char_length(address) between 5 and 200),
  phone text check (phone is null or char_length(phone) <= 30),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 30),
  website text check (website is null or char_length(website) <= 300),
  logo_path text,
  price_kobo bigint not null check (price_kobo > 0),
  reference text not null unique check (reference ~ '^bz-[a-z0-9-]{8,60}$'),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'live', 'ended', 'removed')),
  glow int not null default 1 check (glow between 1 and 2),
  kind text check (kind is null or kind ~ '^[a-z]{2,20}$'),
  storeys int check (storeys is null or storeys between 1 and 60),
  billboard boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists business_leases_region_idx on public.business_leases (region, status);
create index if not exists business_leases_adv_idx on public.business_leases (advertiser_id, created_at desc);
-- A building has one live lease at most.
create unique index if not exists business_leases_one_live on public.business_leases (building_id) where status = 'live';

create table if not exists public.business_upgrades (
  reference text primary key check (reference ~ '^bz-[a-z0-9-]{8,60}$'),
  lease_id uuid not null references public.business_leases (id) on delete cascade,
  upgrade text not null check (upgrade in ('bright', 'rebuild', 'storey')),
  kind text check (kind is null or kind ~ '^[a-z]{2,20}$'),
  price_kobo bigint not null check (price_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.business_hits (
  lease_id uuid not null references public.business_leases (id) on delete cascade,
  day date not null default (now() at time zone 'Africa/Lagos')::date,
  kind text not null check (kind in ('tap', 'view', 'call', 'whatsapp', 'website', 'directions', 'billboard')),
  n int not null default 0,
  primary key (lease_id, day, kind)
);

/** Leases that have run their year end. */
create or replace function public.business_tidy() returns void
language sql security definer set search_path = public as $$
  update public.business_leases set status = 'ended' where status = 'live' and ends_at <= now()
$$;

/** Start a lease (pending until Paystack confirms). Checks the building is free and the account's limits. */
create or replace function public.business_lease_start(
  p_advertiser uuid, p_building text, p_region text, p_name text, p_category text, p_about text, p_address text,
  p_phone text, p_whatsapp text, p_website text, p_logo text, p_kobo bigint, p_reference text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.business_tidy();
  if split_part(p_building, ':', 1) <> p_region then raise exception 'bad_building'; end if;
  if exists (select 1 from public.business_leases where building_id = p_building and status = 'live') then raise exception 'taken'; end if;
  if exists (select 1 from public.property_units where building_id = p_building) then raise exception 'owned'; end if;
  if exists (select 1 from public.business_leases where advertiser_id = p_advertiser and status = 'live') then raise exception 'one_only'; end if;
  if exists (select 1 from public.business_leases where advertiser_id = p_advertiser and status <> 'pending_payment' and created_at > now() - interval '7 days') then
    raise exception 'one_a_week';
  end if;
  insert into public.business_leases (advertiser_id, building_id, region, name, category, about, address, phone, whatsapp, website, logo_path, price_kobo, reference)
    values (p_advertiser, p_building, p_region, p_name, p_category, p_about, p_address, nullif(p_phone, ''), nullif(p_whatsapp, ''), nullif(p_website, ''), p_logo, p_kobo, p_reference)
    returning id into v_id;
  return v_id;
end $$;

/**
 * Paystack confirmed a payment (p_kobo actually paid): a lease goes live for a year, or an upgrade
 * is applied (and the business goes on the billboards). Once only; a building taken meanwhile stays
 * pending (and is refunded by hand).
 */
create or replace function public.business_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.business_leases;
  u public.business_upgrades;
begin
  select * into l from public.business_leases where reference = p_reference for update;
  if found then
    if l.status <> 'pending_payment' then return jsonb_build_object('found', true, 'new', false, 'id', l.id); end if;
    if coalesce(p_kobo, 0) < l.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
    if exists (select 1 from public.business_leases where building_id = l.building_id and status = 'live')
       or exists (select 1 from public.property_units where building_id = l.building_id) then
      return jsonb_build_object('found', true, 'new', false, 'clash', true, 'id', l.id);
    end if;
    update public.business_leases set status = 'live', starts_at = now(), ends_at = now() + interval '365 days' where id = l.id;
    return jsonb_build_object('found', true, 'new', true, 'id', l.id);
  end if;
  select * into u from public.business_upgrades where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if u.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'id', u.lease_id); end if;
  if coalesce(p_kobo, 0) < u.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  update public.business_upgrades set status = 'paid', paid_at = now() where reference = p_reference;
  update public.business_leases set
    glow = case when u.upgrade = 'bright' then 2 else glow end,
    kind = case when u.upgrade = 'rebuild' then u.kind else kind end,
    storeys = case when u.upgrade = 'storey' then coalesce(storeys, 1) + 1 else storeys end,
    billboard = true
  where id = u.lease_id;
  return jsonb_build_object('found', true, 'new', true, 'id', u.lease_id, 'upgrade', u.upgrade);
end $$;

/** Start paying for an upgrade to a live lease (a storey only from a month in). */
create or replace function public.business_upgrade_start(p_advertiser uuid, p_lease uuid, p_upgrade text, p_kind text, p_kobo bigint, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.business_leases;
begin
  select * into l from public.business_leases where id = p_lease and advertiser_id = p_advertiser;
  if not found or l.status <> 'live' then raise exception 'not_yours'; end if;
  if p_upgrade = 'storey' and l.starts_at > now() - interval '30 days' then raise exception 'too_soon'; end if;
  if p_upgrade = 'bright' and l.glow >= 2 then raise exception 'already'; end if;
  insert into public.business_upgrades (reference, lease_id, upgrade, kind, price_kobo) values (p_reference, p_lease, p_upgrade, p_kind, p_kobo);
end $$;

/** Count something people did with a business (only live ones). */
create or replace function public.business_hit(p_lease uuid, p_kind text) returns void
language sql security definer set search_path = public as $$
  insert into public.business_hits (lease_id, kind, n)
  select p_lease, p_kind, 1 where exists (select 1 from public.business_leases where id = p_lease and status = 'live')
  on conflict (lease_id, day, kind) do update set n = business_hits.n + 1
$$;

/** Live businesses in a region, for the map. */
create or replace function public.businesses_in(p_region text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'building', building_id, 'name', name, 'category', category, 'about', about, 'address', address,
    'phone', phone, 'whatsapp', whatsapp, 'website', website, 'logo', logo_path, 'glow', glow, 'kind', kind,
    'storeys', storeys, 'billboard', billboard)), '[]'::jsonb)
  from public.business_leases where region = p_region and status = 'live' and ends_at > now()
$$;

/** An account's leases with their numbers (for the business page). */
create or replace function public.business_mine(p_advertiser uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'building', l.building_id, 'name', l.name, 'category', l.category, 'about', l.about, 'address', l.address,
    'phone', l.phone, 'whatsapp', l.whatsapp, 'website', l.website, 'logo', l.logo_path, 'status', l.status, 'glow', l.glow,
    'kind', l.kind, 'storeys', l.storeys, 'billboard', l.billboard, 'startsAt', l.starts_at, 'endsAt', l.ends_at, 'priceKobo', l.price_kobo,
    'hits', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id group by kind) s), '{}'::jsonb),
    'week', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id and h.day > (now() at time zone 'Africa/Lagos')::date - 7 group by kind) s), '{}'::jsonb)
  ) order by l.created_at desc), '[]'::jsonb)
  from public.business_leases l where l.advertiser_id = p_advertiser and l.status <> 'pending_payment'
$$;

do $$
begin
  revoke all on table public.business_leases, public.business_upgrades, public.business_hits from public, anon, authenticated;
  grant all on table public.business_leases, public.business_upgrades, public.business_hits to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.business_tidy()',
    'public.business_lease_start(uuid, text, text, text, text, text, text, text, text, text, text, bigint, text)',
    'public.business_paid(text, bigint)', 'public.business_upgrade_start(uuid, uuid, text, text, bigint, text)',
    'public.business_hit(uuid, text)', 'public.businesses_in(text)', 'public.business_mine(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 044_services.sql
-- Newtown, part 44: services between people (docs/SERVICES.md, src/lib/world/services.ts).
--
-- Players who own property offer services (up to 5 open at once); anyone with a life books one, or
-- posts a request with what they'll pay. In-game services are paid in mint: the price is held from
-- the buyer (Savings, then wallet) when booked, and paid to the provider when the buyer confirms it's
-- done, or by itself 6 hours after the provider marks it done, less VAT (into the treasuries). The
-- provider can decline (the buyer gets it back) and the buyer can cancel until it's marked done. A
-- finished in-game service does something for the buyer (the game says what: mind or body). Real-life
-- services are only listed: people agree and pay outside the game.
--
-- Safe to run more than once. Run after parts 1-43.

insert into public.game_settings (key, value, note) values
  ('service_vat',          0.075, 'VAT on in-game services (paid by the provider out of the price)'),
  ('service_release_hours', 6,    'Hours after a job is marked done before it pays the provider by itself'),
  ('service_max_offers',   5,     'Open offers each provider can have'),
  ('service_price_max',    100000, 'Dearest in-game service (mint)')
on conflict (key) do update set note = excluded.note;

create table if not exists public.service_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  kind text not null check (kind in ('game', 'real')),
  category text not null check (char_length(category) <= 40),
  title text not null check (char_length(title) between 3 and 60),
  about text not null check (char_length(about) between 10 and 300),
  price numeric(14,2) not null check (price > 0),
  area text not null check (char_length(area) between 2 and 60),
  phone text check (phone is null or char_length(phone) <= 30),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 30),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists service_offers_region_idx on public.service_offers (region, active, created_at desc);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  kind text not null check (kind in ('game', 'real')),
  category text not null check (char_length(category) <= 40),
  title text not null check (char_length(title) between 3 and 60),
  about text not null check (char_length(about) between 10 and 300),
  budget numeric(14,2) not null check (budget > 0),
  area text not null check (char_length(area) between 2 and 60),
  phone text check (phone is null or char_length(phone) <= 30),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 30),
  status text not null default 'open' check (status in ('open', 'taken', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists service_requests_region_idx on public.service_requests (region, status, created_at desc);

create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.service_offers (id) on delete set null,
  request_id uuid references public.service_requests (id) on delete set null,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.profiles (id) on delete cascade,
  region text not null,
  title text not null,
  category text not null,
  price numeric(14,2) not null check (price > 0),
  effect jsonb,
  status text not null default 'held' check (status in ('held', 'done', 'paid', 'refunded')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  settled_at timestamptz
);
create index if not exists service_jobs_buyer_idx on public.service_jobs (buyer_id, created_at desc);
create index if not exists service_jobs_provider_idx on public.service_jobs (provider_id, created_at desc);

create or replace function public.service_owner(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.property_units where owner_id = p_user)
$$;

/** Offer a service (property owners only). */
create or replace function public.service_offer(
  p_user uuid, p_kind text, p_category text, p_title text, p_about text, p_price numeric, p_area text, p_phone text, p_whatsapp text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_region text; v_id uuid;
begin
  select region into v_region from public.lives where user_id = p_user;
  if v_region is null then raise exception 'no_life'; end if;
  if not public.service_owner(p_user) then raise exception 'not_owner'; end if;
  if p_kind = 'game' and p_price > public.setting('service_price_max') then raise exception 'bad_price'; end if;
  if (select count(*) from public.service_offers where user_id = p_user and active) >= public.setting('service_max_offers') then raise exception 'too_many'; end if;
  insert into public.service_offers (user_id, region, kind, category, title, about, price, area, phone, whatsapp)
    values (p_user, v_region, p_kind, p_category, btrim(p_title), btrim(p_about), round(p_price, 2), btrim(p_area), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_whatsapp, '')), ''))
    returning id into v_id;
  return v_id;
end $$;

/** Post a request: what you need and what you'll pay. */
create or replace function public.service_request(
  p_user uuid, p_kind text, p_category text, p_title text, p_about text, p_budget numeric, p_area text, p_phone text, p_whatsapp text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_region text; v_id uuid;
begin
  select region into v_region from public.lives where user_id = p_user;
  if v_region is null then raise exception 'no_life'; end if;
  if p_kind = 'game' and p_budget > public.setting('service_price_max') then raise exception 'bad_price'; end if;
  if (select count(*) from public.service_requests where user_id = p_user and status = 'open') >= 5 then raise exception 'too_many'; end if;
  insert into public.service_requests (user_id, region, kind, category, title, about, budget, area, phone, whatsapp)
    values (p_user, v_region, p_kind, p_category, btrim(p_title), btrim(p_about), round(p_budget, 2), btrim(p_area), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_whatsapp, '')), ''))
    returning id into v_id;
  return v_id;
end $$;

/** Close one of your offers or requests. */
create or replace function public.service_close(p_user uuid, p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.service_offers set active = false where id = p_id and user_id = p_user;
  update public.service_requests set status = 'closed' where id = p_id and user_id = p_user and status = 'open';
$$;

/** Hold an in-game service's price from the buyer and open the job. */
create or replace function public.service_hold(p_buyer uuid, p_provider uuid, p_offer uuid, p_request uuid, p_title text, p_category text, p_price numeric, p_effect jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_region text; v_id uuid;
begin
  if p_buyer = p_provider then raise exception 'own'; end if;
  select region into v_region from public.lives where user_id = p_buyer;
  if v_region is null then raise exception 'no_life'; end if;
  perform 1 from public.profiles where id = p_buyer for update;
  if public.life_can_spend(p_buyer, array['savings']) < p_price then raise exception 'not_enough:%', trim_scale(p_price); end if;
  perform public.life_spend(p_buyer, array['savings'], p_price);
  perform public.log_coins(p_buyer, null, 'service_hold', -p_price, false, 'Held for: ' || left(p_title, 60));
  insert into public.service_jobs (offer_id, request_id, buyer_id, provider_id, region, title, category, price, effect)
    values (p_offer, p_request, p_buyer, p_provider, v_region, left(p_title, 60), p_category, p_price, p_effect)
    returning id into v_id;
  return v_id;
end $$;

/** Book an in-game service from an offer (the game says what it does for you). */
create or replace function public.service_book(p_user uuid, p_offer uuid, p_effect jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.service_offers;
begin
  select * into o from public.service_offers where id = p_offer and active and kind = 'game';
  if not found then raise exception 'gone'; end if;
  return public.service_hold(p_user, o.user_id, o.id, null, o.title, o.category, o.price, p_effect);
end $$;

/** Take an in-game request (property owners only): the requester's budget is held. */
create or replace function public.service_take(p_user uuid, p_request uuid, p_effect jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.service_requests; v_id uuid;
begin
  if not public.service_owner(p_user) then raise exception 'not_owner'; end if;
  select * into r from public.service_requests where id = p_request and status = 'open' and kind = 'game' for update;
  if not found then raise exception 'gone'; end if;
  begin
    v_id := public.service_hold(r.user_id, p_user, null, r.id, r.title, r.category, r.budget, p_effect);
  exception when others then
    if sqlerrm like 'not_enough%' then raise exception 'their_funds'; end if;
    raise;
  end;
  update public.service_requests set status = 'taken' where id = r.id;
  return v_id;
end $$;

/** Pay a finished job: the provider gets the price less VAT; the buyer gets what the service does. */
create or replace function public.service_pay(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  j public.service_jobs;
  v_vat numeric;
begin
  select * into j from public.service_jobs where id = p_job for update;
  if j.status not in ('held', 'done') then return; end if;
  v_vat := round(j.price * public.setting('service_vat'), 2);
  update public.service_jobs set status = 'paid', settled_at = now() where id = p_job;
  perform 1 from public.profiles where id = j.provider_id for update;
  update public.profiles set coins = coins + j.price - v_vat where id = j.provider_id;
  perform public.log_coins(j.provider_id, null, 'service_pay', j.price, false, 'For: ' || j.title);
  if v_vat > 0 then
    perform public.log_coins(j.provider_id, null, 'vat', -v_vat, false, 'VAT');
    perform public.pay_tax(j.region, v_vat, 'vat', 'VAT on a service');
  end if;
  if j.effect is not null then
    update public.lives set
      mind = least(100, mind + least(20, greatest(0, coalesce((j.effect ->> 'mind')::numeric, 0)))),
      health = least(100, health + least(20, greatest(0, coalesce((j.effect ->> 'body')::numeric, 0))))
    where user_id = j.buyer_id;
  end if;
end $$;

/** Jobs marked done long enough ago pay by themselves. */
create or replace function public.service_tidy() returns void
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  for v in select id from public.service_jobs where status = 'done'
             and done_at < now() - make_interval(hours => public.setting('service_release_hours')::int) loop
    perform public.service_pay(v);
  end loop;
end $$;

/** Something done to a job: the provider marks it done or declines; the buyer confirms or cancels. */
create or replace function public.service_job(p_user uuid, p_job uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare j public.service_jobs;
begin
  select * into j from public.service_jobs where id = p_job for update;
  if not found then raise exception 'gone'; end if;
  if p_action = 'done' then
    if j.provider_id <> p_user or j.status <> 'held' then raise exception 'not_now'; end if;
    update public.service_jobs set status = 'done', done_at = now() where id = p_job;
  elsif p_action = 'confirm' then
    if j.buyer_id <> p_user or j.status not in ('held', 'done') then raise exception 'not_now'; end if;
    perform public.service_pay(p_job);
  elsif p_action in ('decline', 'cancel') then
    if (p_action = 'decline' and j.provider_id <> p_user) or (p_action = 'cancel' and j.buyer_id <> p_user) or j.status <> 'held' then raise exception 'not_now'; end if;
    update public.service_jobs set status = 'refunded', settled_at = now() where id = p_job;
    update public.profiles set coins = coins + j.price where id = j.buyer_id;
    perform public.log_coins(j.buyer_id, null, 'service_refund', j.price, false, 'Back from: ' || j.title);
    if j.request_id is not null then update public.service_requests set status = 'open' where id = j.request_id and status = 'taken'; end if;
  else
    raise exception 'not_now';
  end if;
end $$;

/** The board: open offers and requests in your region (newest first), your jobs, and whether you can offer. */
create or replace function public.service_board(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_region text;
begin
  perform public.service_tidy();
  select region into v_region from public.lives where user_id = p_user;
  v_region := coalesce(v_region, 'lagos');
  return jsonb_build_object(
    'canOffer', public.service_owner(p_user),
    'offers', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (
      select jsonb_build_object('id', o.id, 'kind', o.kind, 'category', o.category, 'title', o.title, 'about', o.about, 'price', o.price,
        'area', o.area, 'phone', o.phone, 'whatsapp', o.whatsapp, 'provider', coalesce(p.username, 'A player'), 'mine', o.user_id = p_user, 'at', o.created_at) as x
      from public.service_offers o join public.profiles p on p.id = o.user_id
      where o.region = v_region and o.active and not p.frozen and p.age_blocked_at is null
      order by o.created_at desc limit 100) s), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (
      select jsonb_build_object('id', r.id, 'kind', r.kind, 'category', r.category, 'title', r.title, 'about', r.about, 'budget', r.budget,
        'area', r.area, 'phone', r.phone, 'whatsapp', r.whatsapp, 'by', coalesce(p.username, 'A player'), 'mine', r.user_id = p_user, 'status', r.status, 'at', r.created_at) as x
      from public.service_requests r join public.profiles p on p.id = r.user_id
      where r.region = v_region and (r.status = 'open' or (r.user_id = p_user and r.status = 'taken')) and not p.frozen and p.age_blocked_at is null
      order by r.created_at desc limit 100) s), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'category', j.category, 'price', j.price, 'status', j.status,
        'buying', j.buyer_id = p_user, 'other', coalesce(case when j.buyer_id = p_user then pp.username else pb.username end, 'A player'),
        'doneAt', j.done_at, 'createdAt', j.created_at) order by j.created_at desc)
      from public.service_jobs j join public.profiles pb on pb.id = j.buyer_id join public.profiles pp on pp.id = j.provider_id
      where (j.buyer_id = p_user or j.provider_id = p_user) and (j.status in ('held', 'done') or j.settled_at > now() - interval '7 days')), '[]'::jsonb)
  );
end $$;

-- The books: service money moves between players (nothing new is made).
do $$
begin
  revoke all on table public.service_offers, public.service_requests, public.service_jobs from public, anon, authenticated;
  grant all on table public.service_offers, public.service_requests, public.service_jobs to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.service_owner(uuid)', 'public.service_offer(uuid, text, text, text, text, numeric, text, text, text)',
    'public.service_request(uuid, text, text, text, text, numeric, text, text, text)', 'public.service_close(uuid, uuid)',
    'public.service_hold(uuid, uuid, uuid, uuid, text, text, numeric, jsonb)', 'public.service_book(uuid, uuid, jsonb)',
    'public.service_take(uuid, uuid, jsonb)', 'public.service_pay(uuid)', 'public.service_tidy()', 'public.service_job(uuid, uuid, text)',
    'public.service_board(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 045_map_reports.sql
-- Newtown, part 45: players report problems with the map (a road that stops short, a wrong name,
-- water where there's land...). Each report keeps the exact spot (the tile and its real latitude and
-- longitude) and what the map showed there. The owner sees them at /map-reports, grouped by place,
-- and marks them fixed, won't fix or duplicate; reporters hear back when theirs is fixed. Fixes
-- themselves go into the region's corrections (src/lib/world/regions/*/corrections.ts).
-- See docs/MAP_REPORTS.md.
--
-- Safe to run more than once. Run after parts 1-44.

insert into public.game_settings (key, value, note) values
  ('map_reports_per_day', 5, 'Map problem reports each player can send a day')
on conflict (key) do update set note = excluded.note;

create table if not exists public.map_reports (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  x int not null,
  z int not null,
  lat numeric(9,6) not null,
  lon numeric(9,6) not null,
  kind text not null check (kind in ('road', 'bridge', 'building', 'place', 'name', 'water', 'other')),
  note text check (note is null or char_length(note) <= 300),
  what_there text check (what_there is null or char_length(what_there) <= 200),
  status text not null default 'open' check (status in ('open', 'fixed', 'wontfix', 'duplicate')),
  reply text check (reply is null or char_length(reply) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists map_reports_open_idx on public.map_reports (region, status, created_at desc);
create index if not exists map_reports_user_idx on public.map_reports (user_id, created_at desc);

/** Send a report (a few a day each). */
create or replace function public.map_report(
  p_user uuid, p_region text, p_x int, p_z int, p_lat numeric, p_lon numeric, p_kind text, p_note text, p_what text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if (select count(*) from public.map_reports where user_id = p_user and created_at > now() - interval '1 day') >= public.setting('map_reports_per_day') then
    raise exception 'too_many';
  end if;
  if exists (select 1 from public.map_reports where user_id = p_user and region = p_region and x = p_x and z = p_z and kind = p_kind and status = 'open') then
    raise exception 'already';
  end if;
  insert into public.map_reports (user_id, region, x, z, lat, lon, kind, note, what_there)
    values (p_user, p_region, p_x, p_z, p_lat, p_lon, p_kind, nullif(btrim(coalesce(p_note, '')), ''), left(p_what, 200))
    returning id into v_id;
  return v_id;
end $$;

/** Reports for the owner's page, newest first (by status: 'open', or 'all'). */
create or replace function public.map_reports_list(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'region', r.region, 'x', r.x, 'z', r.z, 'lat', r.lat, 'lon', r.lon, 'kind', r.kind, 'note', r.note,
    'whatThere', r.what_there, 'status', r.status, 'reply', r.reply, 'at', r.created_at, 'by', coalesce(p.username, 'A player')
  ) order by r.created_at desc), '[]'::jsonb)
  from (select * from public.map_reports where p_status = 'all' or status = p_status order by created_at desc limit 500) r
  left join public.profiles p on p.id = r.user_id
$$;

/** The owner marks a report; reporters hear back when it's fixed. */
create or replace function public.map_report_set(p_id bigint, p_status text, p_reply text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.map_reports;
begin
  if p_status not in ('open', 'fixed', 'wontfix', 'duplicate') then raise exception 'bad_status'; end if;
  update public.map_reports set status = p_status, reply = nullif(btrim(coalesce(p_reply, '')), ''),
    resolved_at = case when p_status = 'open' then null else now() end
  where id = p_id returning * into r;
  if r.user_id is not null and p_status = 'fixed' then
    perform public.notify(r.user_id, null, 'map_report',
      'Thanks! The map problem you reported has been fixed' || coalesce(': ' || r.reply, '.'), null);
  end if;
end $$;

do $$
begin
  revoke all on table public.map_reports from public, anon, authenticated;
  grant all on table public.map_reports to service_role;
  revoke all on sequence public.map_reports_id_seq from public, anon, authenticated;
  grant all on sequence public.map_reports_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.map_report(uuid, text, int, int, numeric, numeric, text, text, text)', 'public.map_reports_list(text)', 'public.map_report_set(bigint, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 046_market.sql
-- Newtown, part 46: the player market (docs/MARKET.md). Players trade property with each other,
-- rent waits for a tenant, and the World Bank lends against property.
--
--  - Selling: put a unit up at an asking price; anyone can buy it at that price. The buyer pays
--    the price and the 3% purchase tax; the seller gets the price less a 2% sale tax. Mint moves
--    from player to player (nothing is made or burned); both taxes go to the treasuries.
--  - Offers: offer any price for a unit someone owns (not their home). The offer and its tax are
--    held from your wallet until it's answered: the owner accepts, refuses or counters; you can
--    accept a counter or withdraw. Offers lapse after a day, and the held mint comes back.
--  - Tenants: a unit let out earns nothing until a tenant moves in. Fair rent finds one in a few
--    hours, cheap rent sooner, high rent later (and earns more once they're in).
--  - World Bank loans: borrow up to half of what your property cost, paid back each game month
--    (60 real hours) with interest. Selling a unit the loan rests on pays the bank first. Miss
--    three payments in a row and the bank takes the property (it goes back to the city).
--
-- Safe to run more than once. Run after parts 1-45.

insert into public.game_settings (key, value, note) values
  ('property_sale_tax',   0.02,  'Tax on selling property to another player (the seller pays; into the treasuries)'),
  ('offer_hours',         24,    'Real hours before an unanswered offer lapses'),
  ('offers_open_max',     5,     'Open offers each player can have at once'),
  ('tenant_wait_hours',   4,     'Real hours a let unit at fair rent waits for a tenant (on average)'),
  ('loan_rate',           0.24,  'World Bank interest a game year'),
  ('loan_ltv',            0.5,   'Most the World Bank lends, as a share of what your property cost'),
  ('loan_month_hours',    60,    'Real hours between loan payments (a game month)'),
  ('loan_misses',         3,     'Missed payments in a row before the bank takes the property'),
  ('world_bank_opening',  5000000, 'What the World Bank opens with (once)')
on conflict (key) do update set note = excluded.note;

-- ============================================================ more on units and sales
alter table public.property_units add column if not exists tenant_from timestamptz;
alter table public.property_units add column if not exists rent_level text not null default 'fair';
alter table public.property_units add column if not exists loan_id bigint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_units_rent_level_check') then
    alter table public.property_units add constraint property_units_rent_level_check check (rent_level in ('low', 'fair', 'high'));
  end if;
end $$;
-- Units let out before this part already have their tenant.
update public.property_units set tenant_from = collected_at where let and tenant_from is null;

alter table public.property_sales add column if not exists seller_tax numeric(14,2) not null default 0;

create table if not exists public.property_listings (
  unit_id text primary key references public.property_units (unit_id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  price numeric(14,2) not null check (price > 0),
  created_at timestamptz not null default now()
);
create index if not exists property_listings_seller_idx on public.property_listings (seller_id);

create table if not exists public.property_offers (
  id bigserial primary key,
  unit_id text not null,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  price numeric(14,2) not null check (price > 0),
  -- What's held from the buyer's wallet (the price and the purchase tax).
  held numeric(14,2) not null,
  counter numeric(14,2),
  status text not null default 'open' check (status in ('open', 'countered', 'accepted', 'refused', 'withdrawn', 'lapsed', 'void')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);
create index if not exists property_offers_unit_idx on public.property_offers (unit_id) where status in ('open', 'countered');
create index if not exists property_offers_buyer_idx on public.property_offers (buyer_id, created_at desc);
create index if not exists property_offers_seller_idx on public.property_offers (seller_id, created_at desc);

-- ============================================================ the World Bank
create table if not exists public.loans (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null,
  principal numeric(14,2) not null check (principal > 0),
  balance numeric(14,2) not null,
  rate numeric(6,4) not null,
  instalment numeric(14,2) not null,
  months int not null,
  next_due timestamptz not null,
  missed int not null default 0,
  status text not null default 'open' check (status in ('open', 'repaid', 'defaulted')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists loans_user_idx on public.loans (user_id, created_at desc);
create unique index if not exists loans_one_open on public.loans (user_id) where status = 'open';

insert into public.treasuries (id, name, parent) values ('wb', 'World Bank', null) on conflict (id) do nothing;
do $$
declare v numeric := public.setting('world_bank_opening');
begin
  if not exists (select 1 from public.treasury_ledger where treasury = 'wb' and kind = 'opening') then
    update public.treasuries set balance = balance + v where id = 'wb';
    insert into public.treasury_ledger (treasury, amount, kind, note) values ('wb', v, 'opening', 'Opening balance');
    insert into public.ledger (user_id, round_id, kind, amount, bonus, note) values (null, null, 'treasury_opening', v, false, 'The World Bank opens');
  end if;
end $$;

/** Move mint in or out of a treasury, and record it. */
create or replace function public.treasury_move(p_treasury text, p_amount numeric, p_kind text, p_note text) returns void
language sql security definer set search_path = public as $$
  update public.treasuries set balance = balance + p_amount where id = p_treasury;
  insert into public.treasury_ledger (treasury, amount, kind, note) select p_treasury, p_amount, p_kind, p_note where p_amount <> 0;
$$;

-- ============================================================ tenants and rent
/** How much more (or less) a unit earns at each rent level. */
create or replace function public.rent_factor(p_level text) returns numeric
language sql immutable as $$ select case p_level when 'low' then 0.85 when 'high' then 1.2 else 1 end $$;

/** When a tenant moves in if you let a unit out now at this rent level. */
create or replace function public.tenant_arrives(p_level text) returns timestamptz
language sql volatile as $$
  select now() + make_interval(secs => public.setting('tenant_wait_hours') * 3600
    * case p_level when 'low' then 0.4 when 'high' then 3 else 1 end * (0.5 + random()))
$$;

/** Rent a unit has earned since it was last collected (only while a tenant is in). */
create or replace function public.rent_waiting(u public.property_units) returns numeric
language sql stable as $$
  select case when u.let and u.tenant_from is not null and u.tenant_from < now() then
    round(u.rent_day * public.rent_factor(u.rent_level) * extract(epoch from (now() - greatest(u.collected_at, u.tenant_from))) / 86400, 2)
  else 0 end
$$;

create or replace function public.property_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.property_units;
  v_gross numeric := 0;
  v_tax numeric := 0;
  v_rent numeric;
  v_unit_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  for u in select * from public.property_units where owner_id = p_user and let and rent_day > 0 for update loop
    v_rent := public.rent_waiting(u);
    if v_rent <= 0 then continue; end if;
    v_unit_tax := round(v_rent * public.setting('property_rent_tax'), 2);
    perform public.pay_tax(split_part(u.unit_id, ':', 1), v_unit_tax, 'rent_tax', 'Rent tax on ' || u.unit_id);
    update public.property_units set collected_at = now() where unit_id = u.unit_id;
    v_gross := v_gross + v_rent;
    v_tax := v_tax + v_unit_tax;
  end loop;
  if v_gross > 0 then
    perform public.log_coins(p_user, null, 'rent', v_gross, false, 'Rent');
    if v_tax > 0 then perform public.log_coins(p_user, null, 'rent_tax', -v_tax, false, 'Tax on rent'); end if;
    perform public.life_income(p_user, v_gross - v_tax);
  end if;
  return jsonb_build_object('rent', v_gross - v_tax, 'tax', v_tax, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Let one of your units out (or stop): not your home. A tenant moves in after a while. */
create or replace function public.property_let(p_user uuid, p_unit text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_home text;
  v_out jsonb;
  u public.property_units;
begin
  select * into u from public.property_units where unit_id = p_unit and owner_id = p_user for update;
  if not found then raise exception 'not_yours'; end if;
  select home_unit into v_home from public.lives where user_id = p_user;
  if p_on and v_home = p_unit then raise exception 'is_home'; end if;
  v_out := public.property_collect(p_user);
  if coalesce(p_on, false) and not u.let then
    update public.property_units set let = true, collected_at = now(), tenant_from = public.tenant_arrives(u.rent_level) where unit_id = p_unit;
  elsif not coalesce(p_on, false) then
    update public.property_units set let = false, collected_at = now(), tenant_from = null where unit_id = p_unit;
  end if;
  return v_out;
end $$;

/** Set a unit's rent: low, fair or high. If it's let, the tenant leaves and a new one is found at the new rent. */
create or replace function public.property_rent_level(p_user uuid, p_unit text, p_level text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.property_units;
  v_out jsonb := '{}'::jsonb;
begin
  if p_level not in ('low', 'fair', 'high') then raise exception 'bad_level'; end if;
  select * into u from public.property_units where unit_id = p_unit and owner_id = p_user for update;
  if not found then raise exception 'not_yours'; end if;
  if u.rent_level = p_level then return v_out; end if;
  if u.let then
    v_out := public.property_collect(p_user);
    update public.property_units set rent_level = p_level, collected_at = now(), tenant_from = public.tenant_arrives(p_level) where unit_id = p_unit;
  else
    update public.property_units set rent_level = p_level where unit_id = p_unit;
  end if;
  return v_out;
end $$;

-- ============================================================ offers: tidying
/** Give back what an offer held, and close it. */
create or replace function public.offer_close(p_offer bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.property_offers;
begin
  select * into o from public.property_offers where id = p_offer and status in ('open', 'countered') for update;
  if not found then return; end if;
  update public.property_offers set status = p_status, decided_at = now() where id = p_offer;
  update public.profiles set coins = coins + o.held where id = o.buyer_id;
  perform public.log_coins(o.buyer_id, null, 'offer_refund', o.held, false, 'Offer on ' || o.unit_id || ' ' || p_status);
end $$;

/** Offers past their time lapse (the held mint goes back). */
create or replace function public.market_tidy() returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  for v_id in select id from public.property_offers where status in ('open', 'countered') and expires_at < now() loop
    perform public.offer_close(v_id, 'lapsed');
    perform public.notify((select buyer_id from public.property_offers where id = v_id), null, 'market', 'Your offer lapsed: nobody answered in time. Your mint is back.');
  end loop;
end $$;

-- ============================================================ a sale between players
/**
 * Hand a unit from its owner to a buyer at a price. p_held: what the buyer already put down (an
 * offer's hold), taken off what they pay now. The seller's rent so far is collected first, a loan
 * on the unit is paid off first from the price, and every other offer on it is given back.
 */
create or replace function public.market_complete(p_unit text, p_buyer uuid, p_price numeric, p_held numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.property_units;
  b public.profiles;
  bl public.lives;
  ln public.loans;
  v_region text := split_part(p_unit, ':', 1);
  v_buy_tax numeric := round(p_price * public.setting('property_buy_tax'), 2);
  v_sale_tax numeric := round(p_price * public.setting('property_sale_tax'), 2);
  v_due numeric;
  v_to_bank numeric := 0;
  v_home boolean := false;
  v_id bigint;
begin
  select * into u from public.property_units where unit_id = p_unit for update;
  if not found then raise exception 'gone'; end if;
  if u.owner_id = p_buyer then raise exception 'yours'; end if;
  if (select home_unit from public.lives where user_id = u.owner_id) = p_unit then raise exception 'is_home'; end if;
  select * into b from public.profiles where id = p_buyer for update;
  if not found or b.is_bot then raise exception 'unknown_player'; end if;
  if b.frozen or b.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into bl from public.lives where user_id = p_buyer for update;
  if not found then raise exception 'no_life'; end if;
  if bl.home_unit is null and u.use <> 'home' then raise exception 'home_first'; end if;
  v_due := p_price + v_buy_tax - coalesce(p_held, 0);
  if b.coins < v_due then raise exception 'not_enough:%', trim_scale(v_due); end if;
  perform 1 from public.profiles where id = u.owner_id for update;

  -- The seller's rent up to now, then the hand-over (a tenant stays in).
  perform public.property_collect(u.owner_id);
  update public.property_units set owner_id = p_buyer, price = p_price, bought_at = now(), collected_at = now(), loan_id = null where unit_id = p_unit;
  delete from public.property_listings where unit_id = p_unit;
  for v_id in select id from public.property_offers where unit_id = p_unit and status in ('open', 'countered') loop
    perform public.offer_close(v_id, 'void');
  end loop;

  -- The buyer pays (what an offer held is already out of their wallet).
  update public.profiles set coins = coins - v_due where id = p_buyer;
  if coalesce(p_held, 0) > 0 then perform public.log_coins(p_buyer, null, 'offer_refund', p_held, false, 'Offer on ' || p_unit || ' accepted'); end if;
  perform public.log_coins(p_buyer, null, 'property_buy', -(p_price + v_buy_tax), false, 'Bought ' || p_unit);
  perform public.pay_tax(v_region, v_buy_tax, 'property_tax', 'Tax on buying ' || p_unit);

  -- The seller is paid, the bank first if the unit stood behind a loan.
  if u.loan_id is not null then
    select * into ln from public.loans where id = u.loan_id and status = 'open' for update;
    if found then
      v_to_bank := least(ln.balance, p_price - v_sale_tax);
      update public.loans set balance = balance - v_to_bank where id = ln.id;
      perform public.treasury_move('wb', v_to_bank, 'loan_repay', 'Loan paid from the sale of ' || p_unit);
      if ln.balance - v_to_bank <= 0.01 then
        update public.loans set status = 'repaid', balance = 0, closed_at = now() where id = ln.id;
        update public.property_units set loan_id = null where loan_id = ln.id;
      end if;
    end if;
  end if;
  update public.profiles set coins = coins + (p_price - v_sale_tax - v_to_bank) where id = u.owner_id;
  perform public.log_coins(u.owner_id, null, 'property_sale', p_price, false, 'Sold ' || p_unit);
  perform public.log_coins(u.owner_id, null, 'sale_tax', -v_sale_tax, false, 'Tax on selling ' || p_unit);
  if v_to_bank > 0 then perform public.log_coins(u.owner_id, null, 'loan_repay', -v_to_bank, false, 'Loan paid from the sale'); end if;
  perform public.pay_tax(v_region, v_sale_tax, 'sale_tax', 'Tax on selling ' || p_unit);

  insert into public.property_sales (unit_id, seller_id, buyer_id, price, tax, seller_tax) values (p_unit, u.owner_id, p_buyer, p_price, v_buy_tax, v_sale_tax);
  if bl.home_unit is null then
    update public.lives set home_unit = p_unit where user_id = p_buyer;
    v_home := true;
  end if;
  perform public.notify(u.owner_id, null, 'market', format('You sold %s for ₥%s.', u.label, trim_scale(p_price)));
  return jsonb_build_object('coins', b.coins - v_due, 'home', v_home, 'tax', v_buy_tax);
end $$;

-- ============================================================ selling
/** Put one of your units up for sale (or change its price). Not your home. */
create or replace function public.market_list(p_user uuid, p_unit text, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_price numeric := round(p_price, 2);
begin
  if v_price is null or v_price <= 0 or v_price > public.setting('property_price_max') then raise exception 'bad_price'; end if;
  if not exists (select 1 from public.property_units where unit_id = p_unit and owner_id = p_user) then raise exception 'not_yours'; end if;
  if (select home_unit from public.lives where user_id = p_user) = p_unit then raise exception 'is_home'; end if;
  insert into public.property_listings (unit_id, seller_id, price) values (p_unit, p_user, v_price)
  on conflict (unit_id) do update set price = excluded.price, created_at = now();
end $$;

create or replace function public.market_unlist(p_user uuid, p_unit text) returns void
language sql security definer set search_path = public as $$
  delete from public.property_listings where unit_id = p_unit and seller_id = p_user
$$;

/** Buy a unit at its asking price. p_price: the price you saw (it mustn't have changed). */
create or replace function public.market_buy(p_user uuid, p_unit text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.property_listings;
begin
  perform public.market_tidy();
  select * into l from public.property_listings where unit_id = p_unit for update;
  if not found then raise exception 'not_for_sale'; end if;
  if l.price <> round(p_price, 2) then raise exception 'price_changed:%', trim_scale(l.price); end if;
  return public.market_complete(p_unit, p_user, l.price, 0);
end $$;

-- ============================================================ offers
/** Offer a price for a unit someone else owns. The price and its tax are held until it's answered. */
create or replace function public.market_offer(p_user uuid, p_unit text, p_price numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  u public.property_units;
  p public.profiles;
  l public.lives;
  v_price numeric := round(p_price, 2);
  v_held numeric;
  v_id bigint;
begin
  perform public.market_tidy();
  if v_price is null or v_price <= 0 or v_price > public.setting('property_price_max') then raise exception 'bad_price'; end if;
  select * into u from public.property_units where unit_id = p_unit;
  if not found then raise exception 'not_owned'; end if;
  if u.owner_id = p_user then raise exception 'yours'; end if;
  if (select home_unit from public.lives where user_id = u.owner_id) = p_unit then raise exception 'is_home'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null and u.use <> 'home' then raise exception 'home_first'; end if;
  if exists (select 1 from public.property_offers where unit_id = p_unit and buyer_id = p_user and status in ('open', 'countered')) then raise exception 'already_offered'; end if;
  if (select count(*) from public.property_offers where buyer_id = p_user and status in ('open', 'countered')) >= public.setting('offers_open_max') then raise exception 'too_many_offers'; end if;
  v_held := v_price + round(v_price * public.setting('property_buy_tax'), 2);
  if p.coins < v_held then raise exception 'not_enough:%', trim_scale(v_held); end if;
  update public.profiles set coins = coins - v_held where id = p_user;
  perform public.log_coins(p_user, null, 'offer_hold', -v_held, false, 'Offer on ' || p_unit);
  insert into public.property_offers (unit_id, buyer_id, seller_id, price, held, expires_at)
  values (p_unit, p_user, u.owner_id, v_price, v_held, now() + make_interval(hours => public.setting('offer_hours')::int))
  returning id into v_id;
  perform public.notify(u.owner_id, null, 'market', format('%s offered ₥%s for %s.', coalesce(p.username, 'A player'), trim_scale(v_price), u.label));
  return v_id;
end $$;

/** The owner answers an offer: accept, refuse, or counter with a higher price. */
create or replace function public.market_answer(p_user uuid, p_offer bigint, p_action text, p_counter numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.property_offers;
begin
  perform public.market_tidy();
  select * into o from public.property_offers where id = p_offer for update;
  if not found or o.status not in ('open', 'countered') then raise exception 'offer_gone'; end if;
  if not exists (select 1 from public.property_units where unit_id = o.unit_id and owner_id = p_user) then raise exception 'not_yours'; end if;
  if p_action = 'accept' then
    if o.status <> 'open' then raise exception 'offer_gone'; end if;
    update public.property_offers set status = 'accepted', decided_at = now() where id = p_offer;
    return public.market_complete(o.unit_id, o.buyer_id, o.price, o.held);
  elsif p_action = 'refuse' then
    perform public.offer_close(p_offer, 'refused');
    perform public.notify(o.buyer_id, null, 'market', 'Your offer was turned down. Your mint is back.');
  elsif p_action = 'counter' then
    if p_counter is null or round(p_counter, 2) <= o.price or p_counter > public.setting('property_price_max') then raise exception 'bad_price'; end if;
    update public.property_offers set status = 'countered', counter = round(p_counter, 2),
      expires_at = now() + make_interval(hours => public.setting('offer_hours')::int) where id = p_offer;
    perform public.notify(o.buyer_id, null, 'market', format('The owner asks ₥%s instead.', trim_scale(round(p_counter, 2))));
  else
    raise exception 'bad_action';
  end if;
  return '{}'::jsonb;
end $$;

/** The buyer takes a counter-offer, or withdraws their offer. */
create or replace function public.market_reply(p_user uuid, p_offer bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.property_offers;
begin
  perform public.market_tidy();
  select * into o from public.property_offers where id = p_offer and buyer_id = p_user for update;
  if not found or o.status not in ('open', 'countered') then raise exception 'offer_gone'; end if;
  if p_action = 'withdraw' then
    perform public.offer_close(p_offer, 'withdrawn');
    return '{}'::jsonb;
  elsif p_action = 'accept' and o.status = 'countered' then
    if not exists (select 1 from public.property_units where unit_id = o.unit_id and owner_id = o.seller_id) then
      perform public.offer_close(p_offer, 'void');
      raise exception 'offer_gone';
    end if;
    update public.property_offers set status = 'accepted', price = o.counter, decided_at = now() where id = p_offer;
    return public.market_complete(o.unit_id, p_user, o.counter, o.held);
  end if;
  raise exception 'bad_action';
end $$;

-- ============================================================ loans
/** What the World Bank would lend you now: half of what your property cost (none while a loan is open). */
create or replace function public.loan_limit(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.loans where user_id = p_user and status = 'open') then 0
    else round(coalesce((select sum(price) from public.property_units where owner_id = p_user), 0) * public.setting('loan_ltv'), 2) end
$$;

/** Borrow from the World Bank against all your property, paid back over p_months game months. */
create or replace function public.loan_take(p_user uuid, p_amount numeric, p_months int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric := round(p_amount, 2);
  v_rate numeric := public.setting('loan_rate');
  v_r numeric := public.setting('loan_rate') / 12;
  v_inst numeric;
  v_region text;
  v_id bigint;
begin
  if p_months not in (6, 12, 24) then raise exception 'bad_months'; end if;
  perform 1 from public.profiles where id = p_user for update;
  select region into v_region from public.lives where user_id = p_user;
  if v_region is null then raise exception 'no_life'; end if;
  perform public.loan_tick(p_user);
  if v_amount is null or v_amount < 10 then raise exception 'bad_amount'; end if;
  if v_amount > public.loan_limit(p_user) then raise exception 'over_limit:%', trim_scale(public.loan_limit(p_user)); end if;
  if (select balance from public.treasuries where id = 'wb') < v_amount then raise exception 'bank_short'; end if;
  v_inst := round(v_amount * v_r / (1 - power(1 + v_r, -p_months)), 2);
  insert into public.loans (user_id, region, principal, balance, rate, instalment, months, next_due)
  values (p_user, v_region, v_amount, v_amount, v_rate, v_inst, p_months, now() + make_interval(hours => public.setting('loan_month_hours')::int))
  returning id into v_id;
  update public.property_units set loan_id = v_id where owner_id = p_user;
  perform public.treasury_move('wb', -v_amount, 'loan_out', 'Loan ' || v_id);
  update public.profiles set coins = coins + v_amount where id = p_user;
  perform public.log_coins(p_user, null, 'loan', v_amount, false, 'World Bank loan');
  return jsonb_build_object('loan', v_id, 'instalment', v_inst);
end $$;

/** The bank takes the property behind a loan: it goes back to the city; the rest is written off. */
create or replace function public.loan_default(p_loan bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  ln public.loans;
  v_unit text;
  v_id bigint;
begin
  select * into ln from public.loans where id = p_loan and status = 'open' for update;
  if not found then return; end if;
  perform public.property_collect(ln.user_id);
  for v_unit in select unit_id from public.property_units where loan_id = p_loan loop
    for v_id in select id from public.property_offers where unit_id = v_unit and status in ('open', 'countered') loop
      perform public.offer_close(v_id, 'void');
    end loop;
    insert into public.property_sales (unit_id, seller_id, buyer_id, price, tax) values (v_unit, ln.user_id, null, 0, 0);
    delete from public.property_units where unit_id = v_unit;
  end loop;
  update public.lives set home_unit = null
    where user_id = ln.user_id and home_unit is not null and not exists (select 1 from public.property_units where unit_id = home_unit);
  update public.loans set status = 'defaulted', closed_at = now() where id = p_loan;
  perform public.notify(ln.user_id, null, 'market', 'You missed your World Bank payments, so the bank took the property behind your loan.');
end $$;

/** Bring a loan up to now: each game month's payment comes from your Savings pot, then your wallet. */
create or replace function public.loan_tick(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ln public.loans;
  v_interest numeric;
  v_pay numeric;
begin
  select * into ln from public.loans where user_id = p_user and status = 'open' for update;
  if not found then return; end if;
  while ln.next_due <= now() loop
    v_interest := round(ln.balance * ln.rate / 12, 2);
    v_pay := least(ln.instalment, ln.balance + v_interest);
    if public.life_can_spend(p_user, array['savings']) >= v_pay then
      perform public.life_spend(p_user, array['savings'], v_pay);
      perform public.log_coins(p_user, null, 'loan_repay', -v_pay, false, 'World Bank payment');
      perform public.treasury_move('wb', v_pay, 'loan_repay', 'Payment on loan ' || ln.id);
      ln.balance := ln.balance + v_interest - v_pay;
      ln.missed := 0;
    else
      ln.balance := ln.balance + v_interest;
      ln.missed := ln.missed + 1;
      perform public.notify(p_user, null, 'market', format('You missed a World Bank payment of ₥%s.', trim_scale(v_pay)));
    end if;
    ln.next_due := ln.next_due + make_interval(hours => public.setting('loan_month_hours')::int);
    if ln.balance <= 0.01 then
      update public.loans set balance = 0, missed = 0, next_due = ln.next_due, status = 'repaid', closed_at = now() where id = ln.id;
      update public.property_units set loan_id = null where loan_id = ln.id;
      return;
    end if;
    update public.loans set balance = ln.balance, missed = ln.missed, next_due = ln.next_due where id = ln.id;
    if ln.missed >= public.setting('loan_misses') then
      perform public.loan_default(ln.id);
      return;
    end if;
  end loop;
end $$;

/** Pay off some or all of your loan early (from Savings, then your wallet). */
create or replace function public.loan_repay(p_user uuid, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ln public.loans;
  v_pay numeric;
begin
  perform public.loan_tick(p_user);
  select * into ln from public.loans where user_id = p_user and status = 'open' for update;
  if not found then raise exception 'no_loan'; end if;
  v_pay := least(round(coalesce(p_amount, 0), 2), ln.balance);
  if v_pay <= 0 then raise exception 'bad_amount'; end if;
  if public.life_can_spend(p_user, array['savings']) < v_pay then raise exception 'not_enough:%', trim_scale(v_pay); end if;
  perform public.life_spend(p_user, array['savings'], v_pay);
  perform public.log_coins(p_user, null, 'loan_repay', -v_pay, false, 'World Bank payment (early)');
  perform public.treasury_move('wb', v_pay, 'loan_repay', 'Early payment on loan ' || ln.id);
  if ln.balance - v_pay <= 0.01 then
    update public.loans set balance = 0, status = 'repaid', closed_at = now() where id = ln.id;
    update public.property_units set loan_id = null where loan_id = ln.id;
  else
    update public.loans set balance = balance - v_pay where id = ln.id;
  end if;
  return jsonb_build_object('balance', greatest(ln.balance - v_pay, 0));
end $$;

-- ============================================================ your home (redone: a home can't be on sale)
create or replace function public.property_set_home(p_user uuid, p_unit text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.property_units where unit_id = p_unit and owner_id = p_user and use = 'home') then raise exception 'not_yours'; end if;
  perform public.property_collect(p_user);
  update public.property_units set let = false, collected_at = now(), tenant_from = null where unit_id = p_unit and let;
  delete from public.property_listings where unit_id = p_unit;
  for v_id in select id from public.property_offers where unit_id = p_unit and status in ('open', 'countered') loop
    perform public.offer_close(v_id, 'void');
  end loop;
  update public.lives set home_unit = p_unit where user_id = p_user;
end $$;

-- ============================================================ reading
/** Your life: home, mint, every unit you own (rent waiting, tenant, sale price, loan). */
create or replace function public.my_assets(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'life', (select to_jsonb(l) - 'user_id' from public.lives l where l.user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unit', u.unit_id, 'building', u.building_id, 'label', u.label, 'use', u.use, 'area', u.area,
        'price', u.price, 'rentDay', u.rent_day, 'let', u.let, 'boughtAt', u.bought_at, 'name', b.name,
        'waiting', public.rent_waiting(u), 'tenantFrom', u.tenant_from, 'rentLevel', u.rent_level,
        'forSale', (select price from public.property_listings where unit_id = u.unit_id), 'loan', u.loan_id is not null
      ) order by u.bought_at)
      from public.property_units u join public.property_buildings b using (building_id)
      where u.owner_id = p_user), '[]'::jsonb)
  )
$$;

/** Who owns which units of a building, and which are for sale (and at what price). */
create or replace function public.building_owners(p_building text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('unit', u.unit_id, 'owner', u.owner_id, 'name', coalesce(p.username, 'A player'),
    'forSale', l.price, 'home', exists (select 1 from public.lives v where v.user_id = u.owner_id and v.home_unit = u.unit_id))), '[]'::jsonb)
  from public.property_units u join public.profiles p on p.id = u.owner_id
  left join public.property_listings l on l.unit_id = u.unit_id
  where u.building_id = p_building
$$;

/** Your market: offers you've made and been made, your loan and what you could borrow. */
create or replace function public.market_board(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.market_tidy();
  perform public.loan_tick(p_user);
  return jsonb_build_object(
    'made', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'unit', o.unit_id, 'label', u.label, 'price', o.price, 'counter', o.counter,
        'status', o.status, 'expiresAt', o.expires_at, 'who', coalesce(s.username, 'A player')) order by o.created_at desc)
      from public.property_offers o left join public.property_units u on u.unit_id = o.unit_id left join public.profiles s on s.id = o.seller_id
      where o.buyer_id = p_user and (o.status in ('open', 'countered') or o.decided_at > now() - interval '2 days')), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'unit', o.unit_id, 'label', u.label, 'price', o.price, 'counter', o.counter,
        'status', o.status, 'expiresAt', o.expires_at, 'who', coalesce(b.username, 'A player')) order by o.created_at desc)
      from public.property_offers o join public.property_units u on u.unit_id = o.unit_id and u.owner_id = p_user
      left join public.profiles b on b.id = o.buyer_id
      where o.status in ('open', 'countered')), '[]'::jsonb),
    'loan', (select jsonb_build_object('id', id, 'principal', principal, 'balance', balance, 'rate', rate, 'instalment', instalment,
        'months', months, 'nextDue', next_due, 'missed', missed) from public.loans where user_id = p_user and status = 'open'),
    'canBorrow', public.loan_limit(p_user),
    'rate', public.setting('loan_rate'),
    'misses', public.setting('loan_misses')
  );
end $$;

/** Everything for sale in a region, cheapest first (for the home search). */
create or replace function public.market_listings(p_region text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'price')::numeric), '[]'::jsonb) from (
    select jsonb_build_object('unit', l.unit_id, 'building', u.building_id, 'label', u.label, 'use', u.use, 'price', l.price,
      'who', coalesce(p.username, 'A player'), 'seller', l.seller_id) as x
    from public.property_listings l join public.property_units u using (unit_id) join public.profiles p on p.id = l.seller_id
    where split_part(l.unit_id, ':', 1) = p_region
    order by l.price limit 200
  ) s
$$;

/** Money in and out (redone: sales, loans). */
create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'commute',
                   'health_care', 'gym', 'school_fees', 'procedure', 'hustle_start', 'property_buy', 'start_grant',
                   'property_sale', 'sale_tax', 'loan', 'loan_repay')
    group by kind
    union all
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.property_listings, public.property_offers, public.loans from public, anon, authenticated;
  grant all on table public.property_listings, public.property_offers, public.loans to service_role;
  revoke all on sequence public.property_offers_id_seq, public.loans_id_seq from public, anon, authenticated;
  grant all on sequence public.property_offers_id_seq, public.loans_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.treasury_move(text, numeric, text, text)', 'public.rent_factor(text)', 'public.tenant_arrives(text)',
    'public.rent_waiting(public.property_units)', 'public.property_collect(uuid)', 'public.property_let(uuid, text, boolean)',
    'public.property_rent_level(uuid, text, text)', 'public.offer_close(bigint, text)', 'public.market_tidy()',
    'public.market_complete(text, uuid, numeric, numeric)', 'public.market_list(uuid, text, numeric)', 'public.market_unlist(uuid, text)',
    'public.market_buy(uuid, text, numeric)', 'public.market_offer(uuid, text, numeric)', 'public.market_answer(uuid, bigint, text, numeric)',
    'public.market_reply(uuid, bigint, text)', 'public.loan_limit(uuid)', 'public.loan_take(uuid, numeric, int)', 'public.loan_default(bigint)',
    'public.loan_tick(uuid)', 'public.loan_repay(uuid, numeric)', 'public.property_set_home(uuid, text)', 'public.my_assets(uuid)',
    'public.building_owners(text)', 'public.market_board(uuid)', 'public.market_listings(text)', 'public.life_money(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 047_ads_are_property.sql
-- Newtown, part 47: advertising is leasing a property (docs/BUSINESS.md). A business leases a
-- building and gets the city's billboards with it from day one; it can swap its billboard design
-- any time, free. A lease runs a year, or until people have tapped the building or its billboards
-- (opening its card) as many times as the lease paid for, whichever comes first. Players no longer
-- get mint for tapping ads.
--
-- Safe to run more than once. Run after parts 1-46.

insert into public.game_settings (key, value, note) values
  ('lease_naira_per_click', 20, 'What each tap on a leased building or its billboard uses up of the lease (naira)')
on conflict (key) do update set note = excluded.note;
-- No more mint for tapping ads.
update public.game_settings set value = 0 where key = 'ad_rewards_per_day';

alter table public.business_leases add column if not exists billboard_path text;
alter table public.business_leases add column if not exists click_cap int;

/** Taps a lease of this price pays for. */
create or replace function public.lease_clicks(p_kobo bigint) returns int
language sql stable as $$ select greatest(100, floor(p_kobo / 100.0 / public.setting('lease_naira_per_click'))::int) $$;

-- Live leases from before this part: on the billboards, with their allowance of taps.
update public.business_leases set billboard = true, click_cap = public.lease_clicks(price_kobo) where status = 'live' and click_cap is null;

/** Taps on a lease so far (building and billboard taps both open its card). */
create or replace function public.lease_taps(p_lease uuid) returns int
language sql stable as $$ select coalesce(sum(n), 0)::int from public.business_hits where lease_id = p_lease and kind = 'view' $$;

/** Leases that have run their year, or used up their taps, end. */
create or replace function public.business_tidy() returns void
language sql security definer set search_path = public as $$
  update public.business_leases set status = 'ended'
  where status = 'live' and (ends_at <= now() or (click_cap is not null and public.lease_taps(id) >= click_cap))
$$;

/** Paystack confirmed a payment: a lease goes live (with the billboards and its taps), or an upgrade is applied. */
create or replace function public.business_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.business_leases;
  u public.business_upgrades;
begin
  select * into l from public.business_leases where reference = p_reference for update;
  if found then
    if l.status <> 'pending_payment' then return jsonb_build_object('found', true, 'new', false, 'id', l.id); end if;
    if coalesce(p_kobo, 0) < l.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
    if exists (select 1 from public.business_leases where building_id = l.building_id and status = 'live')
       or exists (select 1 from public.property_units where building_id = l.building_id) then
      return jsonb_build_object('found', true, 'new', false, 'clash', true, 'id', l.id);
    end if;
    update public.business_leases set status = 'live', starts_at = now(), ends_at = now() + interval '365 days',
      billboard = true, click_cap = public.lease_clicks(l.price_kobo) where id = l.id;
    return jsonb_build_object('found', true, 'new', true, 'id', l.id);
  end if;
  select * into u from public.business_upgrades where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if u.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'id', u.lease_id); end if;
  if coalesce(p_kobo, 0) < u.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  update public.business_upgrades set status = 'paid', paid_at = now() where reference = p_reference;
  update public.business_leases set
    glow = case when u.upgrade = 'bright' then 2 else glow end,
    kind = case when u.upgrade = 'rebuild' then u.kind else kind end,
    storeys = case when u.upgrade = 'storey' then coalesce(storeys, 1) + 1 else storeys end,
    billboard = true
  where id = u.lease_id;
  return jsonb_build_object('found', true, 'new', true, 'id', u.lease_id, 'upgrade', u.upgrade);
end $$;

/** Swap a live lease's billboard design (a stored picture's path; null goes back to the logo). Free, any time. */
create or replace function public.business_billboard_set(p_advertiser uuid, p_lease uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare v_old text;
begin
  select billboard_path into v_old from public.business_leases where id = p_lease and advertiser_id = p_advertiser and status = 'live' for update;
  if not found then raise exception 'not_yours'; end if;
  update public.business_leases set billboard_path = p_path where id = p_lease;
  return v_old;
end $$;

/** Live businesses in a region, for the map (with their billboard design). */
create or replace function public.businesses_in(p_region text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.business_tidy();
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'building', building_id, 'name', name, 'category', category, 'about', about, 'address', address,
    'phone', phone, 'whatsapp', whatsapp, 'website', website, 'logo', logo_path, 'billboardImage', coalesce(billboard_path, logo_path),
    'glow', glow, 'kind', kind, 'storeys', storeys, 'billboard', billboard)), '[]'::jsonb)
  from public.business_leases where region = p_region and status = 'live' and ends_at > now());
end $$;

/** An account's leases with their numbers, taps used and allowed, and billboard design. */
create or replace function public.business_mine(p_advertiser uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'building', l.building_id, 'name', l.name, 'category', l.category, 'about', l.about, 'address', l.address,
    'phone', l.phone, 'whatsapp', l.whatsapp, 'website', l.website, 'logo', l.logo_path, 'billboardImage', coalesce(l.billboard_path, l.logo_path),
    'status', l.status, 'glow', l.glow, 'kind', l.kind, 'storeys', l.storeys, 'billboard', l.billboard, 'startsAt', l.starts_at, 'endsAt', l.ends_at,
    'priceKobo', l.price_kobo, 'clickCap', l.click_cap, 'clicks', public.lease_taps(l.id),
    'hits', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id group by kind) s), '{}'::jsonb),
    'week', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id and h.day > (now() at time zone 'Africa/Lagos')::date - 7 group by kind) s), '{}'::jsonb)
  ) order by l.created_at desc), '[]'::jsonb)
  from public.business_leases l where l.advertiser_id = p_advertiser and l.status <> 'pending_payment'
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lease_clicks(bigint)', 'public.lease_taps(uuid)', 'public.business_tidy()', 'public.business_paid(text, bigint)',
    'public.business_billboard_set(uuid, uuid, text)', 'public.businesses_in(text)', 'public.business_mine(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 048_trips.sql
-- Newtown, part 48: getting about the real map. Going into a building costs the fare from where
-- you last were (your home, or the last building you went into), the cheapest way there (walk,
-- keke or danfo, src/lib/world/work.ts), paid from your Travel money, then your wallet. Fares are
-- burned, as fares to work are.
--
-- Safe to run more than once. Run after parts 1-47.

insert into public.game_settings (key, value, note) values
  ('trip_fare_max', 50, 'Most a single trip into a building can cost (mint, a sanity check)')
on conflict (key) do update set note = excluded.note;

alter table public.lives add column if not exists at_place text check (at_place is null or at_place ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$');

/** Go to a building: pay the fare (worked out by the game) and be there. Returns what was paid. */
create or replace function public.life_go(p_user uuid, p_place text, p_fare numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_fare numeric := round(least(public.setting('trip_fare_max'), greatest(0, coalesce(p_fare, 0))), 2);
  v_paid numeric := 0;
begin
  if p_place is null or p_place !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$' then raise exception 'bad_place'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_fare > 0 then
    if public.life_can_spend(p_user, array['travel']) < v_fare then raise exception 'not_enough:%', trim_scale(v_fare); end if;
    v_paid := public.life_spend(p_user, array['travel'], v_fare);
    perform public.log_coins(p_user, null, 'commute', -v_paid, false, 'Fare to ' || p_place);
    perform public.burn(null, v_paid, 'Fares about town');
  end if;
  update public.lives set at_place = p_place where user_id = p_user;
  return v_paid;
end $$;

do $$
begin
  revoke all on function public.life_go(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_go(uuid, text, numeric) to service_role;
end $$;

-- ======================================================== 049_reports_and_work.sql
-- Newtown, part 49: reports about people, several side hustles, and pay that arrives by itself.
--
-- Reports. Reporting a person (a player or a character), not just the map: who it is about, what is
-- wrong, where it happened and a note. The owner reads them at /map-reports, under the map ones.
-- See docs/MAP_REPORTS.md.
--
-- Side hustles. Up to hustles_max at once (each with its own start-up cost, gone once spent), as
-- long as your day still leaves 4 hours of sleep (the game checks that: src/lib/world/day.ts).
--
-- Pay. Your job and hustles pay into your wallet by themselves at the end of each game week (the
-- game calls the collect functions; nothing to tap). Pay waits up to work_hold_days game days in
-- case you are away, so it is raised to four game weeks.
--
-- Safe to run more than once. Run after parts 1-48.

insert into public.game_settings (key, value, note) values
  ('person_reports_per_day', 10, 'Reports about people each player can send a day')
on conflict (key) do update set note = excluded.note;

create table if not exists public.person_reports (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  -- A player (their account), or a character (its id, e.g. 'npc:12'), with the name shown then.
  about_user uuid references public.profiles (id) on delete set null,
  about_npc text check (about_npc is null or char_length(about_npc) <= 60),
  about_name text not null check (char_length(about_name) between 1 and 60),
  kind text not null check (kind in ('abuse', 'scam', 'profile', 'glitch', 'other')),
  note text check (note is null or char_length(note) <= 300),
  -- Where it happened (a room or a place), when known.
  place text check (place is null or char_length(place) <= 120),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists person_reports_open_idx on public.person_reports (status, created_at desc);
create index if not exists person_reports_user_idx on public.person_reports (user_id, created_at desc);

/** Report a person (a few a day each; once each per person until it's looked at). */
create or replace function public.person_report(
  p_user uuid, p_about_user uuid, p_about_npc text, p_name text, p_kind text, p_note text, p_place text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_about_user is not null and p_about_user = p_user then raise exception 'self'; end if;
  if (select count(*) from public.person_reports where user_id = p_user and created_at > now() - interval '1 day') >= public.setting('person_reports_per_day') then
    raise exception 'too_many';
  end if;
  if exists (
    select 1 from public.person_reports
    where user_id = p_user and status = 'open'
      and (about_user = p_about_user or (p_about_user is null and about_npc = p_about_npc))
  ) then
    raise exception 'already';
  end if;
  insert into public.person_reports (user_id, about_user, about_npc, about_name, kind, note, place)
    values (p_user, p_about_user, p_about_npc, left(btrim(p_name), 60), p_kind, nullif(btrim(coalesce(p_note, '')), ''), nullif(left(btrim(coalesce(p_place, '')), 120), ''))
    returning id into v_id;
  return v_id;
end $$;

/** Reports about people for the owner's page, newest first ('open' or 'all'). */
create or replace function public.person_reports_list(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'aboutUser', r.about_user, 'aboutNpc', r.about_npc, 'name', r.about_name, 'kind', r.kind, 'note', r.note,
    'place', r.place, 'status', r.status, 'at', r.created_at, 'by', coalesce(p.username, 'A player')
  ) order by r.created_at desc), '[]'::jsonb)
  from (select * from public.person_reports where p_status = 'all' or status = p_status order by created_at desc limit 500) r
  left join public.profiles p on p.id = r.user_id
$$;

/** The owner marks a report about a person: actioned, dismissed, or open again. */
create or replace function public.person_report_set(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('open', 'actioned', 'dismissed') then raise exception 'bad_status'; end if;
  update public.person_reports set status = p_status, resolved_at = case when p_status = 'open' then null else now() end where id = p_id;
end $$;

do $$
begin
  revoke all on table public.person_reports from public, anon, authenticated;
  grant all on table public.person_reports to service_role;
  revoke all on sequence public.person_reports_id_seq from public, anon, authenticated;
  grant all on sequence public.person_reports_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.person_report(uuid, uuid, text, text, text, text, text)', 'public.person_reports_list(text)', 'public.person_report_set(bigint, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================ several side hustles
insert into public.game_settings (key, value, note) values
  ('hustles_max', 3, 'Side hustles each player can run at once')
on conflict (key) do update set note = excluded.note;
-- Four game weeks of pay can wait while you are away (it is paid in by itself each game week).
insert into public.game_settings (key, value, note) values
  ('work_hold_days', 28, 'Most game days of pay that wait (it is paid in by itself each game week)')
on conflict (key) do update set value = greatest(public.game_settings.value, excluded.value), note = excluded.note;

-- One row per hustle you run (it was one per player).
do $$
begin
  if (select array_length(conkey, 1) from pg_constraint where conname = 'life_hustles_pkey' and conrelid = 'public.life_hustles'::regclass) = 1 then
    alter table public.life_hustles drop constraint life_hustles_pkey;
    alter table public.life_hustles add primary key (user_id, hustle);
  end if;
end $$;

/** Collect what one side hustle has made (at most work_hold_days game days), less income tax. */
create or replace function public.life_hustle_collect_one(p_user uuid, p_hustle text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  h public.life_hustles;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_start timestamptz;
  v_off numeric := 0;
  v_boost numeric := 0;
  v_work numeric;
  v_level int;
  v_gross numeric;
  v_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  select * into h from public.life_hustles where user_id = p_user and hustle = p_hustle for update;
  if not found then return jsonb_build_object('days', 0, 'worked', 0, 'gross', 0, 'tax', 0, 'net', 0); end if;
  select * into l from public.lives where user_id = p_user;
  v_days := least(public.setting('work_hold_days'), greatest(0, extract(epoch from (now() - h.paid_until)) / 3600.0 / v_hours));
  v_start := now() - make_interval(secs => v_days * v_hours * 3600);
  -- Days it was stalled, or you were away, earn nothing; boosted days earn more.
  if h.stalled_until is not null and h.stalled_until > v_start then
    v_off := least(v_days, extract(epoch from (least(now(), h.stalled_until) - v_start)) / 3600.0 / v_hours);
  end if;
  if l.recovering_until is not null and l.recovering_until > v_start then
    v_off := greatest(v_off, least(v_days, extract(epoch from (least(now(), l.recovering_until) - v_start)) / 3600.0 / v_hours));
  end if;
  v_work := greatest(0, v_days - v_off);
  if h.boost_until is not null and h.boost_until > v_start then
    v_boost := least(v_work, extract(epoch from (least(now(), h.boost_until) - v_start)) / 3600.0 / v_hours);
  end if;
  v_work := v_work * case when public.life_work_factor(l.health, l.mind) = 0 then 0 else 1 end;
  v_boost := least(v_boost, v_work);
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = h.skill;
  v_gross := round(h.pay_day * (1 + coalesce(v_level, 0) * public.setting('work_skill_bonus'))
                   * (v_work + v_boost * (h.boost - 1)) * public.life_work_factor(l.health, l.mind)
                   * (1 + h.swing * (random()::numeric * 2 - 1)), 2);
  v_gross := greatest(0, v_gross);
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  update public.life_hustles set paid_until = now() where user_id = p_user and hustle = p_hustle;
  if v_gross > 0 then
    perform public.log_coins(p_user, null, 'hustle_pay', v_gross, false, 'Side hustle: ' || h.title);
    if v_tax > 0 then
      perform public.log_coins(p_user, null, 'income_tax', -v_tax, false, 'Income tax');
      perform public.pay_tax(l.region, v_tax, 'income_tax', 'Income tax on a side hustle');
    end if;
    perform public.life_income(p_user, v_gross - v_tax);
  end if;
  if v_work > 0 then
    insert into public.life_skills (user_id, skill, days) values (p_user, h.skill, round(v_work, 3))
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end if;
  return jsonb_build_object('days', round(v_days, 3), 'worked', round(v_work, 3), 'gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax);
end $$;

/** Collect what all your side hustles have made (added up). */
create or replace function public.life_hustle_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v jsonb;
  v_days numeric := 0;
  v_worked numeric := 0;
  v_gross numeric := 0;
  v_tax numeric := 0;
begin
  for r in select hustle from public.life_hustles where user_id = p_user order by started_at loop
    v := public.life_hustle_collect_one(p_user, r.hustle);
    v_days := greatest(v_days, (v->>'days')::numeric);
    v_worked := v_worked + (v->>'worked')::numeric;
    v_gross := v_gross + (v->>'gross')::numeric;
    v_tax := v_tax + (v->>'tax')::numeric;
  end loop;
  return jsonb_build_object('days', v_days, 'worked', v_worked, 'gross', v_gross, 'tax', v_tax, 'net', v_gross - v_tax);
end $$;

/** Start a side hustle beside the ones you have (up to hustles_max), paying its start-up cost. */
create or replace function public.life_hustle_start(
  p_user uuid, p_hustle text, p_title text, p_skill text, p_pay_day numeric, p_swing numeric, p_hours numeric, p_cost numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_cost numeric := round(coalesce(p_cost, 0), 2);
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_hustle !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' or coalesce(p_pay_day, 0) <= 0 or p_pay_day > public.setting('hustle_pay_max')
     or v_cost < 0 or v_cost > public.setting('hustle_start_max') or coalesce(p_hours, 0) <= 0 or p_hours > 8 then raise exception 'bad_item'; end if;
  if exists (select 1 from public.life_hustles where user_id = p_user and hustle = p_hustle) then raise exception 'already'; end if;
  if (select count(*) from public.life_hustles where user_id = p_user) >= public.setting('hustles_max') then
    raise exception 'too_many:%', public.setting('hustles_max')::int;
  end if;
  if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
  if v_cost > 0 then
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'hustle_start', -v_cost, false, 'Starting: ' || left(p_title, 50));
    perform public.burn(null, v_cost, 'Side hustle start-up costs');
  end if;
  insert into public.life_hustles (user_id, hustle, title, skill, pay_day, swing, hours)
    values (p_user, p_hustle, left(p_title, 60), p_skill, round(p_pay_day, 2), least(1, greatest(0, coalesce(p_swing, 0.3))), p_hours);
  return jsonb_build_object('collected', jsonb_build_object('days', 0, 'gross', 0, 'tax', 0, 'net', 0), 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Stop one side hustle (what it made is paid in first). */
create or replace function public.life_hustle_stop(p_user uuid, p_hustle text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not exists (select 1 from public.life_hustles where user_id = p_user and hustle = p_hustle) then raise exception 'no_hustle'; end if;
  v_out := public.life_hustle_collect_one(p_user, p_hustle);
  delete from public.life_hustles where user_id = p_user and hustle = p_hustle;
  return v_out;
end $$;

/** Stop all your side hustles (what they made is paid in first). */
create or replace function public.life_hustle_stop(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  v_out := public.life_hustle_collect(p_user);
  delete from public.life_hustles where user_id = p_user;
  return v_out;
end $$;

/** Your life as the screens show it: as part 41, with every side hustle ('hustles'; 'hustle' is the first). */
create or replace function public.life_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'health', l.health,
    'mind', l.mind,
    'exercise', l.exercise,
    'powerOwed', l.power_owed,
    'wasteOwed', l.waste_owed,
    'powerCut', l.power_day > 0 and l.power_owed > l.power_day * public.setting('living_cutoff_days'),
    'budget', l.budget,
    'recoveringUntil', l.recovering_until,
    'wallet', (select coins from public.profiles where id = p_user),
    'pots', coalesce((select jsonb_object_agg(pot, balance) from public.life_pots where user_id = p_user), '{}'::jsonb),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('course', course, 'title', title, 'cert', cert, 'startedAt', started_at, 'endsAt', ends_at, 'done', done_at is not null) order by started_at)
                         from public.life_courses where user_id = p_user), '[]'::jsonb),
    'procedures', coalesce((select jsonb_agg(jsonb_build_object('procedure', procedure, 'title', title, 'at', created_at) order by created_at desc)
                            from public.life_procedures where user_id = p_user), '[]'::jsonb),
    'payOwed', coalesce((select owed from public.life_jobs where user_id = p_user), 0),
    'hustles', coalesce((select jsonb_agg(jsonb_build_object('hustle', hustle, 'title', title, 'skill', skill, 'payDay', pay_day, 'swing', swing, 'hours', hours,
                                         'paidUntil', paid_until, 'boost', boost, 'boostUntil', boost_until, 'stalledUntil', stalled_until) order by started_at)
                         from public.life_hustles where user_id = p_user), '[]'::jsonb),
    'hustle', (select jsonb_build_object('hustle', hustle, 'title', title, 'skill', skill, 'payDay', pay_day, 'swing', swing, 'hours', hours,
                                         'paidUntil', paid_until, 'boost', boost, 'boostUntil', boost_until, 'stalledUntil', stalled_until)
               from public.life_hustles where user_id = p_user order by started_at limit 1),
    'event', (select jsonb_build_object('id', id, 'source', source, 'key', key, 'title', title, 'expiresAt', expires_at)
              from public.life_events where user_id = p_user and status = 'open' and expires_at > now() order by created_at desc limit 1)
  )
  from public.lives l where l.user_id = p_user
$$;

/** Players whose job or side hustles have a game week of pay or more waiting (for the daily job to pay them in). */
create or replace function public.life_pay_due(p_limit int) returns setof uuid
language sql stable security definer set search_path = public as $$
  select user_id from (
    select user_id, paid_until from public.life_jobs
    union all
    select user_id, paid_until from public.life_hustles
  ) w
  where paid_until < now() - make_interval(secs => 7 * public.setting('work_day_hours') * 3600)
  group by user_id
  limit greatest(1, least(coalesce(p_limit, 500), 2000))
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.life_hustle_collect_one(uuid, text)', 'public.life_hustle_collect(uuid)',
    'public.life_hustle_start(uuid, text, text, text, numeric, numeric, numeric, numeric)',
    'public.life_hustle_stop(uuid, text)', 'public.life_hustle_stop(uuid)', 'public.life_status(uuid)', 'public.life_pay_due(int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 050_economy_items.sql
-- Newtown, part 50: a kinder economy, and things to own.
--
-- Pay. Jobs and side hustles pay four times real Lagos wages (src/lib/world/work.ts PAY_BOOST, in
-- every city), so the caps that check what the game sends go up, and jobs and hustles people
-- already have get the same raise, once.
--
-- Safe to run more than once. Run after parts 1-49.

-- ============================================================ pay four times real wages
update public.game_settings set value = greatest(value, 1000), note = 'Most a job on the real map can pay every 2 hours (mint, before skill bonus)' where key = 'work_pay_max';
update public.game_settings set value = greatest(value, 400), note = 'Most a side hustle can earn every 2 hours (mint, before swing and boost)' where key = 'hustle_pay_max';
insert into public.game_settings (key, value, note) values
  ('pay_boost_done', 0, 'Set to 1 once the jobs and hustles people had got the 4x raise (part 50)')
on conflict (key) do nothing;
do $$
begin
  if public.setting('pay_boost_done') = 0 then
    update public.life_jobs set pay_day = round(pay_day * 4, 2);
    update public.life_hustles set pay_day = round(pay_day * 4, 2);
    update public.game_settings set value = 1 where key = 'pay_boost_done';
  end if;
end $$;

-- ============================================================ money day by day
/**
 * Your money by day (Lagos days, the last p_days of them, oldest first): what you earned (pay,
 * hustles, rent, sales), what living cost you (tax, bills, getting about, health, school, fees),
 * and what you bought to keep (property, cars, items, starting a hustle). Earned minus costs says
 * whether you're up or down; buying things to keep is spending into what you own, so it's shown
 * apart.
 */
create or replace function public.life_money_days(p_user uuid, p_days int) returns jsonb
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(
      (date_trunc('day', now() at time zone 'Africa/Lagos') - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) - 1)),
      date_trunc('day', now() at time zone 'Africa/Lagos'), interval '1 day') as day
  ),
  rows as (
    select date_trunc('day', created_at at time zone 'Africa/Lagos') as day, kind, amount from public.ledger
    where user_id = p_user and created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) + 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(d.day, 'YYYY-MM-DD'),
    'earned', round(coalesce((select sum(amount) from rows r where r.day = d.day and r.amount > 0
      and r.kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'property_sale', 'item_sale', 'car_sale', 'service_pay')), 0), 2),
    'costs', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('income_tax', 'rent_tax', 'vat', 'sale_tax', 'power_bill', 'waste_bill', 'commute', 'health_care', 'gym', 'school_fees',
                     'procedure', 'loan_repay', 'market_fee', 'item_tax', 'car_running', 'fine')), 0), 2),
    'bought', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('property_buy', 'property_tax', 'hustle_start', 'item_buy', 'car_buy', 'craft_cost')), 0), 2)
  ) order by d.day), '[]'::jsonb)
  from days d
$$;

do $$
begin
  revoke all on function public.life_money_days(uuid, int) from public, anon, authenticated;
  grant execute on function public.life_money_days(uuid, int) to service_role;
end $$;

-- ============================================================ items, the market, crafting, cars, reputation
-- Things people own (src/lib/world/items.ts works out every price, worth and effect; these check
-- balances and ownership and keep the record). A kind is a shop kind ('gold_chain', 'car_camry')
-- or an invention a player made ('inv-12'). Every item is one row with its owner.

insert into public.game_settings (key, value, note) values
  ('item_price_max',   200000, 'Dearest item or car (mint, a sanity check)'),
  ('items_max',        200,    'Most items one player can hold'),
  ('listings_max',     20,     'Most items one player can have up for sale at once'),
  ('crafts_open_max',  2,      'Crafts one player can have under way at once')
on conflict (key) do update set note = excluded.note;

alter table public.lives add column if not exists rep_penalty numeric(10,2) not null default 0;

/** Inventions: new kinds of things players made. */
create table if not exists public.item_kinds (
  id text primary key check (id ~ '^inv-[0-9]+$'),
  creator uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 3 and 40),
  category text not null check (category in ('jewellery', 'clothing', 'book', 'gadget', 'home', 'art', 'fitness')),
  effect jsonb not null default '{}'::jsonb,
  base_value numeric(14,2) not null check (base_value > 0),
  made int not null default 0,
  sold int not null default 0,
  created_at timestamptz not null default now()
);
create sequence if not exists public.item_kinds_seq;

create table if not exists public.items (
  id bigserial primary key,
  owner uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,30}$' or kind ~ '^inv-[0-9]+$'),
  name text not null check (char_length(name) between 1 and 60),
  category text not null check (category in ('jewellery', 'clothing', 'book', 'gadget', 'home', 'art', 'fitness', 'car')),
  -- What it was worth when it was made (mint): its worth now moves from here (items.ts itemWorth).
  base_value numeric(14,2) not null check (base_value >= 0),
  effect jsonb not null default '{}'::jsonb,
  quality numeric(4,2) not null default 1,
  made_at timestamptz not null default now(),
  got_at timestamptz not null default now(),
  how text not null check (how in ('bought', 'found', 'stolen', 'gift', 'crafted', 'market')),
  list_price numeric(14,2) check (list_price is null or list_price > 0),
  listed_at timestamptz
);
create index if not exists items_owner_idx on public.items (owner);
create index if not exists items_listed_idx on public.items (kind, list_price) where list_price is not null;

/** Every sale on the market, for what a kind is really worth. */
create table if not exists public.item_trades (
  id bigserial primary key,
  kind text not null,
  price numeric(14,2) not null,
  seller uuid references public.profiles (id) on delete set null,
  buyer uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists item_trades_kind_idx on public.item_trades (kind, created_at desc);

/** Crafts under way: what's being made, and when it's done. */
create table if not exists public.crafts (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  spec jsonb not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  done_at timestamptz
);
create index if not exists crafts_user_idx on public.crafts (user_id, done_at);

/** The last few market prices of a kind (mint, average), or null. */
create or replace function public.item_recent_price(p_kind text) returns numeric
language sql stable security definer set search_path = public as $$
  select round(avg(price), 2) from (select price from public.item_trades where kind = p_kind order by created_at desc limit 10) t
$$;

/**
 * Get an item: bought from a shop (p_cost from Savings, then the wallet), found, swiped, or the
 * game's own (crafted). The game says what it is and what it's worth.
 */
create or replace function public.item_get(
  p_user uuid, p_kind text, p_name text, p_category text, p_value numeric, p_effect jsonb, p_how text, p_cost numeric
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_cost numeric := round(coalesce(p_cost, 0), 2);
  v_id bigint;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if coalesce(p_value, 0) < 0 or p_value > public.setting('item_price_max') or v_cost < 0 or v_cost > public.setting('item_price_max') then raise exception 'bad_item'; end if;
  if p_how not in ('bought', 'found', 'stolen', 'crafted') then raise exception 'bad_item'; end if;
  if (select count(*) from public.items where owner = p_user) >= public.setting('items_max') then raise exception 'too_many_items'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, case when p_category = 'car' then 'car_buy' else 'item_buy' end, -v_cost, false, 'Bought: ' || left(p_name, 50));
    perform public.burn(null, v_cost, 'Shops and car dealers');
  end if;
  insert into public.items (owner, kind, name, category, base_value, effect, how)
    values (p_user, p_kind, left(p_name, 60), p_category, round(p_value, 2), coalesce(p_effect, '{}'::jsonb), p_how)
    returning id into v_id;
  return v_id;
end $$;

/** Caught swiping something: a fine (wallet then pots, as much as there is) and reputation lost. */
create or replace function public.item_caught(p_user uuid, p_fine numeric, p_rep numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_paid numeric;
begin
  v_paid := public.life_spend(p_user, array['fun', 'savings', 'essentials'], least(greatest(coalesce(p_fine, 0), 0), public.setting('item_price_max')));
  if v_paid > 0 then
    perform public.log_coins(p_user, null, 'fine', -v_paid, false, 'Fine for shoplifting');
    perform public.pay_tax((select region from public.lives where user_id = p_user), v_paid, 'fines', 'A shoplifting fine');
  end if;
  update public.lives set rep_penalty = rep_penalty + least(greatest(coalesce(p_rep, 0), 0), 100), mind = greatest(0, mind - 5) where user_id = p_user;
  return v_paid;
end $$;

/** Give one of your things to another player (by their name). */
create or replace function public.item_gift(p_user uuid, p_item bigint, p_to text) returns text
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
  v_to uuid;
  v_name text;
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
  select id, username into v_to, v_name from public.profiles where lower(username) = lower(btrim(p_to)) and not is_bot;
  if v_to is null then raise exception 'no_player'; end if;
  if v_to = p_user then raise exception 'self'; end if;
  if exists (select 1 from public.blocks where blocker = v_to and blocked = p_user) then raise exception 'blocked'; end if;
  if (select count(*) from public.items where owner = v_to) >= public.setting('items_max') then raise exception 'their_items_full'; end if;
  update public.items set owner = v_to, how = 'gift', got_at = now(), list_price = null, listed_at = null where id = p_item;
  perform public.notify(v_to, null, 'gift', (select username from public.profiles where id = p_user) || ' gave you ' || i.name || '!', null);
  return v_name;
end $$;

/** Put one of your things up for sale (a small fee, p_fee, from your wallet then pots), or change its price. */
create or replace function public.item_list(p_user uuid, p_item bigint, p_price numeric, p_fee numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
  v_fee numeric := round(greatest(coalesce(p_fee, 0), 0), 2);
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
  if coalesce(p_price, 0) <= 0 or p_price > public.setting('item_price_max') then raise exception 'bad_price'; end if;
  if i.list_price is null and (select count(*) from public.items where owner = p_user and list_price is not null) >= public.setting('listings_max') then
    raise exception 'too_many_listings';
  end if;
  if v_fee > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    perform public.life_spend(p_user, array['fun', 'savings'], v_fee);
    perform public.log_coins(p_user, null, 'market_fee', -v_fee, false, 'Listing: ' || left(i.name, 50));
    perform public.burn(null, v_fee, 'Market listing fees');
  end if;
  update public.items set list_price = round(p_price, 2), listed_at = coalesce(listed_at, now()) where id = p_item;
end $$;

create or replace function public.item_unlist(p_user uuid, p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.items set list_price = null, listed_at = null where id = p_item and owner = p_user;
  if not found then raise exception 'not_yours'; end if;
end $$;

/** Buy something listed on the market at its price (p_price must match). The sale is taxed (p_tax: a share). */
create or replace function public.item_buy(p_user uuid, p_item bigint, p_price numeric, p_tax numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
  v_tax numeric;
  v_region text;
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.list_price is null then raise exception 'gone'; end if;
  if i.owner = p_user then raise exception 'yours'; end if;
  if i.list_price <> round(p_price, 2) then raise exception 'price_changed:%', trim_scale(i.list_price); end if;
  if (select count(*) from public.items where owner = p_user) >= public.setting('items_max') then raise exception 'too_many_items'; end if;
  if public.life_can_spend(p_user, array['savings']) < i.list_price then raise exception 'not_enough:%', trim_scale(i.list_price); end if;
  perform public.life_spend(p_user, array['savings'], i.list_price);
  perform public.log_coins(p_user, null, case when i.category = 'car' then 'car_buy' else 'item_buy' end, -i.list_price, false, 'Bought on the market: ' || left(i.name, 40));
  v_tax := round(i.list_price * least(greatest(coalesce(p_tax, 0), 0), 0.5), 2);
  perform public.log_coins(i.owner, null, case when i.category = 'car' then 'car_sale' else 'item_sale' end, i.list_price, false, 'Sold on the market: ' || left(i.name, 40));
  if v_tax > 0 then
    perform public.log_coins(i.owner, null, 'item_tax', -v_tax, false, 'Tax on a market sale');
    select region into v_region from public.lives where user_id = i.owner;
    perform public.pay_tax(coalesce(v_region, 'lagos'), v_tax, 'sales_tax', 'Tax on a market sale');
  end if;
  perform public.life_income(i.owner, i.list_price - v_tax);
  perform public.notify(i.owner, null, 'market', 'Your ' || i.name || ' sold for ' || trim_scale(i.list_price) || ' mint.', null);
  insert into public.item_trades (kind, price, seller, buyer) values (i.kind, i.list_price, i.owner, p_user);
  update public.item_kinds set sold = sold + 1 where id = i.kind;
  update public.items set owner = p_user, how = 'market', got_at = now(), list_price = null, listed_at = null where id = p_item;
  return jsonb_build_object('price', i.list_price, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Sell straight to the city's shops (p_amount: what the game offers, a share of its worth). */
create or replace function public.item_sell_city(p_user uuid, p_item bigint, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare i public.items;
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
  if coalesce(p_amount, 0) < 0 or p_amount > public.setting('item_price_max') then raise exception 'bad_price'; end if;
  delete from public.items where id = p_item;
  if p_amount > 0 then
    perform public.log_coins(p_user, null, case when i.category = 'car' then 'car_sale' else 'item_sale' end, round(p_amount, 2), false, 'Sold to a shop: ' || left(i.name, 40));
    perform public.life_income(p_user, round(p_amount, 2));
  end if;
  return round(p_amount, 2);
end $$;

/** Start a craft: materials paid now (p_cost), done at p_ends (the game works out both). */
create or replace function public.craft_start(p_user uuid, p_spec jsonb, p_cost numeric, p_hours numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(coalesce(p_cost, 0), 2);
  v_id bigint;
begin
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if (select count(*) from public.crafts where user_id = p_user and done_at is null) >= public.setting('crafts_open_max') then raise exception 'busy_crafting'; end if;
  if v_cost < 0 or v_cost > public.setting('item_price_max') or coalesce(p_hours, 0) <= 0 or p_hours > 48 then raise exception 'bad_item'; end if;
  if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
  if v_cost > 0 then
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'craft_cost', -v_cost, false, 'Materials: ' || left(coalesce(p_spec->>'name', 'a craft'), 40));
    perform public.burn(null, v_cost, 'Craft materials');
  end if;
  insert into public.crafts (user_id, spec, ends_at) values (p_user, p_spec, now() + make_interval(secs => p_hours * 3600)) returning id into v_id;
  return v_id;
end $$;

/**
 * A finished craft becomes a new kind of thing (an invention, with the game's worth and effect)
 * and its copies, all yours. Only once, and only when it's done.
 */
create or replace function public.craft_finish(p_user uuid, p_craft bigint, p_value numeric, p_effect jsonb, p_copies int) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.crafts;
  v_kind text;
begin
  select * into c from public.crafts where id = p_craft and user_id = p_user for update;
  if not found then raise exception 'no_craft'; end if;
  if c.done_at is not null then raise exception 'already'; end if;
  if c.ends_at > now() then raise exception 'not_done'; end if;
  if coalesce(p_value, 0) <= 0 or p_value > public.setting('item_price_max') or coalesce(p_copies, 0) < 1 or p_copies > 10 then raise exception 'bad_item'; end if;
  v_kind := 'inv-' || nextval('public.item_kinds_seq');
  insert into public.item_kinds (id, creator, name, category, effect, base_value, made)
    values (v_kind, p_user, left(c.spec->>'name', 40), c.spec->>'category', coalesce(p_effect, '{}'::jsonb), round(p_value, 2), p_copies);
  insert into public.items (owner, kind, name, category, base_value, effect, quality, how)
    select p_user, v_kind, left(c.spec->>'name', 40), c.spec->>'category', round(p_value, 2), coalesce(p_effect, '{}'::jsonb), coalesce((c.spec->>'quality')::numeric, 1), 'crafted'
    from generate_series(1, p_copies);
  update public.crafts set done_at = now() where id = p_craft;
  return v_kind;
end $$;

/** Your things, crafts under way, and what you need for reputation. */
create or replace function public.my_items(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'name', i.name, 'category', i.category, 'base', i.base_value,
        'effect', i.effect, 'quality', i.quality, 'madeAt', i.made_at, 'gotAt', i.got_at, 'how', i.how, 'listPrice', i.list_price,
        'recent', public.item_recent_price(i.kind)) order by i.got_at desc) from public.items i where i.owner = p_user), '[]'::jsonb),
    'crafts', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'spec', c.spec, 'startedAt', c.started_at, 'endsAt', c.ends_at) order by c.started_at)
        from public.crafts c where c.user_id = p_user and c.done_at is null), '[]'::jsonb),
    'crafted', (select count(*) from public.crafts where user_id = p_user and done_at is not null),
    'inventionsSold', coalesce((select sum(sold) from public.item_kinds where creator = p_user), 0),
    'penalty', coalesce((select rep_penalty from public.lives where user_id = p_user), 0),
    'courses', (select count(*) from public.life_courses where user_id = p_user and done_at is not null)
  )
$$;

/** What's up for sale on the market (cheapest first, a kind or all), with who made inventions. */
create or replace function public.market_items(p_user uuid, p_category text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'price')::numeric), '[]'::jsonb) from (
    select jsonb_build_object('id', i.id, 'kind', i.kind, 'name', i.name, 'category', i.category, 'base', i.base_value, 'effect', i.effect,
      'madeAt', i.made_at, 'price', i.list_price, 'seller', coalesce(p.username, 'Someone'), 'mine', i.owner = p_user,
      'maker', (select coalesce(m.username, 'Someone') from public.item_kinds k left join public.profiles m on m.id = k.creator where k.id = i.kind),
      'recent', public.item_recent_price(i.kind)) as x
    from public.items i left join public.profiles p on p.id = i.owner
    where i.list_price is not null and (p_category is null or p_category = 'all' or i.category = p_category)
    order by i.list_price limit 200
  ) s
$$;

/** The newest inventions and the best sellers (for the News and the market). */
create or replace function public.inventions_top(p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'category', k.category, 'maker', coalesce(p.username, 'Someone'),
    'sold', k.sold, 'effect', k.effect, 'at', k.created_at) order by k.created_at desc), '[]'::jsonb)
  from (select * from public.item_kinds order by created_at desc limit least(greatest(coalesce(p_limit, 10), 1), 50)) k
  left join public.profiles p on p.id = k.creator
$$;

-- ---- getting to work in your own car
do $$
begin
  alter table public.life_jobs drop constraint if exists life_jobs_mode_check;
  alter table public.life_jobs add constraint life_jobs_mode_check check (mode in ('walk', 'keke', 'okada', 'danfo', 'taxi', 'car'));
end $$;

create or replace function public.life_work_take(
  p_user uuid, p_region text, p_place text, p_place_name text, p_job text, p_title text, p_skill text,
  p_pay_day numeric, p_need_level int, p_mode text, p_old_fare numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  v_level int;
  v_out jsonb;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' or p_place is null or p_place !~ ('^' || p_region || ':-?[0-9]+,-?[0-9]+$')
     or p_job !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' then raise exception 'bad_job'; end if;
  if coalesce(p_pay_day, 0) <= 0 or p_pay_day > public.setting('work_pay_max') then raise exception 'bad_job'; end if;
  if p_mode is null or p_mode not in ('walk', 'keke', 'okada', 'danfo', 'taxi', 'car') then raise exception 'bad_mode'; end if;
  if p_mode = 'car' and not exists (select 1 from public.items where owner = p_user and category = 'car') then raise exception 'no_car'; end if;
  if exists (select 1 from public.life_jobs where user_id = p_user and place_id = p_place and job = p_job) then raise exception 'already'; end if;
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = p_skill;
  if coalesce(v_level, 0) < coalesce(p_need_level, 0) then raise exception 'need_level:%', p_need_level; end if;

  v_out := public.life_work_collect(p_user, p_old_fare);
  delete from public.life_jobs where user_id = p_user;
  insert into public.life_jobs (user_id, region, place_id, place_name, job, title, skill, pay_day, mode)
    values (p_user, p_region, p_place, left(coalesce(p_place_name, 'Work'), 120), p_job, left(p_title, 60), p_skill, round(p_pay_day, 2), p_mode);
  return jsonb_build_object('hired', true, 'collected', v_out, 'coins', (select coins from public.profiles where id = p_user));
end $$;

create or replace function public.life_work_mode(p_user uuid, p_mode text, p_old_fare numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if p_mode is null or p_mode not in ('walk', 'keke', 'okada', 'danfo', 'taxi', 'car') then raise exception 'bad_mode'; end if;
  if p_mode = 'car' and not exists (select 1 from public.items where owner = p_user and category = 'car') then raise exception 'no_car'; end if;
  if not exists (select 1 from public.life_jobs where user_id = p_user) then raise exception 'no_job'; end if;
  v_out := public.life_work_collect(p_user, p_old_fare);
  update public.life_jobs set mode = p_mode where user_id = p_user;
  return v_out;
end $$;

do $$
begin
  revoke all on table public.items, public.item_kinds, public.item_trades, public.crafts from public, anon, authenticated;
  grant all on table public.items, public.item_kinds, public.item_trades, public.crafts to service_role;
  revoke all on sequence public.items_id_seq, public.item_trades_id_seq, public.crafts_id_seq, public.item_kinds_seq from public, anon, authenticated;
  grant all on sequence public.items_id_seq, public.item_trades_id_seq, public.crafts_id_seq, public.item_kinds_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.item_recent_price(text)', 'public.item_get(uuid, text, text, text, numeric, jsonb, text, numeric)', 'public.item_caught(uuid, numeric, numeric)',
    'public.item_gift(uuid, bigint, text)', 'public.item_list(uuid, bigint, numeric, numeric)', 'public.item_unlist(uuid, bigint)',
    'public.item_buy(uuid, bigint, numeric, numeric)', 'public.item_sell_city(uuid, bigint, numeric)', 'public.craft_start(uuid, jsonb, numeric, numeric)',
    'public.craft_finish(uuid, bigint, numeric, jsonb, int)', 'public.my_items(uuid)', 'public.market_items(uuid, text)', 'public.inventions_top(int)',
    'public.life_work_take(uuid, text, text, text, text, text, text, numeric, int, text, numeric)', 'public.life_work_mode(uuid, text, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

/** Money in and out by kind (as part 46, with things and cars bought and sold, market fees and fines). */
create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'commute',
                   'health_care', 'gym', 'school_fees', 'procedure', 'hustle_start', 'property_buy', 'start_grant',
                   'property_sale', 'sale_tax', 'loan', 'loan_repay',
                   'item_buy', 'item_sale', 'car_buy', 'car_sale', 'craft_cost', 'market_fee', 'item_tax', 'fine')
    group by kind
    union all
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ======================================================== 051_people.sql
-- Newtown, part 51: a city full of people. See docs/PEOPLE.md.
--
-- Presence. Every player stands somewhere on the map: where they last went (or home), online
-- when they've been about in the last few minutes, otherwise asleep (at home, late at night in
-- Lagos), at work (in working hours, if they have a job) or away.
--
-- Profiles. Anyone can see a player's card: where they live, their job, their best car, what
-- they've invented, who they're friends with.
--
-- Doorsteps. Knock on someone's door, leave a note, or leave a wrapped gift (one of your things;
-- it's theirs at once, waiting to be opened). They see it when they come back and can say thanks.
--
-- While you were away. What happened since you were last here, in one go.
--
-- Push. Web push subscriptions (a phone or a browser), so the game can tell you someone's at your
-- door. The game sends the push; the message itself is read from the server when it arrives.
--
-- Safe to run more than once. Run after parts 1-50.

insert into public.game_settings (key, value, note) values
  ('doorstep_per_day',     40, 'Knocks, notes and gifts each player can leave a day'),
  ('doorstep_same_per_day', 6, 'Of those, at the same door a day')
on conflict (key) do update set note = excluded.note;

alter table public.lives add column if not exists seen_at timestamptz;
-- When "while you were away" was last shown (the next one starts here).
alter table public.lives add column if not exists away_shown_at timestamptz;

create table if not exists public.doorstep (
  id bigserial primary key,
  to_user uuid not null references public.profiles (id) on delete cascade,
  from_user uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('knock', 'note', 'gift')),
  body text check (body is null or char_length(body) <= 280),
  item_id bigint references public.items (id) on delete set null,
  item_name text check (item_name is null or char_length(item_name) <= 60),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  thanked_at timestamptz
);
create index if not exists doorstep_to_idx on public.doorstep (to_user, created_at desc);
create index if not exists doorstep_from_idx on public.doorstep (from_user, created_at desc);

create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text check (p256dh is null or char_length(p256dh) <= 200),
  auth text check (auth is null or char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

/** I'm here (called while the game is open): online for the next few minutes. */
create or replace function public.people_here(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.lives set seen_at = now() where user_id = p_user
$$;

/** "lagos:12,-40/3" or "lagos:12,-40" to its x and z. */
create or replace function public.spot_xz(p_id text) returns int[]
language sql immutable as $$
  select case when p_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+'
    then array[(regexp_match(p_id, ':(-?[0-9]+),(-?[0-9]+)'))[1]::int, (regexp_match(p_id, ':(-?[0-9]+),(-?[0-9]+)'))[2]::int] end
$$;

/**
 * Where each player is and what they're up to: online (about in the last 4 minutes) at the
 * place they last went; otherwise asleep at home (23:00-06:00 in Lagos), at work (in working
 * hours, with a job), or away at home. Only players within the box (tiles), most recent first.
 */
create or replace function public.people_on_map(p_viewer uuid, p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  with hour as (select extract(hour from now() at time zone 'Africa/Lagos')::int as h),
  everyone as (
    select l.user_id, p.username, p.avatar, l.home_unit, l.at_place, l.seen_at, j.place_id as work, j.title as job,
      (l.seen_at > now() - interval '4 minutes') as online
    from public.lives l
    join public.profiles p on p.id = l.user_id and not p.is_bot
    left join public.life_jobs j on j.user_id = l.user_id
    where l.region = p_region and l.home_unit is not null and l.user_id <> p_viewer
      and not exists (select 1 from public.blocks b where (b.blocker = p_viewer and b.blocked = l.user_id) or (b.blocker = l.user_id and b.blocked = p_viewer))
  ),
  placed as (
    select e.*,
      case when e.online then 'online'
           when (select h from hour) >= 23 or (select h from hour) < 6 then 'asleep'
           when e.work is not null and (select h from hour) between 8 and 17 then 'work'
           else 'away' end as status
    from everyone e
  ),
  spots as (
    select pl.*, case when pl.status = 'online' then coalesce(pl.at_place, pl.home_unit) when pl.status = 'work' then pl.work else pl.home_unit end as spot
    from placed pl
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'name', coalesce(s.username, 'Someone'), 'avatar', s.avatar, 'status', s.status,
      'x', (public.spot_xz(s.spot))[1], 'z', (public.spot_xz(s.spot))[2], 'job', s.job, 'seenAt', s.seen_at,
      'friend', exists (select 1 from public.friendships f where f.accepted_at is not null
                         and ((f.requester = p_viewer and f.addressee = s.user_id) or (f.addressee = p_viewer and f.requester = s.user_id))))
    order by s.online desc, s.seen_at desc nulls last), '[]'::jsonb)
  from (select * from spots
        where (public.spot_xz(spot))[1] between p_x0 and p_x1 and (public.spot_xz(spot))[2] between p_z0 and p_z1
        order by online desc, seen_at desc nulls last
        limit least(greatest(coalesce(p_limit, 60), 1), 150)) s
$$;

/** A player's card, as anyone sees it. */
create or replace function public.player_card(p_viewer uuid, p_target uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'name', coalesce(p.username, 'Someone'), 'avatar', p.avatar,
    'home', l.home_unit, 'at', l.at_place, 'seenAt', l.seen_at, 'online', coalesce(l.seen_at > now() - interval '4 minutes', false),
    'job', (select jsonb_build_object('title', title, 'place', place_name) from public.life_jobs where user_id = p.id),
    'car', (select name from public.items where owner = p.id and category = 'car' order by base_value desc limit 1),
    'things', (select count(*) from public.items where owner = p.id),
    'thingsRep', coalesce((select sum(coalesce((effect->>'rep')::numeric, 0)) from public.items where owner = p.id), 0),
    'property', coalesce((select sum(price) from public.property_units where owner_id = p.id), 0),
    'units', (select count(*) from public.property_units where owner_id = p.id),
    'inventions', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'sold', sold) order by sold desc) from (select name, sold from public.item_kinds where creator = p.id order by sold desc limit 5) k), '[]'::jsonb),
    'inventionsSold', coalesce((select sum(sold) from public.item_kinds where creator = p.id), 0),
    'penalty', coalesce(l.rep_penalty, 0),
    'friends', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.username)) from (
        select o.id, o.username from public.friendships f
        join public.profiles o on o.id = case when f.requester = p.id then f.addressee else f.requester end
        where f.accepted_at is not null and (f.requester = p.id or f.addressee = p.id) limit 6) q), '[]'::jsonb),
    'friend', exists (select 1 from public.friendships f where f.accepted_at is not null
                       and ((f.requester = p_viewer and f.addressee = p.id) or (f.addressee = p_viewer and f.requester = p.id))),
    'blocked', exists (select 1 from public.blocks b where b.blocker = p_viewer and b.blocked = p.id)
  )
  from public.profiles p left join public.lives l on l.user_id = p.id
  where p.id = p_target and not p.is_bot
$$;

/**
 * Leave something at someone's door: a knock, a note, or a gift (one of your things, wrapped:
 * it's theirs at once). A few a day, never to someone who blocked you.
 */
create or replace function public.doorstep_leave(p_from uuid, p_to uuid, p_kind text, p_body text, p_item bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
  v_id bigint;
  v_name text;
begin
  if p_from = p_to then raise exception 'self'; end if;
  if p_kind not in ('knock', 'note', 'gift') then raise exception 'bad_kind'; end if;
  if not exists (select 1 from public.lives where user_id = p_to and home_unit is not null) then raise exception 'no_home'; end if;
  if exists (select 1 from public.blocks where blocker = p_to and blocked = p_from) then raise exception 'blocked'; end if;
  if (select count(*) from public.doorstep where from_user = p_from and created_at > now() - interval '1 day') >= public.setting('doorstep_per_day') then raise exception 'too_many'; end if;
  if (select count(*) from public.doorstep where from_user = p_from and to_user = p_to and created_at > now() - interval '1 day') >= public.setting('doorstep_same_per_day') then raise exception 'too_many_here'; end if;
  if p_kind = 'note' and (p_body is null or char_length(btrim(p_body)) < 1) then raise exception 'empty'; end if;
  if p_kind = 'gift' then
    select * into i from public.items where id = p_item for update;
    if not found or i.owner <> p_from then raise exception 'not_yours'; end if;
    if (select count(*) from public.items where owner = p_to) >= public.setting('items_max') then raise exception 'their_items_full'; end if;
    update public.items set owner = p_to, how = 'gift', got_at = now(), list_price = null, listed_at = null where id = p_item;
  end if;
  insert into public.doorstep (to_user, from_user, kind, body, item_id, item_name)
    values (p_to, p_from, p_kind, nullif(left(btrim(coalesce(p_body, '')), 280), ''), case when p_kind = 'gift' then p_item end, case when p_kind = 'gift' then i.name end)
    returning id into v_id;
  select coalesce(username, 'Someone') into v_name from public.profiles where id = p_from;
  perform public.notify(p_to, null, 'doorstep',
    case p_kind when 'knock' then v_name || ' knocked on your door.'
                when 'note' then v_name || ' left a note at your door.'
                else v_name || ' left a gift at your door!' end, null);
  return v_id;
end $$;

/** What's at your door (newest first), and how many are new. */
create or replace function public.doorstep_list(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'body', d.body, 'item', d.item_name, 'at', d.created_at,
      'opened', d.opened_at is not null, 'thanked', d.thanked_at is not null, 'from', d.from_user, 'fromName', coalesce(p.username, 'Someone'), 'fromAvatar', p.avatar)
    order by d.created_at desc, d.id desc), '[]'::jsonb)
  from (select * from public.doorstep where to_user = p_user order by created_at desc, id desc limit 60) d
  left join public.profiles p on p.id = d.from_user
$$;

/** Open what's at your door (all of it, or one). */
create or replace function public.doorstep_open(p_user uuid, p_id bigint) returns void
language sql security definer set search_path = public as $$
  update public.doorstep set opened_at = now() where to_user = p_user and opened_at is null and (p_id is null or id = p_id)
$$;

/** Say thanks for something left at your door: they hear about it. */
create or replace function public.doorstep_thank(p_user uuid, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d public.doorstep;
begin
  select * into d from public.doorstep where id = p_id and to_user = p_user for update;
  if not found then raise exception 'not_yours'; end if;
  if d.thanked_at is not null then raise exception 'already'; end if;
  update public.doorstep set thanked_at = now(), opened_at = coalesce(opened_at, now()) where id = p_id;
  if d.from_user is not null then
    perform public.notify(d.from_user, null, 'thanks',
      (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' says thank you for ' ||
      case d.kind when 'gift' then 'the ' || coalesce(d.item_name, 'gift') when 'note' then 'your note' else 'stopping by' end || '!', null);
  end if;
end $$;

/**
 * While you were away: since you were last shown it (or last here), what came to your door, what
 * you were told, and the money that moved. Then it starts again from now.
 */
create or replace function public.away_digest(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz;
  v_out jsonb;
begin
  select coalesce(away_shown_at, seen_at, now() - interval '1 day') into v_since from public.lives where user_id = p_user;
  if v_since is null then return null; end if;
  v_out := jsonb_build_object(
    'since', v_since,
    'doorstep', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'body', d.body, 'item', d.item_name, 'fromName', coalesce(p.username, 'Someone'), 'at', d.created_at) order by d.created_at desc)
      from public.doorstep d left join public.profiles p on p.id = d.from_user where d.to_user = p_user and d.created_at > v_since), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('kind', n.kind, 'body', n.body, 'at', n.created_at) order by n.created_at desc)
      from (select * from public.notifications where user_id = p_user and created_at > v_since and kind <> 'doorstep' order by created_at desc limit 20) n), '[]'::jsonb),
    'money', coalesce((select jsonb_object_agg(kind, total) from (select kind, round(sum(amount), 2) as total from public.ledger
      where user_id = p_user and created_at > v_since group by kind) m), '{}'::jsonb)
  );
  update public.lives set away_shown_at = now() where user_id = p_user;
  return v_out;
end $$;

/** Keep (or move) a push subscription for a phone or browser. */
create or replace function public.push_subscribe(p_user uuid, p_endpoint text, p_p256dh text, p_auth text) returns void
language sql security definer set search_path = public as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values (left(p_endpoint, 1000), p_user, left(p_p256dh, 200), left(p_auth, 100))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now()
$$;

do $$
begin
  revoke all on table public.doorstep, public.push_subscriptions from public, anon, authenticated;
  grant all on table public.doorstep, public.push_subscriptions to service_role;
  revoke all on sequence public.doorstep_id_seq from public, anon, authenticated;
  grant all on sequence public.doorstep_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.people_here(uuid)', 'public.people_on_map(uuid, text, int, int, int, int, int)', 'public.player_card(uuid, uuid)',
    'public.doorstep_leave(uuid, uuid, text, text, bigint)', 'public.doorstep_list(uuid)', 'public.doorstep_open(uuid, bigint)',
    'public.doorstep_thank(uuid, bigint)', 'public.away_digest(uuid)', 'public.push_subscribe(uuid, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 052_marks.sql
-- Newtown, part 52: leave your mark. See docs/MARKS.md.
--
-- Marks are things players leave on the map for everyone: writing on a wall, a review of a place
-- (with stars), a tree, a bench, a statue, a fountain or a plaque with their name, or a time
-- capsule that opens on a date (with a message, and maybe one of their things for whoever opens
-- it first). The author's name is always on it. Everyone can react (like, laugh, fire, love);
-- enough votes to take it down remove it, and that costs the author reputation. Paid marks
-- (trees, statues...) stand for a number of days; anyone can chip in to keep them standing.
-- The game says what each costs and checks the writing (src/lib/world/marks.ts).
--
-- Safe to run more than once. Run after parts 1-51.

insert into public.game_settings (key, value, note) values
  ('marks_per_day',      20,  'Marks each player can leave a day'),
  ('mark_takedown_votes', 5,  'Votes that take a mark down (more for well-liked ones: + a fifth of its reactions)'),
  ('mark_takedown_rep',   3,  'Reputation the author loses when a mark is taken down')
on conflict (key) do update set note = excluded.note;

create table if not exists public.marks (
  id bigserial primary key,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  x int not null,
  z int not null,
  kind text not null check (kind in ('writing', 'review', 'tree', 'bench', 'statue', 'fountain', 'plaque', 'capsule')),
  author uuid references public.profiles (id) on delete set null,
  body text check (body is null or char_length(body) <= 280),
  colour text check (colour is null or colour ~ '^#[0-9a-f]{6}$'),
  rating int check (rating is null or rating between 1 and 5),
  -- Where it is, in words ("Shoprite, Allen Avenue"), when it's about a place.
  place text check (place is null or char_length(place) <= 120),
  expires_at timestamptz,
  opens_at timestamptz,
  item_id bigint references public.items (id) on delete set null,
  item_name text check (item_name is null or char_length(item_name) <= 60),
  taken_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists marks_where_idx on public.marks (region, x, z) where removed_at is null;
create index if not exists marks_author_idx on public.marks (author, created_at desc);

create table if not exists public.mark_reactions (
  mark_id bigint not null references public.marks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('like', 'laugh', 'fire', 'love')),
  created_at timestamptz not null default now(),
  primary key (mark_id, user_id)
);

create table if not exists public.mark_votes (
  mark_id bigint not null references public.marks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mark_id, user_id)
);

/**
 * Leave a mark (the game has checked the writing and says what it costs and how long it stands).
 * A capsule can hold one of your things: it's held in the capsule until someone opens it.
 */
create or replace function public.mark_place(
  p_user uuid, p_region text, p_x int, p_z int, p_kind text, p_body text, p_colour text, p_rating int, p_place text,
  p_cost numeric, p_days int, p_opens_at timestamptz, p_item bigint
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  i public.items;
  v_cost numeric := round(greatest(coalesce(p_cost, 0), 0), 2);
  v_id bigint;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if p_kind not in ('writing', 'review', 'tree', 'bench', 'statue', 'fountain', 'plaque', 'capsule') then raise exception 'bad_kind'; end if;
  if (select count(*) from public.marks where author = p_user and created_at > now() - interval '1 day') >= public.setting('marks_per_day') then raise exception 'too_many'; end if;
  if p_kind in ('writing', 'review', 'plaque', 'capsule') and (p_body is null or char_length(btrim(p_body)) < 1) then raise exception 'empty'; end if;
  if v_cost > public.setting('item_price_max') then raise exception 'bad_item'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['fun', 'savings'], v_cost);
    perform public.log_coins(p_user, null, 'mark', -v_cost, false, 'Left on the map: ' || p_kind);
    perform public.burn(null, v_cost, 'Marks on the map');
  end if;
  if p_item is not null then
    if p_kind <> 'capsule' then raise exception 'bad_item'; end if;
    select * into i from public.items where id = p_item for update;
    if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
    -- Held by the capsule: nobody's until it's opened (the author keeps the row, off the market).
    update public.items set list_price = null, listed_at = null where id = p_item;
  end if;
  insert into public.marks (region, x, z, kind, author, body, colour, rating, place, expires_at, opens_at, item_id, item_name)
    values (p_region, p_x, p_z, p_kind, p_user, nullif(left(btrim(coalesce(p_body, '')), 280), ''), p_colour, p_rating, left(p_place, 120),
            case when coalesce(p_days, 0) > 0 then now() + make_interval(days => least(p_days, 3650)) end,
            case when p_kind = 'capsule' then greatest(coalesce(p_opens_at, now()), now()) end, p_item, i.name)
    returning id into v_id;
  return v_id;
end $$;

/** Marks round a spot (tiles) that are up now, with their reactions and your own reaction and vote. A capsule's message stays hidden until it opens. */
create or replace function public.marks_near(p_viewer uuid, p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'x', m.x, 'z', m.z, 'kind', m.kind, 'author', m.author, 'authorName', coalesce(p.username, 'Someone'),
      'body', case when m.kind = 'capsule' and m.opens_at > now() then null else m.body end,
      'colour', m.colour, 'rating', m.rating, 'place', m.place, 'expiresAt', m.expires_at, 'opensAt', m.opens_at,
      'item', case when m.kind = 'capsule' and m.taken_by is null then m.item_name end,
      'takenBy', (select username from public.profiles where id = m.taken_by), 'at', m.created_at,
      'reactions', coalesce((select jsonb_object_agg(emoji, c) from (select emoji, count(*) as c from public.mark_reactions where mark_id = m.id group by emoji) r), '{}'::jsonb),
      'mine', (select emoji from public.mark_reactions where mark_id = m.id and user_id = p_viewer),
      'voted', exists (select 1 from public.mark_votes where mark_id = m.id and user_id = p_viewer),
      'votes', (select count(*) from public.mark_votes where mark_id = m.id))
    order by m.created_at desc), '[]'::jsonb)
  from (select * from public.marks
        where region = p_region and removed_at is null and (expires_at is null or expires_at > now())
          and x between p_x0 and p_x1 and z between p_z0 and p_z1
        order by created_at desc limit 200) m
  left join public.profiles p on p.id = m.author
  where not exists (select 1 from public.blocks b where b.blocker = p_viewer and b.blocked = m.author)
$$;

/** React to a mark (again to change it; the same again to take it back). The author is told the first time. */
create or replace function public.mark_react(p_user uuid, p_mark bigint, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.marks;
  v_old text;
begin
  if p_emoji not in ('like', 'laugh', 'fire', 'love') then raise exception 'bad_kind'; end if;
  select * into m from public.marks where id = p_mark and removed_at is null;
  if not found then raise exception 'gone'; end if;
  select emoji into v_old from public.mark_reactions where mark_id = p_mark and user_id = p_user;
  if v_old = p_emoji then
    delete from public.mark_reactions where mark_id = p_mark and user_id = p_user;
    return;
  end if;
  insert into public.mark_reactions (mark_id, user_id, emoji) values (p_mark, p_user, p_emoji)
    on conflict (mark_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  if v_old is null and m.author is not null and m.author <> p_user then
    perform public.notify(m.author, null, 'mark', (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' reacted to what you left on the map.', null);
  end if;
end $$;

/**
 * Vote to take a mark down. Enough votes (mark_takedown_votes, more for well-liked marks) and it
 * comes down: the author loses reputation and is told. You can't vote on your own.
 */
create or replace function public.mark_vote(p_user uuid, p_mark bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m public.marks;
  v_votes int;
  v_need int;
begin
  select * into m from public.marks where id = p_mark and removed_at is null for update;
  if not found then raise exception 'gone'; end if;
  if m.author = p_user then raise exception 'own'; end if;
  insert into public.mark_votes (mark_id, user_id) values (p_mark, p_user) on conflict do nothing;
  select count(*) into v_votes from public.mark_votes where mark_id = p_mark;
  v_need := public.setting('mark_takedown_votes') + (select count(*) from public.mark_reactions where mark_id = p_mark) / 5;
  if v_votes < v_need then return false; end if;
  update public.marks set removed_at = now() where id = p_mark;
  if m.author is not null then
    update public.lives set rep_penalty = rep_penalty + public.setting('mark_takedown_rep') where user_id = m.author;
    perform public.notify(m.author, null, 'mark', 'People voted to take down what you left on the map' || coalesce(' at ' || m.place, '') || '.', null);
  end if;
  return true;
end $$;

/** Take your own mark down (a capsule's thing comes back to you). */
create or replace function public.mark_remove(p_user uuid, p_mark bigint) returns void
language sql security definer set search_path = public as $$
  update public.marks set removed_at = now() where id = p_mark and author = p_user and removed_at is null
$$;

/** Chip in to keep a tree, a statue... standing longer (the game says how many days the money buys). */
create or replace function public.mark_chip_in(p_user uuid, p_mark bigint, p_amount numeric, p_days int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  m public.marks;
  v_amount numeric := round(greatest(coalesce(p_amount, 0), 0), 2);
  v_until timestamptz;
begin
  select * into m from public.marks where id = p_mark and removed_at is null for update;
  if not found or m.expires_at is null then raise exception 'gone'; end if;
  if v_amount <= 0 or coalesce(p_days, 0) < 1 or p_days > 365 then raise exception 'bad_item'; end if;
  if public.life_can_spend(p_user, array['fun', 'savings']) < v_amount then raise exception 'not_enough:%', trim_scale(v_amount); end if;
  perform public.life_spend(p_user, array['fun', 'savings'], v_amount);
  perform public.log_coins(p_user, null, 'mark', -v_amount, false, 'Chipped in to keep something on the map standing');
  perform public.burn(null, v_amount, 'Marks on the map');
  v_until := greatest(m.expires_at, now()) + make_interval(days => p_days);
  update public.marks set expires_at = v_until where id = p_mark;
  if m.author is not null and m.author <> p_user then
    perform public.notify(m.author, null, 'mark', (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' chipped in to keep your ' || m.kind || ' standing.', null);
  end if;
  return v_until;
end $$;

/** Open a time capsule (once it's due): the first to open one with a thing in it gets the thing. */
create or replace function public.capsule_open(p_user uuid, p_mark bigint) returns text
language plpgsql security definer set search_path = public as $$
declare m public.marks;
begin
  select * into m from public.marks where id = p_mark and kind = 'capsule' and removed_at is null for update;
  if not found then raise exception 'gone'; end if;
  if m.opens_at > now() then raise exception 'not_yet'; end if;
  if m.item_id is null or m.taken_by is not null then return null; end if;
  if not exists (select 1 from public.items where id = m.item_id and owner = m.author) then
    update public.marks set taken_by = m.author where id = p_mark;
    return null;
  end if;
  update public.items set owner = p_user, how = 'found', got_at = now() where id = m.item_id;
  update public.marks set taken_by = p_user where id = p_mark;
  if m.author is not null and m.author <> p_user then
    perform public.notify(m.author, null, 'mark', (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' opened your time capsule and found ' || coalesce(m.item_name, 'your gift') || '.', null);
  end if;
  return m.item_name;
end $$;

/** What your marks have earned you: reactions on them (for reputation). */
create or replace function public.marks_liked(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.mark_reactions r join public.marks m on m.id = r.mark_id where m.author = p_user and m.removed_at is null and r.user_id <> p_user
$$;

do $$
begin
  revoke all on table public.marks, public.mark_reactions, public.mark_votes from public, anon, authenticated;
  grant all on table public.marks, public.mark_reactions, public.mark_votes to service_role;
  revoke all on sequence public.marks_id_seq from public, anon, authenticated;
  grant all on sequence public.marks_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.mark_place(uuid, text, int, int, text, text, text, int, text, numeric, int, timestamptz, bigint)',
    'public.marks_near(uuid, text, int, int, int, int)', 'public.mark_react(uuid, bigint, text)', 'public.mark_vote(uuid, bigint)',
    'public.mark_remove(uuid, bigint)', 'public.mark_chip_in(uuid, bigint, numeric, int)', 'public.capsule_open(uuid, bigint)', 'public.marks_liked(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 053_marks_rules.sql
-- Newtown, part 53: rules for marks. See docs/MARKS.md.
--
-- Writing is short (100 letters), in a graffiti style the writer picks. You need 20 reputation to
-- leave anything, and can have one mark up at a time, plus one more for every 50 reputation (the
-- game works out your reputation and passes how many you're allowed). Trees stay for good.
--
-- Safe to run more than once. Run after parts 1-52.

alter table public.marks add column if not exists style text check (style is null or style in ('spray', 'bubble', 'tag', 'drip', 'stencil', 'neon', 'chalk'));

/** How many of your marks are up now (not taken down, not run out, not an opened capsule). */
create or replace function public.marks_up(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.marks
  where author = p_user and removed_at is null and (expires_at is null or expires_at > now()) and not (kind = 'capsule' and taken_by is not null)
$$;

drop function if exists public.mark_place(uuid, text, int, int, text, text, text, int, text, numeric, int, timestamptz, bigint);
create or replace function public.mark_place(
  p_user uuid, p_region text, p_x int, p_z int, p_kind text, p_body text, p_colour text, p_rating int, p_place text,
  p_cost numeric, p_days int, p_opens_at timestamptz, p_item bigint, p_style text default null, p_allowed int default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  i public.items;
  v_cost numeric := round(greatest(coalesce(p_cost, 0), 0), 2);
  v_id bigint;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if p_kind not in ('writing', 'review', 'tree', 'bench', 'statue', 'fountain', 'plaque', 'capsule') then raise exception 'bad_kind'; end if;
  if (select count(*) from public.marks where author = p_user and created_at > now() - interval '1 day') >= public.setting('marks_per_day') then raise exception 'too_many'; end if;
  -- How many you can have up at once (from your reputation: the game works it out).
  if p_allowed is not null then
    if p_allowed < 1 then raise exception 'low_rep'; end if;
    if public.marks_up(p_user) >= p_allowed then raise exception 'mark_limit:%', p_allowed; end if;
  end if;
  if p_style is not null and p_style not in ('spray', 'bubble', 'tag', 'drip', 'stencil', 'neon', 'chalk') then raise exception 'bad_kind'; end if;
  if p_kind in ('writing', 'review', 'plaque', 'capsule') and (p_body is null or char_length(btrim(p_body)) < 1) then raise exception 'empty'; end if;
  if v_cost > public.setting('item_price_max') then raise exception 'bad_item'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['fun', 'savings'], v_cost);
    perform public.log_coins(p_user, null, 'mark', -v_cost, false, 'Left on the map: ' || p_kind);
    perform public.burn(null, v_cost, 'Marks on the map');
  end if;
  if p_item is not null then
    if p_kind <> 'capsule' then raise exception 'bad_item'; end if;
    select * into i from public.items where id = p_item for update;
    if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
    -- Held by the capsule: nobody's until it's opened (the author keeps the row, off the market).
    update public.items set list_price = null, listed_at = null where id = p_item;
  end if;
  insert into public.marks (region, x, z, kind, author, body, colour, rating, place, expires_at, opens_at, item_id, item_name, style)
    values (p_region, p_x, p_z, p_kind, p_user, nullif(left(btrim(coalesce(p_body, '')), 100), ''), p_colour, p_rating, left(p_place, 120),
            case when coalesce(p_days, 0) > 0 then now() + make_interval(days => least(p_days, 3650)) end,
            case when p_kind = 'capsule' then greatest(coalesce(p_opens_at, now()), now()) end, p_item, i.name,
            case when p_kind = 'writing' then coalesce(p_style, 'spray') end)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.marks_near(p_viewer uuid, p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'x', m.x, 'z', m.z, 'kind', m.kind, 'author', m.author, 'authorName', coalesce(p.username, 'Someone'),
      'body', case when m.kind = 'capsule' and m.opens_at > now() then null else m.body end,
      'colour', m.colour, 'style', m.style, 'rating', m.rating, 'place', m.place, 'expiresAt', m.expires_at, 'opensAt', m.opens_at,
      'item', case when m.kind = 'capsule' and m.taken_by is null then m.item_name end,
      'takenBy', (select username from public.profiles where id = m.taken_by), 'at', m.created_at,
      'reactions', coalesce((select jsonb_object_agg(emoji, c) from (select emoji, count(*) as c from public.mark_reactions where mark_id = m.id group by emoji) r), '{}'::jsonb),
      'mine', (select emoji from public.mark_reactions where mark_id = m.id and user_id = p_viewer),
      'voted', exists (select 1 from public.mark_votes where mark_id = m.id and user_id = p_viewer),
      'votes', (select count(*) from public.mark_votes where mark_id = m.id))
    order by m.created_at desc), '[]'::jsonb)
  from (select * from public.marks
        where region = p_region and removed_at is null and (expires_at is null or expires_at > now())
          and x between p_x0 and p_x1 and z between p_z0 and p_z1
        order by created_at desc limit 200) m
  left join public.profiles p on p.id = m.author
  where not exists (select 1 from public.blocks b where b.blocker = p_viewer and b.blocked = m.author)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.mark_place(uuid, text, int, int, text, text, text, int, text, numeric, int, timestamptz, bigint, text, int)',
    'public.marks_near(uuid, text, int, int, int, int)', 'public.marks_up(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 054_earnings.sql
-- Newtown, part 54: what you've earned, pay slip by pay slip (Finance, Overview).
--
-- Opening Finance first shows what you've earned (pay, hustles, rent, sales of things; selling a
-- home is not earning, so it's left out), all of it and the last week or month, the tax taken
-- off it, and each payment that came in, like a pile of pay slips you can filter: job, side hustle, rent, sales.
-- The numbers on whether you're up or down overall moved to Finance, Stats.
--
-- Safe to run more than once. Run after parts 1-53.

/** Everything you've earned (ever, and in the last p_days days), and the latest payments in. */
create or replace function public.life_earnings(p_user uuid, p_days int, p_limit int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  with earned as (
    select id, kind, amount, note, created_at from public.ledger
    where user_id = p_user and amount > 0
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'item_sale', 'car_sale', 'service_pay')
  ),
  taxed as (
    select amount, created_at from public.ledger where user_id = p_user and kind in ('income_tax', 'rent_tax') and amount < 0
  )
  select jsonb_build_object(
    'total', coalesce((select round(sum(amount), 2) from earned), 0),
    'tax', coalesce((select round(-sum(amount), 2) from taxed), 0),
    'period', coalesce((select round(sum(amount), 2) from earned where created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 3650))), 0),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', round(e.amount, 2), 'note', e.note, 'at', e.created_at) order by e.created_at desc, e.id desc)
      from (select * from earned where created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 3650))
            order by created_at desc, id desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) e), '[]'::jsonb)
  )
$$;

do $$
begin
  revoke all on function public.life_earnings(uuid, int, int) from public, anon, authenticated;
  grant execute on function public.life_earnings(uuid, int, int) to service_role;
end $$;

