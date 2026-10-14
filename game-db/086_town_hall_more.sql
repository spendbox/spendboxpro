-- Newtown, part 86:
--   1. No jobs on the map: jobs are gone from Newtown (the simple life), so nobody shows "at work"
--      at an old workplace any more (people_on_map without the job part).
--   2. Town Hall, more (part 85 first): replies, emoji reactions, photos, deleting, and every
--      message gone after 24 hours.
--      - Your own message: Delete takes it away for everyone.
--      - Someone else's: Delete hides it for you; when 3 different people have deleted it, it's
--        gone for everyone (the town keeps itself tidy).
--      - Photos: small JPEGs in the public "town" bucket (they go with their message).
--
--   3. Landmarks have no top price any more (the biggest cost the most): the database's sanity
--      check on a landmark's price goes up out of the way (₦1.5 quadrillion).
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('landmark_price_max', 1000000000000, 'Sanity check only (no top price): the most a landmark can be sold for, in mint')
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- ============================================================ 1. no jobs on the map
create or replace function public.people_on_map(p_viewer uuid, p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  with hour as (select extract(hour from now() at time zone 'Africa/Lagos')::int as h),
  everyone as (
    select l.user_id, p.username, p.avatar, l.home_unit, l.at_place, l.seen_at,
      (l.seen_at > now() - interval '4 minutes') as online
    from public.lives l
    join public.profiles p on p.id = l.user_id and not p.is_bot
    where l.region = p_region and l.home_unit is not null and l.user_id <> p_viewer
      and not exists (select 1 from public.blocks b where (b.blocker = p_viewer and b.blocked = l.user_id) or (b.blocker = l.user_id and b.blocked = p_viewer))
  ),
  placed as (
    select e.*,
      case when e.online then 'online'
           when (select h from hour) >= 23 or (select h from hour) < 6 then 'asleep'
           else 'away' end as status
    from everyone e
  ),
  spots as (
    select pl.*, case when pl.status = 'online' then coalesce(pl.at_place, pl.home_unit) else pl.home_unit end as spot
    from placed pl
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'name', coalesce(s.username, 'Someone'), 'avatar', s.avatar, 'status', s.status,
      'x', (public.spot_xz(s.spot))[1], 'z', (public.spot_xz(s.spot))[2], 'job', null, 'seenAt', s.seen_at,
      'friend', exists (select 1 from public.friendships f where f.accepted_at is not null
                         and ((f.requester = p_viewer and f.addressee = s.user_id) or (f.addressee = p_viewer and f.requester = s.user_id))))
    order by s.online desc, s.seen_at desc nulls last), '[]'::jsonb)
  from (select * from spots
        where (public.spot_xz(spot))[1] between p_x0 and p_x1 and (public.spot_xz(spot))[2] between p_z0 and p_z1
        order by online desc, seen_at desc nulls last
        limit least(greatest(coalesce(p_limit, 60), 1), 150)) s
$$;

-- ============================================================ 2. Town Hall, more
alter table public.chat_messages add column if not exists reply_to bigint;

create table if not exists public.town_reactions (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create table if not exists public.town_hides (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.town_reactions enable row level security;
alter table public.town_hides enable row level security;

/**
 * Say something in a state's Town Hall: text, a photo (p_image: 'town/<you>/<name>.jpg' in the
 * "town" bucket), or both, maybe as a reply (p_reply). One message every 5 seconds, 300 letters.
 * Messages over 24 hours old in that Town Hall go as it's written.
 */
create or replace function public.town_hall_post(p_user uuid, p_region text, p_body text, p_reply bigint default null, p_image text default null)
returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_room text := 'town:' || p_region;
  v_body text := nullif(trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')), '');
  m public.chat_messages;
begin
  if p_region !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_room'; end if;
  if v_body is null and p_image is null then raise exception 'empty'; end if;
  if char_length(v_body) > 300 then raise exception 'too_long'; end if;
  if p_image is not null and p_image !~ ('^town/' || p_user::text || '/[A-Za-z0-9_-]{8,40}\.jpg$') then raise exception 'bad_target'; end if;
  if p_reply is not null and not exists (select 1 from public.chat_messages where id = p_reply and room = v_room and created_at > now() - interval '24 hours') then
    p_reply := null;
  end if;
  perform pg_advisory_xact_lock(hashtext('town:' || p_user::text));
  if exists (select 1 from public.chat_messages where sender_id = p_user and room = v_room and created_at > now() - interval '5 seconds') then
    raise exception 'too_fast';
  end if;
  perform set_config('newtown.chat_image', coalesce(p_image, ''), true);
  m := public.chat_send(p_user, v_room, null, coalesce(v_body, '📷'));
  perform set_config('newtown.chat_image', '', true);
  if p_reply is not null then
    update public.chat_messages set reply_to = p_reply where id = m.id returning * into m;
  end if;
  delete from public.chat_messages where room = v_room and created_at < now() - interval '24 hours';
  return m;
end $$;

-- Part 85's plain send, kept for older copies of the app.
create or replace function public.town_hall_send(p_user uuid, p_region text, p_body text) returns public.chat_messages
language sql security definer set search_path = public as $$
  select public.town_hall_post(p_user, p_region, p_body, null, null)
$$;

/** React to a Town Hall message with an emoji (null takes your reaction back). One each. */
create or replace function public.town_hall_react(p_user uuid, p_message bigint, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.chat_messages where id = p_message and room like 'town:%' and created_at > now() - interval '24 hours') then
    raise exception 'gone';
  end if;
  if p_emoji is null or btrim(p_emoji) = '' then
    delete from public.town_reactions where message_id = p_message and user_id = p_user;
  else
    insert into public.town_reactions (message_id, user_id, emoji) values (p_message, p_user, left(btrim(p_emoji), 16))
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end $$;

/**
 * Delete a Town Hall message: your own goes for everyone; someone else's is hidden for you, and
 * gone for everyone once 3 people have deleted it. { result: 'deleted' | 'removed' | 'hidden', image }.
 */
create or replace function public.town_hall_delete(p_user uuid, p_message bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.chat_messages;
begin
  select * into m from public.chat_messages where id = p_message and room like 'town:%';
  if not found then return jsonb_build_object('result', 'deleted', 'image', null); end if;
  if m.sender_id = p_user then
    delete from public.chat_messages where id = p_message;
    return jsonb_build_object('result', 'deleted', 'image', m.image_path);
  end if;
  insert into public.town_hides (message_id, user_id) values (p_message, p_user) on conflict do nothing;
  if (select count(*) from public.town_hides where message_id = p_message) >= 3 then
    delete from public.chat_messages where id = p_message;
    return jsonb_build_object('result', 'removed', 'image', m.image_path);
  end if;
  return jsonb_build_object('result', 'hidden', 'image', null);
end $$;

/** A Town Hall's last 24 hours (the newest 80): who said what, replies, photos and reactions. */
create or replace function public.town_hall_feed(p_region text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(t order by t.id), '[]'::jsonb) from (
    select m.id, m.sender_id as from, m.sender_name as name, p.avatar, m.body as text, m.image_path as image, m.created_at as at,
      (select jsonb_build_object('id', r.id, 'name', r.sender_name, 'text', left(coalesce(r.body, ''), 90)) from public.chat_messages r where r.id = m.reply_to) as reply,
      coalesce((select jsonb_object_agg(x.emoji, x.n) from (select emoji, count(*) as n from public.town_reactions tr where tr.message_id = m.id group by emoji) x), '{}'::jsonb) as reactions
    from public.chat_messages m
    left join public.profiles p on p.id = m.sender_id
    where m.room = 'town:' || p_region and m.created_at > now() - interval '24 hours'
    order by m.id desc
    limit 80
  ) t
$$;

/** Photos of Town Hall messages over a day old (the server removes the files, then the rows go). */
create or replace function public.town_hall_expired(p_limit int default 200) returns table (id bigint, image text)
language sql stable security definer set search_path = public as $$
  select id, image_path from public.chat_messages
  where room like 'town:%' and created_at < now() - interval '24 hours'
  order by id limit greatest(1, least(coalesce(p_limit, 200), 1000))
$$;

do $$
declare f text;
begin
  revoke all on table public.town_reactions, public.town_hides from public, anon, authenticated;
  grant all on table public.town_reactions, public.town_hides to service_role;
  foreach f in array array['public.town_hall_post(uuid, text, text, bigint, text)', 'public.town_hall_send(uuid, text, text)',
    'public.town_hall_react(uuid, bigint, text)', 'public.town_hall_delete(uuid, bigint)', 'public.town_hall_feed(text)', 'public.town_hall_expired(int)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('town', 'town', true, 600000, array['image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
