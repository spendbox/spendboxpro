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
