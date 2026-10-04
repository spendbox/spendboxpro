-- =============================================================================
-- Spendbox update 12: products & services, and birthday notes.
--
-- Businesses post products and services, each with one photo or short video.
-- They show (newest first) in the Explore tab of their customers and their
-- partners' customers. Customers can like them (My box) and contact the
-- business; every view, like and contact is counted for the business's stats.
-- Also: a mark so each birthday treat's happy-birthday email goes out once.
--
-- Safe to run more than once. Run this after 20261011000000_interests_and_speed.sql.
-- =============================================================================

alter table public.rewards add column if not exists birthday_reminded_at timestamptz;

-- Products & services ---------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null default 'product' check (kind in ('product', 'service')),
  title text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 500),
  price numeric(14, 2) check (price is null or (price >= 0 and price <= 1000000000)),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  media_type text not null check (media_type in ('image', 'video')),
  media_url text not null check (char_length(media_url) <= 500),
  -- A still frame for videos, shown in the round thumbnails.
  poster_url text check (char_length(poster_url) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_business_idx on public.products (business_id, created_at desc);
create index if not exists products_feed_idx on public.products (created_at desc) where is_active;

alter table public.products enable row level security;
drop policy if exists "Owners see their products" on public.products;
create policy "Owners see their products" on public.products
  for select to authenticated using (public.is_business_owner(business_id));
drop policy if exists "Owners add products" on public.products;
create policy "Owners add products" on public.products
  for insert to authenticated with check (public.is_business_owner(business_id));
drop policy if exists "Owners change products" on public.products;
create policy "Owners change products" on public.products
  for update to authenticated using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
drop policy if exists "Owners delete products" on public.products;
create policy "Owners delete products" on public.products
  for delete to authenticated using (public.is_business_owner(business_id));
revoke all on public.products from anon, authenticated;
grant select, insert, delete on public.products to authenticated;
grant update (kind, title, description, price, is_active, updated_at) on public.products to authenticated;
grant all on public.products to service_role;

-- At most 200 products per business, so the feed stays quick.
create or replace function public.trg_products_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.products where business_id = new.business_id) >= 200 then
    raise exception 'You can have up to 200 products and services. Delete some to add more.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists products_limit on public.products;
create trigger products_limit before insert on public.products
  for each row execute function public.trg_products_limit();

-- Who looked, liked and asked (read only through the functions below).
create table if not exists public.product_views (
  product_id uuid not null references public.products (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  view_count integer not null default 1,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  primary key (product_id, customer_id)
);
create index if not exists product_views_customer_idx on public.product_views (customer_id);

create table if not exists public.product_likes (
  product_id uuid not null references public.products (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, customer_id)
);
create index if not exists product_likes_customer_idx on public.product_likes (customer_id, created_at desc);

create table if not exists public.product_contacts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  method text not null check (method in ('whatsapp', 'call', 'email')),
  created_at timestamptz not null default now()
);
create index if not exists product_contacts_product_idx on public.product_contacts (product_id, created_at desc);

alter table public.product_views enable row level security;
alter table public.product_likes enable row level security;
alter table public.product_contacts enable row level security;
revoke all on public.product_views, public.product_likes, public.product_contacts from anon, authenticated;
grant all on public.product_views, public.product_likes, public.product_contacts to service_role;

-- Photos and videos: public links with random names. Only the server hands out upload links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- Who sees what ---------------------------------------------------------------------

-- A customer sees a business's products if they joined it, or joined one of its
-- partners (both with cross-promotion on). Paused businesses are hidden.
create or replace function public.customer_sees_business(p_customer_id uuid, p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.suspended_at is null
      and (
        exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = p_customer_id)
        or (b.partners_enabled and exists (
          select 1 from public.partnerships p
          join public.businesses other
            on other.id = case when p.requester_id = b.id then p.partner_id else p.requester_id end
          join public.memberships m on m.business_id = other.id and m.customer_id = p_customer_id
          where p.status = 'active' and (p.requester_id = b.id or p.partner_id = b.id) and other.partners_enabled
        ))
      )
  );
$$;

-- The signed-in customer's feed: newest first, optionally searched.
create or replace function public.explore_products(p_query text default null, p_limit integer default 150)
returns table (
  id uuid, business_id uuid, business_name text, business_slug text, business_logo_url text, business_color text,
  business_whatsapp text, business_email text, kind text, title text, description text, price numeric, currency text,
  media_type text, media_url text, poster_url text, created_at timestamptz, viewed boolean, liked boolean, is_member boolean
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid),
  q as (select nullif(trim(coalesce(p_query, '')), '') as text)
  select p.id, b.id, b.name, b.slug, b.logo_url, b.brand_color, b.whatsapp, b.email, p.kind, p.title, p.description,
    p.price, p.currency, p.media_type, p.media_url, p.poster_url, p.created_at,
    exists (select 1 from public.product_views v where v.product_id = p.id and v.customer_id = me.uid),
    exists (select 1 from public.product_likes l where l.product_id = p.id and l.customer_id = me.uid),
    exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = me.uid)
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

-- My box: what the customer liked (still visible to them), most recently liked first.
create or replace function public.my_box()
returns table (
  id uuid, business_id uuid, business_name text, business_slug text, business_logo_url text, business_color text,
  business_whatsapp text, business_email text, kind text, title text, description text, price numeric, currency text,
  media_type text, media_url text, poster_url text, created_at timestamptz, viewed boolean, liked boolean, is_member boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id, b.id, b.name, b.slug, b.logo_url, b.brand_color, b.whatsapp, b.email, p.kind, p.title, p.description,
    p.price, p.currency, p.media_type, p.media_url, p.poster_url, p.created_at, true, true,
    exists (select 1 from public.memberships m where m.business_id = b.id and m.customer_id = l.customer_id)
  from public.product_likes l
  join public.products p on p.id = l.product_id and p.is_active
  join public.businesses b on b.id = p.business_id
  where l.customer_id = (select auth.uid()) and public.customer_sees_business(l.customer_id, b.id)
  order by l.created_at desc
  limit 300;
$$;

-- Counting ----------------------------------------------------------------------------

create or replace function public.view_product(p_product_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_business uuid;
begin
  select business_id into v_business from public.products where id = p_product_id and is_active;
  if v_uid is null or v_business is null or not public.customer_sees_business(v_uid, v_business) then
    return;
  end if;
  -- Owners looking at their own products don't count.
  if exists (select 1 from public.businesses where id = v_business and owner_id = v_uid) then
    return;
  end if;
  insert into public.product_views (product_id, customer_id) values (p_product_id, v_uid)
  on conflict (product_id, customer_id) do update
    set view_count = public.product_views.view_count + 1, last_viewed_at = now()
    -- A view within the last 10 minutes is the same look.
    where public.product_views.last_viewed_at < now() - interval '10 minutes';
end $$;

create or replace function public.like_product(p_product_id uuid, p_like boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_business uuid;
begin
  select business_id into v_business from public.products where id = p_product_id and is_active;
  if v_uid is null or v_business is null or not public.customer_sees_business(v_uid, v_business) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if p_like then
    insert into public.product_likes (product_id, customer_id) values (p_product_id, v_uid) on conflict do nothing;
  else
    delete from public.product_likes where product_id = p_product_id and customer_id = v_uid;
  end if;
  return p_like;
end $$;

create or replace function public.contact_product(p_product_id uuid, p_method text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_business uuid;
begin
  select business_id into v_business from public.products where id = p_product_id and is_active;
  if v_uid is null or v_business is null or not public.customer_sees_business(v_uid, v_business) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if p_method not in ('whatsapp', 'call', 'email') then
    raise exception 'Unknown contact method' using errcode = 'P0001';
  end if;
  -- One per person, method and hour is plenty.
  if not exists (select 1 from public.product_contacts where product_id = p_product_id and customer_id = v_uid
                 and method = p_method and created_at > now() - interval '1 hour') then
    insert into public.product_contacts (product_id, customer_id, method) values (p_product_id, v_uid, p_method);
  end if;
end $$;

-- Business stats ------------------------------------------------------------------------

-- Every product with its numbers, newest first.
create or replace function public.business_products(p_business_id uuid)
returns table (
  id uuid, kind text, title text, description text, price numeric, currency text, media_type text, media_url text,
  poster_url text, is_active boolean, created_at timestamptz,
  views bigint, viewers bigint, partner_viewers bigint, likes bigint, contacts bigint
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind, p.title, p.description, p.price, p.currency, p.media_type, p.media_url, p.poster_url,
    p.is_active, p.created_at,
    coalesce((select sum(v.view_count) from public.product_views v where v.product_id = p.id), 0),
    (select count(*) from public.product_views v where v.product_id = p.id),
    (select count(*) from public.product_views v where v.product_id = p.id
       and not exists (select 1 from public.memberships m where m.business_id = p.business_id and m.customer_id = v.customer_id)),
    (select count(*) from public.product_likes l where l.product_id = p.id),
    (select count(*) from public.product_contacts c where c.product_id = p.id)
  from public.products p
  where p.business_id = p_business_id and public.is_business_owner(p_business_id)
  order by p.created_at desc;
$$;

-- Who looked at, liked or asked about one product: first name only (the full
-- details follow each customer's sharing choice on the Customers page).
create or replace function public.product_audience(p_business_id uuid, p_product_id uuid)
returns table (
  customer_name text, member_no integer, via_partner text, view_count integer, last_viewed_at timestamptz,
  liked boolean, contacted text, last_activity timestamptz
)
language sql stable security definer set search_path = '' as $$
  with people as (
    select customer_id from public.product_views where product_id = p_product_id
    union select customer_id from public.product_likes where product_id = p_product_id
    union select customer_id from public.product_contacts where product_id = p_product_id
  )
  select
    nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), ''),
    m.member_no,
    case when m.id is null then (
      select b2.name from public.memberships m2
      join public.partnerships ps on ps.status = 'active'
        and ((ps.requester_id = p_business_id and ps.partner_id = m2.business_id) or (ps.partner_id = p_business_id and ps.requester_id = m2.business_id))
      join public.businesses b2 on b2.id = m2.business_id
      where m2.customer_id = people.customer_id
      limit 1
    ) end,
    coalesce(v.view_count, 0),
    v.last_viewed_at,
    l.created_at is not null,
    (select string_agg(distinct c.method, ', ') from public.product_contacts c where c.product_id = p_product_id and c.customer_id = people.customer_id),
    greatest(v.last_viewed_at, l.created_at, (select max(c.created_at) from public.product_contacts c where c.product_id = p_product_id and c.customer_id = people.customer_id))
  from people
  join public.products p on p.id = p_product_id and p.business_id = p_business_id
  left join public.profiles pr on pr.id = people.customer_id
  left join public.memberships m on m.business_id = p_business_id and m.customer_id = people.customer_id
  left join public.product_views v on v.product_id = p_product_id and v.customer_id = people.customer_id
  left join public.product_likes l on l.product_id = p_product_id and l.customer_id = people.customer_id
  where public.is_business_owner(p_business_id)
  order by 8 desc nulls last
  limit 500;
$$;

revoke execute on function public.customer_sees_business(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.trg_products_limit() from public, anon, authenticated;
revoke execute on function public.explore_products(text, integer) from public, anon;
revoke execute on function public.my_box() from public, anon;
revoke execute on function public.view_product(uuid) from public, anon;
revoke execute on function public.like_product(uuid, boolean) from public, anon;
revoke execute on function public.contact_product(uuid, text) from public, anon;
revoke execute on function public.business_products(uuid) from public, anon;
revoke execute on function public.product_audience(uuid, uuid) from public, anon;
grant execute on function public.explore_products(text, integer) to authenticated;
grant execute on function public.my_box() to authenticated;
grant execute on function public.view_product(uuid) to authenticated;
grant execute on function public.like_product(uuid, boolean) to authenticated;
grant execute on function public.contact_product(uuid, text) to authenticated;
grant execute on function public.business_products(uuid) to authenticated;
grant execute on function public.product_audience(uuid, uuid) to authenticated;
