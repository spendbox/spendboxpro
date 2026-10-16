-- Newtown, part 117: moments that never run out (docs/LIFE_WHEEL.md, phase 7). Two things:
--
--   - Player-written moments (src/lib/world/written.ts): anyone writes one; it's checked, other
--     players vote on it, the owner approves it on the dashboard, and then it comes to everyone with
--     the author's name on it (the author is paid through admin_credit, part 090).
--   - Measuring: moment_stats, for the dashboard: how often each moment came lately, how often
--     people walked away without choosing, which answers they picked, and how often players met
--     the same one again, so weak ones can be rewritten or retired.
--
-- Safe to run more than once. Run after part 116.

create table if not exists public.moment_drafts (
  id bigserial primary key,
  author uuid not null references public.profiles (id) on delete cascade,
  draft jsonb not null,
  -- 'voting' (players vote), 'approved' (in the game), 'rejected', 'retired' (taken out later).
  status text not null default 'voting' check (status in ('voting', 'approved', 'rejected', 'retired')),
  up int not null default 0,
  down int not null default 0,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists moment_drafts_status_idx on public.moment_drafts (status, created_at desc);
create index if not exists moment_drafts_author_idx on public.moment_drafts (author, created_at desc);

create table if not exists public.moment_draft_votes (
  draft_id bigint not null references public.moment_drafts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (draft_id, user_id)
);

do $$
begin
  revoke all on table public.moment_drafts, public.moment_draft_votes from public, anon, authenticated;
  grant all on table public.moment_drafts, public.moment_draft_votes to service_role;
  revoke all on sequence public.moment_drafts_id_seq from public, anon, authenticated;
  grant all on sequence public.moment_drafts_id_seq to service_role;
end $$;

/** Vote on a draft (1 up, −1 down; voting again changes your vote). Not on your own. Returns { up, down }. */
create or replace function public.moment_draft_vote(p_user uuid, p_draft bigint, p_vote int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d public.moment_drafts;
  v_was smallint;
begin
  if p_vote not in (-1, 1) then raise exception 'bad_vote'; end if;
  select * into d from public.moment_drafts where id = p_draft for update;
  if not found or d.status <> 'voting' then raise exception 'not_voting'; end if;
  if d.author = p_user then raise exception 'own_draft'; end if;
  select vote into v_was from public.moment_draft_votes where draft_id = p_draft and user_id = p_user;
  insert into public.moment_draft_votes (draft_id, user_id, vote) values (p_draft, p_user, p_vote)
    on conflict (draft_id, user_id) do update set vote = p_vote, created_at = now();
  update public.moment_drafts
    set up = up + (p_vote = 1)::int - (coalesce(v_was, 0) = 1)::int,
        down = down + (p_vote = -1)::int - (coalesce(v_was, 0) = -1)::int
    where id = p_draft
    returning * into d;
  return jsonb_build_object('up', d.up, 'down', d.down);
end $$;

/**
 * How each moment has done since p_since: how often it came, how often people walked away
 * without choosing, how many different players had it, how many times a player met it again, and
 * how often each answer was picked ({ "0": n, "1": n... }). Weakest first: walked away most.
 */
create or replace function public.moment_stats(p_since timestamptz)
returns table (moment text, shown bigint, walked bigint, players bigint, repeats bigint, picks jsonb)
language sql stable security definer set search_path = public as $$
  with m as (
    select moment, user_id, choice from public.moments where created_at >= p_since and answered_at is not null
  ), c as (
    select moment, jsonb_object_agg(choice::text, n) as picks
    from (select moment, choice, count(*) as n from m where choice >= 0 group by moment, choice) x
    group by moment
  )
  select m.moment,
         count(*) as shown,
         count(*) filter (where m.choice < 0) as walked,
         count(distinct m.user_id) as players,
         count(*) - count(distinct m.user_id) as repeats,
         coalesce(c.picks, '{}'::jsonb) as picks
  from m left join c on c.moment = m.moment
  group by m.moment, c.picks
  order by (count(*) filter (where m.choice < 0))::numeric / greatest(count(*), 1) desc, count(*) desc
$$;

do $$
begin
  revoke all on function public.moment_draft_vote(uuid, bigint, int) from public, anon, authenticated;
  grant execute on function public.moment_draft_vote(uuid, bigint, int) to service_role;
  revoke all on function public.moment_stats(timestamptz) from public, anon, authenticated;
  grant execute on function public.moment_stats(timestamptz) to service_role;
end $$;
