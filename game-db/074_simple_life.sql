-- Newtown, part 74: the simple life (docs/MONEY.md, docs/STARTER_ROOMS.md). Real Lagos prices and
-- modest money: a new life starts with ₦250,000 and a free room to live in (one free move, given
-- back when you buy a home of your own or stop playing for 60 days). Jobs, side hustles, bills,
-- food and the body-and-mind meters are switched off: money comes from the daily gift, games,
-- events and top-ups.
--
-- Safe to run more than once.

-- ============================================================ starting money
update public.game_settings set value = 166.67, note = 'Mint to start a life on the real map with (once): ₦250,000 in Lagos'
  where key = 'start_grant';

-- ============================================================ free starter rooms
-- A free room is an ordinary home unit marked `starter`: it can't be bought by anyone else (it's
-- taken), and it can't be sold, let, listed or borrowed against. Buying a home of your own gives it
-- back (and makes the new one your home). Not playing for 60 days gives it back too; you get a
-- fresh one the moment you come back.
alter table public.property_units add column if not exists starter boolean not null default false;
alter table public.lives add column if not exists starter_moves int not null default 0;
create index if not exists property_units_starter_idx on public.property_units (owner_id) where starter;

/** A free room can't change hands, be let, or carry a loan. */
create or replace function public.starter_guard() returns trigger
language plpgsql as $$
begin
  if old.starter and (new.owner_id is distinct from old.owner_id or new.let or new.loan_id is not null) then
    raise exception 'starter_room';
  end if;
  return new;
end $$;
drop trigger if exists starter_guard on public.property_units;
create trigger starter_guard before update on public.property_units for each row execute function public.starter_guard();

/** Nor can it be put up for sale. */
create or replace function public.starter_no_listing() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.property_units where unit_id = new.unit_id and starter) then raise exception 'starter_room'; end if;
  return new;
end $$;
drop trigger if exists starter_no_listing on public.property_listings;
create trigger starter_no_listing before insert on public.property_listings for each row execute function public.starter_no_listing();

/** A home of your own (bought from the city or a player): your free room goes back, and the new one is home. */
create or replace function public.starter_give_back() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_room text;
begin
  if new.starter or new.use <> 'home' then return new; end if;
  select unit_id into v_room from public.property_units where owner_id = new.owner_id and starter limit 1;
  if v_room is null then return new; end if;
  update public.lives set home_unit = new.unit_id where user_id = new.owner_id and (home_unit = v_room or home_unit is null);
  delete from public.property_units where unit_id = v_room;
  return new;
end $$;
drop trigger if exists starter_give_back on public.property_units;
create trigger starter_give_back after insert or update of owner_id on public.property_units
  for each row execute function public.starter_give_back();

/**
 * Give a player a free room (p_unit, chosen by the server from the city's rooming houses), or move
 * them to another one (once). p_snapshot: the building as the map has it (saved on first use).
 * Returns { unit, moved }.
 */
create or replace function public.starter_room_give(p_user uuid, p_region text, p_unit text, p_snapshot jsonb, p_label text, p_area numeric, p_move boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_building text := split_part(p_unit, '/', 1);
  v_old text;
begin
  if p_unit is null or p_unit !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$' or split_part(v_building, ':', 1) <> p_region then raise exception 'bad_unit'; end if;
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  select unit_id into v_old from public.property_units where owner_id = p_user and starter limit 1;
  if p_move then
    if v_old is null then raise exception 'no_room'; end if;
    if l.starter_moves >= 1 then raise exception 'moved'; end if;
  else
    if v_old is not null then return jsonb_build_object('unit', v_old, 'moved', false, 'already', true); end if;
    if l.home_unit is not null and exists (select 1 from public.property_units where unit_id = l.home_unit and owner_id = p_user) then raise exception 'has_home'; end if;
  end if;
  if exists (select 1 from public.property_units where unit_id = p_unit) then raise exception 'taken'; end if;
  insert into public.property_buildings (building_id, region, snapshot) values (v_building, p_region, p_snapshot)
  on conflict (building_id) do nothing;
  if v_old is not null then delete from public.property_units where unit_id = v_old; end if;
  insert into public.property_units (unit_id, building_id, owner_id, label, use, area, price, rent_day, starter)
  values (p_unit, v_building, p_user, left(coalesce(p_label, 'Room'), 60), 'home', greatest(coalesce(p_area, 12), 1), 0.01, 0, true);
  update public.lives set home_unit = p_unit, at_place = case when v_old is not null and at_place = split_part(v_old, '/', 1) then v_building else at_place end,
    starter_moves = starter_moves + case when p_move then 1 else 0 end
  where user_id = p_user;
  return jsonb_build_object('unit', p_unit, 'moved', p_move);
end $$;

/** Free rooms of players away 60 days or more go back to the city (they get a fresh one when they're back). */
create or replace function public.starter_rooms_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  with gone as (
    delete from public.property_units u
    using public.lives l
    where u.starter and l.user_id = u.owner_id and coalesce(l.seen_at, l.started_at) < now() - interval '60 days'
    returning u.unit_id, u.owner_id
  )
  update public.lives l set home_unit = null, starter_moves = 0
  from gone where l.user_id = gone.owner_id and l.home_unit = gone.unit_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.starter_room_give(uuid, text, text, jsonb, text, numeric, boolean), public.starter_rooms_sweep() from public, anon, authenticated;
