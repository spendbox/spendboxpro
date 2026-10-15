# The trip there

When you go somewhere a ride takes you (danfo, keke, okada, taxi or your own car), a short film plays
while the fare is paid: you walk out to the vehicle, get in and sit down, it pulls off down a Lagos
street (palms, stalls, lamps, water tanks, the NEWTOWN billboard) and stops at the place, its name up
on the building. Going on foot, you just stroll down the pavement to it.

- About five and a half seconds (three and a half on foot). Very short hops (under 50 m) don't play.
- The card on top shows from → to, how you went, how far and the fare, with a progress bar.
- Skip ends it at once; "Always skip" turns it off for good on that phone (localStorage
  `nt-trip-off`). Phones set to reduce motion never see it.
- The film's clock starts on the first frame drawn, so a slow phone still sees the whole ride.
- If paying fails, the film still ends and you stay where you were, with the usual message.

Code: `src/app/play/trip/` (`trip-scene.ts` the 3D film, `trip-layer.tsx` the overlay, `play.ts`
how the rest of the game asks for one). It's called from `goInside` in `life/world-life.tsx` and
from `payTrip` in `game.tsx`.
