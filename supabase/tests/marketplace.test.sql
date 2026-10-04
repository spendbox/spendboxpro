-- Tests for update 13 (marketplace). Runs after products.test.sql (reuses its businesses and customers).
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

select id as a from public.businesses where slug = 'prod-shop-a' \gset
select id as b from public.businesses where slug = 'prod-shop-b' \gset

-- Chioma joined A (which partners with B): she sees A as a member, and B through A
select test.act_as('00000000-0000-0000-0000-0000000000d4');
set role authenticated;
select test.ok((select count(*) from public.explore_businesses()) = 2, 'the map has the business she joined and its partner');
select test.ok((select is_member from public.explore_businesses() where id = :'a'), 'her own business is marked as joined');
select test.ok((select not is_member from public.explore_businesses() where id = :'b'), 'the partner is not');
select test.ok((select products = 1 and new_products = 0 from public.explore_businesses() where id = :'a'), 'with product counts, and none new once seen');
reset role;

-- A new product shows as new on A's shop
select test.act_as('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
insert into public.products (business_id, title, media_type, media_url) values (:'a', 'Blue sandals', 'image', 'https://x/s.jpg');
update public.businesses set store_theme = '{"theme": "boutique", "wall": "#F4E9DD"}' where id = :'a';
select test.ok((select store_theme ->> 'wall' from public.businesses where id = :'a') = '#F4E9DD', 'owners change their store design');
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000d4');
set role authenticated;
select test.ok((select new_products from public.explore_businesses() where id = :'a') = 1, 'a new product shows as new on the shop');
select test.ok((select store_theme ->> 'theme' from public.explore_businesses() where id = :'a') = 'boutique', 'and the store design comes with it');
update public.businesses set store_theme = '{"theme": "hacked"}' where id = :'a';
reset role;
select test.ok((select store_theme ->> 'theme' from public.businesses where id = :'a') = 'boutique', 'customers cannot change a store');

-- Someone with no businesses has an empty map
select test.act_as('00000000-0000-0000-0000-0000000000d3');
set role authenticated;
select test.ok((select count(*) from public.explore_businesses()) = 0, 'no businesses, empty map');
reset role;

\echo 'All marketplace tests passed'
