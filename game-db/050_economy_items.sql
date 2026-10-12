-- Newtown, part 50: a kinder economy, and things to own.
--
-- Pay. Jobs and side hustles pay four times real Lagos wages (src/lib/world/work.ts PAY_BOOST, in
-- every city), so the caps that check what the game sends go up, and jobs and hustles people
-- already have get the same raise, once.
--
-- Safe to run more than once. Run after parts 1-49.

-- ============================================================ pay four times real wages
update public.game_settings set value = greatest(value, 1000), note = 'Most a job on the real map can pay every 2 hours (mint, before skill bonus)' where key = 'work_pay_max';
update public.game_settings set value = greatest(value, 400), note = 'Most a side hustle can earn every 2 hours (mint, before swing and boost)' where key = 'hustle_pay_max';
insert into public.game_settings (key, value, note) values
  ('pay_boost_done', 0, 'Set to 1 once the jobs and hustles people had got the 4x raise (part 50)')
on conflict (key) do nothing;
do $$
begin
  if public.setting('pay_boost_done') = 0 then
    update public.life_jobs set pay_day = round(pay_day * 4, 2);
    update public.life_hustles set pay_day = round(pay_day * 4, 2);
    update public.game_settings set value = 1 where key = 'pay_boost_done';
  end if;
end $$;

-- ============================================================ money day by day
/**
 * Your money by day (Lagos days, the last p_days of them, oldest first): what you earned (pay,
 * hustles, rent, sales), what living cost you (tax, bills, getting about, health, school, fees),
 * and what you bought to keep (property, cars, items, starting a hustle). Earned minus costs says
 * whether you're up or down; buying things to keep is spending into what you own, so it's shown
 * apart.
 */
create or replace function public.life_money_days(p_user uuid, p_days int) returns jsonb
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(
      (date_trunc('day', now() at time zone 'Africa/Lagos') - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) - 1)),
      date_trunc('day', now() at time zone 'Africa/Lagos'), interval '1 day') as day
  ),
  rows as (
    select date_trunc('day', created_at at time zone 'Africa/Lagos') as day, kind, amount from public.ledger
    where user_id = p_user and created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) + 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(d.day, 'YYYY-MM-DD'),
    'earned', round(coalesce((select sum(amount) from rows r where r.day = d.day and r.amount > 0
      and r.kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'property_sale', 'item_sale', 'car_sale', 'service_pay')), 0), 2),
    'costs', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('income_tax', 'rent_tax', 'vat', 'sale_tax', 'power_bill', 'waste_bill', 'commute', 'health_care', 'gym', 'school_fees',
                     'procedure', 'loan_repay', 'market_fee', 'item_tax', 'car_running')), 0), 2),
    'bought', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('property_buy', 'property_tax', 'hustle_start', 'item_buy', 'car_buy', 'craft_cost')), 0), 2)
  ) order by d.day), '[]'::jsonb)
  from days d
$$;

do $$
begin
  revoke all on function public.life_money_days(uuid, int) from public, anon, authenticated;
  grant execute on function public.life_money_days(uuid, int) to service_role;
end $$;

-- ============================================================ items, the market, crafting, cars, reputation
-- Things people own (src/lib/world/items.ts works out every price, worth and effect; these check
-- balances and ownership and keep the record). A kind is a shop kind ('gold_chain', 'car_camry')
-- or an invention a player made ('inv-12'). Every item is one row with its owner.

insert into public.game_settings (key, value, note) values
  ('item_price_max',   200000, 'Dearest item or car (mint, a sanity check)'),
  ('items_max',        200,    'Most items one player can hold'),
  ('listings_max',     20,     'Most items one player can have up for sale at once'),
  ('crafts_open_max',  2,      'Crafts one player can have under way at once')
on conflict (key) do update set note = excluded.note;

alter table public.lives add column if not exists rep_penalty numeric(10,2) not null default 0;

/** Inventions: new kinds of things players made. */
create table if not exists public.item_kinds (
  id text primary key check (id ~ '^inv-[0-9]+$'),
  creator uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(name) between 3 and 40),
  category text not null check (category in ('jewellery', 'clothing', 'book', 'gadget', 'home', 'art', 'fitness')),
  effect jsonb not null default '{}'::jsonb,
  base_value numeric(14,2) not null check (base_value > 0),
  made int not null default 0,
  sold int not null default 0,
  created_at timestamptz not null default now()
);
create sequence if not exists public.item_kinds_seq;

create table if not exists public.items (
  id bigserial primary key,
  owner uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,30}$' or kind ~ '^inv-[0-9]+$'),
  name text not null check (char_length(name) between 1 and 60),
  category text not null check (category in ('jewellery', 'clothing', 'book', 'gadget', 'home', 'art', 'fitness', 'car')),
  -- What it was worth when it was made (mint): its worth now moves from here (items.ts itemWorth).
  base_value numeric(14,2) not null check (base_value >= 0),
  effect jsonb not null default '{}'::jsonb,
  quality numeric(4,2) not null default 1,
  made_at timestamptz not null default now(),
  got_at timestamptz not null default now(),
  how text not null check (how in ('bought', 'found', 'stolen', 'gift', 'crafted', 'market')),
  list_price numeric(14,2) check (list_price is null or list_price > 0),
  listed_at timestamptz
);
create index if not exists items_owner_idx on public.items (owner);
create index if not exists items_listed_idx on public.items (kind, list_price) where list_price is not null;

/** Every sale on the market, for what a kind is really worth. */
create table if not exists public.item_trades (
  id bigserial primary key,
  kind text not null,
  price numeric(14,2) not null,
  seller uuid references public.profiles (id) on delete set null,
  buyer uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists item_trades_kind_idx on public.item_trades (kind, created_at desc);

/** Crafts under way: what's being made, and when it's done. */
create table if not exists public.crafts (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  spec jsonb not null,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  done_at timestamptz
);
create index if not exists crafts_user_idx on public.crafts (user_id, done_at);

/** The last few market prices of a kind (mint, average), or null. */
create or replace function public.item_recent_price(p_kind text) returns numeric
language sql stable security definer set search_path = public as $$
  select round(avg(price), 2) from (select price from public.item_trades where kind = p_kind order by created_at desc limit 10) t
$$;

/**
 * Get an item: bought from a shop (p_cost from Savings, then the wallet), found, swiped, or the
 * game's own (crafted). The game says what it is and what it's worth.
 */
create or replace function public.item_get(
  p_user uuid, p_kind text, p_name text, p_category text, p_value numeric, p_effect jsonb, p_how text, p_cost numeric
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_cost numeric := round(coalesce(p_cost, 0), 2);
  v_id bigint;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if coalesce(p_value, 0) < 0 or p_value > public.setting('item_price_max') or v_cost < 0 or v_cost > public.setting('item_price_max') then raise exception 'bad_item'; end if;
  if p_how not in ('bought', 'found', 'stolen', 'crafted') then raise exception 'bad_item'; end if;
  if (select count(*) from public.items where owner = p_user) >= public.setting('items_max') then raise exception 'too_many_items'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, case when p_category = 'car' then 'car_buy' else 'item_buy' end, -v_cost, false, 'Bought: ' || left(p_name, 50));
    perform public.burn(null, v_cost, 'Shops and car dealers');
  end if;
  insert into public.items (owner, kind, name, category, base_value, effect, how)
    values (p_user, p_kind, left(p_name, 60), p_category, round(p_value, 2), coalesce(p_effect, '{}'::jsonb), p_how)
    returning id into v_id;
  return v_id;
end $$;

/** Caught swiping something: a fine (wallet then pots, as much as there is) and reputation lost. */
create or replace function public.item_caught(p_user uuid, p_fine numeric, p_rep numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_paid numeric;
begin
  v_paid := public.life_spend(p_user, array['fun', 'savings', 'essentials'], least(greatest(coalesce(p_fine, 0), 0), public.setting('item_price_max')));
  if v_paid > 0 then
    perform public.log_coins(p_user, null, 'fine', -v_paid, false, 'Fine for shoplifting');
    perform public.pay_tax((select region from public.lives where user_id = p_user), v_paid, 'fines', 'A shoplifting fine');
  end if;
  update public.lives set rep_penalty = rep_penalty + least(greatest(coalesce(p_rep, 0), 0), 100), mind = greatest(0, mind - 5) where user_id = p_user;
  return v_paid;
end $$;

/** Give one of your things to another player (by their name). */
create or replace function public.item_gift(p_user uuid, p_item bigint, p_to text) returns text
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
  v_to uuid;
  v_name text;
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
  select id, username into v_to, v_name from public.profiles where lower(username) = lower(btrim(p_to)) and not is_bot;
  if v_to is null then raise exception 'no_player'; end if;
  if v_to = p_user then raise exception 'self'; end if;
  if exists (select 1 from public.blocks where blocker = v_to and blocked = p_user) then raise exception 'blocked'; end if;
  if (select count(*) from public.items where owner = v_to) >= public.setting('items_max') then raise exception 'their_items_full'; end if;
  update public.items set owner = v_to, how = 'gift', got_at = now(), list_price = null, listed_at = null where id = p_item;
  perform public.notify(v_to, null, 'gift', (select username from public.profiles where id = p_user) || ' gave you ' || i.name || '!', null);
  return v_name;
end $$;

/** Put one of your things up for sale (a small fee, p_fee, from your wallet then pots), or change its price. */
create or replace function public.item_list(p_user uuid, p_item bigint, p_price numeric, p_fee numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
  v_fee numeric := round(greatest(coalesce(p_fee, 0), 0), 2);
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
  if coalesce(p_price, 0) <= 0 or p_price > public.setting('item_price_max') then raise exception 'bad_price'; end if;
  if i.list_price is null and (select count(*) from public.items where owner = p_user and list_price is not null) >= public.setting('listings_max') then
    raise exception 'too_many_listings';
  end if;
  if v_fee > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    perform public.life_spend(p_user, array['fun', 'savings'], v_fee);
    perform public.log_coins(p_user, null, 'market_fee', -v_fee, false, 'Listing: ' || left(i.name, 50));
    perform public.burn(null, v_fee, 'Market listing fees');
  end if;
  update public.items set list_price = round(p_price, 2), listed_at = coalesce(listed_at, now()) where id = p_item;
end $$;

create or replace function public.item_unlist(p_user uuid, p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.items set list_price = null, listed_at = null where id = p_item and owner = p_user;
  if not found then raise exception 'not_yours'; end if;
end $$;

/** Buy something listed on the market at its price (p_price must match). The sale is taxed (p_tax: a share). */
create or replace function public.item_buy(p_user uuid, p_item bigint, p_price numeric, p_tax numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i public.items;
  v_tax numeric;
  v_region text;
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.list_price is null then raise exception 'gone'; end if;
  if i.owner = p_user then raise exception 'yours'; end if;
  if i.list_price <> round(p_price, 2) then raise exception 'price_changed:%', trim_scale(i.list_price); end if;
  if (select count(*) from public.items where owner = p_user) >= public.setting('items_max') then raise exception 'too_many_items'; end if;
  if public.life_can_spend(p_user, array['savings']) < i.list_price then raise exception 'not_enough:%', trim_scale(i.list_price); end if;
  perform public.life_spend(p_user, array['savings'], i.list_price);
  perform public.log_coins(p_user, null, case when i.category = 'car' then 'car_buy' else 'item_buy' end, -i.list_price, false, 'Bought on the market: ' || left(i.name, 40));
  v_tax := round(i.list_price * least(greatest(coalesce(p_tax, 0), 0), 0.5), 2);
  perform public.log_coins(i.owner, null, case when i.category = 'car' then 'car_sale' else 'item_sale' end, i.list_price, false, 'Sold on the market: ' || left(i.name, 40));
  if v_tax > 0 then
    perform public.log_coins(i.owner, null, 'item_tax', -v_tax, false, 'Tax on a market sale');
    select region into v_region from public.lives where user_id = i.owner;
    perform public.pay_tax(coalesce(v_region, 'lagos'), v_tax, 'sales_tax', 'Tax on a market sale');
  end if;
  perform public.life_income(i.owner, i.list_price - v_tax);
  perform public.notify(i.owner, null, 'market', 'Your ' || i.name || ' sold for ' || trim_scale(i.list_price) || ' mint.', null);
  insert into public.item_trades (kind, price, seller, buyer) values (i.kind, i.list_price, i.owner, p_user);
  update public.item_kinds set sold = sold + 1 where id = i.kind;
  update public.items set owner = p_user, how = 'market', got_at = now(), list_price = null, listed_at = null where id = p_item;
  return jsonb_build_object('price', i.list_price, 'coins', (select coins from public.profiles where id = p_user));
end $$;

/** Sell straight to the city's shops (p_amount: what the game offers, a share of its worth). */
create or replace function public.item_sell_city(p_user uuid, p_item bigint, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare i public.items;
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
  if coalesce(p_amount, 0) < 0 or p_amount > public.setting('item_price_max') then raise exception 'bad_price'; end if;
  delete from public.items where id = p_item;
  if p_amount > 0 then
    perform public.log_coins(p_user, null, case when i.category = 'car' then 'car_sale' else 'item_sale' end, round(p_amount, 2), false, 'Sold to a shop: ' || left(i.name, 40));
    perform public.life_income(p_user, round(p_amount, 2));
  end if;
  return round(p_amount, 2);
end $$;

/** Start a craft: materials paid now (p_cost), done at p_ends (the game works out both). */
create or replace function public.craft_start(p_user uuid, p_spec jsonb, p_cost numeric, p_hours numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(coalesce(p_cost, 0), 2);
  v_id bigint;
begin
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if (select count(*) from public.crafts where user_id = p_user and done_at is null) >= public.setting('crafts_open_max') then raise exception 'busy_crafting'; end if;
  if v_cost < 0 or v_cost > public.setting('item_price_max') or coalesce(p_hours, 0) <= 0 or p_hours > 48 then raise exception 'bad_item'; end if;
  if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
  if v_cost > 0 then
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'craft_cost', -v_cost, false, 'Materials: ' || left(coalesce(p_spec->>'name', 'a craft'), 40));
    perform public.burn(null, v_cost, 'Craft materials');
  end if;
  insert into public.crafts (user_id, spec, ends_at) values (p_user, p_spec, now() + make_interval(secs => p_hours * 3600)) returning id into v_id;
  return v_id;
end $$;

/**
 * A finished craft becomes a new kind of thing (an invention, with the game's worth and effect)
 * and its copies, all yours. Only once, and only when it's done.
 */
create or replace function public.craft_finish(p_user uuid, p_craft bigint, p_value numeric, p_effect jsonb, p_copies int) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.crafts;
  v_kind text;
begin
  select * into c from public.crafts where id = p_craft and user_id = p_user for update;
  if not found then raise exception 'no_craft'; end if;
  if c.done_at is not null then raise exception 'already'; end if;
  if c.ends_at > now() then raise exception 'not_done'; end if;
  if coalesce(p_value, 0) <= 0 or p_value > public.setting('item_price_max') or coalesce(p_copies, 0) < 1 or p_copies > 10 then raise exception 'bad_item'; end if;
  v_kind := 'inv-' || nextval('public.item_kinds_seq');
  insert into public.item_kinds (id, creator, name, category, effect, base_value, made)
    values (v_kind, p_user, left(c.spec->>'name', 40), c.spec->>'category', coalesce(p_effect, '{}'::jsonb), round(p_value, 2), p_copies);
  insert into public.items (owner, kind, name, category, base_value, effect, quality, how)
    select p_user, v_kind, left(c.spec->>'name', 40), c.spec->>'category', round(p_value, 2), coalesce(p_effect, '{}'::jsonb), coalesce((c.spec->>'quality')::numeric, 1), 'crafted'
    from generate_series(1, p_copies);
  update public.crafts set done_at = now() where id = p_craft;
  return v_kind;
end $$;

/** Your things, crafts under way, and what you need for reputation. */
create or replace function public.my_items(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'name', i.name, 'category', i.category, 'base', i.base_value,
        'effect', i.effect, 'quality', i.quality, 'madeAt', i.made_at, 'gotAt', i.got_at, 'how', i.how, 'listPrice', i.list_price,
        'recent', public.item_recent_price(i.kind)) order by i.got_at desc) from public.items i where i.owner = p_user), '[]'::jsonb),
    'crafts', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'spec', c.spec, 'startedAt', c.started_at, 'endsAt', c.ends_at) order by c.started_at)
        from public.crafts c where c.user_id = p_user and c.done_at is null), '[]'::jsonb),
    'crafted', (select count(*) from public.crafts where user_id = p_user and done_at is not null),
    'inventionsSold', coalesce((select sum(sold) from public.item_kinds where creator = p_user), 0),
    'penalty', coalesce((select rep_penalty from public.lives where user_id = p_user), 0),
    'courses', (select count(*) from public.life_courses where user_id = p_user and done_at is not null)
  )
$$;

/** What's up for sale on the market (cheapest first, a kind or all), with who made inventions. */
create or replace function public.market_items(p_user uuid, p_category text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'price')::numeric), '[]'::jsonb) from (
    select jsonb_build_object('id', i.id, 'kind', i.kind, 'name', i.name, 'category', i.category, 'base', i.base_value, 'effect', i.effect,
      'madeAt', i.made_at, 'price', i.list_price, 'seller', coalesce(p.username, 'Someone'), 'mine', i.owner = p_user,
      'maker', (select coalesce(m.username, 'Someone') from public.item_kinds k left join public.profiles m on m.id = k.creator where k.id = i.kind),
      'recent', public.item_recent_price(i.kind)) as x
    from public.items i left join public.profiles p on p.id = i.owner
    where i.list_price is not null and (p_category is null or p_category = 'all' or i.category = p_category)
    order by i.list_price limit 200
  ) s
$$;

/** The newest inventions and the best sellers (for the News and the market). */
create or replace function public.inventions_top(p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'category', k.category, 'maker', coalesce(p.username, 'Someone'),
    'sold', k.sold, 'effect', k.effect, 'at', k.created_at) order by k.created_at desc), '[]'::jsonb)
  from (select * from public.item_kinds order by created_at desc limit least(greatest(coalesce(p_limit, 10), 1), 50)) k
  left join public.profiles p on p.id = k.creator
$$;

-- ---- getting to work in your own car
do $$
begin
  alter table public.life_jobs drop constraint if exists life_jobs_mode_check;
  alter table public.life_jobs add constraint life_jobs_mode_check check (mode in ('walk', 'keke', 'okada', 'danfo', 'taxi', 'car'));
end $$;

create or replace function public.life_work_take(
  p_user uuid, p_region text, p_place text, p_place_name text, p_job text, p_title text, p_skill text,
  p_pay_day numeric, p_need_level int, p_mode text, p_old_fare numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  l public.lives;
  v_level int;
  v_out jsonb;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select * into l from public.lives where user_id = p_user;
  if not found then raise exception 'no_life'; end if;
  if l.home_unit is null then raise exception 'home_first'; end if;
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' or p_place is null or p_place !~ ('^' || p_region || ':-?[0-9]+,-?[0-9]+$')
     or p_job !~ '^[a-z_]{2,30}$' or p_skill !~ '^[a-z_]{2,30}$' then raise exception 'bad_job'; end if;
  if coalesce(p_pay_day, 0) <= 0 or p_pay_day > public.setting('work_pay_max') then raise exception 'bad_job'; end if;
  if p_mode is null or p_mode not in ('walk', 'keke', 'okada', 'danfo', 'taxi', 'car') then raise exception 'bad_mode'; end if;
  if p_mode = 'car' and not exists (select 1 from public.items where owner = p_user and category = 'car') then raise exception 'no_car'; end if;
  if exists (select 1 from public.life_jobs where user_id = p_user and place_id = p_place and job = p_job) then raise exception 'already'; end if;
  select public.life_skill_level(days) into v_level from public.life_skills where user_id = p_user and skill = p_skill;
  if coalesce(v_level, 0) < coalesce(p_need_level, 0) then raise exception 'need_level:%', p_need_level; end if;

  v_out := public.life_work_collect(p_user, p_old_fare);
  delete from public.life_jobs where user_id = p_user;
  insert into public.life_jobs (user_id, region, place_id, place_name, job, title, skill, pay_day, mode)
    values (p_user, p_region, p_place, left(coalesce(p_place_name, 'Work'), 120), p_job, left(p_title, 60), p_skill, round(p_pay_day, 2), p_mode);
  return jsonb_build_object('hired', true, 'collected', v_out, 'coins', (select coins from public.profiles where id = p_user));
end $$;

create or replace function public.life_work_mode(p_user uuid, p_mode text, p_old_fare numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_out jsonb;
begin
  if p_mode is null or p_mode not in ('walk', 'keke', 'okada', 'danfo', 'taxi', 'car') then raise exception 'bad_mode'; end if;
  if p_mode = 'car' and not exists (select 1 from public.items where owner = p_user and category = 'car') then raise exception 'no_car'; end if;
  if not exists (select 1 from public.life_jobs where user_id = p_user) then raise exception 'no_job'; end if;
  v_out := public.life_work_collect(p_user, p_old_fare);
  update public.life_jobs set mode = p_mode where user_id = p_user;
  return v_out;
end $$;

do $$
begin
  revoke all on table public.items, public.item_kinds, public.item_trades, public.crafts from public, anon, authenticated;
  grant all on table public.items, public.item_kinds, public.item_trades, public.crafts to service_role;
  revoke all on sequence public.items_id_seq, public.item_trades_id_seq, public.crafts_id_seq, public.item_kinds_seq from public, anon, authenticated;
  grant all on sequence public.items_id_seq, public.item_trades_id_seq, public.crafts_id_seq, public.item_kinds_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.item_recent_price(text)', 'public.item_get(uuid, text, text, text, numeric, jsonb, text, numeric)', 'public.item_caught(uuid, numeric, numeric)',
    'public.item_gift(uuid, bigint, text)', 'public.item_list(uuid, bigint, numeric, numeric)', 'public.item_unlist(uuid, bigint)',
    'public.item_buy(uuid, bigint, numeric, numeric)', 'public.item_sell_city(uuid, bigint, numeric)', 'public.craft_start(uuid, jsonb, numeric, numeric)',
    'public.craft_finish(uuid, bigint, numeric, jsonb, int)', 'public.my_items(uuid)', 'public.market_items(uuid, text)', 'public.inventions_top(int)',
    'public.life_work_take(uuid, text, text, text, text, text, text, numeric, int, text, numeric)', 'public.life_work_mode(uuid, text, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
