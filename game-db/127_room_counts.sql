-- Newtown, part 127: how many people are in each place, from the server (docs/COSTS.md, "Live
-- channels"). On the real map, who's in which place was shared live round each 4 km area: every
-- step in or out of any building went to every phone in the area. Now the live channel is just
-- the building you're in, and the numbers over buildings on the map come from here: the minute's
-- ping (/api/active) says which room you're in (life_in_room), and room_counts adds them up for a
-- part of the map (/api/room-counts, shared by everyone looking there).
--
-- Safe to run more than once. Run after part 102 (any time).

alter table public.lives add column if not exists in_room text check (in_room is null or char_length(in_room) <= 60);
alter table public.lives add column if not exists in_x int;
alter table public.lives add column if not exists in_z int;
create index if not exists lives_in_room_idx on public.lives (region, in_x, in_z) where in_room is not null;

/** The room you're in now ("b:<tile>:<level>", a ride's id, or '' for none), and where it is (tiles). */
create or replace function public.life_in_room(p_user uuid, p_room text, p_x int, p_z int) returns void
language sql security definer set search_path = public as $$
  update public.lives
    set in_room = nullif(left(coalesce(p_room, ''), 60), ''), in_x = case when coalesce(p_room, '') = '' then null else p_x end,
        in_z = case when coalesce(p_room, '') = '' then null else p_z end
    where user_id = p_user and in_room is distinct from nullif(left(coalesce(p_room, ''), 60), '')
$$;

/**
 * How many are in each room on this part of the map (and on the rides, wherever they are), counting
 * only those online (seen in the last 4 minutes): { "<room>": n }.
 */
create or replace function public.room_counts(p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(in_room, n), '{}'::jsonb) from (
    select in_room, count(*) as n from public.lives
    where region = p_region and in_room is not null and seen_at > now() - interval '4 minutes'
      and ((in_x between p_x0 and p_x1 and in_z between p_z0 and p_z1) or in_x is null)
    group by in_room) c
$$;

do $$
begin
  revoke all on function public.life_in_room(uuid, text, int, int), public.room_counts(text, int, int, int, int) from public, anon, authenticated;
  grant execute on function public.life_in_room(uuid, text, int, int), public.room_counts(text, int, int, int, int) to service_role;
end $$;
