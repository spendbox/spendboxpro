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
- Your doorstep (tap your face, top left, then Doorstep) lists them: open gifts, say thanks (they're told), tap a face for
  their card.

## While you were away
- When you come back after 45 minutes or more and something happened, one screen: who came to
  your door, what you earned (job, hustles, rent, sales), and the notices you missed.

## Notifications (web push)
- The bell (left side, while they're off), or your face → Notifications, turns them on for that phone or browser. Someone at your door, a gift, thanks, a
  sale. On iPhone the game must be added to the home screen first (Safari's rule).
- Setup (once): run `node scripts/vapid-keys.mjs`, put the three lines it prints into Vercel's
  environment variables, and redeploy. Without them nothing is sent.
- One notification per conversation (a new message replaces the last one from the same person),
  private messages, challenges starting or called off, and notices. The number on the app's icon
  is what's still unread. Reading a chat or opening Alerts in the game closes those notifications
  on the phone (`public/sw.js`, `src/app/play/phone/phone-notices.ts`). While the game is open in
  front of you a notification makes no sound and goes away by itself.

## The chat bubble and your face (the real map)
- There's no phone any more. Bottom right, one blue chat bubble (its number: unread chats and
  notices). Inside: who's online now, then **Newtown** pinned on top (your notices as messages:
  gifts, knocks, results; tap one to go there; opening it reads them), **Newtown News**, your chats,
  and the camera.
- Top left, your face opens everything else (`src/app/play/me-sheet.tsx`): your look, your card,
  home, money, photos, things, gifts, doorstep, friends, dating, rivals, shops, cars, market,
  craft, leaving a mark, coming soon, how it works, the guide, notifications, sound, report, sign out.

## Chat (the real map)
- Messages opens on your chats, laid out like Snapchat: a filled square for a new chat, "Received",
  "Delivered" and "Opened" (game-db/071_chat_read.sql; before it's run each phone remembers what it
  has read). New chat finds anyone. There's no group chat in places: the voice call is there instead.
- Down the left side: the people you dealt with lately who are online right now.

## Finding people (game-db/060_find_people.sql)
- The online count opens People: the people online right now (search finds anyone living on the
  map by name), the nearest to where you're looking first, with Message, their card and where they are
  (`src/app/play/people/people-list.tsx`). Messages → People is the same list.
- A row of the people around where you're looking sits under the menu, online first, and
  refreshes as you move into a new area.
- Players say whether they're male or female when they pick their name (or later, on their own
  card); it shows on their card and in the lists.
- In a place, New chat starts with the faces of the people there, then the city's own characters.
