# What the site costs to run (estimate, October 2026)

A rough guide from how the game behaves today (measured in the code) and published prices. Real
bills depend on how long people play; check the Vercel and Supabase usage pages monthly and
compare.

## How one player uses the servers

- **While playing on the map**, a phone asks the server about **14 times a minute**: notices every
  15 s, events every 20 s, people around every 45 s, and every minute online pay, marks, the town
  hall and the news, plus less often income, reputation, adverts and city growth. With taps
  (buying, chatting, hosting), about **16 calls a minute**, each 2 to 4 database queries.
- **Downloads**: the game is about 1.9 MB of code (compressed, downloaded once and kept), the
  Lagos map 43 KB. Polling adds about 100 MB a month for a daily player.
- **Live rooms** (parties, talks, chat) use Supabase Realtime: one connection each, and every line
  said is delivered to everyone in the room.
- **Exchange rates** (money shown in dollars, pounds, cedis...): from free public feeds
  (open.er-api.com, then the fawazahmed0 currency API), kept by the CDN for 6 hours and by each
  phone for 6 hours (src/lib/rates.ts, /api/rates): a few requests a day, free. With no feed
  answering, the rough built-in rates in src/lib/world/value.ts are used.
- **No AI costs**: the characters' chat is written in advance; the ad picture check (Claude) is
  switched off.

## Assumptions

- 1 in 5 registered users plays on a given day, for about 45 minutes.
- At the busiest hour about 1 in 10 of the day's players are on at once.
- So **players on at once ≈ 2% of registered users**, and the database sees about **0.75 queries a
  second for each player on at once**.

## Prices used (check them: vercel.com/pricing, supabase.com/pricing)

- **Vercel Pro**: $20 a month per team member, with 1 TB of data and 10M edge requests included;
  then about $0.60 a million function calls, $0.128 an hour of CPU, $0.15 a GB of data.
- **Supabase Pro**: $25 a month per organisation, plus the database computer: Micro ~$10, Small
  ~$15, Medium ~$60, Large ~$110, XL ~$210, 2XL ~$410, 4XL ~$960, 8XL ~$1,870, 16XL ~$3,730 a
  month; data out about $0.09 a GB after 250 GB; Realtime 500 connections on Pro (more on Team,
  $599 a month, or Enterprise), messages about $2.50 a million after 5 million.
- Third-party summaries of these prices disagree in places; treat them as approximate.

## The estimate after launch fixes 1 to 10 (a month, October 2026)

Measured again from the code: an active player on the map makes about **11 server calls a
minute**, not 3 (the 60 s looks at your assets and the city's owned buildings, the 30 s look at
games near you, the 60 s look at who of your recent people is online, the minute's ping, news,
bills and market, people around...). And one of them is heavy: **the list of every owned building
in the city, with its layout, downloaded by every player every minute** (src/app/play/life/use-life.ts,
property-actions.ts ownedBuildings). It grows with the players, and so does the number of
players fetching it, so its cost grows with the square of the players: about 625 KB a minute
per player at 1,000 daily players (28 MB of mobile data a day each), 6 MB a minute at 10,000.

The model (scratch numbers, rough): players play 45 minutes a day; 5 registered for each daily
player; at the busiest hour 1 in 10 of the day's players are on; 3 database queries a call;
half an owned building per registered player (about 1.2 KB each, 0.25 KB compressed); 1 in 10
daily players play one paintball match and 1 in 10 a Police & Thieves game a day; Realtime as in
"Live channels" below.

| Daily players | Now: Vercel | Now: Supabase | **Now** | With the savings below | Database then |
|---:|---:|---:|---:|---:|---|
| 100 | $22 | $40 | **$62** | **$56** | Micro (Small advised) |
| 1,000 | $45 | $727 | **$772** | **$370** | Small |
| 10,000 | $12,800 | $13,800 | **$26,700** | **$2,640** | Large |
| 100,000 | breaks first | breaks first | **(over $2m)** | **$26,300** | 4XL |

Now, at 1,000 daily players the bill is mostly Realtime messages (Police & Thieves about $540,
paintball $80); from 10,000 the owned-buildings list (84 TB a month) is most of it.

### The savings, biggest first

1. **Done** (game-db/125, /api/owned). **The owned-buildings list: one shared copy per city, and only what changed** (a cached GET
   per region that the CDN serves, and `since=`; a building's row gets an updated_at). At 10,000
   daily players it saves about $20,000 a month (and the database size from 2XL to XL); at
   1,000 about $60, and 28 MB a day of each player's mobile data.
2. **Done** (3 a second). **Police & Thieves sends fewer updates**: 3 a second instead of 5, and none while you stand
   still (the other phones already smooth movement out). About half its messages: $270 a month
   at 1,000 daily players, $1,900 at 10,000. At 100,000 only a game server (Colyseus,
   docs/PAINTBALL_PLAN.md) keeps it down.
3. **Done.** **Less polling (launch fix 15, and more)**: games near you every 2 minutes, not 30 s (a game
   changing already nudges every phone, map-news.ts); your assets and the city's buildings
   every 5 minutes, not every minute; bills and market every 5, not 2; who's online among your
   recent people answered by the minute's ping, not its own call. 11 calls a minute down to
   about 6. Saves about $10 at 1,000 daily players, $200 at 10,000 (Large instead of XL),
   $1,500 at 100,000.
4. **Done.** **Paintball 4 updates a second, not 8** (launch fix 14): $45 at 1,000, $450 at 10,000.
5. **Counts over buildings from the server** (with the 90 s people look) instead of the area
   channels, keeping a live channel only for the place you're in: $11 at 1,000, $1,100 at
   10,000, $110,000 at 100,000.

### Further still, without making the game any less

6. **A small game server for Police & Thieves and paintball** (Colyseus on a rented machine,
   docs/PAINTBALL_PLAN.md): match traffic stops being Supabase messages at $2.50 a million and
   becomes a fixed rent (about $10 a month at 1,000 daily players, $40 at 10,000, $400 at
   100,000). It also decides hits and results itself (launch fixes 17 and 18), so matches are
   fair and smoother.
7. **One heartbeat instead of many looks**: the minute's ping (/api/active, ./pulse) already says
   when notices, events and the Town Hall changed; it can say the same for your money, bills,
   games near you, quests and the city's buildings, and the phone asks only for what changed.
   What's the same for everyone near a spot (news, businesses, marks, people around, the
   buildings) is served from the CDN for a few seconds, not worked out per player. About 6
   calls a minute down to 2 or 3, and things still show up as fast (or faster: on change, not on
   the next poll).

| Daily players | With 1 to 5 | + 6 game server | + 7 heartbeat |
|---:|---:|---:|---:|
| 100 | $56 | $56 | $55 |
| 1,000 | $350 | $80 | **$70** |
| 10,000 | $2,400 | $340 | **$210** |
| 100,000 | $24,000 | $3,400 | **$1,700** |

Further off (as below, "Cheaper still"): own servers from about a million users, the database
split by city, images on Cloudflare R2.

## The estimate (a month, before launch fixes 1 to 10)

Since the server-call changes (src/app/play/activity.ts and pulse.ts): an active player makes
about **3 calls a minute** (was 16) and one who has left the game open makes **none**. Notices,
events and the Town Hall are fetched only when the minute's ping says something changed.

| Registered users | Playing a day | On at once | Database | Vercel | Supabase | Email (SES) | **About** | Before |
|---:|---:|---:|---|---:|---:|---:|---:|---:|
| 100 | 20 | 2 | Micro | $20 | $25 | $0 | **$45** | $45 |
| 1,000 | 200 | 20 | Micro | $20 | $25 | $0 | **$45** | $50 |
| 10,000 | 2,000 | 200 | Small | $25 | $45 | $0 | **$70** | $160 |
| 100,000 | 20,000 | 2,000 | Large | $250 | $350 | $2 | **$600** | $1,900 |
| 1,000,000 | 200,000 | 20,000 | 4XL, Team plan | $2,500 | $2,500 | $15 | **$5,000** | $21,000 |
| 10,000,000 | 2,000,000 | 200,000 | 16XL + read copies | $25,000 | $20,000 | $150 | **$45,000** | $200,000+ |

Email: taking $15,000 a month on Resend at 10 million users (as assumed), the same emails on
Amazon SES cost about $1,500 (about $0.10 a thousand). The game sends through SES once its keys
are set (AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY, AWS_SES_REGION; src/lib/email-ses.ts).
Since game-db/099, only a forgotten password sends an email: new players pass a free robot check
(Cloudflare Turnstile) instead of waiting for a code, and returning players use their password. That's
about a tenth of the emails, so the column above is a tenth of the $1,500 too.

## Cheaper still

1. ~~Sign-up codes by email~~: done (only forgotten PINs send an email). Later: a reward for
   confirming your email (profiles.email_verified_at), once SES is set up.
2. **Own servers from about a million users**: the game's server code on a few rented machines
   (Hetzner, Fly.io and the like: a few hundred to a few thousand dollars a month) instead of
   Vercel's functions; at 10 million users about $25,000 becomes $3,000 to $6,000.
3. **The database split by city** (Lagos, Abuja, Accra...) once there are several: each smaller,
   cheaper, and nearer its players.
4. **Push instead of the minute's ping** for what's new (Supabase Realtime broadcast from the
   database): halves the remaining calls, at the cost of more Realtime connections.
5. **Images** (profile photos, slides) through a cheap CDN (Cloudflare R2: no charge for data
   out) once they add up.
With 1 to 3, 10 million users comes to roughly $20,000 to $25,000 a month.

## Live channels (Realtime messages), and what launch fix 10 saved

Supabase counts every message it delivers. In a presence channel (who's here), each arrival,
departure or change goes to everyone in it: with n people in a channel, that's n messages each
time, so a channel for the whole city grows with the square of the players.

The model (src/app/play/rooms.ts and game.tsx; recomputed October 2026):
- Daily players D; 3 visits a day, 45 minutes in all; the phone sleeps and wakes about 3 times a
  visit (each one leaves and joins again): 24 joins and leaves a day each.
- Going into or out of a place (or a seat) about every 2 minutes on the map: about 22 more.
- The busiest 4 hours have 1 in 10 of the day's players on, 8 hours 4 in 100, the rest 1 in 100;
  so a message lands in a channel of about 64 people at D = 1,000 (643 at 10,000).
- Guests (not signed in) about 6% of the people on the map.
- 4 km areas: the busiest hold a few % of the city's players each; 5% taken.

| At 1,000 daily players (a month) | Messages | Bill over the 5M included |
|---|---:|---:|
| Before: `city-online` + `rooms:0` for the whole city | 141M | **$341** |
| No `city-online` on the real map (count from the server) | 95M | $225 (saves $116) |
| No live channel for guests | 90M | $212 (saves $13, and their connections) |
| Who's where per 4 km area | 4.5M | **$0** (saves $212) |

At 10,000 daily players the same steps take about 14,100M messages ($35,300 a month) to about
450M ($1,100): each step is worth 100 times as much, since the city-wide channels grow with the
square of the players and the area ones with the players.

Other effects:
- **Connections** (500 on Pro): guests on the real map open none now. Every signed-in player
  still holds one (all their channels share it), so about 500 players on at once is still the
  limit before the plan has to go up.
- **Database**: the online count was one counting query per look round (every 90 s per player,
  about 34,000 a day at 1,000 daily players); now at most 2 a minute per server (about 2,900 a
  day). Small on its own; it keeps the Small database comfortable.
- **What it costs**: friends' live places ("Ada is at Lekki Tower") only show for friends in your
  area; further away, the people list (the server's, every 90 s) still shows them.
- **Added by launch fix 4** (Whot! on the server): each player asks every 3 seconds during a game.
  At 1,000 daily players (a game a day for 1 in 5) about 4.8M calls a month: about $3 on Vercel and
  14M small queries.

## What's above budget and slows things down

Fixed already:

- The far map of all of Lagos State painted at once froze slow phones for a second or two: it's now
  painted a little at a time between frames.
- The events list downloaded up to 5,000 guest rows every 20 s for every player: the database now
  counts them (game-db/097 `event_counts`).
- The events "sweep" ran on every player's request: now once every 30 s per server.
- A 10,000-person party room would have sent about 100 million presence messages: only the host
  and the first 200 people share theirs now.
- In full rooms, slow mode: a chat line every 10 s and a reaction every 2 s per person (a busy
  carnival's chat would otherwise cost about $150 an hour in Realtime messages).

Fixed in the October speed check:

- **First download** 932 KB → 708 KB (compressed): the 3D home planner (and three.js with it), 23
  life sheets and 14 game sheets load when first opened, not with the map.
- **The whole game redrew every second** (the challenge lights sent a new list each second): now
  only when the lights change.
- **Timers while away**: challenges, city growth, news, life status, businesses, your property,
  the bank, the Town Hall, door knocks, quests, the guide and the friends rail stop while the
  player is away (src/app/play/activity.ts whileHere), and look again when they're back.
- **Chat listened to every message in the game** (the database checked each one against every
  player): now only messages to you, from you, and in the place you're in.
- **3D on phones**: no extra smoothing, a lighter screen and plainer shadows on all phones (most
  mid-range ones got desktop settings); 30 frames a second while nobody touches the map; any phone
  that can't keep up drops to 30 and a lighter screen by itself; shadows drawn every 2nd or 3rd
  frame, not every frame; the view's size read once, not several times a frame.
- **Database** (game-db/102): players' positions kept as numbers with indexes (people on the map,
  who's near an event or challenge no longer read every player); indexes for the round's ledger and
  events, the bank's day, challenge wins, who came to an event, notices; one notice to many players
  in one call; notices over 30 days old cleared daily; the challenge tidy-up at most every 10 s per
  region; the bank's numbers cached 15 s at the edge; no round results read on the real map.

Still to do (biggest saving first):

1. ~~Polling every few seconds~~: done (about 16 calls a minute down to 3, none when idle).
2. **Cache what's the same for everyone** (players in the news: done). The events list, the news and people-around are the same
   for everyone in an area for a few seconds: cached at the edge for 10 to 15 seconds, the
   database sees one request where it saw thousands.
3. ~~Nothing while the tab is hidden~~: done (all the map's timers).
4. **The 3D city code** is one very large file (most of the 1.9 MB): splitting what's rarely used
   (mini-games, the avatar studio, sport) to load only when opened makes the first visit faster
   on slow networks.
5. **10 million users** needs a different shape: the database split by region (Lagos, then other
   cities), read copies near the players, and the live rooms on a media/realtime service sized for
   it. With 1 to 3 done, the estimate there falls to roughly $40,000 to $70,000 a month.

Found in the speed check, not done yet:

- **Online pay writes a ledger row a minute per player** (game-db/083 `online_ping`): about 1,700
  rows a second at 100k players on at once. Adding it up and writing one row an hour (or a day)
  would cut most of the database's writes.
- **The daily upkeep pays every broke player in one go** (`daily_upkeep`): in batches at scale.
- **Chat, Events and Challenges** are always loaded (about 400 KB before compression): split each
  into a small always-on part and the screen loaded when opened.
- **Panning far** rebuilds the 3D city in one frame (a short freeze every 8 tiles): keep the
  instanced meshes and rebuild a little each frame.
