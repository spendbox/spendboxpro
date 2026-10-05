-- Tests for update 5 (cross-promotion, perk time limits). Runs after sales.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000a7', '2348400000001'),
  ('00000000-0000-0000-0000-0000000000b7', '2348400000002'),
  ('00000000-0000-0000-0000-0000000000c7', '2348400000003'),
  ('00000000-0000-0000-0000-0000000000d7', '2348400000004'),
  ('00000000-0000-0000-0000-0000000000e7', '2348400000005');

-- Four businesses: a barber (A), a spa (B, approves automatically), a cafe (C, approves by hand), a gym (D).
select test.act_as('00000000-0000-0000-0000-0000000000a7');
set role authenticated;
select public.create_business('Fade Lab', 'Barber') as a \gset
insert into public.perks (business_id, kind, title) values (:'a', 'birthday', 'Free birthday trim');
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000b7');
set role authenticated;
select public.create_business('Glow Spa', 'Spa') as b \gset
insert into public.perks (business_id, kind, title, valid_days) values (:'b', 'welcome', 'Free facial on your first visit', 14);
update public.businesses set partners_enabled = true, partners_auto_approve = true where id = :'b';
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000c7');
set role authenticated;
select public.create_business('Bean There', 'Cafe') as c \gset
update public.businesses set partners_enabled = true where id = :'c';
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000d7');
set role authenticated;
select public.create_business('Iron Gym', 'Gym') as d \gset
update public.businesses set partners_enabled = true where id = :'d';
reset role;

-- A birthday perk with no time limit has no countdown.
update public.profiles set birth_month = extract(month from now()) where id = '00000000-0000-0000-0000-0000000000e7';
select test.act_as('00000000-0000-0000-0000-0000000000e7');
set role authenticated;
select public.join_business('fade-lab') as me \gset
select test.ok((select expires_at from public.rewards where membership_id = :'me' and kind = 'birthday') is null,
  'a birthday treat with no time limit has no use-by date');
reset role;

-- A can't look for partners until it switches cross-promotion on.
select test.act_as('00000000-0000-0000-0000-0000000000a7');
set role authenticated;
do $$ begin
  perform public.request_partnership((select id from public.businesses where slug = 'fade-lab'), (select id from public.businesses where slug = 'glow-spa'));
  raise exception 'FAILED: requested while switched off';
exception when raise_exception then raise notice 'ok - cross-promotion must be on to ask for partners';
end $$;
update public.businesses set partners_enabled = true where id = :'a';

select test.ok((select count(*) from public.partner_directory(:'a')) = 3, 'the directory lists businesses taking partners');
select test.ok((select members from public.partner_directory(:'a') where id = :'b') = 0, 'with how many customers they have');
select test.ok((select auto_approve from public.partner_directory(:'a') where id = :'b'), 'and whether they approve automatically');
select test.ok((select count(*) from public.partner_directory(:'a', null, 'Cafe')) = 1, 'search by category');
select test.ok((select count(*) from public.partner_directory(:'a', 'glow')) = 1, 'search by name');

select test.ok(public.request_partnership(:'a', :'b') = 'active', 'a business that approves automatically becomes a partner straight away');
select test.ok(public.request_partnership(:'a', :'c') = 'pending', 'others need to approve the request');
select test.ok((select relation from public.partner_directory(:'a') where id = :'c') = 'sent', 'the directory shows the request was sent');
do $$ begin
  perform public.request_partnership((select id from public.businesses where slug = 'fade-lab'), (select id from public.businesses where slug = 'iron-gym'));
  raise exception 'FAILED: third partner';
exception when raise_exception then raise notice 'ok - a business can have at most 2 partners (requests included)';
end $$;
do $$ begin
  perform public.respond_partnership((select id from public.businesses where slug = 'fade-lab'),
    (select partnership_id from public.partner_directory((select id from public.businesses where slug = 'fade-lab')) where relation = 'sent'), true);
  raise exception 'FAILED: requester accepted own request';
exception when no_data_found then raise notice 'ok - only the business that was asked can approve';
end $$;
do $$ begin
  perform 1 from public.partnerships;
  raise exception 'FAILED: partnerships readable';
exception when insufficient_privilege then raise notice 'ok - partnerships are only reachable through the app''s functions';
end $$;
reset role;

-- The customer of A sees B's perks (active) but not C's (pending).
select test.act_as('00000000-0000-0000-0000-0000000000e7');
set role authenticated;
select test.ok((select string_agg(partner_name, ',') from public.partner_perks(array[:'a'::uuid])) = 'Glow Spa',
  'customers see perks from their business''s partners');
reset role;

-- C approves; now both show.
select test.act_as('00000000-0000-0000-0000-0000000000c7');
set role authenticated;
select test.ok((select relation from public.partner_directory(:'c') where id = :'a') = 'received', 'the asked business sees the request');
select test.ok(public.partner_requests_waiting(:'c') = 1, 'and a count of requests waiting');
select public.respond_partnership(:'c', (select partnership_id from public.partner_directory(:'c') where id = :'a'), true);
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000e7');
set role authenticated;
select test.ok((select count(distinct partner_id) from public.partner_perks(array[:'a'::uuid])) = 1,
  'a partner without perks shows nothing');
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000c7');
set role authenticated;
insert into public.perks (business_id, kind, title) values (:'c', 'welcome', 'Free coffee on your first visit');
-- It works both ways: C's customers see A's perks.
select test.ok((select string_agg(title, ',') from public.partner_perks(array[:'c'::uuid])) = 'Free birthday trim', 'and it works both ways');
reset role;

-- Switching cross-promotion off hides partner perks; switching back on brings them back.
select test.act_as('00000000-0000-0000-0000-0000000000b7');
set role authenticated;
update public.businesses set partners_enabled = false where id = :'b';
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000e7');
set role authenticated;
select test.ok(not exists (select 1 from public.partner_perks(array[:'a'::uuid]) where partner_id = :'b'), 'switching off hides partner perks');
reset role;

-- Ending a partnership frees a place.
select test.act_as('00000000-0000-0000-0000-0000000000a7');
set role authenticated;
select public.end_partnership(:'a', (select partnership_id from public.partner_directory(:'a') where id = :'b'));
select test.ok(public.request_partnership(:'a', :'d') = 'pending', 'ending a partnership frees a place for another');
reset role;

-- Another business can't end A and C's partnership.
select id as ac from public.partnerships where status = 'active' and :'c' in (requester_id, partner_id) \gset
select test.act_as('00000000-0000-0000-0000-0000000000d7');
set role authenticated;
select set_config('test.ac', :'ac', false);
do $$ begin
  perform public.end_partnership((select id from public.businesses where slug = 'iron-gym'), current_setting('test.ac')::uuid);
  raise exception 'FAILED: ended someone else''s partnership';
exception when no_data_found then raise notice 'ok - businesses can only end their own partnerships';
end $$;
reset role;

-- Total reach: A's own customers, plus its partner C's customers who haven't joined A.
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000000f7', '2348400000006');
select test.act_as('00000000-0000-0000-0000-0000000000f7');
set role authenticated;
select public.join_business('bean-there') as f_c \gset
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000e7');
set role authenticated;
select public.join_business('bean-there') as e_c \gset
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000a7');
set role authenticated;
select test.ok((select customers from public.business_reach(:'a')) = 1, 'reach counts the business''s own customers');
select test.ok((select partner_customers from public.business_reach(:'a')) = 1, 'and its partners'' customers who haven''t joined it (once each)');
select test.ok((select total from public.business_reach(:'a')) = 2, 'adding up to its total reach');
reset role;
update public.businesses set partners_enabled = false where id = :'c';
select test.act_as('00000000-0000-0000-0000-0000000000a7');
set role authenticated;
select test.ok((select partner_customers from public.business_reach(:'a')) = 0, 'a partner with partners switched off adds no reach');
reset role;
update public.businesses set partners_enabled = true where id = :'c';
select test.act_as('00000000-0000-0000-0000-0000000000d7');
set role authenticated;
select test.ok(not exists (select 1 from public.business_reach(:'a')), 'only the owner sees a business''s reach');
reset role;

\echo 'All partner tests passed'
