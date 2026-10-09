-- Newtown, part 29: ghost duels (the new game).
-- Run once in Supabase → SQL Editor, after 028. Safe to run again: it only adds what is
-- missing and replaces functions (settings you have changed keep their values).
--
-- Ghosts no longer hide, move or get searched. Nobody scans, sweeps or sends drones.
-- - In the first 3 minutes of each game, anyone can join as a ghost (stake hider_stake, 100
--   mint). Everyone else is a hunter; there's nothing to join.
-- - Once the hunt starts, every ghost lights up on the map. Tap a ghost's light to see their
--   stats, chat with them, or challenge them.
-- - A challenge costs the hunter duel_fee (10 mint). The ghost gets a pop-up wherever they are
--   and has duel_answer_seconds (30) to answer; no answer is a loss for the ghost.
-- - Each duel is one quick game picked at random (for now: Rock-Paper-Scissors), first to
--   duel_first_to (2) points, at most duel_seconds (60). Ghosts start with the advantage: if
--   time runs out level, the ghost wins.
-- - Hunter wins: their 10 mint back, plus finder_share (80%) of a slice of the ghost's stake
--   (stake ÷ ghost_out_losses); the other 20% of the slice goes into the prize pool.
--   Ghost wins: the hunter's 10 mint goes into the prize pool.
-- - A ghost who wins ghost_golden_wins (3) duels turns golden: safe for the rest of the game,
--   and in the prize pool. A ghost who loses ghost_out_losses (3) is out: their light goes.
-- - A ghost plays one duel at a time (their light shows they're busy), and so does a hunter.
--   After each duel a hunter waits duel_cooldown_seconds (30) before the next. Nobody can
--   duel themselves, and ghosts can't challenge ghosts.
-- - A hunter who wins hunter_pool_wins (20) duels in one game enters the prize pool.
-- - When the game ends: ghosts still in get what's left of their stake back. Golden ghosts
--   and hunters in the pool share pool_win_share + pool_other_share (90%) of the prize pool
--   equally; the rest burns. If nobody is in the pool, it all burns. Duels still going when
--   the game ends are called off (the hunter gets the 10 mint back).
-- - Town events and side quests that were about hiding and hunting are switched off.
--
-- Coin books: no new mint. Fees and stake slices move between players and the prize pool.
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('duel_fee',              10, 'Mint a hunter pays to challenge a ghost (back if they win)'),
  ('duel_answer_seconds',   30, 'How long a ghost has to answer a challenge'),
  ('duel_seconds',          60, 'Longest a duel lasts once it starts'),
  ('duel_first_to',         2,  'Points needed to win a duel (Rock-Paper-Scissors throws)'),
  ('duel_cooldown_seconds', 30, 'Wait after a duel before a hunter can challenge again'),
  ('ghost_golden_wins',     3,  'Duels a ghost must win to turn golden (safe, in the prize pool)'),
  ('ghost_out_losses',      3,  'Duels a ghost can lose before they are out'),
  ('hunter_pool_wins',      20, 'Duels a hunter must win in one game to enter the prize pool')
on conflict (key) do update set note = excluded.note;

-- ============================================================ tables
alter table public.entries add column if not exists golden boolean not null default false;
alter table public.entries add column if not exists duel_wins int not null default 0;
alter table public.entries add column if not exists duel_losses int not null default 0;
alter table public.entries add column if not exists last_duel_at timestamptz;

create table if not exists public.duels (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  ghost_id uuid not null references public.profiles (id) on delete cascade,
  hunter_id uuid not null references public.profiles (id) on delete cascade,
  game text not null default 'rps',
  status text not null default 'asked' check (status in ('asked', 'playing', 'done', 'void')),
  fee numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  answer_by timestamptz not null,
  started_at timestamptz,
  ends_at timestamptz,
  ghost_score int not null default 0,
  hunter_score int not null default 0,
  ghost_move text check (ghost_move in ('rock', 'paper', 'scissors')),
  hunter_move text check (hunter_move in ('rock', 'paper', 'scissors')),
  throws jsonb not null default '[]',      -- [{ g, h, w: 'ghost' | 'hunter' | 'tie' }]
  winner text check (winner in ('ghost', 'hunter')),
  reason text,                             -- score, time, no_answer, gave_up, cancelled, game_over
  portion numeric(14,2) not null default 0, -- stake the ghost lost
  reward numeric(14,2) not null default 0,  -- what the hunter won on top of the fee
  finished_at timestamptz,
  check (ghost_id <> hunter_id)
);
-- One duel at a time for each ghost and each hunter.
create unique index if not exists duels_live_ghost on public.duels (ghost_id) where status in ('asked', 'playing');
create unique index if not exists duels_live_hunter on public.duels (hunter_id) where status in ('asked', 'playing');
create index if not exists duels_live_round on public.duels (round_id) where status in ('asked', 'playing');
create index if not exists duels_ghost_idx on public.duels (ghost_id, id desc);
create index if not exists duels_hunter_idx on public.duels (hunter_id, id desc);
alter table public.duels enable row level security; -- no policies: only the server reads them

-- ============================================================ helpers
create or replace function public.rps_beats(a text, b text) returns boolean
language sql immutable as $$
  select (a = 'rock' and b = 'scissors') or (a = 'paper' and b = 'rock') or (a = 'scissors' and b = 'paper')
$$;

-- A duel as one of its two players sees it: { id, game, status, role, opponent: { id, name,
-- avatar, level }, me, them, first_to, throws: [{ me, them, w: me|them|tie }], my_move,
-- they_moved, answer_by, ends_at, now, winner: me|them|null, reason, fee, reward, portion }.
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
    'answer_by', d.answer_by, 'ends_at', d.ends_at, 'now', now(),
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
      format('%s beat you%s. Your %s mint went into the prize pool.', coalesce(v_g, 'The ghost'),
             case p_reason when 'time' then ' (time ran out level, and ghosts win a draw)' else '' end, d.fee));
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

-- Settle duels whose time is up: an unanswered challenge is a loss for the ghost; a duel that
-- ran out of time goes to whoever is ahead (level: the ghost). The caller holds the game's lock.
create or replace function public.duel_tidy(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
declare d record; v_n int := 0;
begin
  for d in select * from public.duels where round_id = p_round and status in ('asked', 'playing')
             and ((status = 'asked' and answer_by <= now()) or (status = 'playing' and ends_at <= now()))
           order by id loop
    if d.status = 'asked' then
      perform public.duel_finish(d.id, 'hunter', 'no_answer');
    else
      perform public.duel_finish(d.id, case when d.hunter_score > d.ghost_score then 'hunter' else 'ghost' end, 'time');
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Any duel in this game whose time is up? (cheap: only live duels are looked at)
create or replace function public.duel_stale(p_round bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.duels where round_id = p_round and status in ('asked', 'playing')
                 and ((status = 'asked' and answer_by <= now()) or (status = 'playing' and ends_at <= now())))
$$;

-- ============================================================ challenging, answering, playing
-- A hunter challenges a ghost. Returns duel_view(). Errors: no_hunt, self, unknown_player,
-- no_name, frozen, you_are_ghost, not_ghost, ghost_out, ghost_golden, busy, you_busy,
-- cooldown:<seconds>, not_enough:<fee>.
create or replace function public.duel_challenge(p_hunter uuid, p_ghost uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  he public.entries;
  ge public.entries;
  d public.duels;
  v_fee numeric := public.setting('duel_fee');
  v_wait numeric;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'no_hunt'; end if;
  perform public.duel_tidy(r.id);
  if p_hunter = p_ghost then raise exception 'self'; end if;
  select * into p from public.profiles where id = p_hunter for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into he from public.entries where round_id = r.id and user_id = p_hunter;
  if found and he.role = 'hider' then raise exception 'you_are_ghost'; end if;
  select e.* into ge from public.entries e join public.profiles gp on gp.id = e.user_id
   where e.round_id = r.id and e.user_id = p_ghost and e.role = 'hider' and not gp.is_bot;
  if not found then raise exception 'not_ghost'; end if;
  if ge.caught then raise exception 'ghost_out'; end if;
  if ge.golden then raise exception 'ghost_golden'; end if;
  if exists (select 1 from public.duels where ghost_id = p_ghost and status in ('asked', 'playing')) then raise exception 'busy'; end if;
  if exists (select 1 from public.duels where hunter_id = p_hunter and status in ('asked', 'playing')) then raise exception 'you_busy'; end if;
  if he.last_duel_at is not null then
    v_wait := public.setting('duel_cooldown_seconds') - extract(epoch from (now() - he.last_duel_at));
    if v_wait > 0.5 then raise exception 'cooldown:%', ceil(v_wait)::int; end if;
  end if;
  if p.coins < v_fee then raise exception 'not_enough:%', v_fee; end if;
  -- Everyone who isn't a ghost is a hunter: the first challenge puts them in the game.
  if he.user_id is null then perform public.join_round(p_hunter, 'seeker'); end if;
  update public.profiles set coins = coins - v_fee where id = p_hunter;
  perform public.log_coins(p_hunter, r.id, 'duel_fee', -v_fee, false,
    'Challenge: ' || coalesce((select username from public.profiles where id = p_ghost), 'a ghost'));
  insert into public.duels (round_id, ghost_id, hunter_id, game, fee, answer_by)
    values (r.id, p_ghost, p_hunter, 'rps', v_fee, now() + make_interval(secs => public.setting('duel_answer_seconds')::int))
    returning * into d;
  perform public.notify(p_ghost, r.id, 'duel',
    format('%s challenged you to a duel! Answer within %s seconds or you lose it.', p.username, public.setting('duel_answer_seconds')::int));
  return public.duel_view(d, p_hunter);
end $$;

-- Lock the game a duel belongs to, then the duel. Errors: no_duel, not_yours.
create or replace function public.duel_lock(p_user uuid, p_duel bigint) returns public.duels
language plpgsql security definer set search_path = public as $$
declare d public.duels; v_round bigint;
begin
  select round_id into v_round from public.duels where id = p_duel;
  if v_round is null then raise exception 'no_duel'; end if;
  perform 1 from public.rounds where id = v_round for update;
  perform public.duel_tidy(v_round);
  select * into d from public.duels where id = p_duel for update;
  if p_user not in (d.ghost_id, d.hunter_id) then raise exception 'not_yours'; end if;
  return d;
end $$;

-- The ghost answers: the duel starts. Returns duel_view(). Errors: no_duel, not_yours.
-- (Too late: the view shows the duel already lost.)
create or replace function public.duel_answer(p_ghost uuid, p_duel bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  d := public.duel_lock(p_ghost, p_duel);
  if d.ghost_id <> p_ghost then raise exception 'not_yours'; end if;
  if d.status = 'asked' then
    update public.duels set status = 'playing', started_at = now(),
           ends_at = now() + make_interval(secs => public.setting('duel_seconds')::int)
     where id = p_duel returning * into d;
  end if;
  return public.duel_view(d, p_ghost);
end $$;

-- Throw rock, paper or scissors. When both have thrown, the point goes to the winner (a tie is
-- thrown again); first to duel_first_to wins the duel. Returns duel_view().
-- Errors: no_duel, not_yours, bad_move, not_playing.
create or replace function public.duel_move(p_user uuid, p_duel bigint, p_move text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.duels;
  v_w text;
  v_first int := public.setting('duel_first_to')::int;
begin
  if p_move is null or p_move not in ('rock', 'paper', 'scissors') then raise exception 'bad_move'; end if;
  d := public.duel_lock(p_user, p_duel);
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
    v_w := case when d.ghost_move = d.hunter_move then 'tie'
                when public.rps_beats(d.ghost_move, d.hunter_move) then 'ghost' else 'hunter' end;
    update public.duels
       set throws = throws || jsonb_build_array(jsonb_build_object('g', ghost_move, 'h', hunter_move, 'w', v_w)),
           ghost_score = ghost_score + (v_w = 'ghost')::int,
           hunter_score = hunter_score + (v_w = 'hunter')::int,
           ghost_move = null, hunter_move = null
     where id = p_duel returning * into d;
    if d.ghost_score >= v_first then perform public.duel_finish(p_duel, 'ghost', 'score');
    elsif d.hunter_score >= v_first then perform public.duel_finish(p_duel, 'hunter', 'score');
    end if;
    select * into d from public.duels where id = p_duel;
  end if;
  return public.duel_view(d, p_user);
end $$;

-- Give up: a ghost who won't play (or gives up mid-duel) loses; a hunter who gives up loses
-- too, except while the ghost hasn't answered yet, when it's simply called off (fee back).
-- Returns duel_view().
create or replace function public.duel_give_up(p_user uuid, p_duel bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  d := public.duel_lock(p_user, p_duel);
  if d.status in ('asked', 'playing') then
    if p_user = d.hunter_id and d.status = 'asked' then
      perform public.duel_finish(p_duel, null, 'cancelled');
    else
      perform public.duel_finish(p_duel, case when p_user = d.ghost_id then 'hunter' else 'ghost' end, 'gave_up');
    end if;
  end if;
  select * into d from public.duels where id = p_duel;
  return public.duel_view(d, p_user);
end $$;

-- One duel, as its player sees it now (settling it first if its time is up).
-- Errors: no_duel, not_yours.
create or replace function public.duel_state(p_user uuid, p_duel bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_duel;
  if not found then raise exception 'no_duel'; end if;
  if p_user not in (d.ghost_id, d.hunter_id) then raise exception 'not_yours'; end if;
  if (d.status = 'asked' and d.answer_by <= now()) or (d.status = 'playing' and d.ends_at <= now()) then
    d := public.duel_lock(p_user, p_duel);
  end if;
  return public.duel_view(d, p_user);
end $$;

-- ============================================================ what the map shows
-- The game as the duels see it: { phase, rules, ghosts: [{ id, name, avatar, level, tile,
-- status: free|playing|golden, wins, losses }], me: { role, wins, losses, golden, out,
-- cooldown_until, in_pool }, duel: duel_view() of your live (or just finished) duel }.
-- Ghosts who are out are left off. Settles duels whose time is up first.
create or replace function public.duel_board(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  me public.entries;
  d public.duels;
  v_pool int := public.setting('hunter_pool_wins')::int;
begin
  select * into r from public.rounds where status <> 'done' order by id desc limit 1;
  if not found then return jsonb_build_object('phase', 'none', 'ghosts', '[]'::jsonb); end if;
  if r.status = 'seek' and public.duel_stale(r.id) then
    perform 1 from public.rounds where id = r.id for update;
    perform public.duel_tidy(r.id);
  end if;
  select * into me from public.entries where round_id = r.id and user_id = p_user;
  if p_user is not null then
    select * into d from public.duels where round_id = r.id and (ghost_id = p_user or hunter_id = p_user)
      and (status in ('asked', 'playing') or finished_at > now() - interval '20 seconds')
      order by (status in ('asked', 'playing')) desc, id desc limit 1;
  end if;
  return jsonb_build_object(
    'phase', r.status,
    'rules', jsonb_build_object(
      'fee', public.setting('duel_fee'), 'answer_seconds', public.setting('duel_answer_seconds'),
      'duel_seconds', public.setting('duel_seconds'), 'first_to', public.setting('duel_first_to'),
      'cooldown', public.setting('duel_cooldown_seconds'), 'golden_wins', public.setting('ghost_golden_wins'),
      'out_losses', public.setting('ghost_out_losses'), 'pool_wins', v_pool, 'stake', public.setting('hider_stake')),
    'ghosts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.user_id, 'name', p.username, 'avatar', p.avatar, 'level', p.level, 'tile', e.tile,
               'status', case when e.golden then 'golden'
                              when exists (select 1 from public.duels x where x.ghost_id = e.user_id and x.status in ('asked', 'playing')) then 'playing'
                              else 'free' end,
               'wins', e.duel_wins, 'losses', e.duel_losses) order by e.created_at)
      from public.entries e join public.profiles p on p.id = e.user_id
      where e.round_id = r.id and e.role = 'hider' and not e.caught and not p.is_bot), '[]'::jsonb),
    'me', case when me.user_id is null then jsonb_build_object('role', 'hunter', 'wins', 0, 'losses', 0)
               else jsonb_build_object(
                 'role', case when me.role = 'hider' then 'ghost' else 'hunter' end,
                 'wins', me.duel_wins, 'losses', me.duel_losses, 'golden', me.golden, 'out', me.caught,
                 'stake', me.stake,
                 'cooldown_until', case when me.role = 'seeker' and me.last_duel_at is not null
                                        then me.last_duel_at + make_interval(secs => public.setting('duel_cooldown_seconds')::int) end,
                 'in_pool', me.golden or (me.role = 'seeker' and me.duel_wins >= v_pool)) end,
    'duel', case when d.id is null then null else public.duel_view(d, p_user) end);
end $$;

-- A ghost's card: who they are, this game so far, and their record. Also whether you can
-- challenge them right now (and if not, why). { id, name, avatar, level, status, wins, losses,
-- golden, record: { ghost_wins, ghost_losses, hunter_wins, golden_games, ghost_games },
-- can: true | false, why: busy | golden | out | self | you_are_ghost | cooldown | you_busy |
-- no_hunt | not_enough | null, cooldown_until }.
create or replace function public.ghost_card(p_user uuid, p_ghost uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rounds;
  g public.entries;
  p public.profiles;
  me public.entries;
  v_busy boolean;
  v_why text;
  v_cool timestamptz;
begin
  select * into r from public.rounds where status <> 'done' order by id desc limit 1;
  select * into p from public.profiles where id = p_ghost;
  if not found then raise exception 'no_player'; end if;
  select * into g from public.entries where round_id = r.id and user_id = p_ghost and role = 'hider';
  select * into me from public.entries where round_id = r.id and user_id = p_user;
  v_busy := exists (select 1 from public.duels where ghost_id = p_ghost and status in ('asked', 'playing'));
  if me.last_duel_at is not null and me.role = 'seeker' then
    v_cool := me.last_duel_at + make_interval(secs => public.setting('duel_cooldown_seconds')::int);
    if v_cool <= now() then v_cool := null; end if;
  end if;
  v_why := case
    when p_user = p_ghost then 'self'
    when r.status is distinct from 'seek' then 'no_hunt'
    when g.user_id is null or g.caught then 'out'
    when g.golden then 'golden'
    when me.role = 'hider' then 'you_are_ghost'
    when v_busy then 'busy'
    when exists (select 1 from public.duels where hunter_id = p_user and status in ('asked', 'playing')) then 'you_busy'
    when v_cool is not null then 'cooldown'
    when (select coins from public.profiles where id = p_user) < public.setting('duel_fee') then 'not_enough'
  end;
  return jsonb_build_object(
    'id', p.id, 'name', p.username, 'avatar', p.avatar, 'level', p.level,
    'status', case when g.user_id is null or g.caught then 'out' when g.golden then 'golden' when v_busy then 'playing' else 'free' end,
    'wins', coalesce(g.duel_wins, 0), 'losses', coalesce(g.duel_losses, 0), 'golden', coalesce(g.golden, false),
    'record', jsonb_build_object(
      'ghost_wins', (select count(*) from public.duels where ghost_id = p_ghost and status = 'done' and winner = 'ghost'),
      'ghost_losses', (select count(*) from public.duels where ghost_id = p_ghost and status = 'done' and winner = 'hunter'),
      'hunter_wins', (select count(*) from public.duels where hunter_id = p_ghost and status = 'done' and winner = 'hunter'),
      'golden_games', (select count(*) from public.entries where user_id = p_ghost and golden),
      'ghost_games', p.hider_rounds),
    'can', v_why is null, 'why', v_why, 'cooldown_until', v_cool, 'fee', public.setting('duel_fee'));
end $$;

-- ============================================================ joining as a ghost
-- Anyone signed in can join as a ghost in the join window (no need to have hunted first).
-- Hunters don't join: their first challenge puts them in the game.
create or replace function public.join_round(p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_stake numeric := public.setting('hider_stake');
  v_bonus numeric := 0;
begin
  select * into r from public.rounds where status <> 'done' for update;
  if not found then raise exception 'No round is open right now'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'Unknown player'; end if;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if exists (select 1 from public.entries where round_id = r.id and user_id = p_user) then
    raise exception 'You are already in this round';
  end if;

  if p_role = 'hider' then
    if r.status <> 'join' then raise exception 'Ghosts can only join in the first few minutes of a game'; end if;
    if p.coins < v_stake then raise exception 'You need % coins to be a ghost', v_stake; end if;
    update public.profiles set coins = coins - v_stake where id = p_user;
    perform public.log_coins(p_user, r.id, 'stake', -v_stake);
    insert into public.entries (round_id, user_id, role, stake, stake_weight)
      values (r.id, p_user, 'hider', v_stake, v_stake);
    update public.rounds set hiders_total = hiders_total + 1, hiders_remaining = hiders_remaining + 1,
           tile_count = tile_count + public.setting('tiles_per_hider')::int
      where id = r.id;
  elsif p_role = 'seeker' then
    insert into public.entries (round_id, user_id, role) values (r.id, p_user, 'seeker');
    if p.bonus_day is distinct from current_date then
      v_bonus := public.setting('seeker_bonus');
      update public.profiles set bonus_coins = bonus_coins + v_bonus, bonus_day = current_date where id = p_user;
      perform public.log_coins(p_user, r.id, 'seeker_bonus', v_bonus, true);
    end if;
  else
    raise exception 'Role must be hider or seeker';
  end if;
  return jsonb_build_object('round_id', r.id, 'role', p_role, 'bonus_coins', v_bonus);
end $$;

-- ============================================================ the end of a game
create or replace function public.finalize_round(p_round bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  d record;
  x record;
  v_n int;
  v_pot numeric;
  v_share numeric;
  v_paid numeric := 0;
  v_pool int := public.setting('hunter_pool_wins')::int;
begin
  select * into r from public.rounds where id = p_round for update;
  if not found or r.status = 'done' then return; end if;
  -- Duels still going are called off (the hunter gets the fee back).
  for d in select id from public.duels where round_id = p_round and status in ('asked', 'playing') loop
    perform public.duel_finish(d.id, null, 'game_over');
  end loop;
  select * into r from public.rounds where id = p_round;
  update public.rounds set status = 'done', finished_at = now() where id = p_round;

  -- Ghosts still in get what's left of their stake back.
  for x in select e.user_id, e.stake from public.entries e join public.profiles p on p.id = e.user_id
           where e.round_id = p_round and e.role = 'hider' and not e.caught and not p.is_bot and e.stake > 0 loop
    update public.profiles set coins = coins + x.stake where id = x.user_id;
    perform public.log_coins(x.user_id, p_round, 'stake_return', x.stake);
  end loop;

  -- The prize pool: golden ghosts and hunters with enough wins share 90% equally.
  select count(*) into v_n from public.entries e join public.profiles p on p.id = e.user_id
   where e.round_id = p_round and not p.is_bot
     and ((e.role = 'hider' and e.golden and not e.caught) or (e.role = 'seeker' and e.duel_wins >= v_pool));
  v_pot := round(r.pool * (public.setting('pool_win_share') + public.setting('pool_other_share')), 2);
  if v_n > 0 and v_pot > 0 then
    v_share := floor(v_pot * 100 / v_n) / 100;
    for x in select e.user_id, e.role from public.entries e join public.profiles p on p.id = e.user_id
             where e.round_id = p_round and not p.is_bot
               and ((e.role = 'hider' and e.golden and not e.caught) or (e.role = 'seeker' and e.duel_wins >= v_pool)) loop
      update public.profiles set coins = coins + v_share where id = x.user_id;
      update public.entries set payout = payout + v_share where round_id = p_round and user_id = x.user_id;
      perform public.log_coins(x.user_id, p_round, case when x.role = 'hider' then 'pool_hider' else 'pool_seeker' end, v_share);
      v_paid := v_paid + v_share;
    end loop;
  end if;
  -- The bank's 10%, a pool nobody won, and rounding dust burn. Nothing carries over.
  perform public.burn(p_round, r.pool - v_paid, 'bank');

  update public.profiles set hider_rounds = hider_rounds + 1
    where not is_bot and id in (select user_id from public.entries where round_id = p_round and role = 'hider');
  update public.profiles set seeker_rounds = seeker_rounds + 1
    where id in (select user_id from public.entries where round_id = p_round and role = 'seeker');
end $$;

-- ============================================================ town events and side quests
-- Events and quests that were about hiding and hunting are switched off (to be replaced).
alter table public.world_event_kinds add column if not exists enabled boolean not null default true;
update public.world_event_kinds set enabled = false
 where key in ('fog_of_war', 'double_coins', 'ghost_amnesty', 'drone_storm', 'lucky_street', 'bot_tantrum',
               'spotlight', 'bounty_board', 'safe_house', 'blackout_district');
update public.quest_catalog set enabled = false
 where key in ('detective', 'private_eye', 'spy', 'lookout', 'informant', 'apprentice_hunter', 'bounty_hunter',
               'drone_pilot', 'decoy_master', 'escape_artist', 'ghost_whisperer', 'shadow');

-- Part 22's planner, picking only events that are switched on.
create or replace function public.plan_world_events(p_round bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  v_count int;
  v_n int := 0;
  v_hunt int;
  k record;
  v_start timestamptz;
  v_final int;
begin
  select * into r from public.rounds where id = p_round;
  if not found or exists (select 1 from public.world_events where round_id = p_round) then return 0; end if;
  v_hunt := greatest(5, floor(extract(epoch from (r.seek_ends_at - r.join_ends_at)) / 60)::int);
  v_count := public.setting('world_events_min')::int
             + floor(random() * (public.setting('world_events_max') - public.setting('world_events_min') + 1))::int;
  v_count := greatest(1, v_count);
  for k in
    select * from public.world_event_kinds
    where key <> 'final_countdown' and enabled
    order by (case when twist then random() * (1 - public.setting('world_event_twist_share')) * 2
                   else random() * public.setting('world_event_twist_share') * 2 end) desc
    limit v_count
  loop
    -- Somewhere in the hunt, not in the first 2 minutes, finished before the end.
    v_start := r.join_ends_at + make_interval(secs => (120 + floor(random() * greatest(60, (v_hunt - k.minutes - 3) * 60 - 120)))::int);
    insert into public.world_events (round_id, key, tile, radius, starts_at, ends_at, reward_coins, reward_slots, detail)
      values (p_round, k.key, floor(random() * r.tile_count)::int, k.radius, v_start,
              v_start + make_interval(mins => k.minutes), k.reward_coins, k.reward_slots, '{}'::jsonb);
    v_n := v_n + 1;
  end loop;
  -- Sometimes the last 2 minutes get the final-countdown treatment.
  if random() < 0.35 then
    select minutes into v_final from public.world_event_kinds where key = 'final_countdown';
    insert into public.world_events (round_id, key, tile, starts_at, ends_at)
      values (p_round, 'final_countdown', 0, r.seek_ends_at - make_interval(mins => coalesce(v_final, 2)), r.seek_ends_at);
    v_n := v_n + 1;
  end if;
  -- Always at least one.
  if v_n = 0 then
    insert into public.world_events (round_id, key, tile, starts_at, ends_at)
      values (p_round, 'street_party', floor(random() * r.tile_count)::int, r.join_ends_at + interval '10 minutes', r.join_ends_at + interval '16 minutes');
    v_n := 1;
  end if;
  return v_n;
end $$;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.duels from public, anon, authenticated;
  grant all on table public.duels to service_role;
  revoke all on sequence public.duels_id_seq from public, anon, authenticated;
  grant all on sequence public.duels_id_seq to service_role;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('rps_beats', 'duel_view', 'duel_finish', 'duel_tidy', 'duel_stale', 'duel_challenge', 'duel_lock', 'duel_answer',
            'duel_move', 'duel_give_up', 'duel_state', 'duel_board', 'ghost_card', 'join_round', 'finalize_round',
            'plan_world_events')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
