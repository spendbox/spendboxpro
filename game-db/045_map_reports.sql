-- Newtown, part 45: players report problems with the map (a road that stops short, a wrong name,
-- water where there's land...). Each report keeps the exact spot (the tile and its real latitude and
-- longitude) and what the map showed there. The owner sees them at /map-reports, grouped by place,
-- and marks them fixed, won't fix or duplicate; reporters hear back when theirs is fixed. Fixes
-- themselves go into the region's corrections (src/lib/world/regions/*/corrections.ts).
-- See docs/MAP_REPORTS.md.
--
-- Safe to run more than once. Run after parts 1-44.

insert into public.game_settings (key, value, note) values
  ('map_reports_per_day', 5, 'Map problem reports each player can send a day')
on conflict (key) do update set note = excluded.note;

create table if not exists public.map_reports (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  x int not null,
  z int not null,
  lat numeric(9,6) not null,
  lon numeric(9,6) not null,
  kind text not null check (kind in ('road', 'bridge', 'building', 'place', 'name', 'water', 'other')),
  note text check (note is null or char_length(note) <= 300),
  what_there text check (what_there is null or char_length(what_there) <= 200),
  status text not null default 'open' check (status in ('open', 'fixed', 'wontfix', 'duplicate')),
  reply text check (reply is null or char_length(reply) <= 300),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists map_reports_open_idx on public.map_reports (region, status, created_at desc);
create index if not exists map_reports_user_idx on public.map_reports (user_id, created_at desc);

/** Send a report (a few a day each). */
create or replace function public.map_report(
  p_user uuid, p_region text, p_x int, p_z int, p_lat numeric, p_lon numeric, p_kind text, p_note text, p_what text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if (select count(*) from public.map_reports where user_id = p_user and created_at > now() - interval '1 day') >= public.setting('map_reports_per_day') then
    raise exception 'too_many';
  end if;
  if exists (select 1 from public.map_reports where user_id = p_user and region = p_region and x = p_x and z = p_z and kind = p_kind and status = 'open') then
    raise exception 'already';
  end if;
  insert into public.map_reports (user_id, region, x, z, lat, lon, kind, note, what_there)
    values (p_user, p_region, p_x, p_z, p_lat, p_lon, p_kind, nullif(btrim(coalesce(p_note, '')), ''), left(p_what, 200))
    returning id into v_id;
  return v_id;
end $$;

/** Reports for the owner's page, newest first (by status: 'open', or 'all'). */
create or replace function public.map_reports_list(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'region', r.region, 'x', r.x, 'z', r.z, 'lat', r.lat, 'lon', r.lon, 'kind', r.kind, 'note', r.note,
    'whatThere', r.what_there, 'status', r.status, 'reply', r.reply, 'at', r.created_at, 'by', coalesce(p.username, 'A player')
  ) order by r.created_at desc), '[]'::jsonb)
  from (select * from public.map_reports where p_status = 'all' or status = p_status order by created_at desc limit 500) r
  left join public.profiles p on p.id = r.user_id
$$;

/** The owner marks a report; reporters hear back when it's fixed. */
create or replace function public.map_report_set(p_id bigint, p_status text, p_reply text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.map_reports;
begin
  if p_status not in ('open', 'fixed', 'wontfix', 'duplicate') then raise exception 'bad_status'; end if;
  update public.map_reports set status = p_status, reply = nullif(btrim(coalesce(p_reply, '')), ''),
    resolved_at = case when p_status = 'open' then null else now() end
  where id = p_id returning * into r;
  if r.user_id is not null and p_status = 'fixed' then
    perform public.notify(r.user_id, null, 'map_report',
      'Thanks! The map problem you reported has been fixed' || coalesce(': ' || r.reply, '.'), null);
  end if;
end $$;

do $$
begin
  revoke all on table public.map_reports from public, anon, authenticated;
  grant all on table public.map_reports to service_role;
  revoke all on sequence public.map_reports_id_seq from public, anon, authenticated;
  grant all on sequence public.map_reports_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.map_report(uuid, text, int, int, numeric, numeric, text, text, text)', 'public.map_reports_list(text)', 'public.map_report_set(bigint, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
