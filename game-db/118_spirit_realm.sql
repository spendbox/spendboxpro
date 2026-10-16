-- Newtown, part 118: the Spirit Realm (docs/REALM.md). A battle at the top of every hour: players
-- buy fighters (soldiers, ghosts, angels, devils...), weapons and armour for the next one, pick the
-- gate they start from, and at the hour everyone enters the realm and fights. What they spend goes
-- into their arena's pool (up to 30 armies an arena; more players, more arenas at once). The winner
-- of each arena takes 85% of its pool; the rest goes to the city. Nothing that happens in the
-- realm touches anyone's life in the city (health, things, reputation): only the money spent.
--
-- The battle itself is worked out by the game's server (src/lib/realm/battle.ts), the same way
-- every phone plays it; it hands the result to realm_settle, which pays out once.
--
-- Safe to run more than once. Run after part 117.

create table if not exists public.realm_battles (
  at timestamptz primary key check (date_trunc('hour', at) = at),
  seed int not null,
  -- How many armies have joined (each one's place in the queue, for its arena).
  joined int not null default 0,
  status text not null default 'open' check (status in ('open', 'settled')),
  settled_at timestamptz
);

create table if not exists public.realm_armies (
  at timestamptz not null references public.realm_battles (at) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The name shown over the army (the player's name when they joined).
  name text not null,
  seq int not null,
  arena int not null,
  gate int not null check (gate between 0 and 11),
  fighters jsonb not null,
  weapons int not null default 0 check (weapons between 0 and 3),
  armour int not null default 0 check (armour between 0 and 3),
  spent numeric(14,2) not null default 0 check (spent >= 0),
  rank int,
  prize numeric(14,2),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (at, user_id)
);
create index if not exists realm_armies_arena_idx on public.realm_armies (at, arena, seq);
create index if not exists realm_armies_user_idx on public.realm_armies (user_id, at desc);

/**
 * Join the battle at p_at (or change your army for it before it starts). p_cost: what the army
 * costs (the game's server works it out from the price list in src/lib/realm/fighters.ts). Pays
 * the difference from Fun money then the wallet, or gives it back if the new army costs less.
 */
create or replace function public.realm_enlist(p_user uuid, p_at timestamptz, p_gate int, p_fighters jsonb, p_weapons int, p_armour int, p_cost numeric, p_arena_size int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  b public.realm_battles;
  old public.realm_armies;
  v_cost numeric := round(greatest(0, coalesce(p_cost, 0)), 2);
  v_diff numeric;
  v_seq int;
  v_arena int;
begin
  if p_at is null or date_trunc('hour', p_at) <> p_at then raise exception 'bad_time'; end if;
  if p_at <= now() then raise exception 'started'; end if;
  if p_at > now() + interval '1 hour' then raise exception 'too_soon'; end if;
  if p_gate is null or p_gate < 0 or p_gate > 11 then raise exception 'bad_gate'; end if;
  if v_cost <= 0 or v_cost > 3000 then raise exception 'bad_army'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;

  insert into public.realm_battles (at, seed) values (p_at, floor(random() * 2000000000)::int) on conflict (at) do nothing;
  select * into b from public.realm_battles where at = p_at for update;
  select * into old from public.realm_armies where at = p_at and user_id = p_user for update;
  v_diff := v_cost - coalesce(old.spent, 0);

  if v_diff > 0 then
    if public.life_can_spend(p_user, array['fun']) < v_diff then raise exception 'not_enough:%', trim_scale(v_diff); end if;
    perform public.life_spend(p_user, array['fun'], v_diff);
    perform public.log_coins(p_user, null, 'realm_army', -v_diff, false, 'Spirit Realm army');
  elsif v_diff < 0 then
    update public.profiles set coins = coins - v_diff where id = p_user;
    perform public.log_coins(p_user, null, 'realm_refund', -v_diff, false, 'Spirit Realm army made smaller');
  end if;

  if old.user_id is null then
    v_seq := b.joined;
    -- The first arena with room (someone who left frees their seat), else a new one.
    select arena into v_arena from public.realm_armies where at = p_at group by arena
      having count(*) < greatest(2, coalesce(p_arena_size, 30)) order by arena limit 1;
    if v_arena is null then
      select coalesce(max(arena) + 1, 0) into v_arena from public.realm_armies where at = p_at;
    end if;
    update public.realm_battles set joined = joined + 1 where at = p_at;
    insert into public.realm_armies (at, user_id, name, seq, arena, gate, fighters, weapons, armour, spent)
      values (p_at, p_user, coalesce(nullif(p.username, ''), 'Player'), v_seq, v_arena, p_gate, p_fighters, p_weapons, p_armour, v_cost);
  else
    v_seq := old.seq;
    v_arena := old.arena;
    update public.realm_armies set gate = p_gate, fighters = p_fighters, weapons = p_weapons, armour = p_armour, spent = v_cost, updated_at = now()
      where at = p_at and user_id = p_user;
  end if;
  return jsonb_build_object('at', p_at, 'arena', v_arena, 'seq', v_seq, 'spent', v_cost, 'paid', v_diff);
end $$;

/** Leave the battle before it starts: everything spent on the army comes back. */
create or replace function public.realm_leave(p_user uuid, p_at timestamptz) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  old public.realm_armies;
begin
  if p_at <= now() then raise exception 'started'; end if;
  perform 1 from public.realm_battles where at = p_at for update;
  select * into old from public.realm_armies where at = p_at and user_id = p_user for update;
  if not found then return 0; end if;
  if old.spent > 0 then
    update public.profiles set coins = coins + old.spent where id = p_user;
    perform public.log_coins(p_user, null, 'realm_refund', old.spent, false, 'Left the Spirit Realm');
  end if;
  delete from public.realm_armies where at = p_at and user_id = p_user;
  return old.spent;
end $$;

/**
 * Pay out the battle at p_at, once (any later call just says it's done). p_results: each arena's
 * armies from first to last, as worked out by the battle: [{"arena": 0, "ranks": [user ids...]}].
 * An arena with one army (nobody to fight) gives its money back; so does any arena left out.
 */
create or replace function public.realm_settle(p_at timestamptz, p_results jsonb, p_share numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.realm_battles;
  r record;
  a record;
  v_ranks jsonb;
  v_pool numeric;
  v_n int;
  v_winner uuid;
  v_prize numeric;
  v_paid numeric := 0;
  v_arenas int := 0;
  v_share numeric := least(1, greatest(0, coalesce(p_share, 0.85)));
  v_hour text := to_char(p_at at time zone 'UTC', 'HH24:MI') || ' UTC';
begin
  select * into b from public.realm_battles where at = p_at for update;
  if not found then return jsonb_build_object('status', 'none'); end if;
  if b.status = 'settled' then return jsonb_build_object('status', 'settled', 'already', true); end if;
  if now() < p_at then raise exception 'not_yet'; end if;

  for r in select arena, count(*)::int as n, sum(spent) as pool from public.realm_armies where at = p_at group by arena order by arena loop
    v_arenas := v_arenas + 1;
    select e -> 'ranks' into v_ranks from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) e where (e ->> 'arena')::int = r.arena limit 1;
    v_pool := coalesce(r.pool, 0);
    v_n := r.n;
    -- Each army's place: where it is in the list (armies missing from it come last, in join order).
    update public.realm_armies ra set rank = coalesce(
        (select o.i::int from jsonb_array_elements_text(coalesce(v_ranks, '[]'::jsonb)) with ordinality o(uid, i) where o.uid = ra.user_id::text limit 1),
        v_n + 1 + ra.seq)
      where ra.at = p_at and ra.arena = r.arena;
    select user_id into v_winner from public.realm_armies where at = p_at and arena = r.arena order by rank, seq limit 1;
    if v_n < 2 or v_ranks is null then
      -- Nobody to fight (or no result for this arena): the money back.
      for a in select user_id, spent from public.realm_armies where at = p_at and arena = r.arena loop
        if a.spent > 0 then
          update public.profiles set coins = coins + a.spent where id = a.user_id;
          perform public.log_coins(a.user_id, null, 'realm_refund', a.spent, false, 'Spirit Realm: nobody to fight');
        end if;
        perform public.notify(a.user_id, null, 'realm', format('Nobody else came to your arena in the Spirit Realm at %s. Your ₥%s is back.', v_hour, trim_scale(a.spent)));
      end loop;
      update public.realm_armies set prize = 0 where at = p_at and arena = r.arena;
      continue;
    end if;
    v_prize := round(v_pool * v_share, 2);
    if v_prize > 0 then
      update public.profiles set coins = coins + v_prize where id = v_winner;
      perform public.log_coins(v_winner, null, 'realm_win', v_prize, false, 'Won a Spirit Realm battle');
      v_paid := v_paid + v_prize;
    end if;
    perform public.burn(null, v_pool - v_prize, 'Spirit Realm');
    update public.realm_armies set prize = case when user_id = v_winner then v_prize else 0 end where at = p_at and arena = r.arena;
    for a in select user_id, rank from public.realm_armies where at = p_at and arena = r.arena loop
      perform public.notify(a.user_id, null, 'realm', case when a.user_id = v_winner
        then format('Your army won the Spirit Realm battle at %s! ₥%s is yours.', v_hour, trim_scale(v_prize))
        else format('The Spirit Realm battle at %s is over: your army was number %s of %s. Try again next hour.', v_hour, a.rank, v_n) end);
    end loop;
  end loop;
  update public.realm_battles set status = 'settled', settled_at = now() where at = p_at;
  return jsonb_build_object('status', 'settled', 'arenas', v_arenas, 'paid', v_paid);
end $$;

do $$
begin
  revoke all on table public.realm_battles, public.realm_armies from public, anon, authenticated;
  grant all on table public.realm_battles, public.realm_armies to service_role;
  revoke all on function public.realm_enlist(uuid, timestamptz, int, jsonb, int, int, numeric, int), public.realm_leave(uuid, timestamptz),
    public.realm_settle(timestamptz, jsonb, numeric) from public, anon, authenticated;
  grant execute on function public.realm_enlist(uuid, timestamptz, int, jsonb, int, int, numeric, int), public.realm_leave(uuid, timestamptz),
    public.realm_settle(timestamptz, jsonb, numeric) to service_role;
end $$;
