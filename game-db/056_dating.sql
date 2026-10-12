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
