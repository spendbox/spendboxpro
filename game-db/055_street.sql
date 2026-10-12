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
