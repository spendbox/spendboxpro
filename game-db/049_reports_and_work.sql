-- Newtown, part 49: reporting a person (a player or a character), not just the map. Each report
-- keeps who it's about, what's wrong, where it happened and a note; the owner reads them at
-- /map-reports with the map ones. See docs/MAP_REPORTS.md.
--
-- Safe to run more than once. Run after parts 1-48.

insert into public.game_settings (key, value, note) values
  ('person_reports_per_day', 10, 'Reports about people each player can send a day')
on conflict (key) do update set note = excluded.note;

create table if not exists public.person_reports (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  -- A player (their account), or a character (its id, e.g. 'npc:12'), with the name shown then.
  about_user uuid references public.profiles (id) on delete set null,
  about_npc text check (about_npc is null or char_length(about_npc) <= 60),
  about_name text not null check (char_length(about_name) between 1 and 60),
  kind text not null check (kind in ('abuse', 'scam', 'profile', 'glitch', 'other')),
  note text check (note is null or char_length(note) <= 300),
  -- Where it happened (a room or a place), when known.
  place text check (place is null or char_length(place) <= 120),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists person_reports_open_idx on public.person_reports (status, created_at desc);
create index if not exists person_reports_user_idx on public.person_reports (user_id, created_at desc);

/** Report a person (a few a day each; once each per person until it's looked at). */
create or replace function public.person_report(
  p_user uuid, p_about_user uuid, p_about_npc text, p_name text, p_kind text, p_note text, p_place text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_about_user is not null and p_about_user = p_user then raise exception 'self'; end if;
  if (select count(*) from public.person_reports where user_id = p_user and created_at > now() - interval '1 day') >= public.setting('person_reports_per_day') then
    raise exception 'too_many';
  end if;
  if exists (
    select 1 from public.person_reports
    where user_id = p_user and status = 'open'
      and (about_user = p_about_user or (p_about_user is null and about_npc = p_about_npc))
  ) then
    raise exception 'already';
  end if;
  insert into public.person_reports (user_id, about_user, about_npc, about_name, kind, note, place)
    values (p_user, p_about_user, p_about_npc, left(btrim(p_name), 60), p_kind, nullif(btrim(coalesce(p_note, '')), ''), nullif(left(btrim(coalesce(p_place, '')), 120), ''))
    returning id into v_id;
  return v_id;
end $$;

/** Reports about people for the owner's page, newest first ('open' or 'all'). */
create or replace function public.person_reports_list(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'aboutUser', r.about_user, 'aboutNpc', r.about_npc, 'name', r.about_name, 'kind', r.kind, 'note', r.note,
    'place', r.place, 'status', r.status, 'at', r.created_at, 'by', coalesce(p.username, 'A player')
  ) order by r.created_at desc), '[]'::jsonb)
  from (select * from public.person_reports where p_status = 'all' or status = p_status order by created_at desc limit 500) r
  left join public.profiles p on p.id = r.user_id
$$;

do $$
begin
  revoke all on table public.person_reports from public, anon, authenticated;
  grant all on table public.person_reports to service_role;
  revoke all on sequence public.person_reports_id_seq from public, anon, authenticated;
  grant all on sequence public.person_reports_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.person_report(uuid, uuid, text, text, text, text, text)', 'public.person_reports_list(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
