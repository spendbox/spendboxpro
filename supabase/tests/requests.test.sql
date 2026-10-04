-- Tests for update 10 (requests and simple perks). Runs after billing.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone, email) values
  ('00000000-0000-0000-0000-0000000000c1', null, 'shop-a@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', null, 'shop-b@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', null, 'shop-c@example.com'),
  ('00000000-0000-0000-0000-0000000000c4', '2348911111111', 'ada@example.com'),
  ('00000000-0000-0000-0000-0000000000c5', null, 'bolu@example.com');
update public.profiles set full_name = 'Ada Obi' where id = '00000000-0000-0000-0000-0000000000c4';

-- Three businesses; A and B are partners, C is not connected.
select test.act_as('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select public.create_business('Req Shop A') as a \gset
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select public.create_business('Req Shop B') as b \gset
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
select public.create_business('Req Shop C') as c \gset
reset role;
insert into public.partnerships (requester_id, partner_id, status) values (:'a', :'b', 'active');
insert into public.perks (business_id, kind, title) values (:'a', 'welcome', 'Free drink'), (:'a', 'referral', 'Free chops for each friend');

-- Ada joins A and posts a request
select test.act_as('00000000-0000-0000-0000-0000000000c4');
set role authenticated;
select public.join_business('req-shop-a');
select test.ok((select count(*) from public.rewards where kind = 'welcome') = 1, 'joining earns the welcome perk');
select public.post_request('Red velvet cake for Saturday, 8 inch', 30000, 20000, 'Bakery & cakes', 'Yaba', '{}', true, false, true) as req \gset
select test.ok((select expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute' from public.requests where id = :'req'), 'requests last 24 hours');
select test.fails($$select public.post_request('x', 100)$$, 'a request needs a few words');
select test.fails($$select public.post_request('Need a tailor', 0)$$, 'and a budget');
select test.fails($$select public.post_request('Need a tailor', 100, null, null, null, '{}', false, false, false)$$, 'and at least one way to be reached');
select public.post_request('Need a barber', 5000);
select public.post_request('Need a mechanic', 15000);
select test.fails($$select public.post_request('Need a plumber', 9000)$$, 'at most 3 live requests');
reset role;

-- Who sees it: A (Ada's business) and B (A's partner, on a free trial = Plus); not C
select test.act_as('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select test.ok((select count(*) from public.business_requests(:'a') where id = :'req') = 1, 'the business the customer joined sees the request');
select test.ok((select phone from public.business_requests(:'a') where id = :'req') = '2348911111111', 'with the contact details the customer chose');
select test.ok((select email from public.business_requests(:'a') where id = :'req') = 'ada@example.com', 'including email');
select test.ok((select customer_name from public.business_requests(:'a') where id = :'req') = 'Ada', 'and their first name');
select test.ok((select count(*) from public.business_requests(:'b')) = 0, 'businesses can only read their own feed');
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select test.ok((select via_partner from public.business_requests(:'b') where id = :'req') = 'Req Shop A', 'partners see it too, with whose customer it is');
select public.contact_request(:'b', :'req', 'whatsapp');
reset role;
update public.businesses set trial_ends_at = now() - interval '1 day' where id = :'b';
select test.act_as('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select test.ok((select count(*) from public.business_requests(:'b') where id = :'req') = 0, 'on Starter, partners'' customers'' requests are hidden');
reset role;
update public.businesses set plan = 'plus', paid_until = now() + interval '1 month' where id = :'b';
select test.act_as('00000000-0000-0000-0000-0000000000c2');
set role authenticated;
select test.ok((select count(*) from public.business_requests(:'b') where id = :'req') = 1, 'on Plus they show again');
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
select test.ok((select count(*) from public.business_requests(:'c')) = 0, 'unconnected businesses see nothing');
select test.fails(format('select public.contact_request(%L, %L, %L)', :'c', :'req', 'call'), 'or reach out');
reset role;

-- The customer sees who reached out, can close, and expired requests disappear
select test.act_as('00000000-0000-0000-0000-0000000000c4');
set role authenticated;
select test.ok((select name from public.my_request_contacts(:'req')) = 'Req Shop B', 'customers see which businesses reached out');
select public.close_request(:'req', true);
select test.ok((select status from public.requests where id = :'req') = 'found', 'they can mark it found');
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select test.ok((select count(*) from public.business_requests(:'a') where id = :'req') = 0, 'a found request leaves the feed');
reset role;
update public.requests set expires_at = now() - interval '1 minute' where body = 'Need a barber';
select test.act_as('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select test.ok((select count(*) from public.business_requests(:'a') where body = 'Need a barber') = 0, 'expired requests leave the feed');
reset role;

-- Others can't read Ada's requests or who reached out
select ref_code as ada_ref from public.memberships where customer_id = '00000000-0000-0000-0000-0000000000c4' and business_id = :'a' \gset
select test.act_as('00000000-0000-0000-0000-0000000000c5');
set role authenticated;
select test.ok((select count(*) from public.requests) = 0, 'requests are private to the customer');
select test.ok((select count(*) from public.my_request_contacts(:'req')) = 0, 'and so is who reached out');
select test.fails($$insert into public.requests (customer_id, body, budget_max) values (auth.uid(), 'sneaky insert', 10)$$, 'requests are only posted through post_request');
-- Invite perk: Bolu joins A through Ada's link
select public.join_business('req-shop-a', :'ada_ref');
reset role;
select test.ok((select count(*) from public.rewards where kind = 'referral' and customer_id = '00000000-0000-0000-0000-0000000000c4') = 1, 'a friend joining through your link earns the invite perk');

\echo 'All request tests passed'
