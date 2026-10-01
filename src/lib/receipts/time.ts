/** Offset of a time zone from UTC at a given moment, in milliseconds. */
function zoneOffset(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at.getTime();
}

/**
 * Turns the date and time printed on a receipt ("2026-10-01", "14:14") into a
 * real moment, reading them as local time in the given time zone.
 */
export function receiptMoment(date: string | null, time: string | null, timeZone: string): Date | null {
  const d = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) return null;
  const t = time?.match(/^(\d{1,2}):(\d{2})/);
  const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, min] = t ? [Number(t[1]), Number(t[2])] : [12, 0];
  if (m < 1 || m > 12 || day < 1 || day > 31 || h > 23 || min > 59) return null;
  const guess = new Date(Date.UTC(y, m - 1, day, h, min));
  if (Number.isNaN(guess.getTime())) return null;
  return new Date(guess.getTime() - zoneOffset(guess, timeZone));
}
