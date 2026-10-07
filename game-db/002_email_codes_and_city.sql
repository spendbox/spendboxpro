-- HIDE & SEEK, part 2: sign-in codes sent by email (through Resend), and the city layout.
-- Run once in Supabase → SQL Editor, after 001_hide_and_seek.sql.

-- ============================================================ sign-in codes
-- The server makes a 6-digit code, keeps only its fingerprint (hash) here, and emails the code.
create table public.email_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  sent_count int not null default 1,
  window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);
alter table public.email_codes enable row level security;  -- no policies: only the server can read it

-- ============================================================ city layout
-- Tiles are laid out in a square spiral from the centre of the city: tile 0 is the
-- centre, and every new tile goes on the outside edge, so the city grows outwards
-- without existing tiles moving. The app draws the city with the same formula.
create or replace function public.spiral_xy(p_n int) returns int[]
language plpgsql immutable as $$
declare
  p int := p_n + 1;
  k int;
  t int;
  m int;
begin
  if p_n <= 0 then return array[0, 0]; end if;
  k := ceil((sqrt(p::numeric) - 1) / 2)::int;
  t := 2 * k + 1;
  m := t * t;
  t := t - 1;
  if p >= m - t then return array[k - (m - p), -k]; end if;
  m := m - t;
  if p >= m - t then return array[-k, -k + (m - p)]; end if;
  m := m - t;
  if p >= m - t then return array[-k + (m - p), k]; end if;
  return array[k, k - (m - p - t)];
end $$;

-- Sweep now measures "nearby" on the city layout.
create or replace function public.sweep(p_user uuid, p_tile int, p_radius int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rounds;
  p public.profiles;
  c int[];
  v_cost numeric;
  v_bonus_used numeric;
  v_real numeric;
  v_count int;
begin
  select * into r from public.rounds where status = 'seek' for update;
  if not found then raise exception 'Seeking is not open right now'; end if;
  if p_tile < 0 or p_tile >= r.tile_count then raise exception 'That tile is not on the map'; end if;
  if p_radius < 1 or p_radius > 5 then raise exception 'Radius must be 1 to 5'; end if;
  if exists (select 1 from public.entries where round_id = r.id and user_id = p_user and role = 'hider') then
    raise exception 'Hiders cannot sweep';
  end if;
  select * into p from public.profiles where id = p_user for update;
  if p.frozen then raise exception 'This account is frozen'; end if;
  if not exists (select 1 from public.entries where round_id = r.id and user_id = p_user) then
    perform public.join_round(p_user, 'seeker');
    select * into p from public.profiles where id = p_user;
  end if;

  v_cost := round(public.setting('sweep_base_price') * (2 * p_radius + 1) * (2 * p_radius + 1) / 9, 2);
  v_bonus_used := least(p.bonus_coins, v_cost);
  v_real := v_cost - v_bonus_used;
  if p.coins < v_real then raise exception 'Not enough coins (a sweep costs %)', v_cost; end if;
  update public.profiles set bonus_coins = bonus_coins - v_bonus_used, coins = coins - v_real where id = p_user;
  if v_bonus_used > 0 then
    perform public.log_coins(p_user, r.id, 'sweep_fee', -v_bonus_used, true);
    perform public.burn(r.id, v_bonus_used, 'sweep fee (bonus)', true);
  end if;
  if v_real > 0 then
    perform public.log_coins(p_user, r.id, 'sweep_fee', -v_real);
    perform public.burn(r.id, v_real, 'sweep fee');
  end if;
  update public.entries set real_spent = real_spent + v_real where round_id = r.id and user_id = p_user;

  c := public.spiral_xy(p_tile);
  select count(*) into v_count from public.entries e
    cross join lateral (select public.spiral_xy(e.tile) xy) s
    where e.round_id = r.id and e.role = 'hider' and not e.caught
      and abs(s.xy[1] - c[1]) <= p_radius
      and abs(s.xy[2] - c[2]) <= p_radius;

  return jsonb_build_object('hiders_nearby', v_count, 'found', v_count > 0, 'cost', v_cost, 'checked_at', now());
end $$;

revoke all on function public.sweep(uuid, int, int) from public, anon, authenticated;
grant execute on function public.sweep(uuid, int, int) to service_role;
