# Your day

How time works for a player on the real map: a main job, up to three side hustles, interviews, breakthrough
moments, Body and Mind. The rules are in `src/lib/world/day.ts`, `hustles.ts`, `interviews.ts`
(questions in `interview-bank.ts`) and `breakthroughs.ts` (moments in `breakthrough-bank.ts`); the
database part is `game-db/041_your_day.sql` (with `049_reports_and_work.sql` for several hustles and
pay that arrives by itself). A game day is 2 real hours.

## 24 hours, no more

Every game day has 24 hours:

| Takes | Hours |
| --- | --- |
| Sleep | 8 for a good night; less when the day is full (4 at the least) |
| Main job | 8 |
| Getting there and back | by distance and how you go (walk 5 km/h, danfo 12, keke 15, taxi 18, okada 22) |
| Side hustles | 2 to 4 each, up to three of them |
| Study (while on a course) | short 2, diploma 3, degree or licence 4 |
| Exercise | walk ½, football 1, gym 1 |
| Free time | whatever is left after a good night's sleep |

A long day can eat into your sleep: a far job or extra hustles are allowed down to 4 hours' sleep a
night. Every hour short of 8 wears your mind down (stress) and tires your body, and a stressed mind
makes interviews harder. Only a day that would leave less than 4 hours' sleep can't be taken on.
**Income** warns you when your nights are short; **Life** shows the bar and where the time went.

## One main job, up to three side hustles

Taking a new job asks first: your old job ends and the pay you earned there goes into your wallet,
in one step. Side hustles: home tutoring, hair braiding, small chops, online reselling, phone
repairs, POS agent, content creation, dispatch rider. Run up to three at once. Each shows its
start-up cost on its button and asks before spending it (from Savings, then your wallet); each has
its hours a day, and earnings that swing from day to day (content creation the most). Stop any one
and the others carry on. Hustles pay 4 times real Lagos earnings (`HUSTLE_BOOST` in
`src/lib/world/hustles.ts`); jobs pay more (18 times, `docs/WORK.md`).

## Pay arrives by itself

There's nothing to collect. At the end of each game week (14 real hours) your job's pay (after tax
and fares) and your side hustles' earnings go into your wallet, shared out by your budget. Players
who haven't been in are paid by the daily job; pay waits up to four game weeks.

## Interviews

Jobs that need a skill level of 2 or more, a certificate, or pay ₦200,000 a month and up need an
interview: four questions about that job and one about Lagos (207 questions in all). Get 3 of 5 right
(4 for senior jobs; one more when your mind is stressed). Fail and you wait a game week (14 hours) to
try that job there again. Jobs say "interview", what level they need and any certificate.

## Breakthroughs

About once every ten game days at work, and every six in a side hustle, a moment comes: three
choices, one best. At most one at a time, with a 4-hour cool-down, and it's gone after 2 hours.

- **At work:** choose well for a bonus of three game days' pay and extra experience.
- **Side hustle:** choose well for double earnings for three game days; choose badly and some
  moments stop the hustle earning for 1 to 3 game days.

## Body and Mind

- **Body** drops 1.5 a game day; exercise helps (walk +0.75, football +1.25, gym +2 for ₦15,000 a
  month). Below 30: half pay; below 10: no work.
- **Mind** rises with free time (6+ hours: +2 a day; 4+: +1; under 2: −1.5), and falls with very long
  days and owing bills. Below 25 interviews are harder; below 10 you burn out and can't work.
- Care for the mind: counselling at a public centre (₦10,000, +20), a private therapist (₦40,000,
  +40), a weekend away (₦250,000, +60 mind, 3 game days off work).

## Money in

**Money → Income**: main job, side hustle, rent and breakthrough bonuses for a game day, today or the
week; what each let property earns a day; and where your time went.
