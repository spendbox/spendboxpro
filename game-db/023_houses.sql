-- Newtown, part 23: player houses (phase 1).
-- Every player can design one simple house from what the town already draws: a style
-- (cottage, bungalow, modern, duplex, villa), a wall colour, a roof colour, a room style for
-- inside and a name for the sign (24 characters at most). The lists mirror src/lib/houses.ts:
-- change both together, and never rename an id (saved houses use them).
-- Run once in Supabase → SQL Editor, after 022 (or after the newest part you have).
-- Safe to run again: it only adds what is missing and replaces functions (settings you have
-- changed keep their values).
--
-- - Showing it: a player switches "Show my house in the game" on. Every new game takes a
--   snapshot of the houses switched on at that moment (round_houses), and the city puts them in
--   the busiest part of that game's town. Switching off, or changing the design, only counts
--   from the next game: the game already running keeps its snapshot.
-- - Each house standing in a game adds tiles_per_house (5) spots to that game's town, on top of
--   the usual starting spots (base_tiles) and the spots each ghost adds.
-- - At most houses_per_round_max (500) houses stand in one game. When more are switched on, the
--   ones that have waited longest go first (waiting since they were switched on, or since they
--   last stood in a game), so everybody takes turns.
-- - Bots, paused (frozen) and under-18 accounts never get a house in the game.
-- - Edits: at most house_saves_per_day (30) saved changes a day. Names go through a small
--   filter for slurs and obvious insults (also spaced out or with punctuation in between).
--
-- Coin books: houses are free for now. Nothing here moves any mint (no ledger rows at all), so
-- the coin books are untouched. (Switching a house off gives nothing back, as nothing was paid.)
--
-- Everything here is used by the server only (service_role).

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('tiles_per_house',      5,   'Extra spots each player house standing in a game adds to its town'),
  ('houses_per_round_max', 500, 'Most player houses standing in one game (the longest-waiting go first)'),
  ('house_saves_per_day',  30,  'Most changes one player can save to their house in a day')
on conflict (key) do update set note = excluded.note;

-- ============================================================ the catalog
-- True if p_value is one of the choices for p_kind ('style', 'wall', 'roof' or 'interior').
-- A copy of the lists in src/lib/houses.ts (colours in lower case).
create or replace function public.house_choice_ok(p_kind text, p_value text) returns boolean
language sql immutable as $$
  select coalesce(case p_kind
    when 'style' then p_value = any (array['cottage', 'bungalow', 'modern', 'duplex', 'villa'])
    when 'wall' then p_value = any (array['#f8f9fa', '#ffe8cc', '#fff3bf', '#d3f9d8', '#d0ebff',
                                          '#e5dbff', '#ffdeeb', '#e9ecef', '#c5a880', '#868e96'])
    when 'roof' then p_value = any (array['#c92a2a', '#e8590c', '#5c3d2e', '#2b8a3e', '#1864ab',
                                          '#5f3dc4', '#343a40', '#adb5bd'])
    when 'interior' then p_value = any (array['living', 'lounge', 'studio', 'party', 'dining'])
  end, false)
$$;

-- Tidies a house name the same way as cleanHouseName in src/lib/houses.ts: letters, numbers,
-- spaces and ' & . , ! - only, single spaces, at most 24 characters.
create or replace function public.house_clean_name(p_name text) returns text
language plpgsql stable as $$
declare v text := coalesce(p_name, '');
begin
  if current_setting('server_encoding') = 'UTF8' then v := normalize(v, NFKC); end if;
  v := regexp_replace(v, '[^[:alnum:][:space:]''&.,!-]', '', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  return btrim(left(v, 24));
end $$;

-- True if a name contains a slur or an obvious insult. Kept small on purpose: it checks each
-- word in lower case, with common look-alikes swapped back (sh1t, $lut), punctuation dropped
-- (f.u.c.k), letters typed with spaces in between joined up (f u c k) and stretched letters
-- squeezed (fuuuck).
create or replace function public.house_name_rude(p_name text) returns boolean
language plpgsql immutable as $$
declare
  -- Rude anywhere inside a word.
  v_inside constant text[] := array['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore',
    'slut', 'wanker', 'twat', 'bastard', 'asshole', 'dickhead', 'retard', 'hitler', 'paedophile', 'pedophile'];
  -- Rude only as a whole word (inside other words they are harmless: spicy, therapist, Nazir).
  v_whole constant text[] := array['fag', 'fags', 'spic', 'chink', 'kike', 'nazi', 'nazis', 'rape', 'rapist',
    'pedo', 'paedo', 'porn', 'sex', 'pussy', 'tits', 'penis', 'idiot', 'moron',
    'ashawo', 'ashewo', 'olosho', 'werey', 'mumu', 'olodo'];
  v text;
  w text;
  v_words text[] := '{}';
  v_run text := '';
begin
  v := translate(lower(coalesce(p_name, '')), '0134578@$!|', 'oieastbasii');
  v := regexp_replace(v, '[^[:alnum:][:space:]]', '', 'g');
  foreach w in array regexp_split_to_array(btrim(v), '\s+') loop
    if char_length(w) = 1 then
      v_run := v_run || w;
    else
      if v_run <> '' then v_words := v_words || v_run; v_run := ''; end if;
      if w <> '' then v_words := v_words || w; end if;
    end if;
  end loop;
  if v_run <> '' then v_words := v_words || v_run; end if;
  foreach w in array v_words loop
    foreach v in array array[w, regexp_replace(w, '(.)\1+', '\1', 'g')] loop
      if v = any (v_whole) then return true; end if;
      if exists (select 1 from unnest(v_inside) b where strpos(v, b) > 0) then return true; end if;
    end loop;
  end loop;
  return false;
end $$;

-- ============================================================ tables
-- Each player's house (one each).
create table if not exists public.houses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 24),
  style text not null default 'cottage' check (public.house_choice_ok('style', style)),
  wall text not null default '#ffe8cc' check (public.house_choice_ok('wall', wall)),
  roof text not null default '#c92a2a' check (public.house_choice_ok('roof', roof)),
  interior text not null default 'living' check (public.house_choice_ok('interior', interior)),
  published boolean not null default false,  -- "Show my house in the game"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,                  -- when it was last switched on
  last_stood_at timestamptz,                 -- when it last stood in a game (for taking turns)
  saves_day date,                            -- the day saves_today counts for
  saves_today int not null default 0
);
create index if not exists houses_waiting_idx on public.houses (published_at) where published;

-- The houses standing in each game: a copy taken when the game is created, so switching off or
-- editing a house never changes a game that's already running. Slot 0, 1, 2… is the order they
-- were placed in (the longest-waiting house gets slot 0).
create table if not exists public.round_houses (
  round_id bigint not null references public.rounds (id) on delete cascade,
  slot int not null check (slot >= 0),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) <= 24),
  style text not null,
  wall text not null,
  roof text not null,
  interior text not null,
  owner_name text not null,
  primary key (round_id, slot),
  unique (round_id, user_id)
);
create index if not exists round_houses_user_idx on public.round_houses (user_id);

-- ============================================================ what the app shows
-- A player's house: { saved, design: { name, style, wall, roof, interior } or null, published,
-- standing (in the current game), slot (in the current game, or null), round_id (the current
-- game), owner (the player's name), saves_left (today), tiles_per_house }.
create or replace function public.my_house(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with h as (select * from public.houses where user_id = p_user),
       r as (select id from public.rounds order by id desc limit 1),
       s as (select rh.slot from public.round_houses rh join r on rh.round_id = r.id where rh.user_id = p_user)
  select jsonb_build_object(
    'saved', exists (select 1 from h),
    'design', (select jsonb_build_object('name', name, 'style', style, 'wall', wall, 'roof', roof, 'interior', interior) from h),
    'published', coalesce((select published from h), false),
    'standing', exists (select 1 from s),
    'slot', (select slot from s),
    'round_id', (select id from r),
    'owner', (select username from public.profiles where id = p_user),
    'saves_left', greatest(coalesce(public.setting('house_saves_per_day'), 30)::int
                           - coalesce((select saves_today from h where saves_day = current_date), 0), 0),
    'tiles_per_house', coalesce(public.setting('tiles_per_house'), 5))
$$;

-- The houses standing in one game, in slot order:
-- [{ slot, user_id, name, style, wall, roof, interior, owner }].
create or replace function public.round_houses_of(p_round bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slot', slot, 'user_id', user_id, 'name', name, 'style', style,
           'wall', wall, 'roof', roof, 'interior', interior, 'owner', owner_name) order by slot), '[]'::jsonb)
  from public.round_houses where round_id = p_round
$$;

-- ============================================================ saving and showing
-- Save a player's house design (every choice is checked against the catalog; the name is
-- tidied and filtered). Saving the same design again is free and doesn't count towards the
-- daily limit. Returns my_house plus { changed }.
-- Errors: unknown_player, bot, frozen, bad_style, bad_wall, bad_roof, bad_interior, rude_name,
-- too_many_saves:<limit>.
create or replace function public.save_house(
  p_user uuid, p_name text, p_style text, p_wall text, p_roof text, p_interior text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  h public.houses;
  v_name text := public.house_clean_name(p_name);
  v_wall text := lower(btrim(coalesce(p_wall, '')));
  v_roof text := lower(btrim(coalesce(p_roof, '')));
  v_max int := coalesce(public.setting('house_saves_per_day'), 30)::int;
  v_used int;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'unknown_player'; end if;
  if p.is_bot then raise exception 'bot'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not public.house_choice_ok('style', p_style) then raise exception 'bad_style'; end if;
  if not public.house_choice_ok('wall', v_wall) then raise exception 'bad_wall'; end if;
  if not public.house_choice_ok('roof', v_roof) then raise exception 'bad_roof'; end if;
  if not public.house_choice_ok('interior', p_interior) then raise exception 'bad_interior'; end if;
  if public.house_name_rude(v_name) then raise exception 'rude_name'; end if;

  select * into h from public.houses where user_id = p_user for update;
  if found then
    if (h.name, h.style, h.wall, h.roof, h.interior) = (v_name, p_style, v_wall, v_roof, p_interior) then
      return public.my_house(p_user) || jsonb_build_object('changed', false);
    end if;
    v_used := case when h.saves_day = current_date then h.saves_today else 0 end;
    if v_used >= v_max then raise exception 'too_many_saves:%', v_max; end if;
    update public.houses
       set name = v_name, style = p_style, wall = v_wall, roof = v_roof, interior = p_interior,
           updated_at = now(), saves_day = current_date, saves_today = v_used + 1
     where user_id = p_user;
  else
    if v_max < 1 then raise exception 'too_many_saves:%', v_max; end if;
    insert into public.houses (user_id, name, style, wall, roof, interior, saves_day, saves_today)
    values (p_user, v_name, p_style, v_wall, v_roof, p_interior, current_date, 1)
    on conflict (user_id) do nothing;  -- two first saves at the same moment: the other one won
  end if;
  return public.my_house(p_user) || jsonb_build_object('changed', true);
end $$;

-- Switch "Show my house in the game" on or off. Takes effect from the next game: the game
-- that's running keeps its houses. Switching off is always allowed and is free (nothing to
-- refund: houses cost nothing for now). Returns my_house.
-- Errors (switching on): unknown_player, no_house, bot, frozen, no_name.
create or replace function public.set_house_published(p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  h public.houses;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'unknown_player'; end if;
  select * into h from public.houses where user_id = p_user for update;
  if not found then
    if coalesce(p_on, false) then raise exception 'no_house'; end if;
    return public.my_house(p_user);
  end if;
  if coalesce(p_on, false) then
    if p.is_bot then raise exception 'bot'; end if;
    if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
    if nullif(btrim(coalesce(p.username, '')), '') is null then raise exception 'no_name'; end if;
    if not h.published then
      update public.houses set published = true, published_at = now() where user_id = p_user;
    end if;
  elsif h.published then
    update public.houses set published = false where user_id = p_user;
  end if;
  return public.my_house(p_user);
end $$;

-- ============================================================ every new game
-- Every new game takes a snapshot of the houses switched on (longest-waiting first, at most
-- houses_per_round_max, no bots, paused or under-18 accounts) and grows its town by
-- tiles_per_house spots for each one. A problem here never stops the game from starting.
create or replace function public.rounds_place_houses() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_max int := greatest(coalesce(public.setting('houses_per_round_max'), 500), 0)::int;
  v_tiles int := greatest(coalesce(public.setting('tiles_per_house'), 5), 0)::int;
  v_at timestamptz := clock_timestamp();
  v_n int;
begin
  if new.status = 'done' or v_max = 0 then return null; end if;
  with picked as (
    select h.user_id, h.name, h.style, h.wall, h.roof, h.interior,
           coalesce(nullif(btrim(p.username), ''), 'A player') as owner_name,
           (row_number() over (order by greatest(h.published_at, h.last_stood_at), h.published_at, h.user_id) - 1)::int as slot
      from public.houses h
      join public.profiles p on p.id = h.user_id
     where h.published and not p.is_bot and not p.frozen and p.age_blocked_at is null
     order by greatest(h.published_at, h.last_stood_at), h.published_at, h.user_id
     limit v_max
  ), placed as (
    insert into public.round_houses (round_id, slot, user_id, name, style, wall, roof, interior, owner_name)
    select new.id, slot, user_id, name, style, wall, roof, interior, owner_name from picked
    on conflict do nothing
    returning user_id
  )
  update public.houses set last_stood_at = v_at where user_id in (select user_id from placed);

  select count(*) into v_n from public.round_houses where round_id = new.id;
  if v_n > 0 and v_tiles > 0 then
    update public.rounds set tile_count = tile_count + v_n * v_tiles where id = new.id;
  end if;
  return null;
exception when others then
  raise warning 'houses not placed in game %: %', new.id, sqlerrm;
  return null;
end $$;
drop trigger if exists rounds_place_houses on public.rounds;
create trigger rounds_place_houses after insert on public.rounds
  for each row execute function public.rounds_place_houses();

-- ============================================================ privacy & access
do $$
declare t text;
begin
  foreach t in array array['houses', 'round_houses'] loop
    execute format('alter table public.%I enable row level security', t);  -- no policies: only the server reads them
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('house_choice_ok', 'house_clean_name', 'house_name_rude', 'my_house', 'round_houses_of', 'save_house',
            'set_house_published', 'rounds_place_houses')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
