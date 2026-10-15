-- Newtown, part 106: the passport (docs/PASSPORT.md). A stamp for every real place you go into
-- (its landmarks, named places and railway stations; src/lib/world/passport.ts says which), a
-- small reward for each new one, and a bonus for every area page you complete. One row a stamp.
--
-- Safe to run more than once.

create table if not exists public.passport_stamps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (char_length(region) <= 30),
  place text not null check (place ~ '^[a-z]{2}:[a-z0-9-]{1,80}$'),
  stamped_at timestamptz not null default now(),
  primary key (user_id, region, place)
);
create table if not exists public.passport_areas (
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (char_length(region) <= 30),
  area text not null check (char_length(area) between 1 and 60),
  done_at timestamptz not null default now(),
  primary key (user_id, region, area)
);
alter table public.passport_stamps enable row level security;
alter table public.passport_areas enable row level security;

/** Stamp a place (the server worked out which, and the reward): { new, paid }. Once a place. */
create or replace function public.passport_stamp(p_user uuid, p_region text, p_place text, p_reward numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_new boolean;
  v_pay numeric := round(least(greatest(coalesce(p_reward, 0), 0), 50), 2);
begin
  insert into public.passport_stamps (user_id, region, place) values (p_user, p_region, p_place)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new and v_pay > 0 and exists (select 1 from public.profiles where id = p_user and not is_bot and not frozen) then
    update public.profiles set coins = coins + v_pay where id = p_user;
    perform public.log_coins(p_user, null, 'passport', v_pay, false, 'Passport stamp');
  else
    v_pay := 0;
  end if;
  return jsonb_build_object('new', v_new, 'paid', v_pay);
end $$;

/** A whole area page stamped (the server checked): its bonus, once. True if it's new. */
create or replace function public.passport_area_done(p_user uuid, p_region text, p_area text, p_reward numeric) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_new boolean;
  v_pay numeric := round(least(greatest(coalesce(p_reward, 0), 0), 1000), 2);
begin
  insert into public.passport_areas (user_id, region, area) values (p_user, p_region, p_area)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new and v_pay > 0 then
    update public.profiles set coins = coins + v_pay where id = p_user;
    perform public.log_coins(p_user, null, 'passport', v_pay, false, 'Passport page complete: ' || left(p_area, 40));
  end if;
  return v_new;
end $$;

revoke all on table public.passport_stamps, public.passport_areas from public, anon, authenticated;
grant all on table public.passport_stamps, public.passport_areas to service_role;
revoke all on function public.passport_stamp(uuid, text, text, numeric), public.passport_area_done(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.passport_stamp(uuid, text, text, numeric), public.passport_area_done(uuid, text, text, numeric) to service_role;
