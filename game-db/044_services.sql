-- Newtown, part 44: services between people (docs/SERVICES.md, src/lib/world/services.ts).
--
-- Players who own property offer services (up to 5 open at once); anyone with a life books one, or
-- posts a request with what they'll pay. In-game services are paid in mint: the price is held from
-- the buyer (Savings, then wallet) when booked, and paid to the provider when the buyer confirms it's
-- done, or by itself 6 hours after the provider marks it done, less VAT (into the treasuries). The
-- provider can decline (the buyer gets it back) and the buyer can cancel until it's marked done. A
-- finished in-game service does something for the buyer (the game says what: mind or body). Real-life
-- services are only listed: people agree and pay outside the game.
--
-- Safe to run more than once. Run after parts 1-43.

insert into public.game_settings (key, value, note) values
  ('service_vat',          0.075, 'VAT on in-game services (paid by the provider out of the price)'),
  ('service_release_hours', 6,    'Hours after a job is marked done before it pays the provider by itself'),
  ('service_max_offers',   5,     'Open offers each provider can have'),
  ('service_price_max',    100000, 'Dearest in-game service (mint)')
on conflict (key) do update set note = excluded.note;

create table if not exists public.service_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  kind text not null check (kind in ('game', 'real')),
  category text not null check (char_length(category) <= 40),
  title text not null check (char_length(title) between 3 and 60),
  about text not null check (char_length(about) between 10 and 300),
  price numeric(14,2) not null check (price > 0),
  area text not null check (char_length(area) between 2 and 60),
  phone text check (phone is null or char_length(phone) <= 30),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 30),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists service_offers_region_idx on public.service_offers (region, active, created_at desc);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  kind text not null check (kind in ('game', 'real')),
  category text not null check (char_length(category) <= 40),
  title text not null check (char_length(title) between 3 and 60),
  about text not null check (char_length(about) between 10 and 300),
  budget numeric(14,2) not null check (budget > 0),
  area text not null check (char_length(area) between 2 and 60),
  phone text check (phone is null or char_length(phone) <= 30),
  whatsapp text check (whatsapp is null or char_length(whatsapp) <= 30),
  status text not null default 'open' check (status in ('open', 'taken', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists service_requests_region_idx on public.service_requests (region, status, created_at desc);

create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.service_offers (id) on delete set null,
  request_id uuid references public.service_requests (id) on delete set null,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.profiles (id) on delete cascade,
  region text not null,
  title text not null,
  category text not null,
  price numeric(14,2) not null check (price > 0),
  effect jsonb,
  status text not null default 'held' check (status in ('held', 'done', 'paid', 'refunded')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  settled_at timestamptz
);
create index if not exists service_jobs_buyer_idx on public.service_jobs (buyer_id, created_at desc);
create index if not exists service_jobs_provider_idx on public.service_jobs (provider_id, created_at desc);

create or replace function public.service_owner(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.property_units where owner_id = p_user)
$$;

/** Offer a service (property owners only). */
create or replace function public.service_offer(
  p_user uuid, p_kind text, p_category text, p_title text, p_about text, p_price numeric, p_area text, p_phone text, p_whatsapp text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_region text; v_id uuid;
begin
  select region into v_region from public.lives where user_id = p_user;
  if v_region is null then raise exception 'no_life'; end if;
  if not public.service_owner(p_user) then raise exception 'not_owner'; end if;
  if p_kind = 'game' and p_price > public.setting('service_price_max') then raise exception 'bad_price'; end if;
  if (select count(*) from public.service_offers where user_id = p_user and active) >= public.setting('service_max_offers') then raise exception 'too_many'; end if;
  insert into public.service_offers (user_id, region, kind, category, title, about, price, area, phone, whatsapp)
    values (p_user, v_region, p_kind, p_category, btrim(p_title), btrim(p_about), round(p_price, 2), btrim(p_area), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_whatsapp, '')), ''))
    returning id into v_id;
  return v_id;
end $$;

/** Post a request: what you need and what you'll pay. */
create or replace function public.service_request(
  p_user uuid, p_kind text, p_category text, p_title text, p_about text, p_budget numeric, p_area text, p_phone text, p_whatsapp text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_region text; v_id uuid;
begin
  select region into v_region from public.lives where user_id = p_user;
  if v_region is null then raise exception 'no_life'; end if;
  if p_kind = 'game' and p_budget > public.setting('service_price_max') then raise exception 'bad_price'; end if;
  if (select count(*) from public.service_requests where user_id = p_user and status = 'open') >= 5 then raise exception 'too_many'; end if;
  insert into public.service_requests (user_id, region, kind, category, title, about, budget, area, phone, whatsapp)
    values (p_user, v_region, p_kind, p_category, btrim(p_title), btrim(p_about), round(p_budget, 2), btrim(p_area), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_whatsapp, '')), ''))
    returning id into v_id;
  return v_id;
end $$;

/** Close one of your offers or requests. */
create or replace function public.service_close(p_user uuid, p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.service_offers set active = false where id = p_id and user_id = p_user;
  update public.service_requests set status = 'closed' where id = p_id and user_id = p_user and status = 'open';
$$;

/** Hold an in-game service's price from the buyer and open the job. */
create or replace function public.service_hold(p_buyer uuid, p_provider uuid, p_offer uuid, p_request uuid, p_title text, p_category text, p_price numeric, p_effect jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_region text; v_id uuid;
begin
  if p_buyer = p_provider then raise exception 'own'; end if;
  select region into v_region from public.lives where user_id = p_buyer;
  if v_region is null then raise exception 'no_life'; end if;
  perform 1 from public.profiles where id = p_buyer for update;
  if public.life_can_spend(p_buyer, array['savings']) < p_price then raise exception 'not_enough:%', trim_scale(p_price); end if;
  perform public.life_spend(p_buyer, array['savings'], p_price);
  perform public.log_coins(p_buyer, null, 'service_hold', -p_price, false, 'Held for: ' || left(p_title, 60));
  insert into public.service_jobs (offer_id, request_id, buyer_id, provider_id, region, title, category, price, effect)
    values (p_offer, p_request, p_buyer, p_provider, v_region, left(p_title, 60), p_category, p_price, p_effect)
    returning id into v_id;
  return v_id;
end $$;

/** Book an in-game service from an offer (the game says what it does for you). */
create or replace function public.service_book(p_user uuid, p_offer uuid, p_effect jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o public.service_offers;
begin
  select * into o from public.service_offers where id = p_offer and active and kind = 'game';
  if not found then raise exception 'gone'; end if;
  return public.service_hold(p_user, o.user_id, o.id, null, o.title, o.category, o.price, p_effect);
end $$;

/** Take an in-game request (property owners only): the requester's budget is held. */
create or replace function public.service_take(p_user uuid, p_request uuid, p_effect jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.service_requests; v_id uuid;
begin
  if not public.service_owner(p_user) then raise exception 'not_owner'; end if;
  select * into r from public.service_requests where id = p_request and status = 'open' and kind = 'game' for update;
  if not found then raise exception 'gone'; end if;
  begin
    v_id := public.service_hold(r.user_id, p_user, null, r.id, r.title, r.category, r.budget, p_effect);
  exception when others then
    if sqlerrm like 'not_enough%' then raise exception 'their_funds'; end if;
    raise;
  end;
  update public.service_requests set status = 'taken' where id = r.id;
  return v_id;
end $$;

/** Pay a finished job: the provider gets the price less VAT; the buyer gets what the service does. */
create or replace function public.service_pay(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  j public.service_jobs;
  v_vat numeric;
begin
  select * into j from public.service_jobs where id = p_job for update;
  if j.status not in ('held', 'done') then return; end if;
  v_vat := round(j.price * public.setting('service_vat'), 2);
  update public.service_jobs set status = 'paid', settled_at = now() where id = p_job;
  perform 1 from public.profiles where id = j.provider_id for update;
  update public.profiles set coins = coins + j.price - v_vat where id = j.provider_id;
  perform public.log_coins(j.provider_id, null, 'service_pay', j.price, false, 'For: ' || j.title);
  if v_vat > 0 then
    perform public.log_coins(j.provider_id, null, 'vat', -v_vat, false, 'VAT');
    perform public.pay_tax(j.region, v_vat, 'vat', 'VAT on a service');
  end if;
  if j.effect is not null then
    update public.lives set
      mind = least(100, mind + least(20, greatest(0, coalesce((j.effect ->> 'mind')::numeric, 0)))),
      health = least(100, health + least(20, greatest(0, coalesce((j.effect ->> 'body')::numeric, 0))))
    where user_id = j.buyer_id;
  end if;
end $$;

/** Jobs marked done long enough ago pay by themselves. */
create or replace function public.service_tidy() returns void
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  for v in select id from public.service_jobs where status = 'done'
             and done_at < now() - make_interval(hours => public.setting('service_release_hours')::int) loop
    perform public.service_pay(v);
  end loop;
end $$;

/** Something done to a job: the provider marks it done or declines; the buyer confirms or cancels. */
create or replace function public.service_job(p_user uuid, p_job uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare j public.service_jobs;
begin
  select * into j from public.service_jobs where id = p_job for update;
  if not found then raise exception 'gone'; end if;
  if p_action = 'done' then
    if j.provider_id <> p_user or j.status <> 'held' then raise exception 'not_now'; end if;
    update public.service_jobs set status = 'done', done_at = now() where id = p_job;
  elsif p_action = 'confirm' then
    if j.buyer_id <> p_user or j.status not in ('held', 'done') then raise exception 'not_now'; end if;
    perform public.service_pay(p_job);
  elsif p_action in ('decline', 'cancel') then
    if (p_action = 'decline' and j.provider_id <> p_user) or (p_action = 'cancel' and j.buyer_id <> p_user) or j.status <> 'held' then raise exception 'not_now'; end if;
    update public.service_jobs set status = 'refunded', settled_at = now() where id = p_job;
    update public.profiles set coins = coins + j.price where id = j.buyer_id;
    perform public.log_coins(j.buyer_id, null, 'service_refund', j.price, false, 'Back from: ' || j.title);
    if j.request_id is not null then update public.service_requests set status = 'open' where id = j.request_id and status = 'taken'; end if;
  else
    raise exception 'not_now';
  end if;
end $$;

/** The board: open offers and requests in your region (newest first), your jobs, and whether you can offer. */
create or replace function public.service_board(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_region text;
begin
  perform public.service_tidy();
  select region into v_region from public.lives where user_id = p_user;
  v_region := coalesce(v_region, 'lagos');
  return jsonb_build_object(
    'canOffer', public.service_owner(p_user),
    'offers', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (
      select jsonb_build_object('id', o.id, 'kind', o.kind, 'category', o.category, 'title', o.title, 'about', o.about, 'price', o.price,
        'area', o.area, 'phone', o.phone, 'whatsapp', o.whatsapp, 'provider', coalesce(p.username, 'A player'), 'mine', o.user_id = p_user, 'at', o.created_at) as x
      from public.service_offers o join public.profiles p on p.id = o.user_id
      where o.region = v_region and o.active and not p.frozen and p.age_blocked_at is null
      order by o.created_at desc limit 100) s), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(x order by (x->>'at') desc) from (
      select jsonb_build_object('id', r.id, 'kind', r.kind, 'category', r.category, 'title', r.title, 'about', r.about, 'budget', r.budget,
        'area', r.area, 'phone', r.phone, 'whatsapp', r.whatsapp, 'by', coalesce(p.username, 'A player'), 'mine', r.user_id = p_user, 'status', r.status, 'at', r.created_at) as x
      from public.service_requests r join public.profiles p on p.id = r.user_id
      where r.region = v_region and (r.status = 'open' or (r.user_id = p_user and r.status = 'taken')) and not p.frozen and p.age_blocked_at is null
      order by r.created_at desc limit 100) s), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'category', j.category, 'price', j.price, 'status', j.status,
        'buying', j.buyer_id = p_user, 'other', coalesce(case when j.buyer_id = p_user then pp.username else pb.username end, 'A player'),
        'doneAt', j.done_at, 'createdAt', j.created_at) order by j.created_at desc)
      from public.service_jobs j join public.profiles pb on pb.id = j.buyer_id join public.profiles pp on pp.id = j.provider_id
      where (j.buyer_id = p_user or j.provider_id = p_user) and (j.status in ('held', 'done') or j.settled_at > now() - interval '7 days')), '[]'::jsonb)
  );
end $$;

-- The books: service money moves between players (nothing new is made).
do $$
begin
  revoke all on table public.service_offers, public.service_requests, public.service_jobs from public, anon, authenticated;
  grant all on table public.service_offers, public.service_requests, public.service_jobs to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.service_owner(uuid)', 'public.service_offer(uuid, text, text, text, text, numeric, text, text, text)',
    'public.service_request(uuid, text, text, text, text, numeric, text, text, text)', 'public.service_close(uuid, uuid)',
    'public.service_hold(uuid, uuid, uuid, uuid, text, text, numeric, jsonb)', 'public.service_book(uuid, uuid, jsonb)',
    'public.service_take(uuid, uuid, jsonb)', 'public.service_pay(uuid)', 'public.service_tidy()', 'public.service_job(uuid, uuid, text)',
    'public.service_board(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
