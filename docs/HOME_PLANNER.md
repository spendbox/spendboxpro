# Planning your home

> Most players now start with the **house builder** (docs/HOME_BUILDER.md): Home → Upgrade. This
> hand-drawn planner opens from the builder's "Move furniture yourself", for moving pieces one by one.

Open it from **Home → Plan my home**, or from the **Plan my home** button while you're inside your home. **Enter home** (on the Home card) takes you straight in. You draw your home flat, as a floor plan, and see it built in 3D.

## How it works

- **The grid.** The plan is laid out on half-metre squares, with a stronger line every metre. A home is Small (7 × 6 m), Medium (10 × 8 m) or Large (14 × 11 m). Changing the size starts the plan again.
- **Rooms.**
  - Pick a kind of room: living room, bedroom, kitchen, bathroom, dining room, study, hall or balcony.
  - Or pick a **special room** (see below): a dance hall, home cinema, home gym, games room or bar lounge.
  - Drag across the grid to draw it. Each room shows its size in metres.
  - Tap a room to move it or make it bigger or smaller, a square at a time, or to change what kind of room it is.
- **Furniture.**
  - There are 47 pieces, from beds and sofas to the kitchen, the bathroom and stairs, plus the special rooms' own pieces.
  - Tap one to put it in. It goes in the room you picked, on free squares if there are any.
  - Drag a piece to move it.
  - Tap a piece to nudge it one square at a time, turn it (a quarter turn each time), copy it or delete it.
  - Pieces that overlap are outlined in red. Rugs can go under other things.
- **Floors.**
  - A home can have up to six floors (as many as its kind of house allows).
  - The floor below shows faintly on the plan, with its stairs, so you can line things up.
  - You can remove the top floor.
- **3D view.**
  - Every floor is stacked up. Walls go round each room, with a doorway in each, and round the outside, and the furniture is built in plain shapes.
  - Walls are kept low on the floor you're looking at, and the floors above it are left off, so you can see in.
  - Drag to look round; pinch to zoom.
- **Undo** steps back through your changes. A whole drag counts as one change.
- **Saving.**
  - Save keeps the plan on your account, for the home you live in. If you move house, you start a fresh plan.
  - The server checks every plan before saving it, with the same rules as the editor: everything stays inside the home, at most 12 rooms and 80 pieces per floor.

## Special rooms

Under **Rooms**, below the everyday rooms, are the special rooms. Each one has a smallest size, costs a fit-out when you save (sound-proofing, wiring, lights, the floor), and has its own furniture group in the furniture list.

| Room | Smallest | Fit-out | Its furniture |
| --- | --- | --- | --- |
| Dance hall | 4 × 4 m | ₦5M | Light-up dance floor (2 × 2 m tiles, ₦1.8M each), DJ booth, big speakers, disco ball, party lights, jukebox |
| Home cinema | 3.5 × 3.5 m | ₦4M | Cinema screen (with a projector), cinema seats, popcorn machine, speakers |
| Home gym | 3 × 3 m | ₦2M | Treadmill, exercise bike, weights bench, dumbbell rack, exercise mat, mirrors |
| Games room | 3.5 × 3.5 m | ₦1.5M | Pool table, arcade machines, dartboard, jukebox |
| Bar lounge | 3 × 3 m | ₦2.5M | Bar counter, bar stools, jukebox, a sofa and coffee table |

- If you draw a special room too small, or change a small room into one, it's made its smallest size. It can't be made smaller than that.
- **Furnish this room for me** sets each one out properly:
  - **dance hall:** the DJ booth in the middle of a long wall with a speaker each side, the dance floor filling the middle, the disco ball over it, party lights in the corners;
  - **cinema:** the screen on a short wall, speakers each side, rows of seats facing it with a gap behind each row;
  - **gym:** treadmills along one wall, mirrors and dumbbells across from them, the weights bench in the middle;
  - **games room:** the pool table in the middle, arcade machines and a dartboard round the walls;
  - **bar lounge:** the counter along a wall with stools in front, a sofa and coffee table across the room.
- Nothing is put on the dance floor, and the disco ball hangs over it, so neither gets in the way of anything.
- **Design it for me** keeps your special rooms: they go across the front of the top floor (so you need two floors or more), as many as fit, with a bedroom beside them if there's room. If one doesn't fit, it says so.
- **Inside**, walking round:
  - the dance hall's tiles light up and change colour on the beat (the same beat as the clubs), the disco ball turns with beams of light under it, and there are glowing strips round the walls;
  - the dance floor is a real dance floor, the same as a club's: you can dance on it, and a crowd dances round you;
  - the DJ booth, pool table, dartboard, arcade, bar and jukebox can be used like the ones in town;
  - the cinema's seats, the bar stools and the weights bench can be sat on.
- Other code can tell whether a home has a dance hall with `homeHasDanceHall(plan)`. `danceFloorOf(floor)` says where a floor's dance floor is.

## Designed for you

- **Design it for me** (at the top) lays out every floor and furnishes every room:
  - living room and kitchen downstairs;
  - bedrooms upstairs;
  - stairs in the hall, lined up between floors.

  Tap it again (**Another design**) for a different layout. Undo brings back what you had.
- With a room selected, **Furnish this room for me** fills it with what that kind of room needs.
  - Each piece goes against a wall, facing into the room.
  - The doorways are left clear.

## What it costs

Planning and rearranging are free. **Save** pays for what's new:

| What | Price (Lagos 2026) | Adds to your home's value |
| --- | --- | --- |
| A new floor | ₦180,000 per m²: Small ₦7.6M, Medium ₦14.4M, Large ₦27.7M | 90% of what you paid |
| Stairs | ₦1.5M | 90% |
| Furniture | ₦25k (plant) up to ₦3.5M (pool table); each piece's price shows under it | 50% |
| Fitting out a special room | ₦1.5M (games room) up to ₦5M (dance hall); the price shows under it in the room list | 80% |

- Your home comes with its ground floor and the starter furniture for its size (a small home is
  credited with a small home's starter pieces, not a large one's).
- What you've paid for stays yours. If you take a floor off, a sofa out, or change your dance hall back into a bedroom, putting it back is free; the list says "One spare".
- The server works out the bill from the plan itself, not from what the phone says, and takes it from your savings, then your wallet.
- Only the owner can build onto a home. If you rent, you can only rearrange.
- A home worth more also earns more rent if you ever let it out (6% of its value a game year).
- More furniture styles are **coming soon** (marked at the end of the furniture list).

## Where the code is

| What | File |
| --- | --- |
| The rules: sizes, room kinds, furniture, the starter home, cleaning a plan, overlaps | `src/lib/home-plan.ts` (tests in `src/lib/world/tests/home-plan.test.ts`) |
| Building a plan in 3D | `src/app/play/home/home3d.ts` |
| The editor | `src/app/play/home/home-planner.tsx` |
| Loading and saving | `src/app/play/life/home-plan-actions.ts` |
| The database | `game-db/063_home_plans.sql` (table `home_plans`), `game-db/064_home_upgrades.sql` (paying, home value) |

## Walking round it

- Go in (Home → Enter home, or the building's bubble) and you see the home as planned, built with the game's own furniture, lights, curtains and decorations.
- You walk round it as your own 3D avatar, seen from behind:
  - use the joystick (bottom left), or tap the floor;
  - drag to look round, pinch to come closer;
  - tap a seat to sit, and tap the stairs to go up or down.
- Visitors see the same home.

## Next steps

1. **Walk around inside the plan.** When you go into your own home on the map, draw your plan instead of the made-up room. To do that, `city-view.tsx` would check whether the building is your `home_unit` and use `buildHome` in place of `createInterior`. It would turn the furniture into `blocks`, so you can't walk through it, and add the stairs as the way between floors.
2. **Your things in your home.** The things you own from the shop (fan, bed, fridge, solar) would show as their own pieces. Placing one would turn its effect on.
3. **Visitors** would see your home as you planned it.
4. **More looks:**
   - Wall colours, floor types and windows.
   - Furniture in the same style as the rest of the game, in place of plain shapes.

## Visiting

Going into someone else's home (game-db/066_home_visits.sql, src/app/play/life/visit-actions.ts):

- **Who walks straight in:** you (your own home), the friends of anyone who lives there, anyone while a party is on, and anyone let in during the last 45 minutes.
- **Everyone else knocks or rings.** The people who live there get a notice and a push, and a card pops up for them: Let in, or Not now. A knock waits 5 minutes.
- **Nobody answering?** The visitor can leave a note at the door. It goes into the home's guest book.
- **Inside someone's home,** the main button is "Sign the guest book".
- **Parties:** on your home card, Throw a party. Your door's open to everyone for 2 hours and your friends are told. The guest book is on the home card too.
