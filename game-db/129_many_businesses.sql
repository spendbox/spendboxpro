-- Newtown, part 129: run more than one business at once (src/lib/world/ventures.ts, MAX_VENTURES).
--
-- Part 115 let each player run one business at a time. Now it's up to 5 at once: each is paid for
-- when it's started, earns (or loses) on its own, and is closed on its own. Starting a sixth is
-- refused ('too_many'); the game says to close one first.
--
-- Safe to run more than once. Run after part 115 (and before 128, or run 128 again after it).

drop index if exists public.ventures_one_open;
create index if not exists ventures_open_idx on public.ventures (user_id) where closed_at is null;

/**
 * Start a business: p_cost (mint) from your wallet, gone to the World Bank. Errors: too_many (you
 * run 5 already), not_enough. Returns its id.
 */
create or replace function public.venture_start(p_user uuid, p_kind text, p_name text, p_cost numeric, p_state jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_cost numeric := round(greatest(coalesce(p_cost, 0), 0), 2);
begin
  perform 1 from public.profiles where id = p_user for update;
  if (select count(*) from public.ventures where user_id = p_user and closed_at is null) >= 5 then raise exception 'too_many'; end if;
  if public.life_can_spend(p_user, '{}'::text[]) < v_cost then raise exception 'not_enough'; end if;
  perform public.life_spend(p_user, '{}'::text[], v_cost);
  perform public.log_coins(p_user, null, 'business_start', -v_cost, false, left('Started ' || coalesce(p_name, 'a business'), 200));
  perform public.burn(null, v_cost, 'Starting a business');
  insert into public.ventures (user_id, kind, name, state) values (p_user, left(p_kind, 20), left(btrim(p_name), 40), coalesce(p_state, '{}'::jsonb))
    returning id into v_id;
  return v_id;
end $$;

do $$
begin
  revoke all on function public.venture_start(uuid, text, text, numeric, jsonb) from public, anon, authenticated;
  grant execute on function public.venture_start(uuid, text, text, numeric, jsonb) to service_role;
end $$;
