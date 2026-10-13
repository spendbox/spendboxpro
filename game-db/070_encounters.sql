-- Newtown, part 70: encounters out on the street (docs/ENCOUNTERS.md). Walking round, or on a
-- keke, okada or danfo, things happen: a hawker, an agbero, a checkpoint, money on the ground. The
-- game's server rolls what happens; this keeps the money honest: a little from your Fun money then
-- your wallet when it costs, a little (capped a day) when you're lucky, and not too often.
--
-- Safe to run more than once. Run after part 69.

create table if not exists public.encounter_log (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  encounter text not null check (encounter ~ '^[a-z_]{2,30}$'),
  choice int not null check (choice between 0 and 5),
  mint numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists encounter_log_user_idx on public.encounter_log (user_id, created_at desc);

/**
 * How an encounter came out: p_mint (less than 0 you pay, more than 0 you win). At most p_day_cap
 * encounters a day, one every 40 seconds, and winnings at most p_win_cap a day. Returns the mint
 * that really moved (you pay what you can; winnings stop at the cap).
 */
create or replace function public.life_encounter(p_user uuid, p_encounter text, p_choice int, p_mint numeric, p_note text, p_win_cap numeric, p_day_cap int)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_last timestamptz;
  v_won numeric;
  v_move numeric := 0;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if (select count(*) from public.encounter_log where user_id = p_user and created_at > now() - interval '24 hours') >= coalesce(p_day_cap, 20) then
    raise exception 'too_many';
  end if;
  select max(created_at) into v_last from public.encounter_log where user_id = p_user;
  if v_last is not null and v_last > now() - interval '40 seconds' then raise exception 'too_soon'; end if;
  if coalesce(p_mint, 0) < 0 then
    v_move := -public.life_spend(p_user, array['fun'], least(50, -p_mint));
    if v_move < 0 then
      perform public.log_coins(p_user, null, 'encounter', v_move, false, left(coalesce(p_note, 'On the street'), 80));
      perform public.burn(null, -v_move, 'Street encounters');
    end if;
  elsif coalesce(p_mint, 0) > 0 then
    select coalesce(sum(mint), 0) into v_won from public.encounter_log where user_id = p_user and mint > 0 and created_at > now() - interval '24 hours';
    v_move := round(greatest(0, least(p_mint, 20, coalesce(p_win_cap, 10) - v_won)), 2);
    if v_move > 0 then
      update public.profiles set coins = coins + v_move where id = p_user;
      perform public.log_coins(p_user, null, 'encounter', v_move, false, left(coalesce(p_note, 'On the street'), 80));
    end if;
  end if;
  insert into public.encounter_log (user_id, encounter, choice, mint) values (p_user, p_encounter, p_choice, v_move);
  return v_move;
end $$;

do $$
begin
  revoke all on table public.encounter_log from public, anon, authenticated;
  grant all on table public.encounter_log to service_role;
  revoke all on function public.life_encounter(uuid, text, int, numeric, text, numeric, int) from public, anon, authenticated;
  grant execute on function public.life_encounter(uuid, text, int, numeric, text, numeric, int) to service_role;
end $$;
