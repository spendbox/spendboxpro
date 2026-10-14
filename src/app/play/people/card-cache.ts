"use client";

import type { PlayerCardData } from "../people-actions";

// People's cards open at once: their face, name and whether they're online show straight away
// from what the game already knows (the faces around, the people list, chat), and a card opened
// before shows in full while it's brought up to date behind it. The rest comes from
// GET /api/people/card (a plain request, so it never queues behind other taps).

export type CardPreview = { id: string; name: string; avatar: unknown; online?: boolean };

const cards = new Map<string, { card: PlayerCardData; at: number }>();
const previews = new Map<string, CardPreview>();
const loading = new Map<string, Promise<PlayerCardData | null>>();

/** What's known about someone without asking (seen in a list, a face on the map, chat). */
export function rememberPreview(p: CardPreview) {
  if (!p?.id || !p.name) return;
  previews.set(p.id, { ...previews.get(p.id), ...p });
  // Kept small: the most recent few hundred.
  if (previews.size > 600) previews.delete(previews.keys().next().value!);
}
export function rememberPreviews(list: readonly CardPreview[]) {
  for (const p of list) rememberPreview(p);
}

/** A card shown before (and how old it is), or null. */
export function cachedCard(id: string): { card: PlayerCardData; ageMs: number } | null {
  const c = cards.get(id);
  return c ? { card: c.card, ageMs: Date.now() - c.at } : null;
}
export const cardPreview = (id: string) => previews.get(id) ?? null;

/** Someone's card, from the server (one request at a time per person). */
export function loadCard(id: string): Promise<PlayerCardData | null> {
  const going = loading.get(id);
  if (going) return going;
  const p = fetch(`/api/people/card?id=${encodeURIComponent(id)}`, { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ card: PlayerCardData | null }>) : { card: null }))
    .then(({ card }) => {
      if (card) {
        cards.set(id, { card, at: Date.now() });
        if (cards.size > 200) cards.delete(cards.keys().next().value!);
        rememberPreview({ id: card.id, name: card.name, avatar: card.avatar, online: card.online });
      }
      return card;
    })
    .catch(() => null)
    .finally(() => loading.delete(id));
  loading.set(id, p);
  return p;
}

/** Start loading a card a moment early (a finger going down on someone's face). */
export function prefetchCard(id: string) {
  const c = cards.get(id);
  if (c && Date.now() - c.at < 30_000) return;
  void loadCard(id);
}

/** After you've done something to them (friends, a gift...): load it afresh next time. */
export function forgetCard(id: string) {
  cards.delete(id);
}
