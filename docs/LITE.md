# Lite mode

The game without the 3D city, built round chat, for phones that are slow or short of data and
for people who mostly come to talk, play and go to things. The same account, money, chats, games
and events; the city just isn't drawn (it isn't even loaded). The World is one tap away, and back.

Code: `src/app/play/lite/`, wired in `src/app/play/game.tsx` (look for "Lite").

## Quiet and light

- **No sound.** Lite makes none of its own: no city sounds, no sound effects or chimes, no
  minigame sounds, no party beat or piano (`setSynthQuiet`), and there's no Sound switch in the
  menu. Only what you start yourself plays: a voice note you tap, a voice call you join, and the
  DJ's songs inside a party you go into.
- **No map.** The 3D city's code is never downloaded, and nothing is looked up just to draw it:
  no busy-ness numbers over buildings, how tall the city has grown, marks, breaking news over the
  map, or the map's sums worked out ahead. Who's around is asked every 5 minutes instead of 90
  seconds (for chat's "online now"), and the businesses (for the ad) every 15 minutes.

## Switching

- In the world: the **Lite** pill (bottom right, above the Town Hall), and once, 25 seconds in, a
  note offering it ("Try it" / ×).
- In Lite: the globe at the top of every page opens the World.
- The phone remembers which (`nt-lite` in its storage, `lite/lite-pref.ts`). `?lite=1` or `?lite=0`
  in the address picks one (and is remembered). Guests (not signed in) always see the world.
- Anything that needs the map takes you to the World first: Meet (in New chat), Go there on a shared location, Show on
  someone's card, Home and Leave a mark in the menu, Choose on the map while hosting a party.

## The pages

A big title, then (right) the globe and your face; four tabs at the bottom: Chats, Events,
People, Wallet. Buttons are 44 px or more, one main colour (purple) for the main button.

- **Masquerade** (docs/MASQUERADE.md): its card sits at the top of Chats.
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

- **Pictures** (`lite/lite-camera.tsx`): the game's camera takes pictures of the town, and Lite has
  no town, so Lite uses the phone's own camera. In a conversation the camera button takes a selfie
  and sends it; the picture button offers Take a photo, Take a selfie and From your phone. The
  camera in Photos (☰ menu): a photo, a selfie or one from the phone, then Send to someone, Save to
  my photos or Post to my profile. There's no camera button under your chats in Lite.
- Full pages (your profile, a picture, posting a photo) are drawn on the page itself
  (`OnTopPage`), so they open over the chats, which sit above the game's own layer.

Invitations, game tables, party rooms, gifts and the daily gift pop up over Lite exactly as in the
world. There's no Town Hall in Lite (nor its checks for new messages).

The first time in Lite, four short cards say what's where (Lite, the tabs, Masquerade, the globe);
once on each phone (`nt-lite-welcome`). The walkthrough in the world has a Lite card too.

In a conversation (Lite and the world), Play, Give money, Hug, Shake hands and Report are under the
**⋯** at the top, keeping the header clean.

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
