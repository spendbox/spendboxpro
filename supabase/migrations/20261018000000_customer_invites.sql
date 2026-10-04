-- =============================================================================
-- Spendbox update 18: customers who bring a business become its customers.
--
-- A customer's "Invite more plugs" link carries their own invite code. When a
-- business signs up from that link, the customer is added to the new
-- business's customers straight away (and gets its welcome perk, like anyone
-- who joins).
--
--   my_invite_code()      the signed-in customer's code (made the first time)
--   claim_inviter(id, c)  the new business's owner, right after signing up,
--                         adds the customer with code c. Only once, only in
--                         the business's first day, and never the owner.
--
-- Safe to run more than once. Run this after 20261017000000_plug_partners.sql.
-- =============================================================================

alter table public.profiles add column if not exists invite_code text unique;
-- Which customer brought each business (kept private: only these functions read it).
create table if not exists public.business_inviters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.business_inviters enable row level security;
revoke all on public.business_inviters from public, anon, authenticated;

create or replace function public.my_invite_code() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'Please sign in first' using errcode = '28000';
  end if;
  select invite_code into v_code from public.profiles where id = v_uid;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_code := public.gen_ref_code();
    exit when not exists (select 1 from public.profiles where invite_code = v_code);
  end loop;
  update public.profiles set invite_code = v_code where id = v_uid and invite_code is null;
  select invite_code into v_code from public.profiles where id = v_uid;
  return v_code;
end $$;

create or replace function public.claim_inviter(p_business_id uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_business public.businesses;
  v_inviter uuid;
  v_no integer;
begin
  if v_uid is null or p_code is null or p_code = '' then
    return false;
  end if;
  select * into v_business from public.businesses where id = p_business_id for update;
  if not found or v_business.owner_id <> v_uid or v_business.created_at < now() - interval '1 day'
    or exists (select 1 from public.business_inviters where business_id = p_business_id) then
    return false;
  end if;
  select id into v_inviter from public.profiles where invite_code = lower(trim(p_code));
  if v_inviter is null or v_inviter = v_uid then
    return false;
  end if;

  insert into public.business_inviters (business_id, customer_id) values (p_business_id, v_inviter);
  if not exists (select 1 from public.memberships where business_id = p_business_id and customer_id = v_inviter) then
    select coalesce(max(member_no), 0) + 1 into v_no from public.memberships where business_id = p_business_id;
    insert into public.memberships (business_id, customer_id, member_no, ref_code)
    values (p_business_id, v_inviter, v_no, public.gen_ref_code());
  end if;
  return true;
end $$;

revoke execute on function public.my_invite_code() from public, anon;
grant execute on function public.my_invite_code() to authenticated;
revoke execute on function public.claim_inviter(uuid, text) from public, anon;
grant execute on function public.claim_inviter(uuid, text) to authenticated;
