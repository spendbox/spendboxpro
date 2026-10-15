-- Newtown, part 103: calling off an event, the same as part 96 (every ticket bought is paid back,
-- before it starts or while it's on), and now everyone who came in is told too, not only those who
-- said they were going.
--
-- Safe to run more than once. Run after part 96.

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
  -- Everyone going, and everyone who came in (going or not), is told; whoever paid got it back above.
  for r in select g.user_id from public.hosted_event_guests g
           where g.event_id = p_id and (g.going or g.entered_at is not null) and g.user_id <> p_user loop
    perform public.notify(r.user_id, null, 'event', format('"%s" was called off by the host.%s', e.title, case when e.price > 0 then ' Any ticket you bought has been paid back to you.' else '' end));
  end loop;
  return 'cancelled';
end $$;
