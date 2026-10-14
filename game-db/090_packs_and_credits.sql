-- Newtown, part 90: starting money, starter packs paid like top-ups, and the owner crediting players.
--   1. A new life starts with ₦2,000,000 (1,333.33 mint at ₦1,500 a mint) and a free home.
--   2. Starter packs raise your starting money to ₦20m, ₦80m or ₦300m (₦1,000, ₦2,500, ₦5,000),
--      once, until you buy a home of your own. They're paid through the top-up machinery (part 76):
--      the pop-up, bank transfer, the webhook, the page Paystack sends you back to, the Wallet's
--      "Your payments" and the daily check all confirm them, and whichever is first credits it,
--      once. Anyone who paid is always credited, even for a second pack bought in another tab.
--   3. The owner's dashboard can credit Newtown money to a player by hand (every credit recorded).
--
-- Run it after 076 (top-ups) and 042 (starter packs). Safe to run more than once.

-- ============================================================ 1. ₦2,000,000 to start
update public.game_settings set value = 1333.33, note = 'Mint to start a life on the real map with (once): ₦2,000,000 in Lagos, with a free home'
  where key = 'start_grant';

-- ============================================================ 2. starter packs, paid like top-ups
-- A pack's top-up row remembers the pack and the starting money it brings (in mint).
alter table public.topups add column if not exists pack text check (pack is null or pack ~ '^[a-z_]{2,20}$');
alter table public.topups add column if not exists pack_total numeric(14,2);

/** Has this player had a starter pack (old way or new)? */
create or replace function public.pack_had(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.starter_payments where user_id = p_user and status = 'paid')
      or exists (select 1 from public.topups where user_id = p_user and pack is not null and status = 'paid')
$$;

/** Can this player still buy a pack? 'open', 'had' (one already) or 'too_late' (bought a home of their own). */
create or replace function public.pack_status(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.pack_had(p_user) then 'had'
    when exists (select 1 from public.property_units where owner_id = p_user and not starter) then 'too_late'
    else 'open' end
$$;

/** What a pack adds for this player: its total less what their life started with (all of it before a life). */
create or replace function public.pack_adds(p_user uuid, p_total numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select round(greatest(0, p_total - coalesce(
           (select least(granted, public.setting('start_grant')) from public.lives where user_id = p_user), 0)), 2)
$$;

/** A starter pack payment started (p_total: the starting money it brings, mint, worked out by the server). */
create or replace function public.pack_topup_start(p_user uuid, p_reference text, p_region text, p_pack text, p_total numeric, p_kobo bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not exists (select 1 from public.profiles where id = p_user and not is_bot and not frozen) then raise exception 'unknown_player'; end if;
  if coalesce(p_total, 0) <= 0 or p_total > 1000000 then raise exception 'bad_amount'; end if;
  v_status := public.pack_status(p_user);
  if v_status <> 'open' then raise exception '%', v_status; end if;
  insert into public.topups (reference, user_id, region, option, mint, amount_kobo, pack, pack_total)
    values (p_reference, p_user, p_region, 'pack_' || p_pack, greatest(0.01, public.pack_adds(p_user, p_total)), p_kobo, p_pack, p_total);
end $$;

/**
 * Paystack confirmed a top-up or a pack (p_kobo: what was actually paid). Once only. A top-up: its
 * money, doubled if it's the player's first top-up (packs don't count). A pack: the starting money
 * goes up to the pack's total (a second pack, paid in another tab, is added in full: paid is paid),
 * and its gifts follow (starter_payments, as before).
 */
create or replace function public.topup_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.topups;
  v_first boolean;
  v_add numeric;
  v_had boolean;
begin
  select * into t from public.topups where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if t.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'mint', t.mint * case when t.doubled then 2 else 1 end, 'doubled', t.doubled, 'pack', t.pack); end if;
  if coalesce(p_kobo, 0) < t.amount_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  perform 1 from public.profiles where id = t.user_id for update;
  if t.pack is not null then
    v_had := public.pack_had(t.user_id);
    v_add := case when v_had then round(greatest(0.01, t.pack_total - public.setting('start_grant')), 2) else greatest(0.01, public.pack_adds(t.user_id, t.pack_total)) end;
    update public.topups set status = 'paid', paid_at = now(), mint = v_add where reference = p_reference;
    -- No life yet (paid before pressing Start): it starts now, with the pack's money.
    insert into public.lives (user_id, region, granted) values (t.user_id, t.region, t.pack_total)
      on conflict (user_id) do update set granted = greatest(public.lives.granted, excluded.granted);
    update public.profiles set coins = coins + v_add where id = t.user_id;
    perform public.log_coins(t.user_id, null, 'start_grant', v_add, false, 'Starter pack: ' || t.pack);
    -- The pack's gifts, badge and furnished home (src/app/play/pack-actions.ts) and the news read this.
    insert into public.starter_payments (reference, user_id, region, pack, mint, amount_kobo, status, paid_at)
      values ('pk-' || substr(t.reference, 4), t.user_id, t.region, t.pack, t.pack_total, t.amount_kobo, 'paid', now())
      on conflict (reference) do nothing;
    return jsonb_build_object('found', true, 'new', true, 'mint', v_add, 'doubled', false, 'pack', t.pack);
  end if;
  v_first := not exists (select 1 from public.topups where user_id = t.user_id and status = 'paid' and pack is null);
  v_add := t.mint * case when v_first then 2 else 1 end;
  update public.topups set status = 'paid', paid_at = now(), doubled = v_first where reference = p_reference;
  update public.profiles set coins = coins + v_add where id = t.user_id;
  perform public.log_coins(t.user_id, null, 'topup', v_add, false, 'Top-up' || case when v_first then ' (first one, doubled)' else '' end);
  return jsonb_build_object('found', true, 'new', true, 'mint', v_add, 'doubled', v_first);
end $$;

-- ============================================================ 3. the owner credits a player
create table if not exists public.admin_credits (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mint numeric(14,2) not null check (mint > 0),
  note text not null check (char_length(note) between 1 and 200),
  by_email text,
  created_at timestamptz not null default now()
);
create index if not exists admin_credits_at_idx on public.admin_credits (created_at desc);
alter table public.admin_credits enable row level security;

/** Give a player Newtown money by hand (the owner's dashboard). Returns their new balance. */
create or replace function public.admin_credit(p_user uuid, p_mint numeric, p_note text, p_by text) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_coins numeric;
begin
  if coalesce(p_mint, 0) <= 0 or p_mint > 10000000 then raise exception 'bad_amount'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'no_note'; end if;
  update public.profiles set coins = coins + round(p_mint, 2) where id = p_user and not is_bot returning coins into v_coins;
  if not found then raise exception 'unknown_player'; end if;
  insert into public.admin_credits (user_id, mint, note, by_email) values (p_user, round(p_mint, 2), left(trim(p_note), 200), p_by);
  perform public.log_coins(p_user, null, 'admin_credit', round(p_mint, 2), false, left('From Newtown: ' || trim(p_note), 200));
  perform public.notify(p_user, null, 'gift', left('Newtown sent you money: ' || trim(p_note), 300));
  return v_coins;
end $$;

/** A player by their name in the game or their email (the dashboard's credit form): id and name. */
create or replace function public.admin_find_player(p_who text) returns table (id uuid, username text, coins numeric)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.username, p.coins from public.profiles p
  where not p.is_bot and (lower(p.username) = lower(trim(p_who))
     or p.id = (select u.id from auth.users u where lower(u.email) = lower(trim(p_who)) limit 1))
  limit 1
$$;

-- The dashboard's money made counts credits too.
create or replace function public.money_since(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'created', coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                         'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                         'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                         'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                         'daily_gift', 'challenge_bonus', 'first_step', 'property_income', 'tutorial',
                                                         'online_pay', 'admin_credit')), 0),
    'online', coalesce(sum(amount) filter (where kind = 'online_pay'), 0),
    'burned', coalesce(sum(amount) filter (where kind = 'burn'), 0)
  )
  from public.ledger
  where created_at >= p_since
$$;

do $$
declare f text;
begin
  revoke all on table public.admin_credits from public, anon, authenticated;
  grant all on table public.admin_credits to service_role;
  grant usage, select on sequence public.admin_credits_id_seq to service_role;
  foreach f in array array['public.pack_had(uuid)', 'public.pack_status(uuid)', 'public.pack_adds(uuid, numeric)',
                           'public.pack_topup_start(uuid, text, text, text, numeric, bigint)', 'public.topup_paid(text, bigint)',
                           'public.admin_credit(uuid, numeric, text, text)', 'public.admin_find_player(text)', 'public.money_since(timestamptz)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
