-- Newtown, part 128: only the game's server can run the game's database functions.
--
-- Every function the game uses is meant to be called by the server (with the service key), never
-- by a phone: the phones only sign in and use live channels. Each part revokes its own functions
-- from the public, but a function that's dropped and made again with new arguments starts open
-- (PostgreSQL lets anyone run a new function by default), and part 97 did that to event_open: anyone
-- with the app's public key could open an event as any player, for any fee. This closes every
-- function in the public schema (except the extensions' own, like pgcrypto's), and makes
-- functions made from now on closed by default too.
--
-- Safe to run more than once, and again after any later part (run it last).
--
-- Also: the owner's dashboard locks after 10 wrong passwords in 15 minutes (for everyone, for 15
-- minutes), so a password can't be guessed by trying many at once (src/lib/admin.ts).

create table if not exists public.admin_failures (
  id bigserial primary key,
  at timestamptz not null default now()
);
alter table public.admin_failures enable row level security;
revoke all on table public.admin_failures from public, anon, authenticated;
grant all on table public.admin_failures to service_role;

/** Is the dashboard's sign-in locked (10 wrong passwords in the last 15 minutes)? */
create or replace function public.admin_locked() returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) >= 10 from public.admin_failures where at > now() - interval '15 minutes'
$$;

/** A wrong password at the dashboard (old ones are cleared). */
create or replace function public.admin_failed() returns void
language sql security definer set search_path = public as $$
  delete from public.admin_failures where at < now() - interval '1 day';
  insert into public.admin_failures default values;
$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      -- Not the extensions' functions (pgcrypto's digest, crypt...): they're not ours to change.
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.f);
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $$;

-- Functions made from now on start closed (for whoever runs the parts: the SQL Editor's role).
-- (Everyone's right to run new functions is a database-wide default, so it's taken away there.)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;
