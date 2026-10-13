# Out on the street: rides and encounters

What makes walking round Lagos feel alive (src/lib/world/encounters.ts,
src/app/play/street/ride-scene.tsx, src/app/play/encounter-actions.ts, game-db/070_encounters.sql).

## Hailing a ride on foot

- In walk mode, going anywhere (a place's Go there, Meet friends, a jump across the map) asks how
  you're getting there: **keke**, **okada** or **danfo**, each with its fare. Only the rides that
  go that far are offered (a keke up to 8 km, an okada up to 15 km, a danfo anywhere).
- The fare is worked out and charged by the server for the ride you picked (`travelTo`, with
  `ride`).
- Then the ride: a short animated scene of the street going by. About a third of rides, something
  happens halfway: a police checkpoint, the agbero at the park, "I no get change", a go-slow, the
  fuel running out, the danfo preacher, an okada shortcut, a radio phone-in.

## Encounters while walking

- Every minute or two of really walking (not standing still), an encounter card pops up: puff-puff
  hawkers, money on the ground, an agbero at the junction, a lost visitor, street football, a
  street preacher, rain coming, a pickpocket, suya, a betting shop, an old school mate, stop and
  search.
- Each has two or three choices. The phone sends which one; the server rolls what happens and
  moves the money, so the phone can't pick the lucky outcome.

## Keeping it fair

- Small money only: nothing costs or pays more than ₦5,000.
- At most 20 encounters a day, one every 40 seconds, and at most ₦15,000 won from them a day.
- Costs come from your Fun money, then your wallet (you pay what you can, never into debt).
- The same encounter doesn't come up twice running.
- Before game-db/070_encounters.sql is run, the cards still show their stories, but no money moves.

## Ideas for later

- Encounters that depend on where you are (Oshodi vs Ikoyi), the time of day and the weather.
- Choices that use your reputation, your things (a phone to film, an umbrella) or your skills.
- Thugs and area boys as characters you meet again.
- Region packs: the same idea in other places (a London bus, a Nairobi matatu).
