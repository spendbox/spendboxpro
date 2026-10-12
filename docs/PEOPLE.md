# A city full of people

Database: `game-db/051_people.sql`. Game: `src/app/play/people-actions.ts`, screens in
`src/app/play/people/`. Push: `src/lib/push.ts`, `public/sw.js`, `/api/push/latest`.

## Faces on the map
- Everyone with a home shows as their face over where they are: friends in pink, everyone else in
  blue. Online (about in the last 4 minutes) at the place they last went; otherwise, by Lagos time,
  asleep at home (11pm to 6am), at work (8am to 6pm, with a job) or away at home, faded, with the
  word under their name. Players who blocked each other don't see each other.
- Looked up every 45 seconds round where you're looking (6 km across, up to 80 people).
- Tap a face for their card: where they live (Show flies there), job, car, inventions, friends,
  reputation, and Knock, Note, Gift, Hug, Shake, Report, Add friend.

## Doorsteps
- Knock, leave a note (up to 280 letters), or leave a wrapped gift: one of your things, theirs at
  once, waiting at their door to be opened. Up to 40 a day, 6 at the same door.
- Your doorstep (on your phone) lists them: open gifts, say thanks (they're told), tap a face for
  their card.

## While you were away
- When you come back after 45 minutes or more and something happened, one screen: who came to
  your door, what you earned (job, hustles, rent, sales), and the notices you missed.

## Notifications (web push)
- Phone → Alerts turns them on for that phone or browser. Someone at your door, a gift, thanks, a
  sale. On iPhone the game must be added to the home screen first (Safari's rule).
- Setup (once): run `node scripts/vapid-keys.mjs`, put the three lines it prints into Vercel's
  environment variables, and redeploy. Without them nothing is sent.
