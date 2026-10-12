-- Newtown, part 53: rules for marks. See docs/MARKS.md.
--
-- Writing is short (100 letters), in a graffiti style the writer picks. You need 20 reputation to
-- leave anything, and can have one mark up at a time, plus one more for every 50 reputation (the
-- game works out your reputation and passes how many you're allowed). Trees stay for good.
--
-- Safe to run more than once. Run after parts 1-52.

alter table public.marks add column if not exists style text check (style is null or style in ('spray', 'bubble', 'tag', 'drip', 'stencil', 'neon', 'chalk'));

/** How many of your marks are up now (not taken down, not run out, not an opened capsule). */
create or replace function public.marks_up(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.marks
  where author = p_user and removed_at is null and (expires_at is null or expires_at > now()) and not (kind = 'capsule' and taken_by is not null)
$$;

drop function if exists public.mark_place(uuid, text, int, int, text, text, text, int, text, numeric, int, timestamptz, bigint);
create or replace function public.mark_place(
  p_user uuid, p_region text, p_x int, p_z int, p_kind text, p_body text, p_colour text, p_rating int, p_place text,
  p_cost numeric, p_days int, p_opens_at timestamptz, p_item bigint, p_style text default null, p_allowed int default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  i public.items;
  v_cost numeric := round(greatest(coalesce(p_cost, 0), 0), 2);
  v_id bigint;
begin
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  if p_kind not in ('writing', 'review', 'tree', 'bench', 'statue', 'fountain', 'plaque', 'capsule') then raise exception 'bad_kind'; end if;
  if (select count(*) from public.marks where author = p_user and created_at > now() - interval '1 day') >= public.setting('marks_per_day') then raise exception 'too_many'; end if;
  -- How many you can have up at once (from your reputation: the game works it out).
  if p_allowed is not null then
    if p_allowed < 1 then raise exception 'low_rep'; end if;
    if public.marks_up(p_user) >= p_allowed then raise exception 'mark_limit:%', p_allowed; end if;
  end if;
  if p_style is not null and p_style not in ('spray', 'bubble', 'tag', 'drip', 'stencil', 'neon', 'chalk') then raise exception 'bad_kind'; end if;
  if p_kind in ('writing', 'review', 'plaque', 'capsule') and (p_body is null or char_length(btrim(p_body)) < 1) then raise exception 'empty'; end if;
  if v_cost > public.setting('item_price_max') then raise exception 'bad_item'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['fun', 'savings'], v_cost);
    perform public.log_coins(p_user, null, 'mark', -v_cost, false, 'Left on the map: ' || p_kind);
    perform public.burn(null, v_cost, 'Marks on the map');
  end if;
  if p_item is not null then
    if p_kind <> 'capsule' then raise exception 'bad_item'; end if;
    select * into i from public.items where id = p_item for update;
    if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
    -- Held by the capsule: nobody's until it's opened (the author keeps the row, off the market).
    update public.items set list_price = null, listed_at = null where id = p_item;
  end if;
  insert into public.marks (region, x, z, kind, author, body, colour, rating, place, expires_at, opens_at, item_id, item_name, style)
    values (p_region, p_x, p_z, p_kind, p_user, nullif(left(btrim(coalesce(p_body, '')), 100), ''), p_colour, p_rating, left(p_place, 120),
            case when coalesce(p_days, 0) > 0 then now() + make_interval(days => least(p_days, 3650)) end,
            case when p_kind = 'capsule' then greatest(coalesce(p_opens_at, now()), now()) end, p_item, i.name,
            case when p_kind = 'writing' then coalesce(p_style, 'spray') end)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.marks_near(p_viewer uuid, p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'x', m.x, 'z', m.z, 'kind', m.kind, 'author', m.author, 'authorName', coalesce(p.username, 'Someone'),
      'body', case when m.kind = 'capsule' and m.opens_at > now() then null else m.body end,
      'colour', m.colour, 'style', m.style, 'rating', m.rating, 'place', m.place, 'expiresAt', m.expires_at, 'opensAt', m.opens_at,
      'item', case when m.kind = 'capsule' and m.taken_by is null then m.item_name end,
      'takenBy', (select username from public.profiles where id = m.taken_by), 'at', m.created_at,
      'reactions', coalesce((select jsonb_object_agg(emoji, c) from (select emoji, count(*) as c from public.mark_reactions where mark_id = m.id group by emoji) r), '{}'::jsonb),
      'mine', (select emoji from public.mark_reactions where mark_id = m.id and user_id = p_viewer),
      'voted', exists (select 1 from public.mark_votes where mark_id = m.id and user_id = p_viewer),
      'votes', (select count(*) from public.mark_votes where mark_id = m.id))
    order by m.created_at desc), '[]'::jsonb)
  from (select * from public.marks
        where region = p_region and removed_at is null and (expires_at is null or expires_at > now())
          and x between p_x0 and p_x1 and z between p_z0 and p_z1
        order by created_at desc limit 200) m
  left join public.profiles p on p.id = m.author
  where not exists (select 1 from public.blocks b where b.blocker = p_viewer and b.blocked = m.author)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.mark_place(uuid, text, int, int, text, text, text, int, text, numeric, int, timestamptz, bigint, text, int)',
    'public.marks_near(uuid, text, int, int, int, int)', 'public.marks_up(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
