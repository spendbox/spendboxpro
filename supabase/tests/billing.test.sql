-- Tests for update 9 (email sign-up, contact details, paid plans). Runs after admin.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone, email) values
  ('00000000-0000-0000-0000-0000000000ba', null, 'Owner@Example.com'),
  ('00000000-0000-0000-0000-0000000000bb', '2348900000002', 'member@example.com');

select test.ok((select email from public.profiles where id = '00000000-0000-0000-0000-0000000000ba') = 'owner@example.com', 'the login email becomes the profile email');
update auth.users set email = 'new@example.com' where id = '00000000-0000-0000-0000-0000000000bb';
select test.ok((select email from public.profiles where id = '00000000-0000-0000-0000-0000000000bb') = 'new@example.com', 'and follows changes to it');

-- Trial length comes from the admin setting
update public.app_settings set value = '7' where key = 'trial_days';
insert into public.app_settings (key, value) values ('trial_days', '7') on conflict (key) do update set value = '7';
select test.act_as('00000000-0000-0000-0000-0000000000ba');
set role authenticated;
select public.create_business('Paid Shop') as biz \gset
reset role;
select test.ok((select trial_ends_at::date from public.businesses where id = :'biz') = (now() + interval '7 days')::date, 'the trial length follows the admin setting');

-- Shared details include the email
select test.act_as('00000000-0000-0000-0000-0000000000bb');
set role authenticated;
select public.join_business('paid-shop', null, true);
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000ba');
set role authenticated;
select test.ok((select email from public.business_members(:'biz')) = 'new@example.com', 'businesses see the email of members who share their details');
select test.ok((select count(*) from public.business_payments) = 0, 'owners can read their own payments');
reset role;

-- Paying adds months after the trial, once
insert into public.business_payments (business_id, reference, plan, months, amount, method) values (:'biz', 'ref-1', 'plus', 1, 5000, 'paystack');
set role service_role;
select test.ok(not public.apply_business_payment('ref-1', 4000), 'paying less than the price does not count');
reset role;
insert into public.business_payments (business_id, reference, plan, months, amount, method) values (:'biz', 'ref-2', 'plus', 1, 5000, 'paystack');
set role service_role;
select test.ok(public.apply_business_payment('ref-2', 5000), 'a full payment counts');
select test.ok(not public.apply_business_payment('ref-2', 5000), 'only once');
reset role;
select test.ok((select plan = 'plus' and paid_until::date = (trial_ends_at + interval '1 month')::date from public.businesses where id = :'biz'), 'and the month starts when the trial ends');

-- Paying switches a business paused for non-payment back on (but not an admin pause)
update public.businesses set suspended_at = now(), suspended_reason = 'billing' where id = :'biz';
insert into public.business_payments (business_id, reference, plan, months, amount, method) values (:'biz', 'ref-3', 'starter', 1, 2500, 'manual');
set role service_role;
select public.apply_business_payment('ref-3', 2500);
reset role;
select test.ok((select suspended_at is null and plan = 'starter' from public.businesses where id = :'biz'), 'paying unpauses a business paused for non-payment');
update public.businesses set suspended_at = now(), suspended_reason = 'admin' where id = :'biz';
insert into public.business_payments (business_id, reference, plan, months, amount, method) values (:'biz', 'ref-4', 'starter', 1, 2500, 'manual');
set role service_role;
select public.apply_business_payment('ref-4', 2500);
reset role;
select test.ok((select suspended_at is not null from public.businesses where id = :'biz'), 'but not one paused by an admin');

select test.act_as('00000000-0000-0000-0000-0000000000bb');
set role authenticated;
select test.ok((select count(*) from public.business_payments) = 0, 'other people cannot see a business''s payments');
select test.fails($$select public.apply_business_payment('ref-4', 1)$$, 'or mark payments as paid');
select test.fails('select * from public.auth_tokens', 'or read email links');
reset role;

\echo 'All billing tests passed'
