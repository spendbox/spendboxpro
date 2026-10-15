# The trip there

When you go somewhere a ride takes you (danfo, keke, okada, taxi or your own car), a short film plays
while the fare is paid. You walk out from the bus stop to the vehicle, get in and sit down, and it
pulls off. The camera swings round from the side to behind it as it picks up speed.

It drives through a Lagos street:

- it turns left at a junction with traffic lights, passing a mosque, a filling station, a market
  and a little park on the corners;
- it goes under a "Welcome to (the area)" arch;
- it passes shops with painted signs and awnings, storey blocks with burglar-proof windows and
  black water tanks, bungalows behind their compound walls, and glass offices;
- along the way there are electric poles with their wires, palms, hawkers' umbrellas, parked
  cars, billboards and towers on the skyline;
- traffic comes the other way (danfos, BRT buses, lorries, kekes, okadas) and people walk on the
  pavements;
- it turns right past a church and a building site, goes under a pedestrian bridge, and stops at
  the place you're going, its name across the front. You get out and walk to the door.

Going on foot, you walk along the pavement to it instead.

The sky is the time in Lagos: dawn pinks, a hard blue noon, a golden late afternoon, dusk, and
night with stars, the moon, lit windows, street lamps and headlights.

- About twelve seconds (a few on foot), longer if something happens on the way. Very short hops
  (under 50 m) don't play.
- The card on top shows from → to, how you went, how far and the fare, with a progress bar.
- Skip ends it at once; "Always skip" turns it off for good on that phone (localStorage
  `nt-trip-off`). Phones set to reduce motion never see it.
- The film's clock starts on the first frame drawn, so a slow phone still sees the whole ride.
- If paying fails, the film still ends and you stay where you were, with the usual message.

## Something on the way

On most trips of 300 m or more (7 in 10), something happens on the road. It is a road moment: a
moment (docs/MOMENTS.md) that only happens on the road, on certain rides, and that the film acts out.

1. The game asks for one as the film loads.
2. The ride stops at the spot and the people in it come up and play their part (below).
3. The card asks what you do. Skip is hidden until you've chosen. The cross ("Ignore it") changes
   nothing.
4. What you chose plays out. They cheer, clap, wave, argue or walk off; the rope drops, the smoke
   stops, the convoy drives away.
5. The ride goes on.

The 55 road moments are in `src/lib/world/road-moments.ts`. They include:

- **Checkpoints:** police wanting "something for the boys", a boot search, the danfo held up, "Where
  your helmet?", a phone search on foot, fake officers, LASTMA and the BRT lane, a seatbelt fine,
  the fire-extinguisher check, the okada task force.
- **Touts:** agbero tickets, area boys on the bonnet, union levies, the corner boys.
- **People asking for help:** a mother with a baby at the window, a widow's transport money, a
  stranded motorist, a student late for an exam, a woman in labour.
- **Hawkers:** pure water and Gala, "original" chargers, change running after the bus, the
  windscreen boy, a schoolgirl hawking groundnuts.
- **Trouble with the ride:** a flat tyre and the vulcaniser, "Everybody come down!", pushing the
  danfo, an overheating engine, a taxi out of fuel, an okada chain.
- **The road itself:** a go-slow and its shortcut guides and okada offers, a danfo taking your
  mirror, the "road repair" boys with their rope, a muddy splash, goats crossing, school children
  crossing, a siren convoy, a wedding convoy dancing in the road, a flood, rain.
- **Other things:** a fan, a bag in the road, the bus preacher, "shift small", "I no get change", a
  taxi's long way round, the driver's playlist, a "one chance" feeling, a fight on the road, a
  thief and the crowd.

The rules:

- Each road moment says which rides it can happen on (`rides`) and which scene it plays (`stage`).
- The road picks only road moments, never the ones from elsewhere, and only ones for your ride.
- Money and reputation work like any moment (paid from Fun money then the wallet, with the same
  daily limits).
- On the road they can come 45 seconds apart, up to 40 a day in all moments. Nothing from
  before comes back on the road.

## The scenes

Each `stage` is acted out by 3D people in costume and props (`stages.ts`, `people.ts`):

| Stage | What you see |
| --- | --- |
| police | Orange and white drums, a plank of nails, the police pickup with its bar flashing; an officer in black with a torch waves you down and comes to the window, another with a rifle by the van |
| lastma | An officer in yellow and maroon with a notebook |
| thugs | Area boys get up off a bench and come to the bonnet and the windows |
| beggar | A woman with a baby tied on her back, and a child, come to the window |
| hawkers | Hawkers with trays on their heads run up alongside |
| wiper | A boy with a squeegee and a bucket soaps the windscreen |
| flat | The ride leans on its flat tyre; the vulcaniser comes over from his shed |
| breakdown | Smoke (or steam) from the engine; people come to look, or push |
| crash | Two cars nose to nose with hazards on and glass on the road, the drivers arguing; or one in your back |
| goslow | Traffic queued both ways; a guide or an okada man comes to the window; after the choice the queue creeps off and you follow |
| pothole | A pothole full of sand, a rope across the road, boys with shovels; or a car splashing you |
| crossing | Goats (one stops and stares) and their herder, or school children and their teacher |
| stranded | A broken-down car with its bonnet up and hazards on, someone waving |
| rain | Rain, a darker sky, an umbrella boy; or a flood and boys offering to push |
| convoy | Black jeeps and a police pickup flashing, an escort with a whip |
| wedding | Ribbon cars, aunties in gele and a chief in agbada dancing, notes flying, a drummer |
| fan | Someone runs up and jumps for joy, a friend filming |
| bag | A bag lying in the road |
| busstop | A bus stop with people waiting; someone gets on |
| inside | The camera comes close to the window |
| fight | Two square up and shove, a crowd cheers |

## Where the code is

| What | File |
| --- | --- |
| The film: the ride, you, traffic, the camera, stopping for a moment | `src/app/play/trip/trip-scene.ts` |
| The overlay: the card on top, Skip, asking for a road moment, its card | `src/app/play/trip/trip-layer.tsx` |
| How the rest of the game asks for a trip | `src/app/play/trip/play.ts` |
| The road (straight stretches and turns) | `src/app/play/trip/road-path.ts` |
| The streets, buildings and landmarks | `src/app/play/trip/street.ts` |
| The picture sheet (windows, signs, billboards) | `src/app/play/trip/atlas.ts` |
| The sky by the hour | `src/app/play/trip/sky.ts` |
| The vehicles | `src/app/play/trip/vehicles.ts` |
| The people and their props | `src/app/play/trip/people.ts` |
| The scenes for road moments | `src/app/play/trip/stages.ts` |
| The road moments | `src/lib/world/road-moments.ts` |

It's called from `goInside` in `life/world-life.tsx` and from `payTrip` in `game.tsx`.
