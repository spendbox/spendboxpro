# Lagos news and the weather

`src/lib/world/news.ts` makes the city's news from the clock and the map: a new story every 20
minutes (fires, traffic, power cuts, market prices, stars spotted, football, floods, road works,
festivals) about real areas and landmarks, and the weather every 3 hours (sunny, cloudy, rain,
thunderstorms, harmattan haze). It's the same for everyone at the same moment, with no database.
The weather shows in the sky: when the news says it's raining, it rains in the city.

Players' new inventions join the news. Every story can be shared (the phone's share sheet, or
copied with a link to the game) and most have "Show me" to fly to the place. Open it from the
phone: News.

About a third of the stories are street life (a goat chasing a conductor, an owambe nobody knows
the host of, area boys asking a billboard for "settlement"). Players make the news too
(`src/app/play/news-actions.ts`): a home bought for ₥15,000 or more, a business lighting up a
building and a Rich Family arrival each become a headline, said with some fun, and a fresh one
breaks in at the top of the screen. The list goes on as you scroll, back weeks.

## Tap through and see it happen

Tapping **Show me** on a story (or tapping a breaking-news pop-up) flies you there and the story plays
out on the spot for a few minutes, using the world-event scenes (src/app/play/city/events): fire
engines at a fire, water on the roads in a flood, barriers and a works truck for road works, a
carnival or masquerade for a festival, a motorcade for a star or a rich arrival, an owambe for a big
home buy, a ribbon cutting for a new business, a victory dance for a challenge won. Street-life
stories pick theirs by what they're about (a goat chase brings animals into traffic, a jollof war a
food festival). `scene` on each story (src/lib/world/news.ts) names it; it's drawn on your phone only,
near the story's spot, and has no reward to grab.

## Big street events

About one story in six is something that takes over a whole street, and tapping through shows it
filling the road end to end (src/app/play/city/events/scenes-d.ts):

- **Street rave**: a DJ in the middle of the road, speaker stacks and string lights all the way
  down, lasers over a packed dancing crowd, a "drop" every 20 seconds when everyone dances together.
- **Street concert**: a stage across the road with a big screen and a band, light towers, fireworks,
  and fans packed from the stage to the far end (phone lights at night).
- **Protest march**: a long column with placards and a banner, a leader with a megaphone, police cars
  in front and behind, people watching from the roadside.

These three are only played by the news (NEWS_EVENTS in src/lib/world-events.ts), never scheduled
by the database. The crowd gathers over the first seconds and drifts away at the end.
