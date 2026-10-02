-- =============================================================================
-- Spendbox update 3: count payments straight from the business's bank (Mono).
--
-- A business connects its bank account through Mono (read-only). Money that
-- comes in is saved here, matched to the member who sent it, and counted as a
-- purchase. Spendbox remembers each sender ("payer"), so their next payment —
-- at this business or any other they've joined — counts by itself.
--
-- Run this after 20261002000000_logos_emails_durations.sql.
-- =============================================================================

-- Bank accounts connected through Mono ---------------------------------------

create table public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  mono_account_id text not null unique,
  institution text,
  account_name text,
  account_number text,
  currency text not null default 'NGN',
  status text not null default 'active' check (status in ('active', 'reauth', 'error')),
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index bank_connections_business_idx on public.bank_connections (business_id);

-- Money that came into a connected account ------------------------------------

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  connection_id uuid references public.bank_connections (id) on delete set null,
  external_id text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'NGN',
  paid_at timestamptz not null,
  narration text,
  sender_name text,
  sender_key text,
  sender_account text,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  purchase_id uuid unique references public.purchases (id) on delete set null,
  match_method text check (match_method in ('payer', 'name', 'recorded', 'manual')),
  created_at timestamptz not null default now(),
  unique (business_id, external_id)
);

create index bank_transactions_open_idx on public.bank_transactions (business_id, paid_at desc)
  where status = 'unmatched';

-- Senders Spendbox has recognised as a customer --------------------------------
-- Belongs to the customer: they see the list and can remove any of it.
-- Businesses never read it.

create table public.payers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  sender_name text,
  sender_key text,
  sender_account text,
  institution text,
  learned_at_business uuid references public.businesses (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (sender_key is not null or sender_account is not null)
);

create unique index payers_customer_key on public.payers (customer_id, sender_key) where sender_key is not null;
create unique index payers_customer_account on public.payers (customer_id, sender_account)
  where sender_account is not null and sender_key is null;
create index payers_key_idx on public.payers (sender_key);
create index payers_account_idx on public.payers (sender_account);

-- "Wrong customer": this sender is not this member, so don't match them again.
create table public.bank_sender_rejections (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  sender text not null,
  created_at timestamptz not null default now(),
  primary key (membership_id, sender)
);

-- Senders a business told us to skip (e.g. the owner moving their own money).
alter table public.businesses add column ignored_senders text[] not null default '{}';

-- Purchases can now come from the bank ----------------------------------------

alter table public.purchases drop constraint purchases_source_check;
alter table public.purchases add constraint purchases_source_check
  check (source in ('receipt', 'business', 'bank'));
alter table public.purchases drop constraint purchases_match_method_check;
alter table public.purchases add constraint purchases_match_method_check
  check (match_method in ('account', 'name', 'manual', 'payer', 'recorded'));

-- =============================================================================
-- Matching
-- =============================================================================

-- Remember that a sender is this customer (or refresh when we last saw them).
create or replace function public.learn_payer(p_customer_id uuid, p_tx public.bank_transactions)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_institution text;
begin
  if p_tx.sender_key is null and p_tx.sender_account is null then
    return;
  end if;
  select institution into v_institution from public.bank_connections where id = p_tx.connection_id;
  if p_tx.sender_key is not null then
    insert into public.payers (customer_id, sender_name, sender_key, sender_account, learned_at_business)
    values (p_customer_id, p_tx.sender_name, p_tx.sender_key, p_tx.sender_account, p_tx.business_id)
    on conflict (customer_id, sender_key) where sender_key is not null
    do update set last_seen_at = now(),
      sender_account = coalesce(excluded.sender_account, public.payers.sender_account);
  else
    insert into public.payers (customer_id, sender_name, sender_account, learned_at_business)
    values (p_customer_id, p_tx.sender_name, p_tx.sender_account, p_tx.business_id)
    on conflict (customer_id, sender_account) where sender_account is not null and sender_key is null
    do update set last_seen_at = now();
  end if;
end $$;

-- Count an incoming payment for a member. Used by the matcher (server) and by
-- the business when it picks the customer. Safe to call twice.
--   p_purchase_id: link to a purchase the business already recorded instead of
--   adding a new one (so the same money isn't counted twice).
create or replace function public.settle_bank_transaction(
  p_tx_id uuid,
  p_membership_id uuid,
  p_method text,
  p_purchase_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
  m public.memberships;
  v_purchase uuid;
begin
  select * into t from public.bank_transactions where id = p_tx_id for update;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if t.status = 'matched' then
    return t.purchase_id;
  end if;
  select * into m from public.memberships where id = p_membership_id and business_id = t.business_id;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  if p_purchase_id is not null then
    select id into v_purchase from public.purchases
    where id = p_purchase_id and membership_id = m.id and source = 'business'
      and not exists (select 1 from public.bank_transactions b where b.purchase_id = p_purchase_id);
    if v_purchase is null then
      raise exception 'Purchase not found' using errcode = 'P0002';
    end if;
  else
    insert into public.purchases (business_id, membership_id, customer_id, amount, currency, paid_at,
      source, match_method, status, reviewed_at)
    values (t.business_id, m.id, m.customer_id, t.amount, t.currency, t.paid_at,
      'bank', p_method, 'verified', now())
    returning id into v_purchase;
  end if;

  update public.bank_transactions
  set status = 'matched', purchase_id = v_purchase, match_method = p_method
  where id = t.id;
  if p_method = 'manual' then
    delete from public.bank_sender_rejections
    where membership_id = m.id and sender in (t.sender_key, t.sender_account);
  end if;

  perform public.learn_payer(m.customer_id, t);
  return v_purchase;
end $$;

-- =============================================================================
-- What businesses can do
-- =============================================================================

-- Payments that came in but nobody has been matched to yet.
create or replace function public.business_unmatched_payments(p_business_id uuid)
returns table (
  id uuid,
  amount numeric,
  currency text,
  paid_at timestamptz,
  narration text,
  sender_name text,
  bank_label text
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.amount, t.currency, t.paid_at, t.narration, t.sender_name,
    case when c.id is not null then coalesce(c.institution, 'Bank') ||
      coalesce(' •••' || right(c.account_number, 4), '') end
  from public.bank_transactions t
  left join public.bank_connections c on c.id = t.connection_id
  where t.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and t.status = 'unmatched'
    and t.paid_at > now() - interval '45 days'
  order by t.paid_at desc
  limit 200;
$$;

-- "This was Member #0012."
create or replace function public.assign_bank_payment(p_tx_id uuid, p_membership_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
begin
  select business_id into v_business from public.bank_transactions where id = p_tx_id;
  if v_business is null or not public.is_business_owner(v_business) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  return public.settle_bank_transaction(p_tx_id, p_membership_id, 'manual');
end $$;

-- "Not a customer" — skip this payment, and optionally everything from this sender.
create or replace function public.ignore_bank_payment(p_tx_id uuid, p_always boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.bank_transactions;
begin
  select * into t from public.bank_transactions where id = p_tx_id;
  if not found or not public.is_business_owner(t.business_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  update public.bank_transactions set status = 'ignored' where id = t.id and status = 'unmatched';
  if p_always and t.sender_key is not null then
    update public.businesses
    set ignored_senders = array_append(ignored_senders, t.sender_key)
    where id = t.business_id and not (t.sender_key = any (ignored_senders));
    update public.bank_transactions set status = 'ignored'
    where business_id = t.business_id and status = 'unmatched' and sender_key = t.sender_key;
  end if;
end $$;

-- "Wrong customer" — undo a bank match and forget that sender for that member.
create or replace function public.unmatch_bank_payment(p_purchase_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.purchases;
  t public.bank_transactions;
begin
  select * into p from public.purchases where id = p_purchase_id;
  if not found or not public.is_business_owner(p.business_id) then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  select * into t from public.bank_transactions where purchase_id = p.id;
  if not found then
    raise exception 'This payment did not come from your bank feed' using errcode = 'P0002';
  end if;

  update public.bank_transactions set status = 'unmatched', purchase_id = null, match_method = null
  where id = t.id;
  -- A purchase the business typed in stays; one we added from the bank goes.
  if p.source = 'bank' then
    delete from public.purchases where id = p.id;
  end if;
  insert into public.bank_sender_rejections (membership_id, sender)
  select p.membership_id, x from unnest(array[t.sender_key, t.sender_account]) x where x is not null
  on conflict do nothing;
  delete from public.payers
  where customer_id = p.customer_id
    and ((t.sender_key is not null and sender_key = t.sender_key)
      or (t.sender_account is not null and sender_account = t.sender_account));
end $$;

-- Payments list: also say who the bank says sent the money.
drop function public.business_purchases(uuid, public.purchase_status, uuid, integer);
create function public.business_purchases(
  p_business_id uuid,
  p_status public.purchase_status default null,
  p_membership_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  membership_id uuid,
  member_no integer,
  member_name text,
  amount numeric,
  currency text,
  paid_at timestamptz,
  description text,
  reference text,
  source text,
  match_method text,
  status public.purchase_status,
  has_receipt boolean,
  bank_label text,
  created_at timestamptz,
  sender_name text,
  from_bank boolean
)
language sql stable security definer set search_path = '' as $$
  select x.id, x.membership_id, m.member_no,
    case when m.share_details then pr.full_name end,
    x.amount, x.currency, x.paid_at, x.description, x.reference,
    x.source, coalesce(t.match_method, x.match_method),
    x.status, x.receipt_path is not null,
    case
      when b.id is not null then b.bank_name || ' •••' || right(b.account_number, 4)
      when c.id is not null then coalesce(c.institution, 'Bank') || coalesce(' •••' || right(c.account_number, 4), '')
    end,
    x.created_at, t.sender_name, t.id is not null
  from public.purchases x
  join public.memberships m on m.id = x.membership_id
  join public.profiles pr on pr.id = x.customer_id
  left join public.bank_accounts b on b.id = x.bank_account_id
  left join public.bank_transactions t on t.purchase_id = x.id
  left join public.bank_connections c on c.id = t.connection_id
  where x.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and (p_status is null or x.status = p_status)
    and (p_membership_id is null or x.membership_id = p_membership_id)
  order by x.paid_at desc, x.created_at desc
  limit least(coalesce(p_limit, 200), 1000);
$$;

-- Home screen numbers: add payments waiting for "who paid this?".
drop function public.business_stats(uuid);
create function public.business_stats(p_business_id uuid)
returns table (
  members bigint,
  members_new bigint,
  sales_week numeric,
  purchases_week bigint,
  pending bigint,
  rewards_ready bigint,
  referred_members bigint,
  unmatched bigint
)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) from public.memberships where business_id = p_business_id),
    (select count(*) from public.memberships
      where business_id = p_business_id and joined_at > now() - interval '7 days'),
    (select coalesce(sum(amount), 0) from public.purchases
      where business_id = p_business_id and status = 'verified' and paid_at > now() - interval '7 days'),
    (select count(*) from public.purchases
      where business_id = p_business_id and status = 'verified' and paid_at > now() - interval '7 days'),
    (select count(*) from public.purchases where business_id = p_business_id and status = 'pending'),
    (select count(*) from public.rewards
      where business_id = p_business_id and status = 'available'
        and (expires_at is null or expires_at > now())),
    (select count(*) from public.memberships
      where business_id = p_business_id and referred_by is not null),
    (select count(*) from public.bank_transactions
      where business_id = p_business_id and status = 'unmatched' and paid_at > now() - interval '45 days')
  where public.is_business_owner(p_business_id);
$$;

-- =============================================================================
-- Row Level Security and permissions
-- =============================================================================

alter table public.bank_connections enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.payers enable row level security;
alter table public.bank_sender_rejections enable row level security;

create policy "Owners see their bank connections" on public.bank_connections
  for select to authenticated using (public.is_business_owner(business_id));
create policy "Owners see money coming in" on public.bank_transactions
  for select to authenticated using (public.is_business_owner(business_id));
create policy "Customers see payers recognised as them" on public.payers
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "Customers remove payers" on public.payers
  for delete to authenticated using (customer_id = (select auth.uid()));

revoke all on public.bank_connections, public.bank_transactions, public.payers, public.bank_sender_rejections
  from anon, authenticated;
-- The Mono account id stays on the server.
grant select (id, business_id, institution, account_name, account_number, currency, status, last_error,
  last_synced_at, created_at) on public.bank_connections to authenticated;
grant select on public.bank_transactions to authenticated;
grant select, delete on public.payers to authenticated;
grant all on public.bank_connections, public.bank_transactions, public.payers, public.bank_sender_rejections
  to service_role;

revoke execute on function public.learn_payer(uuid, public.bank_transactions) from public, anon, authenticated;
revoke execute on function public.settle_bank_transaction(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.settle_bank_transaction(uuid, uuid, text, uuid) to service_role;

revoke execute on function public.business_unmatched_payments(uuid) from public, anon;
revoke execute on function public.assign_bank_payment(uuid, uuid) from public, anon;
revoke execute on function public.ignore_bank_payment(uuid, boolean) from public, anon;
revoke execute on function public.unmatch_bank_payment(uuid) from public, anon;
revoke execute on function public.business_purchases(uuid, public.purchase_status, uuid, integer) from public, anon;
revoke execute on function public.business_stats(uuid) from public, anon;
grant execute on function public.business_unmatched_payments(uuid) to authenticated;
grant execute on function public.assign_bank_payment(uuid, uuid) to authenticated;
grant execute on function public.ignore_bank_payment(uuid, boolean) to authenticated;
grant execute on function public.unmatch_bank_payment(uuid) to authenticated;
grant execute on function public.business_purchases(uuid, public.purchase_status, uuid, integer) to authenticated;
grant execute on function public.business_stats(uuid) to authenticated;
