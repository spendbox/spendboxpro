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
