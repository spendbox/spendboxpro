-- =============================================================================
-- Spendbox update 22: the shape of each product's photo or video.
--
-- products.media_aspect is the photo's (or video's) width divided by its
-- height, saved when it's posted, so the frames in the 3D shop fit each
-- picture (tall, square, wide or long). Older products get it measured in
-- the browser instead. The feed, My box, the business's product list and
-- the public shop return it.
--
-- Safe to run more than once. Run this after 20261021000000_product_categories.sql.
-- =============================================================================

alter table public.products add column if not exists media_aspect real check (media_aspect is null or (media_aspect >= 0.2 and media_aspect <= 5));

-- These return one more column, so they're replaced rather than changed.
drop function if exists public.explore_products(text, integer);
drop function if exists public.my_box();
drop function if exists public.business_products(uuid);

create or replace function public.explore_products(p_query text default null, p_limit integer default 150)
returns table (
  id uuid, business_id uuid, business_name text, business_slug text, business_logo_url text, business_color text,
  business_whatsapp text, business_email text, kind text, title text, description text, price numeric, currency text,
  media_type text, media_url text, poster_url text, created_at timestamptz, viewed boolean, liked boolean, is_member boolean, cutout_url text, category text, media_aspect real
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  q as (select nullif(trim(coalesce(p_query, '')), '') as text)
  select p.id, b.id, b.name, b.slug, b.logo_url, b.brand_color, b.whatsapp, b.email, p.kind, p.title, p.description,
    p.price, p.currency, p.media_type, p.media_url, p.poster_url, p.created_at,
    exists (select 1 from public.product_views v where v.product_id = p.id and v.customer_id = me.uid),
    exists (select 1 from public.product_likes l where l.product_id = p.id and l.customer_id = me.uid),
    exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = me.uid),
    p.cutout_url, p.category, p.media_aspect
  from public.products p
  join public.businesses b on b.id = p.business_id
  cross join me cross join q
  where p.is_active and me.uid is not null
    and public.customer_sees_business(me.uid, b.id)
    and (q.text is null or
      (p.title || ' ' || coalesce(p.description, '') || ' ' || b.name || ' ' || array_to_string(coalesce(b.categories, '{}'), ' '))
        ilike '%' || replace(replace(q.text, '%', ''), '_', '') || '%')
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 150), 1), 300);
$$;

create or replace function public.my_box()
returns table (
  id uuid, business_id uuid, business_name text, business_slug text, business_logo_url text, business_color text,
  business_whatsapp text, business_email text, kind text, title text, description text, price numeric, currency text,
  media_type text, media_url text, poster_url text, created_at timestamptz, viewed boolean, liked boolean, is_member boolean, cutout_url text, category text, media_aspect real
)
language sql stable security definer set search_path = '' as $$
  select p.id, b.id, b.name, b.slug, b.logo_url, b.brand_color, b.whatsapp, b.email, p.kind, p.title, p.description,
    p.price, p.currency, p.media_type, p.media_url, p.poster_url, p.created_at, true, true,
    exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = l.customer_id),
    p.cutout_url, p.category, p.media_aspect
  from public.product_likes l
  join public.products p on p.id = l.product_id and p.is_active
  join public.businesses b on b.id = p.business_id
  where l.customer_id = (select auth.uid()) and public.customer_sees_business(l.customer_id, b.id)
  order by l.created_at desc
  limit 300;
$$;

create or replace function public.business_products(p_business_id uuid)
returns table (
  id uuid, kind text, title text, description text, price numeric, currency text, media_type text, media_url text,
  poster_url text, is_active boolean, created_at timestamptz,
  views bigint, viewers bigint, partner_viewers bigint, likes bigint, contacts bigint, cutout_url text, category text, media_aspect real
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.title, p.description, p.price, p.currency, p.media_type, p.media_url, p.poster_url,
    p.is_active, p.created_at,
    coalesce((select sum(v.view_count) from public.product_views v where v.product_id = p.id), 0),
    (select count(*) from public.product_views v where v.product_id = p.id),
    (select count(*) from public.product_views v where v.product_id = p.id
       and not exists (select 1 from public.memberships m where m.business_id = p.business_id and m.customer_id = v.customer_id)),
    (select count(*) from public.product_likes l where l.product_id = p.id),
    (select count(*) from public.product_contacts c where c.product_id = p.id),
    p.cutout_url, p.category, p.media_aspect
  from public.products p
  where p.business_id = p_business_id and public.is_business_owner(p_business_id)
  order by p.created_at desc;
$$;

revoke execute on function public.explore_products(text, integer) from public, anon;
revoke execute on function public.my_box() from public, anon;
revoke execute on function public.business_products(uuid) from public, anon;
grant execute on function public.explore_products(text, integer) to authenticated;
grant execute on function public.my_box() to authenticated;
grant execute on function public.business_products(uuid) to authenticated;

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
        select pr.id, pr.title, pr.price, pr.currency, pr.media_type, pr.media_url, pr.poster_url, pr.description, pr.created_at, pr.category, pr.kind, pr.media_aspect
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
