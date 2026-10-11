# Services between people

Players who own property can offer services; anyone living in the city can book one or post what they
need and what they'll pay. Rules: `src/lib/world/services.ts`; database: `game-db/044_services.sql`;
screen: **Services** at the top of the map (Find, Requests, Yours).

## In the game (paid in mint)

| Service | Does for the buyer |
| --- | --- |
| Home makeover | +5 mind |
| Personal training | +5 body |
| Party planning | +8 mind |
| Styling and make-up | +4 mind |
| Tutoring | +3 mind |
| Something else | nothing extra |

- Booking holds the price (from Savings, then the wallet). The provider does it and marks it done; the
  buyer confirms and the money goes to the provider, less 7.5% VAT (into the treasuries). If the buyer
  doesn't confirm, it pays by itself 6 hours after it's marked done.
- The provider can decline and the buyer can cancel until it's marked done: the money goes back.
- A request ("plan my birthday, I'll pay ₥30") can be taken on by any property owner: the requester's
  money is held the same way.
- Up to 5 open offers and 5 open requests each.

## Real life (agreed and paid outside the game)

Barbers, plumbers, electricians, cleaners, tutors, photographers, caterers, phone repairs, transport...
Offers and requests show a price in naira and a phone or WhatsApp to reach each other. Nothing is
paid inside the game for these, and the game says so.

## In the world lab

Three pretend providers (two in-game, one real-life) let you try booking; a pretend provider finishes a
job a minute after it's booked. Nobody else can take your requests there.
