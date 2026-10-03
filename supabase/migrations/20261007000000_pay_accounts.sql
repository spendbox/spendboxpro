-- =============================================================================
-- Spendbox update 7: members can see where to pay.
--
-- A business's members (and the owner) can see the bank accounts it gets paid
-- into, so they can transfer to the right one. Nobody else can.
--
-- Run this after 20261006000000_activity_and_accounts.sql.
-- =============================================================================

create or replace function public.business_pay_accounts(p_business_id uuid)
returns table (institution text, account_name text, account_number text)
language sql stable security definer set search_path = '' as $$
  with allowed as (
    select 1 where public.is_business_owner(p_business_id)
      or exists (select 1 from public.memberships m where m.business_id = p_business_id and m.customer_id = (select auth.uid()))
  ),
  accounts as (
    select c.institution, c.account_name, c.account_number
    from public.bank_connections c
    where c.business_id = p_business_id and c.account_number is not null
    union
    select b.bank_name, b.account_name, b.account_number
    from public.bank_accounts b
    where b.business_id = p_business_id
  )
  select a.institution, a.account_name, a.account_number
  from accounts a, allowed
  order by a.institution;
$$;

revoke execute on function public.business_pay_accounts(uuid) from public, anon;
grant execute on function public.business_pay_accounts(uuid) to authenticated;
