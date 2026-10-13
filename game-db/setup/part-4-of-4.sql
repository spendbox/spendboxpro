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
-- challenge (start or join one), and pick your home. The game checks each really happened before
-- paying, and only new players (a life started in the last 3 days) are paid. Before this is run
-- the guide still shows; the rewards wait until it is.
--
-- Safe to run more than once.

create table if not exists public.first_steps (
  user_id uuid not null references public.profiles (id) on delete cascade,
  step text not null check (step in ('hi', 'challenge', 'home')),
  reward numeric(14,2) not null default 0,
  done_at timestamptz not null default now(),
  primary key (user_id, step)
);
alter table public.first_steps enable row level security;

/**
 * Which first steps are done (each checked against what really happened), paying the reward for any
 * newly done. p_reward is mint per step (the server works it out from the city's prices).
 * Returns { hi, challenge, home: done?, paid: [steps paid just now], reward }.
 */
create or replace function public.first_steps_check(p_user uuid, p_reward numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hi boolean;
  v_ch boolean;
  v_home boolean;
  v_paid text[] := '{}';
  v_step text;
  v_reward numeric := round(least(greatest(coalesce(p_reward, 0), 0), 500), 2);
  v_new boolean;
begin
  -- Only new lives (started in the last 3 days) are paid: players who were here before don't get
  -- paid for what they did long ago.
  v_new := exists (select 1 from public.lives where user_id = p_user and started_at > now() - interval '3 days');
  if not v_new then v_reward := 0; end if;
  v_hi := exists (select 1 from public.chat_messages where sender_id = p_user and recipient_id is not null);
  v_ch := to_regclass('public.challenge_players') is not null
    and exists (select 1 from public.challenge_players where user_id = p_user);
  v_home := exists (select 1 from public.lives where user_id = p_user and home_unit is not null);
  foreach v_step in array array['hi', 'challenge', 'home'] loop
    if (v_step = 'hi' and v_hi) or (v_step = 'challenge' and v_ch) or (v_step = 'home' and v_home) then
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
  return jsonb_build_object('hi', v_hi, 'challenge', v_ch, 'home', v_home, 'paid', to_jsonb(v_paid), 'reward', v_reward);
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
  ('daily_gift_max',        5000, 'Most mint one daily gift can be (the server works the amount out; this is the ceiling)'),
  ('challenge_bonus',       100,  'Mint Newtown adds for each challenge won (on top of the pot): ₦150,000 in Lagos'),
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
  v_amount numeric := round(least(greatest(coalesce(p_amount, 0), 0), coalesce(public.setting('daily_gift_max'), 5000)), 2);
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

-- ======================================================== 074_price_level.sql
-- Newtown, part 74: prices follow the money (docs/MONEY.md, "Prices"). Money in the game comes big
-- now (a daily gift of ₦400k–6.4m, challenge stakes up to ₦5m), so everyday things cost ten times
-- their real Lagos price (rides, trip fares, club entry, pranks, fines, bribes) and things you own
-- three times (shop items, cars, homes). The prices themselves are worked out in the game's code
-- (src/lib/world/price-level.ts); this raises the database's sanity limits to let them through,
-- and starts new lives with three times the money, so a first home is still within reach.
-- Also run part 67 again (club entry's own limit).
--
-- Safe to run more than once.

update public.game_settings set value = 19500, note = 'Mint to start a life on the real map with (once): ₦29.25m in Lagos'
  where key = 'start_grant';
update public.game_settings set value = greatest(value, 1500) where key = 'ride_fare_max';
update public.game_settings set value = greatest(value, 1000) where key = 'trip_fare_max';
update public.game_settings set value = greatest(value, 300) where key = 'work_fare_max';
update public.game_settings set value = greatest(value, 1000000) where key = 'item_price_max';

