# The city grows with its players

So property never runs out, Lagos gets bigger as more people play (`src/lib/world/growth.ts`,
`game-db/091_city_growth.sql`).

## Growth levels

Each city has a level from how many people live there. It only ever goes up (players leaving never
shrinks the city):

| Level | Players | About how many homes in Lagos |
|---|---|---|
| 0 | under 1,000 | 82,000 |
| 1 | 1,000 | |
| 2 | 3,000 | |
| 3 | 7,500 | 240,000 |
| 4 | 15,000 | |
| 5 | 30,000 | |
| 6 | 60,000 | 410,000 |
| 7 | 120,000 | |
| 8 | 250,000 | |
| 9 | 500,000 | 624,000 |

(Counted from the map; sold-out blocks growing adds more on top.)

As the level rises, **buildings nobody owns yet** change:

- Blocks get taller: half as tall again each level, up to 20 storeys for flats, 80 for apartment
  towers and 100 for glass towers.
- Bungalows, shop rows, duplexes, terraces and empty plots are rebuilt as blocks of flats or apartment
  towers (more of them each level). The edges of town fill in from level 2.
- Rooming houses stay as they are: they're the free homes.
- Gated estates are more common, reach less wealthy areas, and from level 3 one estate spans 2×2
  blocks (3×3 from level 6), one name across all of it.

Anything someone owns stands exactly as it was bought.

The server reads the level from the database every few minutes and the map asks
`/api/city-growth?region=…`, so a price shown is the price charged.

## Sold-out blocks grow

When every unit in a block of flats, apartments, offices, a plaza or a glass tower is owned, by two
players or more, it gains storeys (2 for flats, 4 for apartment and glass towers, 3 for offices, 1 for
a plaza) and the new units go on sale. Units already owned keep their number, name and size; the new
ones are added at the end. One owner of a whole block keeps it as it is. Owners get a notice.

## On phones

Very tall towers draw a window band every few storeys instead of every storey, so a 60-storey tower
costs no more to draw than a 24-storey one.
