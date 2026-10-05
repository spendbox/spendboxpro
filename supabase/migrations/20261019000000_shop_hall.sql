-- =============================================================================
-- Spendbox update 19: room for every product in the 3D shop.
--
-- Every product now stands on its own display in the shop's hall (clothes on
-- mannequins, food on tables, homes as model houses, videos on banners), and
-- the hall grows as products are added. public_store() returns up to 400 of
-- a business's newest products (it returned 24), for the hall to lay out.
--
-- Safe to run more than once. Run this after 20261018000000_customer_invites.sql.
-- =============================================================================

create or replace function public.public_store(p_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'name', b.name, 'slug', b.slug, 'categories', coalesce(b.categories, '{}'),
    'location', b.location, 'about', b.about, 'logo_url', b.logo_url, 'brand_color', b.brand_color,
    'whatsapp', b.whatsapp, 'store_theme', b.store_theme, 'currency', b.currency,
    'perks', coalesce((
      select jsonb_agg(jsonb_build_object('id', pk.id, 'kind', pk.kind, 'title', pk.title, 'details', pk.details, 'threshold', pk.threshold, 'valid_days', pk.valid_days)
        order by array_position(array['welcome', 'referral', 'birthday']::public.perk_kind[], pk.kind))
      from public.perks pk
      where pk.business_id = b.id and pk.is_active and pk.kind in ('welcome', 'referral', 'birthday')
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(p order by p.created_at desc)
      from (
        select pr.id, pr.title, pr.price, pr.currency, pr.media_type, pr.media_url, pr.poster_url, pr.description, pr.created_at
        from public.products pr
        where pr.business_id = b.id and pr.is_active
        order by pr.created_at desc
        limit 400
      ) p
    ), '[]'::jsonb)
  )
  from public.businesses b
  where b.slug = lower(p_slug) and b.suspended_at is null;
$$;

revoke execute on function public.public_store(text) from public;
grant execute on function public.public_store(text) to anon, authenticated;
