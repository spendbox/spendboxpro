# Lite mode

The game without the 3D city, built round chat, for phones that are slow or short of data and
for people who mostly come to talk, play and go to things. The same account, money, chats, games
and events; the city just isn't drawn (it isn't even loaded). The World is one tap away, and back.

Code: `src/app/play/lite/`, wired in `src/app/play/game.tsx` (look for "Lite").

## Switching

- In the world: the **Lite** pill (bottom right, above the Town Hall), and once, 25 seconds in, a
  note offering it ("Try it" / ×).
- In Lite: the globe at the top of every page opens the World.
- The phone remembers which (`nt-lite` in its storage, `lite/lite-pref.ts`). `?lite=1` or `?lite=0`
  in the address picks one (and is remembered). Guests (not signed in) always see the world.
- Anything that needs the map takes you to the World first: Go there on a shared location, Show on
  someone's card, Home and Leave a mark in the menu, Choose on the map while hosting a party.

## The pages

A big title, then (right) the globe and your face; four tabs at the bottom: Chats, Events,
People, Wallet. Buttons are 44 px or more, one main colour (purple) for the main button.

- **Chats**: the game's own chat (`chat.tsx`, its `lite` prop) filling the page: online now,
  Newtown, Newtown News, your chats. A conversation covers the whole screen; Play and Give are at
  its top. The pencil (top) is New chat.
- **Events** (`lite/lite-events.tsx`): search first (title, kind, place, host, words like "owambe"),
  then Browse, a grid of kinds with how many are on (it grows down, never squeezed into a row),
  On now, Coming up. Filters: a tick list of every kind, when (now, today, this week) and price
  (free, paid); results nearest or soonest first. **Host something**: a party, a game or a talk,
  then the game's own hosting steps (`events/events.tsx` `hostAs`). Games open the Play sheet.
  Going in opens the event's room as usual.
- **People**: the people list (`people/people-list.tsx` `roomy`): search anyone, Everyone /
  Online / Friends, big Message buttons; a face opens their card.
- **Wallet**: your money, Top up and Send (pick who, then the usual Give money), then the wallet
  itself (`money-home.tsx` `inline`): daily gift, starter packs, top-ups, payments.
- **Your profile** (your face; `lite/lite-profile.tsx`): photo, name, level and area, about you,
  reputation, friends, things; Edit profile and Post a photo; your photos (or your things). ☰ opens
  the game's menu (home, doorstep, friends, notifications, sign out...).

Invitations, game tables, party rooms, gifts and the daily gift pop up over Lite exactly as in the
world.

## About you and photos (game-db/130)

- **About you**: up to 160 letters, on your card for everyone (`profile-actions.ts` `saveAbout`).
- **Photos**: post a photo with a line under it (`/api/profile-posts`, the public `posts` bucket),
  at most 6 a day; delete your own. They show on your profile and on your card (anyone's card, in
  the world too). **Who sees your photos**: everyone, or friends only.
- Until part 130 is run, there's no "About" and posting says it's switched on soon.

## Ads

Lite has no billboards, so one ad at a time sits under the Chats title, marked **Ad** (changing
every two minutes). Each time it shows it counts as a billboard view (`/api/ads/track`, or the
business's own count), and tapping it opens the same card as tapping a billboard. No ads inside a
conversation or the wallet.
