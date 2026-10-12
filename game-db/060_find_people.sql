-- Newtown, part 60: finding people. Everyone living on a real map can be found by name, the
-- nearest first (to where you're looking), online ones marked; and a player can say whether
-- they're a man or a woman (shown on their card and in the lists). See docs/PEOPLE.md.
--
-- Safe to run more than once. Run after part 59.

alter table public.profiles add column if not exists gender text check (gender is null or gender in ('male', 'female'));

/**
 * Everyone on a map you could message: by name (p_q, any part of it; empty for everyone), nearest
 * to (p_x, p_z) first, with whether they're online, where they are and how far (tiles).
 */
create or replace function public.people_find(p_viewer uuid, p_region text, p_x int, p_z int, p_q text, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  with everyone as (
    select l.user_id, p.username, p.avatar, p.gender, l.seen_at,
      (l.seen_at > now() - interval '4 minutes') as online,
      public.spot_xz(coalesce(case when l.seen_at > now() - interval '4 minutes' then l.at_place end, l.home_unit, l.at_place)) as xz
    from public.lives l
    join public.profiles p on p.id = l.user_id and not p.is_bot
    where l.region = p_region and l.user_id <> p_viewer
      and (coalesce(trim(p_q), '') = '' or p.username ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%')
      and not exists (select 1 from public.blocks b where (b.blocker = p_viewer and b.blocked = l.user_id) or (b.blocker = l.user_id and b.blocked = p_viewer))
  ),
  measured as (
    select e.*, case when e.xz is null then null else sqrt(power(e.xz[1] - p_x, 2) + power(e.xz[2] - p_z, 2)) end as dist
    from everyone e
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(m.username, 'Someone'), 'avatar', m.avatar, 'gender', m.gender,
      'online', m.online, 'seenAt', m.seen_at, 'x', m.xz[1], 'z', m.xz[2], 'dist', round(m.dist::numeric, 1),
      'friend', exists (select 1 from public.friendships f where f.accepted_at is not null
                         and ((f.requester = p_viewer and f.addressee = m.user_id) or (f.addressee = p_viewer and f.requester = m.user_id))))
    order by m.dist nulls last, m.online desc), '[]'::jsonb)
  from (select * from measured order by dist nulls last, online desc, seen_at desc nulls last limit least(greatest(coalesce(p_limit, 60), 1), 200)) m
$$;

do $$
begin
  revoke all on function public.people_find(uuid, text, int, int, text, int) from public, anon, authenticated;
  grant execute on function public.people_find(uuid, text, int, int, text, int) to service_role;
end $$;
