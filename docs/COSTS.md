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

## The estimate (a month)

| Registered users | Playing a day | On at once | Database | Vercel | Supabase | **About** |
|---:|---:|---:|---|---:|---:|---:|
| 100 | 20 | 2 | Micro | $20 | $25 | **$45** |
| 1,000 | 200 | 20 | Micro | $20 | $25 | **$50** |
| 10,000 | 2,000 | 200 | Medium | $70 | $90 | **$160** |
| 100,000 | 20,000 | 2,000 | XL | $1,200 | $700 | **$1,900** |
| 1,000,000 | 200,000 | 20,000 | 16XL + read copies, Team plan | $12,000 | $9,000 | **$21,000** |
| 10,000,000 | 2,000,000 | 200,000 | beyond one database (see below) | $120,000 | $80,000+ | **$200,000+** |

That's about 2 US cents per registered user per month at a million users. Other small costs:
sign-in emails (a few dollars per 10,000), the domain, and Paystack's fee on payments (a share of
what players pay, not a running cost).

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

Still to do (biggest saving first):

1. **Polling → push.** The 14 calls a minute are most of the bill from 100,000 users up. Sending
   notices, events and people-around over Realtime (or on a push) when something changes, with a
   slow check every few minutes as a back-up, cuts calls about five-fold.
2. **Cache what's the same for everyone.** The events list, the news and people-around are the same
   for everyone in an area for a few seconds: cached at the edge for 10 to 15 seconds, the
   database sees one request where it saw thousands.
3. **Nothing while the tab is hidden.** Some timers already stop; all of them should.
4. **The 3D city code** is one very large file (most of the 1.9 MB): splitting what's rarely used
   (mini-games, the avatar studio, sport) to load only when opened makes the first visit faster
   on slow networks.
5. **10 million users** needs a different shape: the database split by region (Lagos, then other
   cities), read copies near the players, and the live rooms on a media/realtime service sized for
   it. With 1 to 3 done, the estimate there falls to roughly $40,000 to $70,000 a month.
