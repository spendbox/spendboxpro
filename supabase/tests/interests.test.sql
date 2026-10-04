-- Tests for update 11 (customer interests, one-call loaders). Runs after requests.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

\set ada '00000000-0000-0000-0000-0000000000c4'
select test.ok((select count(*) from public.request_signals where customer_id = :'ada') = 3, 'every request Ada posted is remembered');
select test.ok((select requests_count from public.customer_interests where customer_id = :'ada') = 3, 'her profile counts her requests');
select test.ok((select categories ->> 'Bakery & cakes' from public.customer_interests where customer_id = :'ada') = '1', 'and what she asks for');
select test.ok((select keywords ? 'cake' and keywords ? 'velvet' and not keywords ? 'need' and not keywords ? 'for' from public.customer_interests where customer_id = :'ada'), 'with the words that matter, not filler');
select test.ok((select found_count = 1 and reach_outs_count = 1 from public.customer_interests where customer_id = :'ada'), 'and how often plugs reach out and she finds one');
select test.ok((select budget_high = 30000 and budget_low = 5000 from public.customer_interests where customer_id = :'ada'), 'and her budget range');
select test.ok((select prefers_whatsapp = 3 and prefers_email = 1 from public.customer_interests where customer_id = :'ada'), 'and how she likes to be reached');

-- Deleting a request keeps what it was about
select test.act_as(:'ada');
set role authenticated;
delete from public.requests where body = 'Need a barber';
select public.post_request('Wedding cake, three tiers', 120000, null, 'Bakery & cakes');
select test.ok((select count(*) from public.my_requests_contacts()) = 1, 'one call loads who reached out on all her requests');
select test.ok((select count(*) from public.my_partner_perks()) >= 0, 'and one call loads partner perks');
select test.fails($$select * from public.customer_interests$$, 'customers cannot read interest profiles');
select test.fails($$select * from public.request_signals$$, 'or the remembered requests');
reset role;
select test.ok((select requests_count from public.customer_interests where customer_id = :'ada') = 4, 'a deleted request still counts');
select test.ok((select categories ->> 'Bakery & cakes' from public.customer_interests where customer_id = :'ada') = '2', 'and new ones are added straight away');
select test.ok((select public.top_keys(categories, 1) from public.customer_interests where customer_id = :'ada') = array['Bakery & cakes'], 'top_keys lists the favourites first');

\echo 'All interest tests passed'
