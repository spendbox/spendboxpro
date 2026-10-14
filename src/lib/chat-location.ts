// A location sent in a chat (docs/CHAT.md): the message text carries where, in a small tag at the end
// ("📍 Yaba · Herbert Macaulay Way [[at:lagos:12,-40]]"). The chat shows it as a card with Go there;
// going there costs the usual fare, like any trip.

export type ChatLocation = { region: string; x: number; z: number; label: string };

const TAG = /\s*\[\[at:([a-z0-9-]{2,30}):(-?\d{1,5}),(-?\d{1,5})\]\]\s*$/;

/** The location in a message, or null. */
export function locationIn(body: string | null | undefined): ChatLocation | null {
  if (!body) return null;
  const m = TAG.exec(body);
  if (!m) return null;
  const label = body.slice(0, m.index).replace(/^\u{1F4CD}\u{FE0F}?\s*/u, "").trim() || "A spot on the map";
  return { region: m[1], x: Number(m[2]), z: Number(m[3]), label };
}

/** The words of a message with any location tag taken off (for previews and notices). */
export const withoutTag = (body: string) => body.replace(TAG, "").trim();

/** The message text for a location. */
export const locationBody = (label: string, region: string, x: number, z: number) =>
  `📍 ${label.replace(/\[\[|\]\]/g, "").slice(0, 120)} [[at:${region}:${Math.round(x)},${Math.round(z)}]]`;
