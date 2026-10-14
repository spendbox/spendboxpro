-- Newtown, part 89: the World Bank counts everything players pay the city, not only games.
--   - Everything spent in the city and burned: fares (rides, trains, work, about town), food,
--     electricity, gym, rent to the city, property and landmarks bought from the city, home
--     improvements, shops, market fees, club entry, pranks, marks, jail bribes, private care and
--     school, side-hustle costs, and game cuts (challenges, sports). Bookkeeping burns that aren't
--     anyone spending (retired bot coins, money of deleted accounts...) are left out.
--   - Every tax and public bill (they went to the state treasuries until now): income tax, VAT,
--     rent, property and sales taxes, waste bills, public clinic and school fees, fines.
--   - Loans: repayments come in, new loans go out (one bank, not two).
--   - Once: what was spent since the World Bank opened (part 84) and not yet counted is added
--     (not counted as "today").
--
-- Run it after 083, 084 and 088. If you ever run one of those again, run this again after it.
-- Safe to run more than once.

/** A burn that is bookkeeping, not someone spending: not counted. */
create or replace function public.world_bank_skips(p_note text) returns boolean
language sql immutable as $$
  select coalesce(p_note, '') in ('linked accounts: no payout', 'seeker share with no seekers', 'bot leftover', 'carry-over retired', 'bot coins retired')
      or coalesce(p_note, '') like 'Sports bet refund (account gone): %'
      or coalesce(p_note, '') like 'Sports winnings (account gone): %'
$$;

/** Money spent in the city (burned) goes into the World Bank. */
create or replace function public.world_bank_take() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'burn' and new.amount > 0 and not public.world_bank_skips(new.note) then
    update public.world_bank set balance = balance + new.amount, updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (new.amount, 'spent', left(coalesce(new.note, 'Spent in the city'), 500));
  end if;
  return new;
end $$;
drop trigger if exists world_bank_take on public.ledger;
create trigger world_bank_take after insert on public.ledger
  for each row when (new.kind = 'burn') execute function public.world_bank_take();

/** Taxes and public bills (into the treasuries), loan repayments and new loans: the World Bank too. */
create or replace function public.world_bank_treasury() returns trigger
language plpgsql security definer set search_path = public as $$
declare v numeric := new.amount;
begin
  if new.kind = 'opening' or v = 0 then return new; end if;
  -- Only the bank's own loans go out of it; nothing else takes from the treasuries.
  if v < 0 and not (new.treasury = 'wb' and new.kind = 'loan_out') then return new; end if;
  update public.world_bank set balance = balance + v, updated_at = now() where id = 1;
  insert into public.world_bank_ledger (amount, kind, note) values (v, left(new.kind, 30), left(coalesce(new.note, new.kind), 500));
  return new;
end $$;
drop trigger if exists world_bank_treasury on public.treasury_ledger;
create trigger world_bank_treasury after insert on public.treasury_ledger
  for each row execute function public.world_bank_treasury();

/** What's in the World Bank, and what came in today (not the opening sum, the catch-up or loans going out). */
create or replace function public.world_bank_view() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.world_bank where id = 1), 0),
    'today', coalesce((select sum(amount) from public.world_bank_ledger
                       where amount > 0 and kind not in ('opening', 'catch_up')
                         and created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos')), 0)
  )
$$;

-- ============================================================ once: catch up since the opening
do $$
declare
  v_since timestamptz := (select min(created_at) from public.world_bank_ledger where kind = 'opening');
  v_should numeric;
  v_got numeric;
begin
  if v_since is null or exists (select 1 from public.world_bank_ledger where kind = 'catch_up') then return; end if;
  v_should := coalesce((select sum(amount) from public.ledger where kind = 'burn' and amount > 0 and created_at >= v_since and not public.world_bank_skips(note)), 0)
            + coalesce((select sum(amount) from public.treasury_ledger where created_at >= v_since and kind <> 'opening'
                          and (amount > 0 or (treasury = 'wb' and kind = 'loan_out'))), 0);
  v_got := coalesce((select sum(amount) from public.world_bank_ledger where created_at >= v_since and kind not in ('opening', 'catch_up')), 0);
  if v_should - v_got <> 0 then
    update public.world_bank set balance = balance + (v_should - v_got), updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (v_should - v_got, 'catch_up', 'Spending since the World Bank opened, counted at last');
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.world_bank_skips(text)', 'public.world_bank_take()', 'public.world_bank_treasury()', 'public.world_bank_view()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
