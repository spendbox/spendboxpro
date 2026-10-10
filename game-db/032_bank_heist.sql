-- Newtown, part 32: rob the bank (a huge risk).
-- Every city has a grand bank, and its vault holds the game's prize pool. Anyone signed in can
-- try to rob it while a game is on, once an hour:
-- - The quiet job: stake heist_quiet_stake (100) mint; heist_quiet_chance (25%) of getting away
--   with heist_quiet_share (10%) of the vault.
-- - The big heist: stake heist_big_stake (300) mint; heist_big_chance (10%) of getting away with
--   heist_big_share (35%) of the vault.
-- - Got away: the stake back, plus the loot (out of the prize pool, at most heist_max_loot).
-- - Caught: the stake is lost, and a fine of heist_fine_share (10%) of the mint you have left (at
--   most heist_fine_max, 1,000). Both go into the prize pool. Everyone hears about it either way.
-- The server rolls the dice; the screen only shows the drama. No new mint: it moves between the
-- robber and the prize pool.
-- Safe to run more than once. Run after parts 1-31.

insert into public.game_settings (key, value, note) values
  ('heist_quiet_stake',   100,  'Bank robbery, quiet job: mint staked'),
  ('heist_quiet_chance',  0.25, 'Bank robbery, quiet job: chance of getting away'),
  ('heist_quiet_share',   0.10, 'Bank robbery, quiet job: share of the vault (prize pool) taken'),
  ('heist_big_stake',     300,  'Bank robbery, big heist: mint staked'),
  ('heist_big_chance',    0.10, 'Bank robbery, big heist: chance of getting away'),
  ('heist_big_share',     0.35, 'Bank robbery, big heist: share of the vault (prize pool) taken'),
  ('heist_max_loot',      5000, 'Most mint one robbery can take'),
  ('heist_fine_share',    0.10, 'Caught robbing the bank: fine, as a share of the mint left'),
  ('heist_fine_max',      1000, 'Caught robbing the bank: biggest fine'),
  ('heist_min_vault',     100,  'The vault (prize pool) needs at least this much to be worth robbing'),
  ('heist_cooldown_minutes', 60, 'Wait between bank robbery attempts')
on conflict (key) do update set note = excluded.note;

create table if not exists public.bank_heists (
  id bigserial primary key,
  round_id bigint not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan text not null check (plan in ('quiet', 'big')),
  stake numeric(14,2) not null,
  success boolean not null,
  loot numeric(14,2) not null default 0,
  fine numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bank_heists_user_idx on public.bank_heists (user_id, created_at desc);
alter table public.bank_heists enable row level security; -- no policies: only the server reads it

-- What the robbery screen shows: what's in the vault, the two plans (stake, chance, what you'd
-- take right now), and whether you can try now (and if not, why). why: no_game, cooldown,
-- empty_vault, not_enough, frozen, no_name, or null.
create or replace function public.bank_heist_info(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_last timestamptz;
  v_until timestamptz;
  v_max numeric := public.setting('heist_max_loot');
  v_why text;
begin
  select * into r from public.rounds where status in ('join', 'seek') order by id desc limit 1;
  select * into p from public.profiles where id = p_user;
  select max(created_at) into v_last from public.bank_heists where user_id = p_user;
  if v_last is not null then
    v_until := v_last + make_interval(mins => public.setting('heist_cooldown_minutes')::int);
    if v_until <= now() then v_until := null; end if;
  end if;
  v_why := case
    when r.id is null then 'no_game'
    when p.id is null or p.username is null then 'no_name'
    when p.frozen or p.age_blocked_at is not null then 'frozen'
    when v_until is not null then 'cooldown'
    when r.pool < public.setting('heist_min_vault') then 'empty_vault'
    when p.coins < public.setting('heist_quiet_stake') then 'not_enough'
  end;
  return jsonb_build_object(
    'vault', coalesce(r.pool, 0),
    'coins', coalesce(p.coins, 0),
    'cooldown_until', v_until,
    'can', v_why is null,
    'why', v_why,
    'fine_share', public.setting('heist_fine_share'),
    'fine_max', public.setting('heist_fine_max'),
    'min_vault', public.setting('heist_min_vault'),
    'plans', jsonb_build_array(
      jsonb_build_object('key', 'quiet', 'stake', public.setting('heist_quiet_stake'), 'chance', public.setting('heist_quiet_chance'),
                         'loot', least(round(coalesce(r.pool, 0) * public.setting('heist_quiet_share'), 2), v_max)),
      jsonb_build_object('key', 'big', 'stake', public.setting('heist_big_stake'), 'chance', public.setting('heist_big_chance'),
                         'loot', least(round(coalesce(r.pool, 0) * public.setting('heist_big_share'), 2), v_max))));
end $$;

-- Try to rob the bank with plan 'quiet' or 'big'. Returns { success, plan, stake, loot, fine,
-- coins, vault }. Errors: bad_plan, no_game, unknown_player, no_name, frozen, cooldown:<seconds>,
-- empty_vault, not_enough:<stake>.
create or replace function public.bank_heist(p_user uuid, p_plan text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  v_last timestamptz;
  v_wait numeric;
  v_stake numeric;
  v_chance numeric;
  v_share numeric;
  v_loot numeric := 0;
  v_fine numeric := 0;
  v_ok boolean;
  v_name text;
begin
  if p_plan is null or p_plan not in ('quiet', 'big') then raise exception 'bad_plan'; end if;
  select * into r from public.rounds where status in ('join', 'seek') order by id desc limit 1 for update;
  if not found then raise exception 'no_game'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.username is null then raise exception 'no_name'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  select max(created_at) into v_last from public.bank_heists where user_id = p_user;
  if v_last is not null then
    v_wait := public.setting('heist_cooldown_minutes') * 60 - extract(epoch from (now() - v_last));
    if v_wait > 0.5 then raise exception 'cooldown:%', ceil(v_wait)::int; end if;
  end if;
  if r.pool < public.setting('heist_min_vault') then raise exception 'empty_vault'; end if;
  v_stake := public.setting(case when p_plan = 'big' then 'heist_big_stake' else 'heist_quiet_stake' end);
  v_chance := public.setting(case when p_plan = 'big' then 'heist_big_chance' else 'heist_quiet_chance' end);
  v_share := public.setting(case when p_plan = 'big' then 'heist_big_share' else 'heist_quiet_share' end);
  if p.coins < v_stake then raise exception 'not_enough:%', v_stake; end if;
  v_name := p.username;

  -- The stake goes down first.
  update public.profiles set coins = coins - v_stake where id = p_user;
  perform public.log_coins(p_user, r.id, 'heist_stake', -v_stake, false, 'Bank robbery (' || p_plan || ')');
  v_ok := random() < v_chance;
  if v_ok then
    -- Got away: the stake back, and the loot out of the vault (the prize pool).
    v_loot := least(round(r.pool * v_share, 2), public.setting('heist_max_loot'));
    update public.rounds set pool = pool - v_loot where id = r.id;
    perform public.log_coins(null, r.id, 'pool_heist', -v_loot, false, 'Bank robbed by ' || v_name);
    update public.profiles set coins = coins + v_stake + v_loot where id = p_user;
    perform public.log_coins(p_user, r.id, 'heist_stake_back', v_stake, false, 'Bank robbery: got away');
    perform public.log_coins(p_user, r.id, 'heist_loot', v_loot, false, 'Bank robbery: the loot');
    perform public.notify(p_user, r.id, 'heist', format('You robbed the bank and got away with %s mint!', trim_scale(v_loot)));
  else
    -- Caught: the stake and a fine go into the prize pool.
    select least(round(greatest(coins, 0) * public.setting('heist_fine_share'), 2), public.setting('heist_fine_max')) into v_fine
      from public.profiles where id = p_user;
    update public.profiles set coins = coins - v_fine where id = p_user;
    if v_fine > 0 then perform public.log_coins(p_user, r.id, 'heist_fine', -v_fine, false, 'Caught robbing the bank'); end if;
    perform public.pool_or_burn(r.id, v_stake + v_fine, 'Bank robbery: caught');
    perform public.notify(p_user, r.id, 'heist', format('The police caught you robbing the bank. You lost %s mint.', trim_scale(v_stake + v_fine)));
  end if;
  insert into public.bank_heists (round_id, user_id, plan, stake, success, loot, fine) values (r.id, p_user, p_plan, v_stake, v_ok, v_loot, v_fine);
  insert into public.events (round_id, kind, tile, detail)
    values (r.id, 'heist', null, jsonb_build_object('name', v_name, 'success', v_ok, 'loot', v_loot, 'lost', v_stake + v_fine, 'plan', p_plan, 'avatar', p.avatar));
  return jsonb_build_object('success', v_ok, 'plan', p_plan, 'stake', v_stake, 'loot', v_loot, 'fine', v_fine,
    'coins', (select coins from public.profiles where id = p_user), 'vault', (select pool from public.rounds where id = r.id));
end $$;

-- ============================================================ privacy & access
do $$
begin
  revoke all on table public.bank_heists from public, anon, authenticated;
  grant all on table public.bank_heists to service_role;
  revoke all on sequence public.bank_heists_id_seq from public, anon, authenticated;
  grant all on sequence public.bank_heists_id_seq to service_role;
end $$;
revoke all on function public.bank_heist_info(uuid) from public, anon, authenticated;
grant execute on function public.bank_heist_info(uuid) to service_role;
revoke all on function public.bank_heist(uuid, text) from public, anon, authenticated;
grant execute on function public.bank_heist(uuid, text) to service_role;
