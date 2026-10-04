-- =============================================================================
-- Spendbox update 17: a plug's partners, for its customers.
--
-- On a plug's page (and through the door in its 3D shop), customers can see
-- the businesses it partners with. plug_partners() lists them for members of
-- that plug: partnerships that are active, with partners turned on for both
-- businesses, and businesses that aren't paused.
--
-- Safe to run more than once. Run this after 20261016000000_shop_gift.sql.
-- =============================================================================

create or replace function public.plug_partners(p_business_id uuid)
returns table (
  id uuid, name text, slug text, categories text[], location text, about text, logo_url text, brand_color text,
  is_member boolean, products integer, welcome text
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid)
  select o.id, o.name, o.slug, coalesce(o.categories, '{}'), o.location, o.about, o.logo_url, o.brand_color,
    exists (select 1 from public.memberships m2, me where m2.business_id = o.id and m2.customer_id = me.uid),
    (select count(*)::int from public.products pr where pr.business_id = o.id and pr.is_active),
    (select pk.title from public.perks pk where pk.business_id = o.id and pk.kind = 'welcome' and pk.is_active limit 1)
  from me
  join public.memberships m on m.business_id = p_business_id and m.customer_id = me.uid
  join public.businesses b on b.id = p_business_id and b.partners_enabled
  join public.partnerships p on p.status = 'active' and p_business_id in (p.requester_id, p.partner_id)
  join public.businesses o on o.id = case when p.requester_id = p_business_id then p.partner_id else p.requester_id end
  where o.partners_enabled and o.suspended_at is null
  order by p.created_at, o.name;
$$;

revoke execute on function public.plug_partners(uuid) from public, anon;
grant execute on function public.plug_partners(uuid) to authenticated;
