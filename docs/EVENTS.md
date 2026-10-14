# Events on the map

Anyone can host an event that other people come to (src/app/play/events, src/lib/world/events.ts,
game-db/095_events.sql). It replaces the Challenge trophy in the top right corner: the party
button opens **Events**, and Game challenge is one of the kinds of event you can host.

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
| Game challenge | Yes (the old Challenge, docs/CHALLENGES.md) | Whot!, Ludo... |
| Sport & fitness | Coming | Match viewings, street football, runs |
| Pop-up market | Coming | Stalls for a day |
| Faith & community | Coming | Prayer meetings, town meetings, clean-ups |
| Meet-ups & mixers | Coming | Singles mixers, networking, book clubs |

Adding a format is one line in `EVENT_FORMATS` (src/lib/world/events.ts). Adding a category that
the database keeps needs its id added to the `category` check in game-db/095 too.

## Hosting

1. **What kind**, then the format (each has its usual length and size).
2. **A name** (3 to 60 letters) and, if you like, what to expect.
3. **Where**: the street you're on (its real name, from the map) or a place near you: landmarks,
   restaurants, clubs, parks, stadiums, markets (the same list as Explore). Places that suit the
   format come first. A party on the street plays its crowd along that road.
4. **When**: now, in 30 minutes, in an hour, tonight, tomorrow, Saturday, or any time in the next
   7 days; and for how long (30 minutes to 4 hours).
5. **Tickets**: free, a quick pick, or any price up to ₦500,000; and how many can come.
6. **Start it now** or **Put it on the map**.

Rules: one event at a time, 3 a day. Your friends are always told (a notice and a push); everyone
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
- The room opens over the map. The arrow at the top tucks it away (you stay in, with a "Back to"
  button).

## In a party

- **The dance floor**: everyone in the room, the host in the middle with a crown, bobbing to the
  music when it's on.
- **Music**: the host picks a vibe (the club's synth beats); everyone with sound on hears it.
- **Hot seat**: anyone draws a question (30 of them); everyone answers, and people heart the
  answers they love. A new one at most every 45 seconds.
- **Meet someone**: tap it and you're paired with the next person who does, with a conversation
  starter. "Chat or add friend" opens their card.
- **Shout-out**: to someone (or everyone), shown big across the party.
- **Toast**: raise one, everyone clinks.
- **Spray** the host ₦1,500 / ₦7,500 / ₦30,000 (a real gift, with the usual daily gift limits);
  money rains on everyone's screen.
- **Talk corner**: a voice call for up to 6 (docs/VOICE_CALLS.md). Chat and reactions for all.

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
