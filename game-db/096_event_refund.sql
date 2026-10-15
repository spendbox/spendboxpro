-- Newtown, part 96: a party that hardly anyone came to costs the host nothing (docs/EVENTS.md).
-- When an event ends and fewer than event_min_guests people came in (10; the host doesn't count),
-- the hosting fee goes back to the host instead of to the state as the permit, and the notice
-- says so. Ticket money is settled as before (VAT and income tax on what was sold). Called off
-- after it started with fewer than that in: the fee comes back too.
--
-- Safe to run more than once. Run after part 95.

insert into public.game_settings (key, value, note) values
  ('event_min_guests', 10, 'Fewer people than this came to an event: its hosting fee goes back to the host')
-- Running this again sets it back to the number here.
on conflict (key) do update set value = excluded.value, note = excluded.note;

create or replace function public.event_settle(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  v_vat numeric;
  v_gross numeric;
  v_tax numeric;
  v_share numeric;
  v_came int;
  v_back boolean;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then return 'gone'; end if;
  if e.status <> 'on' then return e.status; end if;
  if e.ends_at > now() then return 'on'; end if;
  -- Tickets include VAT; the rest is the host's income, taxed at source like pay.
  v_vat := round(e.pool * public.setting('service_vat') / (1 + public.setting('service_vat')), 2);
  v_gross := e.pool - v_vat;
  v_tax := round(v_gross * public.setting('work_income_tax'), 2);
  v_share := v_gross - v_tax;
  if v_vat > 0 then perform public.pay_tax(e.region, v_vat, 'vat', 'VAT on event tickets: ' || left(e.title, 40)); end if;
  if v_gross > 0 then
    update public.profiles set coins = coins + v_share where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_tickets', v_gross, false, 'Tickets: ' || e.title);
    if v_tax > 0 then
      perform public.log_coins(e.host_id, null, 'income_tax', -v_tax, false, 'Income tax on tickets');
      perform public.pay_tax(e.region, v_tax, 'income_tax', 'Income tax on event tickets');
    end if;
  end if;
  select count(*) into v_came from public.hosted_event_guests where event_id = p_id and entered_at is not null and user_id <> e.host_id;
  -- The permit to host it (parties): the state's, unless fewer than event_min_guests came, when
  -- it all goes back to the host.
  v_back := e.host_fee > 0 and v_came < coalesce(public.setting('event_min_guests'), 10);
  if v_back then
    update public.profiles set coins = coins + e.host_fee where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_hosting_back', e.host_fee, false, 'Hosting fee back (under ' || coalesce(public.setting('event_min_guests'), 10) || ' came): ' || e.title);
  elsif e.host_fee > 0 then
    perform public.pay_tax(e.region, e.host_fee, 'event_permit', 'Event permit: ' || left(e.title, 40));
  end if;
  update public.hosted_events set status = 'closed', paid_out = v_share where id = p_id;
  perform public.notify(e.host_id, null, 'event',
    format('"%s" is over. %s came%s.%s Thanks for hosting!', e.title, case when v_came = 1 then '1 person' else v_came || ' people' end,
           case when v_share > 0 then format(' and ₥%s of tickets is yours (after VAT and income tax)', trim_scale(v_share)) else '' end,
           case when v_back then format(' Fewer than %s came, so your ₥%s hosting fee is back.', coalesce(public.setting('event_min_guests'), 10), trim_scale(e.host_fee)) else '' end));
  return 'closed';
end $$;

/**
 * The host calls it off (before or while it's on): everyone's ticket back, and the people going
 * are told. The hosting fee comes back if it hadn't started, or if fewer than event_min_guests
 * had come in; otherwise it's the state's.
 */
create or replace function public.event_cancel(p_user uuid, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  e public.hosted_events;
  r record;
  v_came int;
begin
  select * into e from public.hosted_events where id = p_id for update;
  if not found then raise exception 'gone'; end if;
  if e.host_id <> p_user then raise exception 'not_host'; end if;
  if e.status <> 'on' or e.ends_at <= now() then raise exception 'over'; end if;
  for r in select user_id, paid from public.hosted_event_guests where event_id = p_id and paid > 0 loop
    update public.profiles set coins = coins + r.paid where id = r.user_id;
    perform public.log_coins(r.user_id, null, 'event_refund', r.paid, false, 'Event called off: ' || e.title);
  end loop;
  update public.hosted_event_guests set paid = 0 where event_id = p_id;
  select count(*) into v_came from public.hosted_event_guests where event_id = p_id and entered_at is not null and user_id <> e.host_id;
  if e.host_fee > 0 and (now() < e.starts_at or v_came < coalesce(public.setting('event_min_guests'), 10)) then
    update public.profiles set coins = coins + e.host_fee where id = e.host_id;
    perform public.log_coins(e.host_id, null, 'event_hosting_back', e.host_fee, false, 'Hosting fee back: ' || e.title);
  elsif e.host_fee > 0 then
    perform public.pay_tax(e.region, e.host_fee, 'event_permit', 'Event permit: ' || left(e.title, 40));
  end if;
  update public.hosted_events set status = 'cancelled', pool = 0, ends_at = least(ends_at, greatest(now(), starts_at + interval '1 second')) where id = p_id;
  for r in select user_id from public.hosted_event_guests where event_id = p_id and going and user_id <> p_user loop
    perform public.notify(r.user_id, null, 'event', format('"%s" was called off by the host.%s', e.title, case when e.price > 0 then ' Any ticket you bought is back.' else '' end));
  end loop;
  return 'cancelled';
end $$;
