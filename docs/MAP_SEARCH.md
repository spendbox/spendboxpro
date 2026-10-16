# Searching the map

Tap the search next to the city's name (top left). It finds:

- **Kinds of place, nearest first** (`src/lib/world/place-kinds.ts`): type "club", "clubs near me",
  "church", "mosque", "court", "airport", "petrol", "hospital", "bank", "train"... and the nearest
  ones to where you're looking come up first, with how far they are ("Club · 1.2 km"). The
  everyday places are found on the streets round you (up to 5 km out, further only until there
  are enough), the big landmarks, named spots and railway stations anywhere in the city.
  - Every kind has the words people use for it: plurals, short forms and Nigerian words too
    ("buka", "mama put", "oja", "masjid", "nepa", "brt"). Words like "near me" are ignored.
  - Half a word works from 3 letters ("chur"), and a small slip too ("hospitl", "airprot").
  - Nothing typed yet: quick buttons for the most wanted kinds (Clubs, Restaurants, Churches,
    Mosques, Hospitals, Courts, Stadiums, Malls, Markets, Banks, Hotels, Airports, Stations,
    Parks, Petrol stations, Police stations).
- **Names**: areas, districts, landmarks, stations, roads, your own property, the names players
  give buildings and homes, and businesses (as before), now allowing a slip in each word.
- **Budget**: what you could buy for a budget, cheapest first (as before).

Adding a kind of place, or a word for one, is one line in `PLACE_KINDS`.
