-- Tests for update 2 (logos, emails, perk durations). Runs after spendbox.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000f2', '2348100000001'),
  ('00000000-0000-0000-0000-0000000000a2', '2348100000002');

select test.act_as('00000000-0000-0000-0000-0000000000f2');
set role authenticated;
select public.create_business('Kingz Barbers', 'Hair & beauty') as biz \gset
update public.businesses set categories = array['Barber', 'Hair & beauty'], email = 'kingz@example.com',
  logo_url = 'https://example.com/logo.png' where id = :'biz';
select test.ok((select cardinality(categories) from public.businesses where id = :'biz') = 2, 'business saves several categories');
insert into public.perks (business_id, kind, title, valid_days) values (:'biz', 'welcome', 'Free beard trim', 14);
insert into public.bank_accounts (business_id, bank_name, bank_code, account_number, account_name)
values (:'biz', 'Opay', '999992', '8099914821', 'KINGSLEY OKORO');
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000a2');
set role authenticated;
select public.join_business('kingz-barbers') as m \gset
select test.ok(
  (select expires_at - issued_at from public.rewards where membership_id = :'m') = interval '14 days',
  'a perk earned now lasts as long as the business chose');
update public.profiles set email = 'ada@example.com', email_notifications = false where id = auth.uid();
select test.ok((select email from public.profiles where id = auth.uid()) = 'ada@example.com', 'customers can add an email');
do $$ begin
  update public.profiles set email = 'not-an-email' where id = auth.uid();
  raise exception 'FAILED: bad email accepted';
exception when check_violation then raise notice 'ok - invalid emails are refused';
end $$;
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000f2');
set role authenticated;
update public.perks set valid_days = 30 where business_id = :'biz';
select test.ok(
  (select expires_at - issued_at from public.rewards where membership_id = :'m') = interval '30 days',
  'changing the duration moves the use-by date of unused perks');
update public.perks set valid_days = null where business_id = :'biz';
select test.ok((select expires_at from public.rewards where membership_id = :'m') is null, 'perks can have no time limit');
do $$ begin
  update public.businesses set slug = 'x' where owner_id = auth.uid();
  raise exception 'FAILED: slug changed';
exception when insufficient_privilege then raise notice 'ok - the link still cannot be changed';
end $$;
reset role;

\echo 'All update 2 tests passed'
