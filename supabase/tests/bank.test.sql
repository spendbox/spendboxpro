-- Tests for update 3 (payments from the bank through Mono). Runs after update2.test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000f3', '2348200000001'),
  ('00000000-0000-0000-0000-0000000000b3', '2348200000002'),
  ('00000000-0000-0000-0000-0000000000c3', '2348200000003'),
  ('00000000-0000-0000-0000-0000000000f4', '2348200000004');

-- A business with a loyalty perk after 2 purchases.
select test.act_as('00000000-0000-0000-0000-0000000000f3');
set role authenticated;
select public.create_business('Mama Put', 'Food') as biz \gset
insert into public.perks (business_id, kind, title, threshold) values (:'biz', 'visits', 'Free plate of rice', 2);
reset role;

select test.act_as('00000000-0000-0000-0000-0000000000b3');
set role authenticated;
select public.join_business('mama-put') as mb \gset
reset role;
select test.act_as('00000000-0000-0000-0000-0000000000c3');
set role authenticated;
select public.join_business('mama-put') as mc \gset
reset role;

-- The server saves a connection and two payments from the same sender.
insert into public.bank_connections (business_id, mono_account_id, institution, account_name, account_number)
values (:'biz', 'mono_acc_1', 'GTBank', 'MAMA PUT LTD', '0123456789') returning id as conn \gset
insert into public.bank_transactions (business_id, connection_id, external_id, amount, paid_at, narration,
  sender_name, sender_key, sender_account)
values (:'biz', :'conn', 'tx1', 3500, now(), 'NIP/ADEBAYO TOLULOPE/rice', 'ADEBAYO TOLULOPE', 'ADEBAYO TOLULOPE', null)
returning id as tx1 \gset
insert into public.bank_transactions (business_id, connection_id, external_id, amount, paid_at, narration,
  sender_name, sender_key)
values (:'biz', :'conn', 'tx2', 4200, now(), 'NIP/ADEBAYO TOLULOPE/stew', 'ADEBAYO TOLULOPE', 'ADEBAYO TOLULOPE')
returning id as tx2 \gset

-- Owners see what came in; customers and other businesses don't.
select test.act_as('00000000-0000-0000-0000-0000000000f3');
set role authenticated;
select test.ok((select count(*) from public.business_unmatched_payments(:'biz')) = 2, 'the business sees payments waiting to be matched');
select test.ok((select unmatched from public.business_stats(:'biz')) = 2, 'the home screen counts them');
do $$ begin
  perform mono_account_id from public.bank_connections;
  raise exception 'FAILED: Mono account id readable';
exception when insufficient_privilege then raise notice 'ok - the Mono account id stays on the server';
end $$;
select test.ok((select count(*) from public.bank_connections) = 1, 'the business sees its connected bank');

-- "This was member B."
select public.assign_bank_payment(:'tx1', :'mb') as p1 \gset
select test.ok((select status = 'verified' and source = 'bank' from public.purchases where id = :'p1'), 'picking the customer counts the payment');
select test.ok((select count(*) from public.business_unmatched_payments(:'biz')) = 1, 'it leaves the "who paid this?" list');
select test.ok((select sender_name from public.business_purchases(:'biz') where id = :'p1') = 'ADEBAYO TOLULOPE',
  'the payments list shows who the bank says paid');
select test.ok((select count(*) from public.payers) = 0, 'businesses cannot read the payers list');
reset role;

select test.ok((select count(*) from public.payers where customer_id = '00000000-0000-0000-0000-0000000000b3'
  and sender_key = 'ADEBAYO TOLULOPE') = 1, 'Spendbox remembers the sender for that customer');

-- The matcher (server) settles the second payment the same way; doing it twice is harmless.
select public.settle_bank_transaction(:'tx2', :'mb', 'payer') as p2 \gset
select test.ok(public.settle_bank_transaction(:'tx2', :'mb', 'payer') = :'p2'::uuid, 'settling twice counts once');
select test.ok((select count(*) from public.rewards where membership_id = :'mb' and kind = 'visits' and status = 'available') = 1,
  'payments from the bank unlock perks');

-- The customer sees and can remove what was recognised as them.
select test.act_as('00000000-0000-0000-0000-0000000000b3');
set role authenticated;
select test.ok((select count(*) from public.payers) = 1, 'customers see the senders recognised as them');
select test.ok((select count(*) from public.bank_transactions) = 0, 'customers cannot read the business''s bank feed');
do $$ begin
  insert into public.payers (customer_id, sender_key) values (auth.uid(), 'SOMEONE ELSE');
  raise exception 'FAILED: customer added a payer';
exception when insufficient_privilege then raise notice 'ok - customers cannot add payers themselves';
end $$;
do $$ begin
  perform public.settle_bank_transaction(gen_random_uuid(), gen_random_uuid(), 'manual');
  raise exception 'FAILED: customer called the matcher';
exception when insufficient_privilege then raise notice 'ok - only the server runs the matcher';
end $$;
reset role;

-- Another business can't touch these payments.
select test.act_as('00000000-0000-0000-0000-0000000000f4');
set role authenticated;
select public.create_business('Other Shop', 'Food') as other \gset
do $$ begin
  perform public.unmatch_bank_payment((select id from public.purchases where source = 'bank' limit 1));
  raise exception 'FAILED: other business unmatched';
exception when no_data_found then raise notice 'ok - other businesses cannot change these payments';
end $$;
reset role;

-- "Wrong customer": undo, the purchase goes, the sender is forgotten for B.
select test.act_as('00000000-0000-0000-0000-0000000000f3');
set role authenticated;
select public.unmatch_bank_payment(:'p2');
select test.ok((select count(*) from public.purchases where id = :'p2') = 0, 'wrong customer removes the counted payment');
select test.ok((select count(*) from public.business_unmatched_payments(:'biz')) = 1, 'and puts it back in "who paid this?"');
reset role;
select test.ok((select count(*) from public.payers where customer_id = '00000000-0000-0000-0000-0000000000b3') = 0,
  'and forgets that sender for that customer');
select test.ok((select count(*) from public.rewards where membership_id = :'mb' and kind = 'visits' and status = 'available') = 0,
  'and takes back the perk it unlocked');
select test.ok((select count(*) from public.bank_sender_rejections where membership_id = :'mb') = 1,
  'and remembers not to match that sender to them again');

-- A purchase the business typed in is linked, not counted twice.
select test.act_as('00000000-0000-0000-0000-0000000000f3');
set role authenticated;
select public.record_purchase(:'mc', 4200, 'Stew') as rec \gset
reset role;
select public.settle_bank_transaction(:'tx2', :'mc', 'recorded', :'rec') as linked \gset
select test.ok(:'linked'::uuid = :'rec'::uuid, 'a matching recorded purchase is linked to the bank payment');
select test.ok((select count(*) from public.purchases where membership_id = :'mc') = 1, 'and is not counted twice');
select test.act_as('00000000-0000-0000-0000-0000000000f3');
set role authenticated;
select public.unmatch_bank_payment(:'rec');
select test.ok((select count(*) from public.purchases where id = :'rec') = 1, 'undoing a link keeps the purchase the business typed in');

-- "Not a customer", always.
reset role;
insert into public.bank_transactions (business_id, connection_id, external_id, amount, paid_at, sender_name, sender_key)
values (:'biz', :'conn', 'tx3', 100000, now(), 'MAMA PUT OWNER', 'MAMA OWNER PUT') returning id as tx3 \gset
select test.act_as('00000000-0000-0000-0000-0000000000f3');
set role authenticated;
select public.ignore_bank_payment(:'tx3', true);
select test.ok((select 'MAMA OWNER PUT' = any (ignored_senders) from public.businesses where id = :'biz'),
  'a business can skip a sender for good');
select test.ok((select count(*) from public.business_unmatched_payments(:'biz')) = 1, 'skipped payments leave the list');
reset role;

\echo 'All bank feed tests passed'
