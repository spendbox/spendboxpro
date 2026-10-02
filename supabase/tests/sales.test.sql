-- Tests for update 4 (sales from the bank). Runs after bank.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000f5', '2348300000001'),
  ('00000000-0000-0000-0000-0000000000f6', '2348300000002');

select test.act_as('00000000-0000-0000-0000-0000000000f5');
set role authenticated;
select public.create_business('Suya Spot', 'Food') as biz \gset
reset role;

insert into public.bank_connections (business_id, mono_account_id, institution, account_number, balance, balance_at)
values (:'biz', 'mono_sales_1', 'Opay', '8012345678', 250000.50, now()) returning id as conn \gset
insert into public.bank_transactions (business_id, connection_id, external_id, amount, paid_at, status) values
  (:'biz', :'conn', 's1', 1000, '2026-09-01 10:00+01', 'history'),
  (:'biz', :'conn', 's2', 2500, '2026-09-01 23:30+01', 'unmatched'),
  (:'biz', :'conn', 's3', 4000, '2026-09-02 00:30+01', 'unmatched'),
  (:'biz', :'conn', 's4', 99999, '2026-09-02 09:00+01', 'ignored'),
  (:'biz', :'conn', 's5', 700, '2026-08-15 12:00+01', 'history');

select test.act_as('00000000-0000-0000-0000-0000000000f5');
set role authenticated;
select test.ok((select total from public.business_sales_days(:'biz', '2026-09-01', 'Africa/Lagos') where day = '2026-09-01') = 3500,
  'money in is added up per day in the business''s time zone');
select test.ok((select payments from public.business_sales_days(:'biz', '2026-09-01', 'Africa/Lagos') where day = '2026-09-02') = 1,
  '"not a customer" money is left out of sales');
select test.ok((select count(*) from public.business_sales_days(:'biz', '2026-09-01', 'Africa/Lagos')) = 2, 'only that month''s days');
select test.ok((select string_agg(month::text || '=' || total::text, ',') from public.business_sales_months(:'biz', 'Africa/Lagos'))
  = '2026-09-01=7500.00,2026-08-01=700.00', 'money in per month, newest first');
select test.ok((select balance from public.bank_connections where id = :'conn') = 250000.50, 'the business sees its bank balance');
select test.ok(not exists (select 1 from public.business_unmatched_payments(:'biz') u join public.bank_transactions t on t.id = u.id
  where t.status = 'history'), 'past payments from before connecting are not asked about');
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000f6');
set role authenticated;
select test.ok((select count(*) from public.business_sales_days(:'biz', '2026-09-01', 'Africa/Lagos')) = 0, 'other people see no sales');
select test.ok((select count(*) from public.business_sales_months(:'biz', 'Africa/Lagos')) = 0, 'or monthly totals');
reset role;

\echo 'All sales tests passed'
