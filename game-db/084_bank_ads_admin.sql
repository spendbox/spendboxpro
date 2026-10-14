-- Newtown, part 84:
--   1. The World Bank opens with ₦1 billion (666,666.67 mint at ₦1,500 a mint) and grows from
--      there with what games pay the city (part 83). Added once: running this again adds nothing.
--   2. Billboard views counted in full: a batch of views of the same business's billboard counts
--      every one (business_hits_add), not one per batch.
--   3. Paid billboard ads can be for one region (a state) or everywhere: ads.region, and
--      ad_serve_in picks only the ads for the map being looked at.
--   4. The owner's dashboard: the money made and burned since a time (money_since).
--
-- Run it after 083 (and 043 for businesses). Safe to run more than once.

-- ============================================================ 1. the World Bank's opening ₦1 billion
insert into public.game_settings (key, value, note) values
  ('world_bank_start', 666666.67, 'What the World Bank opened with, in mint (₦1 billion in Lagos)')
on conflict (key) do update set value = excluded.value, note = excluded.note;

insert into public.world_bank (id, balance) values (1, 0) on conflict (id) do nothing;

do $$
declare
  v_start numeric := coalesce(public.setting('world_bank_start'), 666666.67);
begin
  if not exists (select 1 from public.world_bank_ledger where kind = 'opening') then
    update public.world_bank set balance = balance + v_start, updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (v_start, 'opening', 'The World Bank opens with ₦1 billion');
  end if;
end $$;

/** What's in the World Bank, and what games paid into it today (the opening sum isn't "today"). */
create or replace function public.world_bank_view() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.world_bank where id = 1), 0),
    'today', coalesce((select sum(amount) from public.world_bank_ledger
                       where kind <> 'opening' and created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos')), 0)
  )
$$;

-- ============================================================ 2. billboard views, every one
/** Count p_n of the same thing someone did with a business (billboard views come in batches). */
create or replace function public.business_hits_add(p_lease uuid, p_kind text, p_n int) returns void
language sql security definer set search_path = public as $$
  insert into public.business_hits (lease_id, kind, n)
  select p_lease, p_kind, greatest(1, least(coalesce(p_n, 1), 50))
  where exists (select 1 from public.business_leases where id = p_lease and status = 'live')
  on conflict (lease_id, day, kind) do update set n = business_hits.n + excluded.n
$$;

-- ============================================================ 3. ads for one region
-- Null: everywhere (every ad bought before this).
alter table public.ads add column if not exists region text check (region is null or region ~ '^[a-z0-9-]{2,30}$');

/** Like ad_serve, for one region's map: its own ads and the ones for everywhere. */
create or replace function public.ad_serve_in(p_n int, p_region text)
returns table (id uuid, image_path text, headline text, brand text, link_url text)
language sql volatile security definer set search_path = public as $$
  select a.id, a.image_path, a.headline, a.brand, a.link_url
  from public.ads a
  where public.ad_is_paying(a) and (a.region is null or a.region = p_region)
  order by -ln(greatest(random(), 1e-12))
           / (a.coins_left::float8
              / greatest(extract(epoch from (coalesce(a.ends_at, now()) - now())) / 3600.0, 1.0))
  limit greatest(0, least(coalesce(p_n, 24), 40))
$$;

-- ============================================================ 4. the dashboard's money
/** New money made and money burned since a time (the same kinds as coin_supply_daily), in mint. */
create or replace function public.money_since(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'created', coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                         'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                         'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                         'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                         'daily_gift', 'challenge_bonus', 'first_step', 'property_income', 'tutorial',
                                                         'online_pay')), 0),
    'online', coalesce(sum(amount) filter (where kind = 'online_pay'), 0),
    'burned', coalesce(sum(amount) filter (where kind = 'burn'), 0)
  )
  from public.ledger
  where created_at >= p_since
$$;

do $$
declare f text;
begin
  foreach f in array array['public.business_hits_add(uuid, text, int)', 'public.ad_serve_in(int, text)', 'public.money_since(timestamptz)', 'public.world_bank_view()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
