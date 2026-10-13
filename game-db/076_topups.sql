-- Newtown, part 76: top-ups (docs/MONEY.md, "Top-ups"). Buy game money any time through Paystack:
-- ₦1,000 of real money is ₦1,000,000 in the game, bigger top-ups carry a bonus, and your first
-- top-up is doubled. The money only arrives once Paystack itself says the payment went through
-- (when the player comes back, or from the webhook, whichever is first), and only once. Game money
-- is never turned back into real money.
--
-- Safe to run more than once.

create table if not exists public.topups (
  reference text primary key check (reference ~ '^tu-[a-f0-9]{20}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  option text not null check (option ~ '^[a-z0-9_]{1,20}$'),
  mint numeric(14,2) not null check (mint > 0),
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  doubled boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists topups_user_idx on public.topups (user_id, created_at desc);
alter table public.topups enable row level security;

/** A top-up payment started (p_mint: what it buys, worked out by the server). */
create or replace function public.topup_start(p_user uuid, p_reference text, p_region text, p_option text, p_mint numeric, p_kobo bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_user and not is_bot and not frozen) then raise exception 'unknown_player'; end if;
  if coalesce(p_mint, 0) <= 0 or p_mint > 1000000 then raise exception 'bad_amount'; end if;
  insert into public.topups (reference, user_id, region, option, mint, amount_kobo) values (p_reference, p_user, p_region, p_option, p_mint, p_kobo);
end $$;

/**
 * Paystack confirmed a top-up (p_kobo: what was actually paid). Once only: the money arrives, doubled
 * if it's the player's first top-up. Returns { found, new, mint, doubled }.
 */
create or replace function public.topup_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.topups;
  v_first boolean;
  v_add numeric;
begin
  select * into t from public.topups where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if t.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'mint', t.mint * case when t.doubled then 2 else 1 end, 'doubled', t.doubled); end if;
  if coalesce(p_kobo, 0) < t.amount_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  perform 1 from public.profiles where id = t.user_id for update;
  v_first := not exists (select 1 from public.topups where user_id = t.user_id and status = 'paid');
  v_add := t.mint * case when v_first then 2 else 1 end;
  update public.topups set status = 'paid', paid_at = now(), doubled = v_first where reference = p_reference;
  update public.profiles set coins = coins + v_add where id = t.user_id;
  perform public.log_coins(t.user_id, null, 'topup', v_add, false, 'Top-up' || case when v_first then ' (first one, doubled)' else '' end);
  return jsonb_build_object('found', true, 'new', true, 'mint', v_add, 'doubled', v_first);
end $$;

do $$
declare f text;
begin
  revoke all on table public.topups from public, anon, authenticated;
  grant all on table public.topups to service_role;
  foreach f in array array['public.topup_start(uuid, text, text, text, numeric, bigint)', 'public.topup_paid(text, bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
