-- =============================================================================
-- Spendbox update 2: business logos and categories, emails for notifications,
-- bank codes (for Paystack account-name lookup) and how long perks last.
--
-- Run this after 20261001000000_spendbox.sql (SQL Editor → New query → Run).
-- =============================================================================

-- Businesses: several categories, a logo and a contact email -----------------

alter table public.businesses
  add column categories text[] not null default '{}' check (cardinality(categories) <= 6),
  add column logo_url text check (char_length(logo_url) <= 500),
  add column email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200);

alter table public.businesses alter column brand_color set default '#2A772C';

update public.businesses set categories = array[category] where category is not null and categories = '{}';

-- Bank code (from Paystack's bank list) so account names can be looked up.
alter table public.bank_accounts add column bank_code text check (char_length(bank_code) <= 20);

-- Customers: optional email for notifications. Never shown to businesses.
alter table public.profiles
  add column email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  add column email_notifications boolean not null default true;

-- Perks: how many days a customer has to use a perk once earned (null = no limit).
alter table public.perks add column valid_days integer check (valid_days between 1 and 365);

-- Rewards: when the customer was told by email.
alter table public.rewards add column notified_at timestamptz;
create index rewards_unnotified_idx on public.rewards (issued_at) where notified_at is null;

-- New rewards get their use-by date from the perk's duration.
create or replace function public.trg_reward_set_expiry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_days integer;
begin
  select valid_days into v_days from public.perks where id = new.perk_id;
  if v_days is not null then
    new.expires_at := new.issued_at + make_interval(days => v_days);
  end if;
  return new;
end $$;

create trigger rewards_set_expiry before insert on public.rewards
for each row execute function public.trg_reward_set_expiry();

-- Changing a perk's duration also moves the use-by date of unused rewards.
create or replace function public.trg_perk_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if new.title is distinct from old.title then
    update public.rewards set title = new.title
    where perk_id = new.id and status = 'available';
  end if;
  if new.valid_days is distinct from old.valid_days then
    update public.rewards
    set expires_at = case
      when new.valid_days is null then null
      else issued_at + make_interval(days => new.valid_days)
    end
    where perk_id = new.id and status = 'available';
  end if;
  if new.threshold is distinct from old.threshold or new.is_active is distinct from old.is_active then
    for r in select id from public.memberships where business_id = new.business_id loop
      perform public.sync_member_rewards(r.id);
    end loop;
  end if;
  return null;
end $$;

-- Permissions for the new columns ------------------------------------------

grant update (categories, logo_url, email) on public.businesses to authenticated;
grant update (email, email_notifications) on public.profiles to authenticated;
revoke execute on function public.trg_reward_set_expiry() from public, anon, authenticated;
revoke execute on function public.trg_perk_changed() from public, anon, authenticated;

-- Public bucket for business logos (shown on join pages). Only the server writes to it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
