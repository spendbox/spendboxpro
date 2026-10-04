-- Tests for update 12 (products & services). Runs after interests.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone, email) values
  ('00000000-0000-0000-0000-0000000000d1', null, 'prod-a@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', null, 'prod-b@example.com'),
  ('00000000-0000-0000-0000-0000000000d3', null, 'prod-c@example.com'),
  ('00000000-0000-0000-0000-0000000000d4', null, 'chi@example.com'),
  ('00000000-0000-0000-0000-0000000000d5', null, 'dayo@example.com');
update public.profiles set full_name = 'Chioma Eze' where id = '00000000-0000-0000-0000-0000000000d4';

select test.act_as('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select public.create_business('Prod Shop A') as a \gset
insert into public.products (business_id, title, description, price, media_type, media_url)
  values (:'a', 'Red sneakers', 'Size 38 to 45', 25000, 'image', 'https://x/a.jpg') returning id as shoe \gset
insert into public.products (business_id, title, media_type, media_url, poster_url)
  values (:'a', 'Braids in 3 hours', 'video', 'https://x/v.mp4', 'https://x/v.jpg') returning id as hair \gset
select test.ok((select count(*) from public.products where business_id = :'a') = 2, 'owners add products');
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000d2');
set role authenticated;
select public.create_business('Prod Shop B') as b \gset
select test.fails(format($$insert into public.products (business_id, title, media_type, media_url) values (%L, 'Sneaky', 'image', 'x')$$, :'a'), 'other businesses cannot add to your products');
select test.ok((select count(*) from public.products) = 0, 'or see them in the table');
select test.fails(format($$select public.like_product(%L, true)$$, :'shoe'), 'businesses that are not customers cannot like them');
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000d3');
set role authenticated;
select public.create_business('Prod Shop C') as c \gset
reset role;
insert into public.partnerships (requester_id, partner_id, status) values (:'a', :'b', 'active');

-- Chioma joined A: she sees both products, newest first, unviewed
select test.act_as('00000000-0000-0000-0000-0000000000d4');
set role authenticated;
select public.join_business('prod-shop-a');
select test.ok((select count(*) from public.explore_products()) = 2, 'customers see the products of businesses they joined');
select test.ok((select title from public.explore_products() limit 1) = 'Braids in 3 hours', 'newest first');
select test.ok((select bool_and(not viewed) from public.explore_products()), 'nothing viewed yet');
select test.ok((select count(*) from public.explore_products('sneak')) = 1, 'search finds products by name');
select test.ok((select count(*) from public.explore_products('prod shop a')) = 2, 'and by business');
select public.view_product(:'shoe');
select public.view_product(:'shoe');
select test.ok((select viewed from public.explore_products() where id = :'shoe'), 'viewed products are marked');
select public.like_product(:'shoe', true);
select test.ok((select count(*) from public.my_box()) = 1, 'liked products go to My box');
select public.contact_product(:'shoe', 'whatsapp');
select test.fails(format($$select public.contact_product(%L, 'pigeon')$$, :'shoe'), 'contact methods are checked');
select test.fails($$select * from public.product_views$$, 'customers cannot read who viewed what');
reset role;

-- Dayo joined B (A's partner): he sees A's products once cross-promotion is on
select test.act_as('00000000-0000-0000-0000-0000000000d5');
set role authenticated;
select public.join_business('prod-shop-b');
select test.ok((select count(*) from public.explore_products()) = 0, 'partners'' customers see nothing while cross-promotion is off');
reset role;
update public.businesses set partners_enabled = true where id in (:'a', :'b');
select test.act_as('00000000-0000-0000-0000-0000000000d5');
set role authenticated;
select test.ok((select count(*) from public.explore_products()) = 2, 'with cross-promotion on, partners'' customers see them');
select test.ok((select not is_member from public.explore_products() limit 1), 'marked as not their own business');
select public.view_product(:'shoe');
select public.like_product(:'hair', true);
reset role;

-- C's customers see nothing from A
select test.act_as('00000000-0000-0000-0000-0000000000d3');
set role authenticated;
select test.ok((select count(*) from public.explore_products()) = 0, 'unconnected businesses see nothing');
reset role;

-- A's stats
select test.act_as('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select test.ok((select views = 2 and viewers = 2 and partner_viewers = 1 and likes = 1 and contacts = 1 from public.business_products(:'a') where id = :'shoe'),
  'the business sees views, viewers (and how many came through partners), likes and contacts');
select test.ok((select count(*) from public.product_audience(:'a', :'shoe')) = 2, 'and who they were');
select test.ok((select customer_name from public.product_audience(:'a', :'shoe') where member_no is not null) = 'Chioma', 'by first name');
select test.ok((select via_partner from public.product_audience(:'a', :'shoe') where member_no is null) = 'Prod Shop B', 'and through which partner');
select public.view_product(:'shoe');
select test.ok((select views from public.business_products(:'a') where id = :'shoe') = 2, 'owners viewing their own products are not counted');
update public.products set is_active = false where id = :'hair';
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000d2');
set role authenticated;
select test.ok((select count(*) from public.business_products(:'a')) = 0, 'businesses only read their own stats');
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000d5');
set role authenticated;
select test.ok((select count(*) from public.explore_products()) = 1, 'hidden products leave the feed');
select test.ok((select count(*) from public.my_box()) = 0, 'and My box');
reset role;

\echo 'All product tests passed'
