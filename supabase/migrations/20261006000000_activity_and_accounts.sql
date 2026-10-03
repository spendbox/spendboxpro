-- =============================================================================
-- Spendbox update 6: an activity log customers can see, undoing a typed-in
-- purchase within an hour, and customers' own bank accounts.
--
-- Run this after 20261005000000_partners.sql.
-- =============================================================================

-- Activity log ----------------------------------------------------------------
-- Everything a business does that touches a customer's purchases or perks is
-- written here automatically, so the customer can see it ("transparency").

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  membership_id uuid,
  kind text not null check (kind in (
    'purchase_recorded', 'purchase_bank', 'purchase_receipt', 'purchase_confirmed', 'purchase_rejected',
    'purchase_deleted', 'purchase_unmatched',
    'perk_earned', 'perk_given', 'perk_ungiven', 'perk_taken_back', 'perk_restored', 'perk_deleted'
  )),
  title text,
  amount numeric(14, 2),
  currency text,
  created_at timestamptz not null default now()
);

create index audit_events_customer_idx on public.audit_events (customer_id, created_at desc);
create index audit_events_business_idx on public.audit_events (business_id, created_at desc);

create or replace function public.log_event(
  p_business_id uuid, p_customer_id uuid, p_membership_id uuid, p_kind text,
  p_title text default null, p_amount numeric default null, p_currency text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Skip while a membership or account is being deleted (nothing to tell anyone).
  if p_membership_id is not null and not exists (select 1 from public.memberships where id = p_membership_id) then
    return;
  end if;
  insert into public.audit_events (business_id, customer_id, membership_id, kind, title, amount, currency)
  values (p_business_id, p_customer_id, p_membership_id, p_kind, p_title, p_amount, p_currency);
end $$;

create or replace function public.trg_audit_purchase() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.business_id, new.customer_id, new.membership_id,
      case new.source when 'business' then 'purchase_recorded' when 'bank' then 'purchase_bank' else 'purchase_receipt' end,
      new.description, new.amount, new.currency);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status and new.status in ('verified', 'rejected') then
      perform public.log_event(new.business_id, new.customer_id, new.membership_id,
        case new.status when 'verified' then 'purchase_confirmed' else 'purchase_rejected' end,
        new.description, new.amount, new.currency);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.log_event(old.business_id, old.customer_id, old.membership_id,
      case when old.source = 'bank' then 'purchase_unmatched' else 'purchase_deleted' end,
      old.description, old.amount, old.currency);
  end if;
  return null;
end $$;

create trigger purchases_audit after insert or update of status or delete on public.purchases
for each row execute function public.trg_audit_purchase();

create or replace function public.trg_audit_reward() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.business_id, new.customer_id, new.membership_id, 'perk_earned', new.title);
  elsif new.status is distinct from old.status then
    perform public.log_event(new.business_id, new.customer_id, new.membership_id,
      case
        when new.status = 'redeemed' then 'perk_given'
        when old.status = 'redeemed' then 'perk_ungiven'
        when new.status = 'void' then 'perk_taken_back'
        else 'perk_restored'
      end,
      new.title);
  end if;
  return null;
end $$;

create trigger rewards_audit after insert or update of status on public.rewards
for each row execute function public.trg_audit_reward();

-- A business deleting a perk card tells everyone who still had it to use.
create or replace function public.trg_audit_perk_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events (business_id, customer_id, membership_id, kind, title)
  select r.business_id, r.customer_id, r.membership_id, 'perk_deleted', old.title
  from public.rewards r
  where r.perk_id = old.id and r.status = 'available';
  return old;
end $$;

create trigger perks_audit_delete before delete on public.perks
for each row execute function public.trg_audit_perk_deleted();

alter table public.audit_events enable row level security;
create policy "Customers see their activity" on public.audit_events
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "Owners see their business's activity" on public.audit_events
  for select to authenticated using (public.is_business_owner(business_id));
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;

-- Undo a typed-in purchase (within an hour) -----------------------------------

create or replace function public.delete_recorded_purchase(p_purchase_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.purchases;
begin
  select * into p from public.purchases where id = p_purchase_id;
  if not found or not public.is_business_owner(p.business_id) or p.source <> 'business' then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if p.created_at < now() - interval '1 hour' then
    raise exception 'Purchases can only be deleted within an hour of adding them' using errcode = 'P0001';
  end if;
  -- If a bank payment was linked to it, that payment waits to be matched again.
  update public.bank_transactions set status = 'unmatched', purchase_id = null, match_method = null
  where purchase_id = p.id;
  delete from public.purchases where id = p.id;
end $$;

-- Customers' own bank accounts -------------------------------------------------
-- A customer adds the accounts they usually pay from. The server confirms the
-- name with the bank (Paystack) and saves it as a recognised sender, which is
-- what the payment matcher uses. Their Spendbox name comes from the first one.

alter table public.payers
  add column bank_code text check (char_length(bank_code) <= 20),
  add column verified boolean not null default false;

-- A verified account belongs to one Spendbox customer.
create unique index payers_verified_account on public.payers (sender_account) where verified;

-- Names now come from the bank, so customers can't type their own.
revoke update (full_name) on public.profiles from authenticated;

revoke execute on function public.log_event(uuid, uuid, uuid, text, text, numeric, text) from public, anon, authenticated;
revoke execute on function public.trg_audit_purchase() from public, anon, authenticated;
revoke execute on function public.trg_audit_reward() from public, anon, authenticated;
revoke execute on function public.trg_audit_perk_deleted() from public, anon, authenticated;
revoke execute on function public.delete_recorded_purchase(uuid) from public, anon;
grant execute on function public.delete_recorded_purchase(uuid) to authenticated;
