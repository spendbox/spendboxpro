# Your life: moments, the wheel, badges and careers

The plan for what moments become (agreed direction, not built yet). Today's moments are in
`docs/MOMENTS.md` and the road ones in `docs/TRIPS.md`; everything here builds on them.

The big idea: moments are being alive. Each day brings new situations, from small ones (a hawker,
a neighbour, a wrong bill) to big ones (a business offer, a family crisis, a court case). What you
choose has consequences now, soon and much later; it quietly shapes who you are, earns you badges,
moves your reputation and money, and can make or break a career. Other players are part of your
story and you are part of theirs. Every moment you live is kept on your **wheel**, and the stories
still going travel with you wherever you go.

## 1. Sizes and pace

Moments should feel like life, not like adverts. Fewer, but each one matters more.

| Size | What | How often |
| --- | --- | --- |
| Small | Everyday Lagos: hawkers, neighbours, the danfo, the bill | 3 to 5 a day of play, at least 20 minutes apart |
| Big | Turning points: a job offer, a loan, a betrayal, a business choice | About 1 or 2 a week |
| Life-changing | An inheritance, a scandal, the deal of a lifetime, a wedding, a court case | A few a year |

- Counted by time actually playing, not the clock: someone who plays 20 minutes a day still gets
  one; someone who plays all day doesn't get flooded.
- Road moments stay (the trip film), but on about 1 trip in 4, and they count in the day's total.
- The next step of a story you're in comes first, before anything new.
- Today it's one every 4 to 9 minutes, up to 15 a day (40 with the road). That comes down to the
  numbers above.

## 2. The wheel

Your wheel is your life drawn as a ring.

- **The rim:** every moment you've lived is a notch, coloured by the part of life it touched:
  Money, Family, Love, Friends, Work and business, Street, Faith, Community. Tap a notch to read
  what happened, what you chose, and what came of it later ("3 weeks later: the student you gave a
  lift graduated and invited you").
- **The bright notches:** stories still going. They shine and pulse until they end.
- **The middle:** who you're becoming, in words, never numbers: "Mostly generous, bold, a bit
  street-smart". It changes as you change.
- **Your badges** sit around it (section 5).
- Others see the outside of your wheel (the badges you choose to show, the titles of big stories),
  never the private details.

**Stories travel with you.** A story isn't stuck to the place it started. Its next step finds you
wherever you are: on the road, at home, at work, in another area. People move too: "Officer Bello
was transferred to Ikeja, and there he is at the junction."

## 3. Consequences in three layers

Every moment has at least two of these, and the bigger the moment, the longer its tail.

| Layer | When | What it can be |
| --- | --- | --- |
| **Now** | At once | Money in or out, reputation, how people react on screen |
| **Soon** | Hours to a few days | A follow-up; a person's mood towards you; a short effect on you (below) |
| **Later** | Weeks to months | A story lands; who you are shifts; a badge; a business grows or fails; someone returns; a door opens or closes |

**Short effects** are small marks on you that wear off by themselves, shown on the wheel's middle:

- *Blessed* (the market women prayed for you): hawkers' prices a little lower for a day.
- *Talked about* (you caused a scene): people stare; some small moments go differently for a day.
- *In debt to someone*: they'll come asking, and how you answer matters.
- *Owed a favour*: you can call it in once.
- *Hurt* (the fight went badly): no gym or sport for a day.
- *Lucky streak*, *Under watch* (the police noticed you), *In love*, *Heartbroken*...

**Long consequences** are what make it feel alive: the area boys you stood up to remember you,
the trader you were honest with gives you credit when you're broke, the colleague you covered for
becomes your boss, the cousin you refused doesn't invite you to the wedding.

## 3b. The cast: people who remember you

The city has a cast of recurring people (`src/lib/world/cast.ts`): Mama Nkechi selling oranges at
the bus stop, Officer Bello at the Ojota checkpoint, Baba Sule whose boys own your street, Kunle
your danfo conductor, Chioma next door, Aunty Bisi's buka, Coach Dayo at the gym, Ify at work,
Uncle Sunday in the village, and 31 more.

- **Each has a story with you** (`cast-moments.ts`), a few steps over days and weeks: one step at
  most every day and a half, met where they are. Your choices move how they feel about you (from
  "Can't stand you" to "Like family") and which step comes next, so the story branches: bribe
  Officer Bello and he expects it next time; report him and he searches your car.
- **They live in the city, not only in your story.** Everyone's choices add up: each character has
  a count of how much the whole city has helped and hurt them. When enough players have helped
  Mama Nkechi, her shop opens, for everyone. When enough have reported Officer Bello, he's
  dismissed and selling recharge cards at Ojota; if not, he's promoted, and worse.

**The cast isn't fixed at 40.** It changes with time:

- New people arrive on set days (`since`): Fola the intern from mid-November, Amaka the journalist
  from December. New characters can be added any time without touching anyone's story.
- Characters change: promoted, dismissed, a stall becomes a shop, a son leaves the street, a
  conductor gets his own bus. Some changes come from your story, some from the whole city's.
- Stories end, and new ones begin: when your story with someone ends, they're still in the city,
  and later chapters can be written for them.
- Each city gets its own cast as the game goes international (`region`).
- Later (phase 6), real players become characters in each other's stories too, which is where the
  cast becomes endless.

## 4. No easy answers

Rules for every moment we write:

1. **Every answer costs something and gives something.** There's no answer that's free and best.
2. **Values clash.** Good moments set two good things against each other: honesty against
   loyalty, family against ambition, giving against saving, mercy against justice, old ways
   against new, safety against boldness, privacy against fame.
3. **The same answer turns out differently** depending on who's asking, what you did before, your
   reputation, the time and luck. Nobody can learn "always pick the kind one".
4. **No hints.** Every button looks the same (no green, gold or red), the order is shuffled, and
   the card never shows money or reputation before you choose (unless it's a price, like
   "Pay ₦5,000").
5. **Sometimes there's no right answer**, only the one you can live with.
6. **3 to 4 answers shown**, drawn from a pool of 6 to 8 for that moment, so it plays differently
   the next time.

Three examples of the kind we want:

- **Your cousin's exam.** Your aunty calls: your cousin's WAEC is tomorrow and "someone" can get
  the questions for ₦40,000. *Pay it* (family is happy; if it's found out, your name is in it).
  *Refuse, and pay a lesson teacher instead* (costs more, cousin may still fail, aunty sulks).
  *Tell the school* (honest; the family may never forgive you). *Stay out of it* (nothing now; you
  hear about it at Christmas either way).
- **Your best worker stole.** Chidi, your hardest worker, took ₦80,000 from the till for his
  mother's hospital bill. *Fire him* (others learn stealing doesn't pay; you lose your best
  worker). *Forgive him and pay the bill* (loyalty for life, maybe; others may try it too).
  *Take it from his wages quietly*. *Call the police* (justice; the street calls you wicked).
- **Stand guarantor.** A friend (a real player) asks you to stand guarantor for a loan. *Yes*
  (if they don't pay, you do; if they do, you have a friend for life). *No* (safe; they remember).
  *Yes, but only half*.

## 5. Scoring: who you are, not good or bad

There isn't one "goodness" number. There are three kinds of score.

### Character (hidden)

Six pairs of opposites. Each is a slider; both ends are fine, and both ends have badges.

| Pair | One end | Other end |
| --- | --- | --- |
| Giving | **Generous**: you give, you share | **Prudent**: you keep, you build |
| Daring | **Bold**: you jump in | **Careful**: you think first |
| Truth | **Straight**: honest even when it costs | **Street-smart**: you bend the rules to get by |
| People | **Community**: us first | **Self-made**: me and mine first |
| Wrongs | **Forgiving**: second chances | **Firm**: people answer for what they do |
| Ways | **Traditional**: respect the old ways | **Modern**: new ideas, new ways |

- Each answer nudges one or two sliders a few points. "Give her your last ₦2,000" nudges Generous
  a lot and Bold a little; "Bargain the area boys down" nudges Street-smart and Bold.
- What you did lately counts more than long ago (it fades, like "Taking part" in
  `docs/REPUTATION.md`), so people can change. A stingy player can become generous.
- Never shown as numbers: only as words on your wheel, and through the badges.
- It changes the moments you get: generous people get asked more; known street-smart people get
  offered shady deals; firm people get asked to judge disputes.

### Standing (how others see you)

- **Reputation** (already in the game). Only what people saw counts: keeping a wallet when nobody
  saw changes your character, not your reputation. Each moment says who saw it.
- **Trust:** do people believe you? It rises when you keep your word (repay, deliver, show up)
  and falls when you break it. Trust decides who'll lend to you, partner with you, hire you; it
  also gives better rates on World Bank loans.
- **Fame:** how known you are. It rises with big witnessed moments and with being in other
  players' stories. Famous people get fans, journalists and fake cousins.
- **People who remember you:** each recurring character (and each player you've shared moments
  with) holds a feeling towards you, from enemy to family. It decides how they treat you next time.

### Legacy (the one number for leaderboards)

How much your life has happened, not how rich you are. It only grows. Points for stories finished,
big moments lived, people helped who came back, businesses built (even ones that failed), and
appearing in other players' stories. "Most legendary life in Lagos this month" is a leaderboard
everyone can climb, rich or poor.

### What moments feed in the rest of the game

- **Reputation:** moments move it within the day's limit (10 a day). Today it's kept between −40
  and +60 from moments in all; with stories lasting months that widens to about −100 and +150.
- **Money:** now (paying, receiving), and over time through careers.
- **Revenue:** some badges and a high Legacy count towards "earning from reputation" (the share of
  the app's revenue for top players), so living a big life pays, not only being rich.
- **Places and people:** a character can open doors (a job, a deal, a VIP table) or close them.

## 6. Badges (quiet)

- **Never announced when you choose.** They arrive later, quietly: next time you open your wheel
  there's a new one, with a line like "People have started to say you're someone who keeps their
  word."
- **Earned by a pattern, not one answer:** at least 8 to 10 choices that show it, over at least 2
  weeks. Some need it to have cost you (honest when it cost money; generous when you had little).
  That way nobody can farm them.
- **They can fade.** If you change, an old badge goes grey: "Once known as Open Hand."
- **Private by default.** You choose which ones show on your profile.
- **They change your life:** characters react to them, they unlock moments (a Person of Honour gets asked
  to be the estate's treasurer; a Hustler gets offered deals others never see), and a few give a
  small perk. None pays big money directly.

### Character badges (one for each end of each slider)

| Badge | For |
| --- | --- |
| 🤲🏾 **Open Hand** | Very generous, again and again, even when it cost you |
| 🏦 **Money Wise** (in Nigeria *Owo Mi*, "my money") | Very prudent: you don't let money slip away |
| 🦁 **Lion Heart** | Bold when others step back |
| 🦉 **Wise Owl** | Careful; you think before you jump, and it usually pays |
| 🕊️ **Person of Honour** (in Nigeria *Omoluabi*, the Yoruba word for a person of good character) | Honest when it cost you |
| 🧠 **Street Scholar** | Street-smart; you always find a way |
| 🏘️ **Pillar of the Street** | Community first |
| 🧗🏾 **Self-Made** | You build your own way |
| 💛 **Big Heart** | You give second chances |
| ⚖️ **The Judge** | People answer to you for what they do |
| 🥁 **Custodian** | Keeper of the old ways |
| 🚀 **Trailblazer** | New ideas, new ways |

### Mixed badges (two or three sides together)

| Badge | For |
| --- | --- |
| 🏹 **Robin Hood** | Generous and street-smart |
| 🧓🏾 **The Elder** (in Nigeria *Baba / Mama Agba*) | Careful, community and traditional |
| 💼 **Hustler** | Bold, street-smart and self-made |
| ☮️ **Peacemaker** | Forgiving and community |
| 🎅🏾 **Father Christmas** | Generous and bold: you spray money |
| 🗝️ **Vault** | Prudent and careful: nobody gets your money |

### Story badges (finishing a story)

*Mama's Favourite* (Mama Nkechi's story), *Bello's Nightmare* (you reported Officer Bello until he
was moved), *Kept My Word* (paid back every debt for 3 months), *Survivor* (went broke and came
back), *Prodigal* (left your family's way and came home), *Street Whisperer* (the street's tough
guys respect you; in Lagos *Agbero Whisperer*), *Wahala Magnet* (always in the middle of drama), *Touched by Fate* (a legendary
moment).

### Career badges

*Founder* (started a business), *First Profit*, *Boss* (10 staff), *Brand* (known across the
city), *Comeback Kid* (a business failed and you built again), *Mogul*.

### People badges

*Main Character* (in 50 other players' stories), *Ride or Die* (stood by a friend in 5 shared
moments), *Good Neighbour*, *Connector* (introduced players who became partners).

## 7. Careers: your business story

A big moment invites you to start something. You choose what:

- Suya spot, buka (canteen), fashion and tailoring, phone and POS kiosk, salon or barbing shop,
  dispatch riders, event planning, poultry farm, tech startup, import and export.
- Later: careers in the existing jobs too (banker, lawyer, doctor...), with their own big moments.

Each business has hidden numbers: **cash, customers, quality, staff mood and risk**. It grows in
stages: **Idea → Stall → Shop → Brand → Empire**.

- **Business moments**, 2 or 3 a week, test you: the supplier raises prices, a worker steals, a big
  order you can't fill, a rival copies you, the task force comes, a blogger reviews you, a partner
  offers money for a share, NEPA takes light before the party order, your family wants jobs.
- **What you choose moves the numbers.** Cut quality to save money and customers slowly leave.
  Treat staff well and they stay, but it costs. Take the investor and grow fast, but they own half.
- **It pays daily** into your wallet (from customers, quality and stage), and a bad month loses
  money. If cash runs out there's a crisis moment; get it wrong and the business closes.
- **Failing isn't the end.** You keep your home and what you own; the *Comeback* story starts.
- **Real players:** they can be your customers, suppliers, partners, rivals or investors.
- **On the map:** a business that reaches Shop can take a real building (`docs/BUSINESS.md`), and
  its sign goes up.
- **The economy stays fair:** income comes out of the World Bank like other earnings, with caps per
  stage, so businesses can't print money.

## 8. Other players in your story

- **Threads between two players.** You lend Ade (a real player) ₦50,000 in a moment; a week later
  Ade gets "Pay them back?"; you both see how it ends, and it shapes Trust between you.
- **Cameos.** Your choices put you into other people's stories: "Ade, who gave you a lift last
  week, is at the bus stop." They get a quiet note later: "You came up in Kemi's story."
- **Shared moments.** One situation, two or more real players, each chooses, and the outcome
  depends on everyone (both of you found the same wallet; your business and theirs both want the
  same shop).
- **Group moments.** Everyone in the same club, party or church gets the same moment (a fight
  breaks out, the pastor asks for volunteers), and what the group chooses decides it.
- **Allies and rivals** come out of shared moments over time.
- **Safety:** only players who are friends, have met in the game, or switched on "I can appear in
  others' stories". Nothing private shown. Money between players stays within the gift limits.
  Nobody can make another player pay more than a small amount. Report and block work as always.

## 9. Keeping everyone in sync

- **The server decides everything; phones only show.** Every story is kept in the database: whose
  it is, which step it's on, who's in it and their role, and every answer.
- **Shared moments open for everyone at once.** Each person has a set time to answer (minutes when
  you're together, hours when apart). When all have answered, or time is up, the server settles it
  once and tells everyone.
- **Stories move on real time** (each next step has a "due at" time), so every player's world
  agrees on what has happened.
- **Characters are shared.** Mama Nkechi at Oshodi is the same Mama for everyone. If many players
  help her, she opens a shop that everyone can see; the world remembers.

## 10. Never running out

The freshness plan already agreed still holds, inside this: answers drawn from pools; moments
nobody has had come first; rare (about monthly) and legendary (about yearly) moments; moments built
from parts (who, what they want, the complication, the twist); the Lagos calendar (rainy season,
harmattan, Detty December, Sallah, elections, AFCON nights, fuel queues); your area (Lekki and
Ajegunle feel different); moments that fit who you are; player-written moments, voted on and
approved; 20 to 30 new ones a month; and measuring which ones people skip or always answer the
same way. The aim is the same: decades of play without meeting the same moment the same way.

## 11. Going international

Lagos comes first, but the game will go to players everywhere, so all of this is built to travel:

- **The machinery is the same everywhere:** the wheel, the six sliders, the three layers, badges,
  careers and other players in your story. Only the flavour changes.
- **Every moment says where it belongs:** anywhere (a friend who wants to borrow, a lost wallet),
  or a country, city or area (danfo change is Lagos; a London one has the night bus). Players get
  moments for where they are, with universal ones filling in.
- **Local casts and calendars:** each region gets its own recurring characters, its own seasons and
  dates (Detty December in Lagos, Thanksgiving in the US, Diwali in India, Ramadan wherever it's
  kept) and its own businesses (a suya spot in Lagos, a food truck in Houston).
- **Badges have a world name and a local name:** *Person of Honour* everywhere, *Omoluabi* in
  Nigeria; *Money Wise*, *Owo Mi* at home. Players see the local one where it exists.
- **Money is the player's own:** amounts are set in a region's prices (already true: each region
  has its own prices), so ₦2,000 in Lagos is the same kind of ask as £5 in London.
- **Words ready to translate:** stories are written in plain English with the names, amounts and
  places filled in from outside, so they can be translated per language later.
- **Different values, same freedom:** what's "traditional" or "modern" differs by place; the
  sliders never call either end wrong, so they work across cultures.

## 12. How we build it

Each phase works on its own and is built in one go, a few hours to a couple of days each. The
slowest part is writing the stories themselves, and that's done with AI drafting and the owner
reviewing.

1. **Fair answers, slower pace, and starting to know who you are.** *Built.* Same-looking buttons,
   shuffled, from a pool of up to 8 answers (4 shown); the new pace (5 a day, 20 minutes apart,
   the road on 1 trip in 4); sizes and rarity; ones never had first; every answer quietly nudges
   the six sliders (game-db/111).
2. **The wheel and the three layers.** *Built.* The wheel (Me → My life): every moment as a notch
   coloured by part of life, the stories still going glowing, who you're becoming in the middle,
   tap a notch for what you chose and what came of it. Eight short effects that wear off and change
   how later moments turn out. Outcomes that shift with who you are (`likelier`). Follow-ups find
   you wherever you are. 8 big and life-changing moments with 8 follow-ups (your cousin's
   exam, the family meeting, your boss's offer, standing guarantor, an offer abroad, a hit-and-run
   you saw, Grandpa's land, your numbers coming in), and 35 more answers across 24 everyday
   moments (game-db/112).
3. **People who remember you and story arcs.** *Built.* A cast of 40 for Lagos, with stories
   written for 9 of them (37 steps, branching on how they feel about you and on what the whole
   city has done for them); how each feels about you, how far your story has gone and what you
   chose, for every player; the city's shared count for each character; people who arrive over
   time; "People who know you" on the wheel (game-db/113). Still to come: stories for the other 31,
   and their faces in the trip film.
4. **Standing and quiet badges.** *Built.* Trust, Fame and Legacy (`src/lib/world/standing.ts`)
   on the wheel, with the "Most legendary lives" board; 29 badges (12 character, 6 mixed, 7 story,
   3 people, 1 fate) earned by patterns over at least two weeks, arriving 12 to 30 hours later,
   character ones fading if you change; private until you tick "On my card", then on your player
   card with their local names; moments nobody saw move who you are but not your reputation; four
   moments that only come to people known for something (game-db/114). Career badges come with
   careers (phase 5); Main Character, Ride or Die and Connector with other players (phase 6).
5. **Careers.** *Built.* Me → My business, or a moment that invites you: ten kinds to start
   (suya spot, buka, fashion house, POS kiosk, salon, dispatch riders, event planning, poultry farm,
   tech startup, import and export), each with its own price, growth and risk
   (`src/lib/world/ventures.ts`). Hidden numbers shown in words; a day of business at a time (up to
   a week caught up), paying you 60% of a good day's profit, capped per stage (₦150,000 a day at
   Idea, ₦500,000 at Stall, ₦1.5m at Shop, ₦5m at Brand, and no limit at Empire); the bigger it
   is the harder it grows (word spreads more slowly at each stage, and an Empire grows ever more
   slowly as it gets bigger, with no end); 16 business moments (`venture-moments.ts`) two or three a week,
   with amounts that grow with the stage; ready-to-grow and crisis moments; closing by itself after
   a month deep in the red. Run well, it's about a month to Stall, six to eight to Shop, a year or
   more to Brand and a year and a half to two and a half to Empire. Six career badges, and businesses count towards Legacy
   (game-db/115). Still to come: a Shop taking a real building on the map, and real players as
   customers, suppliers, partners and rivals (phase 6).
6. **Other players in your story.** *Built (most of it).* Four threads between two real players
   (`src/lib/world/player-moments.ts`): a loan (ask, lend or not, pay back or not, chase or forgive),
   a lift in the rain that comes back round when their car dies, vouching for a job (and how they
   do in it reflects on you), and a wallet you both saw (a dilemma played one after the other: the
   second player chooses without knowing what the first did). Each answer sends the next part to
   the other player; real money goes through the usual gifts and their limits; nobody can be made
   to pay by someone else's choice. How you feel about each other builds into allies and rivals,
   shown on the wheel as "Players in your story", with who can be in your story: friends (the
   default), anyone in your city who also says so, or nobody. Blocked people never, nobody away
   for a week, nobody more than twice in 12 hours. Main Character and Ride or Die badges; being in
   other people's stories counts towards Legacy (game-db/116). Still to come: group moments
   (everyone in the same club or party gets the same moment and the group decides), more threads,
   and Connector.
7. **The freshness engine.** Templates, the calendar, your area, player-written moments, monthly new
   ones, measuring.
8. **Going international.** Moments tagged by where they belong, local casts, calendars and
   businesses, local badge names, translation.

## 13. For the owner to decide

- How many moments a day (suggested above: 3 to 5 small a day, 1 or 2 big a week).
- The badge names, and whether badges are private until you choose to show them (suggested: yes).
- The list of businesses to start with.
- Whether a business can fail completely (suggested: yes, but you never lose your home).
