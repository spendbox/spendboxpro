# The walkthrough

Everyone signed in on the real map gets it once they have a home, old players too
(`src/app/play/tutorial.tsx`, kept in the browser as `newtown.tutorial.v1`). It's a small dark card
near the top, in front of everything (chat included); the button it talks about glows. It can be
dragged anywhere, and has a Back button.

## 1. A few fun tips
Welcome; no work, no bills, no brushing your teeth; your cash is for games, people, real places
and gifts; find any place with the search (a name, or a kind of place: club, church, court,
airport...; docs/MAP_SEARCH.md); now and then you'll face choices (moments), and what you choose
matters now and later (docs/MOMENTS.md); three missions coming up.

## 2. Three missions, with rewards
| Mission | How | Reward |
|---|---|---|
| Name your home | the house in the quick buttons (bottom left), then the pencil | ₦20,000 |
| Say hi to someone | the chat bubble (bottom right), New chat (both glow), anyone online | ₦50,000 |
| Go to an event | the party button (top right, it glows): go into any party or talk on now, or host your own | ₦50,000 |

"Show me" opens the right thing. The server checks each really happened after the player's
walkthrough started, and pays each once ever (`game-db/080_tutorial.sql`, with the third mission's
check from `game-db/095_events.sql`: coming into an event, as a guest or the host; it was "win a
challenge" before and keeps its id, `win`, so nobody is paid for it twice; `POST /api/tutorial`,
amounts in `src/lib/world/tutorial.ts`). A mission can be skipped (no reward). Before part 80 is run
the missions still show, with "Done it" to move on and nothing paid.

## 3. The rest of the tour
The quick buttons (one round button at the bottom left that opens Home, Camera, Coming soon,
Locate me and Walk, and folds away when you tap anywhere else; the walkthrough opens it when it
points at one of them), the camera (in the quick buttons, or the orange one inside places), exploring, the house button to get home,
the Wallet (tap your cash), money that comes just from playing (daily gift, wins, missions; shown in
Things › Assets, so nobody thinks they must pay to play), property paying you every day (and reputation giving money off property), and your profile (tap your
face): Things, Assets, Money, Photos, Friends, settings, and "Start the guide", which plays the whole
walkthrough again (missions already paid stay paid).

While the opening tips show, the daily gift waits, and a newly given home's card (ready to name it)
opens once they're done.

(The old first-five-minutes guide is gone, and its reward route `POST /api/first-steps` with it.)
