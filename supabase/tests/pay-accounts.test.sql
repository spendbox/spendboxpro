-- Tests for update 7 (members see where to pay). Runs after activity.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000a9', '2348600000001'),
  ('00000000-0000-0000-0000-0000000000b9', '2348600000002'),
  ('00000000-0000-0000-0000-0000000000c9', '2348600000003');

select test.act_as('00000000-0000-0000-0000-0000000000a9');
set role authenticated;
select public.create_business('Pay Here', 'Food') as biz \gset
reset role;
insert into public.bank_connections (business_id, mono_account_id, institution, account_name, account_number)
values (:'biz', 'mono_pay_1', 'GTBank', 'PAY HERE LTD', '0011223344');

select test.act_as('00000000-0000-0000-0000-0000000000b9');
set role authenticated;
select public.join_business('pay-here');
select test.ok((select account_number from public.business_pay_accounts(:'biz')) = '0011223344', 'members see the account to pay into');
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000c9');
set role authenticated;
select test.ok((select count(*) from public.business_pay_accounts(:'biz')) = 0, 'people who are not members do not');
reset role;

\echo 'All pay-account tests passed'
