-- Tests for update 8 (admin area). Runs after pay-accounts.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

-- Raises unless the statement fails.
create or replace function test.fails(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - %', msg;
    return;
  end;
  raise exception 'FAILED: % (it worked but should not have)', msg;
end $$;
grant usage on schema test to authenticated;
grant execute on all functions in schema test to authenticated;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000aa', '2348700000001'),
  ('00000000-0000-0000-0000-0000000000ab', '2348700000002');

-- Nobody but the server can read admin tables or call admin functions.
select test.act_as('00000000-0000-0000-0000-0000000000aa');
set role authenticated;
select test.fails('select * from public.app_settings', 'signed-in people cannot read app settings');
select test.fails('select * from public.admin_members', 'or the admin team');
select test.fails('select public.admin_overview(90)', 'or the admin numbers');
select test.fails('update public.businesses set suspended_at = null', 'owners cannot unpause their own business');
reset role;

-- Pausing new businesses
insert into public.app_settings (key, value) values ('signups_open', 'false');
select test.act_as('00000000-0000-0000-0000-0000000000aa');
set role authenticated;
select test.fails($$select public.create_business('Paused Shop')$$, 'new businesses can be paused');
reset role;
update public.app_settings set value = 'true' where key = 'signups_open';
set role authenticated;
select public.create_business('Open Shop') as biz \gset
reset role;
select test.ok(:'biz' is not null, 'and opened again');

-- A paused business takes no new members
update public.businesses set suspended_at = now() where id = :'biz';
select test.act_as('00000000-0000-0000-0000-0000000000ab');
set role authenticated;
select test.fails($$select public.join_business('open-shop')$$, 'a paused business takes no new members');
reset role;
update public.businesses set suspended_at = null where id = :'biz';

-- Joining can be paused for everyone
insert into public.app_settings (key, value) values ('joins_open', 'false');
set role authenticated;
select test.fails($$select public.join_business('open-shop')$$, 'joining can be paused for everyone');
reset role;
update public.app_settings set value = 'true' where key = 'joins_open';
set role authenticated;
select public.join_business('open-shop');
reset role;
select test.ok(exists (select 1 from public.memberships where business_id = :'biz'), 'and opened again');

-- Server-side numbers and lists
set role service_role;
select test.ok((public.admin_overview(90) ->> 'businesses')::int >= 1, 'the dashboard counts businesses');
select test.ok(jsonb_array_length(public.admin_overview(90) -> 'daily') = 30, 'with 30 days of sign-ups');
select test.ok((select count(*) from public.admin_businesses('open', 'all', 10, 0, 90) where id = :'biz') = 1, 'businesses can be searched by name');
select test.ok((select count(*) from public.admin_businesses('', 'trial', 10, 0, 90) where id = :'biz') = 1, 'a new business is on trial');
select test.ok((select count(*) from public.admin_businesses('', 'trial', 10, 0, 0) where id = :'biz') = 0, 'a zero-day trial has ended');
select test.ok((select count(*) from public.admin_customers('8700000002', 'all', 10, 0)) = 1, 'customers can be found by phone');
select test.ok((select count(*) from public.admin_customers('08700000002', 'customers', 10, 0)) = 1, 'even typed with a leading 0');
reset role;

\echo 'All admin tests passed'
