-- Newtown: every update from part 111 to part 128 in one go (made from those files, in order).
-- Paste this whole file into the Supabase SQL Editor and press Run, once on the live database and
-- once on the test one. Each part is safe to run again, so it doesn't matter which you've run
-- before: what's there already stays, what's missing is added. Part 128 (the security lock-down)
-- comes last on purpose. Takes a few seconds.
--
-- Not included (on purpose): game-db/075_fresh_start.sql, which must only ever run once.


-- ==================================================================== 111_character.sql
-- Newtown, part 111: who you are (docs/LIFE_WHEEL.md). Every answer to a moment quietly nudges six
-- sliders (Generous/Prudent, Bold/Careful, Straight/Street-smart, Community/Self-made,
-- Forgiving/Firm, Traditional/Modern); this keeps each answer's nudge with the moment, so who you
-- are can be worked out from what you chose, recent answers counting most
-- (src/lib/world/moments.ts characterOf). Nothing is shown yet; the wheel and badges come next.
--
-- Safe to run more than once. Run after part 109.

alter table public.moments add column if not exists traits jsonb;

-- Reading someone's answers that carry a nudge, newest first.
create index if not exists moments_traits_idx on public.moments (user_id, answered_at desc) where traits is not null;


-- ==================================================================== 112_wheel.sql
-- Newtown, part 112: the wheel (docs/LIFE_WHEEL.md). Your life drawn as a ring: every moment you've
-- lived, the stories still going, and what's on you right now. This adds:
--
--   - short effects (Blessed, Talked about, Hurt, Owed a favour...) that wear off by themselves
--     and change how later moments turn out (src/lib/world/moments.ts EFFECTS);
--   - where a story came from: a follow-up remembers the moment that started it, so the wheel can
--     show "what came of it" under the moment, and which stories are still going.
--
-- The two moment functions from part 109 are the same as before, except that they pass that on.
-- Safe to run more than once. Run after part 111.

alter table public.moment_followups add column if not exists from_id bigint references public.moments (id) on delete set null;
alter table public.moments add column if not exists from_id bigint references public.moments (id) on delete set null;
create index if not exists moments_from_idx on public.moments (from_id) where from_id is not null;

create table if not exists public.life_effects (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  effect text not null check (char_length(effect) <= 30),
  -- Who it's about, when it's about someone ("Owed a favour" by Tunde).
  who text check (char_length(who) <= 40),
  moment_id bigint references public.moments (id) on delete set null,
  until timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists life_effects_user_idx on public.life_effects (user_id, until desc);

do $$
begin
  revoke all on table public.life_effects from public, anon, authenticated;
  grant all on table public.life_effects to service_role;
  revoke all on sequence public.life_effects_id_seq from public, anon, authenticated;
  grant all on sequence public.life_effects_id_seq to service_role;
end $$;

/**
 * Start a moment for a player: not within p_gap seconds of the last one, at most p_per_day a day,
 * any earlier one left unanswered closed. p_follow: the follow-up it comes from (used up). Returns
 * its id. Errors: too_soon, daily_cap.
 */
create or replace function public.moment_open(p_user uuid, p_moment text, p_vars jsonb, p_spot text, p_gap int, p_per_day int, p_follow bigint default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
  v_today int;
  v_id bigint;
  v_from bigint;
begin
  perform 1 from public.profiles where id = p_user for update;
  select max(created_at) into v_last from public.moments where user_id = p_user;
  if v_last is not null and v_last > now() - make_interval(secs => greatest(0, p_gap)) then raise exception 'too_soon'; end if;
  select count(*) into v_today from public.moments where user_id = p_user and created_at >= date_trunc('day', now());
  if v_today >= p_per_day then raise exception 'daily_cap'; end if;
  update public.moments set answered_at = now(), choice = -1 where user_id = p_user and answered_at is null;
  if p_follow is not null then
    delete from public.moment_followups where id = p_follow and user_id = p_user returning from_id into v_from;
  end if;
  insert into public.moments (user_id, moment, vars, spot, from_id) values (p_user, left(p_moment, 40), coalesce(p_vars, '{}'::jsonb), left(coalesce(p_spot, 'street'), 20), v_from)
    returning id into v_id;
  return v_id;
end $$;

/**
 * Answer a moment: what you chose and what came of it (worked out by the game). p_cash (mint):
 * paid from Fun money then the wallet when below 0, into the wallet when above (no more than
 * p_gain_day a day from moments); p_rep: reputation, no more than p_rep_day either way in a day,
 * and kept between p_rep_min and p_rep_max in all. p_follow: a moment to come back p_follow_hours
 * later. Returns { cash, rep, coins }. Errors: no_moment, too_late, not_enough.
 */
create or replace function public.moment_answer(
  p_user uuid, p_id bigint, p_choice int, p_text text, p_cash numeric, p_rep numeric,
  p_follow text, p_follow_vars jsonb, p_follow_hours numeric,
  p_answer_secs int, p_gain_day numeric, p_rep_day numeric, p_rep_min numeric, p_rep_max numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m public.moments;
  v_cash numeric := round(coalesce(p_cash, 0), 2);
  v_rep numeric := round(coalesce(p_rep, 0), 2);
  v_gained numeric;
  v_rep_today numeric;
  v_now numeric;
begin
  select * into m from public.moments where id = p_id and user_id = p_user for update;
  if not found or m.answered_at is not null then raise exception 'no_moment'; end if;
  if m.created_at < now() - make_interval(secs => greatest(60, p_answer_secs)) then
    update public.moments set answered_at = now(), choice = -1 where id = p_id;
    raise exception 'too_late';
  end if;
  perform 1 from public.profiles where id = p_user for update;
  if v_cash < 0 then
    if public.life_can_spend(p_user, array['fun']) < -v_cash then raise exception 'not_enough'; end if;
    perform public.life_spend(p_user, array['fun'], -v_cash);
    perform public.log_coins(p_user, null, 'moment', v_cash, false, 'Out and about');
    perform public.burn(null, -v_cash, 'Moments');
  elsif v_cash > 0 then
    select coalesce(sum((outcome ->> 'cash')::numeric), 0) into v_gained from public.moments
      where user_id = p_user and answered_at >= date_trunc('day', now()) and (outcome ->> 'cash')::numeric > 0;
    v_cash := least(v_cash, greatest(0, coalesce(p_gain_day, 0) - v_gained));
    if v_cash > 0 then
      update public.profiles set coins = coins + v_cash where id = p_user;
      perform public.log_coins(p_user, null, 'moment', v_cash, false, 'Out and about');
    end if;
  end if;
  if v_rep <> 0 then
    select coalesce(sum((outcome ->> 'rep')::numeric), 0) into v_rep_today from public.moments
      where user_id = p_user and answered_at >= date_trunc('day', now());
    v_rep := case when v_rep > 0 then least(v_rep, greatest(0, p_rep_day - greatest(0, v_rep_today)))
                  else greatest(v_rep, -greatest(0, p_rep_day + least(0, v_rep_today))) end;
    select moment_rep into v_now from public.lives where user_id = p_user for update;
    if found then
      v_rep := least(p_rep_max, greatest(p_rep_min, v_now + v_rep)) - v_now;
      update public.lives set moment_rep = moment_rep + v_rep where user_id = p_user;
    else
      v_rep := 0;
    end if;
  end if;
  update public.moments
    set answered_at = now(), choice = p_choice,
        outcome = jsonb_build_object('text', left(coalesce(p_text, ''), 400), 'cash', v_cash, 'rep', v_rep)
    where id = p_id;
  if p_follow is not null and p_follow <> '' then
    insert into public.moment_followups (user_id, moment, vars, from_id, due_at)
      values (p_user, left(p_follow, 40), coalesce(p_follow_vars, '{}'::jsonb), p_id, now() + make_interval(secs => (greatest(1, coalesce(p_follow_hours, 24)) * 3600)::int));
  end if;
  return jsonb_build_object('cash', v_cash, 'rep', v_rep, 'coins', (select coins from public.profiles where id = p_user));
end $$;


-- ==================================================================== 113_cast.sql
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


-- ==================================================================== 114_standing.sql
-- Newtown, part 114: standing and quiet badges (docs/LIFE_WHEEL.md, phase 4). From what you've
-- lived, the game works out Trust, Fame and Legacy, and badges earned by patterns over weeks
-- (src/lib/world/standing.ts). This keeps:
--
--   - with each moment, what the game noted at the time: the trust it moved, whether anyone saw it,
--     the effect it left (the rules read these back later);
--   - each player's standing, worked out at most every few minutes, for the "most legendary lives"
--     board (Legacy only grows);
--   - each player's badges: when earned, when they quietly show up, whether they've been seen,
--     whether they've faded, and whether the player shows them on their card (not unless they choose).
--
-- Safe to run more than once. Run after part 113.

alter table public.moments add column if not exists marks jsonb;

create table if not exists public.life_standing (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  trust int not null default 50,
  fame int not null default 0,
  legacy int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists life_standing_legacy_idx on public.life_standing (legacy desc);

create table if not exists public.life_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null check (char_length(badge) <= 40),
  earned_at timestamptz not null default now(),
  -- It shows up quietly a while after it's earned.
  visible_at timestamptz not null default now(),
  -- When the player first saw it (null: new).
  seen_at timestamptz,
  -- A character badge can fade if you change (and come back if you change back).
  faded_at timestamptz,
  -- On your card for others to see (private until you choose).
  shown boolean not null default false,
  primary key (user_id, badge)
);

do $$
begin
  revoke all on table public.life_standing, public.life_badges from public, anon, authenticated;
  grant all on table public.life_standing, public.life_badges to service_role;
end $$;


-- ==================================================================== 115_ventures.sql
-- Newtown, part 115: careers (docs/LIFE_WHEEL.md, phase 5). Start a business (a suya spot, a buka, a
-- POS kiosk, a tech startup...) and grow it from Idea to Empire, or watch it fail
-- (src/lib/world/ventures.ts). The game runs its days and its moments; this keeps the books:
--
--   - each business: what it is, its numbers (kept as one piece the game reads and writes), when its
--     days were last counted, when its last moment came, and when it closed (one open at a time);
--   - starting one is paid from your wallet (it goes to the World Bank, like anything bought from
--     the city); what it earns you is paid into your wallet as 'business_income'.
--
-- Safe to run more than once. Run after part 114.

create table if not exists public.ventures (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (char_length(kind) <= 20),
  name text not null check (char_length(name) between 1 and 40),
  -- Its numbers: stage, cash, customers, quality, mood, risk, staff, share, best, paid, days.
  state jsonb not null,
  started_at timestamptz not null default now(),
  settled_at timestamptz not null default now(),
  last_moment_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists ventures_one_open on public.ventures (user_id) where closed_at is null;
create index if not exists ventures_user_idx on public.ventures (user_id, started_at desc);

do $$
begin
  revoke all on table public.ventures from public, anon, authenticated;
  grant all on table public.ventures to service_role;
  revoke all on sequence public.ventures_id_seq from public, anon, authenticated;
  grant all on sequence public.ventures_id_seq to service_role;
end $$;

/**
 * Start a business: p_cost (mint) from your wallet, gone to the World Bank. Errors: has_one (you run
 * one already), not_enough. Returns its id.
 */
create or replace function public.venture_start(p_user uuid, p_kind text, p_name text, p_cost numeric, p_state jsonb)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_cost numeric := round(greatest(coalesce(p_cost, 0), 0), 2);
begin
  perform 1 from public.profiles where id = p_user for update;
  if exists (select 1 from public.ventures where user_id = p_user and closed_at is null) then raise exception 'has_one'; end if;
  if public.life_can_spend(p_user, '{}'::text[]) < v_cost then raise exception 'not_enough'; end if;
  perform public.life_spend(p_user, '{}'::text[], v_cost);
  perform public.log_coins(p_user, null, 'business_start', -v_cost, false, left('Started ' || coalesce(p_name, 'a business'), 200));
  perform public.burn(null, v_cost, 'Starting a business');
  insert into public.ventures (user_id, kind, name, state) values (p_user, left(p_kind, 20), left(btrim(p_name), 40), coalesce(p_state, '{}'::jsonb))
    returning id into v_id;
  return v_id;
end $$;

/**
 * Save a business after its days were counted or a moment changed it: only if nobody else saved it
 * since p_was (when its days were last counted), else error 'busy'. p_pay (mint): what it paid you,
 * into your wallet. p_settled: counted up to then. p_moment: a moment just came. p_close: it closes.
 * Returns your coins after.
 */
create or replace function public.venture_save(p_user uuid, p_id bigint, p_was timestamptz, p_state jsonb, p_pay numeric, p_settled timestamptz, p_moment boolean, p_close boolean)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_pay numeric := round(greatest(coalesce(p_pay, 0), 0), 2);
begin
  update public.ventures
    set state = p_state,
        settled_at = coalesce(p_settled, settled_at),
        last_moment_at = case when p_moment then now() else last_moment_at end,
        closed_at = case when p_close then now() else closed_at end
    where id = p_id and user_id = p_user and closed_at is null and settled_at = p_was;
  if not found then raise exception 'busy'; end if;
  if v_pay > 0 then
    update public.profiles set coins = coins + v_pay where id = p_user;
    perform public.log_coins(p_user, null, 'business_income', v_pay, false, 'What your business earned');
  end if;
  return (select coins from public.profiles where id = p_user);
end $$;

do $$
begin
  revoke all on function public.venture_start(uuid, text, text, numeric, jsonb) from public, anon, authenticated;
  grant execute on function public.venture_start(uuid, text, text, numeric, jsonb) to service_role;
  revoke all on function public.venture_save(uuid, bigint, timestamptz, jsonb, numeric, timestamptz, boolean, boolean) from public, anon, authenticated;
  grant execute on function public.venture_save(uuid, bigint, timestamptz, jsonb, numeric, timestamptz, boolean, boolean) to service_role;
end $$;


-- ==================================================================== 116_player_stories.sql
-- Newtown, part 116: other players in your story (docs/LIFE_WHEEL.md, phase 6). Moments about a real
-- player (src/lib/world/player-moments.ts): you lend Ade money in yours, and Ade gets "Pay them
-- back?" in theirs. This keeps:
--
--   - who can be in your story: friends (the default), anyone in your city who also says so, or nobody;
--   - the next part of a story waiting for a player (a link): which moment, from whom, its amount,
--     when it's due, and when it was opened; links not opened within a week lapse;
--   - how each player feels about each other player they've shared stories with (allies and rivals).
--
-- Real money between players goes through give_coins (part 107), with its limits and its notice.
-- Safe to run more than once. Run after part 115.

create table if not exists public.story_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- 'friends': only friends; 'everyone': anyone in the city who says so too; 'nobody'.
  open text not null default 'friends' check (open in ('friends', 'everyone', 'nobody')),
  updated_at timestamptz not null default now()
);

create table if not exists public.story_links (
  id bigserial primary key,
  to_user uuid not null references public.profiles (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  moment text not null check (char_length(moment) <= 40),
  -- The amount (naira) and anything else the moment fills in.
  vars jsonb not null default '{}'::jsonb,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  check (to_user <> from_user)
);
create index if not exists story_links_due_idx on public.story_links (to_user, due_at) where opened_at is null;
create index if not exists story_links_from_idx on public.story_links (from_user, created_at desc);

create table if not exists public.player_bonds (
  user_id uuid not null references public.profiles (id) on delete cascade,
  other uuid not null references public.profiles (id) on delete cascade,
  -- How user_id feels about other, from −10 to 10.
  feeling int not null default 0 check (feeling between -10 and 10),
  -- Stories shared.
  together int not null default 0,
  last_at timestamptz not null default now(),
  primary key (user_id, other),
  check (user_id <> other)
);

do $$
begin
  revoke all on table public.story_prefs, public.story_links, public.player_bonds from public, anon, authenticated;
  grant all on table public.story_prefs, public.story_links, public.player_bonds to service_role;
  revoke all on sequence public.story_links_id_seq from public, anon, authenticated;
  grant all on sequence public.story_links_id_seq to service_role;
end $$;

/** How p_user feels about p_other changes by p_feel (kept from −10 to 10), and they've shared one more story. */
create or replace function public.player_bond_add(p_user uuid, p_other uuid, p_feel int)
returns int
language sql security definer set search_path = public as $$
  insert into public.player_bonds (user_id, other, feeling, together)
    values (p_user, p_other, greatest(-10, least(10, coalesce(p_feel, 0))), 1)
  on conflict (user_id, other) do update
    set feeling = greatest(-10, least(10, public.player_bonds.feeling + coalesce(p_feel, 0))),
        together = public.player_bonds.together + 1,
        last_at = now()
  returning feeling
$$;

do $$
begin
  revoke all on function public.player_bond_add(uuid, uuid, int) from public, anon, authenticated;
  grant execute on function public.player_bond_add(uuid, uuid, int) to service_role;
end $$;


-- ==================================================================== 117_written_moments.sql
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


-- ==================================================================== 118_club_fees.sql
-- Newtown, part 118: dearer clubs. Every club now charges at the door, ₦250k, ₦500k, ₦1m or ₦10m
-- (src/lib/fees.ts), so the most one door can charge goes up from ₥1,000 to ₥10,000. Everything
-- else about club entry (part 67) stays the same: paid once, good for 24 hours, the money burned.
--
-- Safe to run more than once. Run after part 117.

/**
 * Into a club: free if you paid in the last 24 hours, otherwise pays the fee (mint, at most 10,000:
 * ₦15m at ₦1,500 a mint, room for the ₦10m clubs).
 * Returns what was paid now and until when you're in.
 */
create or replace function public.life_club_entry(p_user uuid, p_place text, p_fee numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric := round(least(10000, greatest(0, coalesce(p_fee, 0))), 2);
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
  revoke all on function public.life_club_entry(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_club_entry(uuid, text, numeric) to service_role;
end $$;


-- ==================================================================== 119_road_moments.sql
-- Newtown, part 119: more moments on the road. A road moment (the trip film, docs/TRIPS.md) only
-- waits for the last road moment now (5 minutes), not for any moment: a street moment every 12 to
-- 18 minutes had been keeping almost every trip quiet. Street moments still wait for any moment,
-- and the daily cap still counts them all together.
--
-- Safe to run more than once. Run after part 118.

create or replace function public.moment_open(p_user uuid, p_moment text, p_vars jsonb, p_spot text, p_gap int, p_per_day int, p_follow bigint default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
  v_today int;
  v_id bigint;
begin
  perform 1 from public.profiles where id = p_user for update;
  if p_spot = 'road' then
    select max(created_at) into v_last from public.moments where user_id = p_user and spot = 'road';
  else
    select max(created_at) into v_last from public.moments where user_id = p_user;
  end if;
  if v_last is not null and v_last > now() - make_interval(secs => greatest(0, p_gap)) then raise exception 'too_soon'; end if;
  select count(*) into v_today from public.moments where user_id = p_user and created_at >= date_trunc('day', now());
  if v_today >= p_per_day then raise exception 'daily_cap'; end if;
  update public.moments set answered_at = now(), choice = -1 where user_id = p_user and answered_at is null;
  if p_follow is not null then delete from public.moment_followups where id = p_follow and user_id = p_user; end if;
  insert into public.moments (user_id, moment, vars, spot) values (p_user, left(p_moment, 40), coalesce(p_vars, '{}'::jsonb), left(coalesce(p_spot, 'street'), 20))
    returning id into v_id;
  return v_id;
end $$;

revoke all on function public.moment_open(uuid, text, jsonb, text, int, int, bigint) from public, anon, authenticated;
grant execute on function public.moment_open(uuid, text, jsonb, text, int, int, bigint) to service_role;


-- ==================================================================== 120_restaurant_orders.sql
-- Newtown, part 120: food at a table costs money (docs/FOOD.md). Order sitting down in a restaurant,
-- a club, a lounge or a hotel and the bill (worked out by the game from the menu and the place: a
-- hotel costs more than a buka) is paid from your Fun money, then savings, then essentials, and
-- burned like other spending. A good meal lifts Mind and Body a little.
--
-- Safe to run more than once. Run after part 119.

insert into public.game_settings (key, value, note) values
  ('food_order_max', 200, 'Most one order at a table can cost (mint, a sanity check: six dishes at a hotel is about 150)')
on conflict (key) do update set note = excluded.note;

/** Pay for an order at a table. Returns what was paid. */
create or replace function public.life_order_food(p_user uuid, p_place text, p_items text, p_cost numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(least(public.setting('food_order_max'), greatest(0, coalesce(p_cost, 0))), 2);
  v_paid numeric := 0;
  p public.profiles;
begin
  if p_place is null or p_place !~ '^b:[0-9]{1,7}$' then raise exception 'bad_place'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings', 'essentials']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    v_paid := public.life_spend(p_user, array['fun', 'savings', 'essentials'], v_cost);
    perform public.log_coins(p_user, null, 'food', -v_paid, false, left('Ate out: ' || coalesce(p_items, 'a meal'), 120));
    perform public.burn(null, v_paid, 'Restaurants');
  end if;
  return v_paid;
end $$;

do $$
begin
  revoke all on function public.life_order_food(uuid, text, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_order_food(uuid, text, text, numeric) to service_role;
end $$;


-- ==================================================================== 121_games_cost.sql
-- Newtown, part 121: games cost money to play, and never pay money out (src/lib/fees.ts,
-- gameFeeMint). Every go at a game (Games, the shooting range, paintball, chess or draughts
-- against someone) is paid from your Fun money, then savings, then essentials, and burned like
-- other spending. A heist step or a job shift stays free (the game never asks for those).
-- The old room games' rewards for good scores (part 19) now pay nothing. (Part 36's reward stays,
-- for the tip after a good job shift: that's work, not a game.)
--
-- Safe to run more than once. Run after part 120.

insert into public.game_settings (key, value, note) values
  ('game_fee_max', 20, 'Most one go at a game can cost (mint, a sanity check: the shooting range is about 3.3)')
on conflict (key) do update set note = excluded.note;

/** Pay for one go at a game. Returns what was paid. */
create or replace function public.life_play_game(p_user uuid, p_game text, p_fee numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_fee numeric := round(least(public.setting('game_fee_max'), greatest(0, coalesce(p_fee, 0))), 2);
  v_paid numeric := 0;
  p public.profiles;
begin
  if p_game is null or p_game !~ '^[a-z0-9-]{2,30}$' then raise exception 'bad_game'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_fee > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings', 'essentials']) < v_fee then raise exception 'not_enough:%', trim_scale(v_fee); end if;
    v_paid := public.life_spend(p_user, array['fun', 'savings', 'essentials'], v_fee);
    perform public.log_coins(p_user, null, 'game_fee', -v_paid, false, 'Played: ' || p_game);
    perform public.burn(null, v_paid, 'Games');
  end if;
  return v_paid;
end $$;

-- Good scores at the room games no longer pay.
create or replace function public.claim_activity_reward(p_user uuid, p_game text, p_score numeric) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('coins', 0, 'reason', 'daily_limit', 'left_today', 0);
$$;

do $$
begin
  revoke all on function public.life_play_game(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_play_game(uuid, text, numeric) to service_role;
  revoke all on function public.claim_activity_reward(uuid, text, numeric) from public, anon, authenticated;
  grant execute on function public.claim_activity_reward(uuid, text, numeric) to service_role;
end $$;


-- ==================================================================== 122_host_games.sql
-- Newtown, part 122: hosting a game (the Play button, docs/CHALLENGES.md "Play: host a game").
-- Anyone can host one of the table games (Whot!, chess, draughts, paintball, Truth or Dare,
-- Impostor) right where they are, now. Hosting always costs a fee (₦20,000 for a two-player game,
-- ₦100,000 for one with more players; the game sends it in mint), paid from Fun money, then the
-- wallet, and burned. Everyone nearby is told and the spot lights up; there are a few minutes to
-- join. Players who come late can get in line for the next game (challenge_next): when the host
-- (or anyone) hosts the next one there, they're told first.
--
-- Safe to run more than once. Run after part 121.

/**
 * Host a game now. p_fee: the hosting fee (mint, always paid; the stake is paid into the pool as
 * in challenge_open). p_secs: how long others have to join (60 to 600 seconds). Errors as
 * challenge_open.
 */
create or replace function public.challenge_host(p_user uuid, p_region text, p_game text, p_stake numeric, p_x int, p_z int, p_seats int, p_fee numeric, p_secs int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_fee numeric := round(least(5000, greatest(0, coalesce(p_fee, 0))), 2);
  v_stake numeric := round(least(10000, greatest(0, coalesce(p_stake, 0))), 2);
  v_id bigint;
  v_seed bigint := floor(random() * 2000000000)::bigint;
  v_starts timestamptz := now() + make_interval(secs => greatest(60, least(600, coalesce(p_secs, 180))));
begin
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if public.challenge_busy(p_user) is not null then raise exception 'busy'; end if;
  if public.life_can_spend(p_user, array['fun']) < v_fee + v_stake then raise exception 'not_enough:%', trim_scale(v_fee + v_stake); end if;
  if v_fee > 0 then
    perform public.life_spend(p_user, array['fun'], v_fee);
    perform public.log_coins(p_user, null, 'game_host', -v_fee, false, 'Hosting a game');
    perform public.burn(null, v_fee, 'Hosting games');
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

-- In line for the next game: someone who came while a game was on (or full) and wants in next.
create table if not exists public.challenge_next (
  challenge_id bigint not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists challenge_next_user_idx on public.challenge_next (user_id, at desc);

/** Get in line for the next game after this one (or out of line, p_on false). Returns the line's length. */
create or replace function public.challenge_queue(p_user uuid, p_id bigint, p_on boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare c public.challenges;
begin
  select * into c from public.challenges where id = p_id;
  if not found then raise exception 'gone'; end if;
  if p_on then
    if c.status not in ('open', 'playing') then raise exception 'gone'; end if;
    if exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_user and left_at is null) then raise exception 'already_in'; end if;
    if (select count(*) from public.challenge_next where challenge_id = p_id) >= 12 then raise exception 'full'; end if;
    insert into public.challenge_next (challenge_id, user_id) values (p_id, p_user) on conflict do nothing;
  else
    delete from public.challenge_next where challenge_id = p_id and user_id = p_user;
  end if;
  return (select count(*)::int from public.challenge_next where challenge_id = p_id);
end $$;

do $$
begin
  revoke all on table public.challenge_next from public, anon, authenticated;
  grant all on table public.challenge_next to service_role;
  revoke all on function public.challenge_host(uuid, text, text, numeric, int, int, int, numeric, int), public.challenge_queue(uuid, bigint, boolean) from public, anon, authenticated;
  grant execute on function public.challenge_host(uuid, text, text, numeric, int, int, int, numeric, int), public.challenge_queue(uuid, bigint, boolean) to service_role;
end $$;


-- ==================================================================== 123_scheduled_games.sql
-- Newtown, part 123: scheduled games, starting with Police & Thieves (docs/POLICE_THIEVES.md).
-- A scheduled game starts at set times of day (Police & Thieves: 2am, 10am and 6pm Lagos time,
-- 01:00, 09:00 and 17:00 UTC). Players sign up for the next one on a side (police or thieves:
-- a side can never get more than one ahead of the other), pay the ticket and buy their gear
-- (guns, grenades, rocket launchers, tanks...: the game sends each price, from src/lib/cops.ts).
-- Everything spent goes into the pool, less a tenth for the house. At the start the players are
-- shared into matches of up to 8 a side (round-robin by when they signed up, so the matches are
-- even) and each match gets its share of the pool. When a match ends, each phone sends in how it
-- ended; the winning side's players share their match's pool by what each of them did.
--
-- Trusting the phones' results: a side's win counts when a player on the OTHER side says so too
-- (owning up to a loss), or, in a match with players on one side only, when most of them agree.
-- Each player's share uses the middle value (median) of what the phones say they did, so one
-- phone can't puff itself up. Nobody agrees within 3 minutes of the end: everyone gets back their
-- part of the pool. A side made of bots that wins: its pool goes into the jackpot, which is added
-- to the next game's matches that have people on both sides.
--
-- Safe to run more than once. Run after part 122.

create table if not exists public.sched_games (
  game text primary key,
  hours_utc int[] not null,
  warmup_secs int not null,
  play_secs int not null,
  grace_secs int not null default 180,
  side_size int not null default 8,
  house_cut numeric not null default 0.1,
  -- Most one player can spend on one game (ticket and gear, mint).
  max_spend numeric not null default 500,
  note text
);
insert into public.sched_games (game, hours_utc, warmup_secs, play_secs, grace_secs, side_size, house_cut, max_spend, note) values
  ('cops-robbers', '{1,9,17}', 30, 600, 180, 8, 0.1, 500, 'Police & Thieves: 2am, 10am and 6pm Lagos time')
on conflict (game) do update set hours_utc = excluded.hours_utc, warmup_secs = excluded.warmup_secs, play_secs = excluded.play_secs,
  grace_secs = excluded.grace_secs, side_size = excluded.side_size, house_cut = excluded.house_cut, max_spend = excluded.max_spend, note = excluded.note;

create table if not exists public.sched_sessions (
  id bigserial primary key,
  game text not null references public.sched_games (game),
  starts_at timestamptz not null,
  fight_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'playing', 'done')),
  rooms int not null default 0,
  created_at timestamptz not null default now(),
  unique (game, starts_at)
);

create table if not exists public.sched_players (
  session_id bigint not null references public.sched_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- 0 police, 1 thieves.
  side smallint not null check (side in (0, 1)),
  joined_at timestamptz not null default clock_timestamp(),
  spent numeric(14,2) not null default 0,
  gear jsonb not null default '{}',
  room int,
  -- What this player's phone said at the end: {w: winning side (-1 a draw), s: {user: [activity, takedowns, downs, loot]}}.
  report jsonb,
  reported_at timestamptz,
  prize numeric(14,2) not null default 0,
  primary key (session_id, user_id)
);
create index if not exists sched_players_user_idx on public.sched_players (user_id, session_id desc);

create table if not exists public.sched_rooms (
  session_id bigint not null references public.sched_sessions (id) on delete cascade,
  room int not null,
  seed bigint not null,
  pool numeric(14,2) not null default 0,
  status text not null default 'playing' check (status in ('playing', 'done')),
  -- 0 or 1 the side that won, -1 a draw, -2 nobody agreed (everyone's part back).
  winner smallint,
  result jsonb,
  settled_at timestamptz,
  primary key (session_id, room)
);

create table if not exists public.sched_jackpot (
  game text primary key references public.sched_games (game),
  amount numeric(14,2) not null default 0
);

/** The session that starts at p_starts (made the first time it's asked for). Only real start times, and only the next one or one being played. */
create or replace function public.sched_session(p_game text, p_starts timestamptz) returns public.sched_sessions
language plpgsql security definer set search_path = public as $$
declare
  g public.sched_games;
  s public.sched_sessions;
begin
  select * into g from public.sched_games where game = p_game;
  if not found then raise exception 'bad_game'; end if;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts for update;
  if found then return s; end if;
  if extract(hour from p_starts at time zone 'UTC')::int <> all (g.hours_utc)
     or date_trunc('hour', p_starts) <> p_starts then raise exception 'bad_time'; end if;
  -- Not too far ahead (the next one only), not already over.
  if p_starts > now() + interval '9 hours' or p_starts + make_interval(secs => g.warmup_secs + g.play_secs) < now() then raise exception 'bad_time'; end if;
  insert into public.sched_sessions (game, starts_at, fight_at, ends_at)
    values (p_game, p_starts, p_starts + make_interval(secs => g.warmup_secs), p_starts + make_interval(secs => g.warmup_secs + g.play_secs))
    on conflict (game, starts_at) do nothing;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts for update;
  return s;
end $$;

/** Who's signed up for a session, on each side. */
create or replace function public.sched_counts(p_session bigint) returns int[]
language sql stable security definer set search_path = public as $$
  select array[count(*) filter (where side = 0), count(*) filter (where side = 1)]::int[] from public.sched_players where session_id = p_session
$$;

/**
 * Sign up for a session on a side (0 police, 1 thieves), paying the ticket (p_ticket, mint, from
 * Fun money then the wallet). A side can't get ahead of the other by more than one: if it's
 * ahead, choose the other side (or wait for someone to join it). Already in: changes your side
 * if that keeps it even. Errors: side_full, started, not_enough:<mint>, frozen.
 */
create or replace function public.sched_join(p_user uuid, p_game text, p_starts timestamptz, p_side int, p_ticket numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  g public.sched_games;
  p public.profiles;
  me public.sched_players;
  c int[];
  v_ticket numeric := round(least(50, greatest(0, coalesce(p_ticket, 0))), 2);
begin
  if p_side not in (0, 1) then raise exception 'bad_side'; end if;
  s := public.sched_session(p_game, p_starts);
  select * into g from public.sched_games where game = p_game;
  if now() >= s.starts_at then raise exception 'started'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  c := public.sched_counts(s.id);
  select * into me from public.sched_players where session_id = s.id and user_id = p_user;
  if found then
    if me.side = p_side then return public.sched_mine(p_user, s.id); end if;
    -- Changing sides: only to the smaller side (so it stays even).
    if c[p_side + 1] >= c[me.side + 1] then raise exception 'side_full'; end if;
    update public.sched_players set side = p_side, joined_at = clock_timestamp() where session_id = s.id and user_id = p_user;
    return public.sched_mine(p_user, s.id);
  end if;
  if c[p_side + 1] > c[(1 - p_side) + 1] then raise exception 'side_full'; end if;
  if v_ticket > 0 then
    if public.life_can_spend(p_user, array['fun']) < v_ticket then raise exception 'not_enough:%', trim_scale(v_ticket); end if;
    perform public.life_spend(p_user, array['fun'], v_ticket);
    perform public.log_coins(p_user, null, 'sched_ticket', -v_ticket, false, 'Ticket: ' || p_game);
  end if;
  insert into public.sched_players (session_id, user_id, name, side, spent)
    values (s.id, p_user, coalesce(nullif(p.username, ''), 'Player'), p_side, v_ticket);
  return public.sched_mine(p_user, s.id);
end $$;

/**
 * Buy gear for a session you're signed up for (before it starts): p_qty of p_item at p_price each
 * (mint, the game's own price), up to p_max of it. Errors: not_in, started, too_many, spend_cap,
 * not_enough:<mint>.
 */
create or replace function public.sched_buy(p_user uuid, p_game text, p_starts timestamptz, p_item text, p_qty int, p_price numeric, p_max int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  g public.sched_games;
  me public.sched_players;
  v_qty int := greatest(1, least(10, coalesce(p_qty, 1)));
  v_price numeric := round(least(250, greatest(0, coalesce(p_price, 0))), 2);
  v_have int;
  v_cost numeric;
begin
  if p_item is null or p_item !~ '^[a-z]{2,16}$' then raise exception 'bad_item'; end if;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts for update;
  if not found then raise exception 'not_in'; end if;
  select * into g from public.sched_games where game = p_game;
  if now() >= s.starts_at then raise exception 'started'; end if;
  select * into me from public.sched_players where session_id = s.id and user_id = p_user for update;
  if not found then raise exception 'not_in'; end if;
  v_have := coalesce((me.gear ->> p_item)::int, 0);
  if v_have + v_qty > greatest(1, least(10, coalesce(p_max, 1))) then raise exception 'too_many'; end if;
  v_cost := round(v_price * v_qty, 2);
  if me.spent + v_cost > g.max_spend then raise exception 'spend_cap'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['fun']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    perform public.life_spend(p_user, array['fun'], v_cost);
    perform public.log_coins(p_user, null, 'sched_gear', -v_cost, false, 'Gear: ' || p_item);
  end if;
  update public.sched_players set gear = jsonb_set(gear, array[p_item], to_jsonb(v_have + v_qty)), spent = spent + v_cost
    where session_id = s.id and user_id = p_user;
  return public.sched_mine(p_user, s.id);
end $$;

/** Pull out before it starts: everything you spent comes back to your wallet. */
create or replace function public.sched_leave(p_user uuid, p_game text, p_starts timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  me public.sched_players;
begin
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts for update;
  if not found then return jsonb_build_object('in', false); end if;
  if now() >= s.starts_at then raise exception 'started'; end if;
  delete from public.sched_players where session_id = s.id and user_id = p_user returning * into me;
  if found and me.spent > 0 then
    update public.profiles set coins = coins + me.spent where id = p_user;
    perform public.log_coins(p_user, null, 'sched_refund', me.spent, false, 'Pulled out: ' || p_game);
  end if;
  return jsonb_build_object('in', false);
end $$;

/** You in a session: your side, gear, what you've spent, your match and prize (in: false if you're not signed up). */
create or replace function public.sched_mine(p_user uuid, p_session bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('in', true, 'side', side, 'gear', gear, 'spent', spent, 'room', room, 'prize', prize, 'reported', report is not null)
       from public.sched_players where session_id = p_session and user_id = p_user),
    jsonb_build_object('in', false))
$$;

/**
 * Start a session once its time has come (any call does it; doing it again does nothing): share
 * the players into matches (as many as it takes for up to side_size a side, round-robin by
 * sign-up), give each match its pool (what its players spent, less the house's cut) and a seed for
 * its map, and the jackpot to the matches with people on both sides.
 */
create or replace function public.sched_begin(p_session bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  g public.sched_games;
  c int[];
  n int;
  v_total numeric;
  v_jack numeric;
  v_both int;
begin
  select * into s from public.sched_sessions where id = p_session for update;
  if not found or s.status <> 'open' or now() < s.starts_at then return; end if;
  select * into g from public.sched_games where game = s.game;
  c := public.sched_counts(s.id);
  if c[1] + c[2] = 0 then
    update public.sched_sessions set status = 'done' where id = s.id;
    return;
  end if;
  n := greatest(1, ceil(greatest(c[1], c[2])::numeric / g.side_size)::int);
  update public.sched_players sp set room = r.room
    from (select user_id, ((row_number() over (partition by side order by joined_at, user_id) - 1) % n + 1)::int as room
            from public.sched_players where session_id = s.id) r
    where sp.session_id = s.id and sp.user_id = r.user_id;
  insert into public.sched_rooms (session_id, room, seed, pool)
    select s.id, k, floor(random() * 2000000000)::bigint,
           round(coalesce((select sum(spent) from public.sched_players where session_id = s.id and room = k), 0) * (1 - g.house_cut), 2)
      from generate_series(1, n) k
    on conflict do nothing;
  select coalesce(sum(spent), 0) into v_total from public.sched_players where session_id = s.id;
  perform public.burn(null, round(v_total * g.house_cut, 2), 'Scheduled games: ' || s.game);
  -- The jackpot, shared between the matches with people on both sides.
  select count(*) into v_both from public.sched_rooms r where r.session_id = s.id
    and exists (select 1 from public.sched_players where session_id = s.id and room = r.room and side = 0)
    and exists (select 1 from public.sched_players where session_id = s.id and room = r.room and side = 1);
  select amount into v_jack from public.sched_jackpot where game = s.game for update;
  if coalesce(v_jack, 0) > 0 and v_both > 0 then
    update public.sched_rooms r set pool = pool + round(v_jack / v_both, 2) where r.session_id = s.id
      and exists (select 1 from public.sched_players where session_id = s.id and room = r.room and side = 0)
      and exists (select 1 from public.sched_players where session_id = s.id and room = r.room and side = 1);
    update public.sched_jackpot set amount = 0 where game = s.game;
  end if;
  update public.sched_sessions set status = 'playing', rooms = n where id = s.id;
end $$;

/** The middle value of some numbers (0 for none). */
create or replace function public.sched_median(p numeric[]) returns numeric
language sql immutable as $$
  select coalesce((select percentile_cont(0.5) within group (order by v) from unnest(p) v), 0)::numeric
$$;

/**
 * Settle a match from what the phones said (see the top of this file). p_force: the grace time
 * after the end is over, so settle with what there is. Returns the result ({waiting: true} until
 * it can be settled): the winner and everyone's line on the leaderboard (activity, takedowns,
 * downs, loot, prize).
 */
create or replace function public.sched_settle(p_session bigint, p_room int, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.sched_rooms;
  h0 int;
  h1 int;
  v_reps int;
  v_w int;
  cand int;
  v_votes int;
  v_total numeric;
  v_spent numeric;
  v_paid numeric := 0;
  v_jack boolean := false;
  v_game text;
  pl record;
  v_rows jsonb := '[]';
  v_act numeric[];
  v_prize numeric;
  v_n int;
begin
  select * into r from public.sched_rooms where session_id = p_session and room = p_room for update;
  if not found then raise exception 'gone'; end if;
  if r.status = 'done' then return r.result; end if;
  select game into v_game from public.sched_sessions where id = p_session;
  select count(*) filter (where side = 0), count(*) filter (where side = 1), count(*) filter (where report is not null)
    into h0, h1, v_reps from public.sched_players where session_id = p_session and room = p_room;
  -- Which result stands.
  foreach cand in array array[0, 1, -1] loop
    select count(*) into v_votes from public.sched_players where session_id = p_session and room = p_room and (report ->> 'w')::int = cand;
    if cand >= 0 and exists (select 1 from public.sched_players where session_id = p_session and room = p_room and side <> cand and (report ->> 'w')::int = cand) then
      v_w := cand;
    elsif cand = -1 and h0 > 0 and h1 > 0
      and exists (select 1 from public.sched_players where session_id = p_session and room = p_room and side = 0 and (report ->> 'w')::int = -1)
      and exists (select 1 from public.sched_players where session_id = p_session and room = p_room and side = 1 and (report ->> 'w')::int = -1) then
      v_w := cand;
    elsif (h0 = 0 or h1 = 0) and v_votes * 2 > (h0 + h1) then
      v_w := cand;
    end if;
    exit when v_w is not null;
  end loop;
  if v_w is null then
    if not p_force then return jsonb_build_object('waiting', true); end if;
    -- Time's up: everyone who said agrees (the others never said), or it's nobody's.
    cand := null;
    select min((report ->> 'w')::int) into cand from public.sched_players where session_id = p_session and room = p_room and report is not null
      having count(distinct (report ->> 'w')::int) = 1;
    v_w := coalesce(cand, -2);
  end if;
  -- Everyone's numbers: the middle of what the phones said.
  create temp table if not exists sched_tally (user_id uuid, side int, name text, spent numeric, a numeric, k numeric, d numeric, l numeric) on commit drop;
  -- ("where true": Supabase refuses a DELETE without a WHERE when the game calls it.)
  delete from sched_tally where true;
  for pl in select * from public.sched_players where session_id = p_session and room = p_room loop
    select array[
        public.sched_median(array_agg(least(1000000, greatest(0, coalesce((x.report -> 's' -> pl.user_id::text ->> 0)::numeric, 0))))),
        public.sched_median(array_agg(least(999, greatest(0, coalesce((x.report -> 's' -> pl.user_id::text ->> 1)::numeric, 0))))),
        public.sched_median(array_agg(least(999, greatest(0, coalesce((x.report -> 's' -> pl.user_id::text ->> 2)::numeric, 0))))),
        public.sched_median(array_agg(least(999, greatest(0, coalesce((x.report -> 's' -> pl.user_id::text ->> 3)::numeric, 0)))))]
      into v_act
      from public.sched_players x where x.session_id = p_session and x.room = p_room and x.report is not null;
    insert into sched_tally values (pl.user_id, pl.side, pl.name, pl.spent, round(coalesce(v_act[1], 0)), round(coalesce(v_act[2], 0)), round(coalesce(v_act[3], 0)), round(coalesce(v_act[4], 0)));
  end loop;
  if v_w in (0, 1) then
    select count(*), coalesce(sum(a), 0) into v_n, v_total from sched_tally where side = v_w;
    if v_n = 0 then
      v_jack := true;
    else
      for pl in select * from sched_tally where side = v_w loop
        v_prize := round(r.pool * (case when v_total > 0 then pl.a / v_total else 1.0 / v_n end), 2);
        if v_prize > 0 then
          update public.profiles set coins = coins + v_prize where id = pl.user_id;
          perform public.log_coins(pl.user_id, null, 'sched_win', v_prize, false, 'Won: ' || v_game);
          update public.sched_players set prize = v_prize where session_id = p_session and user_id = pl.user_id;
          v_paid := v_paid + v_prize;
        end if;
      end loop;
    end if;
  else
    -- A draw, or nobody agreed: everyone's part of the pool back.
    select coalesce(sum(spent), 0) into v_spent from sched_tally;
    for pl in select * from sched_tally loop
      v_prize := round(r.pool * (case when v_spent > 0 then pl.spent / v_spent else 0 end), 2);
      if v_prize > 0 then
        update public.profiles set coins = coins + v_prize where id = pl.user_id;
        perform public.log_coins(pl.user_id, null, 'sched_refund', v_prize, false, 'A draw: ' || v_game);
        update public.sched_players set prize = v_prize where session_id = p_session and user_id = pl.user_id;
        v_paid := v_paid + v_prize;
      end if;
    end loop;
  end if;
  if v_jack then
    insert into public.sched_jackpot (game, amount) values (v_game, r.pool) on conflict (game) do update set amount = sched_jackpot.amount + excluded.amount;
  elsif r.pool - v_paid > 0 then
    perform public.burn(null, r.pool - v_paid, 'Scheduled games: rounding');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('i', t.user_id, 'n', t.name, 'tm', t.side, 'a', t.a, 'k', t.k, 'd', t.d, 'l', t.l,
           'p', (select prize from public.sched_players where session_id = p_session and user_id = t.user_id)) order by t.a desc), '[]')
    into v_rows from sched_tally t;
  update public.sched_rooms set status = 'done', winner = v_w, settled_at = now(),
      result = jsonb_build_object('w', v_w, 'pool', r.pool, 'jackpot', v_jack, 'rows', v_rows)
    where session_id = p_session and room = p_room;
  if not exists (select 1 from public.sched_rooms where session_id = p_session and status <> 'done') then
    update public.sched_sessions set status = 'done' where id = p_session;
  end if;
  return jsonb_build_object('w', v_w, 'pool', r.pool, 'jackpot', v_jack, 'rows', v_rows);
end $$;

/** Tidy up a game: start sessions whose time has come, settle matches whose grace time is over. */
create or replace function public.sched_sweep(p_game text) returns void
language plpgsql security definer set search_path = public as $$
declare x record;
begin
  for x in select id from public.sched_sessions where game = p_game and status = 'open' and starts_at <= now() limit 5 loop
    perform public.sched_begin(x.id);
  end loop;
  for x in select r.session_id, r.room from public.sched_rooms r join public.sched_sessions s on s.id = r.session_id
           join public.sched_games g on g.game = s.game
           where s.game = p_game and r.status = 'playing' and s.ends_at + make_interval(secs => g.grace_secs) < now() limit 20 loop
    perform public.sched_settle(x.session_id, x.room, true);
  end loop;
end $$;

/**
 * A session as the lobby shows it: when, how many on each side, the pool so far (and the jackpot),
 * you in it, and the last finished game's leaderboard (the top 10 across its matches, and you).
 * Nothing is made by asking.
 */
create or replace function public.sched_status(p_user uuid, p_game text, p_starts timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  g public.sched_games;
  c int[] := array[0, 0];
  v_pool numeric := 0;
  v_jack numeric;
  v_last bigint;
  v_board jsonb;
  v_mine jsonb := jsonb_build_object('in', false);
begin
  perform public.sched_sweep(p_game);
  select * into g from public.sched_games where game = p_game;
  if not found then raise exception 'bad_game'; end if;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts;
  if found then
    c := public.sched_counts(s.id);
    if s.status = 'open' then
      select round(coalesce(sum(spent), 0) * (1 - g.house_cut), 2) into v_pool from public.sched_players where session_id = s.id;
    else
      select coalesce(sum(pool), 0) into v_pool from public.sched_rooms where session_id = s.id;
    end if;
    if p_user is not null then v_mine := public.sched_mine(p_user, s.id); end if;
  end if;
  select amount into v_jack from public.sched_jackpot where game = p_game;
  select id into v_last from public.sched_sessions where game = p_game and status = 'done' and rooms > 0 order by starts_at desc limit 1;
  if v_last is not null then
    select jsonb_build_object(
        'starts_at', (select starts_at from public.sched_sessions where id = v_last),
        'rows', coalesce((select jsonb_agg(t.x) from (
            select e as x from public.sched_rooms r, jsonb_array_elements(r.result -> 'rows') e where r.session_id = v_last
            order by (e ->> 'p')::numeric desc, (e ->> 'a')::numeric desc limit 10) t), '[]'),
        'wins', (select jsonb_agg(jsonb_build_object('room', room, 'w', winner, 'pool', pool)) from public.sched_rooms where session_id = v_last),
        'me', (select jsonb_build_object('side', side, 'prize', prize, 'room', room) from public.sched_players where session_id = v_last and user_id = p_user))
      into v_board;
  end if;
  return jsonb_build_object(
    'status', coalesce(s.status, 'open'), 'police', c[1], 'thieves', c[2], 'pool', v_pool, 'jackpot', coalesce(v_jack, 0),
    'rooms', coalesce(s.rooms, 0), 'me', v_mine, 'last', v_board);
end $$;

/**
 * A match of a session that has started (it starts it, if its time has come): its seed, pool,
 * times and who's in it (each with their side and gear). p_room null: your own match (or the
 * first, to watch). Each player comes with their avatar (worn in their side's uniform). Returns
 * {status: 'open'} before the start.
 */
create or replace function public.sched_room(p_user uuid, p_game text, p_starts timestamptz, p_room int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  r public.sched_rooms;
  v_room int;
begin
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts;
  if not found then return jsonb_build_object('status', 'none'); end if;
  perform public.sched_begin(s.id);
  select * into s from public.sched_sessions where id = s.id;
  if s.status = 'open' then return jsonb_build_object('status', 'open'); end if;
  v_room := coalesce(p_room, (select room from public.sched_players where session_id = s.id and user_id = p_user), 1);
  select * into r from public.sched_rooms where session_id = s.id and room = v_room;
  if not found then return jsonb_build_object('status', s.status, 'rooms', s.rooms); end if;
  return jsonb_build_object(
    'status', s.status, 'room', v_room, 'rooms', s.rooms, 'seed', r.seed, 'pool', r.pool,
    'fight_at', s.fight_at, 'ends_at', s.ends_at, 'done', r.status = 'done', 'result', r.result,
    'me', public.sched_mine(p_user, s.id),
    'roster', coalesce((select jsonb_agg(jsonb_build_object('i', sp.user_id, 'n', sp.name, 'tm', sp.side, 'g', sp.gear, 'a', pr.avatar) order by sp.side, sp.joined_at)
                          from public.sched_players sp join public.profiles pr on pr.id = sp.user_id where sp.session_id = s.id and sp.room = v_room), '[]'));
end $$;

/**
 * Your phone says how your match ended: p_winner (0 police, 1 thieves, -1 a draw) and what everyone
 * did (p_scores: {user: [activity, takedowns, downs, loot]}). Only from 15 seconds before the end
 * (the server knows when it ends), only once. Returns the result once it's settled.
 */
create or replace function public.sched_report(p_user uuid, p_game text, p_starts timestamptz, p_winner int, p_scores jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.sched_sessions;
  me public.sched_players;
begin
  if p_winner not in (-1, 0, 1) or jsonb_typeof(coalesce(p_scores, 'null')) <> 'object' then raise exception 'bad_report'; end if;
  select * into s from public.sched_sessions where game = p_game and starts_at = p_starts;
  if not found then raise exception 'gone'; end if;
  select * into me from public.sched_players where session_id = s.id and user_id = p_user;
  if not found or me.room is null then raise exception 'not_in'; end if;
  if now() < s.ends_at - interval '15 seconds' then raise exception 'too_early'; end if;
  update public.sched_players set report = jsonb_build_object('w', p_winner, 's', p_scores), reported_at = now()
    where session_id = s.id and user_id = p_user and report is null;
  return public.sched_settle(s.id, me.room, false);
end $$;

do $$
declare f text;
begin
  revoke all on table public.sched_games, public.sched_sessions, public.sched_players, public.sched_rooms, public.sched_jackpot from public, anon, authenticated;
  grant all on table public.sched_games, public.sched_sessions, public.sched_players, public.sched_rooms, public.sched_jackpot to service_role;
  grant usage on sequence public.sched_sessions_id_seq to service_role;
  foreach f in array array[
    'sched_session(text, timestamptz)', 'sched_counts(bigint)', 'sched_join(uuid, text, timestamptz, int, numeric)',
    'sched_buy(uuid, text, timestamptz, text, int, numeric, int)', 'sched_leave(uuid, text, timestamptz)', 'sched_mine(uuid, bigint)',
    'sched_begin(bigint)', 'sched_median(numeric[])', 'sched_settle(bigint, int, boolean)', 'sched_sweep(text)',
    'sched_status(uuid, text, timestamptz)', 'sched_room(uuid, text, timestamptz, int)', 'sched_report(uuid, text, timestamptz, int, jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

alter table public.sched_games enable row level security;
alter table public.sched_sessions enable row level security;
alter table public.sched_players enable row level security;
alter table public.sched_rooms enable row level security;
alter table public.sched_jackpot enable row level security;


-- ==================================================================== 124_launch_money.sql
-- Newtown, part 124: closing the money cheats before opening to 1,000 players (docs/LAUNCH_FIXES.md,
-- stage 1).
-- 1. Game results (challenge_report). The pool is paid only when the other players agree: more
--    than half of those still in (not counting the winner) say the same winner, or everyone else
--    gave up. A player saying someone else won only counts as them losing. A lone "I won", or
--    players who disagree, never pays: after challenge_settle_secs with no agreement, everyone's
--    stake goes back.
-- 2. Brand-new accounts (as for gifts, part 107: under gift_new_days days old or below level
--    gift_new_level) can put at most stake_new_daily_max a day into game pools.
-- 3. Trips: at most trip_max_per_minute a minute, and finding something on the way is rolled here
--    (trip_find), at most trip_find_daily_max a day.
-- 4. Whot! for a pool is dealt and refereed on the server (src/app/play/games/whot-actions.ts):
--    the shuffle and everyone's hands are kept here (whot_games), where no phone can read them,
--    each player is sent only their own hand, every move is checked against whose turn it is, and
--    the server pays the winner (challenge_award). The phones' word on who won isn't asked.
-- 5. Online pay (part 83) only for players the server has seen doing something lately (a trip, a
--    message, a moment answered, joining a game, paying for something) in the last
--    online_pay_active_mins minutes. Minutes still count for the daily gift either way.
--
-- Safe to run more than once. Run after part 123 (or any time after 110).

insert into public.game_settings (key, value, note) values
  ('challenge_settle_secs', 180, 'Seconds after the first result is said before a game with no agreement is called off (stakes back)'),
  ('stake_new_daily_max',   500, 'Most mint a new or low-level player can put into game pools a day'),
  ('trip_max_per_minute',    10, 'Most trips a player can make in a minute'),
  ('trip_find_chance',     0.08, 'Chance of finding something on a trip'),
  ('trip_find_daily_max',     3, 'Most things a player can find on trips a day'),
  ('online_pay_active_mins', 20, 'Online pay only for players who did something the server saw in this many minutes')
on conflict (key) do update set note = excluded.note;

-- ============================================================ 1. game results
-- Whot! games played on the server (4): the game as it stands, never sent to a phone whole.
create table if not exists public.whot_games (
  challenge_id bigint primary key references public.challenges (id) on delete cascade,
  -- { s: the rules' state (hands, market, seed...), pile: the last cards played, at: when this
  --   turn began (ms), missed: turns each seat let run out in a row }.
  game jsonb not null,
  -- Moves played: a move is saved only onto the game it was checked against.
  n int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.whot_games enable row level security;

/**
 * Pay a game's winner the pool less a tenth, or give everyone their stake back (p_winner null).
 * Only for games still being played; the winner must still be in it (else stakes back). For the
 * server's own games and challenge_report. Returns { winner, prize } or { draw: true }.
 */
create or replace function public.challenge_award(p_id bigint, p_winner uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  v_prize numeric;
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if c.status = 'done' then return jsonb_build_object('winner', c.winner_id, 'prize', c.prize); end if;
  if c.status <> 'playing' then return jsonb_build_object('winner', null, 'draw', true); end if;
  if p_winner is null or not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_winner and left_at is null) then
    perform public.challenge_refund(p_id);
    return jsonb_build_object('winner', null, 'draw', true);
  end if;
  v_prize := round(c.pool * 0.9, 2);
  if v_prize > 0 then
    update public.profiles set coins = coins + v_prize where id = p_winner;
    perform public.log_coins(p_winner, null, 'challenge_win', v_prize, false, 'Won a challenge');
    perform public.burn(null, c.pool - v_prize, 'Challenge pools');
  end if;
  update public.challenges set status = 'done', winner_id = p_winner, prize = v_prize, finished_at = now() where id = p_id;
  return jsonb_build_object('winner', p_winner, 'prize', v_prize);
end $$;

/**
 * A player says how it ended: who won, or a draw (p_draw). p_winner null and p_draw false: just
 * checking. The winner (still in the game) is paid the pool less a tenth when more than half of
 * the other players still in say they won, or when everyone else gave up. More than half of
 * those still in saying draw: stakes back. No agreement challenge_settle_secs after the first
 * answer (a lone claim, or a dispute): stakes back. A game the server plays (whot_games) takes
 * no claims: only everyone else giving up ends it here. Returns the winner once paid ({draw:
 * true} when the stakes went back).
 */
create or replace function public.challenge_report(p_user uuid, p_id bigint, p_winner uuid, p_draw boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.challenges;
  v_in int;
  v_draws int;
  v_first timestamptz;
  v_w uuid;
  v_found int := 0;
  r record;
  v_server boolean := exists (select 1 from public.whot_games where challenge_id = p_id);
begin
  select * into c from public.challenges where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if c.status = 'done' then return jsonb_build_object('winner', c.winner_id, 'prize', c.prize); end if;
  if c.status = 'cancelled' then return jsonb_build_object('winner', null, 'draw', true); end if;
  if c.status <> 'playing' then raise exception 'not_playing'; end if;
  if not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_user) then raise exception 'not_in'; end if;
  if p_winner is not null and not exists (select 1 from public.challenge_players where challenge_id = p_id and user_id = p_winner) then raise exception 'bad_winner'; end if;
  if v_server then
    null;
  elsif coalesce(p_draw, false) then
    update public.challenge_players set says = null, says_draw = true, said_at = coalesce(said_at, now()) where challenge_id = p_id and user_id = p_user;
  elsif p_winner is not null then
    update public.challenge_players set says = p_winner, says_draw = false, said_at = coalesce(said_at, now()) where challenge_id = p_id and user_id = p_user;
  end if;
  select count(*) filter (where left_at is null), count(*) filter (where left_at is null and says_draw), min(said_at)
    into v_in, v_draws, v_first from public.challenge_players where challenge_id = p_id;
  -- A draw: more than half of those still in say so. Stakes back.
  if v_draws > 0 and v_draws * 2 > v_in then
    perform public.challenge_refund(p_id);
    return jsonb_build_object('winner', null, 'draw', true);
  end if;
  -- Who the others agree won: each player still in, against what the other players still in say.
  for r in
    select w.user_id,
           count(o.user_id) as others,
           count(o.user_id) filter (where o.says = w.user_id) as agree,
           exists (select 1 from public.challenge_players g where g.challenge_id = p_id and g.left_at is not null and g.user_id <> w.user_id) as gave_up
    from public.challenge_players w
    left join public.challenge_players o on o.challenge_id = p_id and o.user_id <> w.user_id and o.left_at is null
    where w.challenge_id = p_id and w.left_at is null
    group by w.user_id
  loop
    if (r.others = 0 and r.gave_up) or (not v_server and r.others > 0 and r.agree * 2 > r.others) then
      v_w := r.user_id;
      v_found := v_found + 1;
    end if;
  end loop;
  if v_found <> 1 then
    -- Nobody agreed on (or two players each said the other won): stakes back once it's had time.
    if v_first is not null and v_first < now() - make_interval(secs => coalesce(public.setting('challenge_settle_secs'), 180)::int) then
      perform public.challenge_refund(p_id);
      return jsonb_build_object('winner', null, 'draw', true);
    end if;
    return jsonb_build_object('winner', null, 'waiting', true);
  end if;
  return public.challenge_award(p_id, v_w);
end $$;

/** Tidy up: open ones whose minute is long gone, results nobody agreed on in time (stakes back), and games nobody finished in 45 minutes (stakes back). */
create or replace function public.challenge_sweep(p_region text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.challenges where region = p_region and status = 'open' and starts_at < now() - interval '20 seconds' limit 20 loop
    perform public.challenge_begin(r.id);
  end loop;
  -- Games with a result said a while ago whose players all closed the game: settle them now.
  for r in select distinct on (c.id) c.id, cp.user_id from public.challenges c join public.challenge_players cp on cp.challenge_id = c.id
           where c.region = p_region and c.status = 'playing' and (cp.says is not null or cp.says_draw)
             and cp.said_at < now() - make_interval(secs => coalesce(public.setting('challenge_settle_secs'), 180)::int) limit 20 loop
    perform public.challenge_report(r.user_id, r.id, null, false);
  end loop;
  for r in select id from public.challenges where region = p_region and status = 'playing' and started_at < now() - interval '45 minutes' limit 20 loop
    perform public.challenge_refund(r.id);
  end loop;
end $$;

-- ============================================================ 2. new accounts' stakes
/** How much more this player may put into game pools today: null when there's no limit (as gift_left_today). */
create or replace function public.stake_left_today(p public.profiles) returns numeric
language sql stable set search_path = public as $$
  select case
    when p.created_at > now() - make_interval(days => public.setting('gift_new_days')::int)
      or coalesce(p.level, 1) < public.setting('gift_new_level')
    then greatest(0, public.setting('stake_new_daily_max') - (
      select coalesce(sum(cp.paid), 0) from public.challenge_players cp join public.challenges c on c.id = cp.challenge_id
      where cp.user_id = p.id and cp.joined_at >= date_trunc('day', now()) and c.status <> 'cancelled'))
    else null end
$$;

-- Every way into a game (challenging, hosting, inviting, joining) adds a player row: checked here.
create or replace function public.challenge_stake_cap() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  v_left numeric;
begin
  select * into p from public.profiles where id = new.user_id;
  v_left := public.stake_left_today(p);
  if v_left is not null and new.paid > v_left then raise exception 'new_stake_cap:%', trim_scale(v_left); end if;
  return new;
end $$;
drop trigger if exists challenge_stake_cap on public.challenge_players;
create trigger challenge_stake_cap before insert on public.challenge_players
  for each row when (new.paid > 0) execute function public.challenge_stake_cap();

-- ============================================================ 5. seen doing something (for online pay)
alter table public.lives add column if not exists acted_at timestamptz;
-- Today's online pay row in the ledger (one a day, added to: online_ping).
alter table public.activity_days add column if not exists pay_ledger bigint;

/** The server saw this player do something just now (written at most every 30 seconds). */
create or replace function public.life_acted(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.lives set acted_at = now() where user_id = p_user and (acted_at is null or acted_at < now() - interval '30 seconds')
$$;

create or replace function public.acted_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then perform public.life_acted(new.user_id); end if;
  return new;
end $$;
drop trigger if exists acted_ledger on public.ledger;
-- Money the player chose to spend (not bills, rent or taxes taken by themselves).
create trigger acted_ledger after insert on public.ledger
  for each row when (new.amount < 0 and new.kind in ('commute', 'challenge_stake', 'challenge_fee', 'game_host', 'game_fee', 'mark', 'gift_sent',
    'spray_sent', 'ticket', 'event_ticket', 'club_entry', 'gym', 'property_buy', 'home_upgrade', 'landmark_buy', 'craft_cost', 'prank', 'bet',
    'hustle_start', 'business_start', 'event_hosting', 'procedure', 'service_hold', 'offer_hold', 'sched_ticket', 'sched_gear', 'duel_fee',
    'market_fee', 'stake', 'heist_stake'))
  execute function public.acted_ledger();

create or replace function public.acted_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.life_acted(new.sender_id);
  return new;
end $$;
drop trigger if exists acted_chat on public.chat_messages;
create trigger acted_chat after insert on public.chat_messages for each row execute function public.acted_chat();

create or replace function public.acted_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.life_acted(new.user_id);
  return new;
end $$;
drop trigger if exists acted_game on public.challenge_players;
create trigger acted_game after insert on public.challenge_players for each row execute function public.acted_user();
do $$
begin
  -- Answering a moment (part 109; skipped before it's run).
  if to_regclass('public.moments') is not null then
    drop trigger if exists acted_moment on public.moments;
    create trigger acted_moment after update of answered_at on public.moments
      for each row when (new.answered_at is not null and old.answered_at is null) execute function public.acted_user();
  end if;
end $$;

/**
 * A minute of you being active (part 73), paid for when the server has seen you do something
 * lately (above): { minutes (today), paid (mint, this ping), rate (mint a minute), left (paid
 * minutes left today), idle (not paid: nothing done lately) }.
 */
create or replace function public.online_ping(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_after int;
  v_counted boolean;
  v_rate numeric := coalesce(public.setting('online_pay_minute'), 0);
  v_cap int := coalesce(public.setting('online_pay_daily_minutes'), 0)::int;
  v_paid numeric := 0;
  v_acted boolean;
  v_row bigint;
begin
  v_after := public.active_ping(p_user);
  -- Paid only if this very call counted the minute (active_ping stamps last_ping with this
  -- transaction's now(); a ping that came too soon, or lost a race to another, leaves it older).
  v_counted := exists (select 1 from public.activity_days where user_id = p_user and day = public.lagos_day() and last_ping = now());
  v_acted := exists (select 1 from public.lives where user_id = p_user
                     and acted_at > now() - make_interval(mins => coalesce(public.setting('online_pay_active_mins'), 20)::int));
  if v_counted and v_acted and v_after <= v_cap and v_rate > 0 then
    v_paid := v_rate;
    update public.profiles set coins = coins + v_paid where id = p_user;
    -- One row in the ledger a day, added to each minute (not a row a minute: 13m rows a month at
    -- 10,000 daily players, docs/COSTS.md).
    update public.ledger set amount = amount + v_paid
      where id = (select pay_ledger from public.activity_days where user_id = p_user and day = public.lagos_day())
        and user_id = p_user and kind = 'online_pay';
    if not found then
      insert into public.ledger (user_id, kind, amount, bonus, note) values (p_user, 'online_pay', v_paid, false, 'Paid for being online')
        returning id into v_row;
      update public.activity_days set pay_ledger = v_row where user_id = p_user and day = public.lagos_day();
    end if;
  end if;
  return jsonb_build_object('minutes', v_after, 'paid', v_paid, 'rate', v_rate, 'left', greatest(0, v_cap - v_after), 'idle', not v_acted);
end $$;

-- ============================================================ 3. trips
alter table public.lives add column if not exists trip_since timestamptz;
alter table public.lives add column if not exists trip_n int not null default 0;
alter table public.lives add column if not exists find_day date;
alter table public.lives add column if not exists find_n int not null default 0;

/** Go into a building: pay the fare (as part 48), at most trip_max_per_minute trips a minute. */
create or replace function public.life_go(p_user uuid, p_place text, p_fare numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_fare numeric := round(least(public.setting('trip_fare_max'), greatest(0, coalesce(p_fare, 0))), 2);
  v_paid numeric := 0;
  v_n int;
begin
  if p_place is null or p_place !~ '^[a-z0-9-]+:-?[0-9]+,-?[0-9]+$' then raise exception 'bad_place'; end if;
  update public.lives
    set trip_n = case when trip_since > now() - interval '1 minute' then trip_n + 1 else 1 end,
        trip_since = case when trip_since > now() - interval '1 minute' then trip_since else now() end
    where user_id = p_user returning trip_n into v_n;
  if not found then raise exception 'no_life'; end if;
  if v_n > coalesce(public.setting('trip_max_per_minute'), 10) then raise exception 'too_fast'; end if;
  if v_fare > 0 then
    if public.life_can_spend(p_user, array['travel']) < v_fare then raise exception 'not_enough:%', trim_scale(v_fare); end if;
    v_paid := public.life_spend(p_user, array['travel'], v_fare);
    perform public.log_coins(p_user, null, 'commute', -v_paid, false, 'Fare to ' || p_place);
    perform public.burn(null, v_paid, 'Fares about town');
  end if;
  update public.lives set at_place = p_place where user_id = p_user;
  perform public.life_acted(p_user);
  return v_paid;
end $$;

/** After a trip: did you find something on the way? Rolled here, at most trip_find_daily_max a (Lagos) day. */
create or replace function public.trip_find(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_day date := public.lagos_day();
begin
  if random() >= coalesce(public.setting('trip_find_chance'), 0) then return false; end if;
  update public.lives
    set find_n = case when find_day = v_day then find_n + 1 else 1 end, find_day = v_day
    where user_id = p_user and (find_day is distinct from v_day or find_n < coalesce(public.setting('trip_find_daily_max'), 3));
  return found;
end $$;

do $$
declare f text;
begin
  revoke all on table public.whot_games from public, anon, authenticated;
  grant all on table public.whot_games to service_role;
  foreach f in array array['public.challenge_award(bigint, uuid)', 'public.challenge_report(uuid, bigint, uuid, boolean)', 'public.challenge_sweep(text)', 'public.stake_left_today(public.profiles)',
    'public.challenge_stake_cap()', 'public.life_acted(uuid)', 'public.acted_ledger()', 'public.acted_chat()', 'public.acted_user()',
    'public.online_ping(uuid)', 'public.life_go(uuid, text, numeric)', 'public.trip_find(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;


-- ==================================================================== 125_owned_changes.sql
-- Newtown, part 125: the city's owned buildings, only what changed (docs/COSTS.md, "The
-- savings"). Every phone used to fetch every owned building in the city, with its layout, every
-- minute: a list that grows with the players, fetched by every player. Now each building notes
-- when it last changed (bought into, named, regrown), and a phone fetches the whole list once
-- (shared by everyone through the CDN, /api/owned) and then only what changed since.
--
-- Safe to run more than once. Run after part 91 (any time).

alter table public.property_buildings add column if not exists updated_at timestamptz not null default now();
create index if not exists property_buildings_changed_idx on public.property_buildings (region, updated_at);

create or replace function public.property_buildings_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists property_buildings_touch on public.property_buildings;
create trigger property_buildings_touch before update on public.property_buildings
  for each row execute function public.property_buildings_touch();

/**
 * The owned buildings in a region that changed after p_since (all of them when p_since is null):
 * { at: the database's time now (ms, to ask from next time), rows: [{ id, building, name }] }.
 */
create or replace function public.owned_buildings_since(p_region text, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'at', floor(extract(epoch from now()) * 1000),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', building_id, 'building', snapshot, 'name', name))
                      from public.property_buildings
                      where region = p_region and (p_since is null or updated_at > p_since)), '[]'::jsonb))
$$;

do $$
begin
  revoke all on function public.owned_buildings_since(text, timestamptz), public.property_buildings_touch() from public, anon, authenticated;
  grant execute on function public.owned_buildings_since(text, timestamptz) to service_role;
end $$;


-- ==================================================================== 126_bottle_service.sql
-- Newtown, part 126: bottle service in clubs (docs/CLUBS.md). Order bottles at a club and the bill
-- (worked out by the game from its bottle list and the club: the ₦10m-door clubs charge more) is
-- paid from your Fun money, then savings, and burned like other spending. Hostesses bring the
-- bottles to your table with sparklers, for the whole club to see.
--
-- Safe to run more than once. Run after part 120.

insert into public.game_settings (key, value, note) values
  ('bottle_order_max', 40000, 'Most one bottle order can cost (mint, a sanity check: a 3 L Ace of Spades at a ₦10m club is about 30,000)')
on conflict (key) do update set note = excluded.note;

/** Pay for bottles at a club. Returns what was paid. */
create or replace function public.life_order_bottles(p_user uuid, p_place text, p_items text, p_cost numeric) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_cost numeric := round(least(public.setting('bottle_order_max'), greatest(0, coalesce(p_cost, 0))), 2);
  v_paid numeric := 0;
  p public.profiles;
begin
  if p_place is null or p_place !~ '^b:[0-9]{1,7}$' then raise exception 'bad_place'; end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.is_bot then raise exception 'unknown_player'; end if;
  if p.frozen or p.age_blocked_at is not null then raise exception 'frozen'; end if;
  perform 1 from public.lives where user_id = p_user for update;
  if not found then raise exception 'no_life'; end if;
  if v_cost > 0 then
    if public.life_can_spend(p_user, array['fun', 'savings']) < v_cost then raise exception 'not_enough:%', trim_scale(v_cost); end if;
    v_paid := public.life_spend(p_user, array['fun', 'savings'], v_cost);
    perform public.log_coins(p_user, null, 'bottles', -v_paid, false, left('Bottle service: ' || coalesce(p_items, 'bottles'), 120));
    perform public.burn(null, v_paid, 'Clubs');
  end if;
  return v_paid;
end $$;

do $$
begin
  revoke all on function public.life_order_bottles(uuid, text, text, numeric) from public, anon, authenticated;
  grant execute on function public.life_order_bottles(uuid, text, text, numeric) to service_role;
end $$;


-- ==================================================================== 127_room_counts.sql
-- Newtown, part 127: how many people are in each place, from the server (docs/COSTS.md, "Live
-- channels"). On the real map, who's in which place was shared live round each 4 km area: every
-- step in or out of any building went to every phone in the area. Now the live channel is just
-- the building you're in, and the numbers over buildings on the map come from here: the minute's
-- ping (/api/active) says which room you're in (life_in_room), and room_counts adds them up for a
-- part of the map (/api/room-counts, shared by everyone looking there).
--
-- Safe to run more than once. Run after part 102 (any time).

alter table public.lives add column if not exists in_room text check (in_room is null or char_length(in_room) <= 60);
alter table public.lives add column if not exists in_x int;
alter table public.lives add column if not exists in_z int;
create index if not exists lives_in_room_idx on public.lives (region, in_x, in_z) where in_room is not null;

/** The room you're in now ("b:<tile>:<level>", a ride's id, or '' for none), and where it is (tiles). */
create or replace function public.life_in_room(p_user uuid, p_room text, p_x int, p_z int) returns void
language sql security definer set search_path = public as $$
  update public.lives
    set in_room = nullif(left(coalesce(p_room, ''), 60), ''), in_x = case when coalesce(p_room, '') = '' then null else p_x end,
        in_z = case when coalesce(p_room, '') = '' then null else p_z end
    where user_id = p_user and in_room is distinct from nullif(left(coalesce(p_room, ''), 60), '')
$$;

/**
 * How many are in each room on this part of the map (and on the rides, wherever they are), counting
 * only those online (seen in the last 4 minutes): { "<room>": n }.
 */
create or replace function public.room_counts(p_region text, p_x0 int, p_x1 int, p_z0 int, p_z1 int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(in_room, n), '{}'::jsonb) from (
    select in_room, count(*) as n from public.lives
    where region = p_region and in_room is not null and seen_at > now() - interval '4 minutes'
      and ((in_x between p_x0 and p_x1 and in_z between p_z0 and p_z1) or in_x is null)
    group by in_room) c
$$;

do $$
begin
  revoke all on function public.life_in_room(uuid, text, int, int), public.room_counts(text, int, int, int, int) from public, anon, authenticated;
  grant execute on function public.life_in_room(uuid, text, int, int), public.room_counts(text, int, int, int, int) to service_role;
end $$;


-- ==================================================================== 128_lock_down.sql
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

