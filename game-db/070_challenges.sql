-- Newtown, part 70: challenges on the map (docs/CHALLENGES.md). Tap Fight, pick a game (Whot!,
-- Ludo...) and a stake: everyone nearby is told and your light shines on the map. They have a
-- minute to join (each paying the stake into the pool), then the game is played right there on
-- the map. The winner takes the pool. Your first challenge is free; another one before the
-- cooldown ends costs a fee. Challenging and winning add to your reputation.
--
-- Safe to run more than once. Run after part 69.

create table if not exists public.challenges (
  id bigserial primary key,
  host_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  game text not null check (game ~ '^[a-z_]{2,20}$'),
  stake numeric(14,2) not null default 0 check (stake >= 0),
  fee numeric(14,2) not null default 0,
  x int not null,
  z int not null,
  seats int not null default 4 check (seats between 2 and 6),
  seed bigint not null,
  status text not null default 'open' check (status in ('open', 'playing', 'done', 'cancelled')),
  pool numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  starts_at timestamptz not null,
  started_at timestamptz,
  winner_id uuid references public.profiles (id) on delete set null,
  prize numeric(14,2),
  finished_at timestamptz
);
create index if not exists challenges_open_idx on public.challenges (region, status, created_at desc);
create index if not exists challenges_host_idx on public.challenges (host_id, created_at desc);

create table if not exists public.challenge_players (
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  paid numeric(14,2) not null default 0,
  joined_at timestamptz not null default now(),
  -- Who this player says won (the pool is paid when the players agree, see challenge_report).
  says uuid references public.profiles (id) on delete set null,
  said_at timestamptz,
  primary key (challenge_id, user_id)
);
-- Says it was a draw, and left the game (added after the first version).
alter table public.challenge_players add column if not exists says_draw boolean not null default false;
alter table public.challenge_players add column if not exists left_at timestamptz;
create index if not exists challenge_players_user_idx on public.challenge_players (user_id, joined_at desc);

/** In a challenge that isn't over (open or playing)? Its id, or null. */
create or replace function public.challenge_busy(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select c.id from public.challenge_players cp join public.challenges c on c.id = cp.challenge_id
  where cp.user_id = p_user and cp.left_at is null and (c.status = 'open' or (c.status = 'playing' and c.started_at > now() - interval '45 minutes'))
  order by c.id desc limit 1
$$;

/**
 * Open a challenge. p_fee: what another challenge costs before the cooldown (p_cooldown seconds)
 * is over; the first one (or one after the cooldown) is free. The host pays the stake into the
 * pool like everyone else. Returns the challenge, and the fee paid.
 */
create or replace function public.challenge_open(p_user uuid, p_region text, p_game text, p_stake numeric, p_x int, p_z int, p_seats int, p_fee numeric, p_cooldown int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_last timestamptz;
  v_fee numeric := 0;
  v_stake numeric := round(least(1000, greatest(0, coalesce(p_stake, 0))), 2);
  v_id bigint;
  v_seed bigint := floor(random() * 2000000000)::bigint;
  v_starts timestamptz := now() + interval '60 seconds';
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if public.challenge_busy(p_user) is not null then raise exception 'busy'; end if;
  select max(created_at) into v_last from public.challenges where host_id = p_user and status <> 'cancelled';
  if v_last is not null and v_last > now() - make_interval(secs => greatest(60, least(1800, coalesce(p_cooldown, 480)))) then
    v_fee := round(least(500, greatest(0, coalesce(p_fee, 0))), 2);
  end if;
  if public.life_can_spend(p_user, array['fun']) < v_fee + v_stake then raise exception 'not_enough:%', trim_scale(v_fee + v_stake); end if;
  if v_fee > 0 then
    perform public.life_spend(p_user, array['fun'], v_fee);
    perform public.log_coins(p_user, null, 'challenge_fee', -v_fee, false, 'Challenge fee');
    perform public.burn(null, v_fee, 'Challenge fees');
  end if;
  if v_stake > 0 then
    perform public.life_spend(p_user, array['fun'], v_stake);
    perform public.log_coins(p_user, null, 'challenge_stake', -v_stake, false, 'Challenge stake');
  end if;
  insert into public.challenges (host_id, region, game, stake, fee, x, z, seats, seed, pool, starts_at)
    values (p_user, p_region, p_game, v_stake, v_fee, p_x, p_z, greatest(2, least(6, coalesce(p_seats, 4))), v_seed, v_stake, v_starts)
    returning id into v_id;
  insert into public.challenge_players (challenge_id, user_id, paid) values (v_id, p_user, v_stake);
  return jsonb_build_object('id', v_id, 'fee', v_fee, 'seed', v_seed, 'starts_at', v_starts);
end $$;

/** Join a challenge before it starts: pay the stake into the pool. */
create or replace function public.challenge_join(p_user uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  c public.challenges;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  select * into c from public.challenges where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_user) then
    return jsonb_build_object('id', c.id, 'paid', 0, 'already', true);
  end if;
  if c.status <> 'open' or now() >= c.starts_at then raise exception 'started'; end if;
  if (select count(*) from public.challenge_players where challenge_id = p_id) >= c.seats then raise exception 'full'; end if;
  if public.challenge_busy(p_user) is not null then raise exception 'busy'; end if;
  if c.stake > 0 then
    if public.life_can_spend(p_user, array['fun']) < c.stake then raise exception 'not_enough:%', trim_scale(c.stake); end if;
    perform public.life_spend(p_user, array['fun'], c.stake);
    perform public.log_coins(p_user, null, 'challenge_stake', -c.stake, false, 'Challenge stake');
  end if;
  insert into public.challenge_players (challenge_id, user_id, paid) values (p_id, p_user, c.stake);
  update public.challenges set pool = pool + c.stake where id = p_id;
  return jsonb_build_object('id', c.id, 'paid', c.stake);
end $$;

/** Give everyone in a challenge their stake back and call it off. */
create or replace function public.challenge_refund(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id, paid from public.challenge_players where challenge_id = p_id and paid > 0 loop
    update public.profiles set coins = coins + r.paid where id = r.user_id;
    perform public.log_coins(r.user_id, null, 'challenge_refund', r.paid, false, 'Challenge called off');
  end loop;
  update public.challenges set status = 'cancelled', finished_at = now() where id = p_id;
end $$;

/**
 * The minute is up: start (two or more players), or call it off and give the stakes back. Safe to
 * call by anyone, any number of times. Returns the status.
 */
create or replace function public.challenge_begin(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  r record;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then return 'gone'; end if;
  if c.status <> 'open' then return c.status; end if;
  if now() < c.starts_at then return 'open'; end if;
  if (select count(*) from public.challenge_players where challenge_id = p_id) < 2 then
    perform public.challenge_refund(p_id);
    for r in select user_id from public.challenge_players where challenge_id = p_id loop
      perform public.notify(r.user_id, null, 'challenge', 'Your challenge didn''t start: not enough players joined. Your stake is back.');
    end loop;
    return 'cancelled';
  end if;
  update public.challenges set status = 'playing', started_at = now() where id = p_id;
  for r in select user_id from public.challenge_players where challenge_id = p_id loop
    perform public.notify(r.user_id, null, 'challenge', 'Game on! Your challenge has started. Open the game to play.');
  end loop;
  return 'playing';
end $$;

/**
 * A player says how it ended: who won, or a draw (p_draw). The pool is paid (less a tenth) when the
 * players agree: more than half of them say the same, or someone says another player won (a loser
 * owning up, or giving up), or two minutes go by with only one answer said and nobody saying
 * otherwise (the phones ask again until it's settled). A draw gives everyone their stake back.
 * p_winner null and p_draw false: just checking. Returns the winner once paid ({draw: true} for a draw).
 */
drop function if exists public.challenge_report(uuid, bigint, uuid);
create or replace function public.challenge_report(p_user uuid, p_id bigint, p_winner uuid, p_draw boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  v_n int;
  v_w uuid;
  v_votes int;
  v_draws int;
  v_names int;
  v_first timestamptz;
  v_owned boolean;
  v_prize numeric;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if c.status = 'done' then return jsonb_build_object('winner', c.winner_id, 'prize', c.prize); end if;
  if c.status = 'cancelled' then return jsonb_build_object('winner', null, 'draw', true); end if;
  if c.status <> 'playing' then raise exception 'not_playing'; end if;
  if not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_user) then raise exception 'not_in'; end if;
  if p_winner is not null and not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_winner) then raise exception 'bad_winner'; end if;
  if coalesce(p_draw, false) then
    update public.challenge_players set says = null, says_draw = true, said_at = coalesce(said_at, now()) where challenge_id = p_id and user_id = p_user;
  elsif p_winner is not null then
    update public.challenge_players set says = p_winner, says_draw = false, said_at = coalesce(said_at, now()) where challenge_id = p_id and user_id = p_user;
  end if;
  select count(*) into v_n from public.challenge_players where challenge_id = p_id;
  select count(*) into v_draws from public.challenge_players where challenge_id = p_id and says_draw;
  select says, count(*) into v_w, v_votes from public.challenge_players where challenge_id = p_id and says is not null group by says order by count(*) desc limit 1;
  select count(distinct coalesce(says::text, 'draw')), min(said_at) into v_names, v_first
    from public.challenge_players where challenge_id = p_id and (says is not null or says_draw);
  -- A draw: everyone agrees enough (or it's the only answer for two minutes). Stakes back.
  if v_draws > 0 and (v_draws * 2 > v_n or (v_names = 1 and v_first < now() - interval '2 minutes')) then
    perform public.challenge_refund(p_id);
    return jsonb_build_object('winner', null, 'draw', true);
  end if;
  if v_w is null then return jsonb_build_object('winner', null, 'waiting', true); end if;
  v_owned := exists (select 1 from public.challenge_players where challenge_id = p_id and says = v_w and user_id <> v_w);
  if not (v_votes * 2 > v_n or v_owned or (v_names = 1 and v_first < now() - interval '2 minutes')) then
    return jsonb_build_object('winner', null, 'waiting', true);
  end if;
  v_prize := round(c.pool * 0.9, 2);
  if v_prize > 0 then
    update public.profiles set coins = coins + v_prize where id = v_w;
    perform public.log_coins(v_w, null, 'challenge_win', v_prize, false, 'Won a challenge');
    perform public.burn(null, c.pool - v_prize, 'Challenge pools');
  end if;
  update public.challenges set status = 'done', winner_id = v_w, prize = v_prize, finished_at = now() where id = p_id;
  return jsonb_build_object('winner', v_w, 'prize', v_prize);
end $$;

/** Tidy up: open ones whose minute is long gone (started or called off), and games nobody finished in 45 minutes (stakes back). */
create or replace function public.challenge_sweep(p_region text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.challenges where region = p_region and status = 'open' and starts_at < now() - interval '20 seconds' limit 20 loop
    perform public.challenge_begin(r.id);
  end loop;
  -- Finished games whose players all closed the game before it was settled: settle them now.
  for r in select distinct c.id, cp.user_id from public.challenges c join public.challenge_players cp on cp.challenge_id = c.id
           where c.region = p_region and c.status = 'playing' and (cp.says is not null or cp.says_draw) and cp.said_at < now() - interval '2 minutes' limit 20 loop
    perform public.challenge_report(r.user_id, r.id, null, false);
  end loop;
  for r in select id from public.challenges where region = p_region and status = 'playing' and started_at < now() - interval '45 minutes' limit 20 loop
    perform public.challenge_refund(r.id);
  end loop;
end $$;

/**
 * Leave a challenge. Before it starts: your stake back (the host leaving calls it off, and everyone
 * gets theirs back). While it's played: you give up (your stake stays in the pool); if that leaves
 * one player, they win. Returns what happened: 'left', 'cancelled', 'won_by_other', or the status.
 */
create or replace function public.challenge_leave(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  me public.challenge_players;
  v_left uuid;
  r record;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then return 'gone'; end if;
  select * into me from public.challenge_players where challenge_id = p_id and user_id = p_user for update;
  if not found then return 'not_in'; end if;
  if c.status = 'open' then
    if c.host_id = p_user then
      perform public.challenge_refund(p_id);
      for r in select user_id from public.challenge_players where challenge_id = p_id and user_id <> p_user loop
        perform public.notify(r.user_id, null, 'challenge', 'The host called off the challenge. Your stake is back.');
      end loop;
      return 'cancelled';
    end if;
    if me.paid > 0 then
      update public.profiles set coins = coins + me.paid where id = p_user;
      perform public.log_coins(p_user, null, 'challenge_refund', me.paid, false, 'Left a challenge');
      update public.challenges set pool = greatest(0, pool - me.paid) where id = p_id;
    end if;
    delete from public.challenge_players where challenge_id = p_id and user_id = p_user;
    return 'left';
  end if;
  if c.status <> 'playing' then return c.status; end if;
  update public.challenge_players set left_at = coalesce(left_at, now()) where challenge_id = p_id and user_id = p_user;
  -- Only one player still in: they win (you owning up that they did).
  if (select count(*) from public.challenge_players where challenge_id = p_id and left_at is null) = 1 then
    select user_id into v_left from public.challenge_players where challenge_id = p_id and left_at is null;
    perform public.challenge_report(p_user, p_id, v_left, false);
    return 'won_by_other';
  end if;
  return 'left';
end $$;

/** For reputation: challenges you hosted that were played, and challenges you won. */
create or replace function public.challenge_rep(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hosted', (select count(*) from public.challenges where host_id = p_user and status = 'done'),
    'won', (select count(*) from public.challenges where winner_id = p_user and status = 'done'))
$$;

do $$
begin
  revoke all on table public.challenges, public.challenge_players from public, anon, authenticated;
  grant all on table public.challenges, public.challenge_players to service_role;
  revoke all on sequence public.challenges_id_seq from public, anon, authenticated;
  grant all on sequence public.challenges_id_seq to service_role;
  revoke all on function public.challenge_busy(uuid), public.challenge_open(uuid, text, text, numeric, int, int, int, numeric, int),
    public.challenge_join(uuid, bigint), public.challenge_refund(bigint), public.challenge_begin(bigint),
    public.challenge_report(uuid, bigint, uuid, boolean), public.challenge_rep(uuid), public.challenge_sweep(text), public.challenge_leave(uuid, bigint) from public, anon, authenticated;
  grant execute on function public.challenge_busy(uuid), public.challenge_open(uuid, text, text, numeric, int, int, int, numeric, int),
    public.challenge_join(uuid, bigint), public.challenge_refund(bigint), public.challenge_begin(bigint),
    public.challenge_report(uuid, bigint, uuid, boolean), public.challenge_rep(uuid), public.challenge_sweep(text), public.challenge_leave(uuid, bigint) to service_role;
end $$;
