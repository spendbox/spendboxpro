-- Newtown, part 118: the Spirit Realm (docs/REALM.md). A battle on the map every hour, lasting the
-- hour. In Spirit mode players buy troops (soldiers, ghosts, angels, devils...), weapons and armour,
-- and place them anywhere in their arena; they come through a portal a little later and march on
-- the middle. Troops can be sent again and again while the battle is on. What everyone spends goes
-- into their arena's pool (up to 20 players an arena; more players, more arenas at once). When the
-- hour ends, the three armies that brought down the most enemies share most of the pool; the rest
-- goes to the city. Nothing that happens in the realm touches anyone's life in the city (health,
-- things, reputation): only the money spent and won.
--
-- The battle itself is worked out by the game's server (src/lib/realm/battle.ts), the same way every
-- phone plays it; it hands the result to realm_settle, which pays out once.
--
-- Safe to run more than once. Run after part 117.

create table if not exists public.realm_battles (
  at timestamptz primary key check (date_trunc('hour', at) = at),
  seed int not null,
  -- How many players have joined (each one's place in the queue).
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
  spent numeric(14,2) not null default 0 check (spent >= 0),
  sends int not null default 0,
  last_step int,
  points numeric(14,2),
  rank int,
  prize numeric(14,2),
  joined_at timestamptz not null default now(),
  primary key (at, user_id)
);
create index if not exists realm_armies_arena_idx on public.realm_armies (at, arena, seq);
create index if not exists realm_armies_user_idx on public.realm_armies (user_id, at desc);

-- Troops sent in: where (battle units from the arena's middle) and the step they come through.
create table if not exists public.realm_waves (
  at timestamptz not null,
  user_id uuid not null,
  n int not null,
  step int not null,
  x numeric(6,1) not null,
  y numeric(6,1) not null,
  fighters jsonb not null,
  weapons int not null default 0 check (weapons between 0 and 3),
  armour int not null default 0 check (armour between 0 and 3),
  cost numeric(14,2) not null check (cost > 0),
  created_at timestamptz not null default now(),
  primary key (at, user_id, n),
  foreign key (at, user_id) references public.realm_armies (at, user_id) on delete cascade
);

/**
 * Send troops into the battle that began at p_at (the one on now). p_cost: what they cost (the game's
 * server works it out from the price list in src/lib/realm/fighters.ts). They come through p_delay
 * seconds from now, at (p_x, p_y). Paid from Fun money, then the wallet.
 */
create or replace function public.realm_send(p_user uuid, p_at timestamptz, p_x numeric, p_y numeric, p_fighters jsonb, p_weapons int, p_armour int,
  p_cost numeric, p_arena_size int, p_delay int, p_gap int, p_close int, p_max_spend numeric, p_max_sends int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  b public.realm_battles;
  me public.realm_armies;
  v_cost numeric := round(greatest(0, coalesce(p_cost, 0)), 2);
  v_step int;
  v_arena int;
begin
  if p_at is null or date_trunc('hour', p_at) <> p_at then raise exception 'bad_time'; end if;
  if now() < p_at then raise exception 'not_yet'; end if;
  if now() >= p_at + interval '1 hour' - make_interval(secs => greatest(0, coalesce(p_close, 120))) then raise exception 'closed'; end if;
  if p_x is null or p_y is null or p_x * p_x + p_y * p_y > 100 * 100 then raise exception 'outside'; end if;
  if v_cost <= 0 then raise exception 'bad_army'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;

  insert into public.realm_battles (at, seed) values (p_at, floor(random() * 2000000000)::int) on conflict (at) do nothing;
  select * into b from public.realm_battles where at = p_at for update;
  select * into me from public.realm_armies where at = p_at and user_id = p_user for update;
  -- The step they come through: p_delay seconds from now (steps of a quarter of a second).
  v_step := floor(extract(epoch from (now() - p_at)) * 4)::int + greatest(4, coalesce(p_delay, 20)) * 4;
  if me.user_id is not null then
    if me.sends >= coalesce(p_max_sends, 30) then raise exception 'too_many'; end if;
    if me.last_step is not null and v_step < me.last_step + greatest(0, coalesce(p_gap, 10)) * 4 then raise exception 'too_quick'; end if;
    if me.spent + v_cost > coalesce(p_max_spend, 3000) then raise exception 'too_much:%', trim_scale(greatest(0, coalesce(p_max_spend, 3000) - me.spent)); end if;
  elsif v_cost > coalesce(p_max_spend, 3000) then raise exception 'too_much:%', trim_scale(coalesce(p_max_spend, 3000));
  end if;
  if public.life_can_spend(p_user, array['fun']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
  perform public.life_spend(p_user, array['fun'], v_cost);
  perform public.log_coins(p_user, null, 'realm_troops', -v_cost, false, 'Spirit Realm troops');

  if me.user_id is null then
    -- The first arena with room, else a new one.
    select arena into v_arena from public.realm_armies where at = p_at group by arena
      having count(*) < greatest(2, coalesce(p_arena_size, 20)) order by arena limit 1;
    if v_arena is null then
      select coalesce(max(arena) + 1, 0) into v_arena from public.realm_armies where at = p_at;
    end if;
    insert into public.realm_armies (at, user_id, name, seq, arena)
      values (p_at, p_user, coalesce(nullif(p.username, ''), 'Player'), b.joined, v_arena)
      returning * into me;
    update public.realm_battles set joined = joined + 1 where at = p_at;
  end if;
  insert into public.realm_waves (at, user_id, n, step, x, y, fighters, weapons, armour, cost)
    values (p_at, p_user, me.sends, v_step, round(p_x, 1), round(p_y, 1), p_fighters, p_weapons, p_armour, v_cost);
  update public.realm_armies set spent = spent + v_cost, sends = sends + 1, last_step = v_step where at = p_at and user_id = p_user;
  return jsonb_build_object('at', p_at, 'arena', me.arena, 'seq', me.seq, 'n', me.sends, 'step', v_step, 'spent', me.spent + v_cost);
end $$;

/**
 * Pay out the battle at p_at, once (any later call just says it's done). p_results: each arena's
 * players from first to last and their points, as worked out by the battle:
 * [{"arena": 0, "ranks": [user ids...], "points": {"<user id>": 12.5}}]. p_shares: what the first,
 * second, third... take of the pool. An arena with one player (nobody to fight but wild spirits)
 * gives the money back; so does any arena left out.
 */
create or replace function public.realm_settle(p_at timestamptz, p_results jsonb, p_shares numeric[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.realm_battles;
  r record;
  a record;
  v_res jsonb;
  v_pool numeric;
  v_prize numeric;
  v_given numeric;
  v_paid numeric := 0;
  v_arenas int := 0;
  v_hour text := to_char(p_at at time zone 'UTC', 'HH24:MI') || ' UTC';
begin
  select * into b from public.realm_battles where at = p_at for update;
  if not found then return jsonb_build_object('status', 'none'); end if;
  if b.status = 'settled' then return jsonb_build_object('status', 'settled', 'already', true); end if;
  if now() < p_at + interval '1 hour' then raise exception 'not_yet'; end if;

  for r in select arena, count(*)::int as n, sum(spent) as pool from public.realm_armies where at = p_at group by arena order by arena loop
    v_arenas := v_arenas + 1;
    select e into v_res from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) e where (e ->> 'arena')::int = r.arena limit 1;
    v_pool := coalesce(r.pool, 0);
    -- Each player's place (players missing from the list come last, in join order) and points.
    update public.realm_armies ra set
        rank = coalesce((select o.i::int from jsonb_array_elements_text(coalesce(v_res -> 'ranks', '[]'::jsonb)) with ordinality o(uid, i) where o.uid = ra.user_id::text limit 1), r.n + 1 + ra.seq),
        points = coalesce((v_res -> 'points' ->> ra.user_id::text)::numeric, 0),
        prize = 0
      where ra.at = p_at and ra.arena = r.arena;
    if r.n < 2 or v_res is null then
      -- Nobody to fight (or no result for this arena): the money back.
      for a in select user_id, spent from public.realm_armies where at = p_at and arena = r.arena loop
        if a.spent > 0 then
          update public.profiles set coins = coins + a.spent where id = a.user_id;
          perform public.log_coins(a.user_id, null, 'realm_refund', a.spent, false, 'Spirit Realm: nobody to fight');
        end if;
        perform public.notify(a.user_id, null, 'realm', format('Nobody else fought in your arena of the Spirit Realm at %s. Your ₥%s is back.', v_hour, trim_scale(a.spent)));
      end loop;
      continue;
    end if;
    v_given := 0;
    for a in select user_id, rank from public.realm_armies where at = p_at and arena = r.arena order by rank, seq loop
      v_prize := case when a.rank <= coalesce(array_length(p_shares, 1), 0) then round(v_pool * least(1, greatest(0, p_shares[a.rank])), 2) else 0 end;
      v_prize := least(v_prize, v_pool - v_given);
      if v_prize > 0 then
        update public.profiles set coins = coins + v_prize where id = a.user_id;
        perform public.log_coins(a.user_id, null, 'realm_win', v_prize, false, 'Spirit Realm prize');
        update public.realm_armies set prize = v_prize where at = p_at and user_id = a.user_id;
        v_given := v_given + v_prize;
      end if;
      perform public.notify(a.user_id, null, 'realm', case
        when a.rank = 1 then format('Your army won the Spirit Realm battle at %s! ₥%s is yours.', v_hour, trim_scale(v_prize))
        when v_prize > 0 then format('The Spirit Realm battle at %s is over: your army was number %s of %s and won ₥%s.', v_hour, a.rank, r.n, trim_scale(v_prize))
        else format('The Spirit Realm battle at %s is over: your army was number %s of %s. Try again next hour.', v_hour, a.rank, r.n) end);
    end loop;
    v_paid := v_paid + v_given;
    perform public.burn(null, v_pool - v_given, 'Spirit Realm');
  end loop;
  update public.realm_battles set status = 'settled', settled_at = now() where at = p_at;
  return jsonb_build_object('status', 'settled', 'arenas', v_arenas, 'paid', v_paid);
end $$;

do $$
begin
  revoke all on table public.realm_battles, public.realm_armies, public.realm_waves from public, anon, authenticated;
  grant all on table public.realm_battles, public.realm_armies, public.realm_waves to service_role;
  revoke all on function public.realm_send(uuid, timestamptz, numeric, numeric, jsonb, int, int, numeric, int, int, int, int, numeric, int),
    public.realm_settle(timestamptz, jsonb, numeric[]) from public, anon, authenticated;
  grant execute on function public.realm_send(uuid, timestamptz, numeric, numeric, jsonb, int, int, numeric, int, int, int, int, numeric, int),
    public.realm_settle(timestamptz, jsonb, numeric[]) to service_role;
end $$;
