-- Newtown, part 52: leave your mark. See docs/MARKS.md.
--
-- Marks are things players leave on the map for everyone: writing on a wall, a review of a place
-- (with stars), a tree, a bench, a statue, a fountain or a plaque with their name, or a time
-- capsule that opens on a date (with a message, and maybe one of their things for whoever opens
-- it first). The author's name is always on it. Everyone can react (like, laugh, fire, love);
-- enough votes to take it down remove it, and that costs the author reputation. Paid marks
-- (trees, statues...) stand for a number of days; anyone can chip in to keep them standing.
-- The game says what each costs and checks the writing (src/lib/world/marks.ts).
--
-- Safe to run more than once. Run after parts 1-51.

insert into public.game_settings (key, value, note) values
  ('marks_per_day',      20,  'Marks each player can leave a day'),
  ('mark_takedown_votes', 5,  'Votes that take a mark down (more for well-liked ones: + a fifth of its reactions)'),
  ('mark_takedown_rep',   3,  'Reputation the author loses when a mark is taken down')
on conflict (key) do update set note = excluded.note;

create table if not exists public.marks (
  id bigserial primary key,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  x int not null,
  z int not null,
  kind text not null check (kind in ('writing', 'review', 'tree', 'bench', 'statue', 'fountain', 'plaque', 'capsule')),
  author uuid references public.profiles (id) on delete set null,
  body text check (body is null or char_length(body) <= 280),
  colour text check (colour is null or colour ~ '^#[0-9a-f]{6}$'),
  rating int check (rating is null or rating between 1 and 5),
  -- Where it is, in words ("Shoprite, Allen Avenue"), when it's about a place.
  place text check (place is null or char_length(place) <= 120),
  expires_at timestamptz,
  opens_at timestamptz,
  item_id bigint references public.items (id) on delete set null,
  item_name text check (item_name is null or char_length(item_name) <= 60),
  taken_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists marks_where_idx on public.marks (region, x, z) where removed_at is null;
create index if not exists marks_author_idx on public.marks (author, created_at desc);

create table if not exists public.mark_reactions (
  mark_id bigint not null references public.marks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('like', 'laugh', 'fire', 'love')),
  created_at timestamptz not null default now(),
  primary key (mark_id, user_id)
);

create table if not exists public.mark_votes (
  mark_id bigint not null references public.marks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mark_id, user_id)
);

/**
 * Leave a mark (the game has checked the writing and says what it costs and how long it stands).
 * A capsule can hold one of your things: it's held in the capsule until someone opens it.
 */
create or replace function public.mark_place(
  p_user uuid, p_region text, p_x int, p_z int, p_kind text, p_body text, p_colour text, p_rating int, p_place text,
  p_cost numeric, p_days int, p_opens_at timestamptz, p_item bigint
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
  insert into public.marks (region, x, z, kind, author, body, colour, rating, place, expires_at, opens_at, item_id, item_name)
    values (p_region, p_x, p_z, p_kind, p_user, nullif(left(btrim(coalesce(p_body, '')), 280), ''), p_colour, p_rating, left(p_place, 120),
            case when coalesce(p_days, 0) > 0 then now() + make_interval(days => least(p_days, 3650)) end,
            case when p_kind = 'capsule' then greatest(coalesce(p_opens_at, now()), now()) end, p_item, i.name)
    returning id into v_id;
  return v_id;
end $$;

/** Marks round a spot (tiles) that are up now, with their reactions and your own reaction and vote. A capsule's message stays hidden until it opens. */
create or replace function public.marks_near(p_viewer uuid, p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'x', m.x, 'z', m.z, 'kind', m.kind, 'author', m.author, 'authorName', coalesce(p.username, 'Someone'),
      'body', case when m.kind = 'capsule' and m.opens_at > now() then null else m.body end,
      'colour', m.colour, 'rating', m.rating, 'place', m.place, 'expiresAt', m.expires_at, 'opensAt', m.opens_at,
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

/** React to a mark (again to change it; the same again to take it back). The author is told the first time. */
create or replace function public.mark_react(p_user uuid, p_mark bigint, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.marks;
  v_old text;
begin
  if p_emoji not in ('like', 'laugh', 'fire', 'love') then raise exception 'bad_kind'; end if;
  select * into m from public.marks where id = p_mark and removed_at is null;
  if not found then raise exception 'gone'; end if;
  select emoji into v_old from public.mark_reactions where mark_id = p_mark and user_id = p_user;
  if v_old = p_emoji then
    delete from public.mark_reactions where mark_id = p_mark and user_id = p_user;
    return;
  end if;
  insert into public.mark_reactions (mark_id, user_id, emoji) values (p_mark, p_user, p_emoji)
    on conflict (mark_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  if v_old is null and m.author is not null and m.author <> p_user then
    perform public.notify(m.author, null, 'mark', (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' reacted to what you left on the map.', null);
  end if;
end $$;

/**
 * Vote to take a mark down. Enough votes (mark_takedown_votes, more for well-liked marks) and it
 * comes down: the author loses reputation and is told. You can't vote on your own.
 */
create or replace function public.mark_vote(p_user uuid, p_mark bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m public.marks;
  v_votes int;
  v_need int;
begin
  select * into m from public.marks where id = p_mark and removed_at is null for update;
  if not found then raise exception 'gone'; end if;
  if m.author = p_user then raise exception 'own'; end if;
  insert into public.mark_votes (mark_id, user_id) values (p_mark, p_user) on conflict do nothing;
  select count(*) into v_votes from public.mark_votes where mark_id = p_mark;
  v_need := public.setting('mark_takedown_votes') + (select count(*) from public.mark_reactions where mark_id = p_mark) / 5;
  if v_votes < v_need then return false; end if;
  update public.marks set removed_at = now() where id = p_mark;
  if m.author is not null then
    update public.lives set rep_penalty = rep_penalty + public.setting('mark_takedown_rep') where user_id = m.author;
    perform public.notify(m.author, null, 'mark', 'People voted to take down what you left on the map' || coalesce(' at ' || m.place, '') || '.', null);
  end if;
  return true;
end $$;

/** Take your own mark down (a capsule's thing comes back to you). */
create or replace function public.mark_remove(p_user uuid, p_mark bigint) returns void
language sql security definer set search_path = public as $$
  update public.marks set removed_at = now() where id = p_mark and author = p_user and removed_at is null
$$;

/** Chip in to keep a tree, a statue... standing longer (the game says how many days the money buys). */
create or replace function public.mark_chip_in(p_user uuid, p_mark bigint, p_amount numeric, p_days int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  m public.marks;
  v_amount numeric := round(greatest(coalesce(p_amount, 0), 0), 2);
  v_until timestamptz;
begin
  select * into m from public.marks where id = p_mark and removed_at is null for update;
  if not found or m.expires_at is null then raise exception 'gone'; end if;
  if v_amount <= 0 or coalesce(p_days, 0) < 1 or p_days > 365 then raise exception 'bad_item'; end if;
  if public.life_can_spend(p_user, array['fun', 'savings']) < v_amount then raise exception 'not_enough:%', trim_scale(v_amount); end if;
  perform public.life_spend(p_user, array['fun', 'savings'], v_amount);
  perform public.log_coins(p_user, null, 'mark', -v_amount, false, 'Chipped in to keep something on the map standing');
  perform public.burn(null, v_amount, 'Marks on the map');
  v_until := greatest(m.expires_at, now()) + make_interval(days => p_days);
  update public.marks set expires_at = v_until where id = p_mark;
  if m.author is not null and m.author <> p_user then
    perform public.notify(m.author, null, 'mark', (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' chipped in to keep your ' || m.kind || ' standing.', null);
  end if;
  return v_until;
end $$;

/** Open a time capsule (once it's due): the first to open one with a thing in it gets the thing. */
create or replace function public.capsule_open(p_user uuid, p_mark bigint) returns text
language plpgsql security definer set search_path = public as $$
declare m public.marks;
begin
  select * into m from public.marks where id = p_mark and kind = 'capsule' and removed_at is null for update;
  if not found then raise exception 'gone'; end if;
  if m.opens_at > now() then raise exception 'not_yet'; end if;
  if m.item_id is null or m.taken_by is not null then return null; end if;
  if not exists (select 1 from public.items where id = m.item_id and owner = m.author) then
    update public.marks set taken_by = m.author where id = p_mark;
    return null;
  end if;
  update public.items set owner = p_user, how = 'found', got_at = now() where id = m.item_id;
  update public.marks set taken_by = p_user where id = p_mark;
  if m.author is not null and m.author <> p_user then
    perform public.notify(m.author, null, 'mark', (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' opened your time capsule and found ' || coalesce(m.item_name, 'your gift') || '.', null);
  end if;
  return m.item_name;
end $$;

/** What your marks have earned you: reactions on them (for reputation). */
create or replace function public.marks_liked(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.mark_reactions r join public.marks m on m.id = r.mark_id where m.author = p_user and m.removed_at is null and r.user_id <> p_user
$$;

do $$
begin
  revoke all on table public.marks, public.mark_reactions, public.mark_votes from public, anon, authenticated;
  grant all on table public.marks, public.mark_reactions, public.mark_votes to service_role;
  revoke all on sequence public.marks_id_seq from public, anon, authenticated;
  grant all on sequence public.marks_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.mark_place(uuid, text, int, int, text, text, text, int, text, numeric, int, timestamptz, bigint)',
    'public.marks_near(uuid, text, int, int, int, int)', 'public.mark_react(uuid, bigint, text)', 'public.mark_vote(uuid, bigint)',
    'public.mark_remove(uuid, bigint)', 'public.mark_chip_in(uuid, bigint, numeric, int)', 'public.capsule_open(uuid, bigint)', 'public.marks_liked(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
