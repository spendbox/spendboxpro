-- Scenario tests for the Spendbox migration.
-- Run with: npm run test:db  (needs a local Postgres; see README)
\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = warning;

create schema if not exists test;
create or replace function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then
    raise exception 'FAILED: %', msg;
  end if;
  raise notice 'ok - %', msg;
end $$;
create or replace function test.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, false);
$$;
grant usage on schema test to anon, authenticated, service_role;
grant execute on all functions in schema test to anon, authenticated, service_role;
set client_min_messages = notice;

-- People -----------------------------------------------------------------------
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-00000000000f', '2348000000001'),  -- owner
  ('00000000-0000-0000-0000-00000000000a', '2348000000002'),  -- Ada
  ('00000000-0000-0000-0000-00000000000b', '2348000000003'),  -- Bayo (invited by Ada)
  ('00000000-0000-0000-0000-00000000000c', '2348000000004');  -- Chi
select test.ok((select count(*) from public.profiles) = 4, 'a profile is created for every new login');
select test.ok((select phone from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = '2348000000002',
  'profile keeps the verified phone number');

-- Owner sets up the business ----------------------------------------------------
select test.act_as('00000000-0000-0000-0000-00000000000f');
set role authenticated;
select public.create_business('Mama Tee''s Kitchen', 'Food', 'Yaba', '08030000001') as biz \gset
select test.ok((select slug from public.businesses where id = :'biz') = 'mama-tee-s-kitchen', 'business gets a readable link');
select public.create_business('Mama Tee''s Kitchen') as biz2 \gset
select test.ok((select slug from public.businesses where id = :'biz2') like 'mama-tee-s-kitchen-%', 'duplicate names get a unique link');
delete from public.businesses where id = :'biz2';

insert into public.perks (business_id, kind, title) values (:'biz', 'welcome', 'Free extra meat');
insert into public.perks (business_id, kind, title) values (:'biz', 'referral', 'Free small chops');
insert into public.perks (business_id, kind, title, threshold) values (:'biz', 'visits', 'Free drink', 3);
insert into public.perks (business_id, kind, title, threshold) values (:'biz', 'spend', '10% off', 10000);
insert into public.perks (business_id, kind, title) values (:'biz', 'birthday', 'Birthday treat');
insert into public.bank_accounts (business_id, bank_name, account_number, account_name)
values (:'biz', 'Moniepoint', '6012344821', 'MAMA TEE KITCHEN');
insert into public.bank_accounts (business_id, bank_name, account_number, account_name)
values (:'biz', 'GTBank', '0123456789', 'ADEBOLA TEMITOPE');
select test.ok((select count(*) from public.bank_accounts) = 2, 'a business can add several bank accounts');

do $$ begin
  update public.businesses set slug = 'stolen' where owner_id = auth.uid();
  raise exception 'FAILED: owner could change the business link';
exception when insufficient_privilege then raise notice 'ok - the business link cannot be changed after sharing';
end $$;

do $$ begin
  perform public.join_business('mama-tee-s-kitchen');
  raise exception 'FAILED: owner joined own business';
exception when raise_exception then raise notice 'ok - owners cannot join their own business as a customer';
end $$;
reset role;

-- Anonymous visitor opens the join link ------------------------------------------
select set_config('request.jwt.claims', '', false);
set role anon;
select test.ok((select count(*) from public.businesses where slug = 'mama-tee-s-kitchen') = 1, 'anyone can see a business join page');
select test.ok((select count(*) from public.perks) = 5, 'anyone can see active perks');
do $$ begin
  perform count(*) from public.bank_accounts;
  raise exception 'FAILED: visitors could read bank accounts';
exception when insufficient_privilege then raise notice 'ok - bank accounts are never public';
end $$;
do $$ begin
  perform public.join_business('mama-tee-s-kitchen');
  raise exception 'FAILED: anonymous join';
exception when insufficient_privilege then raise notice 'ok - you must verify a phone number to join';
end $$;
reset role;

-- Ada joins (invite-only, from the business link) --------------------------------
select test.act_as('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select public.join_business('mama-tee-s-kitchen') as ada \gset
select test.ok(public.join_business('mama-tee-s-kitchen') = :'ada', 'joining twice keeps one membership');
select test.ok((select member_no from public.memberships where id = :'ada') = 1, 'first member is #1');
select test.ok((select count(*) from public.rewards where status = 'available' and kind = 'welcome') = 1,
  'welcome perk is given on joining');
select test.ok((select share_details from public.memberships where id = :'ada') = false, 'details are private by default');
select test.ok((select count(*) from public.bank_accounts) = 0, 'customers cannot see bank accounts');
select ref_code as ada_ref from public.memberships where id = :'ada' \gset

do $$ begin
  update public.memberships set member_no = 99;
  raise exception 'FAILED: customer changed member number';
exception when insufficient_privilege then raise notice 'ok - customers can only change their sharing choice';
end $$;
do $$ begin
  insert into public.purchases (business_id, membership_id, customer_id, amount, paid_at, source, status)
  select business_id, id, customer_id, 5000, now(), 'receipt', 'verified' from public.memberships limit 1;
  raise exception 'FAILED: customer inserted a verified purchase';
exception when insufficient_privilege then raise notice 'ok - customers cannot fake purchases';
end $$;
do $$ begin
  update public.profiles set phone = '2340000000000';
  raise exception 'FAILED: customer changed verified phone';
exception when insufficient_privilege then raise notice 'ok - the verified phone number cannot be edited';
end $$;
update public.profiles set full_name = 'Someone Else' where id = auth.uid();
select test.ok((select full_name from public.profiles where id = auth.uid()) = 'Someone Else', 'customers type their own name (update 10)');
update public.profiles set gender = 'female' where id = auth.uid();
reset role;
-- The server sets the name from the customer's bank account.
update public.profiles set full_name = 'Ada Obi' where id = '00000000-0000-0000-0000-00000000000a';

-- Bayo joins from Ada's share link -----------------------------------------------
select test.act_as('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select public.join_business('mama-tee-s-kitchen', :'ada_ref') as bayo \gset
select test.ok((select referred_by from public.memberships where id = :'bayo') = :'ada', 'invite link records who shared it');
select test.ok((select count(*) from public.memberships) = 1, 'customers only see their own memberships');
select test.ok((select count(*) from public.rewards) = 1, 'customers only see their own rewards');
reset role;

-- Chi joins with a bogus invite code ---------------------------------------------
select test.act_as('00000000-0000-0000-0000-00000000000c');
set role authenticated;
select public.join_business('MAMA-TEE-S-KITCHEN', 'nope123', true) as chi \gset
select test.ok((select referred_by from public.memberships where id = :'chi') is null, 'unknown invite codes are ignored');
select test.ok((select share_details from public.memberships where id = :'chi'), 'customers can choose to share when joining');
reset role;

-- Receipts (inserted by the server, which uses the service role) -----------------
set role service_role;
insert into public.purchases (business_id, membership_id, customer_id, amount, paid_at, source, status, reference, match_method)
values (:'biz', :'bayo', '00000000-0000-0000-0000-00000000000b', 2500, now(), 'receipt', 'verified', 'REF-B1', 'account');
reset role;
select test.ok((select count(*) from public.rewards where membership_id = :'ada' and kind = 'referral' and status = 'available') = 1,
  'Ada has the invite perk for Bayo (since update 10 it comes when the friend joins)');

set role service_role;
insert into public.purchases (business_id, membership_id, customer_id, amount, paid_at, source, status, reference)
values (:'biz', :'ada', '00000000-0000-0000-0000-00000000000a', 4000, now(), 'receipt', 'verified', 'REF-A1'),
       (:'biz', :'ada', '00000000-0000-0000-0000-00000000000a', 4000, now(), 'receipt', 'verified', 'REF-A2');
reset role;

set role service_role;
insert into public.purchases (business_id, membership_id, customer_id, amount, paid_at, source, status, reference)
values (:'biz', :'ada', '00000000-0000-0000-0000-00000000000a', 4000, now(), 'receipt', 'verified', 'REF-A3')
returning id as a3 \gset
reset role;

do $$ begin
  insert into public.purchases (business_id, membership_id, customer_id, amount, paid_at, source, status, reference)
  select business_id, membership_id, customer_id, 100, now(), 'receipt', 'pending', 'ref-a1' from public.purchases limit 1;
  raise exception 'FAILED: duplicate reference accepted';
exception when unique_violation then raise notice 'ok - the same receipt reference cannot be used twice';
end $$;

-- Owner marks a receipt as not received -----------------------------------------
select test.act_as('00000000-0000-0000-0000-00000000000f');
set role authenticated;
select test.ok((select count(*) from public.business_purchases(:'biz')) = 4, 'owner sees all payments');
select public.set_purchase_status(:'a3', 'rejected');
select public.set_purchase_status(:'a3', 'verified');

-- Owner hands over a perk; it stays given whatever happens to payments later.
select id as visit_reward from public.rewards where membership_id = :'ada' and kind = 'welcome' \gset
select public.redeem_reward(:'visit_reward');
select public.set_purchase_status(:'a3', 'rejected');
select test.ok((select status from public.rewards where id = :'visit_reward') = 'redeemed', 'given perks are never taken back');
select public.set_purchase_status(:'a3', 'verified');

-- Owner records a cash purchase for Chi.
select public.record_purchase(:'chi', 3000, 'Jollof rice') as cash \gset
select test.ok((select status from public.purchases where id = :'cash') = 'verified', 'owner can record a cash purchase');

-- Privacy: names only for members who share --------------------------------------
select test.ok((select count(*) from public.business_members(:'biz')) = 3, 'owner sees all 3 members');
select test.ok((select full_name from public.business_members(:'biz') where membership_id = :'ada') is null,
  'Ada''s name is hidden until she shares');
select test.ok((select phone from public.business_members(:'biz') where membership_id = :'ada') is null,
  'Ada''s phone is hidden until she shares');
select test.ok((select visits from public.business_members(:'biz') where membership_id = :'ada') = 3,
  'owner still sees visit counts for private members');
select test.ok((select members from public.business_stats(:'biz')) = 3, 'stats count members');
select test.ok((select referred_members from public.business_stats(:'biz')) = 1, 'stats count members who came from invites');
reset role;

select test.act_as('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update public.memberships set share_details = true where id = :'ada';
reset role;
update public.profiles set full_name = 'Ada Okafor' where id = '00000000-0000-0000-0000-00000000000a';
select test.act_as('00000000-0000-0000-0000-00000000000a');
set role authenticated;
update public.profiles set birth_month = extract(month from now())::smallint, birth_day = 3
where id = auth.uid();
select test.ok((select count(*) from public.rewards where kind = 'birthday' and status = 'available') = 1,
  'birthday treat arrives when the birthday month is added');
select test.ok((select expires_at from public.rewards where kind = 'birthday') is null,
  'birthday treat has no use-by date unless the business sets one');
select test.ok((select count(*) from public.my_referrals(:'ada')) = 1, 'Ada sees one friend joined from her link');
select test.ok((select has_purchase from public.my_referrals(:'ada')), 'Ada sees that her friend has bought');
select test.ok((select count(*) from public.business_members(:'biz')) = 0, 'customers cannot list a business''s members');
select test.ok((select count(*) from public.business_stats(:'biz')) = 0, 'customers cannot see business stats');
do $$ begin
  perform public.set_purchase_status((select id from public.purchases limit 1), 'verified');
  raise exception 'FAILED: customer approved own purchase';
exception when no_data_found then raise notice 'ok - customers cannot approve their own receipts';
end $$;
reset role;

select test.act_as('00000000-0000-0000-0000-00000000000f');
set role authenticated;
select test.ok((select full_name from public.business_members(:'biz') where membership_id = :'ada') = 'Ada Okafor',
  'profile edits show up for the business straight away');
select test.ok((select member_name from public.business_purchases(:'biz') where membership_id = :'ada' limit 1) = 'Ada Okafor',
  'payments list uses the latest name too');

-- Editing a perk updates unclaimed rewards; pausing hides it from new visitors.
update public.perks set title = 'Free extra beef' where kind = 'welcome' and business_id = :'biz';
select test.ok((select count(*) from public.rewards where kind = 'welcome' and title = 'Free extra beef') >= 2,
  'renaming a perk updates unclaimed rewards');
update public.perks set is_active = false where kind = 'welcome' and business_id = :'biz';
reset role;

select set_config('request.jwt.claims', '', false);
set role anon;
select test.ok((select count(*) from public.perks) = 4, 'paused perks are hidden from the join page');
reset role;

-- Leaving and deleting --------------------------------------------------------------
select test.act_as('00000000-0000-0000-0000-00000000000c');
set role authenticated;
delete from public.memberships where id = :'chi';
reset role;
select test.ok((select count(*) from public.purchases where membership_id = :'chi') = 0, 'leaving removes that membership''s history');

delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select test.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 0,
  'deleting an account removes the profile');
select test.ok((select count(*) from public.purchases where customer_id = '00000000-0000-0000-0000-00000000000a') = 0,
  'deleting an account removes purchases');
select test.ok((select referred_by from public.memberships where id = :'bayo') is null,
  'friends of a deleted account keep their membership');

\echo 'All database tests passed'
