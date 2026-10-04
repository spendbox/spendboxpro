-- =============================================================================
-- Spendbox update 14: customer counts on the map.
--
-- Each shop on the 3D map shows how many customers the business has, so
-- explore_businesses() now also returns a customers count. (Store themes can
-- also hold a lounge table style; that lives in the existing store_theme JSON,
-- so there's nothing to change in the table for it.)
--
-- Safe to run more than once. Run this after 20261013000000_marketplace.sql.
-- =============================================================================

-- The list of columns changes, so the old function has to go first.
drop function if exists public.explore_businesses();

create or replace function public.explore_businesses()
returns table (
  id uuid, name text, slug text, categories text[], location text, about text, logo_url text, brand_color text,
  whatsapp text, email text, store_theme jsonb, is_member boolean, joined_at timestamptz,
  products integer, new_products integer, latest_product_at timestamptz, customers integer
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  shops as (
    select m.business_id as id, m.joined_at as since, true as member
    from public.memberships m, me where m.customer_id = me.uid
    union all
    select case when p.requester_id = m.business_id then p.partner_id else p.requester_id end, greatest(m.joined_at, p.created_at), false
    from public.memberships m
    join public.partnerships p on p.status = 'active' and m.business_id in (p.requester_id, p.partner_id)
    cross join me
    where m.customer_id = me.uid
  ),
  best as (
    select id, bool_or(member) as member, min(since) as since from shops group by id
  )
  select b.id, b.name, b.slug, coalesce(b.categories, '{}'), b.location, b.about, b.logo_url, b.brand_color,
    b.whatsapp, b.email, b.store_theme, best.member, best.since,
    (select count(*)::int from public.products pr where pr.business_id = b.id and pr.is_active),
    (select count(*)::int from public.products pr where pr.business_id = b.id and pr.is_active
       and not exists (select 1 from public.product_views v where v.product_id = pr.id and v.customer_id = me.uid)),
    (select max(pr.created_at) from public.products pr where pr.business_id = b.id and pr.is_active),
    (select count(*)::int from public.memberships cm where cm.business_id = b.id)
  from best
  join public.businesses b on b.id = best.id
  cross join me
  where public.customer_sees_business(me.uid, b.id)
  order by best.since, b.name
  limit 200;
$$;

revoke execute on function public.explore_businesses() from public, anon;
grant execute on function public.explore_businesses() to authenticated;
