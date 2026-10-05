-- =============================================================================
-- Spendbox update 23: total reach.
--
-- business_reach() counts who a business's posts can reach: its own
-- customers, plus its partners' customers who haven't joined it yet (they see
-- its products and perks when both businesses have partners switched on,
-- the same rule as customer_sees_business). Shown on the Stats tab.
--
-- Safe to run more than once. Run this after 20261022000000_media_aspect.sql.
-- =============================================================================

create or replace function public.business_reach(p_business_id uuid)
returns table (customers bigint, partner_customers bigint, total bigint, partners bigint)
language sql stable security definer set search_path = '' as $$
  with b as (
    select id, partners_enabled from public.businesses
    where id = p_business_id and public.is_business_owner(p_business_id)
  ),
  linked as (
    select case when p.requester_id = b.id then p.partner_id else p.requester_id end as id
    from b
    join public.partnerships p on p.status = 'active' and (p.requester_id = b.id or p.partner_id = b.id)
    where b.partners_enabled
  ),
  live_partners as (
    select o.id from linked join public.businesses o on o.id = linked.id
    where o.partners_enabled and o.suspended_at is null
  ),
  own as (
    select m.customer_id from public.memberships m join b on b.id = m.business_id
  ),
  others as (
    select distinct m.customer_id from public.memberships m
    join live_partners lp on lp.id = m.business_id
    where not exists (select 1 from own where own.customer_id = m.customer_id)
  )
  select
    (select count(*) from own),
    (select count(*) from others),
    (select count(*) from own) + (select count(*) from others),
    (select count(*) from live_partners)
  from b;
$$;

revoke execute on function public.business_reach(uuid) from public, anon;
grant execute on function public.business_reach(uuid) to authenticated;
