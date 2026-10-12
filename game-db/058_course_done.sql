-- Newtown, part 58: finishing a course is news. See docs/LIVING.md.
--
-- When a course ends (life_courses.done_at is set), you get a notification: congratulations, and
-- the certificate if it gives one. The game also shows the certificate the next time you look.
--
-- Safe to run more than once. Run after parts 1-57.

create or replace function public.course_done_notice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.done_at is null and new.done_at is not null then
    perform public.notify(new.user_id, null, 'course',
      'Congratulations! You finished ' || new.title || case when new.cert is not null then '. Your certificate is ready.' else '.' end, null);
  end if;
  return new;
end $$;

drop trigger if exists course_done_notice on public.life_courses;
create trigger course_done_notice after update of done_at on public.life_courses
  for each row execute function public.course_done_notice();

revoke all on function public.course_done_notice() from public, anon, authenticated;
