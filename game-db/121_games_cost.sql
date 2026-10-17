-- Newtown, part 121: games cost money to play, and never pay money out (src/lib/fees.ts,
-- gameFeeMint). Every go at a game (Games, the shooting range, paintball, chess or draughts
-- against someone) is paid from your Fun money, then savings, then essentials, and burned like
-- other spending. A heist step or a job shift stays free (the game never asks for those).
-- The old room games' rewards for good scores (part 19) now pay nothing. (Part 36's reward stays,
-- for the tip after a good job shift: that's work, not a game.)
--
-- Safe to run more than once. Run after part 120.

insert into public.game_settings (key, value, note) values
  ('game_fee_max', 20, 'Most one go at a game can cost (mint, a sanity check: the shooting range is about 3.3)')
on conflict (key) do update set note = excluded.note;

/** Pay for one go at a game. Returns what was paid. */
create or replace function public.life_play_game(p_user uuid, p_game text, p_fee numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric := round(least(public.setting('game_fee_max'), greatest(0, coalesce(p_fee, 0))), 2);
  v_paid numeric := 0;
  p public.profiles;
begin
  if p_game is null or p_game !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_game'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_fee > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings', 'essentials']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    v_paid := public.life_spend(p_user, array['fun', 'savings', 'essentials'], v_fee);
    perform public.log_coins(p_user, null, 'game_fee', -v_paid, false, 'Played: ' || p_game);
    perform public.burn(null, v_paid, 'Games');
  end if;
  return v_paid;
end $$;

-- Good scores at the room games no longer pay.
create or replace function public.claim_activity_reward(p_user uuid, p_game text, p_score numeric) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('coins', 0, 'reason', 'daily_limit', 'left_today', 0);
$$;

do $$
begin
  revoke all on function public.life_play_game(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_play_game(uuid, text, numeric) to service_role;
  revoke all on function public.claim_activity_reward(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.claim_activity_reward(uuid, text, numeric) to service_role;
end $$;
