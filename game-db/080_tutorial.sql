-- Newtown, part 80: the walkthrough's steps and rewards (docs/FIRST_STEPS.md), for everyone, old
-- players too, once each:
--   name : give your home a name            (₦20,000)
--   hi   : say hi to someone in a private chat (₦50,000)
--   win  : win a challenge against someone    (₦50,000)
-- Each counts only if done after the player's walkthrough started (so everyone is shown how,
-- even if they did it long ago). The server works out the rewards in mint; each is capped here.
--
-- Safe to run more than once.

-- Free rooms (part 74): the column this reads, in case 74 hasn't been run.
alter table public.property_units add column if not exists starter boolean not null default false;

alter table public.lives add column if not exists tutorial_at timestamptz;
alter table public.lives add column if not exists home_named_at timestamptz;

create table if not exists public.tutorial_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  step text not null check (step in ('name', 'hi', 'win')),
  reward numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, step)
);
alter table public.tutorial_steps enable row level security;

-- Naming your home (part 78) stamps lives.home_named_at; the same function again here, so it
-- works whichever of the two is run last.
/** Name a home you hold (an empty name puts back what it was called: "Room", "Flat"...). */
create or replace function public.home_rename(p_user uuid, p_unit text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  update public.property_units set label = coalesce(v_name, case when starter then 'Room' else 'Home' end)
  where unit_id = p_unit and owner_id = p_user and use = 'home';
  if not found then raise exception 'not_yours'; end if;
  -- The walkthrough's first step (part 80).
  if v_name is not null then update public.lives set home_named_at = now() where user_id = p_user; end if;
end $$;
/**
 * Which steps are done, paying each newly done one once. p_rewards: { name, hi, win } in mint.
 * Starts the walkthrough's clock the first time it's asked. Returns
 * { name, hi, win, paid: [...], rewards: { name, hi, win } }.
 */
create or replace function public.tutorial_check(p_user uuid, p_rewards jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_since timestamptz;
  v_done jsonb;
  v_paid text[] := '{}';
  v_step text;
  v_reward numeric;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return null; end if;
  v_since := coalesce(l.tutorial_at, now());
  if l.tutorial_at is null then update public.lives set tutorial_at = v_since where user_id = p_user; end if;
  v_done := jsonb_build_object(
    'name', l.home_named_at is not null and l.home_named_at >= v_since,
    'hi', exists (select 1 from public.chat_messages where sender_id = p_user and recipient_id is not null and created_at >= v_since),
    'win', to_regclass('public.challenges') is not null and exists (
      select 1 from public.challenges c
      where c.winner_id = p_user and c.status = 'done' and coalesce(c.finished_at, c.created_at) >= v_since
        and (select count(*) from public.challenge_players cp where cp.challenge_id = c.id) >= 2)
  );
  foreach v_step in array array['name', 'hi', 'win'] loop
    if (v_done ->> v_step)::boolean then
      v_reward := round(least(greatest(coalesce((p_rewards ->> v_step)::numeric, 0), 0), 40), 2);
      insert into public.tutorial_steps (user_id, step, reward) values (p_user, v_step, v_reward) on conflict do nothing;
      if found then
        v_paid := v_paid || v_step;
        if v_reward > 0 then
          update public.profiles set coins = coins + v_reward where id = p_user;
          perform public.log_coins(p_user, null, 'tutorial', v_reward, false, 'Walkthrough reward: ' || v_step);
        end if;
      end if;
    end if;
  end loop;
  -- Done once counts for good (even if, say, the home is renamed back later).
  return jsonb_build_object(
    'name', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'name'),
    'hi', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'hi'),
    'win', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'win'),
    'paid', to_jsonb(v_paid)
  );
end $$;

revoke all on function public.home_rename(uuid, text, text), public.tutorial_check(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.home_rename(uuid, text, text), public.tutorial_check(uuid, jsonb) to service_role;
