-- Newtown, part 82: buy a landmark (docs/LANDMARKS.md).
--   1. Every landmark on the map (a stadium, the airport, a cathedral, a market...) can be bought
--      outright by one player, for crazy money (₦50bn to ₦2tn; the game works out the price from
--      the map, src/lib/world/landmark-price.ts, never the phone). The price is burned, like
--      property bought from the city. Once someone owns it, it's theirs: nobody else can buy it.
--   2. A landmark you own earns like your property does (part 79): the same share of what you paid
--      for it every day (property_income_day), paid by property_income_settle.
--
-- landmark_id is "<region>:<landmark id>" ("lagos:national-stadium"): the landmark's own id, which
-- stays the same for good even if it moves on the map.
--
-- Safe to run more than once. Run after part 79.

insert into public.game_settings (key, value, note) values
  ('landmark_price_max', 5000000000, 'Dearest landmark the game will sell, in mint (a sanity check)')
on conflict (key) do update set note = excluded.note;

create table if not exists public.landmark_owners (
  landmark_id text primary key check (landmark_id ~ '^[a-z0-9-]+:[a-z0-9-]+$'),
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  -- Null: the owner's account was deleted (it's back on the market).
  owner_id uuid references public.profiles (id) on delete set null,
  name text check (name is null or char_length(name) <= 80),
  price numeric(14,2) not null check (price > 0),
  bought_at timestamptz not null default now()
);
create index if not exists landmark_owners_owner_idx on public.landmark_owners (owner_id);
create index if not exists landmark_owners_region_idx on public.landmark_owners (region);
alter table public.landmark_owners enable row level security; -- no policies: only the server reads it

/** What your property earns a day (mint): the share of what you paid for each unit (free rooms earn nothing) and each landmark you own. */
create or replace function public.property_income_day(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(
    (coalesce((select sum(coalesce(u.income_base, u.price)) from public.property_units u
               where u.owner_id = p_user and not coalesce(u.starter, false)), 0)
     + coalesce((select sum(m.price) from public.landmark_owners m where m.owner_id = p_user), 0))
    * coalesce(public.setting('property_income_day'), 0), 4)
$$;

/** A landmark bought or changing hands: what both owners have earned so far is paid first, at their old rates. */
create or replace function public.landmark_income_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is not null then perform public.property_income_settle(new.owner_id); end if;
  elsif new.owner_id is distinct from old.owner_id or new.price is distinct from old.price then
    if old.owner_id is not null then perform public.property_income_settle(old.owner_id); end if;
    if new.owner_id is not null and new.owner_id is distinct from old.owner_id then perform public.property_income_settle(new.owner_id); end if;
  end if;
  return new;
end $$;
drop trigger if exists landmark_income_guard on public.landmark_owners;
create trigger landmark_income_guard before insert or update of owner_id, price on public.landmark_owners
  for each row execute function public.landmark_income_guard();

/**
 * Buy a landmark nobody owns, at the price the game worked out (p_price, mint, after your
 * reputation discount). p_name: what it's called, for the owner list and the note. Returns your
 * coins after and what it earns you a day.
 */
create or replace function public.landmark_buy(p_user uuid, p_region text, p_landmark text, p_name text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_price numeric := round(p_price, 2);
  v_name text := left(coalesce(nullif(trim(p_name), ''), split_part(p_landmark, ':', 2)), 80);
  v_day numeric;
begin
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_region'; end if;
  if p_landmark is null or p_landmark !~ '^[a-z0-9-]+:[a-z0-9-]+$' or split_part(p_landmark, ':', 1) <> p_region then raise exception 'bad_landmark'; end if;
  if v_price is null or v_price <= 0 or v_price > coalesce(public.setting('landmark_price_max'), 5000000000) then raise exception 'bad_price'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  -- One buyer at a time for each landmark.
  perform pg_advisory_xact_lock(hashtext('landmark:' || p_landmark));
  if exists (select 1 from public.landmark_owners where landmark_id = p_landmark and owner_id is not null) then raise exception 'taken'; end if;
  if p.coins < v_price then raise exception 'not_enough:%', trim_scale(v_price); end if;

  insert into public.landmark_owners (landmark_id, region, owner_id, name, price, bought_at)
  values (p_landmark, p_region, p_user, v_name, v_price, now())
  on conflict (landmark_id) do update set owner_id = excluded.owner_id, name = excluded.name, price = excluded.price, bought_at = excluded.bought_at;

  update public.profiles set coins = coins - v_price where id = p_user;
  perform public.log_coins(p_user, null, 'landmark_buy', -v_price, false, 'Bought ' || v_name);
  perform public.burn(null, v_price, 'Landmark bought from the city');
  v_day := round(v_price * coalesce(public.setting('property_income_day'), 0), 2);
  perform public.notify(p_user, null, 'property', 'You own ' || v_name || ' now! It earns you ' || trim_scale(v_day) || ' mint a day.');
  return jsonb_build_object('coins', (select coins from public.profiles where id = p_user), 'price', v_price, 'per_day', v_day);
end $$;

/** Who owns which landmarks in a region (for the map and the landmark cards). */
create or replace function public.landmark_owners_list(p_region text)
returns table (landmark_id text, owner_id uuid, owner_name text, name text, price numeric, bought_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.landmark_id, m.owner_id, coalesce(nullif(pr.username, ''), 'Someone'), m.name, m.price, m.bought_at
  from public.landmark_owners m
  join public.profiles pr on pr.id = m.owner_id
  where m.region = p_region
  order by m.bought_at
$$;

revoke all on table public.landmark_owners from public, anon, authenticated;
grant select, insert, update, delete on table public.landmark_owners to service_role;
revoke all on function public.property_income_day(uuid), public.landmark_income_guard(), public.landmark_buy(uuid, text, text, text, numeric), public.landmark_owners_list(text) from public, anon, authenticated;
grant execute on function public.property_income_day(uuid), public.landmark_buy(uuid, text, text, text, numeric), public.landmark_owners_list(text) to service_role;
