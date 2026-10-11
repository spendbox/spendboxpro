-- Newtown, part 42: starter packs. A life can start free (start_grant) or with a pack bought once
-- through Paystack before the first home (src/lib/world/packs.ts). The game starts the payment and,
-- once Paystack confirms it, calls life_pack_paid: the pack's mint arrives (or, if the life already
-- started free, the difference). Mint is never turned back into cash. See docs/PACKS.md.
--
-- Safe to run more than once. Run after parts 1-41.

create table if not exists public.starter_payments (
  reference text primary key check (reference ~ '^pk-[a-z0-9-]{8,60}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  pack text not null check (pack ~ '^[a-z_]{2,20}$'),
  mint numeric(14,2) not null check (mint > 0),
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists starter_payments_user_idx on public.starter_payments (user_id);

/** A pack payment started (once a life has a home, packs are no longer offered). */
create or replace function public.life_pack_start(p_user uuid, p_reference text, p_region text, p_pack text, p_mint numeric, p_kobo bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.lives where user_id = p_user and home_unit is not null) then raise exception 'too_late'; end if;
  if exists (select 1 from public.starter_payments where user_id = p_user and status = 'paid') then raise exception 'already'; end if;
  insert into public.starter_payments (reference, user_id, region, pack, mint, amount_kobo) values (p_reference, p_user, p_region, p_pack, p_mint, p_kobo);
end $$;

/**
 * Paystack confirmed a pack (p_kobo: what was actually paid). Once only: starts the life with the
 * pack's mint, or tops up a life already started free to the pack's amount.
 */
create or replace function public.life_pack_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sp public.starter_payments;
  l public.lives;
  v_add numeric;
begin
  select * into sp from public.starter_payments where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if sp.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'mint', sp.mint); end if;
  if coalesce(p_kobo, 0) < sp.amount_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  update public.starter_payments set status = 'paid', paid_at = now() where reference = p_reference;
  perform 1 from public.profiles where id = sp.user_id for update;
  select * into l from public.lives where user_id = sp.user_id for update;
  if not found then
    insert into public.lives (user_id, region, granted) values (sp.user_id, sp.region, sp.mint);
    v_add := sp.mint;
  else
    v_add := greatest(0, sp.mint - l.granted);
    update public.lives set granted = greatest(granted, sp.mint) where user_id = sp.user_id;
  end if;
  if v_add > 0 then
    update public.profiles set coins = coins + v_add where id = sp.user_id;
    perform public.log_coins(sp.user_id, null, 'start_grant', v_add, false, 'Starter pack: ' || sp.pack);
  end if;
  return jsonb_build_object('found', true, 'new', true, 'mint', sp.mint, 'added', v_add);
end $$;

do $$
begin
  revoke all on table public.starter_payments from public, anon, authenticated;
  grant all on table public.starter_payments to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array['public.life_pack_start(uuid, text, text, text, numeric, bigint)', 'public.life_pack_paid(text, bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
