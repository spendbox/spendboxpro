# The passport

Every real place on the map you go into gets a stamp in your passport: the city's landmarks (the
National Theatre, Balogun Market, Tafawa Balewa Square...), its named places and its railway
stations. They're gathered on area pages: Lagos Island, Ikoyi & VI, Lekki & Ajah, the Mainland,
Ikeja & the North, Badagry & the West, and Ibeju-Lekki & Epe.

- **Getting a stamp:** go into the place (from the map, Explore, or a trip). The stamp thuds onto a
  card at the top of the screen with what it paid (₦15,000 for a landmark, ₦6,000 for anything
  else) and how far through the passport you are. Tap the card to open the passport.
- **Completing an area page** pays a ₦300,000 bonus, once, with confetti.
- **The passport** (menu → Passport): a green cover with how many places you've visited and how
  many areas are complete, then each page as cream paper with round ink stamps (the place's name
  round the top, the date you went round the bottom, a sign for the kind of place in the middle).
  Places not visited yet show as dashed circles. Tap any stamp to see it big and fly to it on the map.

## How it works (and why it's light)

- `src/lib/world/passport.ts` works out the places and pages from the map the phone already has
  (about 5 ms, once). Nothing about the places is downloaded; the passport sheet only fetches which
  ones you've stamped (`myPassport`, one small query).
- `travelTo` (src/app/play/property-actions.ts) checks the place you arrived at against the
  passport and, only if it's on it, stamps it (`passport_stamp`, game-db/106) and pays. If that
  completes an area page, `passport_area_done` pays the bonus once.
- The passport screen and the stamp card load only when first needed.
