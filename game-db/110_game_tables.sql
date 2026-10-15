-- Newtown, part 110: game tables (docs/GAME_TABLES.md). Challenge one person to a game (Whot! first),
-- for a stake: they get an invitation to accept or decline. Anyone nearby can still join before it
-- starts, and anyone can watch. The host can start as soon as two are in. Built on the challenges of
-- part 70 (the pool, the stakes, the winner's prize and every safety rail stay the same).
--
-- Safe to run more than once. Run after part 109.

-- The person a challenge is for (null: everyone nearby, as before).
alter table public.challenges add column if not exists invited uuid references public.profiles (id) on delete set null;
create index if not exists challenges_invited_idx on public.challenges (invited, status);

/**
 * Challenge one player (p_target) to a game for a stake. No fee (it's between the two of you).
 * They have three minutes to answer. Errors: as challenge_open, plus self, target_busy, blocked,
 * unknown_target.
 */
create or replace function public.challenge_invite(p_user uuid, p_target uuid, p_region text, p_game text, p_stake numeric, p_x int, p_z int, p_seats int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  t public.profiles;
  v_stake numeric := round(least(10000, greatest(0, coalesce(p_stake, 0))), 2);
  v_id bigint;
  v_seed bigint := floor(random() * 2000000000)::bigint;
  v_starts timestamptz := now() + interval '180 seconds';
begin
  if p_target is null or p_target = p_user then raise exception 'self'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into t from public.profiles where id = p_target;
  if not found or t.is_bot or t.username is null then raise exception 'unknown_target'; end if;
  if t.frozen or t.age_blocked_at is not null then raise exception 'unknown_target'; end if;
  if public.has_blocked(p_target, p_user) or public.has_blocked(p_user, p_target) then raise exception 'blocked'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if public.challenge_busy(p_user) is not null then raise exception 'busy'; end if;
  if public.challenge_busy(p_target) is not null then raise exception 'target_busy'; end if;
  if public.life_can_spend(p_user, array['fun']) < v_stake then raise exception 'not_enough:%', trim_scale(v_stake); end if;
  if v_stake > 0 then
    perform public.life_spend(p_user, array['fun'], v_stake);
    perform public.log_coins(p_user, null, 'challenge_stake', -v_stake, false, 'Challenge stake');
  end if;
  insert into public.challenges (host_id, region, game, stake, fee, x, z, seats, seed, pool, starts_at, invited)
    values (p_user, p_region, p_game, v_stake, 0, p_x, p_z, greatest(2, least(6, coalesce(p_seats, 4))), v_seed, v_stake, v_starts, p_target)
    returning id into v_id;
  insert into public.challenge_players (challenge_id, user_id, paid) values (v_id, p_user, v_stake);
  perform public.notify(p_target, null, 'challenge', coalesce(p.username, 'Someone') || ' challenged you to a game! Open the game to accept.');
  return jsonb_build_object('id', v_id, 'seed', v_seed, 'starts_at', v_starts);
end $$;

/**
 * Accept (or join) a challenge: pay the stake in. When the invited player accepts, the game starts
 * 15 seconds later (time for anyone else nearby to hop in), unless the host starts it sooner.
 */
create or replace function public.challenge_accept(p_user uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  v := public.challenge_join(p_user, p_id);
  update public.challenges set starts_at = least(starts_at, now() + interval '15 seconds')
    where id = p_id and invited = p_user and status = 'open';
  return v;
end $$;

/** The invited player says no: if nobody else has joined, it's called off and the host's stake goes back. */
create or replace function public.challenge_decline(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  v_name text;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found or c.invited is distinct from p_user or c.status <> 'open' then return 'gone'; end if;
  select username into v_name from public.profiles where id = p_user;
  update public.challenges set invited = null where id = p_id;
  if (select count(*) from public.challenge_players where challenge_id = p_id) < 2 then
    perform public.challenge_refund(p_id);
    perform public.notify(c.host_id, null, 'challenge', coalesce(v_name, 'They') || ' can''t play right now. Your stake is back.');
    return 'cancelled';
  end if;
  return 'declined';
end $$;

/** The host starts it now (two or more players in). Returns the status. */
create or replace function public.challenge_start_now(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then return 'gone'; end if;
  if c.host_id <> p_user then raise exception 'not_host'; end if;
  if c.status <> 'open' then return c.status; end if;
  if (select count(*) from public.challenge_players where challenge_id = p_id) < 2 then raise exception 'need_players'; end if;
  update public.challenges set starts_at = now() where id = p_id;
  return public.challenge_begin(p_id);
end $$;

do $$
begin
  revoke all on function public.challenge_invite(uuid, uuid, text, text, numeric, int, int, int) from public, anon, authenticated;
  grant execute on function public.challenge_invite(uuid, uuid, text, text, numeric, int, int, int) to service_role;
  revoke all on function public.challenge_accept(uuid, bigint) from public, anon, authenticated;
  grant execute on function public.challenge_accept(uuid, bigint) to service_role;
  revoke all on function public.challenge_decline(uuid, bigint) from public, anon, authenticated;
  grant execute on function public.challenge_decline(uuid, bigint) to service_role;
  revoke all on function public.challenge_start_now(uuid, bigint) from public, anon, authenticated;
  grant execute on function public.challenge_start_now(uuid, bigint) to service_role;
end $$;
