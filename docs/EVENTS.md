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
"Show me" opens Events. Going into any event (or hosting one and going in) counts
(docs/FIRST_STEPS.md). It replaced "Create and win a challenge".

## Hosting

1. **What kind**, then the format (each has its usual length and size).
2. **A name** (3 to 60 letters) and, if you like, what to expect.
3. **Where**: any named road within about 2 km of the middle of the map (its real name; move the
   map and tap **Here** for roads elsewhere), or a place near you: landmarks, restaurants, clubs,
   parks, stadiums, markets (the same list as Explore). Places that suit the format come first.
   A party on the street plays its crowd along that road.
   - **Street parties don't overlap**: no two within 1.6 km (16 tiles) of each other at the same
     time. Roads already taken then are greyed with the party that has them, and the database
     refuses a clash (`street_taken`).
4. **When**: now, in 30 minutes, in an hour, tonight, tomorrow, Saturday, or any time in the next
   7 days; and for how long (30 minutes to 4 hours).
5. **Tickets**: free, a quick pick, or any price up to ₦500,000; and how many can come.
6. **Start it now** or **Put it on the map**.

Rules: one event at a time, 3 a day.

### What a party costs to host

Worked out by the server from the map (the phone's number is only a preview; src/lib/world/events.ts
`partyCost`):

- **₦100,000 an hour** for up to 20 people on a street in an ordinary area.
- **How many can come**: 20 ×1, 50 ×1.25, 100 ×1.6, 300 ×2.4, 1,000 ×4.5.
- **The kind of place**: a street ×1, a park or square ×1.2, a restaurant or hotel ×1.5, a club ×1.6,
  a landmark ×2. A "street" must really be a road on the map; a place the map can't name is
  never charged below a park.
- **The area**: from the land price of the district round it (0.8 to 1.8; Ikoyi, Victoria Island
  and Eko Atlantic cost most).
- Rounded to ₦1,000 and paid when it's put on the map (Fun money, then the wallet). Called off
  before it starts: it all comes back. Once it has started it's spent (the city's when it ends).
- Talks and screenings are free to host for now. Your friends are always told (a notice and a push); everyone
within about 4 km is told too when it starts within 15 minutes.

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
- The arrow at the top tucks it away (you stay in, with a "Back to" button). If anything in a room
  goes wrong, only the room closes ("The room hiccupped", with Open it again), never the game.

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
- **Spray** the host ₦1,500 / ₦7,500 / ₦30,000 (a real gift, with the usual daily gift limits);
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
- Then the host gets 90% (logged as "Tickets: ..."); the rest is the city's (burned, counted by
  the World Bank).
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
  tickets paid once, the start notice, the host's 90% (once), calling off with tickets back,
  ending early, the stage, reputation, and running the part twice. Run it against a throwaway
  database that already has parts 1 to 94.
