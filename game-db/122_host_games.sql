-- Newtown, part 122: hosting a game (the Play button, docs/CHALLENGES.md "Play: host a game").
-- Anyone can host one of the table games (Whot!, chess, draughts, paintball, Truth or Dare,
-- Impostor) right where they are, now. Hosting always costs a fee (₦20,000 for a two-player game,
-- ₦100,000 for one with more players; the game sends it in mint), paid from Fun money, then the
-- wallet, and burned. Everyone nearby is told and the spot lights up; there are a few minutes to
-- join. Players who come late can get in line for the next game (challenge_next): when the host
-- (or anyone) hosts the next one there, they're told first.
--
-- Safe to run more than once. Run after part 121.

/**
 * Host a game now. p_fee: the hosting fee (mint, always paid; the stake is paid into the pool as
 * in challenge_open). p_secs: how long others have to join (60 to 600 seconds). Errors as
 * challenge_open.
 */
create or replace function public.challenge_host(p_user uuid, p_region text, p_game text, p_stake numeric, p_x int, p_z int, p_seats int, p_fee numeric, p_secs int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_fee numeric := round(least(5000, greatest(0, coalesce(p_fee, 0))), 2);
  v_stake numeric := round(least(10000, greatest(0, coalesce(p_stake, 0))), 2);
  v_id bigint;
  v_seed bigint := floor(random() * 2000000000)::bigint;
  v_starts timestamptz := now() + make_interval(secs => greatest(60, least(600, coalesce(p_secs, 180))));
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if public.challenge_busy(p_user) is not null then raise exception 'busy'; end if;
  if public.life_can_spend(p_user, array['fun']) < v_fee + v_stake then raise exception 'not_enough:%', trim_scale(v_fee + v_stake); end if;
  if v_fee > 0 then
    perform public.life_spend(p_user, array['fun'], v_fee);
    perform public.log_coins(p_user, null, 'game_host', -v_fee, false, 'Hosting a game');
    perform public.burn(null, v_fee, 'Hosting games');
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

-- In line for the next game: someone who came while a game was on (or full) and wants in next.
create table if not exists public.challenge_next (
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists challenge_next_user_idx on public.challenge_next (user_id, at desc);

/** Get in line for the next game after this one (or out of line, p_on false). Returns the line's length. */
create or replace function public.challenge_queue(p_user uuid, p_id bigint, p_on boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare c public.challenges;
begin
  select * into c from public.challenges where id = p_id;
  if not found then raise exception 'gone'; end if;
  if p_on then
    if c.status not in ('open', 'playing') then raise exception 'gone'; end if;
    if exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_user and left_at is null) then raise exception 'already_in'; end if;
    if (select count(*) from public.challenge_next where challenge_id = p_id) >= 12 then raise exception 'full'; end if;
    insert into public.challenge_next (challenge_id, user_id) values (p_id, p_user) on conflict do nothing;
  else
    delete from public.challenge_next where challenge_id = p_id and user_id = p_user;
  end if;
  return (select count(*)::int from public.challenge_next where challenge_id = p_id);
end $$;

do $$
begin
  revoke all on table public.challenge_next from public, anon, authenticated;
  grant all on table public.challenge_next to service_role;
  revoke all on function public.challenge_host(uuid, text, text, numeric, int, int, int, numeric, int), public.challenge_queue(uuid, bigint, boolean) from public, anon, authenticated;
  grant execute on function public.challenge_host(uuid, text, text, numeric, int, int, int, numeric, int), public.challenge_queue(uuid, bigint, boolean) to service_role;
end $$;
