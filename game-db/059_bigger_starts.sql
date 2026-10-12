-- Newtown, part 59: bigger starts. A free life starts with ₥6,500 (was ₥5,000); the packs grew too
-- (src/lib/world/packs.ts: 26,000 / 65,000 / 200,000, Rich Family being ₦300m of game money).
-- The packs' mint is stored with each payment, so only the free start lives here.
--
-- Also: visits counted by day (guests and players) for the online button's numbers.
--
-- Safe to run more than once. Run after part 58.

update public.game_settings set value = 6500 where key = 'start_grant' and value < 6500;

-- ============================================================ visits by day (the online button's numbers)
-- Every visit (signed in or not, once per browser session) is counted by day, so anyone can see
-- how Newtown is growing: visits, and how many of them were guests or players.
create table if not exists public.site_visits_daily (
  day date primary key,
  visits bigint not null default 0,
  guests bigint not null default 0,
  members bigint not null default 0
);
alter table public.site_visits_daily enable row level security;

create or replace function public.count_visit_by(p_member boolean) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  update public.site_counters set value = value + 1 where key = 'visits' returning value into v;
  insert into public.site_visits_daily (day, visits, guests, members)
    values ((now() at time zone 'Africa/Lagos')::date, 1, case when p_member then 0 else 1 end, case when p_member then 1 else 0 end)
    on conflict (day) do update set visits = site_visits_daily.visits + 1,
      guests = site_visits_daily.guests + excluded.guests, members = site_visits_daily.members + excluded.members;
  return v;
end $$;

/** The numbers behind the online button: visits all time and by day, players and sign-ups by day (last 30 days). */
create or replace function public.site_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series((now() at time zone 'Africa/Lagos')::date - 29, (now() at time zone 'Africa/Lagos')::date, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'visits', coalesce((select value from public.site_counters where key = 'visits'), 0),
    'registered', (select count(*) from public.profiles where not is_bot),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'visits', coalesce(v.visits, 0),
        'guests', coalesce(v.guests, 0),
        'members', coalesce(v.members, 0),
        'signups', (select count(*) from public.profiles p where not p.is_bot and (p.created_at at time zone 'Africa/Lagos')::date = d.day)
      ) order by d.day) from days d left join public.site_visits_daily v on v.day = d.day), '[]'::jsonb)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array['public.count_visit_by(boolean)', 'public.site_stats()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  revoke all on table public.site_visits_daily from public, anon, authenticated;
  grant all on table public.site_visits_daily to service_role;
end $$;
