-- Newtown, part 46: the player market (docs/MARKET.md). Players trade property with each other,
-- rent waits for a tenant, and the World Bank lends against property.
--
--  - Selling: put a unit up at an asking price; anyone can buy it at that price. The buyer pays
--    the price and the 3% purchase tax; the seller gets the price less a 2% sale tax. Mint moves
--    from player to player (nothing is made or burned); both taxes go to the treasuries.
--  - Offers: offer any price for a unit someone owns (not their home). The offer and its tax are
--    held from your wallet until it's answered: the owner accepts, refuses or counters; you can
--    accept a counter or withdraw. Offers lapse after a day, and the held mint comes back.
--  - Tenants: a unit let out earns nothing until a tenant moves in. Fair rent finds one in a few
--    hours, cheap rent sooner, high rent later (and earns more once they're in).
--  - World Bank loans: borrow up to half of what your property cost, paid back each game month
--    (60 real hours) with interest. Selling a unit the loan rests on pays the bank first. Miss
--    three payments in a row and the bank takes the property (it goes back to the city).
--
-- Safe to run more than once. Run after parts 1-45.

insert into public.game_settings (key, value, note) values
  ('property_sale_tax',   0.02,  'Tax on selling property to another player (the seller pays; into the treasuries)'),
  ('offer_hours',         24,    'Real hours before an unanswered offer lapses'),
  ('offers_open_max',     5,     'Open offers each player can have at once'),
  ('tenant_wait_hours',   4,     'Real hours a let unit at fair rent waits for a tenant (on average)'),
  ('loan_rate',           0.24,  'World Bank interest a game year'),
  ('loan_ltv',            0.5,   'Most the World Bank lends, as a share of what your property cost'),
  ('loan_month_hours',    60,    'Real hours between loan payments (a game month)'),
  ('loan_misses',         3,     'Missed payments in a row before the bank takes the property'),
  ('world_bank_opening',  5000000, 'What the World Bank opens with (once)')
on conflict (key) do update set note = excluded.note;

-- ============================================================ more on units and sales
alter table public.property_units add column if not exists tenant_from timestamptz;
alter table public.property_units add column if not exists rent_level text not null default 'fair';
alter table public.property_units add column if not exists loan_id bigint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'property_units_rent_level_check') then
    alter table public.property_units add constraint property_units_rent_level_check check (rent_level in ('low', 'fair', 'high'));
  end if;
end $$;
-- Units let out before this part already have their tenant.
update public.property_units set tenant_from = collected_at where let and tenant_from is null;

alter table public.property_sales add column if not exists seller_tax numeric(14,2) not null default 0;

create table if not exists public.property_listings (
  unit_id text primary key references public.property_units (unit_id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  price numeric(14,2) not null check (price > 0),
  created_at timestamptz not null default now()
);
create index if not exists property_listings_seller_idx on public.property_listings (seller_id);

create table if not exists public.property_offers (
  id bigserial primary key,
  unit_id text not null,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  price numeric(14,2) not null check (price > 0),
  -- What's held from the buyer's wallet (the price and the purchase tax).
  held numeric(14,2) not null,
  counter numeric(14,2),
  status text not null default 'open' check (status in ('open', 'countered', 'accepted', 'refused', 'withdrawn', 'lapsed', 'void')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);
create index if not exists property_offers_unit_idx on public.property_offers (unit_id) where status in ('open', 'countered');
create index if not exists property_offers_buyer_idx on public.property_offers (buyer_id, created_at desc);
create index if not exists property_offers_seller_idx on public.property_offers (seller_id, created_at desc);

-- ============================================================ the World Bank
create table if not exists public.loans (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null,
  principal numeric(14,2) not null check (principal > 0),
  balance numeric(14,2) not null,
  rate numeric(6,4) not null,
  instalment numeric(14,2) not null,
  months int not null,
  next_due timestamptz not null,
  missed int not null default 0,
  status text not null default 'open' check (status in ('open', 'repaid', 'defaulted')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists loans_user_idx on public.loans (user_id, created_at desc);
create unique index if not exists loans_one_open on public.loans (user_id) where status = 'open';

insert into public.treasuries (id, name, parent) values ('wb', 'World Bank', null) on conflict (id) do nothing;
do $$
declare v numeric := public.setting('world_bank_opening');
begin
  if not exists (select 1 from public.treasury_ledger where treasury = 'wb' and kind = 'opening') then
    update public.treasuries set balance = balance + v where id = 'wb';
    insert into public.treasury_ledger (treasury, amount, kind, note) values ('wb', v, 'opening', 'Opening balance');
    insert into public.ledger (user_id, round_id, kind, amount, bonus, note) values (null, null, 'treasury_opening', v, false, 'The World Bank opens');
  end if;
end $$;

/** Move mint in or out of a treasury, and record it. */
create or replace function public.treasury_move(p_treasury text, p_amount numeric, p_kind text, p_note text) returns void
language sql security definer set search_path = public as $$
  update public.treasuries set balance = balance + p_amount where id = p_treasury;
  insert into public.treasury_ledger (treasury, amount, kind, note) select p_treasury, p_amount, p_kind, p_note where p_amount <> 0;
$$;

-- ============================================================ tenants and rent
/** How much more (or less) a unit earns at each rent level. */
create or replace function public.rent_factor(p_level text) returns numeric
language sql immutable as $$ select case p_level when 'low' then 0.85 when 'high' then 1.2 else 1 end $$;

/** When a tenant moves in if you let a unit out now at this rent level. */
create or replace function public.tenant_arrives(p_level text) returns timestamptz
language sql volatile as $$
  select now() + make_interval(secs => public.setting('tenant_wait_hours') * 3600
    * case p_level when 'low' then 0.4 when 'high' then 3 else 1 end * (0.5 + random()))
$$;

/** Rent a unit has earned since it was last collected (only while a tenant is in). */
create or replace function public.rent_waiting(u public.property_units) returns numeric
language sql stable as $$
  select case when u.let and u.tenant_from is not null and u.tenant_from < now() then
    round(u.rent_day * public.rent_factor(u.rent_level) * extract(epoch from (now() - greatest(u.collected_at, u.tenant_from))) / 86400, 2)
  else 0 end
$$;

create or replace function public.property_collect(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.property_units;
  v_gross numeric := 0;
  v_tax numeric := 0;
  v_rent numeric;
  v_unit_tax numeric;
begin
  perform 1 from public.profiles where id = p_user for update;
  if not found then raise exception 'unknown_player'; end if;
  for u in select * from public.property_units where owner_id = p_user and let and rent_day > 0 for update loop
    v_rent := public.rent_waiting(u);
    if v_rent <= 0 then continue; end if;
    v_unit_tax := round(v_rent * public.setting('property_rent_tax'), 2);
    perform public.pay_tax(split_part(u.unit_id, ':', 1), v_unit_tax, 'rent_tax', 'Rent tax on ' || u.unit_id);
    update public.property_units set collected_at = now() where unit_id = u.unit_id;
    v_gross := v_gross + v_rent;
    v_tax := v_tax + v_unit_tax;
  end loop;
  if v_gross > 0 then
    perform public.log_coins(p_user, null, 'rent', v_gross, false, 'Rent');
    if v_tax > 0 then perform public.log_coins(p_user, null, 'rent_tax', -v_tax, false, 'Tax on rent'); end if;
    perform public.life_income(p_user, v_gross - v_tax);
  end if;
  return jsonb_build_object('rent', v_gross - v_tax, 'tax', v_tax, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Let one of your units out (or stop): not your home. A tenant moves in after a while. */
create or replace function public.property_let(p_user uuid, p_unit text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_home text;
  v_out jsonb;
  u public.property_units;
begin
  select * into u from public.property_units where unit_id = p_unit and owner_id = p_user for update;
  if not found then raise exception 'not_yours'; end if;
  select home_unit into v_home from public.lives where user_id = p_user;
  if p_on and v_home = p_unit then raise exception 'is_home'; end if;
  v_out := public.property_collect(p_user);
  if coalesce(p_on, false) and not u.let then
    update public.property_units set let = true, collected_at = now(), tenant_from = public.tenant_arrives(u.rent_level) where unit_id = p_unit;
  elsif not coalesce(p_on, false) then
    update public.property_units set let = false, collected_at = now(), tenant_from = null where unit_id = p_unit;
  end if;
  return v_out;
end $$;

/** Set a unit's rent: low, fair or high. If it's let, the tenant leaves and a new one is found at the new rent. */
create or replace function public.property_rent_level(p_user uuid, p_unit text, p_level text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.property_units;
  v_out jsonb := '{}'::jsonb;
begin
  if p_level not in ('low', 'fair', 'high') then raise exception 'bad_level'; end if;
  select * into u from public.property_units where unit_id = p_unit and owner_id = p_user for update;
  if not found then raise exception 'not_yours'; end if;
  if u.rent_level = p_level then return v_out; end if;
  if u.let then
    v_out := public.property_collect(p_user);
    update public.property_units set rent_level = p_level, collected_at = now(), tenant_from = public.tenant_arrives(p_level) where unit_id = p_unit;
  else
    update public.property_units set rent_level = p_level where unit_id = p_unit;
  end if;
  return v_out;
end $$;

-- ============================================================ offers: tidying
/** Give back what an offer held, and close it. */
create or replace function public.offer_close(p_offer bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.property_offers;
begin
  select * into o from public.property_offers where id = p_offer and status in ('open', 'countered') for update;
  if not found then return; end if;
  update public.property_offers set status = p_status, decided_at = now() where id = p_offer;
  update public.profiles set coins = coins + o.held where id = o.buyer_id;
  perform public.log_coins(o.buyer_id, null, 'offer_refund', o.held, false, 'Offer on ' || o.unit_id || ' ' || p_status);
end $$;

/** Offers past their time lapse (the held mint goes back). */
create or replace function public.market_tidy() returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  for v_id in select id from public.property_offers where status in ('open', 'countered') and expires_at < now() loop
    perform public.offer_close(v_id, 'lapsed');
    perform public.notify((select buyer_id from public.property_offers where id = v_id), null, 'market', 'Your offer lapsed: nobody answered in time. Your mint is back.');
  end loop;
end $$;

-- ============================================================ a sale between players
/**
 * Hand a unit from its owner to a buyer at a price. p_held: what the buyer already put down (an
 * offer's hold), taken off what they pay now. The seller's rent so far is collected first, a loan
 * on the unit is paid off first from the price, and every other offer on it is given back.
 */
create or replace function public.market_complete(p_unit text, p_buyer uuid, p_price numeric, p_held numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u public.property_units;
  b public.profiles;
  bl public.lives;
  ln public.loans;
  v_region text := split_part(p_unit, ':', 1);
  v_buy_tax numeric := round(p_price * public.setting('property_buy_tax'), 2);
  v_sale_tax numeric := round(p_price * public.setting('property_sale_tax'), 2);
  v_due numeric;
  v_to_bank numeric := 0;
  v_home boolean := false;
  v_id bigint;
begin
  select * into u from public.property_units where unit_id = p_unit for update;
  if not found then raise exception 'gone'; end if;
  if u.owner_id = p_buyer then raise exception 'yours'; end if;
  if (select home_unit from public.lives where user_id = u.owner_id) = p_unit then raise exception 'is_home'; end if;
  select * into b from public.profiles where id = p_buyer for update;
  if not found or b.is_bot then raise exception 'unknown_player'; end if;
  if b.frozen or b.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into bl from public.lives where user_id = p_buyer for update;
  if not found then raise exception 'no_life'; end if;
  if bl.home_unit is null and u.use <> 'home' then raise exception 'home_first'; end if;
  v_due := p_price + v_buy_tax - coalesce(p_held, 0);
  if b.coins < v_due then raise exception 'not_enough:%', trim_scale(v_due); end if;
  perform 1 from public.profiles where id = u.owner_id for update;

  -- The seller's rent up to now, then the hand-over (a tenant stays in).
  perform public.property_collect(u.owner_id);
  update public.property_units set owner_id = p_buyer, price = p_price, bought_at = now(), collected_at = now(), loan_id = null where unit_id = p_unit;
  delete from public.property_listings where unit_id = p_unit;
  for v_id in select id from public.property_offers where unit_id = p_unit and status in ('open', 'countered') loop
    perform public.offer_close(v_id, 'void');
  end loop;

  -- The buyer pays (what an offer held is already out of their wallet).
  update public.profiles set coins = coins - v_due where id = p_buyer;
  if coalesce(p_held, 0) > 0 then perform public.log_coins(p_buyer, null, 'offer_refund', p_held, false, 'Offer on ' || p_unit || ' accepted'); end if;
  perform public.log_coins(p_buyer, null, 'property_buy', -(p_price + v_buy_tax), false, 'Bought ' || p_unit);
  perform public.pay_tax(v_region, v_buy_tax, 'property_tax', 'Tax on buying ' || p_unit);

  -- The seller is paid, the bank first if the unit stood behind a loan.
  if u.loan_id is not null then
    select * into ln from public.loans where id = u.loan_id and status = 'open' for update;
    if found then
      v_to_bank := least(ln.balance, p_price - v_sale_tax);
      update public.loans set balance = balance - v_to_bank where id = ln.id;
      perform public.treasury_move('wb', v_to_bank, 'loan_repay', 'Loan paid from the sale of ' || p_unit);
      if ln.balance - v_to_bank <= 0.01 then
        update public.loans set status = 'repaid', balance = 0, closed_at = now() where id = ln.id;
        update public.property_units set loan_id = null where loan_id = ln.id;
      end if;
    end if;
  end if;
  update public.profiles set coins = coins + (p_price - v_sale_tax - v_to_bank) where id = u.owner_id;
  perform public.log_coins(u.owner_id, null, 'property_sale', p_price, false, 'Sold ' || p_unit);
  perform public.log_coins(u.owner_id, null, 'sale_tax', -v_sale_tax, false, 'Tax on selling ' || p_unit);
  if v_to_bank > 0 then perform public.log_coins(u.owner_id, null, 'loan_repay', -v_to_bank, false, 'Loan paid from the sale'); end if;
  perform public.pay_tax(v_region, v_sale_tax, 'sale_tax', 'Tax on selling ' || p_unit);

  insert into public.property_sales (unit_id, seller_id, buyer_id, price, tax, seller_tax) values (p_unit, u.owner_id, p_buyer, p_price, v_buy_tax, v_sale_tax);
  if bl.home_unit is null then
    update public.lives set home_unit = p_unit where user_id = p_buyer;
    v_home := true;
  end if;
  perform public.notify(u.owner_id, null, 'market', format('You sold %s for ₥%s.', u.label, trim_scale(p_price)));
  return jsonb_build_object('coins', b.coins - v_due, 'home', v_home, 'tax', v_buy_tax);
end $$;

-- ============================================================ selling
/** Put one of your units up for sale (or change its price). Not your home. */
create or replace function public.market_list(p_user uuid, p_unit text, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_price numeric := round(p_price, 2);
begin
  if v_price is null or v_price <= 0 or v_price > public.setting('property_price_max') then raise exception 'bad_price'; end if;
  if not exists (select 1 from public.property_units where unit_id = p_unit and owner_id = p_user) then raise exception 'not_yours'; end if;
  if (select home_unit from public.lives where user_id = p_user) = p_unit then raise exception 'is_home'; end if;
  insert into public.property_listings (unit_id, seller_id, price) values (p_unit, p_user, v_price)
  on conflict (unit_id) do update set price = excluded.price, created_at = now();
end $$;

create or replace function public.market_unlist(p_user uuid, p_unit text) returns void
language sql security definer set search_path = public as $$
  delete from public.property_listings where unit_id = p_unit and seller_id = p_user
$$;

/** Buy a unit at its asking price. p_price: the price you saw (it mustn't have changed). */
create or replace function public.market_buy(p_user uuid, p_unit text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.property_listings;
begin
  perform public.market_tidy();
  select * into l from public.property_listings where unit_id = p_unit for update;
  if not found then raise exception 'not_for_sale'; end if;
  if l.price <> round(p_price, 2) then raise exception 'price_changed:%', trim_scale(l.price); end if;
  return public.market_complete(p_unit, p_user, l.price, 0);
end $$;

-- ============================================================ offers
/** Offer a price for a unit someone else owns. The price and its tax are held until it's answered. */
create or replace function public.market_offer(p_user uuid, p_unit text, p_price numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  u public.property_units;
  p public.profiles;
  l public.lives;
  v_price numeric := round(p_price, 2);
  v_held numeric;
  v_id bigint;
begin
  perform public.market_tidy();
  if v_price is null or v_price <= 0 or v_price > public.setting('property_price_max') then raise exception 'bad_price'; end if;
  select * into u from public.property_units where unit_id = p_unit;
  if not found then raise exception 'not_owned'; end if;
  if u.owner_id = p_user then raise exception 'yours'; end if;
  if (select home_unit from public.lives where user_id = u.owner_id) = p_unit then raise exception 'is_home'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null and u.use <> 'home' then raise exception 'home_first'; end if;
  if exists (select 1 from public.property_offers where unit_id = p_unit and buyer_id = p_user and status in ('open', 'countered')) then raise exception 'already_offered'; end if;
  if (select count(*) from public.property_offers where buyer_id = p_user and status in ('open', 'countered')) >= public.setting('offers_open_max') then raise exception 'too_many_offers'; end if;
  v_held := v_price + round(v_price * public.setting('property_buy_tax'), 2);
  if p.coins < v_held then raise exception 'not_enough:%', trim_scale(v_held); end if;
  update public.profiles set coins = coins - v_held where id = p_user;
  perform public.log_coins(p_user, null, 'offer_hold', -v_held, false, 'Offer on ' || p_unit);
  insert into public.property_offers (unit_id, buyer_id, seller_id, price, held, expires_at)
  values (p_unit, p_user, u.owner_id, v_price, v_held, now() + make_interval(hours => public.setting('offer_hours')::int))
  returning id into v_id;
  perform public.notify(u.owner_id, null, 'market', format('%s offered ₥%s for %s.', coalesce(p.username, 'A player'), trim_scale(v_price), u.label));
  return v_id;
end $$;

/** The owner answers an offer: accept, refuse, or counter with a higher price. */
create or replace function public.market_answer(p_user uuid, p_offer bigint, p_action text, p_counter numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.property_offers;
begin
  perform public.market_tidy();
  select * into o from public.property_offers where id = p_offer for update;
  if not found or o.status not in ('open', 'countered') then raise exception 'offer_gone'; end if;
  if not exists (select 1 from public.property_units where unit_id = o.unit_id and owner_id = p_user) then raise exception 'not_yours'; end if;
  if p_action = 'accept' then
    if o.status <> 'open' then raise exception 'offer_gone'; end if;
    update public.property_offers set status = 'accepted', decided_at = now() where id = p_offer;
    return public.market_complete(o.unit_id, o.buyer_id, o.price, o.held);
  elsif p_action = 'refuse' then
    perform public.offer_close(p_offer, 'refused');
    perform public.notify(o.buyer_id, null, 'market', 'Your offer was turned down. Your mint is back.');
  elsif p_action = 'counter' then
    if p_counter is null or round(p_counter, 2) <= o.price or p_counter > public.setting('property_price_max') then raise exception 'bad_price'; end if;
    update public.property_offers set status = 'countered', counter = round(p_counter, 2),
      expires_at = now() + make_interval(hours => public.setting('offer_hours')::int) where id = p_offer;
    perform public.notify(o.buyer_id, null, 'market', format('The owner asks ₥%s instead.', trim_scale(round(p_counter, 2))));
  else
    raise exception 'bad_action';
  end if;
  return '{}'::jsonb;
end $$;

/** The buyer takes a counter-offer, or withdraws their offer. */
create or replace function public.market_reply(p_user uuid, p_offer bigint, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.property_offers;
begin
  perform public.market_tidy();
  select * into o from public.property_offers where id = p_offer and buyer_id = p_user for update;
  if not found or o.status not in ('open', 'countered') then raise exception 'offer_gone'; end if;
  if p_action = 'withdraw' then
    perform public.offer_close(p_offer, 'withdrawn');
    return '{}'::jsonb;
  elsif p_action = 'accept' and o.status = 'countered' then
    if not exists (select 1 from public.property_units where unit_id = o.unit_id and owner_id = o.seller_id) then
      perform public.offer_close(p_offer, 'void');
      raise exception 'offer_gone';
    end if;
    update public.property_offers set status = 'accepted', price = o.counter, decided_at = now() where id = p_offer;
    return public.market_complete(o.unit_id, p_user, o.counter, o.held);
  end if;
  raise exception 'bad_action';
end $$;

-- ============================================================ loans
/** What the World Bank would lend you now: half of what your property cost (none while a loan is open). */
create or replace function public.loan_limit(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.loans where user_id = p_user and status = 'open') then 0
    else round(coalesce((select sum(price) from public.property_units where owner_id = p_user), 0) * public.setting('loan_ltv'), 2) end
$$;

/** Borrow from the World Bank against all your property, paid back over p_months game months. */
create or replace function public.loan_take(p_user uuid, p_amount numeric, p_months int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric := round(p_amount, 2);
  v_rate numeric := public.setting('loan_rate');
  v_r numeric := public.setting('loan_rate') / 12;
  v_inst numeric;
  v_region text;
  v_id bigint;
begin
  if p_months not in (6, 12, 24) then raise exception 'bad_months'; end if;
  perform 1 from public.profiles where id = p_user for update;
  select region into v_region from public.lives where user_id = p_user;
  if v_region is null then raise exception 'no_life'; end if;
  perform public.loan_tick(p_user);
  if v_amount is null or v_amount < 10 then raise exception 'bad_amount'; end if;
  if v_amount > public.loan_limit(p_user) then raise exception 'over_limit:%', trim_scale(public.loan_limit(p_user)); end if;
  if (select balance from public.treasuries where id = 'wb') < v_amount then raise exception 'bank_short'; end if;
  v_inst := round(v_amount * v_r / (1 - power(1 + v_r, -p_months)), 2);
  insert into public.loans (user_id, region, principal, balance, rate, instalment, months, next_due)
  values (p_user, v_region, v_amount, v_amount, v_rate, v_inst, p_months, now() + make_interval(hours => public.setting('loan_month_hours')::int))
  returning id into v_id;
  update public.property_units set loan_id = v_id where owner_id = p_user;
  perform public.treasury_move('wb', -v_amount, 'loan_out', 'Loan ' || v_id);
  update public.profiles set coins = coins + v_amount where id = p_user;
  perform public.log_coins(p_user, null, 'loan', v_amount, false, 'World Bank loan');
  return jsonb_build_object('loan', v_id, 'instalment', v_inst);
end $$;

/** The bank takes the property behind a loan: it goes back to the city; the rest is written off. */
create or replace function public.loan_default(p_loan bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  ln public.loans;
  v_unit text;
  v_id bigint;
begin
  select * into ln from public.loans where id = p_loan and status = 'open' for update;
  if not found then return; end if;
  perform public.property_collect(ln.user_id);
  for v_unit in select unit_id from public.property_units where loan_id = p_loan loop
    for v_id in select id from public.property_offers where unit_id = v_unit and status in ('open', 'countered') loop
      perform public.offer_close(v_id, 'void');
    end loop;
    insert into public.property_sales (unit_id, seller_id, buyer_id, price, tax) values (v_unit, ln.user_id, null, 0, 0);
    delete from public.property_units where unit_id = v_unit;
  end loop;
  update public.lives set home_unit = null
    where user_id = ln.user_id and home_unit is not null and not exists (select 1 from public.property_units where unit_id = home_unit);
  update public.loans set status = 'defaulted', closed_at = now() where id = p_loan;
  perform public.notify(ln.user_id, null, 'market', 'You missed your World Bank payments, so the bank took the property behind your loan.');
end $$;

/** Bring a loan up to now: each game month's payment comes from your Savings pot, then your wallet. */
create or replace function public.loan_tick(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ln public.loans;
  v_interest numeric;
  v_pay numeric;
begin
  select * into ln from public.loans where user_id = p_user and status = 'open' for update;
  if not found then return; end if;
  while ln.next_due <= now() loop
    v_interest := round(ln.balance * ln.rate / 12, 2);
    v_pay := least(ln.instalment, ln.balance + v_interest);
    if public.life_can_spend(p_user, array['savings']) >= v_pay then
      perform public.life_spend(p_user, array['savings'], v_pay);
      perform public.log_coins(p_user, null, 'loan_repay', -v_pay, false, 'World Bank payment');
      perform public.treasury_move('wb', v_pay, 'loan_repay', 'Payment on loan ' || ln.id);
      ln.balance := ln.balance + v_interest - v_pay;
      ln.missed := 0;
    else
      ln.balance := ln.balance + v_interest;
      ln.missed := ln.missed + 1;
      perform public.notify(p_user, null, 'market', format('You missed a World Bank payment of ₥%s.', trim_scale(v_pay)));
    end if;
    ln.next_due := ln.next_due + make_interval(hours => public.setting('loan_month_hours')::int);
    if ln.balance <= 0.01 then
      update public.loans set balance = 0, missed = 0, next_due = ln.next_due, status = 'repaid', closed_at = now() where id = ln.id;
      update public.property_units set loan_id = null where loan_id = ln.id;
      return;
    end if;
    update public.loans set balance = ln.balance, missed = ln.missed, next_due = ln.next_due where id = ln.id;
    if ln.missed >= public.setting('loan_misses') then
      perform public.loan_default(ln.id);
      return;
    end if;
  end loop;
end $$;

/** Pay off some or all of your loan early (from Savings, then your wallet). */
create or replace function public.loan_repay(p_user uuid, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ln public.loans;
  v_pay numeric;
begin
  perform public.loan_tick(p_user);
  select * into ln from public.loans where user_id = p_user and status = 'open' for update;
  if not found then raise exception 'no_loan'; end if;
  v_pay := least(round(coalesce(p_amount, 0), 2), ln.balance);
  if v_pay <= 0 then raise exception 'bad_amount'; end if;
  if public.life_can_spend(p_user, array['savings']) < v_pay then raise exception 'not_enough:%', trim_scale(v_pay); end if;
  perform public.life_spend(p_user, array['savings'], v_pay);
  perform public.log_coins(p_user, null, 'loan_repay', -v_pay, false, 'World Bank payment (early)');
  perform public.treasury_move('wb', v_pay, 'loan_repay', 'Early payment on loan ' || ln.id);
  if ln.balance - v_pay <= 0.01 then
    update public.loans set balance = 0, status = 'repaid', closed_at = now() where id = ln.id;
    update public.property_units set loan_id = null where loan_id = ln.id;
  else
    update public.loans set balance = balance - v_pay where id = ln.id;
  end if;
  return jsonb_build_object('balance', greatest(ln.balance - v_pay, 0));
end $$;

-- ============================================================ your home (redone: a home can't be on sale)
create or replace function public.property_set_home(p_user uuid, p_unit text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.property_units where unit_id = p_unit and owner_id = p_user and use = 'home') then raise exception 'not_yours'; end if;
  perform public.property_collect(p_user);
  update public.property_units set let = false, collected_at = now(), tenant_from = null where unit_id = p_unit and let;
  delete from public.property_listings where unit_id = p_unit;
  for v_id in select id from public.property_offers where unit_id = p_unit and status in ('open', 'countered') loop
    perform public.offer_close(v_id, 'void');
  end loop;
  update public.lives set home_unit = p_unit where user_id = p_user;
end $$;

-- ============================================================ reading
/** Your life: home, mint, every unit you own (rent waiting, tenant, sale price, loan). */
create or replace function public.my_assets(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'life', (select to_jsonb(l) - 'user_id' from public.lives l where l.user_id = p_user),
    'coins', (select coins from public.profiles where id = p_user),
    'units', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unit', u.unit_id, 'building', u.building_id, 'label', u.label, 'use', u.use, 'area', u.area,
        'price', u.price, 'rentDay', u.rent_day, 'let', u.let, 'boughtAt', u.bought_at, 'name', b.name,
        'waiting', public.rent_waiting(u), 'tenantFrom', u.tenant_from, 'rentLevel', u.rent_level,
        'forSale', (select price from public.property_listings where unit_id = u.unit_id), 'loan', u.loan_id is not null
      ) order by u.bought_at)
      from public.property_units u join public.property_buildings b using (building_id)
      where u.owner_id = p_user), '[]'::jsonb)
  )
$$;

/** Who owns which units of a building, and which are for sale (and at what price). */
create or replace function public.building_owners(p_building text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('unit', u.unit_id, 'owner', u.owner_id, 'name', coalesce(p.username, 'A player'),
    'forSale', l.price, 'home', exists (select 1 from public.lives v where v.user_id = u.owner_id and v.home_unit = u.unit_id))), '[]'::jsonb)
  from public.property_units u join public.profiles p on p.id = u.owner_id
  left join public.property_listings l on l.unit_id = u.unit_id
  where u.building_id = p_building
$$;

/** Your market: offers you've made and been made, your loan and what you could borrow. */
create or replace function public.market_board(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.market_tidy();
  perform public.loan_tick(p_user);
  return jsonb_build_object(
    'made', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'unit', o.unit_id, 'label', u.label, 'price', o.price, 'counter', o.counter,
        'status', o.status, 'expiresAt', o.expires_at, 'who', coalesce(s.username, 'A player')) order by o.created_at desc)
      from public.property_offers o left join public.property_units u on u.unit_id = o.unit_id left join public.profiles s on s.id = o.seller_id
      where o.buyer_id = p_user and (o.status in ('open', 'countered') or o.decided_at > now() - interval '2 days')), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'unit', o.unit_id, 'label', u.label, 'price', o.price, 'counter', o.counter,
        'status', o.status, 'expiresAt', o.expires_at, 'who', coalesce(b.username, 'A player')) order by o.created_at desc)
      from public.property_offers o join public.property_units u on u.unit_id = o.unit_id and u.owner_id = p_user
      left join public.profiles b on b.id = o.buyer_id
      where o.status in ('open', 'countered')), '[]'::jsonb),
    'loan', (select jsonb_build_object('id', id, 'principal', principal, 'balance', balance, 'rate', rate, 'instalment', instalment,
        'months', months, 'nextDue', next_due, 'missed', missed) from public.loans where user_id = p_user and status = 'open'),
    'canBorrow', public.loan_limit(p_user),
    'rate', public.setting('loan_rate'),
    'misses', public.setting('loan_misses')
  );
end $$;

/** Everything for sale in a region, cheapest first (for the home search). */
create or replace function public.market_listings(p_region text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'price')::numeric), '[]'::jsonb) from (
    select jsonb_build_object('unit', l.unit_id, 'building', u.building_id, 'label', u.label, 'use', u.use, 'price', l.price,
      'who', coalesce(p.username, 'A player'), 'seller', l.seller_id) as x
    from public.property_listings l join public.property_units u using (unit_id) join public.profiles p on p.id = l.seller_id
    where split_part(l.unit_id, ':', 1) = p_region
    order by l.price limit 200
  ) s
$$;

/** Money in and out (redone: sales, loans). */
create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'commute',
                   'health_care', 'gym', 'school_fees', 'procedure', 'hustle_start', 'property_buy', 'start_grant',
                   'property_sale', 'sale_tax', 'loan', 'loan_repay')
    group by kind
    union all
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.property_listings, public.property_offers, public.loans from public, anon, authenticated;
  grant all on table public.property_listings, public.property_offers, public.loans to service_role;
  revoke all on sequence public.property_offers_id_seq, public.loans_id_seq from public, anon, authenticated;
  grant all on sequence public.property_offers_id_seq, public.loans_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.treasury_move(text, numeric, text, text)', 'public.rent_factor(text)', 'public.tenant_arrives(text)',
    'public.rent_waiting(public.property_units)', 'public.property_collect(uuid)', 'public.property_let(uuid, text, boolean)',
    'public.property_rent_level(uuid, text, text)', 'public.offer_close(bigint, text)', 'public.market_tidy()',
    'public.market_complete(text, uuid, numeric, numeric)', 'public.market_list(uuid, text, numeric)', 'public.market_unlist(uuid, text)',
    'public.market_buy(uuid, text, numeric)', 'public.market_offer(uuid, text, numeric)', 'public.market_answer(uuid, bigint, text, numeric)',
    'public.market_reply(uuid, bigint, text)', 'public.loan_limit(uuid)', 'public.loan_take(uuid, numeric, int)', 'public.loan_default(bigint)',
    'public.loan_tick(uuid)', 'public.loan_repay(uuid, numeric)', 'public.property_set_home(uuid, text)', 'public.my_assets(uuid)',
    'public.building_owners(text)', 'public.market_board(uuid)', 'public.market_listings(text)', 'public.life_money(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
