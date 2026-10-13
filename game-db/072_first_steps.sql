-- Newtown, part 72: the first five minutes (docs/FIRST_STEPS.md). Three things to do on day one,
-- each with a small reward, paid once per player: say hi to someone (a private message), play a
-- challenge (start or join one), and pick your home. The game checks each really happened before
-- paying, and only new players (a life started in the last 3 days) are paid. Before this is run
-- the guide still shows; the rewards wait until it is.
--
-- Safe to run more than once.

create table if not exists public.first_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  step text not null check (step in ('hi', 'challenge', 'home')),
  reward numeric(14,2) not null default 0,
  done_at timestamptz not null default now(),
  primary key (user_id, step)
);
alter table public.first_steps enable row level security;

/**
 * Which first steps are done (each checked against what really happened), paying the reward for any
 * newly done. p_reward is mint per step (the server works it out from the city's prices).
 * Returns { hi, challenge, home: done?, paid: [steps paid just now], reward }.
 */
create or replace function public.first_steps_check(p_user uuid, p_reward numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hi boolean;
  v_ch boolean;
  v_home boolean;
  v_paid text[] := '{}';
  v_step text;
  v_reward numeric := round(least(greatest(coalesce(p_reward, 0), 0), 20), 2);
  v_new boolean;
begin
  -- Only new lives (started in the last 3 days) are paid: players who were here before don't get
  -- paid for what they did long ago.
  v_new := exists (select 1 from public.lives where user_id = p_user and started_at > now() - interval '3 days');
  if not v_new then v_reward := 0; end if;
  v_hi := exists (select 1 from public.chat_messages where sender_id = p_user and recipient_id is not null);
  v_ch := to_regclass('public.challenge_players') is not null
    and exists (select 1 from public.challenge_players where user_id = p_user);
  v_home := exists (select 1 from public.lives where user_id = p_user and home_unit is not null);
  foreach v_step in array array['hi', 'challenge', 'home'] loop
    if (v_step = 'hi' and v_hi) or (v_step = 'challenge' and v_ch) or (v_step = 'home' and v_home) then
      insert into public.first_steps (user_id, step, reward) values (p_user, v_step, v_reward) on conflict do nothing;
      if found then
        v_paid := v_paid || v_step;
        if v_reward > 0 then
          update public.profiles set coins = coins + v_reward where id = p_user;
          perform public.log_coins(p_user, null, 'first_step', v_reward, false, 'First steps reward');
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('hi', v_hi, 'challenge', v_ch, 'home', v_home, 'paid', to_jsonb(v_paid), 'reward', v_reward);
end $$;
revoke all on function public.first_steps_check(uuid, numeric) from public, anon, authenticated;
