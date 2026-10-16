// The Lagos calendar (docs/LIFE_WHEEL.md, phase 7): seasons and special days, so the year itself
// feels different month to month. A moment with `season` comes only then, and three times as
// often (./season-moments.ts). Dates are Lagos dates; feasts that move with the moon (Ramadan,
// both Sallahs) and Easter are given year by year.
//
// Each city gets its own calendar as the game goes international (`region`).

export type Season = {
  id: string;
  name: string;
  emoji: string;
  region: string;
  /** Every year, from month-day to month-day ("12-15" to "01-05" runs over the new year). */
  every?: [string, string][];
  /** Particular years: [from, to] as full dates. */
  dates?: [string, string][];
  /** Every month, from this day to the month's end (pay week). */
  monthFrom?: number;
};

export const SEASONS: Season[] = [
  { id: "new_year", name: "New Year", emoji: "🎆", region: "lagos", every: [["01-01", "01-03"]] },
  { id: "harmattan", name: "Harmattan", emoji: "🌫️", region: "lagos", every: [["12-01", "02-15"]] },
  { id: "school_resumption", name: "School resumption", emoji: "🎒", region: "lagos", every: [["01-06", "01-14"], ["04-27", "05-05"], ["09-08", "09-18"]] },
  { id: "valentines", name: "Valentine's", emoji: "💘", region: "lagos", every: [["02-13", "02-14"]] },
  { id: "elections", name: "Election season", emoji: "🗳️", region: "lagos", dates: [["2027-01-15", "2027-03-15"], ["2031-01-15", "2031-03-15"]] },
  {
    id: "ramadan",
    name: "Ramadan",
    emoji: "🌙",
    region: "lagos",
    dates: [["2026-02-18", "2026-03-19"], ["2027-02-08", "2027-03-09"], ["2028-01-28", "2028-02-26"], ["2029-01-16", "2029-02-14"]],
  },
  { id: "eid_fitr", name: "Sallah (Eid al-Fitr)", emoji: "🕌", region: "lagos", dates: [["2026-03-20", "2026-03-22"], ["2027-03-10", "2027-03-12"], ["2028-02-27", "2028-02-29"], ["2029-02-15", "2029-02-17"]] },
  { id: "mothers_day", name: "Mothering Sunday", emoji: "💐", region: "lagos", dates: [["2026-03-15", "2026-03-15"], ["2027-03-07", "2027-03-07"], ["2028-03-26", "2028-03-26"]] },
  { id: "easter", name: "Easter", emoji: "🐣", region: "lagos", dates: [["2026-04-03", "2026-04-06"], ["2027-03-26", "2027-03-29"], ["2028-04-14", "2028-04-17"], ["2029-03-30", "2029-04-02"]] },
  { id: "rainy_season", name: "Rainy season", emoji: "🌧️", region: "lagos", every: [["04-15", "07-31"], ["09-01", "10-31"]] },
  { id: "workers_day", name: "Workers' Day", emoji: "🛠️", region: "lagos", every: [["05-01", "05-01"]] },
  { id: "childrens_day", name: "Children's Day", emoji: "🧒🏾", region: "lagos", every: [["05-27", "05-27"]] },
  { id: "eid_adha", name: "Sallah (Eid al-Adha)", emoji: "🐏", region: "lagos", dates: [["2026-05-26", "2026-05-29"], ["2027-05-16", "2027-05-19"], ["2028-05-04", "2028-05-07"], ["2029-04-23", "2029-04-26"]] },
  { id: "democracy_day", name: "Democracy Day", emoji: "🇳🇬", region: "lagos", every: [["06-12", "06-12"]] },
  { id: "august_break", name: "August break", emoji: "☀️", region: "lagos", every: [["08-01", "08-31"]] },
  { id: "new_yam", name: "New Yam festival", emoji: "🍠", region: "lagos", every: [["08-08", "08-20"]] },
  { id: "independence", name: "Independence Day", emoji: "🇳🇬", region: "lagos", every: [["10-01", "10-01"]] },
  { id: "black_friday", name: "Black Friday", emoji: "🛍️", region: "lagos", every: [["11-24", "11-30"]] },
  { id: "detty_december", name: "Detty December", emoji: "🪩", region: "lagos", every: [["12-15", "01-05"]] },
  { id: "christmas", name: "Christmas", emoji: "🎄", region: "lagos", every: [["12-23", "12-26"]] },
  { id: "pay_week", name: "Pay week", emoji: "💰", region: "lagos", monthFrom: 25 },
  { id: "month_start", name: "Waiting for salary", emoji: "🪫", region: "lagos", every: [] },
];

export const SEASON_BY_ID = new Map(SEASONS.map((s) => [s.id, s]));

/** A date in Lagos as YYYY-MM-DD (Lagos is UTC+1, all year). */
export function lagosDate(now = Date.now()) {
  return new Date(now + 3_600_000).toISOString().slice(0, 10);
}

/** Whether a month-day falls within [from, to] (which can run over the new year). */
function inRange(md: string, from: string, to: string) {
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/** The seasons and special days it is now, in this city. */
export function seasonsAt(now = Date.now(), region = "lagos"): string[] {
  const day = lagosDate(now);
  const md = day.slice(5);
  const dom = Number(day.slice(8));
  const out: string[] = [];
  for (const s of SEASONS) {
    if (s.region !== region) continue;
    if (s.every?.some(([a, b]) => inRange(md, a, b))) out.push(s.id);
    else if (s.dates?.some(([a, b]) => day >= a && day <= b)) out.push(s.id);
    else if (s.monthFrom && dom >= s.monthFrom) out.push(s.id);
  }
  // The first ten days of the month: last month's salary is long gone.
  if (dom <= 10) out.push("month_start");
  return out;
}
