-- Newtown, part 101: who hears about a new event (docs/EVENTS.md). Nobody misses out: the nearest
-- people, however far, twice as many as the event holds (a party for 100 tells the closest 200),
-- or everyone within 4 km (40 tiles) if that's more. Where someone is: where they are now
-- (lives.at_place), else their home. Their notices are written here in one go; the server then
-- taps their phones (src/app/play/events/event-actions.ts).
--
-- Safe to run more than once. Run after part 95.

create or replace function public.event_tell(p_region text, p_x int, p_z int, p_want int, p_tiles int, p_skip uuid[], p_body text)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_want int := least(greatest(coalesce(p_want, 0), 0), 20000);
  v_tiles int := least(greatest(coalesce(p_tiles, 40), 0), 200);
  v_told uuid[];
begin
  with spots as (
    select l.user_id, regexp_match(coalesce(l.at_place, l.home_unit), ':(-?[0-9]+),(-?[0-9]+)') as m
    from public.lives l
    join public.profiles p on p.id = l.user_id and not p.is_bot and not p.frozen
    where l.region = p_region
      and coalesce(l.at_place, l.home_unit) is not null
      and not (l.user_id = any(coalesce(p_skip, '{}')))
  ), d as (
    select user_id, power(m[1]::int - p_x, 2) + power(m[2]::int - p_z, 2) as d2 from spots where m is not null
  ), pick as (
    select user_id from d where d2 <= power(v_tiles, 2)
    union
    select user_id from (select user_id from d order by d2 limit v_want) n
  ), ins as (
    insert into public.notifications (user_id, round_id, kind, body)
    select user_id, null, 'event', left(p_body, 500) from pick
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_told from ins;
  return v_told;
end $$;
revoke all on function public.event_tell(text, int, int, int, int, uuid[], text) from public, anon, authenticated;
grant execute on function public.event_tell(text, int, int, int, int, uuid[], text) to service_role;
