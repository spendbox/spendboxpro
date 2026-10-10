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
