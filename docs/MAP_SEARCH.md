# Searching the map

Tap the search next to the city's name (top left). It finds:

- **Kinds of place, nearest first** (`src/lib/world/place-kinds.ts`): type "club", "clubs near me",
  "church", "mosque", "court" (a law court; "basketball" for the courts you play on), "airport",
  "petrol", "hospital", "bank", "train"... and the nearest
  ones to where you're looking come up first, with how far they are ("Club · 1.2 km"). The
  everyday places are found on the streets round you (up to 5 km out, further only until there
  are enough), the big landmarks, named spots and railway stations anywhere in the city.
  - Every kind has the words people use for it: plurals, short forms and Nigerian words too
    ("buka", "mama put", "oja", "masjid", "nepa", "brt"). Words like "near me" are ignored.
  - Half a word works from 3 letters ("chur"), and a small slip too ("hospitl", "airprot").
  - Nothing typed yet: quick buttons for the most wanted kinds (Clubs, Restaurants, Churches,
    Mosques, Hospitals, Law courts, Stadiums, Malls, Markets, Banks, Hotels, Airports, Stations,
    Parks, Petrol stations, Police stations).
- **Names**: areas, districts, landmarks, stations, roads, your own property, the names players
  give buildings and homes, and businesses (as before), now allowing a slip in each word.
- **Budget**: what you could buy for a budget, cheapest first (as before).

Adding a kind of place, or a word for one, is one line in `PLACE_KINDS`.

## Banks and law courts

Bank branches and law courts (magistrates', high and customary courts) stand all over town
(`baseTile` and `pickFeature` in `src/lib/city/layout.ts`): on busy streets, on lots that were a
clock tower or a building site, and in quieter areas in place of some pitches, playgrounds and
monuments. None of those lots can be owned, so no one's property changed. A branch has a banking
hall inside (Banking opens your money); a court has a courtroom, and some a floor of judges'
chambers. The banks have made-up names (Crest Bank, Cowry Bank...), never a real bank's.
