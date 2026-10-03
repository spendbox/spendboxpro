-- Tests for update 6 (activity log, undoing purchases, customer bank accounts). Runs after partners.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000a8', '2348500000001'),
  ('00000000-0000-0000-0000-0000000000b8', '2348500000002'),
  ('00000000-0000-0000-0000-0000000000c8', '2348500000003');

select test.act_as('00000000-0000-0000-0000-0000000000a8');
set role authenticated;
select public.create_business('Jollof Hub', 'Food') as biz \gset
insert into public.perks (business_id, kind, title, threshold) values (:'biz', 'visits', 'Free plate', 1);
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000b8');
set role authenticated;
select public.join_business('jollof-hub') as m \gset
reset role;

-- The business records a purchase: the customer earns a perk; both show in the activity log.
select test.act_as('00000000-0000-0000-0000-0000000000a8');
set role authenticated;
select public.record_purchase(:'m', 4500, 'Jollof and chicken') as p1 \gset
select public.redeem_reward((select id from public.rewards where membership_id = :'m' and kind = 'visits'));
select test.ok((select count(*) from public.audit_events where business_id = :'biz') >= 3, 'the business sees its activity log');
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000b8');
set role authenticated;
select test.ok((select string_agg(kind, ',' order by kind) from public.audit_events)
  = 'perk_earned,perk_given,purchase_recorded', 'the customer sees purchases recorded and perks earned and given');
select test.ok((select amount from public.audit_events where kind = 'purchase_recorded') = 4500, 'with the amount');
do $$ begin
  insert into public.audit_events (business_id, customer_id, kind) values
    ((select id from public.businesses where slug = 'jollof-hub'), auth.uid(), 'perk_given');
  raise exception 'FAILED: customer wrote to the log';
exception when insufficient_privilege then raise notice 'ok - nobody can write to the activity log by hand';
end $$;
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000c8');
set role authenticated;
select test.ok((select count(*) from public.audit_events) = 0, 'other people see none of it');
do $$ begin
  perform public.delete_recorded_purchase((select id from public.purchases limit 1));
  raise exception 'FAILED';
exception when no_data_found then raise notice 'ok - other people cannot delete purchases';
end $$;
reset role;

-- Undo within an hour; not after.
select test.act_as('00000000-0000-0000-0000-0000000000a8');
set role authenticated;
select public.delete_recorded_purchase(:'p1');
select test.ok(not exists (select 1 from public.purchases where id = :'p1'), 'a typed-in purchase can be deleted within an hour');
select public.record_purchase(:'m', 2000) as p2 \gset
reset role;
update public.purchases set created_at = now() - interval '2 hours' where id = :'p2';
select test.act_as('00000000-0000-0000-0000-0000000000a8');
set role authenticated;
do $$ begin
  perform public.delete_recorded_purchase((select id from public.purchases where amount = 2000));
  raise exception 'FAILED: deleted after an hour';
exception when raise_exception then raise notice 'ok - but not after an hour';
end $$;
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000b8');
set role authenticated;
select test.ok(exists (select 1 from public.audit_events where kind = 'purchase_deleted'), 'the customer sees that a purchase was deleted');
reset role;

-- Customer bank accounts: verified accounts belong to one person.
insert into public.payers (customer_id, sender_name, sender_key, sender_account, bank_code, verified)
values ('00000000-0000-0000-0000-0000000000b8', 'ADEBAYO TOLULOPE', 'ADEBAYO TOLULOPE', '0123456789', '058', true);
do $$ begin
  insert into public.payers (customer_id, sender_name, sender_key, sender_account, verified)
  values ('00000000-0000-0000-0000-0000000000c8', 'ADEBAYO TOLULOPE', 'ADEBAYO TOLULOPE', '0123456789', true);
  raise exception 'FAILED: same account on two customers';
exception when unique_violation then raise notice 'ok - a bank account can only be verified for one customer';
end $$;

-- Deleting an account removes its activity too.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000b8';
select test.ok((select count(*) from public.audit_events where customer_id = '00000000-0000-0000-0000-0000000000b8') = 0,
  'deleting an account removes its activity log');

\echo 'All activity tests passed'
