# Free starter rooms

Every player gets a free room to live in, straight away, so nobody starts by hunting for a home.

- **Where:** a random room in one of the city's rooming houses ("face-me-I-face-you"), in the
  cheaper half of the city (`src/lib/world/starter-rooms.ts`). Lagos has about 41,500 rooms in 4,157
  rooming houses; rich areas like Ikoyi have none, so they stay something to work towards.
- **When:** the moment a player has a life and no home (a new life, a pack bought, back after a
  long time away). The game asks `POST /api/starter-room`, takes you there, and says where it is.
- **One free move:** on your home card, "Move to another free room (once)": pick a neighbourhood
  and you get a free room there.
- **It's free, so it's not yours to sell:** it can't be sold, let, listed or borrowed against.
- **It goes back to the city when:**
  - you buy a home of your own (from the city or a player): that becomes your home;
  - you haven't played for 60 days (you get a fresh one the moment you're back).

Database: `game-db/074_simple_life.sql` (`property_units.starter`, `starter_room_give`,
`starter_rooms_sweep`, and the triggers that guard a free room and give it back).

## Naming your home
Any home you hold, a free room too, can be named from its card (the pencil by its name;
`game-db/078_home_name.sql`, `home_rename`). When a free room is first given, its card opens with
the name box ready. Upgrade on the card is coming soon.
