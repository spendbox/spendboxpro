-- Newtown, part 113: people who remember you (docs/LIFE_WHEEL.md, phase 3). The city has a cast
-- (src/lib/world/cast.ts): Mama Nkechi at the bus stop, Officer Bello at Ojota, Baba Sule on your
-- street. Each has a story with you that moves on as you choose (src/lib/world/cast-moments.ts).
-- This keeps, for every player and character: how far your story has gone, how they feel about
-- you (from −5 to 5), when you last met and what you chose. And for every character: how much the
-- whole city has helped and hurt them, shared by everyone, so the world changes them for all
-- (enough help and Mama Nkechi opens a shop; enough reports and Officer Bello is moved).
--
-- Safe to run more than once. Run after part 112.

create table if not exists public.cast_bonds (
  user_id uuid not null references public.profiles (id) on delete cascade,
  who text not null check (char_length(who) <= 40),
  -- The step of your story together that comes next (−1: it's over).
  step int not null default 0,
  feeling int not null default 0 check (feeling between -5 and 5),
  met_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  -- What happened, newest last (the last 30): { moment, choice, at }.
  memory jsonb not null default '[]'::jsonb,
  primary key (user_id, who)
);

create table if not exists public.cast_world (
  who text primary key check (char_length(who) <= 40),
  good int not null default 0,
  bad int not null default 0,
  updated_at timestamptz not null default now()
);

do $$
begin
  revoke all on table public.cast_bonds, public.cast_world from public, anon, authenticated;
  grant all on table public.cast_bonds, public.cast_world to service_role;
end $$;

/**
 * After a step of a character's story: they feel p_bond more (or less) about you, kept from −5 to 5;
 * the story moves to step p_next; the moment is remembered; and p_world ('good' or 'bad') adds one
 * to how much the city has helped or hurt them. Returns { step, feeling }.
 */
create or replace function public.cast_after(p_user uuid, p_who text, p_bond int, p_next int, p_world text, p_memory jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.cast_bonds;
begin
  insert into public.cast_bonds (user_id, who, step, feeling, memory)
    values (p_user, left(p_who, 40), p_next, greatest(-5, least(5, coalesce(p_bond, 0))), jsonb_build_array(coalesce(p_memory, '{}'::jsonb)))
  on conflict (user_id, who) do update
    set step = p_next,
        feeling = greatest(-5, least(5, public.cast_bonds.feeling + coalesce(p_bond, 0))),
        last_at = now(),
        memory = (
          select coalesce(jsonb_agg(e order by n), '[]'::jsonb) from (
            select e, n from jsonb_array_elements(public.cast_bonds.memory || jsonb_build_array(coalesce(p_memory, '{}'::jsonb))) with ordinality as t(e, n)
            order by n desc limit 30
          ) kept
        )
  returning * into b;
  if p_world in ('good', 'bad') then
    insert into public.cast_world (who, good, bad) values (left(p_who, 40), (p_world = 'good')::int, (p_world = 'bad')::int)
    on conflict (who) do update
      set good = public.cast_world.good + (p_world = 'good')::int,
          bad = public.cast_world.bad + (p_world = 'bad')::int,
          updated_at = now();
  end if;
  return jsonb_build_object('step', b.step, 'feeling', b.feeling);
end $$;

do $$
begin
  revoke all on function public.cast_after(uuid, text, int, int, text, jsonb) from public, anon, authenticated;
  grant execute on function public.cast_after(uuid, text, int, int, text, jsonb) to service_role;
end $$;
