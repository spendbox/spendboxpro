-- =============================================================================
-- Spendbox update 4: sales from the bank, on the business's home screen.
--
-- Keeps the account balance Mono reports, brings in the account's past
-- payments (marked "history": shown in sales, never matched to members), and
-- adds totals per day and per month.
--
-- Run this after 20261003000000_bank_feeds.sql.
-- =============================================================================

alter table public.bank_connections
  add column balance numeric(16, 2),
  add column balance_at timestamptz,
  add column data_status text,
  add column history_synced_at timestamptz,
  add column last_fetch_count integer;

grant select (balance, balance_at, data_status, history_synced_at, last_fetch_count)
  on public.bank_connections to authenticated;

-- Payments from before the bank was connected: sales history only.
alter table public.bank_transactions drop constraint bank_transactions_status_check;
alter table public.bank_transactions add constraint bank_transactions_status_check
  check (status in ('unmatched', 'matched', 'ignored', 'history'));

create index bank_transactions_paid_idx on public.bank_transactions (business_id, paid_at desc);

-- Money in per day for one month (days in the business's time zone).
-- "Not a customer" payments (status ignored) are left out: they aren't sales.
create or replace function public.business_sales_days(p_business_id uuid, p_month date, p_tz text default 'Africa/Lagos')
returns table (day date, total numeric, payments bigint, from_members bigint)
language sql stable security definer set search_path = '' as $$
  select (t.paid_at at time zone p_tz)::date as day,
    sum(t.amount), count(*), count(*) filter (where t.status = 'matched')
  from public.bank_transactions t
  where t.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and t.status <> 'ignored'
    and (t.paid_at at time zone p_tz) >= date_trunc('month', p_month)
    and (t.paid_at at time zone p_tz) < date_trunc('month', p_month) + interval '1 month'
  group by 1
  order by 1;
$$;

-- Money in per month (the last two years), newest first.
create or replace function public.business_sales_months(p_business_id uuid, p_tz text default 'Africa/Lagos')
returns table (month date, total numeric, payments bigint)
language sql stable security definer set search_path = '' as $$
  select date_trunc('month', t.paid_at at time zone p_tz)::date, sum(t.amount), count(*)
  from public.bank_transactions t
  where t.business_id = p_business_id
    and public.is_business_owner(p_business_id)
    and t.status <> 'ignored'
    and t.paid_at > now() - interval '25 months'
  group by 1
  order by 1 desc;
$$;

revoke execute on function public.business_sales_days(uuid, date, text) from public, anon;
revoke execute on function public.business_sales_months(uuid, text) from public, anon;
grant execute on function public.business_sales_days(uuid, date, text) to authenticated;
grant execute on function public.business_sales_months(uuid, text) to authenticated;
