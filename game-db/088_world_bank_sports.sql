-- Newtown, part 88: the World Bank counts every game's cut, not only challenges.
--   Before this, only challenges paid in (the 10% of each pot, and the fee for hosting too often).
--   The sports house cut (what bets don't pay back) and match tickets were burned without reaching
--   the World Bank, or, while an old hide-and-seek round was open, went into that round's prize pool.
--   Now sports money always goes to the city, and the World Bank counts it, from now on.
--
-- Run it after 083 and 084. Safe to run more than once.

/** Mint a player has already paid goes into this game's prize pool, or is burned. Sports money always goes to the city (the World Bank). */
create or replace function public.pool_or_burn(p_round bigint, p_amount numeric, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_round bigint;
begin
  if coalesce(p_amount, 0) <= 0 then return null; end if;
  if p_round is not null and coalesce(p_note, '') not like 'Sports %' then
    update public.rounds set pool = pool + p_amount where id = p_round and status in ('join', 'seek')
      returning id into v_round;
  end if;
  if v_round is null then
    perform public.burn(p_round, p_amount, p_note);
    return null;
  end if;
  perform public.log_coins(null, v_round, 'pool_fee', p_amount, false, p_note);
  return v_round;
end $$;

/** Money a game pays the city goes into the World Bank: challenges (pot cut and hosting fee) and sports (house cut and tickets). */
create or replace function public.world_bank_take() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric := 0;
begin
  if new.kind = 'burn' and (new.note = 'Challenge pools' or new.note like 'Sports house cut: %' or new.note like 'Sports ticket: %') then v_amount := new.amount;
  elsif new.kind = 'challenge_fee' and new.amount < 0 then v_amount := -new.amount;
  end if;
  if v_amount > 0 then
    update public.world_bank set balance = balance + v_amount, updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (v_amount, new.kind, new.note);
  end if;
  return new;
end $$;

do $$
begin
  revoke all on function public.pool_or_burn(bigint, numeric, text), public.world_bank_take() from public, anon, authenticated;
  grant execute on function public.pool_or_burn(bigint, numeric, text), public.world_bank_take() to service_role;
end $$;
