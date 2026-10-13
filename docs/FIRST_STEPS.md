# The first five minutes

New players get three things to do, one at a time, in the dark card under the buttons at the top
(`src/app/play/life/world-life.tsx`, steps in `src/lib/world/first-steps.ts`):

1. **Say hi to someone**: the green online count glows; send anyone a private message.
2. **Play a challenge**: the trophy (top right) glows; start one or join one.
3. **Go out**: go into a club, a restaurant or a landmark (any place that isn't your home).

Each pays a reward once (₦20,000 in your currency, `FIRST_STEP_NAIRA`). The server checks it
really happened before paying (`game-db/072_first_steps.sql`, `POST /api/first-steps`), and only
new lives (started in the last 3 days) are paid. Before part 72 is run the steps still show and
move on; nothing is paid. When all three are done, one last card points at Income (a job) and says
food and bills are paid by themselves. Skip hides the guide; How to play in the menu starts it again.
