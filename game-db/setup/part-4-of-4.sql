-- Newtown database, set-up part 4 of 4 (made by scripts/sql-setup-parts.mjs from game-db/).
-- Paste the parts into a NEW Supabase project's SQL Editor in order, running each before the next.

-- ======================================================== 055_street.sql
-- Newtown, part 55: the street. See docs/STREET.md.
--
-- Stealing (from shops, or picking another player's pocket), getting caught (a fine, reputation,
-- and sometimes a couple of hours in jail, which a bribe might get you out of), pranks at people's
-- doors (eggs, toilet paper, glitter...), rivals (you against someone, with a score), and the
-- city's gossip column (who got caught, who pranked whom, new rivals, new couples).
-- The game says what fines and bribes cost (src/lib/world/street.ts); chances are rolled here.
--
-- Safe to run more than once. Run after parts 1-54.

insert into public.game_settings (key, value, note) values
  ('steal_per_day',       5,  'Pockets one player can try to pick a day'),
  ('steal_catch_pct',    35,  'Chance (%) of being caught picking a pocket (more if they''re online, less if they''re asleep)'),
  ('steal_cash_pct',      5,  'Share (%) of what''s in their wallet a picked pocket gives up (the game caps it)'),
  ('steal_new_days',      3,  'Days a new player can''t be stolen from'),
  ('jail_pct',           25,  'Chance (%) that being caught means jail'),
  ('jail_hours',          2,  'Hours in jail'),
  ('bribe_ok_pct',       70,  'Chance (%) a bribe gets you out of jail'),
  ('prank_per_day',       6,  'Pranks one player can pull a day'),
  ('steal_rep',           1,  'Reputation lost for a pocket picked (people talk)'),
  ('steal_caught_rep',    5,  'Reputation lost when caught picking a pocket')
on conflict (key) do update set note = excluded.note;

alter table public.lives add column if not exists jailed_until timestamptz;

-- Every try at stealing from a player: what went, and whether they were caught.
create table if not exists public.thefts (
  id bigserial primary key,
  thief uuid not null references public.profiles (id) on delete cascade,
  victim uuid not null references public.profiles (id) on delete cascade,
  what text not null check (what in ('cash', 'item', 'nothing')),
  amount numeric(14,2) not null default 0,
  item_name text check (item_name is null or char_length(item_name) <= 60),
  caught boolean not null,
  jailed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists thefts_thief_idx on public.thefts (thief, created_at desc);
create index if not exists thefts_victim_idx on public.thefts (victim, created_at desc);

-- Pranks are left at the door, like a knock.
alter table public.doorstep drop constraint if exists doorstep_kind_check;
alter table public.doorstep add constraint doorstep_kind_check check (kind in ('knock', 'note', 'gift', 'prank'));
alter table public.doorstep add column if not exists prank text check (prank is null or prank in ('eggs', 'toilet_paper', 'glitter', 'fake_parcel', 'stickers', 'air_horn'));
alter table public.doorstep add column if not exists cleaned_at timestamptz;

-- Rivals: you name someone your rival (they're told). Both ways, and it's a proper rivalry.
create table if not exists public.rivals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  rival uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, rival),
  check (user_id <> rival)
);

-- The gossip column: short public lines about what people got up to.
create table if not exists public.gossip (
  id bigserial primary key,
  region text not null,
  kind text not null check (kind in ('caught', 'jail', 'bribe', 'prank', 'rivals', 'couple', 'breakup', 'car', 'mark')),
  body text not null check (char_length(body) <= 200),
  people uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists gossip_region_idx on public.gossip (region, created_at desc);

create or replace function public.gossip_add(p_kind text, p_body text, p_people uuid[]) returns void
language sql security definer set search_path = public as $$
  insert into public.gossip (region, kind, body, people)
  select coalesce((select region from public.lives where user_id = p_people[1]), 'lagos'), p_kind, left(p_body, 200), p_people
$$;

/** Are you in jail? Until when (null when not). */
create or replace function public.jail_until(p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when jailed_until > now() then jailed_until end from public.lives where user_id = p_user
$$;

/** Caught: maybe jail (a roll), and the gossip column hears about it. Says if it was jail. */
create or replace function public.street_jail_roll(p_user uuid, p_what text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_jail boolean := random() * 100 < public.setting('jail_pct');
  v_name text := (select coalesce(username, 'Someone') from public.profiles where id = p_user);
begin
  if v_jail then
    update public.lives set jailed_until = now() + make_interval(hours => public.setting('jail_hours')::int) where user_id = p_user;
    perform public.gossip_add('jail', v_name || ' was caught ' || p_what || ' and spent the afternoon in a cell.', array[p_user]);
  else
    perform public.gossip_add('caught', v_name || ' was caught ' || p_what || '. Fined, and the whole street knows.', array[p_user]);
  end if;
  return v_jail;
end $$;

/** Caught shoplifting (the game rolled it): the fine and reputation (item_caught), then maybe jail. */
create or replace function public.street_shop_caught(p_user uuid, p_fine numeric, p_rep numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_paid numeric;
begin
  if public.jail_until(p_user) is not null then raise exception 'in_jail'; end if;
  v_paid := public.item_caught(p_user, p_fine, p_rep);
  return jsonb_build_object('fine', v_paid, 'jailed', public.street_jail_roll(p_user, 'shoplifting'));
end $$;

/**
 * Pick another player's pocket: cash from their wallet (a share, at most p_cash_max), or failing
 * that one of their small things (worth at most p_item_max, not a car, not up for sale, not in a
 * capsule). Caught (more likely if they're online, less if they're asleep): a fine of p_fine,
 * reputation, they're told who it was, and maybe jail. Not caught: they're told someone did it.
 */
create or replace function public.street_steal(p_thief uuid, p_victim uuid, p_cash_max numeric, p_item_max numeric, p_fine numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.profiles;
  v public.profiles;
  vl public.lives;
  i public.items;
  v_pct numeric := public.setting('steal_catch_pct');
  v_caught boolean;
  v_amount numeric := 0;
  v_what text := 'nothing';
  v_paid numeric := 0;
  v_jailed boolean := false;
  v_hour int := extract(hour from now() at time zone 'Africa/Lagos');
begin
  if p_thief = p_victim then raise exception 'self'; end if;
  select * into t from public.profiles where id = p_thief for update;
  if not found or t.is_bot then raise exception 'unknown_player'; end if;
  if t.frozen or t.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not exists (select 1 from public.lives where user_id = p_thief) then raise exception 'no_life'; end if;
  if public.jail_until(p_thief) is not null then raise exception 'in_jail'; end if;
  select * into v from public.profiles where id = p_victim for update;
  select * into vl from public.lives where user_id = p_victim;
  if v.id is null or vl.user_id is null or v.is_bot then raise exception 'no_life'; end if;
  if exists (select 1 from public.blocks where (blocker = p_victim and blocked = p_thief) or (blocker = p_thief and blocked = p_victim)) then raise exception 'blocked'; end if;
  if vl.started_at > now() - make_interval(days => public.setting('steal_new_days')::int) then raise exception 'too_new'; end if;
  if (select count(*) from public.thefts where thief = p_thief and created_at > now() - interval '1 day') >= public.setting('steal_per_day') then raise exception 'too_many'; end if;
  if exists (select 1 from public.thefts where thief = p_thief and victim = p_victim and created_at > now() - interval '1 day') then raise exception 'too_many_here'; end if;

  -- They notice more when they're about, less when they're asleep.
  if vl.seen_at > now() - interval '4 minutes' then v_pct := v_pct + 15;
  elsif v_hour >= 23 or v_hour < 6 then v_pct := v_pct - 10; end if;
  v_caught := random() * 100 < v_pct;

  if v_caught then
    v_paid := public.life_spend(p_thief, array['fun', 'savings', 'essentials'], least(greatest(coalesce(p_fine, 0), 0), public.setting('item_price_max')));
    if v_paid > 0 then
      perform public.log_coins(p_thief, null, 'fine', -v_paid, false, 'Fine for picking a pocket');
      perform public.pay_tax((select region from public.lives where user_id = p_thief), v_paid, 'fines', 'A pickpocketing fine');
    end if;
    update public.lives set rep_penalty = rep_penalty + public.setting('steal_caught_rep'), mind = greatest(0, mind - 5) where user_id = p_thief;
    v_jailed := public.street_jail_roll(p_thief, 'picking ' || coalesce(v.username, 'someone') || '''s pocket');
    perform public.notify(p_victim, null, 'street', coalesce(t.username, 'Someone') || ' tried to pick your pocket and got caught!', null);
  else
    v_amount := round(least(greatest(v.coins, 0) * public.setting('steal_cash_pct') / 100, greatest(coalesce(p_cash_max, 0), 0)), 2);
    if v_amount >= 0.01 then
      update public.profiles set coins = coins - v_amount where id = p_victim;
      update public.profiles set coins = coins + v_amount where id = p_thief;
      perform public.log_coins(p_victim, null, 'stolen', -v_amount, false, 'Your pocket was picked');
      perform public.log_coins(p_thief, null, 'theft', v_amount, false, 'Picked a pocket');
      v_what := 'cash';
    else
      select * into i from public.items
        where owner = p_victim and category <> 'car' and list_price is null and base_value <= p_item_max
          and not exists (select 1 from public.marks m where m.item_id = items.id and m.taken_by is null and m.removed_at is null)
        order by random() limit 1 for update;
      if found and (select count(*) from public.items where owner = p_thief) < public.setting('items_max') then
        update public.items set owner = p_thief, how = 'stolen', got_at = now() where id = i.id;
        v_what := 'item';
      end if;
    end if;
    if v_what <> 'nothing' then
      update public.lives set rep_penalty = rep_penalty + public.setting('steal_rep') where user_id = p_thief;
      perform public.notify(p_victim, null, 'street',
        case v_what when 'cash' then 'Someone picked your pocket: ' || trim_scale(v_amount) || ' mint gone. Keep your money in the bank (your budget pots).'
                    else 'Someone picked your pocket and got away with your ' || i.name || '.' end, null);
    end if;
  end if;
  insert into public.thefts (thief, victim, what, amount, item_name, caught, jailed)
    values (p_thief, p_victim, case when v_caught then 'nothing' else v_what end, v_amount, i.name, v_caught, v_jailed);
  return jsonb_build_object('caught', v_caught, 'jailed', v_jailed, 'fine', v_paid, 'what', case when v_caught then 'nothing' else v_what end, 'amount', v_amount, 'item', i.name);
end $$;

/** Try to bribe your way out of jail: it works most of the time; if not, the money's gone anyway. */
create or replace function public.jail_bribe(p_user uuid, p_cost numeric) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(greatest(coalesce(p_cost, 0), 0), 2);
  v_ok boolean := random() * 100 < public.setting('bribe_ok_pct');
begin
  if public.jail_until(p_user) is null then raise exception 'not_in_jail'; end if;
  if public.life_can_spend(p_user, array['fun', 'savings', 'essentials']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
  perform public.life_spend(p_user, array['fun', 'savings', 'essentials'], v_cost);
  perform public.log_coins(p_user, null, 'fine', -v_cost, false, case when v_ok then 'A bribe to get out of jail' else 'A bribe that didn''t work' end);
  perform public.burn(null, v_cost, 'Jail bribes');
  if v_ok then
    update public.lives set jailed_until = null where user_id = p_user;
    if random() < 0.5 then
      perform public.gossip_add('bribe', (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' was seen walking out of the station early. Nobody asks how.', array[p_user]);
    end if;
  end if;
  return v_ok;
end $$;

/** Prank someone's door (it costs a little, and they see who did it). */
create or replace function public.street_prank(p_from uuid, p_to uuid, p_prank text, p_cost numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(greatest(coalesce(p_cost, 0), 0), 2);
  v_id bigint;
  v_name text;
  v_their text;
begin
  if p_from = p_to then raise exception 'self'; end if;
  if p_prank not in ('eggs', 'toilet_paper', 'glitter', 'fake_parcel', 'stickers', 'air_horn') then raise exception 'bad_kind'; end if;
  if not exists (select 1 from public.lives where user_id = p_from) then raise exception 'no_life'; end if;
  if public.jail_until(p_from) is not null then raise exception 'in_jail'; end if;
  if not exists (select 1 from public.lives where user_id = p_to and home_unit is not null) then raise exception 'no_home'; end if;
  if exists (select 1 from public.blocks where (blocker = p_to and blocked = p_from) or (blocker = p_from and blocked = p_to)) then raise exception 'blocked'; end if;
  if (select count(*) from public.doorstep where from_user = p_from and kind = 'prank' and created_at > now() - interval '1 day') >= public.setting('prank_per_day') then raise exception 'too_many'; end if;
  if exists (select 1 from public.doorstep where from_user = p_from and to_user = p_to and kind = 'prank' and created_at > now() - interval '1 day') then raise exception 'too_many_here'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_from, array['fun', 'savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_from, array['fun', 'savings'], v_cost);
    perform public.log_coins(p_from, null, 'prank', -v_cost, false, 'A prank');
    perform public.burn(null, v_cost, 'Pranks');
  end if;
  insert into public.doorstep (to_user, from_user, kind, prank) values (p_to, p_from, 'prank', p_prank) returning id into v_id;
  select coalesce(username, 'Someone') into v_name from public.profiles where id = p_from;
  select coalesce(username, 'someone') into v_their from public.profiles where id = p_to;
  perform public.notify(p_to, null, 'doorstep', v_name || ' pranked your door! Go and see.', null);
  -- Rivals pranking each other is news.
  if exists (select 1 from public.rivals where user_id = p_from and rival = p_to) then
    perform public.gossip_add('prank', v_name || ' struck again: ' || v_their || '''s door got the ' ||
      case p_prank when 'eggs' then 'egg' when 'toilet_paper' then 'toilet paper' when 'glitter' then 'glitter bomb' when 'fake_parcel' then 'fake parcel'
                   when 'stickers' then 'sticker' else 'air horn' end || ' treatment. The rivalry goes on.', array[p_from, p_to]);
  end if;
  return v_id;
end $$;

/** What's at your door (newest first), pranks too (part 51's, with what the prank was and if it's cleaned). */
create or replace function public.doorstep_list(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'body', d.body, 'item', d.item_name, 'at', d.created_at,
      'opened', d.opened_at is not null, 'thanked', d.thanked_at is not null, 'from', d.from_user, 'fromName', coalesce(p.username, 'Someone'), 'fromAvatar', p.avatar,
      'prank', d.prank, 'cleaned', d.cleaned_at is not null)
    order by d.created_at desc, d.id desc), '[]'::jsonb)
  from (select * from public.doorstep where to_user = p_user order by created_at desc, id desc limit 60) d
  left join public.profiles p on p.id = d.from_user
$$;

/** Clean a prank off your door (it's gone from the map; a little peace of mind back). */
create or replace function public.prank_clean(p_user uuid, p_id bigint) returns void
language sql security definer set search_path = public as $$
  update public.doorstep set cleaned_at = now(), opened_at = coalesce(opened_at, now()) where id = p_id and to_user = p_user and kind = 'prank' and cleaned_at is null
$$;

/** Name someone your rival (or stop). They're told; both ways, it's in the gossip. */
create or replace function public.rival_set(p_user uuid, p_other uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
  v_their text;
  v_mutual boolean;
begin
  if p_user = p_other then raise exception 'self'; end if;
  if exists (select 1 from public.blocks where (blocker = p_other and blocked = p_user) or (blocker = p_user and blocked = p_other)) then raise exception 'blocked'; end if;
  if not p_on then
    delete from public.rivals where user_id = p_user and rival = p_other;
    return false;
  end if;
  if (select count(*) from public.rivals where user_id = p_user) >= 10 then raise exception 'too_many'; end if;
  insert into public.rivals (user_id, rival) values (p_user, p_other) on conflict do nothing;
  if not found then return exists (select 1 from public.rivals where user_id = p_other and rival = p_user); end if;
  select coalesce(username, 'Someone') into v_name from public.profiles where id = p_user;
  select coalesce(username, 'someone') into v_their from public.profiles where id = p_other;
  v_mutual := exists (select 1 from public.rivals where user_id = p_other and rival = p_user);
  perform public.notify(p_other, null, 'street', case when v_mutual then v_name || ' accepted the rivalry. Game on.' else v_name || ' named you their rival. Name them back?' end, null);
  if v_mutual then perform public.gossip_add('rivals', v_name || ' and ' || v_their || ' are officially rivals. Watch this space.', array[p_user, p_other]); end if;
  return v_mutual;
end $$;

/** Your rivals and the score this month (pranks pulled and pockets picked, each way). */
create or replace function public.rivals_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.rival, 'name', coalesce(p.username, 'Someone'), 'avatar', p.avatar,
      'named', exists (select 1 from public.rivals x where x.user_id = p_user and x.rival = r.rival),
      'namedMe', exists (select 1 from public.rivals x where x.user_id = r.rival and x.rival = p_user),
      'mine', (select count(*) from public.doorstep d where d.from_user = p_user and d.to_user = r.rival and d.kind = 'prank' and d.created_at > now() - interval '30 days')
            + (select count(*) from public.thefts f where f.thief = p_user and f.victim = r.rival and not f.caught and f.what <> 'nothing' and f.created_at > now() - interval '30 days'),
      'theirs', (select count(*) from public.doorstep d where d.from_user = r.rival and d.to_user = p_user and d.kind = 'prank' and d.created_at > now() - interval '30 days')
            + (select count(*) from public.thefts f where f.thief = r.rival and f.victim = p_user and not f.caught and f.what <> 'nothing' and f.created_at > now() - interval '30 days'))
    order by r.created_at desc), '[]'::jsonb)
  from (select rival, created_at from public.rivals where user_id = p_user
        union select user_id, created_at from public.rivals where rival = p_user and not exists (select 1 from public.rivals y where y.user_id = p_user and y.rival = rivals.user_id)) r
  left join public.profiles p on p.id = r.rival
$$;

/** The gossip column for a city (newest first), leaving out people you've blocked. */
create or replace function public.gossip_list(p_viewer uuid, p_region text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'body', g.body, 'people', g.people, 'at', g.created_at) order by g.created_at desc), '[]'::jsonb)
  from (select * from public.gossip where region = p_region and created_at > now() - interval '7 days' order by created_at desc limit 40) g
  where p_viewer is null or not exists (select 1 from public.blocks b where b.blocker = p_viewer and b.blocked = any (g.people))
$$;

do $$
begin
  revoke all on table public.thefts, public.rivals, public.gossip from public, anon, authenticated;
  grant all on table public.thefts, public.rivals, public.gossip to service_role;
  revoke all on sequence public.thefts_id_seq, public.gossip_id_seq from public, anon, authenticated;
  grant all on sequence public.thefts_id_seq, public.gossip_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.gossip_add(text, text, uuid[])', 'public.jail_until(uuid)', 'public.street_jail_roll(uuid, text)',
    'public.street_shop_caught(uuid, numeric, numeric)', 'public.street_steal(uuid, uuid, numeric, numeric, numeric)',
    'public.jail_bribe(uuid, numeric)', 'public.street_prank(uuid, uuid, text, numeric)', 'public.prank_clean(uuid, bigint)',
    'public.rival_set(uuid, uuid, boolean)', 'public.rivals_of(uuid)', 'public.gossip_list(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 056_dating.sql
-- Newtown, part 56: dating. See docs/DATING.md.
--
-- Everyone in Newtown is an adult (part 12). Dating is opt-in: only players who've switched
-- "Open to dating" on can be asked out or ask. Nothing happens without a yes: every ask (a date,
-- a hug, a kiss, making out, more) waits for the other person to say yes or no, and either of
-- you can end it at any time. A "no" can't be asked again for a day. One partner at a time.
-- Moments together lift both of your minds. (Proposals, weddings and children come later.)
--
-- Safe to run more than once. Run after parts 1-55.

alter table public.profiles add column if not exists dating_open boolean not null default false;
alter table public.profiles add column if not exists dating_about text check (dating_about is null or char_length(dating_about) <= 140);
-- Whether your couple shows in the gossip column (both must allow it).
alter table public.profiles add column if not exists dating_public boolean not null default true;

-- Couples: the pair (in order) and since when. Ended couples stay, with when it ended.
create table if not exists public.couples (
  id bigserial primary key,
  a uuid not null references public.profiles (id) on delete cascade,
  b uuid not null references public.profiles (id) on delete cascade,
  since timestamptz not null default now(),
  ended_at timestamptz,
  check (a < b)
);
create unique index if not exists couples_now_idx on public.couples (a, b) where ended_at is null;

-- Asks: a date, or a moment with your partner. Pending until a yes or a no (or a day goes by).
create table if not exists public.date_asks (
  id bigserial primary key,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  act text not null check (act in ('date', 'hug', 'kiss', 'make_out', 'make_out_plus')),
  note text check (note is null or char_length(note) <= 140),
  status text not null default 'asked' check (status in ('asked', 'yes', 'no', 'withdrawn')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists date_asks_to_idx on public.date_asks (to_user, created_at desc);
create index if not exists date_asks_from_idx on public.date_asks (from_user, created_at desc);

/** Who you're with now (null when no one). */
create or replace function public.partner_of(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when a = p_user then b else a end from public.couples where (a = p_user or b = p_user) and ended_at is null limit 1
$$;

/** Your dating settings: open to dating, a line about you, show your couple in the gossip. */
create or replace function public.dating_set(p_user uuid, p_open boolean, p_about text, p_public boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set dating_open = coalesce(p_open, false), dating_about = nullif(left(btrim(coalesce(p_about, '')), 140), ''), dating_public = coalesce(p_public, true)
    where id = p_user;
  -- Switching off withdraws what you've asked and turns down what you've been asked.
  if not coalesce(p_open, false) then
    update public.date_asks set status = 'withdrawn', answered_at = now() where from_user = p_user and status = 'asked';
    update public.date_asks set status = 'no', answered_at = now() where to_user = p_user and status = 'asked';
  end if;
end $$;

/**
 * Ask someone: on a date (both open to dating, neither with someone else), or a moment with your
 * partner (hug, kiss, make out, more). They're told and answer yes or no.
 */
create or replace function public.date_ask(p_from uuid, p_to uuid, p_act text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  f public.profiles;
  t public.profiles;
  v_id bigint;
begin
  if p_from = p_to then raise exception 'self'; end if;
  if p_act not in ('date', 'hug', 'kiss', 'make_out', 'make_out_plus') then raise exception 'bad_kind'; end if;
  select * into f from public.profiles where id = p_from;
  select * into t from public.profiles where id = p_to;
  if f.id is null or t.id is null or t.is_bot then raise exception 'unknown_player'; end if;
  if f.frozen or f.age_blocked_at is not null or t.frozen or t.age_blocked_at is not null then raise exception 'frozen'; end if;
  if exists (select 1 from public.blocks where (blocker = p_to and blocked = p_from) or (blocker = p_from and blocked = p_to)) then raise exception 'blocked'; end if;
  if not f.dating_open then raise exception 'you_closed'; end if;
  if not t.dating_open then raise exception 'they_closed'; end if;
  if p_act = 'date' then
    if public.partner_of(p_from) is not null then raise exception 'you_taken'; end if;
    if public.partner_of(p_to) is not null then raise exception 'they_taken'; end if;
  elsif public.partner_of(p_from) is distinct from p_to then
    raise exception 'not_together';
  end if;
  -- One ask at a time each way, and a no means not again today.
  if exists (select 1 from public.date_asks where from_user = p_from and to_user = p_to and status = 'asked' and created_at > now() - interval '1 day') then raise exception 'waiting'; end if;
  if exists (select 1 from public.date_asks where from_user = p_from and to_user = p_to and act = p_act and status = 'no' and answered_at > now() - interval '1 day') then raise exception 'said_no'; end if;
  if (select count(*) from public.date_asks where from_user = p_from and created_at > now() - interval '1 day') >= 20 then raise exception 'too_many'; end if;
  insert into public.date_asks (from_user, to_user, act, note) values (p_from, p_to, p_act, nullif(left(btrim(coalesce(p_note, '')), 140), '')) returning id into v_id;
  perform public.notify(p_to, null, 'dating', coalesce(f.username, 'Someone') ||
    case p_act when 'date' then ' asked you out on a date!' when 'hug' then ' wants a hug.' when 'kiss' then ' wants to kiss you.'
               when 'make_out' then ' wants to make out.' else ' wants to take things further tonight.' end || ' Say yes or no.', null);
  return v_id;
end $$;

/** Answer an ask: yes or no. A yes to a date makes you a couple; a yes to a moment lifts both your minds. */
create or replace function public.date_answer(p_user uuid, p_ask bigint, p_yes boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  q public.date_asks;
  v_name text;
  v_lift numeric;
begin
  select * into q from public.date_asks where id = p_ask and to_user = p_user for update;
  if not found or q.status <> 'asked' or q.created_at < now() - interval '1 day' then raise exception 'gone'; end if;
  select coalesce(username, 'Someone') into v_name from public.profiles where id = p_user;
  if not p_yes then
    update public.date_asks set status = 'no', answered_at = now() where id = p_ask;
    perform public.notify(q.from_user, null, 'dating', v_name || ' said not now.', null);
    return 'no';
  end if;
  if q.act = 'date' then
    if public.partner_of(q.from_user) is not null or public.partner_of(p_user) is not null then raise exception 'taken'; end if;
    insert into public.couples (a, b) values (least(q.from_user, p_user), greatest(q.from_user, p_user));
    v_lift := 10;
    if (select bool_and(dating_public) from public.profiles where id in (q.from_user, p_user)) then
      perform public.gossip_add('couple', (select coalesce(username, 'Someone') from public.profiles where id = q.from_user) || ' and ' || v_name || ' were seen out on a date. Is it official?', array[q.from_user, p_user]);
    end if;
  else
    if public.partner_of(p_user) is distinct from q.from_user then raise exception 'not_together'; end if;
    v_lift := case q.act when 'hug' then 4 when 'kiss' then 7 when 'make_out' then 10 else 14 end;
  end if;
  update public.date_asks set status = 'yes', answered_at = now() where id = p_ask;
  update public.lives set mind = least(100, mind + v_lift) where user_id in (q.from_user, p_user);
  perform public.notify(q.from_user, null, 'dating', v_name || ' said yes!', null);
  return q.act;
end $$;

/** Take back an ask you made (before it's answered). */
create or replace function public.date_withdraw(p_user uuid, p_ask bigint) returns void
language sql security definer set search_path = public as $$
  update public.date_asks set status = 'withdrawn', answered_at = now() where id = p_ask and from_user = p_user and status = 'asked'
$$;

/** End it with your partner (either of you, any time). They're told, kindly. */
create or replace function public.date_end(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  c public.couples;
  v_other uuid;
begin
  select * into c from public.couples where (a = p_user or b = p_user) and ended_at is null for update;
  if not found then raise exception 'not_together'; end if;
  v_other := case when c.a = p_user then c.b else c.a end;
  update public.couples set ended_at = now() where id = c.id;
  update public.date_asks set status = 'withdrawn', answered_at = now() where status = 'asked' and ((from_user = p_user and to_user = v_other) or (from_user = v_other and to_user = p_user));
  perform public.notify(v_other, null, 'dating', (select coalesce(username, 'Someone') from public.profiles where id = p_user) || ' has ended things. Take care of yourself.', null);
  if (select bool_and(dating_public) from public.profiles where id in (c.a, c.b)) then
    perform public.gossip_add('breakup', (select coalesce(username, 'Someone') from public.profiles where id = c.a) || ' and ' || (select coalesce(username, 'Someone') from public.profiles where id = c.b) || ' have gone their separate ways.', array[c.a, c.b]);
  end if;
end $$;

/** Your dating: your settings, your partner, what you've been asked and what you've asked (the last day). */
create or replace function public.dating_mine(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', p.dating_open, 'about', p.dating_about, 'public', p.dating_public,
    'partner', (select jsonb_build_object('id', q.id, 'name', coalesce(q.username, 'Someone'), 'avatar', q.avatar, 'since', c.since)
                from public.couples c join public.profiles q on q.id = case when c.a = p_user then c.b else c.a end
                where (c.a = p_user or c.b = p_user) and c.ended_at is null limit 1),
    'asked', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'act', d.act, 'note', d.note, 'at', d.created_at, 'from', d.from_user, 'fromName', coalesce(q.username, 'Someone'), 'fromAvatar', q.avatar) order by d.created_at desc)
                from public.date_asks d join public.profiles q on q.id = d.from_user
                where d.to_user = p_user and d.status = 'asked' and d.created_at > now() - interval '1 day'
                  and not exists (select 1 from public.blocks b where b.blocker = p_user and b.blocked = d.from_user)), '[]'::jsonb),
    'sent', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'act', d.act, 'status', d.status, 'at', d.created_at, 'to', d.to_user, 'toName', coalesce(q.username, 'Someone')) order by d.created_at desc)
                from public.date_asks d join public.profiles q on q.id = d.to_user
                where d.from_user = p_user and d.created_at > now() - interval '1 day'), '[]'::jsonb))
  from public.profiles p where p.id = p_user
$$;

/** Dating between you and someone (for their card): are they open, are you together, an ask waiting. */
create or replace function public.dating_with(p_viewer uuid, p_other uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select dating_open from public.profiles where id = p_other),
    'about', (select dating_about from public.profiles where id = p_other and dating_open),
    'meOpen', (select dating_open from public.profiles where id = p_viewer),
    'together', coalesce(public.partner_of(p_viewer) = p_other, false),
    'taken', coalesce(public.partner_of(p_other) <> p_viewer, false),
    'meTaken', coalesce(public.partner_of(p_viewer) <> p_other, false),
    'waiting', (select act from public.date_asks where from_user = p_viewer and to_user = p_other and status = 'asked' and created_at > now() - interval '1 day' limit 1),
    'theyAsked', (select jsonb_build_object('id', id, 'act', act) from public.date_asks where from_user = p_other and to_user = p_viewer and status = 'asked' and created_at > now() - interval '1 day' order by created_at desc limit 1))
$$;

do $$
begin
  revoke all on table public.couples, public.date_asks from public, anon, authenticated;
  grant all on table public.couples, public.date_asks to service_role;
  revoke all on sequence public.couples_id_seq, public.date_asks_id_seq from public, anon, authenticated;
  grant all on sequence public.couples_id_seq, public.date_asks_id_seq to service_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array[
    'public.partner_of(uuid)', 'public.dating_set(uuid, boolean, text, boolean)', 'public.date_ask(uuid, uuid, text, text)',
    'public.date_answer(uuid, bigint, boolean)', 'public.date_withdraw(uuid, bigint)', 'public.date_end(uuid)',
    'public.dating_mine(uuid)', 'public.dating_with(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 057_outdoor_chat.sql
-- Newtown, part 57: chat in open-air places (a park, a plaza, a landmark's main entrance).
--
-- Places have levels: g (ground), f1..f200 (floors), r (the roof) and o (open air at street level).
-- Chat only took the first three, so talking in a park or at Unilag's main gate failed.
--
-- Safe to run more than once. Run after parts 1-56.

create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|o|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'
    or p_room ~ '^v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7}$',
    false)
$$;

-- ======================================================== 058_course_done.sql
-- Newtown, part 58: finishing a course is news. See docs/LIVING.md.
--
-- When a course ends (life_courses.done_at is set), you get a notification: congratulations, and
-- the certificate if it gives one. The game also shows the certificate the next time you look.
--
-- Safe to run more than once. Run after parts 1-57.

create or replace function public.course_done_notice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.done_at is null and new.done_at is not null then
    perform public.notify(new.user_id, null, 'course',
      'Congratulations! You finished ' || new.title || case when new.cert is not null then '. Your certificate is ready.' else '.' end, null);
  end if;
  return new;
end $$;

drop trigger if exists course_done_notice on public.life_courses;
create trigger course_done_notice after update of done_at on public.life_courses
  for each row execute function public.course_done_notice();

revoke all on function public.course_done_notice() from public, anon, authenticated;

-- ======================================================== 059_bigger_starts.sql
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

-- ======================================================== 060_find_people.sql
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

-- ======================================================== 061_ride_fares.sql
-- Newtown, part 61: paying for rides on the real map (src/lib/fees.ts RIDE_FARE_NAIRA). Boarding a
-- train, a lagoon ferry, a bus, a taxi, a Ferris wheel, a water slide, a hot-air balloon or a
-- helicopter tour costs its fare every time, from your Travel money then your wallet, burned like
-- every other fare. (Ride fares used to be taken only during the old hourly games, so on the real
-- map they were free.) Trips about town (game-db/048) now cost real 2026 Lagos fares, so the most
-- one trip can cost goes up too.
--
-- Safe to run more than once. Run after part 60.

insert into public.game_settings (key, value, note) values
  ('ride_fare_max', 150, 'Most boarding one ride can cost (mint, a sanity check: a helicopter tour is about 100)')
on conflict (key) do update set note = excluded.note;
update public.game_settings set value = greatest(value, 80) where key = 'trip_fare_max';

/** Board a ride: pay its fare (worked out by the game). Returns what was paid. */
create or replace function public.life_ride(p_user uuid, p_key text, p_fare numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_fare numeric := round(least(public.setting('ride_fare_max'), greatest(0, coalesce(p_fare, 0))), 2);
  v_paid numeric := 0;
  p public.profiles;
begin
  if p_key is null or p_key !~ '^v:[a-z]+:[0-9]{1,3}$' then raise exception 'bad_place'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_fare > 0 then
    if public.life_can_spend(p_user, array['travel']) < v_fare then raise exception 'not_enough:%', trim_scale(v_fare); end if;
    v_paid := public.life_spend(p_user, array['travel'], v_fare);
    perform public.log_coins(p_user, null, 'commute', -v_paid, false, 'Ride: ' || p_key);
    perform public.burn(null, v_paid, 'Ride fares');
  end if;
  return v_paid;
end $$;

do $$
begin
  revoke all on function public.life_ride(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_ride(uuid, text, numeric) to service_role;
end $$;

-- ======================================================== 062_notices_read.sql
-- Newtown, part 62: notices you've read and cleared. Each notice remembers when you read it (the
-- counters on the phone count only unread ones, the same on every device) and whether you swiped
-- it away (it's gone from your lists). Also: photos in private messages (a selfie sent to someone).
--
-- Safe to run more than once. Run after part 61.

alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists dismissed_at timestamptz;
create index if not exists notifications_unread_idx on public.notifications (user_id, id desc) where read_at is null and dismissed_at is null;

-- A picture in a message: the photo's path in the phone_photos storage bucket.
alter table public.chat_messages add column if not exists image_path text check (image_path is null or char_length(image_path) <= 200);

-- Sending one: the message is written by chat_send as usual (names, places, pace all checked
-- there), with the picture attached as it's written, so it arrives live with the picture.
create or replace function public.chat_image_from_setting() returns trigger
language plpgsql as $$
begin
  if new.image_path is null then
    new.image_path := nullif(current_setting('newtown.chat_image', true), '');
  end if;
  return new;
end $$;

drop trigger if exists chat_messages_image on public.chat_messages;
create trigger chat_messages_image before insert on public.chat_messages
  for each row execute function public.chat_image_from_setting();

create or replace function public.chat_send_photo(p_user uuid, p_room text, p_to uuid, p_path text, p_caption text default null)
returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  m public.chat_messages;
begin
  if p_path is null or p_path !~ ('^chat/' || p_user::text || '/[A-Za-z0-9._-]{1,80}$') then raise exception 'bad_target'; end if;
  perform set_config('newtown.chat_image', p_path, true);
  m := public.chat_send(p_user, p_room, p_to, coalesce(nullif(trim(coalesce(p_caption, '')), ''), 'Sent a photo'));
  perform set_config('newtown.chat_image', '', true);
  return m;
end $$;

revoke all on function public.chat_send_photo(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.chat_send_photo(uuid, text, uuid, text, text) to service_role;

-- ======================================================== 063_home_plans.sql
-- Newtown, part 63: planning your home (docs/HOME_PLANNER.md). Each player keeps one plan for the
-- home they live in: its rooms and furniture, floor by floor, drawn flat and built in 3D. The
-- game checks every plan before it's saved (src/lib/home-plan.ts cleanPlan); this table only
-- keeps it.
--
-- Safe to run more than once. Run after part 62.

create table if not exists public.home_plans (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- The home it was drawn for (lives.home_unit), so moving house starts a fresh plan.
  unit text not null check (char_length(unit) <= 120),
  plan jsonb not null check (pg_column_size(plan) <= 65536),
  updated_at timestamptz not null default now()
);

do $$
begin
  revoke all on table public.home_plans from public, anon, authenticated;
  grant all on table public.home_plans to service_role;
end $$;

-- ======================================================== 064_home_upgrades.sql
-- Newtown, part 64: building onto your home (docs/HOME_PLANNER.md). Planning stays free, but
-- saving a plan pays for what's new: each extra floor (builders), and each piece of furniture
-- you don't already own. What you've paid for stays yours (take a floor off, or a sofa out, and
-- putting it back costs nothing). Floors add most of their cost to your home's value, furniture
-- some of it. The game works out the prices (src/lib/home-plan.ts planCost); this keeps the
-- books.
--
-- Safe to run more than once. Run after part 63.

alter table public.home_plans add column if not exists paid jsonb not null default '{}'::jsonb;

insert into public.game_settings (key, value, note) values
  ('home_upgrade_max', 200000, 'Most one save of a home plan can cost (mint, a sanity check)')
on conflict (key) do update set note = excluded.note;

/**
 * Save a home plan, paying for what's new. p_cost: what it costs (mint), p_value: what it adds
 * to the home's value, p_paid: everything paid for so far (after this). Returns your wallet.
 */
create or replace function public.home_plan_save(p_user uuid, p_unit text, p_plan jsonb, p_paid jsonb, p_cost numeric, p_value numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(greatest(0, coalesce(p_cost, 0)), 2);
  v_value numeric := round(greatest(0, coalesce(p_value, 0)), 2);
  v_unit public.property_units;
begin
  if v_cost > public.setting('home_upgrade_max') then raise exception 'too_dear'; end if;
  perform 1 from public.lives where user_id = p_user and home_unit = p_unit for update;
  if not found then raise exception 'not_home'; end if;
  select * into v_unit from public.property_units where unit_id = p_unit for update;
  if v_cost > 0 then
    -- Only your own home can be built onto (a home you rent is the landlord's).
    if not found or v_unit.owner_id <> p_user then raise exception 'not_owner'; end if;
    if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'home_upgrade', -v_cost, false, 'Building onto your home');
    perform public.burn(null, v_cost, 'Home improvements');
    update public.property_units
      set price = least(public.setting('property_price_max'), price + v_value)
      where unit_id = p_unit;
  end if;
  insert into public.home_plans (user_id, unit, plan, paid, updated_at)
    values (p_user, p_unit, p_plan, coalesce(p_paid, '{}'::jsonb), now())
  on conflict (user_id) do update set unit = excluded.unit, plan = excluded.plan, paid = excluded.paid, updated_at = now();
  return jsonb_build_object(
    'coins', (select coins from public.profiles where id = p_user),
    'value', (select price from public.property_units where unit_id = p_unit)
  );
end $$;

revoke all on function public.home_plan_save(uuid, text, jsonb, jsonb, numeric, numeric) from public, anon, authenticated;
grant execute on function public.home_plan_save(uuid, text, jsonb, jsonb, numeric, numeric) to service_role;

-- ======================================================== 065_economy_balance.sql
-- Newtown, part 65: a fairer economy. A look over where money comes from and where it goes found
-- a few ways to get rich without really playing, and jobs paying less than tapping about for free.
--
-- - Jobs pay 18 times real Lagos wages (was 4; src/lib/world/work.ts PAY_BOOST). The lowest jobs
--   (₦60,000 a month) now pay about ₥288 a real day before tax and fares, more than free taps.
--   Every job gets the same raise, and jobs people already have are raised once. The cap on what
--   a job can pay (work_pay_max) goes up to fit. Side hustles stay as they were.
-- - The daily refill counts the money in your budget pots (Savings and the rest) as well as your
--   wallet, so moving money into a pot no longer keeps the refill coming.
-- - Levels cost more: 40 × the level in mint below 20 (was 10 ×), 160 × (level − 15) from 20 on
--   (was 50 ×), so levelling up (and the bigger daily refill it brings) isn't nearly free.
-- - Gifts and spraying: until your account is 3 days old and level 5, you can give at most ₥500 a
--   day (so new second accounts can't pass their free mint straight on).
-- - Food: about ₦3,000 a real day in Lagos, paid with the bills by the game day (src/lib/world/
--   living.ts FOOD_MONTH). What can't be paid costs a little health instead.
-- - Rent follows value: when a unit's price changes (building onto your home, a sale on the
--   market), what it earns while let is worked out again by the rule used when it was bought:
--   homes 6% of their value a game year, business units 9%, land nothing.
-- - Shops pay for things from their worth, and the market only pulls worth between half and one and
--   a half times what a thing was worth when made (src/lib/world/items.ts itemWorth). As a backstop
--   here, a shop never pays more than twice that.
-- - Picking a pocket: caught 4 times in 10 (was about 1 in 3), and the fine is ₦40,000 (the game's
--   src/lib/world/street.ts), so on average it doesn't pay.
-- Crafting's materials and worth are worked out by the game (src/lib/world/items.ts); nothing to
-- change here.
--
-- Safe to run more than once. Run after parts 1-64.

-- ============================================================ settings
insert into public.game_settings (key, value, note) values
  ('gift_new_days',          3,   'Days an account must be before it can give more than gift_new_daily_max a day'),
  ('gift_new_level',         5,   'Level a player must reach before they can give more than gift_new_daily_max a day'),
  ('gift_new_daily_max',     500, 'Most mint a new or low-level player can give away (gifts and spraying) a day'),
  ('living_hungry_health',   1,   'Health lost for each game day of food that could not be paid for')
on conflict (key) do update set note = excluded.note;

update public.game_settings set value = greatest(value, 1500),
  note = 'Most a job on the real map can pay every 2 hours (mint, before skill bonus; a pilot gets 1,200)' where key = 'work_pay_max';
-- Levels cost four times as much below 20 (40 × L), and from 20 on 160 × (L − 15), so the price
-- still only goes up: ₥760 from 19 to 20, ₥800 from 20 to 21.
update public.game_settings set value = 40, note = 'Mint to go from level L to L+1 below level_easy_until = this × L' where key = 'level_cost_easy';
update public.game_settings set value = 160, note = 'Mint from level_easy_until up = this × (L − level_easy_until + 5)' where key = 'level_cost_hard';
update public.game_settings set value = 40,
  note = 'Chance (%) of being caught picking a pocket (more if they''re online, less if they''re asleep)' where key = 'steal_catch_pct';

-- ============================================================ jobs pay 18 times real wages
-- Jobs people already have get the raise (18 ÷ 4 = 4.5 times). Each job's old pay is at most what
-- its best-paid place paid at 4 times (below, mint a game day in Lagos); a job paid more than that
-- has had its raise already (jobs pay at most twice as much in one place as another, and the raise
-- is 4.5 times), so running this again, or after someone took a job at the new pay, changes nothing.
update public.life_jobs j set pay_day = round(j.pay_day * 4.5, 2)
from (values
  ('accountant', 31.11), ('admin_officer', 17.78), ('airport_cleaner', 7.11), ('analyst', 44.44), ('bartender', 8.89),
  ('cabin_crew', 53.33), ('campus_cleaner', 6.22), ('caretaker', 5.33), ('cashier', 10.67), ('check_in', 22.22),
  ('chef', 22.22), ('civil_servant', 16), ('cook', 10.67), ('crane_operator', 26.67), ('curator', 26.67),
  ('director', 62.22), ('dj', 26.67), ('dock_worker', 10.67), ('doctor', 80), ('farm_hand', 5.33),
  ('farm_manager', 17.78), ('fire_cleaner', 6.22), ('firefighter', 15.11), ('forklift', 13.33), ('fuel_cashier', 8),
  ('gardener', 5.33), ('groundskeeper', 8), ('guide', 8.89), ('hospital_porter', 7.11), ('hotel_manager', 80),
  ('hotel_receptionist', 13.33), ('housekeeper', 8), ('lab_assistant', 13.33), ('labourer', 6.22), ('lecturer', 40),
  ('loader', 7.11), ('manager', 106.67), ('market_trader', 17.78), ('messenger', 6.22), ('nurse', 26.67),
  ('office_assistant', 8.89), ('pilot', 266.67), ('police_clerk', 8), ('police_officer', 16), ('port_manager', 88.89),
  ('porter', 5.33), ('pump_attendant', 6.22), ('receptionist', 13.33), ('restaurant_manager', 26.67), ('sales_assistant', 8.89),
  ('school_cleaner', 6.22), ('shop_assistant', 7.11), ('shop_supervisor', 13.33), ('site_foreman', 22.22), ('station_manager', 22.22),
  ('steward', 6.22), ('store_manager', 35.56), ('teacher', 13.33), ('trader_assistant', 7.11), ('waiter', 6.22),
  ('warehouse_manager', 31.11), ('waste_collector', 7.11)
) as was (job, top)
where j.job = was.job and j.region = 'lagos' and j.pay_day <= was.top + 0.01;

-- ============================================================ the daily refill counts your pots
-- The daily refill: 100, then +25 per level (no more growth after level passive_level_cap), up to
-- the same target. What you have is your wallet and your budget pots together.
create or replace function public.accrue_passive(p_user uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_lv int;
  v_target numeric;
  v_day numeric;
  v_rate numeric;      -- coins per second
  v_amt numeric;
  v_recent numeric;
  v_have numeric;      -- wallet and pots
begin
  select * into p from public.profiles where id = p_user for update;
  v_lv := least(coalesce(p.level, 1), coalesce(public.setting('passive_level_cap'), 40)::int);
  v_day := public.setting('passive_per_day') + public.setting('passive_per_level') * greatest(v_lv - 1, 0);
  v_target := public.setting('passive_target') + public.setting('passive_per_level') * greatest(v_lv - 1, 0);
  if not found or p.is_bot or p.frozen or v_day <= 0 then return 0; end if;
  v_have := p.coins + coalesce((select sum(balance) from public.life_pots where user_id = p_user), 0);
  if v_have >= v_target or p.passive_at is null then
    update public.profiles set passive_at = now() where id = p_user;
    return 0;
  end if;
  v_rate := v_day / 86400.0;
  v_amt := floor(extract(epoch from (now() - p.passive_at)) * v_rate);
  select coalesce(sum(amount), 0) into v_recent from public.ledger
    where user_id = p_user and kind = 'passive' and created_at > now() - interval '24 hours';
  v_amt := least(v_amt, floor(v_target - v_have), floor(v_day - v_recent));
  if v_amt < 1 then
    if v_recent >= v_day then update public.profiles set passive_at = now() where id = p_user; end if;
    return 0;
  end if;
  update public.profiles set coins = coins + v_amt,
         passive_at = least(now(), passive_at + make_interval(secs => (v_amt / v_rate)::double precision))
    where id = p_user;
  perform public.log_coins(p_user, null, 'passive', v_amt);
  return v_amt;
end $$;

-- ============================================================ gifts from new accounts
/** How much this player may give away a day: the full amount, or less while their account is new or their level low. */
create or replace function public.gift_daily_limit(p public.profiles) returns numeric
language sql stable set search_path = public as $$
  select case
    when p.created_at > now() - make_interval(days => public.setting('gift_new_days')::int)
      or coalesce(p.level, 1) < public.setting('gift_new_level')
    then least(public.setting('gift_daily_max'), public.setting('gift_new_daily_max'))
    else public.setting('gift_daily_max') end
$$;

-- Checks shared by gifts and spraying: may this player give coins away (amount more today)? New
-- accounts (under gift_new_days days old) and low levels (under gift_new_level) can give only
-- gift_new_daily_max a day.
create or replace function public.gift_check(p public.profiles, p_amount numeric) returns void
language plpgsql set search_path = public as $$
declare
  v_today numeric;
  v_max numeric;
begin
  if p.id is null or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen then raise exception 'frozen'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.seeker_rounds + p.hider_rounds < public.setting('gift_min_rounds') then raise exception 'new_player'; end if;
  select coalesce(sum(amount), 0) into v_today from public.coin_gifts
   where from_id = p.id and created_at >= date_trunc('day', now());
  v_max := public.gift_daily_limit(p);
  if v_today + p_amount > v_max then
    if v_max < public.setting('gift_daily_max') then
      raise exception 'new_giver_cap:%', greatest(v_max - v_today, 0);
    end if;
    raise exception 'daily_cap:%', greatest(v_max - v_today, 0);
  end if;
  if p.coins < p_amount then raise exception 'not_enough'; end if;
end $$;

-- Give coins to another player (1–10,000 whole coins). Returns { amount, to, balance, left_today }
-- (as part 19, with what's left today from the giver's own limit).
create or replace function public.give_coins(p_from uuid, p_to uuid, p_amount numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.profiles;
  t public.profiles;
  v_note text := nullif(btrim(left(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g'), 80)), '');
  v_pair numeric;
  v_round bigint;
  v_q bigint;
begin
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 1 or p_amount > public.setting('gift_max') then
    raise exception 'bad_amount';
  end if;
  if p_to is null or p_to = p_from then raise exception 'gift_self'; end if;
  perform public.lock_players(array[p_from, p_to]);
  select * into f from public.profiles where id = p_from;
  select * into t from public.profiles where id = p_to;
  if t.id is null or t.username is null then raise exception 'unknown_target'; end if;
  if t.is_bot then raise exception 'target_bot'; end if;
  if t.frozen then raise exception 'target_frozen'; end if;
  perform public.gift_check(f, p_amount);
  select coalesce(sum(amount), 0) into v_pair from public.coin_gifts
   where from_id = p_from and to_id = p_to and created_at >= date_trunc('day', now());
  if v_pair + p_amount > public.setting('gift_pair_daily_max') then
    raise exception 'pair_cap:%', greatest(public.setting('gift_pair_daily_max') - v_pair, 0);
  end if;

  select max(id) into v_round from public.rounds;
  update public.profiles set coins = coins - p_amount where id = p_from;
  update public.profiles set coins = coins + p_amount where id = p_to;
  perform public.log_coins(p_from, v_round, 'gift_sent', -p_amount, false, 'To ' || t.username || coalesce(': ' || v_note, ''));
  perform public.log_coins(p_to, v_round, 'gift_received', p_amount, false, 'From ' || f.username || coalesce(': ' || v_note, ''));
  insert into public.coin_gifts (from_id, to_id, kind, amount, note) values (p_from, p_to, 'gift', p_amount, v_note);
  perform public.notify(p_to, v_round, 'gift', format('%s gave you %s coins%s', f.username, p_amount,
    coalesce(': "' || v_note || '"', '!')));

  select id into v_q from public.quests where user_id = p_from and status = 'active' and expires_at > now();
  if found then perform public.quest_sync(v_q); end if;
  return jsonb_build_object('amount', p_amount, 'to', t.username,
    'balance', (select coins from public.profiles where id = p_from),
    'left_today', greatest(0, public.gift_daily_limit(f) - (select coalesce(sum(amount), 0) from public.coin_gifts
                                                       where from_id = p_from and created_at >= date_trunc('day', now()))));
end $$;

-- ============================================================ food, with the bills
-- life_tick gains p_food_day (food a game day, mint). The old version (without it) goes, so the
-- game never calls the wrong one.
drop function if exists public.life_tick(uuid, numeric, numeric, numeric, numeric, numeric, numeric, jsonb);

/**
 * Bring a life up to now (as part 41): health and mind, the home's bills, food, the gym, a
 * check-up when needed, where the time went, courses finished. Food is paid by the game day from
 * Essentials, then the wallet, home or not (everyone eats); what can't be paid costs
 * living_hungry_health health a game day instead.
 */
create or replace function public.life_tick(
  p_user uuid, p_power_day numeric, p_waste_day numeric, p_care_fee numeric,
  p_body_day numeric, p_mind_day numeric, p_gym_day numeric, p_hours jsonb, p_food_day numeric default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_hours numeric := public.setting('work_day_hours');
  v_days numeric;
  v_bdays numeric;
  v_health numeric;
  v_mind numeric;
  v_power numeric;
  v_waste numeric;
  v_paid numeric;
  v_gym numeric;
  v_food numeric;
  v_fee numeric := round(least(greatest(coalesce(p_care_fee, 0), 0), public.setting('living_fee_max')), 2);
  k text;
  c record;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return null; end if;
  perform 1 from public.profiles where id = p_user for update;

  v_days := least(public.setting('living_bill_hold_days'), greatest(0, extract(epoch from (now() - l.health_at)) / 3600.0 / v_hours));
  v_health := least(100, greatest(0, l.health + least(5, greatest(-5, coalesce(p_body_day, -1.5))) * v_days));
  v_mind := least(100, greatest(0, l.mind + least(5, greatest(-5, coalesce(p_mind_day, 0))) * v_days));

  if l.home_unit is not null then
    v_bdays := least(public.setting('living_bill_hold_days'), greatest(0, extract(epoch from (now() - l.bills_at)) / 3600.0 / v_hours));
    v_power := l.power_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_power_day, 0))) * v_bdays, 2);
    v_waste := l.waste_owed + round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_waste_day, 0))) * v_bdays, 2);
    v_paid := public.life_spend(p_user, array['essentials'], v_power);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'power_bill', -v_paid, false, 'Electricity');
      perform public.burn(null, v_paid, 'Electricity bills');
    end if;
    v_power := v_power - v_paid;
    v_paid := public.life_spend(p_user, array['essentials'], v_waste);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'waste_bill', -v_paid, false, 'Waste collection');
      perform public.pay_tax(l.region, v_paid, 'waste_bill', 'Waste collection');
    end if;
    v_waste := v_waste - v_paid;
    update public.lives set bills_at = now(), power_owed = v_power, waste_owed = v_waste, power_day = round(greatest(0, coalesce(p_power_day, 0)), 2)
      where user_id = p_user;
  end if;

  -- Food, by the game day, home or not. Hungry days (unpaid) cost a little health.
  v_food := round(least(public.setting('living_bill_max_day'), greatest(0, coalesce(p_food_day, 0))) * v_days, 2);
  if v_food > 0 then
    v_paid := public.life_spend(p_user, array['essentials'], v_food);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'food', -v_paid, false, 'Food');
      perform public.burn(null, v_paid, 'Food');
    end if;
    if v_paid < v_food then
      v_health := greatest(0, v_health - coalesce(public.setting('living_hungry_health'), 1) * v_days * (1 - v_paid / v_food));
    end if;
  end if;

  -- The gym, by the game day; can't pay, no gym.
  v_gym := round(least(public.setting('life_gym_max_day'), greatest(0, coalesce(p_gym_day, 0))) * v_days, 2);
  if v_gym > 0 then
    v_paid := public.life_spend(p_user, array['essentials'], v_gym);
    if v_paid > 0 then
      perform public.log_coins(p_user, null, 'gym', -v_paid, false, 'Gym membership');
      perform public.burn(null, v_paid, 'Gym memberships');
    end if;
    if v_paid < v_gym then update public.lives set exercise = 'walk' where user_id = p_user; end if;
  end if;

  -- A check-up by itself when the body is low and you can pay for it.
  if v_health < public.setting('living_auto_care_below') and v_fee > 0
     and public.life_can_spend(p_user, array['essentials']) >= v_fee then
    perform public.life_spend(p_user, array['essentials'], v_fee);
    perform public.log_coins(p_user, null, 'health_care', -v_fee, false, 'Check-up at a public clinic (by itself)');
    perform public.pay_tax(l.region, v_fee, 'health_fees', 'Public clinic fees');
    v_health := least(100, v_health + public.setting('living_auto_care_gain'));
  end if;
  update public.lives set health = round(v_health, 2), mind = round(v_mind, 2), health_at = now() where user_id = p_user;

  -- Where the time went.
  if v_days > 0.01 and p_hours is not null and jsonb_typeof(p_hours) = 'object' then
    for k in select jsonb_object_keys(p_hours) loop
      if k ~ '^[a-z_]{2,20}$' and coalesce((p_hours ->> k)::numeric, 0) > 0 then
        insert into public.life_hours (user_id, kind, hours) values (p_user, k, round(least(24, (p_hours ->> k)::numeric) * v_days, 2));
      end if;
    end loop;
  end if;

  for c in select * from public.life_courses where user_id = p_user and done_at is null and ends_at <= now() for update loop
    update public.life_courses set done_at = now() where user_id = p_user and course = c.course;
    insert into public.life_skills (user_id, skill, days) values (p_user, c.skill, c.grants)
      on conflict (user_id, skill) do update set days = life_skills.days + excluded.days;
  end loop;
  update public.life_events set status = 'expired' where user_id = p_user and status = 'open' and expires_at <= now();

  return public.life_status(p_user);
end $$;

/** Your money by day (as part 50, with food among the living costs). */
create or replace function public.life_money_days(p_user uuid, p_days int) returns jsonb
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(
      (date_trunc('day', now() at time zone 'Africa/Lagos') - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) - 1)),
      date_trunc('day', now() at time zone 'Africa/Lagos'), interval '1 day') as day
  ),
  rows as (
    select date_trunc('day', created_at at time zone 'Africa/Lagos') as day, kind, amount from public.ledger
    where user_id = p_user and created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) + 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', to_char(d.day, 'YYYY-MM-DD'),
    'earned', round(coalesce((select sum(amount) from rows r where r.day = d.day and r.amount > 0
      and r.kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'property_sale', 'item_sale', 'car_sale', 'service_pay')), 0), 2),
    'costs', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('income_tax', 'rent_tax', 'vat', 'sale_tax', 'power_bill', 'waste_bill', 'food', 'commute', 'health_care', 'gym', 'school_fees',
                     'procedure', 'loan_repay', 'market_fee', 'item_tax', 'car_running', 'fine')), 0), 2),
    'bought', round(coalesce((select -sum(amount) from rows r where r.day = d.day and r.amount < 0
      and r.kind in ('property_buy', 'property_tax', 'hustle_start', 'item_buy', 'car_buy', 'craft_cost')), 0), 2)
  ) order by d.day), '[]'::jsonb)
  from days d
$$;

/** Money in and out by kind (as part 50, with food). */
create or replace function public.life_money(p_user uuid, p_hours int) returns jsonb
language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 365)) as t),
  rows as (
    select kind, sum(amount) as amount from public.ledger, since
    where user_id = p_user and created_at >= since.t
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'income_tax', 'rent_tax', 'vat', 'power_bill', 'waste_bill', 'food', 'commute',
                   'health_care', 'gym', 'school_fees', 'procedure', 'hustle_start', 'property_buy', 'start_grant',
                   'property_sale', 'sale_tax', 'loan', 'loan_repay',
                   'item_buy', 'item_sale', 'car_buy', 'car_sale', 'craft_cost', 'market_fee', 'item_tax', 'fine')
    group by kind
    union all
    select 'property_buy', sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
    union all
    select 'property_tax', -sum(tax) from public.property_sales, since where buyer_id = p_user and created_at >= since.t
  )
  select coalesce(jsonb_object_agg(kind, round(total, 2)), '{}'::jsonb)
  from (select kind, sum(amount) as total from rows where amount is not null group by kind) s
$$;

-- ============================================================ rent follows value
/**
 * What a unit earns a day while let (mint), from its value: homes 6% a game year, business units
 * 9%, land nothing (a game year is a real month, so a real day is a thirtieth). The same rule as
 * src/lib/world/property-api.ts rentPerDay, used when a unit is bought.
 */
create or replace function public.unit_rent_day(p_price numeric, p_use text) returns numeric
language sql immutable set search_path = public as $$
  select round(greatest(coalesce(p_price, 0), 0) * case p_use when 'home' then 0.06 when 'land' then 0 else 0.09 end / 30, 2)
$$;

-- Whenever a unit's price changes (and its rent wasn't set at the same time), its rent follows.
create or replace function public.property_rent_follows_price() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.price is distinct from old.price and new.rent_day is not distinct from old.rent_day then
    new.rent_day := public.unit_rent_day(new.price, new.use);
  end if;
  return new;
end $$;
drop trigger if exists property_units_rent_follows_price on public.property_units;
create trigger property_units_rent_follows_price before update of price on public.property_units
  for each row execute function public.property_rent_follows_price();

/**
 * Save a home plan, paying for what's new (as part 64). p_cost: what it costs (mint), p_value: what
 * it adds to the home's value, p_paid: everything paid for so far (after this). The home's rent (if
 * it's ever let) follows its new value. Returns your wallet.
 */
create or replace function public.home_plan_save(p_user uuid, p_unit text, p_plan jsonb, p_paid jsonb, p_cost numeric, p_value numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(greatest(0, coalesce(p_cost, 0)), 2);
  v_value numeric := round(greatest(0, coalesce(p_value, 0)), 2);
  v_unit public.property_units;
  v_price numeric;
begin
  if v_cost > public.setting('home_upgrade_max') then raise exception 'too_dear'; end if;
  perform 1 from public.lives where user_id = p_user and home_unit = p_unit for update;
  if not found then raise exception 'not_home'; end if;
  select * into v_unit from public.property_units where unit_id = p_unit for update;
  if v_cost > 0 then
    -- Only your own home can be built onto (a home you rent is the landlord's).
    if not found or v_unit.owner_id <> p_user then raise exception 'not_owner'; end if;
    if public.life_can_spend(p_user, array['savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['savings'], v_cost);
    perform public.log_coins(p_user, null, 'home_upgrade', -v_cost, false, 'Building onto your home');
    perform public.burn(null, v_cost, 'Home improvements');
    v_price := least(public.setting('property_price_max'), v_unit.price + v_value);
    update public.property_units
      set price = v_price, rent_day = public.unit_rent_day(v_price, v_unit.use)
      where unit_id = p_unit;
  end if;
  insert into public.home_plans (user_id, unit, plan, paid, updated_at)
    values (p_user, p_unit, p_plan, coalesce(p_paid, '{}'::jsonb), now())
  on conflict (user_id) do update set unit = excluded.unit, plan = excluded.plan, paid = excluded.paid, updated_at = now();
  return jsonb_build_object(
    'coins', (select coins from public.profiles where id = p_user),
    'value', (select price from public.property_units where unit_id = p_unit)
  );
end $$;

-- Homes already built onto before this part: their rent catches up with their value, once.
update public.property_units u set rent_day = public.unit_rent_day(u.price, u.use)
where u.unit_id in (select unit from public.home_plans)
  and u.rent_day is distinct from public.unit_rent_day(u.price, u.use);

-- ============================================================ selling to the city
/**
 * Sell straight to the city's shops (p_amount: what the game offers, a share of its worth). As part
 * 50, and a backstop: a shop never pays more than twice what the thing was worth when it was made.
 */
create or replace function public.item_sell_city(p_user uuid, p_item bigint, p_amount numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare i public.items;
begin
  select * into i from public.items where id = p_item for update;
  if not found or i.owner <> p_user then raise exception 'not_yours'; end if;
  if coalesce(p_amount, 0) < 0 or p_amount > public.setting('item_price_max') or p_amount > i.base_value * 2 then raise exception 'bad_price'; end if;
  delete from public.items where id = p_item;
  if p_amount > 0 then
    perform public.log_coins(p_user, null, case when i.category = 'car' then 'car_sale' else 'item_sale' end, round(p_amount, 2), false, 'Sold to a shop: ' || left(i.name, 40));
    perform public.life_income(p_user, round(p_amount, 2));
  end if;
  return round(p_amount, 2);
end $$;

-- ============================================================ who may call these
do $$
declare f text;
begin
  foreach f in array array[
    'public.accrue_passive(uuid)', 'public.gift_daily_limit(public.profiles)', 'public.gift_check(public.profiles, numeric)',
    'public.give_coins(uuid, uuid, numeric, text)',
    'public.life_tick(uuid, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, numeric)',
    'public.life_money_days(uuid, int)', 'public.life_money(uuid, int)',
    'public.home_plan_save(uuid, text, jsonb, jsonb, numeric, numeric)', 'public.item_sell_city(uuid, bigint, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 066_home_visits.sql
-- Newtown, part 66: visiting each other's homes (docs/HOME_PLANNER.md, "Visiting"). Going into
-- someone else's home, you knock (or ring): they get told and let you in, or not. Friends walk
-- straight in, and so does everyone while the home is having a party. Visitors can sign the
-- home's guest book (or leave a note at the door when nobody answers).
--
-- Safe to run more than once. Run after part 64.

-- Knocks at a door: who, at whose home, and the answer.
create table if not exists public.home_knocks (
  id bigserial primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  unit text not null check (char_length(unit) <= 120),
  visitor_id uuid not null references public.profiles (id) on delete cascade,
  visitor_name text not null check (char_length(visitor_name) <= 40),
  status text not null default 'waiting' check (status in ('waiting', 'in', 'not_now')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists home_knocks_owner_idx on public.home_knocks (owner_id, created_at desc);
create index if not exists home_knocks_visitor_idx on public.home_knocks (visitor_id, created_at desc);

-- The guest book: a line from each visit (or a note left at the door).
create table if not exists public.home_guestbook (
  id bigserial primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null check (char_length(author_name) <= 40),
  body text not null check (char_length(body) between 1 and 200),
  at_door boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists home_guestbook_owner_idx on public.home_guestbook (owner_id, created_at desc);

-- A party: the home is open to everyone until `until`.
create table if not exists public.home_parties (
  owner_id uuid primary key references public.profiles (id) on delete cascade,
  unit text not null check (char_length(unit) <= 120),
  title text check (title is null or char_length(title) <= 60),
  until timestamptz not null
);

do $$
begin
  revoke all on table public.home_knocks, public.home_guestbook, public.home_parties from public, anon, authenticated;
  grant all on table public.home_knocks, public.home_guestbook, public.home_parties to service_role;
  revoke all on sequence public.home_knocks_id_seq, public.home_guestbook_id_seq from public, anon, authenticated;
  grant all on sequence public.home_knocks_id_seq, public.home_guestbook_id_seq to service_role;
end $$;

-- ======================================================== 067_club_entry.sql
-- Newtown, part 67: club entry fees on the real map. Some clubs charge at the door; paid once, it
-- lets you in (and back in) for 24 hours. From your Fun money, then your wallet.
--
-- Safe to run more than once. Run after part 66.

create table if not exists public.club_entries (
  user_id uuid not null references public.profiles (id) on delete cascade,
  place text not null check (char_length(place) <= 40),
  fee numeric not null default 0,
  paid_at timestamptz not null default now(),
  primary key (user_id, place)
);

/**
 * Into a club: free if you paid in the last 24 hours, otherwise pays the fee (mint, at most 1,000).
 * Returns what was paid now and until when you're in.
 */
create or replace function public.life_club_entry(p_user uuid, p_place text, p_fee numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric := round(least(1000, greatest(0, coalesce(p_fee, 0))), 2);
  v_paid numeric := 0;
  v_at timestamptz;
  p public.profiles;
begin
  if p_place is null or p_place !~ '^b:[0-9]{1,7}$' then raise exception 'bad_place'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select paid_at into v_at from public.club_entries where user_id = p_user and place = p_place for update;
  if v_at is not null and v_at > now() - interval '24 hours' then
    return jsonb_build_object('paid', 0, 'until', v_at + interval '24 hours');
  end if;
  if v_fee > 0 then
    perform 1 from public.lives where user_id = p_user for update;
    if not found then raise exception 'no_life'; end if;
    if public.life_can_spend(p_user, array['fun']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    v_paid := public.life_spend(p_user, array['fun'], v_fee);
    perform public.log_coins(p_user, null, 'club_entry', -v_paid, false, 'Club entry: ' || p_place);
    perform public.burn(null, v_paid, 'Club entry');
  end if;
  insert into public.club_entries (user_id, place, fee, paid_at) values (p_user, p_place, v_paid, now())
  on conflict (user_id, place) do update set fee = excluded.fee, paid_at = excluded.paid_at;
  return jsonb_build_object('paid', v_paid, 'until', now() + interval '24 hours');
end $$;

do $$
begin
  revoke all on table public.club_entries from public, anon, authenticated;
  grant all on table public.club_entries to service_role;
  revoke all on function public.life_club_entry(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_club_entry(uuid, text, numeric) to service_role;
end $$;

-- ======================================================== 069_pack_perks.sql
-- Newtown, part 69: starter packs bring more than mint (docs/PACKS.md). Each paid pack's gifts
-- (a phone, a car...) are given once, marked here. Packs bought before this was run get their
-- gifts the next time the player opens the game.
--
-- Safe to run more than once.

alter table public.starter_payments add column if not exists perks_at timestamptz;

-- ======================================================== 070_challenges.sql
-- Newtown, part 70: challenges on the map (docs/CHALLENGES.md). Tap Fight, pick a game (Whot!,
-- Ludo...) and a stake: everyone nearby is told and your light shines on the map. They have a
-- minute to join (each paying the stake into the pool), then the game is played right there on
-- the map. The winner takes the pool. Your first challenge is free; another one before the
-- cooldown ends costs a fee. Challenging and winning add to your reputation.
--
-- Safe to run more than once. Run after part 69.

create table if not exists public.challenges (
  id bigserial primary key,
  host_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  game text not null check (game ~ '^[a-z_]{2,20}$'),
  stake numeric(14,2) not null default 0 check (stake >= 0),
  fee numeric(14,2) not null default 0,
  x int not null,
  z int not null,
  seats int not null default 4 check (seats between 2 and 6),
  seed bigint not null,
  status text not null default 'open' check (status in ('open', 'playing', 'done', 'cancelled')),
  pool numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  starts_at timestamptz not null,
  started_at timestamptz,
  winner_id uuid references public.profiles (id) on delete set null,
  prize numeric(14,2),
  finished_at timestamptz
);
create index if not exists challenges_open_idx on public.challenges (region, status, created_at desc);
create index if not exists challenges_host_idx on public.challenges (host_id, created_at desc);

create table if not exists public.challenge_players (
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  paid numeric(14,2) not null default 0,
  joined_at timestamptz not null default now(),
  -- Who this player says won (the pool is paid when the players agree, see challenge_report).
  says uuid references public.profiles (id) on delete set null,
  said_at timestamptz,
  primary key (challenge_id, user_id)
);
-- Says it was a draw, and left the game (added after the first version).
alter table public.challenge_players add column if not exists says_draw boolean not null default false;
alter table public.challenge_players add column if not exists left_at timestamptz;
create index if not exists challenge_players_user_idx on public.challenge_players (user_id, joined_at desc);

/** In a challenge that isn't over (open or playing)? Its id, or null. */
create or replace function public.challenge_busy(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select c.id from public.challenge_players cp join public.challenges c on c.id = cp.challenge_id
  where cp.user_id = p_user and cp.left_at is null and (c.status = 'open' or (c.status = 'playing' and c.started_at > now() - interval '45 minutes'))
  order by c.id desc limit 1
$$;

/**
 * Open a challenge. p_fee: what another challenge costs before the cooldown (p_cooldown seconds)
 * is over; the first one (or one after the cooldown) is free. The host pays the stake into the
 * pool like everyone else. Returns the challenge, and the fee paid.
 */
create or replace function public.challenge_open(p_user uuid, p_region text, p_game text, p_stake numeric, p_x int, p_z int, p_seats int, p_fee numeric, p_cooldown int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_last timestamptz;
  v_fee numeric := 0;
  v_stake numeric := round(least(10000, greatest(0, coalesce(p_stake, 0))), 2);
  v_id bigint;
  v_seed bigint := floor(random() * 2000000000)::bigint;
  v_starts timestamptz := now() + interval '60 seconds';
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if public.challenge_busy(p_user) is not null then raise exception 'busy'; end if;
  select max(created_at) into v_last from public.challenges where host_id = p_user and status <> 'cancelled';
  if v_last is not null and v_last > now() - make_interval(secs => greatest(60, least(1800, coalesce(p_cooldown, 480)))) then
    v_fee := round(least(2000, greatest(0, coalesce(p_fee, 0))), 2);
  end if;
  if public.life_can_spend(p_user, array['fun']) < v_fee + v_stake then raise exception 'not_enough:%', trim_scale(v_fee + v_stake); end if;
  if v_fee > 0 then
    perform public.life_spend(p_user, array['fun'], v_fee);
    perform public.log_coins(p_user, null, 'challenge_fee', -v_fee, false, 'Challenge fee');
    perform public.burn(null, v_fee, 'Challenge fees');
  end if;
  if v_stake > 0 then
    perform public.life_spend(p_user, array['fun'], v_stake);
    perform public.log_coins(p_user, null, 'challenge_stake', -v_stake, false, 'Challenge stake');
  end if;
  insert into public.challenges (host_id, region, game, stake, fee, x, z, seats, seed, pool, starts_at)
    values (p_user, p_region, p_game, v_stake, v_fee, p_x, p_z, greatest(2, least(6, coalesce(p_seats, 4))), v_seed, v_stake, v_starts)
    returning id into v_id;
  insert into public.challenge_players (challenge_id, user_id, paid) values (v_id, p_user, v_stake);
  return jsonb_build_object('id', v_id, 'fee', v_fee, 'seed', v_seed, 'starts_at', v_starts);
end $$;

/** Join a challenge before it starts: pay the stake into the pool. */
create or replace function public.challenge_join(p_user uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  c public.challenges;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  select * into c from public.challenges where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_user) then
    return jsonb_build_object('id', c.id, 'paid', 0, 'already', true);
  end if;
  if c.status <> 'open' or now() >= c.starts_at then raise exception 'started'; end if;
  if (select count(*) from public.challenge_players where challenge_id = p_id) >= c.seats then raise exception 'full'; end if;
  if public.challenge_busy(p_user) is not null then raise exception 'busy'; end if;
  if c.stake > 0 then
    if public.life_can_spend(p_user, array['fun']) < c.stake then raise exception 'not_enough:%', trim_scale(c.stake); end if;
    perform public.life_spend(p_user, array['fun'], c.stake);
    perform public.log_coins(p_user, null, 'challenge_stake', -c.stake, false, 'Challenge stake');
  end if;
  insert into public.challenge_players (challenge_id, user_id, paid) values (p_id, p_user, c.stake);
  update public.challenges set pool = pool + c.stake where id = p_id;
  return jsonb_build_object('id', c.id, 'paid', c.stake);
end $$;

/** Give everyone in a challenge their stake back and call it off. */
create or replace function public.challenge_refund(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id, paid from public.challenge_players where challenge_id = p_id and paid > 0 loop
    update public.profiles set coins = coins + r.paid where id = r.user_id;
    perform public.log_coins(r.user_id, null, 'challenge_refund', r.paid, false, 'Challenge called off');
  end loop;
  update public.challenges set status = 'cancelled', finished_at = now() where id = p_id;
end $$;

/**
 * The minute is up: start (two or more players), or call it off and give the stakes back. Safe to
 * call by anyone, any number of times. Returns the status.
 */
create or replace function public.challenge_begin(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  r record;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then return 'gone'; end if;
  if c.status <> 'open' then return c.status; end if;
  if now() < c.starts_at then return 'open'; end if;
  if (select count(*) from public.challenge_players where challenge_id = p_id) < 2 then
    perform public.challenge_refund(p_id);
    for r in select user_id from public.challenge_players where challenge_id = p_id loop
      perform public.notify(r.user_id, null, 'challenge', 'Your challenge didn''t start: not enough players joined. Your stake is back.');
    end loop;
    return 'cancelled';
  end if;
  update public.challenges set status = 'playing', started_at = now() where id = p_id;
  for r in select user_id from public.challenge_players where challenge_id = p_id loop
    perform public.notify(r.user_id, null, 'challenge', 'Game on! Your challenge has started. Open the game to play.');
  end loop;
  return 'playing';
end $$;

/**
 * A player says how it ended: who won, or a draw (p_draw). The pool is paid (less a tenth) when the
 * players agree: more than half of them say the same, or someone says another player won (a loser
 * owning up, or giving up), or two minutes go by with only one answer said and nobody saying
 * otherwise (the phones ask again until it's settled). A draw gives everyone their stake back.
 * p_winner null and p_draw false: just checking. Returns the winner once paid ({draw: true} for a draw).
 */
drop function if exists public.challenge_report(uuid, bigint, uuid);
create or replace function public.challenge_report(p_user uuid, p_id bigint, p_winner uuid, p_draw boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  v_n int;
  v_w uuid;
  v_votes int;
  v_draws int;
  v_names int;
  v_first timestamptz;
  v_owned boolean;
  v_prize numeric;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if c.status = 'done' then return jsonb_build_object('winner', c.winner_id, 'prize', c.prize); end if;
  if c.status = 'cancelled' then return jsonb_build_object('winner', null, 'draw', true); end if;
  if c.status <> 'playing' then raise exception 'not_playing'; end if;
  if not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_user) then raise exception 'not_in'; end if;
  if p_winner is not null and not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_winner) then raise exception 'bad_winner'; end if;
  if coalesce(p_draw, false) then
    update public.challenge_players set says = null, says_draw = true, said_at = coalesce(said_at, now()) where challenge_id = p_id and user_id = p_user;
  elsif p_winner is not null then
    update public.challenge_players set says = p_winner, says_draw = false, said_at = coalesce(said_at, now()) where challenge_id = p_id and user_id = p_user;
  end if;
  select count(*) into v_n from public.challenge_players where challenge_id = p_id;
  select count(*) into v_draws from public.challenge_players where challenge_id = p_id and says_draw;
  select says, count(*) into v_w, v_votes from public.challenge_players where challenge_id = p_id and says is not null group by says order by count(*) desc limit 1;
  select count(distinct coalesce(says::text, 'draw')), min(said_at) into v_names, v_first
    from public.challenge_players where challenge_id = p_id and (says is not null or says_draw);
  -- A draw: everyone agrees enough (or it's the only answer for two minutes). Stakes back.
  if v_draws > 0 and (v_draws * 2 > v_n or (v_names = 1 and v_first < now() - interval '2 minutes')) then
    perform public.challenge_refund(p_id);
    return jsonb_build_object('winner', null, 'draw', true);
  end if;
  if v_w is null then return jsonb_build_object('winner', null, 'waiting', true); end if;
  v_owned := exists (select 1 from public.challenge_players where challenge_id = p_id and says = v_w and user_id <> v_w);
  if not (v_votes * 2 > v_n or v_owned or (v_names = 1 and v_first < now() - interval '2 minutes')) then
    return jsonb_build_object('winner', null, 'waiting', true);
  end if;
  v_prize := round(c.pool * 0.9, 2);
  if v_prize > 0 then
    update public.profiles set coins = coins + v_prize where id = v_w;
    perform public.log_coins(v_w, null, 'challenge_win', v_prize, false, 'Won a challenge');
    perform public.burn(null, c.pool - v_prize, 'Challenge pools');
  end if;
  update public.challenges set status = 'done', winner_id = v_w, prize = v_prize, finished_at = now() where id = p_id;
  return jsonb_build_object('winner', v_w, 'prize', v_prize);
end $$;

/** Tidy up: open ones whose minute is long gone (started or called off), and games nobody finished in 45 minutes (stakes back). */
create or replace function public.challenge_sweep(p_region text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.challenges where region = p_region and status = 'open' and starts_at < now() - interval '20 seconds' limit 20 loop
    perform public.challenge_begin(r.id);
  end loop;
  -- Finished games whose players all closed the game before it was settled: settle them now.
  for r in select distinct c.id, cp.user_id from public.challenges c join public.challenge_players cp on cp.challenge_id = c.id
           where c.region = p_region and c.status = 'playing' and (cp.says is not null or cp.says_draw) and cp.said_at < now() - interval '2 minutes' limit 20 loop
    perform public.challenge_report(r.user_id, r.id, null, false);
  end loop;
  for r in select id from public.challenges where region = p_region and status = 'playing' and started_at < now() - interval '45 minutes' limit 20 loop
    perform public.challenge_refund(r.id);
  end loop;
end $$;

/**
 * Leave a challenge. Before it starts: your stake back (the host leaving calls it off, and everyone
 * gets theirs back). While it's played: you give up (your stake stays in the pool); if that leaves
 * one player, they win. Returns what happened: 'left', 'cancelled', 'won_by_other', or the status.
 */
create or replace function public.challenge_leave(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  me public.challenge_players;
  v_left uuid;
  r record;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then return 'gone'; end if;
  select * into me from public.challenge_players where challenge_id = p_id and user_id = p_user for update;
  if not found then return 'not_in'; end if;
  if c.status = 'open' then
    if c.host_id = p_user then
      perform public.challenge_refund(p_id);
      for r in select user_id from public.challenge_players where challenge_id = p_id and user_id <> p_user loop
        perform public.notify(r.user_id, null, 'challenge', 'The host called off the challenge. Your stake is back.');
      end loop;
      return 'cancelled';
    end if;
    if me.paid > 0 then
      update public.profiles set coins = coins + me.paid where id = p_user;
      perform public.log_coins(p_user, null, 'challenge_refund', me.paid, false, 'Left a challenge');
      update public.challenges set pool = greatest(0, pool - me.paid) where id = p_id;
    end if;
    delete from public.challenge_players where challenge_id = p_id and user_id = p_user;
    return 'left';
  end if;
  if c.status <> 'playing' then return c.status; end if;
  update public.challenge_players set left_at = coalesce(left_at, now()) where challenge_id = p_id and user_id = p_user;
  -- Only one player still in: they win (you owning up that they did).
  if (select count(*) from public.challenge_players where challenge_id = p_id and left_at is null) = 1 then
    select user_id into v_left from public.challenge_players where challenge_id = p_id and left_at is null;
    perform public.challenge_report(p_user, p_id, v_left, false);
    return 'won_by_other';
  end if;
  return 'left';
end $$;

/** For reputation: challenges you hosted that were played, and challenges you won. */
create or replace function public.challenge_rep(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hosted', (select count(*) from public.challenges where host_id = p_user and status = 'done'),
    'won', (select count(*) from public.challenges where winner_id = p_user and status = 'done'))
$$;

do $$
begin
  revoke all on table public.challenges, public.challenge_players from public, anon, authenticated;
  grant all on table public.challenges, public.challenge_players to service_role;
  revoke all on sequence public.challenges_id_seq from public, anon, authenticated;
  grant all on sequence public.challenges_id_seq to service_role;
  revoke all on function public.challenge_busy(uuid), public.challenge_open(uuid, text, text, numeric, int, int, int, numeric, int),
    public.challenge_join(uuid, bigint), public.challenge_refund(bigint), public.challenge_begin(bigint),
    public.challenge_report(uuid, bigint, uuid, boolean), public.challenge_rep(uuid), public.challenge_sweep(text), public.challenge_leave(uuid, bigint) from public, anon, authenticated;
  grant execute on function public.challenge_busy(uuid), public.challenge_open(uuid, text, text, numeric, int, int, int, numeric, int),
    public.challenge_join(uuid, bigint), public.challenge_refund(bigint), public.challenge_begin(bigint),
    public.challenge_report(uuid, bigint, uuid, boolean), public.challenge_rep(uuid), public.challenge_sweep(text), public.challenge_leave(uuid, bigint) to service_role;
end $$;

-- ======================================================== 071_chat_read.sql
-- Newtown, part 71: private messages remember when they were read (docs/PEOPLE.md). The sender
-- sees "Opened" (like Snapchat), and a message you've read stops counting on every device and on
-- the phone's badge. Before this is run, the game remembers what you read on each phone instead.
--
-- Safe to run more than once.

alter table public.chat_messages add column if not exists read_at timestamptz;
create index if not exists chat_unread_idx on public.chat_messages (recipient_id, sender_id) where recipient_id is not null and read_at is null;

-- ======================================================== 072_first_steps.sql
-- Newtown, part 72: the first five minutes (docs/FIRST_STEPS.md). Three things to do on day one,
-- each with a small reward, paid once per player: say hi to someone (a private message), play a
-- challenge (start or join one), and go out (into any place that isn't your home). The game checks each really happened before
-- paying, and only new players (a life started in the last 3 days) are paid. Before this is run
-- the guide still shows; the rewards wait until it is.
--
-- Safe to run more than once.

create table if not exists public.first_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  step text not null,
  reward numeric(14,2) not null default 0,
  done_at timestamptz not null default now(),
  primary key (user_id, step)
);
alter table public.first_steps enable row level security;
alter table public.first_steps drop constraint if exists first_steps_step_check;
alter table public.first_steps add constraint first_steps_step_check check (step in ('hi', 'challenge', 'home', 'out'));

/**
 * Which first steps are done (each checked against what really happened), paying the reward for any
 * newly done. p_reward is mint per step (the server works it out from the city's prices).
 * Returns { hi, challenge, out: done?, paid: [steps paid just now], reward }.
 */
create or replace function public.first_steps_check(p_user uuid, p_reward numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hi boolean;
  v_ch boolean;
  v_out boolean;
  v_paid text[] := '{}';
  v_step text;
  v_reward numeric := round(least(greatest(coalesce(p_reward, 0), 0), 20), 2);
  v_new boolean;
begin
  -- Only new lives (started in the last 3 days) are paid: players who were here before don't get
  -- paid for what they did long ago.
  v_new := exists (select 1 from public.lives where user_id = p_user and started_at > now() - interval '3 days');
  if not v_new then v_reward := 0; end if;
  v_hi := exists (select 1 from public.chat_messages where sender_id = p_user and recipient_id is not null);
  v_ch := to_regclass('public.challenge_players') is not null
    and exists (select 1 from public.challenge_players where user_id = p_user);
  v_out := exists (select 1 from public.lives where user_id = p_user and at_place is not null and at_place <> split_part(coalesce(home_unit, ''), '/', 1));
  foreach v_step in array array['hi', 'challenge', 'out'] loop
    if (v_step = 'hi' and v_hi) or (v_step = 'challenge' and v_ch) or (v_step = 'out' and v_out) then
      insert into public.first_steps (user_id, step, reward) values (p_user, v_step, v_reward) on conflict do nothing;
      if found then
        v_paid := v_paid || v_step;
        if v_reward > 0 then
          update public.profiles set coins = coins + v_reward where id = p_user;
          perform public.log_coins(p_user, null, 'first_step', v_reward, false, 'First steps reward');
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('hi', v_hi, 'challenge', v_ch, 'out', v_out, 'paid', to_jsonb(v_paid), 'reward', v_reward);
end $$;
revoke all on function public.first_steps_check(uuid, numeric) from public, anon, authenticated;

-- ======================================================== 073_daily_money.sql
-- Newtown, part 73: money that comes to you (docs/MONEY.md). Three things:
--   1. Active time: the game counts the minutes you're actually doing something (a ping a minute
--      at most, while the game is open and you've touched it lately), per day, in Lagos time.
--   2. The daily gift, once a day: the server works out how much (yesterday's active time, your
--      streak of days, how long you've played, your reputation) and this pays it, capped.
--   3. A prize from Newtown for every challenge won (on top of the pot), up to 5 a day.
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('daily_gift_max',        40,   'Most mint one daily gift can be (the server works it out, at most ₦50,000; this is the ceiling)'),
  ('challenge_bonus',       0,    'Mint Newtown adds for each challenge won (on top of the pot): none since part 81'),
  ('challenge_bonus_daily', 5,    'How many challenge wins a day get the Newtown prize')
-- Running this again sets these back to the numbers here.
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- The day in Lagos (days start at midnight there).
create or replace function public.lagos_day(p_at timestamptz default now()) returns date
language sql stable as $$ select (p_at at time zone 'Africa/Lagos')::date $$;

-- ============================================================ active time
create table if not exists public.activity_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  minutes int not null default 0,
  last_ping timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.activity_days enable row level security;

/** A minute of you being active (counted at most once every 50 seconds, 10 hours a day at most). Returns today's minutes. */
create or replace function public.active_ping(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.lagos_day();
  v_min int;
begin
  insert into public.activity_days (user_id, day, minutes, last_ping) values (p_user, v_day, 1, now())
  on conflict (user_id, day) do update
    set minutes = least(public.activity_days.minutes + 1, 600), last_ping = now()
    where public.activity_days.last_ping < now() - interval '50 seconds';
  select minutes into v_min from public.activity_days where user_id = p_user and day = v_day;
  return coalesce(v_min, 0);
end $$;

-- ============================================================ the daily gift
create table if not exists public.daily_gifts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  amount numeric(14,2) not null,
  streak int not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_gifts enable row level security;

/** What the gift would be made of today: claimed already?, the streak it would be, yesterday's active minutes, days playing. */
create or replace function public.daily_gift_status(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'claimed', exists (select 1 from public.daily_gifts where user_id = p_user and day = public.lagos_day()),
    'streak', coalesce((select streak from public.daily_gifts where user_id = p_user and day = public.lagos_day() - 1), 0) + 1,
    'today_streak', (select streak from public.daily_gifts where user_id = p_user and day = public.lagos_day()),
    'today_amount', (select amount from public.daily_gifts where user_id = p_user and day = public.lagos_day()),
    'active_yesterday', coalesce((select minutes from public.activity_days where user_id = p_user and day = public.lagos_day() - 1), 0),
    'active_today', coalesce((select minutes from public.activity_days where user_id = p_user and day = public.lagos_day()), 0),
    'days_playing', coalesce((select greatest(0, public.lagos_day() - public.lagos_day(started_at)) from public.lives where user_id = p_user), 0)
  )
$$;

/** Take today's gift (p_amount in mint, worked out by the server; capped). Once a day. */
create or replace function public.daily_gift_claim(p_user uuid, p_amount numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.lagos_day();
  v_streak int;
  v_amount numeric := round(least(greatest(coalesce(p_amount, 0), 0), coalesce(public.setting('daily_gift_max'), 40)), 2);
begin
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  v_streak := coalesce((select streak from public.daily_gifts where user_id = p_user and day = v_day - 1), 0) + 1;
  insert into public.daily_gifts (user_id, day, amount, streak) values (p_user, v_day, v_amount, v_streak)
  on conflict (user_id, day) do nothing;
  if not found then
    return jsonb_build_object('already', true);
  end if;
  update public.profiles set coins = coins + v_amount where id = p_user;
  perform public.log_coins(p_user, null, 'daily_gift', v_amount, false, 'Daily gift');
  if coalesce(p_note, '') <> '' then perform public.notify(p_user, null, 'daily_gift', left(p_note, 200)); end if;
  return jsonb_build_object('amount', v_amount, 'streak', v_streak);
end $$;

-- ============================================================ Newtown's prize for a challenge won
create or replace function public.challenge_bonus_pay() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bonus numeric := coalesce(public.setting('challenge_bonus'), 0);
  v_today int;
begin
  if new.status <> 'done' or old.status = 'done' or new.winner_id is null or v_bonus <= 0 then return new; end if;
  -- Only a real game: at least two people put a stake in.
  if (select count(*) from public.challenge_players where challenge_id = new.id and paid > 0) < 2 then return new; end if;
  select count(*) into v_today from public.ledger
    where user_id = new.winner_id and kind = 'challenge_bonus' and created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos');
  if v_today >= coalesce(public.setting('challenge_bonus_daily'), 5) then return new; end if;
  update public.profiles set coins = coins + v_bonus where id = new.winner_id;
  perform public.log_coins(new.winner_id, null, 'challenge_bonus', v_bonus, false, 'Newtown prize for a challenge won');
  perform public.notify(new.winner_id, null, 'challenge', 'Newtown added a prize for your win. Well played!');
  return new;
end $$;

do $$
begin
  if to_regclass('public.challenges') is not null then
    drop trigger if exists challenge_bonus on public.challenges;
    create trigger challenge_bonus after update of status on public.challenges
      for each row execute function public.challenge_bonus_pay();
  end if;
end $$;

revoke all on function public.active_ping(uuid), public.daily_gift_status(uuid), public.daily_gift_claim(uuid, numeric, text), public.challenge_bonus_pay() from public, anon, authenticated;

-- The daily new-mint report counts the new kinds too: the daily gift, Newtown's challenge prize and
-- the first steps' rewards (part 72).
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                   'daily_gift', 'challenge_bonus', 'first_step')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;
revoke all on public.coin_supply_daily from public, anon, authenticated;
grant select on public.coin_supply_daily to service_role;

-- ======================================================== 074_simple_life.sql
-- Newtown, part 74: the simple life (docs/MONEY.md, docs/STARTER_ROOMS.md). Real Lagos prices and
-- modest money: a new life starts with ₦250,000 and a free room to live in (one free move, given
-- back when you buy a home of your own or stop playing for 60 days). Jobs, side hustles, bills,
-- food and the body-and-mind meters are switched off: money comes from the daily gift, games,
-- events and top-ups.
--
-- Safe to run more than once.

-- ============================================================ starting money
update public.game_settings set value = 166.67, note = 'Mint to start a life on the real map with (once): ₦250,000 in Lagos'
  where key = 'start_grant';

-- ============================================================ free starter rooms
-- A free room is an ordinary home unit marked `starter`: it can't be bought by anyone else (it's
-- taken), and it can't be sold, let, listed or borrowed against. Buying a home of your own gives it
-- back (and makes the new one your home). Not playing for 60 days gives it back too; you get a
-- fresh one the moment you come back.
alter table public.property_units add column if not exists starter boolean not null default false;
alter table public.lives add column if not exists starter_moves int not null default 0;
create index if not exists property_units_starter_idx on public.property_units (owner_id) where starter;

/** A free room can't change hands, be let, or carry a loan. */
create or replace function public.starter_guard() returns trigger
language plpgsql as $$
begin
  if old.starter and (new.owner_id is distinct from old.owner_id or new.let or new.loan_id is not null) then
    raise exception 'starter_room';
  end if;
  return new;
end $$;
drop trigger if exists starter_guard on public.property_units;
create trigger starter_guard before update on public.property_units for each row execute function public.starter_guard();

/** Nor can it be put up for sale. */
create or replace function public.starter_no_listing() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.property_units where unit_id = new.unit_id and starter) then raise exception 'starter_room'; end if;
  return new;
end $$;
drop trigger if exists starter_no_listing on public.property_listings;
create trigger starter_no_listing before insert on public.property_listings for each row execute function public.starter_no_listing();

/** A home of your own (bought from the city or a player): your free room goes back, and the new one is home. */
create or replace function public.starter_give_back() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_room text;
begin
  if new.starter or new.use <> 'home' then return new; end if;
  select unit_id into v_room from public.property_units where owner_id = new.owner_id and starter limit 1;
  if v_room is null then return new; end if;
  update public.lives set home_unit = new.unit_id where user_id = new.owner_id and (home_unit = v_room or home_unit is null);
  delete from public.property_units where unit_id = v_room;
  return new;
end $$;
drop trigger if exists starter_give_back on public.property_units;
create trigger starter_give_back after insert or update of owner_id on public.property_units
  for each row execute function public.starter_give_back();

/**
 * Give a player a free room (p_unit, chosen by the server from the city's rooming houses), or move
 * them to another one (once). p_snapshot: the building as the map has it (saved on first use).
 * Returns { unit, moved }.
 */
create or replace function public.starter_room_give(p_user uuid, p_region text, p_unit text, p_snapshot jsonb, p_label text, p_area numeric, p_move boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_building text := split_part(p_unit, '/', 1);
  v_old text;
begin
  if p_unit is null or p_unit !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$' or split_part(v_building, ':', 1) <> p_region then raise exception 'bad_unit'; end if;
  select * into l from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  select unit_id into v_old from public.property_units where owner_id = p_user and starter limit 1;
  if p_move then
    if v_old is null then raise exception 'no_room'; end if;
    if l.starter_moves >= 1 then raise exception 'moved'; end if;
  else
    if v_old is not null then return jsonb_build_object('unit', v_old, 'moved', false, 'already', true); end if;
    if l.home_unit is not null and exists (select 1 from public.property_units where unit_id = l.home_unit and owner_id = p_user) then raise exception 'has_home'; end if;
  end if;
  if exists (select 1 from public.property_units where unit_id = p_unit) then raise exception 'taken'; end if;
  insert into public.property_buildings (building_id, region, snapshot) values (v_building, p_region, p_snapshot)
  on conflict (building_id) do nothing;
  if v_old is not null then delete from public.property_units where unit_id = v_old; end if;
  insert into public.property_units (unit_id, building_id, owner_id, label, use, area, price, rent_day, starter)
  values (p_unit, v_building, p_user, left(coalesce(p_label, 'Room'), 60), 'home', greatest(coalesce(p_area, 12), 1), 0.01, 0, true);
  update public.lives set home_unit = p_unit, at_place = case when v_old is not null and at_place = split_part(v_old, '/', 1) then v_building else at_place end,
    starter_moves = starter_moves + case when p_move then 1 else 0 end
  where user_id = p_user;
  return jsonb_build_object('unit', p_unit, 'moved', p_move);
end $$;

/** Free rooms of players away 60 days or more go back to the city (they get a fresh one when they're back). */
create or replace function public.starter_rooms_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  with gone as (
    delete from public.property_units u
    using public.lives l
    where u.starter and l.user_id = u.owner_id and coalesce(l.seen_at, l.started_at) < now() - interval '60 days'
    returning u.unit_id, u.owner_id
  )
  update public.lives l set home_unit = null, starter_moves = 0
  from gone where l.user_id = gone.owner_id and l.home_unit = gone.unit_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.starter_room_give(uuid, text, text, jsonb, text, numeric, boolean), public.starter_rooms_sweep() from public, anon, authenticated;

-- ============================================================ no free refill
-- The old daily refill (topping wallets up towards ₥100, ₦150,000, every day) is off: the daily
-- gift replaces it, and money that tops itself up has no value.
update public.game_settings set value = 0 where key in ('passive_target', 'passive_per_day', 'passive_per_level');

-- ======================================================== 075_fresh_start.sql
-- Newtown, part 75: the fresh start (docs/MONEY.md, "The fresh start"). Run ONCE, after part 74, on
-- the day the simple life goes live. Running it again does nothing (it remembers it ran).
--
-- Everyone's money goes to ₦250,000 plus a ₦100,000 founder bonus (₦350,000), their savings pots
-- are emptied, they get the Founder badge and a message saying what happened. Homes, places, cars
-- and things they own stay theirs. Players with no home get a free room the next time they open
-- the game.
--
-- Everyone's old money is saved first in public.fresh_start_backup. To undo, run the block at the
-- bottom of this file (it's commented out).

create table if not exists public.fresh_start_backup (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  coins numeric(14,2) not null,
  pots jsonb not null default '{}'::jsonb,
  backed_up_at timestamptz not null default now()
);
alter table public.fresh_start_backup enable row level security;

insert into public.game_settings (key, value, note) values
  ('fresh_start_coins', 233.34, 'Mint everyone has after the fresh start: ₦250,000 plus a ₦100,000 founder bonus (₦350,000)')
on conflict (key) do nothing;

do $$
declare
  v_to numeric := coalesce(public.setting('fresh_start_coins'), 233.34);
  x record;
  v_pots jsonb;
begin
  if exists (select 1 from public.game_settings where key = 'fresh_start_done') then
    raise notice 'The fresh start has run already: nothing changed.';
    return;
  end if;
  for x in select id, coins from public.profiles where not is_bot loop
    v_pots := coalesce((select jsonb_object_agg(pot, balance) from public.life_pots where user_id = x.id), '{}'::jsonb);
    insert into public.fresh_start_backup (user_id, coins, pots) values (x.id, x.coins, v_pots) on conflict (user_id) do nothing;
    update public.life_pots set balance = 0 where user_id = x.id;
    update public.profiles set coins = v_to where id = x.id;
    perform public.log_coins(x.id, null, 'fresh_start', v_to - x.coins, false, 'The fresh start');
    if not exists (select 1 from public.badges where user_id = x.id and badge = 'founder') then
      insert into public.badges (user_id, badge, detail) values (x.id, 'founder', 'Here before the fresh start');
    end if;
    perform public.notify(x.id, null, 'fresh_start',
      'Newtown has a fresh start: real Lagos prices, a daily gift, and a free room for everyone. Your money is now ₦350,000 (₦250,000 plus a ₦100,000 founder bonus), your homes and things are still yours, and you''re a Founder.');
  end loop;
  insert into public.game_settings (key, value, note) values ('fresh_start_done', 1, 'The fresh start (part 75) has run');
end $$;

-- ============================================================ to undo (only if you must)
-- Puts everyone's money and pots back as they were before the fresh start (money earned or spent
-- since is lost), and lets part 75 run again.
--
-- update public.profiles p set coins = b.coins from public.fresh_start_backup b where b.user_id = p.id;
-- update public.life_pots lp set balance = coalesce((b.pots ->> lp.pot)::numeric, 0) from public.fresh_start_backup b where b.user_id = lp.user_id;
-- delete from public.game_settings where key = 'fresh_start_done';

-- ======================================================== 076_topups.sql
-- Newtown, part 76: top-ups (docs/MONEY.md, "Top-ups"). Buy game money any time through Paystack:
-- ₦1,000 of real money is ₦1,000,000 in the game, bigger top-ups carry a bonus, and your first
-- top-up is doubled. The money only arrives once Paystack itself says the payment went through
-- (when the player comes back, or from the webhook, whichever is first), and only once. Game money
-- is never turned back into real money.
--
-- Safe to run more than once.

create table if not exists public.topups (
  reference text primary key check (reference ~ '^tu-[a-f0-9]{20}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  option text not null check (option ~ '^[a-z0-9_]{1,20}$'),
  mint numeric(14,2) not null check (mint > 0),
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  doubled boolean not null default false,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists topups_user_idx on public.topups (user_id, created_at desc);
alter table public.topups enable row level security;

/** A top-up payment started (p_mint: what it buys, worked out by the server). */
create or replace function public.topup_start(p_user uuid, p_reference text, p_region text, p_option text, p_mint numeric, p_kobo bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_user and not is_bot and not frozen) then raise exception 'unknown_player'; end if;
  if coalesce(p_mint, 0) <= 0 or p_mint > 1000000 then raise exception 'bad_amount'; end if;
  insert into public.topups (reference, user_id, region, option, mint, amount_kobo) values (p_reference, p_user, p_region, p_option, p_mint, p_kobo);
end $$;

/**
 * Paystack confirmed a top-up (p_kobo: what was actually paid). Once only: the money arrives, doubled
 * if it's the player's first top-up. Returns { found, new, mint, doubled }.
 */
create or replace function public.topup_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.topups;
  v_first boolean;
  v_add numeric;
begin
  select * into t from public.topups where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if t.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'mint', t.mint * case when t.doubled then 2 else 1 end, 'doubled', t.doubled); end if;
  if coalesce(p_kobo, 0) < t.amount_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  perform 1 from public.profiles where id = t.user_id for update;
  v_first := not exists (select 1 from public.topups where user_id = t.user_id and status = 'paid');
  v_add := t.mint * case when v_first then 2 else 1 end;
  update public.topups set status = 'paid', paid_at = now(), doubled = v_first where reference = p_reference;
  update public.profiles set coins = coins + v_add where id = t.user_id;
  perform public.log_coins(t.user_id, null, 'topup', v_add, false, 'Top-up' || case when v_first then ' (first one, doubled)' else '' end);
  return jsonb_build_object('found', true, 'new', true, 'mint', v_add, 'doubled', v_first);
end $$;

do $$
declare f text;
begin
  revoke all on table public.topups from public, anon, authenticated;
  grant all on table public.topups to service_role;
  foreach f in array array['public.topup_start(uuid, text, text, text, numeric, bigint)', 'public.topup_paid(text, bigint)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 077_renting.sql
-- Newtown, part 77: renting a home (docs/MONEY.md, "Renting"). Instead of buying, rent a home nobody
-- owns from the city, a month (30 days) at a time: 6% of what it's worth a month, the same as
-- landlords in the game earn for letting. It's paid up front and again each month from your wallet;
-- when you can't pay, the lease ends and you're back in a free room. Buying a home of your own ends
-- the lease. Nobody else can buy or rent a home while it's rented.
--
-- Safe to run more than once.

create table if not exists public.home_rentals (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  unit_id text not null unique check (unit_id ~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$'),
  label text not null default 'Home',
  rent numeric(14,2) not null check (rent > 0),
  started_at timestamptz not null default now(),
  paid_until timestamptz not null
);
alter table public.home_rentals enable row level security;

/** Rent a home from the city for a month (p_rent: a month's rent in mint, worked out by the server). */
create or replace function public.rent_home(p_user uuid, p_unit text, p_label text, p_rent numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_rent numeric := round(coalesce(p_rent, 0), 2);
begin
  if p_unit is null or p_unit !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+/[0-9]+$' then raise exception 'bad_unit'; end if;
  if v_rent <= 0 or v_rent > public.setting('property_price_max') then raise exception 'bad_price'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if exists (select 1 from public.property_units where unit_id = p_unit) then raise exception 'taken'; end if;
  if exists (select 1 from public.home_rentals where unit_id = p_unit and user_id <> p_user) then raise exception 'taken'; end if;
  if p.coins < v_rent then raise exception 'not_enough:%', trim_scale(v_rent); end if;
  -- A home already rented elsewhere ends (no refund); your free room goes back.
  delete from public.home_rentals where user_id = p_user;
  delete from public.property_units where owner_id = p_user and starter;
  insert into public.home_rentals (user_id, unit_id, label, rent, paid_until)
  values (p_user, p_unit, left(coalesce(p_label, 'Home'), 60), v_rent, now() + interval '30 days');
  update public.profiles set coins = coins - v_rent where id = p_user;
  perform public.log_coins(p_user, null, 'home_rent', -v_rent, false, 'Rent: ' || p_unit);
  perform public.burn(null, v_rent, 'Rent to the city');
  update public.lives set home_unit = p_unit where user_id = p_user;
  return jsonb_build_object('unit', p_unit, 'paid_until', now() + interval '30 days', 'coins', p.coins - v_rent);
end $$;

/**
 * Bring your lease up to date: each month that's come due is paid from your wallet; when it can't
 * be, the lease ends (you're back in a free room). Returns { renting, ended, paid }.
 */
create or replace function public.rent_settle(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.home_rentals;
  v_coins numeric;
  v_paid int := 0;
begin
  select * into r from public.home_rentals where user_id = p_user for update;
  if not found then return jsonb_build_object('renting', false); end if;
  while r.paid_until <= now() loop
    select coins into v_coins from public.profiles where id = p_user for update;
    if v_coins < r.rent then
      delete from public.home_rentals where user_id = p_user;
      update public.lives set home_unit = null where user_id = p_user and home_unit = r.unit_id;
      perform public.notify(p_user, null, 'rent', 'Your rent was due and your wallet was short, so you moved out. You''re back in a free room.');
      return jsonb_build_object('renting', false, 'ended', true, 'paid', v_paid);
    end if;
    update public.profiles set coins = coins - r.rent where id = p_user;
    perform public.log_coins(p_user, null, 'home_rent', -r.rent, false, 'Rent: ' || r.unit_id);
    perform public.burn(null, r.rent, 'Rent to the city');
    r.paid_until := r.paid_until + interval '30 days';
    v_paid := v_paid + 1;
  end loop;
  update public.home_rentals set paid_until = r.paid_until where user_id = p_user;
  if v_paid > 0 then perform public.notify(p_user, null, 'rent', 'Rent paid for another month.'); end if;
  return jsonb_build_object('renting', true, 'paid', v_paid, 'unit', r.unit_id, 'rent', r.rent, 'paid_until', r.paid_until, 'label', r.label);
end $$;

/** Move out of a rented home (no refund): back to a free room. */
create or replace function public.rent_end(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_unit text;
begin
  delete from public.home_rentals where user_id = p_user returning unit_id into v_unit;
  if v_unit is not null then update public.lives set home_unit = null where user_id = p_user and home_unit = v_unit; end if;
end $$;

/** Nobody can buy a home someone's renting; buying your own home ends your lease. */
create or replace function public.rental_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rented text;
begin
  if exists (select 1 from public.home_rentals where unit_id = new.unit_id and user_id <> new.owner_id) then raise exception 'taken'; end if;
  if tg_op = 'INSERT' and new.use = 'home' and not new.starter then
    delete from public.home_rentals where user_id = new.owner_id returning unit_id into v_rented;
    if v_rented is not null then
      update public.lives set home_unit = new.unit_id where user_id = new.owner_id and (home_unit = v_rented or home_unit is null);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rental_guard on public.property_units;
create trigger rental_guard before insert or update of owner_id on public.property_units for each row execute function public.rental_guard();

revoke all on function public.rent_home(uuid, text, text, numeric), public.rent_settle(uuid), public.rent_end(uuid) from public, anon, authenticated;

-- ======================================================== 078_home_name.sql
-- Newtown, part 78: name your home. Any home you hold (bought, or your free room) can have its own
-- name ("Tolu's Pad"), shown on your home card. A free room's name goes with it when it goes back
-- to the city (the row is removed then).
--
-- Safe to run more than once.

-- Free rooms (part 74): the column this reads, in case 74 hasn't been run.
alter table public.property_units add column if not exists starter boolean not null default false;

alter table public.lives add column if not exists home_named_at timestamptz;

/** Name a home you hold (an empty name puts back what it was called: "Room", "Flat"...). */
create or replace function public.home_rename(p_user uuid, p_unit text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  update public.property_units set label = coalesce(v_name, case when starter then 'Room' else 'Home' end)
  where unit_id = p_unit and owner_id = p_user and use = 'home';
  if not found then raise exception 'not_yours'; end if;
  -- The walkthrough's first step (part 80).
  if v_name is not null then update public.lives set home_named_at = now() where user_id = p_user; end if;
end $$;
revoke all on function public.home_rename(uuid, text, text) from public, anon, authenticated;
grant execute on function public.home_rename(uuid, text, text) to service_role;

-- ======================================================== 079_property_income.sql
-- Newtown, part 79: property pays you, by itself (docs/MONEY.md, "What your property earns").
--   1. Every home, shop, office or plot you own (not a free room) earns a share of what you paid
--      for it every day (property_income_day, 10% a day), counted to the second and paid
--      whenever the game asks (opening the game, every minute while you play, opening your
--      wallet). While you're away it keeps earning, up to 2 days' worth.
--   2. Buying from the city is simply its price: no buying tax any more.
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('property_income_day', 0.10, 'Share of what you paid for a property that it earns you every day (paid automatically)'),
  ('property_income_cap_hours', 48, 'Most hours of property income paid at once (earning while away)')
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- A simple buy at the price shown.
update public.game_settings set value = 0 where key = 'property_buy_tax';

-- Free rooms (part 74): the column this reads, in case 74 hasn't been run.
alter table public.property_units add column if not exists starter boolean not null default false;

alter table public.lives add column if not exists income_at timestamptz;

-- What a unit earns on: what it cost from the city (a sale between players, at whatever price
-- they agree, doesn't change it, so nobody can sell a flat to a friend for ₦1bn and earn on that).
alter table public.property_units add column if not exists income_base numeric(14,2);
update public.property_units set income_base = price where income_base is null;

/** What your property earns a day (mint): the share of what you paid for each unit you own (free rooms earn nothing). */
create or replace function public.property_income_day(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(coalesce(sum(coalesce(u.income_base, u.price)), 0) * coalesce(public.setting('property_income_day'), 0), 4)
  from public.property_units u
  where u.owner_id = p_user and not coalesce(u.starter, false)
$$;

/**
 * Pay what your property has earned since last time (up to the cap). Returns
 * { paid, per_day, at, coins, total }: paid now, earning a day, when it was counted up to, your
 * coins after, and all it has ever paid you.
 */
create or replace function public.property_income_settle(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_day numeric := public.property_income_day(p_user);
  v_secs numeric;
  v_pay numeric := 0;
  v_coins numeric;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return jsonb_build_object('paid', 0, 'per_day', 0); end if;
  if l.income_at is not null and v_day > 0 then
    v_secs := least(extract(epoch from now() - l.income_at), coalesce(public.setting('property_income_cap_hours'), 48) * 3600);
    v_pay := floor(v_day * greatest(v_secs, 0) / 86400 * 100) / 100;
  end if;
  if v_pay > 0 then
    update public.profiles set coins = coins + v_pay where id = p_user;
    perform public.log_coins(p_user, null, 'property_income', v_pay, false, 'What your property earned');
    -- Counted up to the second that's been paid for (the pennies not yet paid carry on).
    update public.lives set income_at = least(now(), l.income_at + make_interval(secs => v_pay / v_day * 86400)) where user_id = p_user;
    if extract(epoch from now() - l.income_at) > coalesce(public.setting('property_income_cap_hours'), 48) * 3600 then
      update public.lives set income_at = now() where user_id = p_user;
    end if;
  elsif l.income_at is null or v_day <= 0 then
    update public.lives set income_at = now() where user_id = p_user;
  end if;
  select coins into v_coins from public.profiles where id = p_user;
  return jsonb_build_object(
    'paid', v_pay,
    'per_day', v_day,
    'at', (select income_at from public.lives where user_id = p_user),
    'coins', v_coins,
    'total', coalesce((select sum(amount) from public.ledger where user_id = p_user and kind = 'property_income'), 0)
  );
end $$;

/**
 * A unit bought or changing hands: what both owners have earned so far is paid first (at their old
 * rates), so nobody is paid for time before they owned it; and a new unit earns on its city price.
 */
create or replace function public.property_income_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.income_base := coalesce(new.income_base, new.price);
    if new.owner_id is not null then perform public.property_income_settle(new.owner_id); end if;
  elsif new.owner_id is distinct from old.owner_id then
    new.income_base := coalesce(old.income_base, old.price);
    if old.owner_id is not null then perform public.property_income_settle(old.owner_id); end if;
    if new.owner_id is not null then perform public.property_income_settle(new.owner_id); end if;
  else
    -- A new price agreed between players doesn't change what it earns on.
    new.income_base := coalesce(old.income_base, old.price);
  end if;
  return new;
end $$;
drop trigger if exists property_income_guard on public.property_units;
create trigger property_income_guard before insert or update of owner_id, price, income_base on public.property_units
  for each row execute function public.property_income_guard();

/**
 * The game asking (POST /api/income): paid at most once a minute (the screen counts it up in
 * between), so asking often never piles up payments; otherwise the same as property_income_settle.
 */
create or replace function public.property_income_settle_soft(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_at timestamptz := (select income_at from public.lives where user_id = p_user);
begin
  if v_at is not null and v_at > now() - interval '60 seconds' then
    return jsonb_build_object(
      'paid', 0,
      'per_day', public.property_income_day(p_user),
      'at', v_at,
      'coins', (select coins from public.profiles where id = p_user),
      'total', coalesce((select sum(amount) from public.ledger where user_id = p_user and kind = 'property_income'), 0)
    );
  end if;
  return public.property_income_settle(p_user);
end $$;

revoke all on function public.property_income_settle_soft(uuid) from public, anon, authenticated;
grant execute on function public.property_income_settle_soft(uuid) to service_role;
revoke all on function public.property_income_day(uuid), public.property_income_settle(uuid), public.property_income_guard() from public, anon, authenticated;
grant execute on function public.property_income_day(uuid), public.property_income_settle(uuid) to service_role;

-- The daily new-mint report counts property income too.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                   'daily_gift', 'challenge_bonus', 'first_step', 'property_income', 'tutorial')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;
revoke all on public.coin_supply_daily from public, anon, authenticated;
grant select on public.coin_supply_daily to service_role;

-- ======================================================== 080_tutorial.sql
-- Newtown, part 80: the walkthrough's steps and rewards (docs/FIRST_STEPS.md), for everyone, old
-- players too, once each:
--   name : give your home a name            (₦20,000)
--   hi   : say hi to someone in a private chat (₦50,000)
--   win  : win a challenge against someone    (₦50,000)
-- Each counts only if done after the player's walkthrough started (so everyone is shown how,
-- even if they did it long ago). The server works out the rewards in mint; each is capped here.
--
-- Safe to run more than once.

-- Free rooms (part 74): the column this reads, in case 74 hasn't been run.
alter table public.property_units add column if not exists starter boolean not null default false;

alter table public.lives add column if not exists tutorial_at timestamptz;
alter table public.lives add column if not exists home_named_at timestamptz;

create table if not exists public.tutorial_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  step text not null check (step in ('name', 'hi', 'win')),
  reward numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, step)
);
alter table public.tutorial_steps enable row level security;

-- Naming your home (part 78) stamps lives.home_named_at; the same function again here, so it
-- works whichever of the two is run last.
/** Name a home you hold (an empty name puts back what it was called: "Room", "Flat"...). */
create or replace function public.home_rename(p_user uuid, p_unit text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  update public.property_units set label = coalesce(v_name, case when starter then 'Room' else 'Home' end)
  where unit_id = p_unit and owner_id = p_user and use = 'home';
  if not found then raise exception 'not_yours'; end if;
  -- The walkthrough's first step (part 80).
  if v_name is not null then update public.lives set home_named_at = now() where user_id = p_user; end if;
end $$;
/**
 * Which steps are done, paying each newly done one once. p_rewards: { name, hi, win } in mint.
 * Starts the walkthrough's clock the first time it's asked. Returns
 * { name, hi, win, paid: [...], rewards: { name, hi, win } }.
 */
create or replace function public.tutorial_check(p_user uuid, p_rewards jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_since timestamptz;
  v_done jsonb;
  v_paid text[] := '{}';
  v_step text;
  v_reward numeric;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return null; end if;
  v_since := coalesce(l.tutorial_at, now());
  if l.tutorial_at is null then update public.lives set tutorial_at = v_since where user_id = p_user; end if;
  v_done := jsonb_build_object(
    'name', l.home_named_at is not null and l.home_named_at >= v_since,
    'hi', exists (select 1 from public.chat_messages where sender_id = p_user and recipient_id is not null and created_at >= v_since),
    'win', to_regclass('public.challenges') is not null and exists (
      select 1 from public.challenges c
      where c.winner_id = p_user and c.status = 'done' and coalesce(c.finished_at, c.created_at) >= v_since
        and (select count(*) from public.challenge_players cp where cp.challenge_id = c.id) >= 2)
  );
  foreach v_step in array array['name', 'hi', 'win'] loop
    if (v_done ->> v_step)::boolean then
      v_reward := round(least(greatest(coalesce((p_rewards ->> v_step)::numeric, 0), 0), 40), 2);
      insert into public.tutorial_steps (user_id, step, reward) values (p_user, v_step, v_reward) on conflict do nothing;
      if found then
        v_paid := v_paid || v_step;
        if v_reward > 0 then
          update public.profiles set coins = coins + v_reward where id = p_user;
          perform public.log_coins(p_user, null, 'tutorial', v_reward, false, 'Walkthrough reward: ' || v_step);
        end if;
      end if;
    end if;
  end loop;
  -- Done once counts for good (even if, say, the home is renamed back later).
  return jsonb_build_object(
    'name', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'name'),
    'hi', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'hi'),
    'win', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'win'),
    'paid', to_jsonb(v_paid)
  );
end $$;

revoke all on function public.home_rename(uuid, text, text), public.tutorial_check(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.home_rename(uuid, text, text), public.tutorial_check(uuid, jsonb) to service_role;

-- ======================================================== 081_no_challenge_prize.sql
-- Newtown, part 81: no more Newtown prize on top of a challenge won (the winner takes the pot,
-- docs/MONEY.md). The trigger from part 73 stays, paying nothing while this is 0.
--
-- Safe to run more than once.

update public.game_settings set value = 0, note = 'Mint Newtown adds for each challenge won: none since part 81'
where key = 'challenge_bonus';

-- ======================================================== 082_landmarks.sql
-- Newtown, part 82: buy a landmark (docs/LANDMARKS.md).
--   1. Every landmark on the map (a stadium, the airport, a cathedral, a market...) can be bought
--      outright by one player, for crazy money (₦50bn to ₦2tn; the game works out the price from
--      the map, src/lib/world/landmark-price.ts, never the phone). The price is burned, like
--      property bought from the city. Once someone owns it, it's theirs: nobody else can buy it.
--   2. A landmark you own earns like your property does (part 79): the same share of what you paid
--      for it every day (property_income_day), paid by property_income_settle.
--
-- landmark_id is "<region>:<landmark id>" ("lagos:national-stadium"): the landmark's own id, which
-- stays the same for good even if it moves on the map.
--
-- Safe to run more than once. Run after part 79.

insert into public.game_settings (key, value, note) values
  ('landmark_price_max', 5000000000, 'Dearest landmark the game will sell, in mint (a sanity check)')
on conflict (key) do update set note = excluded.note;

-- Free rooms (part 74): the column this reads, in case 74 hasn't been run.
alter table public.property_units add column if not exists starter boolean not null default false;

create table if not exists public.landmark_owners (
  landmark_id text primary key check (landmark_id ~ '^[a-z0-9-]+:[a-z0-9-]+$'),
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  -- Null: the owner's account was deleted (it's back on the market).
  owner_id uuid references public.profiles (id) on delete set null,
  name text check (name is null or char_length(name) <= 80),
  price numeric(14,2) not null check (price > 0),
  bought_at timestamptz not null default now()
);
create index if not exists landmark_owners_owner_idx on public.landmark_owners (owner_id);
create index if not exists landmark_owners_region_idx on public.landmark_owners (region);
alter table public.landmark_owners enable row level security; -- no policies: only the server reads it

/** What your property earns a day (mint): the share of what you paid for each unit (free rooms earn nothing) and each landmark you own. */
create or replace function public.property_income_day(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(
    (coalesce((select sum(coalesce(u.income_base, u.price)) from public.property_units u
               where u.owner_id = p_user and not coalesce(u.starter, false)), 0)
     + coalesce((select sum(m.price) from public.landmark_owners m where m.owner_id = p_user), 0))
    * coalesce(public.setting('property_income_day'), 0), 4)
$$;

/** A landmark bought or changing hands: what both owners have earned so far is paid first, at their old rates. */
create or replace function public.landmark_income_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id is not null then perform public.property_income_settle(new.owner_id); end if;
  elsif new.owner_id is distinct from old.owner_id or new.price is distinct from old.price then
    if old.owner_id is not null then perform public.property_income_settle(old.owner_id); end if;
    if new.owner_id is not null and new.owner_id is distinct from old.owner_id then perform public.property_income_settle(new.owner_id); end if;
  end if;
  return new;
end $$;
drop trigger if exists landmark_income_guard on public.landmark_owners;
create trigger landmark_income_guard before insert or update of owner_id, price on public.landmark_owners
  for each row execute function public.landmark_income_guard();

/**
 * Buy a landmark nobody owns, at the price the game worked out (p_price, mint, after your
 * reputation discount). p_name: what it's called, for the owner list and the note. Returns your
 * coins after and what it earns you a day.
 */
create or replace function public.landmark_buy(p_user uuid, p_region text, p_landmark text, p_name text, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_price numeric := round(p_price, 2);
  v_name text := left(coalesce(nullif(trim(p_name), ''), split_part(p_landmark, ':', 2)), 80);
  v_day numeric;
begin
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_region'; end if;
  if p_landmark is null or p_landmark !~ '^[a-z0-9-]+:[a-z0-9-]+$' or split_part(p_landmark, ':', 1) <> p_region then raise exception 'bad_landmark'; end if;
  if v_price is null or v_price <= 0 or v_price > coalesce(public.setting('landmark_price_max'), 5000000000) then raise exception 'bad_price'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  if not exists (select 1 from public.lives where user_id = p_user) then raise exception 'no_life'; end if;
  -- One buyer at a time for each landmark.
  perform pg_advisory_xact_lock(hashtext('landmark:' || p_landmark));
  if exists (select 1 from public.landmark_owners where landmark_id = p_landmark and owner_id is not null) then raise exception 'taken'; end if;
  if p.coins < v_price then raise exception 'not_enough:%', trim_scale(v_price); end if;

  insert into public.landmark_owners (landmark_id, region, owner_id, name, price, bought_at)
  values (p_landmark, p_region, p_user, v_name, v_price, now())
  on conflict (landmark_id) do update set owner_id = excluded.owner_id, name = excluded.name, price = excluded.price, bought_at = excluded.bought_at;

  update public.profiles set coins = coins - v_price where id = p_user;
  perform public.log_coins(p_user, null, 'landmark_buy', -v_price, false, 'Bought ' || v_name);
  perform public.burn(null, v_price, 'Landmark bought from the city');
  v_day := round(v_price * coalesce(public.setting('property_income_day'), 0), 2);
  perform public.notify(p_user, null, 'property', 'You own ' || v_name || ' now! It earns you ' || trim_scale(v_day) || ' mint a day.');
  return jsonb_build_object('coins', (select coins from public.profiles where id = p_user), 'price', v_price, 'per_day', v_day);
end $$;

/** Who owns which landmarks in a region (for the map and the landmark cards). */
create or replace function public.landmark_owners_list(p_region text)
returns table (landmark_id text, owner_id uuid, owner_name text, name text, price numeric, bought_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.landmark_id, m.owner_id, coalesce(nullif(pr.username, ''), 'Someone'), m.name, m.price, m.bought_at
  from public.landmark_owners m
  join public.profiles pr on pr.id = m.owner_id
  where m.region = p_region
  order by m.bought_at
$$;

revoke all on table public.landmark_owners from public, anon, authenticated;
grant select, insert, update, delete on table public.landmark_owners to service_role;
revoke all on function public.property_income_day(uuid), public.landmark_income_guard(), public.landmark_buy(uuid, text, text, text, numeric), public.landmark_owners_list(text) from public, anon, authenticated;
grant execute on function public.property_income_day(uuid), public.landmark_buy(uuid, text, text, text, numeric), public.landmark_owners_list(text) to service_role;

-- ======================================================== 083_online_pay_world_bank.sql
-- Newtown, part 83 (docs/MONEY.md):
--   1. Pay for being online: every active minute (part 73's active_ping) pays a little
--      (online_pay_minute, ₦500 in Lagos), up to online_pay_daily_minutes a day (4 hours).
--   2. The World Bank: one pot of money the city collects from games (Newtown's cut of every
--      challenge pool, and challenge fees). Players see it grow; stealing from it is coming soon.
--
-- Safe to run more than once.

insert into public.game_settings (key, value, note) values
  ('online_pay_minute', 0.33, 'Mint paid for each active minute online (₦500 in Lagos)'),
  ('online_pay_daily_minutes', 240, 'How many active minutes a day are paid for')
on conflict (key) do update set value = excluded.value, note = excluded.note;

-- What this needs from part 73 (the same definitions, so it works even if 73 hasn't been run).
-- The day in Lagos (days start at midnight there).
create or replace function public.lagos_day(p_at timestamptz default now()) returns date
language sql stable as $$ select (p_at at time zone 'Africa/Lagos')::date $$;

-- ============================================================ active time
create table if not exists public.activity_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  minutes int not null default 0,
  last_ping timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.activity_days enable row level security;

/** A minute of you being active (counted at most once every 50 seconds, 10 hours a day at most). Returns today's minutes. */
create or replace function public.active_ping(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.lagos_day();
  v_min int;
begin
  insert into public.activity_days (user_id, day, minutes, last_ping) values (p_user, v_day, 1, now())
  on conflict (user_id, day) do update
    set minutes = least(public.activity_days.minutes + 1, 600), last_ping = now()
    where public.activity_days.last_ping < now() - interval '50 seconds';
  select minutes into v_min from public.activity_days where user_id = p_user and day = v_day;
  return coalesce(v_min, 0);
end $$;

-- ============================================================ pay for being online
/**
 * A minute of you being active (part 73), paid for: { minutes (today), paid (mint, this ping),
 * rate (mint a minute), left (paid minutes left today) }.
 */
create or replace function public.online_ping(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_after int;
  v_counted boolean;
  v_rate numeric := coalesce(public.setting('online_pay_minute'), 0);
  v_cap int := coalesce(public.setting('online_pay_daily_minutes'), 0)::int;
  v_paid numeric := 0;
begin
  v_after := public.active_ping(p_user);
  -- Paid only if this very call counted the minute (active_ping stamps last_ping with this
  -- transaction's now(); a ping that came too soon, or lost a race to another, leaves it older).
  v_counted := exists (select 1 from public.activity_days where user_id = p_user and day = public.lagos_day() and last_ping = now());
  if v_counted and v_after <= v_cap and v_rate > 0 and exists (select 1 from public.lives where user_id = p_user) then
    v_paid := v_rate;
    update public.profiles set coins = coins + v_paid where id = p_user;
    perform public.log_coins(p_user, null, 'online_pay', v_paid, false, 'Paid for being online');
  end if;
  return jsonb_build_object('minutes', v_after, 'paid', v_paid, 'rate', v_rate, 'left', greatest(0, v_cap - v_after));
end $$;

-- ============================================================ the World Bank
create table if not exists public.world_bank (
  id int primary key default 1 check (id = 1),
  balance numeric(16,2) not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.world_bank enable row level security;
create table if not exists public.world_bank_ledger (
  id bigserial primary key,
  amount numeric(14,2) not null,
  kind text not null check (char_length(kind) <= 30),
  note text,
  created_at timestamptz not null default now()
);
alter table public.world_bank_ledger enable row level security;

-- Opened with everything games have paid the city so far (only the first time).
insert into public.world_bank (id, balance)
select 1, coalesce((select sum(amount) from public.ledger where kind = 'burn' and note = 'Challenge pools'), 0)
        + coalesce((select -sum(amount) from public.ledger where kind = 'challenge_fee' and amount < 0), 0)
on conflict (id) do nothing;

/** Money a game pays the city goes into the World Bank. */
create or replace function public.world_bank_take() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric := 0;
begin
  if new.kind = 'burn' and new.note = 'Challenge pools' then v_amount := new.amount;
  elsif new.kind = 'challenge_fee' and new.amount < 0 then v_amount := -new.amount;
  end if;
  if v_amount > 0 then
    update public.world_bank set balance = balance + v_amount, updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (v_amount, new.kind, new.note);
  end if;
  return new;
end $$;
drop trigger if exists world_bank_take on public.ledger;
create trigger world_bank_take after insert on public.ledger
  for each row when (new.kind in ('burn', 'challenge_fee')) execute function public.world_bank_take();

/** What's in the World Bank, and what came in today. */
create or replace function public.world_bank_view() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.world_bank where id = 1), 0),
    'today', coalesce((select sum(amount) from public.world_bank_ledger where created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos')), 0)
  )
$$;

-- ============================================================ what you've earned, by kind
/** Your earnings by ledger kind, in all and today (Lagos day): for Things › Assets. */
create or replace function public.earnings_summary(p_user uuid, p_kinds text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(kind, jsonb_build_object('total', total, 'today', today)), '{}'::jsonb)
  from (
    select kind, sum(amount) as total,
           coalesce(sum(amount) filter (where created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos')), 0) as today
    from public.ledger
    where user_id = p_user and kind = any(p_kinds) and amount > 0
    group by kind
  ) k
$$;

do $$
declare f text;
begin
  revoke all on table public.world_bank, public.world_bank_ledger from public, anon, authenticated;
  grant all on table public.world_bank, public.world_bank_ledger to service_role;
  foreach f in array array['public.online_ping(uuid)', 'public.world_bank_take()', 'public.world_bank_view()', 'public.earnings_summary(uuid, text[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- The daily new-mint report counts online pay too.
create or replace view public.coin_supply_daily as
select created_at::date as day,
       coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                   'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                   'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                   'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                   'daily_gift', 'challenge_bonus', 'first_step', 'property_income', 'tutorial',
                                                   'online_pay')), 0) as created,
       coalesce(sum(amount) filter (where kind = 'burn'), 0) as burned
from public.ledger
group by 1
order by 1 desc;
revoke all on public.coin_supply_daily from public, anon, authenticated;
grant select on public.coin_supply_daily to service_role;

-- ======================================================== 084_bank_ads_admin.sql
-- Newtown, part 84:
--   1. The World Bank opens with ₦1 billion (666,666.67 mint at ₦1,500 a mint) and grows from
--      there with what games pay the city (part 83). Added once: running this again adds nothing.
--   2. Billboard views counted in full: a batch of views of the same business's billboard counts
--      every one (business_hits_add), not one per batch.
--   3. Paid billboard ads can be for one region (a state) or everywhere: ads.region, and
--      ad_serve_in picks only the ads for the map being looked at.
--   4. The owner's dashboard: the money made and burned since a time (money_since).
--
-- Run it after 083 (and 043 for businesses). Safe to run more than once.

-- ============================================================ 1. the World Bank's opening ₦1 billion
insert into public.game_settings (key, value, note) values
  ('world_bank_start', 666666.67, 'What the World Bank opened with, in mint (₦1 billion in Lagos)')
on conflict (key) do update set value = excluded.value, note = excluded.note;

insert into public.world_bank (id, balance) values (1, 0) on conflict (id) do nothing;

do $$
declare
  v_start numeric := coalesce(public.setting('world_bank_start'), 666666.67);
begin
  if not exists (select 1 from public.world_bank_ledger where kind = 'opening') then
    update public.world_bank set balance = balance + v_start, updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (v_start, 'opening', 'The World Bank opens with ₦1 billion');
  end if;
end $$;

/** What's in the World Bank, and what games paid into it today (the opening sum isn't "today"). */
create or replace function public.world_bank_view() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.world_bank where id = 1), 0),
    'today', coalesce((select sum(amount) from public.world_bank_ledger
                       where kind <> 'opening' and created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos')), 0)
  )
$$;

-- ============================================================ 2. billboard views, every one
/** Count p_n of the same thing someone did with a business (billboard views come in batches). */
create or replace function public.business_hits_add(p_lease uuid, p_kind text, p_n int) returns void
language sql security definer set search_path = public as $$
  insert into public.business_hits (lease_id, kind, n)
  select p_lease, p_kind, greatest(1, least(coalesce(p_n, 1), 50))
  where exists (select 1 from public.business_leases where id = p_lease and status = 'live')
  on conflict (lease_id, day, kind) do update set n = business_hits.n + excluded.n
$$;

-- ============================================================ 3. ads for one region
-- Null: everywhere (every ad bought before this).
alter table public.ads add column if not exists region text check (region is null or region ~ '^[a-z0-9-]{2,30}$');

/** Like ad_serve, for one region's map: its own ads and the ones for everywhere. */
create or replace function public.ad_serve_in(p_n int, p_region text)
returns table (id uuid, image_path text, headline text, brand text, link_url text)
language sql volatile security definer set search_path = public as $$
  select a.id, a.image_path, a.headline, a.brand, a.link_url
  from public.ads a
  where public.ad_is_paying(a) and (a.region is null or a.region = p_region)
  order by -ln(greatest(random(), 1e-12))
           / (a.coins_left::float8
              / greatest(extract(epoch from (coalesce(a.ends_at, now()) - now())) / 3600.0, 1.0))
  limit greatest(0, least(coalesce(p_n, 24), 40))
$$;

-- ============================================================ 4. the dashboard's money
/** New money made and money burned since a time (the same kinds as coin_supply_daily), in mint. */
create or replace function public.money_since(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'created', coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                         'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                         'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                         'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                         'daily_gift', 'challenge_bonus', 'first_step', 'property_income', 'tutorial',
                                                         'online_pay')), 0),
    'online', coalesce(sum(amount) filter (where kind = 'online_pay'), 0),
    'burned', coalesce(sum(amount) filter (where kind = 'burn'), 0)
  )
  from public.ledger
  where created_at >= p_since
$$;

do $$
declare f text;
begin
  foreach f in array array['public.business_hits_add(uuid, text, int)', 'public.ad_serve_in(int, text)', 'public.money_since(timestamptz)', 'public.world_bank_view()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 085_town_hall_faces.sql
-- Newtown, part 85:
--   1. Town Hall: one chat for each state (room 'town:<region>', e.g. 'town:lagos') where everyone
--      online can talk. At most one message every 5 seconds each, 300 letters.
--   2. Profile photos: a public storage bucket, 'faces', for the small square photos players can
--      use instead of their drawn face (src/app/api/profile-photo).
--
-- Run it after 057 (and 062). Safe to run more than once.

-- ============================================================ 1. Town Hall
create or replace function public.chat_room_ok(p_room text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    p_room ~ '^b:[0-9]{1,7}(:(g|o|r|f([1-9]|[1-9][0-9]|1[0-9][0-9]|200)))?$'
    or p_room ~ '^balloon:([0-9]|[1-4][0-9]|50)$'
    or p_room ~ '^v:(train|bus|car|boat|ferris|slide|heli):[0-9]{1,7}$'
    or p_room ~ '^town:[a-z0-9-]{2,30}$',
    false)
$$;

-- The latest messages of one room, quickly (Town Hall reads its last 50 often).
create index if not exists chat_room_latest_idx on public.chat_messages (room, id desc) where room like 'town:%';

/** Say something in a state's Town Hall: one message every 5 seconds at most, 300 letters. */
create or replace function public.town_hall_send(p_user uuid, p_region text, p_body text) returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_room text := 'town:' || p_region;
  v_body text := nullif(trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g')), '');
begin
  if p_region !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_room'; end if;
  if v_body is null then raise exception 'empty'; end if;
  if char_length(v_body) > 300 then raise exception 'too_long'; end if;
  perform pg_advisory_xact_lock(hashtext('town:' || p_user::text));
  if exists (select 1 from public.chat_messages where sender_id = p_user and room = v_room and created_at > now() - interval '5 seconds') then
    raise exception 'too_fast';
  end if;
  return public.chat_send(p_user, v_room, null, v_body);
end $$;
revoke all on function public.town_hall_send(uuid, text, text) from public, anon, authenticated;
grant execute on function public.town_hall_send(uuid, text, text) to service_role;

-- ============================================================ 2. profile photos
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('faces', 'faces', true, 400000, array['image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- ======================================================== 086_town_hall_more.sql
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

-- ======================================================== 087_rename_property.sql
-- Newtown, part 87: name any property you own (a flat, a shop, an office, a plot...), not just
-- your home, from Assets. An empty name puts back what the map calls it ("Flat 2", "Shop 1").
-- The names show on your Assets and in the map's search, like a home's (part 78).
--
-- Run it after 078. Safe to run more than once.

/** Name a unit you own (null or '' puts back its plain name from the building). */
create or replace function public.unit_rename(p_user uuid, p_unit text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_plain text;
  v_label text;
  u public.property_units;
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  select * into u from public.property_units where unit_id = p_unit and owner_id = p_user;
  if not found then raise exception 'not_yours'; end if;
  -- Its plain name: what the building's snapshot calls it (a free room is a "Room").
  select b.snapshot -> 'units' -> (split_part(p_unit, '/', 2)::int) ->> 'label' into v_plain
  from public.property_buildings b where b.building_id = u.building_id;
  v_label := coalesce(v_name, case when u.starter then 'Room' end, v_plain, case when u.use = 'home' then 'Home' else 'Unit' end);
  update public.property_units set label = left(v_label, 60) where unit_id = p_unit;
  -- Naming your home still counts for the walkthrough's first mission (part 80).
  if v_name is not null and u.use = 'home' then update public.lives set home_named_at = now() where user_id = p_user; end if;
  return v_label;
end $$;
revoke all on function public.unit_rename(uuid, text, text) from public, anon, authenticated;
grant execute on function public.unit_rename(uuid, text, text) to service_role;

-- ======================================================== 088_world_bank_sports.sql
-- Newtown, part 88: the World Bank counts every game's cut, not only challenges.
--   Before this, only challenges paid in (the 10% of each pot, and the fee for hosting too often).
--   The sports house cut (what bets don't pay back) and match tickets were burned without reaching
--   the World Bank, or, while an old hide-and-seek round was open, went into that round's prize pool.
--   Now sports money always goes to the city, and the World Bank counts it, from now on.
--
-- Run it after 083 and 084. Safe to run more than once.

/** Mint a player has already paid goes into this game's prize pool, or is burned. Sports money always goes to the city (the World Bank). */
create or replace function public.pool_or_burn(p_round bigint, p_amount numeric, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_round bigint;
begin
  if coalesce(p_amount, 0) <= 0 then return null; end if;
  if p_round is not null and coalesce(p_note, '') not like 'Sports %' then
    update public.rounds set pool = pool + p_amount where id = p_round and status in ('join', 'seek')
      returning id into v_round;
  end if;
  if v_round is null then
    perform public.burn(p_round, p_amount, p_note);
    return null;
  end if;
  perform public.log_coins(null, v_round, 'pool_fee', p_amount, false, p_note);
  return v_round;
end $$;

/** Money a game pays the city goes into the World Bank: challenges (pot cut and hosting fee) and sports (house cut and tickets). */
create or replace function public.world_bank_take() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_amount numeric := 0;
begin
  if new.kind = 'burn' and (new.note = 'Challenge pools' or new.note like 'Sports house cut: %' or new.note like 'Sports ticket: %') then v_amount := new.amount;
  elsif new.kind = 'challenge_fee' and new.amount < 0 then v_amount := -new.amount;
  end if;
  if v_amount > 0 then
    update public.world_bank set balance = balance + v_amount, updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (v_amount, new.kind, new.note);
  end if;
  return new;
end $$;

do $$
begin
  revoke all on function public.pool_or_burn(bigint, numeric, text), public.world_bank_take() from public, anon, authenticated;
  grant execute on function public.pool_or_burn(bigint, numeric, text), public.world_bank_take() to service_role;
end $$;

-- ======================================================== 089_world_bank_everything.sql
-- Newtown, part 89: the World Bank counts everything players pay the city, not only games.
--   - Everything spent in the city and burned: fares (rides, trains, work, about town), food,
--     electricity, gym, rent to the city, property and landmarks bought from the city, home
--     improvements, shops, market fees, club entry, pranks, marks, jail bribes, private care and
--     school, side-hustle costs, and game cuts (challenges, sports). Bookkeeping burns that aren't
--     anyone spending (retired bot coins, money of deleted accounts...) are left out.
--   - Every tax and public bill (they went to the state treasuries until now): income tax, VAT,
--     rent, property and sales taxes, waste bills, public clinic and school fees, fines.
--   - Loans: repayments come in, new loans go out (one bank, not two).
--   - Once: what was spent since the World Bank opened (part 84) and not yet counted is added
--     (not counted as "today").
--
-- Run it after 083, 084 and 088. If you ever run one of those again, run this again after it.
-- Safe to run more than once.

/** A burn that is bookkeeping, not someone spending: not counted. */
create or replace function public.world_bank_skips(p_note text) returns boolean
language sql immutable as $$
  select coalesce(p_note, '') in ('linked accounts: no payout', 'seeker share with no seekers', 'bot leftover', 'carry-over retired', 'bot coins retired')
      or coalesce(p_note, '') like 'Sports bet refund (account gone): %'
      or coalesce(p_note, '') like 'Sports winnings (account gone): %'
$$;

/** Money spent in the city (burned) goes into the World Bank. */
create or replace function public.world_bank_take() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'burn' and new.amount > 0 and not public.world_bank_skips(new.note) then
    update public.world_bank set balance = balance + new.amount, updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (new.amount, 'spent', left(coalesce(new.note, 'Spent in the city'), 500));
  end if;
  return new;
end $$;
drop trigger if exists world_bank_take on public.ledger;
create trigger world_bank_take after insert on public.ledger
  for each row when (new.kind = 'burn') execute function public.world_bank_take();

/** Taxes and public bills (into the treasuries), loan repayments and new loans: the World Bank too. */
create or replace function public.world_bank_treasury() returns trigger
language plpgsql security definer set search_path = public as $$
declare v numeric := new.amount;
begin
  if new.kind = 'opening' or v = 0 then return new; end if;
  -- Only the bank's own loans go out of it; nothing else takes from the treasuries.
  if v < 0 and not (new.treasury = 'wb' and new.kind = 'loan_out') then return new; end if;
  update public.world_bank set balance = balance + v, updated_at = now() where id = 1;
  insert into public.world_bank_ledger (amount, kind, note) values (v, left(new.kind, 30), left(coalesce(new.note, new.kind), 500));
  return new;
end $$;
drop trigger if exists world_bank_treasury on public.treasury_ledger;
create trigger world_bank_treasury after insert on public.treasury_ledger
  for each row execute function public.world_bank_treasury();

/** What's in the World Bank, and what came in today (not the opening sum, the catch-up or loans going out). */
create or replace function public.world_bank_view() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'balance', coalesce((select balance from public.world_bank where id = 1), 0),
    'today', coalesce((select sum(amount) from public.world_bank_ledger
                       where amount > 0 and kind not in ('opening', 'catch_up')
                         and created_at >= (public.lagos_day()::timestamp at time zone 'Africa/Lagos')), 0)
  )
$$;

-- ============================================================ once: catch up since the opening
do $$
declare
  v_since timestamptz := (select min(created_at) from public.world_bank_ledger where kind = 'opening');
  v_should numeric;
  v_got numeric;
begin
  if v_since is null or exists (select 1 from public.world_bank_ledger where kind = 'catch_up') then return; end if;
  v_should := coalesce((select sum(amount) from public.ledger where kind = 'burn' and amount > 0 and created_at >= v_since and not public.world_bank_skips(note)), 0)
            + coalesce((select sum(amount) from public.treasury_ledger where created_at >= v_since and kind <> 'opening'
                          and (amount > 0 or (treasury = 'wb' and kind = 'loan_out'))), 0);
  v_got := coalesce((select sum(amount) from public.world_bank_ledger where created_at >= v_since and kind not in ('opening', 'catch_up')), 0);
  if v_should - v_got <> 0 then
    update public.world_bank set balance = balance + (v_should - v_got), updated_at = now() where id = 1;
    insert into public.world_bank_ledger (amount, kind, note) values (v_should - v_got, 'catch_up', 'Spending since the World Bank opened, counted at last');
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.world_bank_skips(text)', 'public.world_bank_take()', 'public.world_bank_treasury()', 'public.world_bank_view()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 090_packs_and_credits.sql
-- Newtown, part 90: starting money, starter packs paid like top-ups, and the owner crediting players.
--   1. A new life starts with ₦2,000,000 (1,333.33 mint at ₦1,500 a mint) and a free home.
--   2. Starter packs raise your starting money to ₦20m, ₦80m or ₦300m (₦1,000, ₦2,500, ₦5,000),
--      once, until you buy a home of your own. They're paid through the top-up machinery (part 76):
--      the pop-up, bank transfer, the webhook, the page Paystack sends you back to, the Wallet's
--      "Your payments" and the daily check all confirm them, and whichever is first credits it,
--      once. Anyone who paid is always credited, even for a second pack bought in another tab.
--   3. The owner's dashboard can credit Newtown money to a player by hand (every credit recorded).
--
-- Run it after 076 (top-ups) and 042 (starter packs). Safe to run more than once.

-- ============================================================ 1. ₦2,000,000 to start
update public.game_settings set value = 1333.33, note = 'Mint to start a life on the real map with (once): ₦2,000,000 in Lagos, with a free home'
  where key = 'start_grant';

-- ============================================================ 2. starter packs, paid like top-ups
-- A pack's top-up row remembers the pack and the starting money it brings (in mint).
alter table public.topups add column if not exists pack text check (pack is null or pack ~ '^[a-z_]{2,20}$');
alter table public.topups add column if not exists pack_total numeric(14,2);

/** Has this player had a starter pack (old way or new)? */
create or replace function public.pack_had(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.starter_payments where user_id = p_user and status = 'paid')
      or exists (select 1 from public.topups where user_id = p_user and pack is not null and status = 'paid')
$$;

/** Can this player still buy a pack? 'open', 'had' (one already) or 'too_late' (bought a home of their own). */
create or replace function public.pack_status(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.pack_had(p_user) then 'had'
    when exists (select 1 from public.property_units where owner_id = p_user and not starter) then 'too_late'
    else 'open' end
$$;

/** What a pack adds for this player: its total less what their life started with (all of it before a life). */
create or replace function public.pack_adds(p_user uuid, p_total numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select round(greatest(0, p_total - coalesce(
           (select least(granted, public.setting('start_grant')) from public.lives where user_id = p_user), 0)), 2)
$$;

/** A starter pack payment started (p_total: the starting money it brings, mint, worked out by the server). */
create or replace function public.pack_topup_start(p_user uuid, p_reference text, p_region text, p_pack text, p_total numeric, p_kobo bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not exists (select 1 from public.profiles where id = p_user and not is_bot and not frozen) then raise exception 'unknown_player'; end if;
  if coalesce(p_total, 0) <= 0 or p_total > 1000000 then raise exception 'bad_amount'; end if;
  v_status := public.pack_status(p_user);
  if v_status <> 'open' then raise exception '%', v_status; end if;
  insert into public.topups (reference, user_id, region, option, mint, amount_kobo, pack, pack_total)
    values (p_reference, p_user, p_region, 'pack_' || p_pack, greatest(0.01, public.pack_adds(p_user, p_total)), p_kobo, p_pack, p_total);
end $$;

/**
 * Paystack confirmed a top-up or a pack (p_kobo: what was actually paid). Once only. A top-up: its
 * money, doubled if it's the player's first top-up (packs don't count). A pack: the starting money
 * goes up to the pack's total (a second pack, paid in another tab, is added in full: paid is paid),
 * and its gifts follow (starter_payments, as before).
 */
create or replace function public.topup_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.topups;
  v_first boolean;
  v_add numeric;
  v_had boolean;
begin
  select * into t from public.topups where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if t.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'mint', t.mint * case when t.doubled then 2 else 1 end, 'doubled', t.doubled, 'pack', t.pack); end if;
  if coalesce(p_kobo, 0) < t.amount_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  perform 1 from public.profiles where id = t.user_id for update;
  if t.pack is not null then
    v_had := public.pack_had(t.user_id);
    v_add := case when v_had then round(greatest(0.01, t.pack_total - public.setting('start_grant')), 2) else greatest(0.01, public.pack_adds(t.user_id, t.pack_total)) end;
    update public.topups set status = 'paid', paid_at = now(), mint = v_add where reference = p_reference;
    -- No life yet (paid before pressing Start): it starts now, with the pack's money.
    insert into public.lives (user_id, region, granted) values (t.user_id, t.region, t.pack_total)
      on conflict (user_id) do update set granted = greatest(public.lives.granted, excluded.granted);
    update public.profiles set coins = coins + v_add where id = t.user_id;
    perform public.log_coins(t.user_id, null, 'start_grant', v_add, false, 'Starter pack: ' || t.pack);
    -- The pack's gifts, badge and furnished home (src/app/play/pack-actions.ts) and the news read this.
    insert into public.starter_payments (reference, user_id, region, pack, mint, amount_kobo, status, paid_at)
      values ('pk-' || substr(t.reference, 4), t.user_id, t.region, t.pack, t.pack_total, t.amount_kobo, 'paid', now())
      on conflict (reference) do nothing;
    return jsonb_build_object('found', true, 'new', true, 'mint', v_add, 'doubled', false, 'pack', t.pack);
  end if;
  v_first := not exists (select 1 from public.topups where user_id = t.user_id and status = 'paid' and pack is null);
  v_add := t.mint * case when v_first then 2 else 1 end;
  update public.topups set status = 'paid', paid_at = now(), doubled = v_first where reference = p_reference;
  update public.profiles set coins = coins + v_add where id = t.user_id;
  perform public.log_coins(t.user_id, null, 'topup', v_add, false, 'Top-up' || case when v_first then ' (first one, doubled)' else '' end);
  return jsonb_build_object('found', true, 'new', true, 'mint', v_add, 'doubled', v_first);
end $$;

-- ============================================================ 3. the owner credits a player
create table if not exists public.admin_credits (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mint numeric(14,2) not null check (mint > 0),
  note text not null check (char_length(note) between 1 and 200),
  by_email text,
  created_at timestamptz not null default now()
);
create index if not exists admin_credits_at_idx on public.admin_credits (created_at desc);
alter table public.admin_credits enable row level security;

/** Give a player Newtown money by hand (the owner's dashboard). Returns their new balance. */
create or replace function public.admin_credit(p_user uuid, p_mint numeric, p_note text, p_by text) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_coins numeric;
begin
  if coalesce(p_mint, 0) <= 0 or p_mint > 10000000 then raise exception 'bad_amount'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'no_note'; end if;
  update public.profiles set coins = coins + round(p_mint, 2) where id = p_user and not is_bot returning coins into v_coins;
  if not found then raise exception 'unknown_player'; end if;
  insert into public.admin_credits (user_id, mint, note, by_email) values (p_user, round(p_mint, 2), left(trim(p_note), 200), p_by);
  perform public.log_coins(p_user, null, 'admin_credit', round(p_mint, 2), false, left('From Newtown: ' || trim(p_note), 200));
  perform public.notify(p_user, null, 'gift', left('Newtown sent you money: ' || trim(p_note), 300));
  return v_coins;
end $$;

/** A player by their name in the game or their email (the dashboard's credit form): id and name. */
create or replace function public.admin_find_player(p_who text) returns table (id uuid, username text, coins numeric)
language sql stable security definer set search_path = public, auth as $$
  select p.id, p.username, p.coins from public.profiles p
  where not p.is_bot and (lower(p.username) = lower(trim(p_who))
     or p.id = (select u.id from auth.users u where lower(u.email) = lower(trim(p_who)) limit 1))
  limit 1
$$;

-- The dashboard's money made counts credits too.
create or replace function public.money_since(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'created', coalesce(sum(amount) filter (where kind in ('signup', 'seeker_bonus', 'topup', 'sponsor', 'bot_bounty', 'bot_funding',
                                                         'balloon', 'passive', 'ad_reward', 'level_bonus', 'event_reward', 'event_bonus',
                                                         'npc_gift', 'quest_reward', 'activity_reward', 'streak_reward', 'job_pay',
                                                         'start_grant', 'rent', 'work_pay', 'treasury_opening', 'hustle_pay', 'bonus',
                                                         'daily_gift', 'challenge_bonus', 'first_step', 'property_income', 'tutorial',
                                                         'online_pay', 'admin_credit')), 0),
    'online', coalesce(sum(amount) filter (where kind = 'online_pay'), 0),
    'burned', coalesce(sum(amount) filter (where kind = 'burn'), 0)
  )
  from public.ledger
  where created_at >= p_since
$$;

do $$
declare f text;
begin
  revoke all on table public.admin_credits from public, anon, authenticated;
  grant all on table public.admin_credits to service_role;
  grant usage, select on sequence public.admin_credits_id_seq to service_role;
  foreach f in array array['public.pack_had(uuid)', 'public.pack_status(uuid)', 'public.pack_adds(uuid, numeric)',
                           'public.pack_topup_start(uuid, text, text, text, numeric, bigint)', 'public.topup_paid(text, bigint)',
                           'public.admin_credit(uuid, numeric, text, text)', 'public.admin_find_player(text)', 'public.money_since(timestamptz)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 091_city_growth.sql
-- Newtown, part 91: the city grows with its players (docs/GROWTH.md).
--   1. Each city has a growth level from how many people live there (the steps are in
--      src/lib/world/growth.ts, GROWTH_STEPS). It only ever goes up. As it rises, buildings nobody
--      owns yet are rebuilt taller, and gated estates spread.
--   2. A sold-out block (every flat, office or shop in it owned, by more than one player) grows:
--      more storeys, and the new units go on sale. Units already owned keep their number and name.
--
-- Run it after 038 (property). Safe to run more than once.

-- ============================================================ 1. growth levels
create table if not exists public.city_growth (
  region text primary key check (region ~ '^[a-z0-9-]{2,30}$'),
  level int not null default 0 check (level between 0 and 20),
  lives int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.city_growth enable row level security;

/** A city's growth level now (counting who lives there), kept if higher than before; never lower. */
create or replace function public.city_growth_level(p_region text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_lives int;
  v_level int := 0;
  v_step int;
begin
  if p_region is null or p_region !~ '^[a-z0-9-]{2,30}$' then return 0; end if;
  select count(*) into v_lives from public.lives where region = p_region;
  -- The same steps as GROWTH_STEPS in src/lib/world/growth.ts.
  foreach v_step in array array[1000, 3000, 7500, 15000, 30000, 60000, 120000, 250000, 500000] loop
    if v_lives >= v_step then v_level := v_level + 1; end if;
  end loop;
  insert into public.city_growth (region, level, lives) values (p_region, v_level, v_lives)
    on conflict (region) do update set level = greatest(public.city_growth.level, excluded.level), lives = excluded.lives, updated_at = now();
  return (select level from public.city_growth where region = p_region);
end $$;

-- ============================================================ 2. sold-out blocks grow
/**
 * Grow a sold-out block: its snapshot becomes p_snapshot (worked out by the server: the same units,
 * then the new ones). Only when every unit it had (p_before of them) is owned, by two players or
 * more (one owner of a whole block keeps it as it is), and only once per step (nobody grew it meanwhile).
 */
create or replace function public.building_grow(p_building text, p_snapshot jsonb, p_before int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_snap jsonb;
  v_owned int;
  v_owners int;
begin
  select snapshot into v_snap from public.property_buildings where building_id = p_building for update;
  if not found or jsonb_array_length(v_snap->'units') <> p_before then return false; end if;
  if jsonb_array_length(p_snapshot->'units') <= p_before then return false; end if;
  select count(*), count(distinct owner_id) into v_owned, v_owners from public.property_units where building_id = p_building and owner_id is not null;
  if v_owned < p_before or v_owners < 2 then return false; end if;
  -- The units already there must stay exactly as they were (same order, same names).
  if exists (select 1 from generate_series(0, p_before - 1) k where (v_snap->'units'->k->>'label') is distinct from (p_snapshot->'units'->k->>'label')) then
    return false;
  end if;
  update public.property_buildings set snapshot = p_snapshot where building_id = p_building;
  return true;
end $$;

do $$
declare f text;
begin
  revoke all on table public.city_growth from public, anon, authenticated;
  grant all on table public.city_growth to service_role;
  foreach f in array array['public.city_growth_level(text)', 'public.building_grow(text, jsonb, int)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 092_monthly_leases.sql
-- Newtown, part 92: buildings are leased by the month (docs/BUSINESS.md).
--   - A lease is paid for 1, 3, 6 or 12 months up front (business_leases.months) and runs 30 days a
--     month; leases from before this part keep their year.
--   - "Another month" (an upgrade, business_upgrades.upgrade = 'month') adds 30 days and the taps
--     that month's money buys, any time while the lease is live.
--   - Billboard ads on their own are unchanged (weekly budget, 1 to 8 weeks: part 13).
--
-- Run it after 043 and 047. If you ever run 043 or 047 again, run this again after it.
-- Safe to run more than once.

alter table public.business_leases add column if not exists months int check (months is null or months between 1 and 12);

alter table public.business_upgrades drop constraint if exists business_upgrades_upgrade_check;
alter table public.business_upgrades add constraint business_upgrades_upgrade_check check (upgrade in ('bright', 'rebuild', 'storey', 'month'));

/** Start paying for an upgrade to a live lease (a storey only from a month in; another month any time). */
create or replace function public.business_upgrade_start(p_advertiser uuid, p_lease uuid, p_upgrade text, p_kind text, p_kobo bigint, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.business_leases;
begin
  select * into l from public.business_leases where id = p_lease and advertiser_id = p_advertiser;
  if not found or l.status <> 'live' then raise exception 'not_yours'; end if;
  if p_upgrade = 'storey' and l.starts_at > now() - interval '30 days' then raise exception 'too_soon'; end if;
  if p_upgrade = 'bright' and l.glow >= 2 then raise exception 'already'; end if;
  insert into public.business_upgrades (reference, lease_id, upgrade, kind, price_kobo) values (p_reference, p_lease, p_upgrade, p_kind, p_kobo);
end $$;

/** Paystack confirmed a payment: a lease goes live for its months (with the billboards and its taps), or an upgrade is applied. */
create or replace function public.business_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.business_leases;
  u public.business_upgrades;
begin
  select * into l from public.business_leases where reference = p_reference for update;
  if found then
    if l.status <> 'pending_payment' then return jsonb_build_object('found', true, 'new', false, 'id', l.id); end if;
    if coalesce(p_kobo, 0) < l.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
    if exists (select 1 from public.business_leases where building_id = l.building_id and status = 'live')
       or exists (select 1 from public.property_units where building_id = l.building_id) then
      return jsonb_build_object('found', true, 'new', false, 'clash', true, 'id', l.id);
    end if;
    update public.business_leases set status = 'live', starts_at = now(),
      ends_at = now() + case when l.months is null then interval '365 days' else make_interval(days => 30 * l.months) end,
      billboard = true, click_cap = public.lease_clicks(l.price_kobo) where id = l.id;
    return jsonb_build_object('found', true, 'new', true, 'id', l.id);
  end if;
  select * into u from public.business_upgrades where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if u.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'id', u.lease_id); end if;
  if coalesce(p_kobo, 0) < u.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  update public.business_upgrades set status = 'paid', paid_at = now() where reference = p_reference;
  update public.business_leases set
    glow = case when u.upgrade = 'bright' then 2 else glow end,
    kind = case when u.upgrade = 'rebuild' then u.kind else kind end,
    storeys = case when u.upgrade = 'storey' then coalesce(storeys, 1) + 1 else storeys end,
    -- Another month: 30 more days and that month's taps.
    ends_at = case when u.upgrade = 'month' then greatest(coalesce(ends_at, now()), now()) + interval '30 days' else ends_at end,
    click_cap = case when u.upgrade = 'month' then coalesce(click_cap, 0) + public.lease_clicks(u.price_kobo) else click_cap end,
    billboard = true
  where id = u.lease_id;
  return jsonb_build_object('found', true, 'new', true, 'id', u.lease_id, 'upgrade', u.upgrade);
end $$;

/** An account's leases with their numbers (and the months they were paid for). */
create or replace function public.business_mine(p_advertiser uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'building', l.building_id, 'name', l.name, 'category', l.category, 'about', l.about, 'address', l.address,
    'phone', l.phone, 'whatsapp', l.whatsapp, 'website', l.website, 'logo', l.logo_path, 'billboardImage', coalesce(l.billboard_path, l.logo_path),
    'status', l.status, 'glow', l.glow, 'kind', l.kind, 'storeys', l.storeys, 'billboard', l.billboard, 'startsAt', l.starts_at, 'endsAt', l.ends_at,
    'priceKobo', l.price_kobo, 'months', l.months, 'clickCap', l.click_cap, 'clicks', public.lease_taps(l.id),
    'hits', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id group by kind) s), '{}'::jsonb),
    'week', coalesce((select jsonb_object_agg(kind, total) from (select kind, sum(n) as total from public.business_hits h where h.lease_id = l.id and h.day > (now() at time zone 'Africa/Lagos')::date - 7 group by kind) s), '{}'::jsonb)
  ) order by l.created_at desc), '[]'::jsonb)
  from public.business_leases l where l.advertiser_id = p_advertiser and l.status <> 'pending_payment'
$$;

do $$
declare f text;
begin
  foreach f in array array['public.business_upgrade_start(uuid, uuid, text, text, bigint, text)', 'public.business_paid(text, bigint)', 'public.business_mine(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 093_engagement_rep.sql
-- Newtown, part 93: reputation from taking part (docs/REPUTATION.md). Quietly, on top of property,
-- things, map marks and challenges, reputation now grows with:
--   time   time actively spent in the game (the minutes part 73 already counts), up to 50
--   talk   real conversations: days you and someone messaged each other (both ways), up to 40
--   kind   gifts, hugs and handshakes given, and thanks for them, up to 30
--   people friends, reactions to what you say in the Town Hall, visitors signing your guestbook, up to 30
-- The rules keep it fair and hard to game:
--   - only the last 60 days count, and the older the less (worth half after about three weeks), so
--     reputation follows what you do now;
--   - every part has diminishing returns (square roots and logs): the hundredth hour adds far less
--     than the first, and talking to many people counts more than spamming one;
--   - a conversation only counts when the other person writes back; at most a few gifts and
--     greetings a day count;
--   - nothing is announced: it just shows in your reputation.
-- Worked out at most once an hour per player (kept in rep_engagement).
--
-- Run it after 073 (active time). Safe to run more than once.

create table if not exists public.rep_engagement (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  parts jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.rep_engagement enable row level security;

-- Looking up someone's recent private messages quickly.
create index if not exists chat_dm_sender_idx on public.chat_messages (sender_id, created_at desc) where recipient_id is not null;
create index if not exists chat_dm_recipient_idx on public.chat_messages (recipient_id, created_at desc) where recipient_id is not null;

/** How much a day `p_day` ago is worth now: 1 today, half after about three weeks. */
create or replace function public.rep_weight(p_at timestamptz) returns float8
language sql immutable as $$ select exp(-greatest(0, extract(epoch from (now() - p_at)) / 86400.0) / 30.0) $$;

/** The four parts of reputation from taking part, worked out now. */
create or replace function public.engagement_parts(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := now() - interval '60 days';
  v_time float8;
  v_talk float8;
  v_kind float8;
  v_friends int;
  v_reacts int;
  v_guests int;
begin
  -- Time: each active day counts by the square root of its minutes (up to 4 hours), weighted by how recent.
  select coalesce(sum(public.rep_weight(day::timestamptz) * sqrt(least(minutes, 240) / 15.0)), 0) into v_time
  from public.activity_days where user_id = p_user and day >= v_since::date;

  -- Talk: a day you and someone both wrote to each other is one exchange; per person, the square
  -- root of their (weighted) exchanges, so many real conversations beat one long one.
  with mine as (
    select recipient_id as other, created_at::date as d, max(created_at) as at from public.chat_messages
    where sender_id = p_user and recipient_id is not null and created_at >= v_since group by 1, 2
  ), theirs as (
    select sender_id as other, created_at::date as d from public.chat_messages
    where recipient_id = p_user and created_at >= v_since group by 1, 2
  ), per as (
    select m.other, sum(public.rep_weight(m.at)) as w from mine m join theirs t on t.other = m.other and t.d = m.d group by 1
  )
  select coalesce(sum(sqrt(w)), 0) into v_talk from per;

  -- Kindness: gifts given (at most 3 a day), hugs and handshakes given (at most 5 a day), and each one thanked.
  with gifts as (
    select created_at::date as d, least(count(*), 3) as n, max(created_at) as at from public.ledger
    where user_id = p_user and kind = 'gift_sent' and created_at >= v_since group by 1
  ), greets as (
    select created_at::date as d, least(count(*), 5) as n, least(count(thanked_at), 5) as thanked, max(created_at) as at from public.greetings
    where from_id = p_user and created_at >= v_since group by 1
  )
  select coalesce((select sum(public.rep_weight(at) * n * 1.0) from gifts), 0)
       + coalesce((select sum(public.rep_weight(at) * (n * 0.5 + thanked * 0.5)) from greets), 0)
    into v_kind;

  -- People: friends, people reacting to what you say in the Town Hall, and visitors signing your guestbook.
  select count(*) into v_friends from public.friendships where accepted_at is not null and (requester = p_user or addressee = p_user);
  select count(distinct r.user_id) into v_reacts from public.town_reactions r join public.chat_messages m on m.id = r.message_id
    where m.sender_id = p_user and r.user_id <> p_user and r.created_at >= v_since;
  select count(distinct author_id) into v_guests from public.home_guestbook where owner_id = p_user and author_id <> p_user and created_at >= v_since;

  return jsonb_build_object(
    'time', least(50, round(v_time * 0.8)),
    'talk', least(40, round(v_talk * 3)),
    'kind', least(30, round(sqrt(v_kind) * 4)),
    'people', least(30, least(v_friends, 10) * 2 + round(5 * ln(1 + v_reacts)) + round(3 * ln(1 + v_guests)))
  );
exception when undefined_table or undefined_column then
  -- A part of the game not set up yet: what can be counted is.
  return jsonb_build_object('time', least(50, round(coalesce(v_time, 0) * 0.8)), 'talk', least(40, round(coalesce(v_talk, 0) * 3)), 'kind', 0, 'people', 0);
end $$;

/** Your reputation from taking part: kept for an hour, then worked out again. */
create or replace function public.engagement_rep(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rep_engagement;
  v jsonb;
begin
  select * into r from public.rep_engagement where user_id = p_user;
  if found and r.computed_at > now() - interval '1 hour' then return r.parts; end if;
  v := public.engagement_parts(p_user);
  insert into public.rep_engagement (user_id, parts, computed_at) values (p_user, v, now())
    on conflict (user_id) do update set parts = excluded.parts, computed_at = excluded.computed_at;
  return v;
end $$;

do $$
declare f text;
begin
  revoke all on table public.rep_engagement from public, anon, authenticated;
  grant all on table public.rep_engagement to service_role;
  foreach f in array array['public.engagement_parts(uuid)', 'public.engagement_rep(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 094_lived_in_leases.sql
-- Newtown, part 94: a business can take a building people live in, without taking the homes away
-- (docs/BUSINESS.md).
--   - A residential building (one with homes: rooming houses, bungalows, duplexes, terraces, flats,
--     apartments, shops with flats) can be leased even when players own homes in it, and players can
--     still buy and live in its homes while the lease runs. So advertising never takes places to live
--     off the map.
--   - While a business leases it, nobody can rename the building (it carries the business's name).
--   - A building people live in can't be refitted into another kind, or have storeys added by the business.
--   Other buildings (offices, plazas, shops, towers, warehouses, land) stay as before: only ones nobody owns.
--
-- Run it after 043, 047 and 092. If you ever run 043, 047 or 092 again, run this again after it.
-- Safe to run more than once.

alter table public.business_leases add column if not exists residential boolean not null default false;

-- The lease start, with "is it residential" (worked out by the server from the building's homes).
drop function if exists public.business_lease_start(uuid, text, text, text, text, text, text, text, text, text, text, bigint, text);
create or replace function public.business_lease_start(
  p_advertiser uuid, p_building text, p_region text, p_name text, p_category text, p_about text, p_address text,
  p_phone text, p_whatsapp text, p_website text, p_logo text, p_kobo bigint, p_reference text, p_residential boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.business_tidy();
  if split_part(p_building, ':', 1) <> p_region then raise exception 'bad_building'; end if;
  if exists (select 1 from public.business_leases where building_id = p_building and status = 'live') then raise exception 'taken'; end if;
  if not coalesce(p_residential, false) and exists (select 1 from public.property_units where building_id = p_building) then raise exception 'owned'; end if;
  if exists (select 1 from public.business_leases where advertiser_id = p_advertiser and status = 'live') then raise exception 'one_only'; end if;
  if exists (select 1 from public.business_leases where advertiser_id = p_advertiser and status <> 'pending_payment' and created_at > now() - interval '7 days') then
    raise exception 'one_a_week';
  end if;
  insert into public.business_leases (advertiser_id, building_id, region, name, category, about, address, phone, whatsapp, website, logo_path, price_kobo, reference, residential)
    values (p_advertiser, p_building, p_region, p_name, p_category, p_about, p_address, nullif(p_phone, ''), nullif(p_whatsapp, ''), nullif(p_website, ''), p_logo, p_kobo, p_reference, coalesce(p_residential, false))
    returning id into v_id;
  return v_id;
end $$;

/** Paystack confirmed a payment: a lease goes live for its months (people's homes in a residential one stay theirs), or an upgrade is applied. */
create or replace function public.business_paid(p_reference text, p_kobo bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.business_leases;
  u public.business_upgrades;
begin
  select * into l from public.business_leases where reference = p_reference for update;
  if found then
    if l.status <> 'pending_payment' then return jsonb_build_object('found', true, 'new', false, 'id', l.id); end if;
    if coalesce(p_kobo, 0) < l.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
    if exists (select 1 from public.business_leases where building_id = l.building_id and status = 'live')
       or (not l.residential and exists (select 1 from public.property_units where building_id = l.building_id)) then
      return jsonb_build_object('found', true, 'new', false, 'clash', true, 'id', l.id);
    end if;
    update public.business_leases set status = 'live', starts_at = now(),
      ends_at = now() + case when l.months is null then interval '365 days' else make_interval(days => 30 * l.months) end,
      billboard = true, click_cap = public.lease_clicks(l.price_kobo) where id = l.id;
    return jsonb_build_object('found', true, 'new', true, 'id', l.id);
  end if;
  select * into u from public.business_upgrades where reference = p_reference for update;
  if not found then return jsonb_build_object('found', false); end if;
  if u.status = 'paid' then return jsonb_build_object('found', true, 'new', false, 'id', u.lease_id); end if;
  if coalesce(p_kobo, 0) < u.price_kobo then return jsonb_build_object('found', true, 'new', false, 'short', true); end if;
  update public.business_upgrades set status = 'paid', paid_at = now() where reference = p_reference;
  update public.business_leases set
    glow = case when u.upgrade = 'bright' then 2 else glow end,
    kind = case when u.upgrade = 'rebuild' then u.kind else kind end,
    storeys = case when u.upgrade = 'storey' then coalesce(storeys, 1) + 1 else storeys end,
    -- Another month: 30 more days and that month's taps.
    ends_at = case when u.upgrade = 'month' then greatest(coalesce(ends_at, now()), now()) + interval '30 days' else ends_at end,
    click_cap = case when u.upgrade = 'month' then coalesce(click_cap, 0) + public.lease_clicks(u.price_kobo) else click_cap end,
    billboard = true
  where id = u.lease_id;
  return jsonb_build_object('found', true, 'new', true, 'id', u.lease_id, 'upgrade', u.upgrade);
end $$;

/** Start paying for an upgrade to a live lease (no refit or storey on a building people live in). */
create or replace function public.business_upgrade_start(p_advertiser uuid, p_lease uuid, p_upgrade text, p_kind text, p_kobo bigint, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.business_leases;
begin
  select * into l from public.business_leases where id = p_lease and advertiser_id = p_advertiser;
  if not found or l.status <> 'live' then raise exception 'not_yours'; end if;
  if l.residential and p_upgrade in ('rebuild', 'storey') then raise exception 'lived_in'; end if;
  if p_upgrade = 'storey' and l.starts_at > now() - interval '30 days' then raise exception 'too_soon'; end if;
  if p_upgrade = 'bright' and l.glow >= 2 then raise exception 'already'; end if;
  insert into public.business_upgrades (reference, lease_id, upgrade, kind, price_kobo) values (p_reference, p_lease, p_upgrade, p_kind, p_kobo);
end $$;

/** Name a building you own all of: not while a business leases it (it carries the business's name). */
create or replace function public.property_rename(p_user uuid, p_building text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_units int;
  v_mine int;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if v_name is not null and (char_length(v_name) not between 2 and 40 or v_name !~ '^[[:alnum:] ''&.,()-]+$') then raise exception 'bad_name'; end if;
  if exists (select 1 from public.business_leases where building_id = p_building and status = 'live') then raise exception 'leased'; end if;
  select jsonb_array_length(snapshot -> 'units') into v_units from public.property_buildings where building_id = p_building;
  if v_units is null then raise exception 'not_yours'; end if;
  select count(*) into v_mine from public.property_units where building_id = p_building and owner_id = p_user;
  if v_mine < v_units then raise exception 'not_all_yours'; end if;
  update public.property_buildings set name = v_name where building_id = p_building;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.business_lease_start(uuid, text, text, text, text, text, text, text, text, text, text, bigint, text, boolean)',
    'public.business_paid(text, bigint)', 'public.business_upgrade_start(uuid, uuid, text, text, bigint, text)', 'public.property_rename(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ======================================================== 095_events.sql
-- Newtown, part 95: events on the map (docs/EVENTS.md). Anyone can host an event that others come
-- to: a party (street party, owambe, concert, rave, house party, drum circle) or a stage (a talk, a
-- class, a watch party, an open mic). The host picks where (the street they're on, or a landmark,
-- a restaurant, a park...), when (now, or up to a week ahead), how long, how many can come and a
-- ticket price (free, or any amount). People say they're going, get told when it starts, and come
-- in from a few minutes before. Ticket money is held until the event is over, then taxed like
-- everything else in the city: tickets include VAT (service_vat, 7.5%), and what's left is the
-- host's income, less income tax (work_income_tax, 7%); both go to the state treasuries. If the
-- host calls it off, everyone gets their ticket back (no tax).
-- Parties cost money to host: a permit (worked out by the server from the hours, the crowd size, the
-- kind of place and how dear the area is), paid to the state once the party has started; it comes
-- back if called off before it starts. Two street
-- parties can't be on the same stretch of road at the same time.
-- Hosting events people come to, and going to them, add to your reputation. The walkthrough's
-- third mission becomes "go to an event" (tutorial_check below replaces part 80's: if you ever run
-- part 80 again, run this part again after it).
--
-- Safe to run more than once. Run after part 94.

create table if not exists public.hosted_events (
  id bigserial primary key,
  host_id uuid not null references public.profiles (id) on delete cascade,
  region text not null check (region ~ '^[a-z0-9-]{2,30}$'),
  category text not null check (category in ('party', 'stage')),
  format text not null check (format ~ '^[a-z_]{2,20}$'),
  title text not null check (char_length(title) between 3 and 60),
  about text not null default '' check (char_length(about) <= 280),
  x int not null,
  z int not null,
  -- Where it is, in words ("Awolowo Road, Ikoyi", "Terra Kulture"), and whether it's on the street.
  place text not null default '' check (char_length(place) <= 80),
  on_street boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- The ticket (mint; 0 is free) and the most people who can come in (the host included).
  price numeric(14,2) not null default 0 check (price >= 0),
  capacity int not null default 300 check (capacity between 2 and 1000),
  -- Ticket money held until it's over.
  pool numeric(14,2) not null default 0,
  -- What hosting it cost (mint; parties).
  host_fee numeric(14,2) not null default 0,
  status text not null default 'on' check (status in ('on', 'cancelled', 'closed')),
  -- The people going were told it started; the host was paid (status 'closed').
  started_told boolean not null default false,
  paid_out numeric(14,2),
  -- What's on the stage now (slides or a video, src/lib/world/events.ts StageState).
  stage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint hosted_events_times check (ends_at >= starts_at)
);
-- Ending the moment it starts (the host ends it at once) is allowed (added after the first version).
alter table public.hosted_events drop constraint if exists hosted_events_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hosted_events_times') then
    alter table public.hosted_events add constraint hosted_events_times check (ends_at >= starts_at);
  end if;
end $$;
alter table public.hosted_events add column if not exists host_fee numeric(14,2) not null default 0;
create index if not exists hosted_events_region_idx on public.hosted_events (region, status, ends_at);
create index if not exists hosted_events_host_idx on public.hosted_events (host_id, created_at desc);

create table if not exists public.hosted_event_guests (
  event_id bigint not null references public.hosted_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  going boolean not null default true,
  going_at timestamptz not null default now(),
  -- Came in (the first time), and what their ticket cost.
  entered_at timestamptz,
  paid numeric(14,2) not null default 0,
  primary key (event_id, user_id)
);
create index if not exists hosted_event_guests_user_idx on public.hosted_event_guests (user_id, going_at desc);

/** A player who can take part: signed up, not a bot, not paused, with a life in the city. */
create or replace function public.event_player(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
end $$;

/** Your event that isn't over yet (coming up or on now), or null: one at a time. */
create or replace function public.event_hosting(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select id from public.hosted_events where host_id = p_user and status = 'on' and ends_at > now() order by starts_at limit 1
$$;

/**
 * Host an event. p_starts: when (now if it's in the past; at most 7 days ahead), p_minutes: how
 * long (15 to 240), p_price: the ticket in mint (0 free, at most p_price_max), p_capacity: the most
 * people (2 to 1000), p_fee: what hosting it costs (mint, paid now from Fun money then the wallet).
 * One event at a time, at most p_per_day a day. A party on the street can't be within p_gap tiles
 * of another street party on at the same time. Returns {id, starts_at, ends_at, fee}.
 */
drop function if exists public.event_open(uuid, text, text, text, text, text, int, int, text, boolean, timestamptz, int, numeric, numeric, int, int);
create or replace function public.event_open(p_user uuid, p_region text, p_category text, p_format text, p_title text, p_about text,
  p_x int, p_z int, p_place text, p_on_street boolean, p_starts timestamptz, p_minutes int, p_price numeric, p_price_max numeric,
  p_capacity int, p_per_day int default 3, p_fee numeric default 0, p_gap int default 16)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_starts timestamptz := greatest(now(), coalesce(p_starts, now()));
  v_minutes int := coalesce(p_minutes, 0);
  v_price numeric := round(coalesce(p_price, 0), 2);
  v_fee numeric := round(greatest(0, coalesce(p_fee, 0)), 2);
  v_id bigint;
  v_ends timestamptz;
begin
  perform public.event_player(p_user);
  if p_category not in ('party', 'stage') or coalesce(p_format, '') !~ '^[a-z_]{2,20}$' then raise exception 'bad_kind'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 60 then raise exception 'bad_title'; end if;
  if v_starts > now() + interval '7 days 5 minutes' then raise exception 'too_far'; end if;
  if v_minutes < 15 or v_minutes > 240 then raise exception 'bad_length'; end if;
  if v_price < 0 or v_price > greatest(0, coalesce(p_price_max, 0)) then raise exception 'bad_price'; end if;
  if coalesce(p_capacity, 0) < 2 or p_capacity > 1000 then raise exception 'bad_capacity'; end if;
  if public.event_hosting(p_user) is not null then raise exception 'busy'; end if;
  if (select count(*) from public.hosted_events where host_id = p_user and created_at > now() - interval '24 hours') >= greatest(1, coalesce(p_per_day, 3)) then
    raise exception 'too_many';
  end if;
  v_ends := v_starts + make_interval(mins => v_minutes);
  -- Street parties take the road: none on the same stretch at the same time.
  if p_category = 'party' and coalesce(p_on_street, false) and exists (
    select 1 from public.hosted_events e
    where e.region = p_region and e.category = 'party' and e.on_street and e.status = 'on'
      and e.starts_at < v_ends and v_starts < e.ends_at
      and sqrt(power(e.x - p_x, 2) + power(e.z - p_z, 2)) < greatest(1, coalesce(p_gap, 16))) then
    raise exception 'street_taken';
  end if;
  if v_fee > 0 then
    if public.life_can_spend(p_user, array['fun']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    perform public.life_spend(p_user, array['fun'], v_fee);
  end if;
  insert into public.hosted_events (host_id, region, category, format, title, about, x, z, place, on_street, starts_at, ends_at, price, capacity, host_fee)
    values (p_user, p_region, p_category, p_format, v_title, left(coalesce(p_about, ''), 280), p_x, p_z, left(coalesce(p_place, ''), 80),
            coalesce(p_on_street, false), v_starts, v_ends, v_price, p_capacity, v_fee)
    returning id into v_id;
  if v_fee > 0 then
    -- Held until it's over (or called off before it starts, when it comes back).
    perform public.log_coins(p_user, null, 'event_hosting', -v_fee, false, 'Hosting: ' || v_title);
  end if;
  insert into public.hosted_event_guests (event_id, user_id, going) values (v_id, p_user, true);
  return jsonb_build_object('id', v_id, 'starts_at', v_starts, 'ends_at', v_ends, 'fee', v_fee);
end $$;

/** Say you're going (or not any more). Returns {going, count}: how many are going now. */
create or replace function public.event_rsvp(p_user uuid, p_id bigint, p_going boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  v_count int;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  if e.host_id = p_user then raise exception 'host'; end if;
  if coalesce(p_going, true) then
    perform public.event_player(p_user);
    if not exists (select 1 from public.hosted_event_guests where event_id = p_id and user_id = p_user and going)
       and (select count(*) from public.hosted_event_guests where event_id = p_id and going) >= e.capacity then
      raise exception 'full';
    end if;
    insert into public.hosted_event_guests (event_id, user_id, going) values (p_id, p_user, true)
      on conflict (event_id, user_id) do update set going = true, going_at = case when hosted_event_guests.going then hosted_event_guests.going_at else now() end;
  else
    update public.hosted_event_guests set going = false where event_id = p_id and user_id = p_user;
  end if;
  select count(*) into v_count from public.hosted_event_guests where event_id = p_id and going;
  return jsonb_build_object('going', coalesce(p_going, true), 'count', v_count);
end $$;

/**
 * Come in: from p_early minutes before it starts (the host any time) until it ends. The ticket is
 * paid the first time (it's yours for the whole event: come and go as you like). Returns {paid, already}.
 */
create or replace function public.event_enter(p_user uuid, p_id bigint, p_early int default 5) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  g public.hosted_event_guests;
begin
  perform public.event_player(p_user);
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.status = 'cancelled' then raise exception 'cancelled'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  select * into g from public.hosted_event_guests where event_id = p_id and user_id = p_user for update;
  if found and g.entered_at is not null then
    update public.hosted_event_guests set going = true where event_id = p_id and user_id = p_user;
    return jsonb_build_object('paid', 0, 'already', true);
  end if;
  if e.host_id <> p_user and now() < e.starts_at - make_interval(mins => greatest(0, least(60, coalesce(p_early, 5)))) then
    raise exception 'not_yet';
  end if;
  if e.host_id <> p_user and (select count(*) from public.hosted_event_guests where event_id = p_id and entered_at is not null) >= e.capacity then
    raise exception 'full';
  end if;
  if e.host_id <> p_user and e.price > 0 then
    if public.life_can_spend(p_user, array['fun']) < e.price then raise exception 'not_enough:%', trim_scale(e.price); end if;
    perform public.life_spend(p_user, array['fun'], e.price);
    perform public.log_coins(p_user, null, 'event_ticket', -e.price, false, 'Event ticket: ' || e.title);
    update public.hosted_events set pool = pool + e.price where id = p_id;
  end if;
  insert into public.hosted_event_guests (event_id, user_id, going, entered_at, paid)
    values (p_id, p_user, true, now(), case when e.host_id = p_user then 0 else e.price end)
    on conflict (event_id, user_id) do update set going = true, entered_at = now(), paid = excluded.paid;
  return jsonb_build_object('paid', case when e.host_id = p_user then 0 else e.price end, 'already', false);
end $$;

/**
 * Over: pay the host their share of the ticket money (the rest is the city's) and tell them how it
 * went. Safe to call by anyone, any number of times; nothing happens before it ends.
 */
create or replace function public.event_settle(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  v_vat numeric;
  v_gross numeric;
  v_tax numeric;
  v_share numeric;
  v_came int;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then return 'gone'; end if;
  if e.status <> 'on' then return e.status; end if;
  if e.ends_at > now() then return 'on'; end if;
  -- Tickets include VAT; the rest is the host's income, taxed at source like pay.
  v_vat := round(e.pool * public.setting('service_vat') / (1 + public.setting('service_vat')), 2);
  v_gross := e.pool - v_vat;
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  v_share := v_gross - v_tax;
  if v_vat > 0 then perform public.pay_tax(e.region, v_vat, 'vat', 'VAT on event tickets: ' || left(e.title, 40)); end if;
  if v_gross > 0 then
    update public.profiles set coins = coins + v_share where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_tickets', v_gross, false, 'Tickets: ' || e.title);
    if v_tax > 0 then
      perform public.log_coins(e.host_id, null, 'income_tax', -v_tax, false, 'Income tax on tickets');
      perform public.pay_tax(e.region, v_tax, 'income_tax', 'Income tax on event tickets');
    end if;
  end if;
  -- The permit to host it (parties): the state's now.
  if e.host_fee > 0 then perform public.pay_tax(e.region, e.host_fee, 'event_permit', 'Event permit: ' || left(e.title, 40)); end if;
  select count(*) into v_came from public.hosted_event_guests where event_id = p_id and entered_at is not null and user_id <> e.host_id;
  update public.hosted_events set status = 'closed', paid_out = v_share where id = p_id;
  perform public.notify(e.host_id, null, 'event',
    format('"%s" is over. %s came%s. Thanks for hosting!', e.title, case when v_came = 1 then '1 person' else v_came || ' people' end,
           case when v_share > 0 then format(' and ₥%s of tickets is yours (after VAT and income tax)', trim_scale(v_share)) else '' end));
  return 'closed';
end $$;

/** The host calls it off (before or while it's on): everyone's ticket back, and the people going are told. */
create or replace function public.event_cancel(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  r record;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.host_id <> p_user then raise exception 'not_host'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  for r in select user_id, paid from public.hosted_event_guests where event_id = p_id and paid > 0 loop
    update public.profiles set coins = coins + r.paid where id = r.user_id;
    perform public.log_coins(r.user_id, null, 'event_refund', r.paid, false, 'Event called off: ' || e.title);
  end loop;
  update public.hosted_event_guests set paid = 0 where event_id = p_id;
  -- The hosting fee: back if it's called off before it starts; spent once it has started.
  if e.host_fee > 0 and now() < e.starts_at then
    update public.profiles set coins = coins + e.host_fee where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_hosting_back', e.host_fee, false, 'Hosting fee back: ' || e.title);
  elsif e.host_fee > 0 then
    perform public.pay_tax(e.region, e.host_fee, 'event_permit', 'Event permit: ' || left(e.title, 40));
  end if;
  update public.hosted_events set status = 'cancelled', pool = 0, ends_at = least(ends_at, greatest(now(), starts_at + interval '1 second')) where id = p_id;
  for r in select user_id from public.hosted_event_guests where event_id = p_id and going and user_id <> p_user loop
    perform public.notify(r.user_id, null, 'event', format('"%s" was called off by the host.%s', e.title, case when e.price > 0 then ' Any ticket you bought is back.' else '' end));
  end loop;
  return 'cancelled';
end $$;

/** The host ends it now (it's settled at once). */
create or replace function public.event_end(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare e public.hosted_events;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.host_id <> p_user then raise exception 'not_host'; end if;
  if e.status <> 'on' then return e.status; end if;
  if e.starts_at > now() then raise exception 'not_started'; end if;
  update public.hosted_events set ends_at = now() where id = p_id and ends_at > now();
  return public.event_settle(p_id);
end $$;

/**
 * Keep a region's events moving: tell the people going when one starts (returns who was told, for
 * a push), and settle the ones that are over.
 */
create or replace function public.event_sweep(p_region text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  g record;
  v_told uuid[] := '{}';
begin
  for r in select id, title, host_id, place from public.hosted_events
           where region = p_region and status = 'on' and not started_told and starts_at <= now() and ends_at > now()
           order by starts_at limit 20 for update skip locked loop
    update public.hosted_events set started_told = true where id = r.id;
    for g in select user_id from public.hosted_event_guests where event_id = r.id and going and user_id <> r.host_id limit 300 loop
      perform public.notify(g.user_id, null, 'event', format('"%s" has started%s! Tap Events to go in.', r.title, case when r.place <> '' then ' at ' || r.place else '' end));
      v_told := v_told || g.user_id;
    end loop;
  end loop;
  for r in select id from public.hosted_events where region = p_region and status = 'on' and ends_at <= now() order by ends_at limit 20 loop
    perform public.event_settle(r.id);
  end loop;
  return to_jsonb(v_told);
end $$;

/** The host sets what's on the stage (slides or a video; kept small). */
create or replace function public.event_stage(p_user uuid, p_id bigint, p_stage jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e public.hosted_events;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.host_id <> p_user then raise exception 'not_host'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  if jsonb_typeof(coalesce(p_stage, 'null'::jsonb)) <> 'object' or octet_length(p_stage::text) > 8000 then raise exception 'bad_stage'; end if;
  update public.hosted_events set stage = p_stage where id = p_id;
end $$;

/** For reputation: events you hosted that 3+ people came to, and events of others you went to. */
create or replace function public.event_rep(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hosted', (select count(*) from public.hosted_events e where e.host_id = p_user and e.status = 'closed'
               and (select count(*) from public.hosted_event_guests g where g.event_id = e.id and g.entered_at is not null and g.user_id <> p_user) >= 3),
    'attended', (select count(*) from public.hosted_event_guests g join public.hosted_events e on e.id = g.event_id
                 where g.user_id = p_user and g.entered_at is not null and e.host_id <> p_user and e.status <> 'cancelled'))
$$;

-- ============================================================ Finance: ticket sales are earnings
/** (Part 95: ticket sales from events you hosted count as earnings too.) Everything you've earned (ever, and in the last p_days days), and the latest payments in. */
create or replace function public.life_earnings(p_user uuid, p_days int, p_limit int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  with earned as (
    select id, kind, amount, note, created_at from public.ledger
    where user_id = p_user and amount > 0
      and kind in ('work_pay', 'public_pay', 'hustle_pay', 'bonus', 'rent', 'item_sale', 'car_sale', 'service_pay', 'event_tickets')
  ),
  taxed as (
    select amount, created_at from public.ledger where user_id = p_user and kind in ('income_tax', 'rent_tax') and amount < 0
  )
  select jsonb_build_object(
    'total', coalesce((select round(sum(amount), 2) from earned), 0),
    'tax', coalesce((select round(-sum(amount), 2) from taxed), 0),
    'period', coalesce((select round(sum(amount), 2) from earned where created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 3650))), 0),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', round(e.amount, 2), 'note', e.note, 'at', e.created_at) order by e.created_at desc, e.id desc)
      from (select * from earned where created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 3650))
            order by created_at desc, id desc limit least(greatest(coalesce(p_limit, 100), 1), 300)) e), '[]'::jsonb)
  )
$$;

-- ============================================================ the walkthrough's third mission
/**
 * Which steps are done, paying each newly done one once. p_rewards: { name, hi, win } in mint. Since part 95,
 * "win" (the third mission) is going to an event (or hosting one), no longer winning a challenge.
 * Starts the walkthrough's clock the first time it's asked. Returns
 * { name, hi, win, paid: [...], rewards: { name, hi, win } }.
 */
create or replace function public.tutorial_check(p_user uuid, p_rewards jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.lives;
  v_since timestamptz;
  v_done jsonb;
  v_paid text[] := '{}';
  v_step text;
  v_reward numeric;
begin
  select * into l from public.lives where user_id = p_user for update;
  if not found then return null; end if;
  v_since := coalesce(l.tutorial_at, now());
  if l.tutorial_at is null then update public.lives set tutorial_at = v_since where user_id = p_user; end if;
  v_done := jsonb_build_object(
    'name', l.home_named_at is not null and l.home_named_at >= v_since,
    'hi', exists (select 1 from public.chat_messages where sender_id = p_user and recipient_id is not null and created_at >= v_since),
    -- Mission 3 (still called 'win'): go into an event, or host one and go into your own.
    'win', exists (
      select 1 from public.hosted_event_guests g join public.hosted_events e on e.id = g.event_id
      where g.user_id = p_user and g.entered_at is not null and g.entered_at >= v_since and e.status <> 'cancelled')
  );
  foreach v_step in array array['name', 'hi', 'win'] loop
    if (v_done ->> v_step)::boolean then
      v_reward := round(least(greatest(coalesce((p_rewards ->> v_step)::numeric, 0), 0), 40), 2);
      insert into public.tutorial_steps (user_id, step, reward) values (p_user, v_step, v_reward) on conflict do nothing;
      if found then
        v_paid := v_paid || v_step;
        if v_reward > 0 then
          update public.profiles set coins = coins + v_reward where id = p_user;
          perform public.log_coins(p_user, null, 'tutorial', v_reward, false, 'Walkthrough reward: ' || v_step);
        end if;
      end if;
    end if;
  end loop;
  -- Done once counts for good (even if, say, the home is renamed back later).
  return jsonb_build_object(
    'name', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'name'),
    'hi', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'hi'),
    'win', exists (select 1 from public.tutorial_steps where user_id = p_user and step = 'win'),
    'paid', to_jsonb(v_paid)
  );
end $$;

do $$
declare f text;
begin
  revoke all on table public.hosted_events, public.hosted_event_guests from public, anon, authenticated;
  grant all on table public.hosted_events, public.hosted_event_guests to service_role;
  revoke all on sequence public.hosted_events_id_seq from public, anon, authenticated;
  grant all on sequence public.hosted_events_id_seq to service_role;
  foreach f in array array['public.event_player(uuid)', 'public.event_hosting(uuid)',
    'public.event_open(uuid, text, text, text, text, text, int, int, text, boolean, timestamptz, int, numeric, numeric, int, int, numeric, int)',
    'public.event_rsvp(uuid, bigint, boolean)', 'public.event_enter(uuid, bigint, int)', 'public.event_settle(bigint)',
    'public.event_cancel(uuid, bigint)', 'public.event_end(uuid, bigint)', 'public.event_sweep(text)',
    'public.event_stage(uuid, bigint, jsonb)', 'public.event_rep(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- Slides for talks (public pictures, uploaded by the server only).
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('events', 'events', true, 600000, array['image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- ======================================================== 096_event_refund.sql
-- Newtown, part 96: a party that hardly anyone came to costs the host nothing (docs/EVENTS.md).
-- When an event ends and fewer than event_min_guests people came in (10; the host doesn't count),
-- the hosting fee goes back to the host instead of to the state as the permit, and the notice
-- says so. Ticket money is settled as before (VAT and income tax on what was sold). Called off
-- after it started with fewer than that in: the fee comes back too.
--
-- Safe to run more than once. Run after part 95.

insert into public.game_settings (key, value, note) values
  ('event_min_guests', 10, 'Fewer people than this came to an event: its hosting fee goes back to the host')
-- Running this again sets it back to the number here.
on conflict (key) do update set value = excluded.value, note = excluded.note;

create or replace function public.event_settle(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  v_vat numeric;
  v_gross numeric;
  v_tax numeric;
  v_share numeric;
  v_came int;
  v_back boolean;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then return 'gone'; end if;
  if e.status <> 'on' then return e.status; end if;
  if e.ends_at > now() then return 'on'; end if;
  -- Tickets include VAT; the rest is the host's income, taxed at source like pay.
  v_vat := round(e.pool * public.setting('service_vat') / (1 + public.setting('service_vat')), 2);
  v_gross := e.pool - v_vat;
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  v_share := v_gross - v_tax;
  if v_vat > 0 then perform public.pay_tax(e.region, v_vat, 'vat', 'VAT on event tickets: ' || left(e.title, 40)); end if;
  if v_gross > 0 then
    update public.profiles set coins = coins + v_share where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_tickets', v_gross, false, 'Tickets: ' || e.title);
    if v_tax > 0 then
      perform public.log_coins(e.host_id, null, 'income_tax', -v_tax, false, 'Income tax on tickets');
      perform public.pay_tax(e.region, v_tax, 'income_tax', 'Income tax on event tickets');
    end if;
  end if;
  select count(*) into v_came from public.hosted_event_guests where event_id = p_id and entered_at is not null and user_id <> e.host_id;
  -- The permit to host it (parties): the state's, unless fewer than event_min_guests came, when
  -- it all goes back to the host.
  v_back := e.host_fee > 0 and v_came < coalesce(public.setting('event_min_guests'), 10);
  if v_back then
    update public.profiles set coins = coins + e.host_fee where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_hosting_back', e.host_fee, false, 'Hosting fee back (under ' || coalesce(public.setting('event_min_guests'), 10) || ' came): ' || e.title);
  elsif e.host_fee > 0 then
    perform public.pay_tax(e.region, e.host_fee, 'event_permit', 'Event permit: ' || left(e.title, 40));
  end if;
  update public.hosted_events set status = 'closed', paid_out = v_share where id = p_id;
  perform public.notify(e.host_id, null, 'event',
    format('"%s" is over. %s came%s.%s Thanks for hosting!', e.title, case when v_came = 1 then '1 person' else v_came || ' people' end,
           case when v_share > 0 then format(' and ₥%s of tickets is yours (after VAT and income tax)', trim_scale(v_share)) else '' end,
           case when v_back then format(' Fewer than %s came, so your ₥%s hosting fee is back.', coalesce(public.setting('event_min_guests'), 10), trim_scale(e.host_fee)) else '' end));
  return 'closed';
end $$;

/**
 * The host calls it off (before or while it's on): everyone's ticket back, and the people going
 * are told. The hosting fee comes back if it hadn't started, or if fewer than event_min_guests
 * had come in; otherwise it's the state's.
 */
create or replace function public.event_cancel(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  r record;
  v_came int;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.host_id <> p_user then raise exception 'not_host'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  for r in select user_id, paid from public.hosted_event_guests where event_id = p_id and paid > 0 loop
    update public.profiles set coins = coins + r.paid where id = r.user_id;
    perform public.log_coins(r.user_id, null, 'event_refund', r.paid, false, 'Event called off: ' || e.title);
  end loop;
  update public.hosted_event_guests set paid = 0 where event_id = p_id;
  select count(*) into v_came from public.hosted_event_guests where event_id = p_id and entered_at is not null and user_id <> e.host_id;
  if e.host_fee > 0 and (now() < e.starts_at or v_came < coalesce(public.setting('event_min_guests'), 10)) then
    update public.profiles set coins = coins + e.host_fee where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_hosting_back', e.host_fee, false, 'Hosting fee back: ' || e.title);
  elsif e.host_fee > 0 then
    perform public.pay_tax(e.region, e.host_fee, 'event_permit', 'Event permit: ' || left(e.title, 40));
  end if;
  update public.hosted_events set status = 'cancelled', pool = 0, ends_at = least(ends_at, greatest(now(), starts_at + interval '1 second')) where id = p_id;
  for r in select user_id from public.hosted_event_guests where event_id = p_id and going and user_id <> p_user loop
    perform public.notify(r.user_id, null, 'event', format('"%s" was called off by the host.%s', e.title, case when e.price > 0 then ' Any ticket you bought is back.' else '' end));
  end loop;
  return 'cancelled';
end $$;

