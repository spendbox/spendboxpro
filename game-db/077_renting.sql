-- Newtown, part 77: renting a home (docs/MONEY.md, "Renting"). Instead of buying, rent a home nobody
-- owns from the city, a month (30 days) at a time: 6% of what it's worth a month, the same as
-- landlords in the game earn for letting. It's paid up front and again each month from your wallet;
-- when you can't pay, the lease ends and you're back in a free room. Buying a home of your own ends
-- the lease. Nobody else can buy or rent a home while it's rented.
--
-- Safe to run more than once.

create table if not exists public.home_rentals (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  unit_id text not null unique check (unit_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$'),
  label text not null default 'Home',
  rent numeric(14,2) not null check (rent > 0),
  started_at timestamptz not null default now(),
  paid_until timestamptz not null
);
alter table public.home_rentals enable row level security;

/** Rent a home from the city for a month (p_rent: a month's rent in mint, worked out by the server). */
create or replace function public.rent_home(p_user uuid, p_unit text, p_label text, p_rent numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_rent numeric := round(coalesce(p_rent, 0), 2);
begin
  if p_unit is null or p_unit !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$' then raise exception 'bad_unit'; end if;
  if v_rent <= 0 or v_rent > public.setting('property_price_max') then raise exception 'bad_price'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if exists (select 1 from public.property_units where unit_id = p_unit) then raise exception 'taken'; end if;
  if exists (select 1 from public.home_rentals where unit_id = p_unit and user_id <> p_user) then raise exception 'taken'; end if;
  if p.coins < v_rent then raise exception 'not_enough:%', trim_scale(v_rent); end if;
  -- A home already rented elsewhere ends (no refund); your free room goes back.
  delete from public.home_rentals where user_id = p_user;
  delete from public.property_units where owner_id = p_user and starter;
  insert into public.home_rentals (user_id, unit_id, label, rent, paid_until)
  values (p_user, p_unit, left(coalesce(p_label, 'Home'), 60), v_rent, now() + interval '30 days');
  update public.profiles set coins = coins - v_rent where id = p_user;
  perform public.log_coins(p_user, null, 'home_rent', -v_rent, false, 'Rent: ' || p_unit);
  perform public.burn(null, v_rent, 'Rent to the city');
  update public.lives set home_unit = p_unit where user_id = p_user;
  return jsonb_build_object('unit', p_unit, 'paid_until', now() + interval '30 days', 'coins', p.coins - v_rent);
end $$;

/**
 * Bring your lease up to date: each month that's come due is paid from your wallet; when it can't
 * be, the lease ends (you're back in a free room). Returns { renting, ended, paid }.
 */
create or replace function public.rent_settle(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.home_rentals;
  v_coins numeric;
  v_paid int := 0;
begin
  select * into r from public.home_rentals where user_id = p_user for update;
  if not found then return jsonb_build_object('renting', false); end if;
  while r.paid_until <= now() loop
    select coins into v_coins from public.profiles where id = p_user for update;
    if v_coins < r.rent then
      delete from public.home_rentals where user_id = p_user;
      update public.lives set home_unit = null where user_id = p_user and home_unit = r.unit_id;
      perform public.notify(p_user, null, 'rent', 'Your rent was due and your wallet was short, so you moved out. You''re back in a free room.');
      return jsonb_build_object('renting', false, 'ended', true, 'paid', v_paid);
    end if;
    update public.profiles set coins = coins - r.rent where id = p_user;
    perform public.log_coins(p_user, null, 'home_rent', -r.rent, false, 'Rent: ' || r.unit_id);
    perform public.burn(null, r.rent, 'Rent to the city');
    r.paid_until := r.paid_until + interval '30 days';
    v_paid := v_paid + 1;
  end loop;
  update public.home_rentals set paid_until = r.paid_until where user_id = p_user;
  if v_paid > 0 then perform public.notify(p_user, null, 'rent', 'Rent paid for another month.'); end if;
  return jsonb_build_object('renting', true, 'paid', v_paid, 'unit', r.unit_id, 'rent', r.rent, 'paid_until', r.paid_until, 'label', r.label);
end $$;

/** Move out of a rented home (no refund): back to a free room. */
create or replace function public.rent_end(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_unit text;
begin
  delete from public.home_rentals where user_id = p_user returning unit_id into v_unit;
  if v_unit is not null then update public.lives set home_unit = null where user_id = p_user and home_unit = v_unit; end if;
end $$;

/** Nobody can buy a home someone's renting; buying your own home ends your lease. */
create or replace function public.rental_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rented text;
begin
  if exists (select 1 from public.home_rentals where unit_id = new.unit_id and user_id <> new.owner_id) then raise exception 'taken'; end if;
  if tg_op = 'INSERT' and new.use = 'home' and not new.starter then
    delete from public.home_rentals where user_id = new.owner_id returning unit_id into v_rented;
    if v_rented is not null then
      update public.lives set home_unit = new.unit_id where user_id = new.owner_id and (home_unit = v_rented or home_unit is null);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rental_guard on public.property_units;
create trigger rental_guard before insert or update of owner_id on public.property_units for each row execute function public.rental_guard();

revoke all on function public.rent_home(uuid, text, text, numeric), public.rent_settle(uuid), public.rent_end(uuid) from public, anon, authenticated;
