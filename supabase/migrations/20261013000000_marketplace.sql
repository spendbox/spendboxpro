-- =============================================================================
-- Spendbox update 13: the 3D marketplace.
--
-- Customers' Explore can show their businesses as shops on a little 3D map.
-- Each business picks a store theme and adjusts it (colours, floor, decor);
-- the choice is kept in businesses.store_theme. explore_businesses() lists
-- the shops a customer can visit, with how many new products each has.
--
-- Safe to run more than once. Run this after 20261012000000_products.sql.
-- =============================================================================

alter table public.businesses add column if not exists store_theme jsonb not null default '{}'::jsonb;
alter table public.businesses drop constraint if exists businesses_store_theme_size;
alter table public.businesses add constraint businesses_store_theme_size check (pg_column_size(store_theme) < 4000);
grant update (store_theme) on public.businesses to authenticated;

-- The shops on the signed-in customer's map: businesses they joined, and those
-- businesses' partners (with cross-promotion on). Oldest relationship first, so
-- the map keeps its shape as it grows.
create or replace function public.explore_businesses()
returns table (
  id uuid, name text, slug text, categories text[], location text, about text, logo_url text, brand_color text,
  whatsapp text, email text, store_theme jsonb, is_member boolean, joined_at timestamptz,
  products integer, new_products integer, latest_product_at timestamptz
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
    (select max(pr.created_at) from public.products pr where pr.business_id = b.id and pr.is_active)
  from best
  join public.businesses b on b.id = best.id
  cross join me
  where public.customer_sees_business(me.uid, b.id)
  order by best.since, b.name
  limit 200;
$$;

revoke execute on function public.explore_businesses() from public, anon;
grant execute on function public.explore_businesses() to authenticated;
