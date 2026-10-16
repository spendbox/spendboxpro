-- Newtown, part 115: careers (docs/LIFE_WHEEL.md, phase 5). Start a business (a suya spot, a buka, a
-- POS kiosk, a tech startup...) and grow it from Idea to Empire, or watch it fail
-- (src/lib/world/ventures.ts). The game runs its days and its moments; this keeps the books:
--
--   - each business: what it is, its numbers (kept as one piece the game reads and writes), when its
--     days were last counted, when its last moment came, and when it closed (one open at a time);
--   - starting one is paid from your wallet (it goes to the World Bank, like anything bought from
--     the city); what it earns you is paid into your wallet as 'business_income'.
--
-- Safe to run more than once. Run after part 114.

create table if not exists public.ventures (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (char_length(kind) <= 20),
  name text not null check (char_length(name) between 1 and 40),
  -- Its numbers: stage, cash, customers, quality, mood, risk, staff, share, best, paid, days.
  state jsonb not null,
  started_at timestamptz not null default now(),
  settled_at timestamptz not null default now(),
  last_moment_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists ventures_one_open on public.ventures (user_id) where closed_at is null;
create index if not exists ventures_user_idx on public.ventures (user_id, started_at desc);

do $$
begin
  revoke all on table public.ventures from public, anon, authenticated;
  grant all on table public.ventures to service_role;
  revoke all on sequence public.ventures_id_seq from public, anon, authenticated;
  grant all on sequence public.ventures_id_seq to service_role;
end $$;

/**
 * Start a business: p_cost (mint) from your wallet, gone to the World Bank. Errors: has_one (you run
 * one already), not_enough. Returns its id.
 */
create or replace function public.venture_start(p_user uuid, p_kind text, p_name text, p_cost numeric, p_state jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_cost numeric := round(greatest(coalesce(p_cost, 0), 0), 2);
begin
  perform 1 from public.profiles where id = p_user for update;
  if exists (select 1 from public.ventures where user_id = p_user and closed_at is null) then raise exception 'has_one'; end if;
  if public.life_can_spend(p_user, '{}'::text[]) < v_cost then raise exception 'not_enough'; end if;
  perform public.life_spend(p_user, '{}'::text[], v_cost);
  perform public.log_coins(p_user, null, 'business_start', -v_cost, false, left('Started ' || coalesce(p_name, 'a business'), 200));
  perform public.burn(null, v_cost, 'Starting a business');
  insert into public.ventures (user_id, kind, name, state) values (p_user, left(p_kind, 20), left(btrim(p_name), 40), coalesce(p_state, '{}'::jsonb))
    returning id into v_id;
  return v_id;
end $$;

/**
 * Save a business after its days were counted or a moment changed it: only if nobody else saved it
 * since p_was (when its days were last counted), else error 'busy'. p_pay (mint): what it paid you,
 * into your wallet. p_settled: counted up to then. p_moment: a moment just came. p_close: it closes.
 * Returns your coins after.
 */
create or replace function public.venture_save(p_user uuid, p_id bigint, p_was timestamptz, p_state jsonb, p_pay numeric, p_settled timestamptz, p_moment boolean, p_close boolean)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_pay numeric := round(greatest(coalesce(p_pay, 0), 0), 2);
begin
  update public.ventures
    set state = p_state,
        settled_at = coalesce(p_settled, settled_at),
        last_moment_at = case when p_moment then now() else last_moment_at end,
        closed_at = case when p_close then now() else closed_at end
    where id = p_id and user_id = p_user and closed_at is null and settled_at = p_was;
  if not found then raise exception 'busy'; end if;
  if v_pay > 0 then
    update public.profiles set coins = coins + v_pay where id = p_user;
    perform public.log_coins(p_user, null, 'business_income', v_pay, false, 'What your business earned');
  end if;
  return (select coins from public.profiles where id = p_user);
end $$;

do $$
begin
  revoke all on function public.venture_start(uuid, text, text, numeric, jsonb) from public, anon, authenticated;
  grant execute on function public.venture_start(uuid, text, text, numeric, jsonb) to service_role;
  revoke all on function public.venture_save(uuid, bigint, timestamptz, jsonb, numeric, timestamptz, boolean, boolean) from public, anon, authenticated;
  grant execute on function public.venture_save(uuid, bigint, timestamptz, jsonb, numeric, timestamptz, boolean, boolean) to service_role;
end $$;
