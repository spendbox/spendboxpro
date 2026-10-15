# Events on the map

Anyone can host an event that other people come to (src/app/play/events, src/lib/world/events.ts,
game-db/095_events.sql). It replaces the Challenge trophy in the top right corner: the party
button opens **Events**. Game challenge shows there as coming soon (the tutorial still opens
Challenge directly).

## Why parties and the stage first

- **Parties** are the easiest thing to host and the easiest to say yes to. They are loud on the
  map (a crowd fills the street for everyone who looks), so people nearby come over. Owambe
  culture (spraying the celebrant) gives the host a real reward for hosting.
- **The stage** (talks, classes, watch parties, open mics) brings people back at a set time and
  gives creators, teachers and comedians a reason to bring their own audience into the game,
  sharing the event's link outside it.
- Together: one spontaneous and social, one planned and useful. Both are about real people:
  what's done in the room is talking, answering, meeting and reacting, not avatars dancing.

## The kinds of event

| Kind | Built | Formats |
| --- | --- | --- |
| Parties | Yes | Street party, Owambe, Concert, Rave, House party, Drum circle |
| Talks & screenings | Yes | Talk, Class or workshop, Watch party, Open mic |
| Game challenge | Coming (Challenge itself still works, docs/CHALLENGES.md) | Whot!, Ludo... |
| Sport & fitness | Coming | Match viewings, street football, runs |
| Pop-up market | Coming | Stalls for a day |
| Faith & community | Coming | Prayer meetings, town meetings, clean-ups |
| Meet-ups & mixers | Coming | Singles mixers, networking, book clubs |

Adding a format is one line in `EVENT_FORMATS` (src/lib/world/events.ts). Adding a category that
the database keeps needs its id added to the `category` check in game-db/095 too.

## In the walkthrough

The walkthrough's third mission is **Go to an event** (₦50,000): the party button glows, and
"Show me" opens Events, and says a party fewer than 10 people come to costs nothing to host.
Going into any event (or hosting one and going in) counts
(docs/FIRST_STEPS.md). It replaced "Create and win a challenge".

## Hosting

1. **What kind**, then the format (each has its usual length and size).
2. **A name** (3 to 60 letters) and, if you like, what to expect.
3. **Where**: any named road within about 2 km of the middle of the map (its real name), or a
   place near you: landmarks, restaurants, clubs, parks, stadiums, markets (the same list as
   Explore). Places that suit the format come first. A party on the street plays its crowd along
   that road. **Choose on the map** tucks the card away (everything filled in is kept): a pin
   stands in the middle of the screen with the party's area round it, the road under it is named
   as you move, and **Use this spot** brings the card back with that road picked.
   - **How big** (parties; game-db/097, `radius_m`): how far it reaches from the spot. One spot
     (50 m, up to 300 people), the block (150 m, 1,000), the street (300 m, 1,000), the area
     (600 m, 3,000), a carnival (1 km round, 10,000) or a mega carnival (2.5 km round, 5 km across,
     10,000). On the map every road inside it is strung with coloured bulbs that chase and twinkle
     (brightest at night), the area is tinted and ringed in the party's colour (the ring shows from
     far away), and bigger parties get more dancing crowds round their streets (one for every
     300 m, up to 4 more; src/app/play/city/party-lights.ts). Parties of 600 m or more, or 1,000+
     people, are announced in the Lagos news in a fun way (and break into it when they're new).
   - **Street parties don't overlap**: no two within 1.6 km (16 tiles) of each other at the same
     time. Roads already taken then are greyed with the party that has them, and the database
     refuses a clash (`street_taken`). Nor can two be so close that their areas (their sizes) would meet.
4. **When**: now, in 30 minutes, in an hour, tonight, tomorrow, Saturday, or any time in the next
   7 days; and for how long (30 minutes to 4 hours).
5. **Tickets**: free, a quick pick, or any price up to ₦500,000; and how many can come.
6. **Start it now** or **Put it on the map**.

Rules: one event at a time, 3 a day.

### What a party costs to host

Worked out by the server from the map (the phone's number is only a preview; src/lib/world/events.ts
`partyCost`):

- **₦100,000 an hour** for up to 20 people on a street in an ordinary area.
- **How many can come**: 20 ×1, 50 ×1.25, 100 ×1.6, 300 ×2.4, 1,000 ×4.5, 3,000 ×8, 10,000 ×14.
- **How big**: one spot ×1, the block ×1.5, the street ×2.5, the area ×4.5, a carnival ×7, a mega
  carnival ×14 (a 3-hour carnival for 10,000 on an ordinary street is about ₦29m).
- **The kind of place**: a street ×1, a park or square ×1.2, a restaurant or hotel ×1.5, a club ×1.6,
  a landmark ×2. A "street" must really be a road on the map; a place the map can't name is
  never charged below a park.
- **The area**: from the land price of the district round it (0.8 to 1.8; Ikoyi, Victoria Island
  and Eko Atlantic cost most).
- Rounded to ₦1,000 and paid when it's put on the map (Fun money, then the wallet). Called off
  before it starts: it all comes back. Once it has started it's spent (the city's when it ends),
  **unless fewer than 10 people came in** (the host doesn't count; setting `event_min_guests`,
  game-db/096): then it all comes back when it ends or is called off, and the host's notice says
  so. The walkthrough's third mission and the host's form both say this.
- Talks and screenings are free to host for now. Coming: game challenges, sport, pop-up markets,
  faith & community, meet-ups, and 18+ nights.
- Your friends are always told (a notice and a push). So nobody misses out, the nearest players
  are told too the moment it's hosted, however far they are: twice as many as it holds (a party
  for 100 tells the closest 200), or everyone within 4 km if that's more (game-db/101
  `event_tell`; where someone is: where they are now, else their home).

## How to host a great party

Host an event opens with **How to host a great party** (src/app/play/events/host-guide.tsx): eight
quick steps, Next and Back. Pick your party; choose where (Choose on the map); choose how big;
when, tickets and how many (the fee back if fewer than 10 come); add music in the DJ booth (in
YouTube: Share, Copy link, then paste and Play; queue up to 20; or a beat); get it going (the hype
meter, hot seat, toasts, shout-outs, Meet someone, spraying); bring people in (Invite friends);
leaving and ending. The walkthrough's third mission points to it, and the DJ panel says how to copy
a song's link on a phone.

## Going

- **What's on** lists events in your state: on now (nearest first) and coming up (soonest first),
  with filters for Parties, Talks & screenings and I'm going.
- **I'm going**: you're told when it starts.
- **Go in**: from 5 minutes before it starts until it ends (the host any time). A ticket is paid
  once; after that you can come and go. **Invite friends** shares a link (`/play?event=<id>`)
  that opens the event.
- On the map: a beam of light in the event's colour (LIVE while it's on), and parties on now fill
  their street or square with a dancing crowd (the same scenes as the news: street party,
  owambe, concert, rave, candlelight party, drum circle). A pop-up tells you when one starts near
  you, or one you're going to.
- **Tap a beam** (or the LIVE / SOON bubble over it) on the map to open that event.
- **The room opens at once**: going in is checked (and the ticket taken) while it opens; if the
  server says no (full, not enough money), it closes again with why. Hosting "now" opens the room
  straight from the answer.
- The arrow at the top tucks it away (you stay in, with a "Back to" button). **Leave** (next to it,
  or the ✕ on the "Back to" button) takes you out; your ticket stays paid, so you can Go in again
  while it's on. If anything in a room goes wrong, only the room closes ("The room hiccupped",
  with Open it again), never the game.

## In a party

- **The dance floor**: up to 16 people, everyone big with names, the host in the middle with a
  crown, bobbing to the music. **A big crowd**: the spotlight (the host, you, and up to 8 people who
  just did something: spoke, danced, answered), then 40 small faces, then "+N". The count at the
  top and "+N" open **Who's here**, searchable, everyone in it.
- **The DJ booth**: the host pastes YouTube song links; everyone hears the same song at the same
  moment (the same synced player as the stage), and more links queue up (20 at most) and play one
  after another. Next and Stop for the host. People coming in late hear where it's up to.
- **Or a beat**: the club's synth vibes, made on every phone (quiet while a song plays).
- **Hype meter**: every reaction, chat line, answer, dance move, clink, shout-out and spray fills
  it, and it drains slowly. Full: "The party is LIT!", confetti, and every face on the floor jumps.
- **Dance**: Spin, Jump, Wave, Shaku, Zanku: your face does it on everyone's screen.
- **Hot seat**: type your own question (you see it once more and confirm before it goes), or take a
  random one (Another for a different one). Everyone answers, and people heart the answers they
  love. A new question waits until a few people have answered (or 45 seconds).
- **Meet someone**: tap it and you're paired with the next person who does, with a conversation
  starter. "Chat or add friend" opens their card.
- **Shout-out**: to someone (or everyone), shown big across the party.
- **Toast**: raise one, everyone clinks.
- **Spray** the host ₦1,500 / ₦7,500 / ₦30,000 (a real gift, with no limit except for brand-new accounts);
  money rains on everyone's screen.
- **Talk corner**: a voice call for up to 6 (docs/VOICE_CALLS.md).
- **The chat** (parties and stages): emojis and photos (shrunk on the phone, kept in the "events"
  bucket under chat/, only people who came in can send them); tap a message to react, reply or
  delete it (your own; the host can delete anyone's). Every new message pops out of the chat and
  floats up the room with the sender's face before it fades.

### Music from Spotify?

Looked into, not used:

- Spotify's Web Playback SDK plays only for listeners who each have **Spotify Premium** and sign
  in; its developer terms don't allow playing one person's music to a room in sync.
- Spotify's embed plays 30-second previews to anyone not signed in to Spotify.
- What could work later: a "party playlist" button that opens the host's Spotify playlist on each
  person's own app (not in sync), or a licensed music service for businesses (for example
  Feed.fm). For now the DJ booth uses YouTube's own player, which plays what owners allow to be
  embedded, in sync, for everyone, free.

## On a stage

- **The screen**: the host adds slides (pictures from the phone, up to 30, shrunk first and kept
  in the "events" storage bucket) or a YouTube video. Everyone sees the same slide; the video
  plays in sync (the host plays, pauses and skips; everyone else follows, jumping when more than
  2 seconds out). What's on is kept with the event, so people who come in late see the same.
- **Licensed videos**: videos play through YouTube's own player, so only what its owners allow to
  be embedded can be shown, and nothing is copied to us. Showing licensed films (a real cinema)
  would need a deal with a distributor and a paid video service; that's a later step.
- **Seats**: the audience in rows facing the screen.
- **Q&A**: the audience asks and upvotes; the host marks questions answered.
- **The mic**: a voice call for up to 6 (the host and guests on stage). A talk to hundreds of
  listeners at once would need a media server (for example LiveKit); for now big audiences follow
  the slides, the video and the chat.

## Money

- Tickets come from your Fun money, then your wallet, and are held until the event is over.
- Then they're **taxed like everything else in the city** (docs/LIVING.md, "Taxes"):
  - the ticket price includes **VAT** (7.5%, `service_vat`);
  - what's left is the host's income (a pay slip in Finance, "Tickets: ...", counted in what
    you've earned) less **income tax** (7%, `work_income_tax`, kept back at source);
  - the host keeps about 86.5%: ₥300 of tickets is ₥20.93 VAT, ₥19.53 income tax, ₥259.54 to the host.
  - VAT and income tax go to the treasuries (70% Lagos State, 30% Nigeria). Every treasury
    payment also counts in the **World Bank** (game-db/089), so they show in its total and in
    "today" (on the Wallet and the owner's dashboard) the moment the event is settled.
- The **hosting fee is a permit**, paid to the state (`event_permit`, so the World Bank counts it too) once the party has started; called off before, it comes back and is never counted.
- Spraying is a gift (the usual gift limits for new accounts), like spraying in clubs: not taxed.
- Called off by the host: every ticket comes back and everyone going is told.
- The host can end it early (and is paid at once).
- Money history shows these as "Events".

## Reputation

- 3 points for each event you hosted that 3 or more people came to.
- 1 point for every two events of other people's you went to.
- Up to 100 in all (src/lib/world/events.ts eventRep, added in src/lib/world/items.ts
  reputationOf; the database counts them in event_rep).

## How it's kept

- `hosted_events` (the event, its stage and ticket money held) and `hosted_event_guests` (going,
  came in, what they paid). The old `events` table belongs to the hide-and-seek game.
- Everything said and done in a room (chat, reactions, the hot seat, pairing, shout-outs, toasts,
  questions) goes over the realtime channel `event:<id>` and isn't kept.
- `event_sweep` runs whenever someone looks at the events in a state: it tells people going that
  their event started (with a push) and settles the ones that are over.

## Tested

- `src/lib/world/tests/events.test.ts` (npm test): the formats and their map scenes, titles,
  times, YouTube links, what the stage keeps, reputation.
- `game-db/tests/events.test.sql`: hosting and its limits, going, early doors, a full room,
  tickets paid once, the start notice, VAT and income tax on tickets (to the treasuries, on the host's pay slips, in Finance), the permit to the state, paid once, calling off with tickets back,
  ending early, the stage, reputation, the hosting fee back when fewer than 10 came (at the end
  or called off), and running parts 95 and 96 twice. Run it against a throwaway database that
  already has parts 1 to 94.

## Hosting, one question at a time

Host an event is a short wizard (src/app/play/events/events.tsx `HostForm`): what kind, its name,
where, how big (parties), when, tickets and guests, then the music (parties) or the slides or video
(talks), and a last look with the price before it goes on the map. Each screen says what it's for,
and Back changes anything.

- **Music before it starts (parties):** the host pastes YouTube links (it shows how: Share, Copy
  link, paste). Once the party is made, they go on its stage as the DJ's queue, so the first song is
  ready when the host walks in and taps Play.
- **Slides or a video before it starts (talks):** pictures picked on the phone are uploaded once the
  talk is made (they need its id), or a YouTube link is set as the video.
- **Sound in the background:** the room stays open while it's tucked away (Back to the map), so
  the music, voices and chat carry on until you leave. The made-on-the-phone beat keeps playing with
  the screen off or in another app, with Play, Pause and Leave on the lock screen (Media Session;
  src/app/play/activities/synth.ts `backgroundAudio`). YouTube songs and videos can't: YouTube
  stops them when the browser isn't in front.
