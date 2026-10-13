# The walkthrough

Everyone signed in on the real map gets it once they have a home, old players too
(`src/app/play/tutorial.tsx`, kept in the browser as `newtown.tutorial.v1`). It's a small dark card
near the top, in front of everything (chat included); the button it talks about glows.

## 1. A few fun tips
Welcome; no work, no bills, no brushing your teeth; your cash is for games, people, real places
and gifts; three missions coming up.

## 2. Three missions, with rewards
| Mission | How | Reward |
|---|---|---|
| Name your home | the house button (bottom left), then the pencil | ₦20,000 |
| Say hi to someone | the chat bubble (bottom right), New chat, send a hi | ₦50,000 |
| Create and win a challenge | the trophy (top right), Whot! or Ludo | ₦50,000 |

"Show me" opens the right thing. The server checks each really happened after the player's
walkthrough started, and pays each once ever (`game-db/080_tutorial.sql`, `POST /api/tutorial`,
amounts in `src/lib/world/tutorial.ts`). A mission can be skipped (no reward). Before part 80 is run
the missions still show, with "Done it" to move on and nothing paid.

## 3. The rest of the tour
The camera (bottom left, or the orange one inside places), exploring, the house button to get home,
property paying you every day (and reputation giving money off property), and your profile (tap your
face): Things, Assets, Money, Photos, Friends, settings, and "Start the guide", which plays the whole
walkthrough again (missions already paid stay paid).

While the opening tips show, the daily gift waits, and a newly given home's card (ready to name it)
opens once they're done.

(The old first-five-minutes guide, `game-db/072` and `POST /api/first-steps`, is no longer shown.)
