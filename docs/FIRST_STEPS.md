# The first five minutes

## The welcome tour
Before anything else, everyone signed in sees a few fun full-screen slides once
(`src/app/play/life/welcome-tour.tsx`, kept in the browser as `newtown.tour.v2`): welcome to the
city; no work, no bills, no brushing your teeth; your virtual cash is for playing games, meeting
people, visiting real places and sending gifts; free money every day; and the three steps below.
Swipe or tap Next; Skip any time. Bump `TOUR_KEY` to show a new tour to everyone again.

## The three steps
Everyone gets three things to do (the guide is kept as `newtown.guide.v2`, so old players see it once too), one at a time, in the dark card under the buttons at the top
(`src/app/play/life/world-life.tsx`, steps in `src/lib/world/first-steps.ts`):

1. **Say hi to someone**: the green online count glows; send anyone a private message.
2. **Play a challenge**: the trophy (top right) glows; start one or join one.
3. **Go out**: go into a club, a restaurant or a landmark (any place that isn't your home).

Each pays a reward once (₦20,000 in your currency, `FIRST_STEP_NAIRA`). The server checks it
really happened before paying (`game-db/072_first_steps.sql`, `POST /api/first-steps`), and only
new lives (started in the last 3 days) are paid. Before part 72 is run the steps still show and
move on; nothing is paid. When all three are done, one last card says have fun. Skip hides the guide; "Start the guide" in
the menu shows the tour and the guide again.
