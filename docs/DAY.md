# Your day

How time works for a player on the real map: a main job, one side hustle, interviews, breakthrough
moments, Body and Mind. The rules are in `src/lib/world/day.ts`, `hustles.ts`, `interviews.ts`
(questions in `interview-bank.ts`) and `breakthroughs.ts` (moments in `breakthrough-bank.ts`); the
database part is `game-db/041_your_day.sql`. A game day is 2 real hours.

## 24 hours, no more

Every game day has 24 hours:

| Takes | Hours |
| --- | --- |
| Sleep | 8 |
| Main job | 8 |
| Getting there and back | by distance and how you go (walk 5 km/h, danfo 12, keke 15, taxi 18, okada 22) |
| Side hustle | 2 to 4 |
| Study (while on a course) | short 2, diploma 3, degree or licence 4 |
| Exercise | walk ½, football 1, gym 1 |
| Free time | whatever is left (at least 1 hour) |

Anything that won't fit can't be taken on, so nobody runs a hundred side hustles. **Work → Your day**
shows the bar; **Money → Income** shows where the time actually went.

## One main job, one side hustle

Taking a new job asks first ("you can have one main job"). Side hustles: home tutoring, hair
braiding, small chops, online reselling, phone repairs, POS agent, content creation, dispatch rider.
Each has a start-up cost (from Savings, then your wallet), hours a day, and earnings that swing from
day to day (content creation the most). Collect side hustle money with your pay.

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
