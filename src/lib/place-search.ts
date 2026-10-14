import "server-only";

import { REGIONS } from "@/lib/world";
import { createAdminClient } from "@/lib/supabase/admin";

// Searching the map for the names players give their places (src/app/play/life/map-search.tsx
// searches everything that comes with the map on the phone itself): buildings named by their
// owner, homes with their own name ("Tolu's Pad"), and businesses, wherever they are. Asked for
// with GET /api/places (a plain request, so typing never holds up a tap's server action).

export type NamedPlace = { label: string; note: string; building: string };

/** The names a unit has until its owner gives it one ("Flat 2", "Room 3", "The whole duplex"...). */
const PLAIN_UNIT = /^(room|home|flat|house|apartment|office|office floor|office suite|shop|lobby shop|ground floor shops|the whole [a-z]+)( [0-9]+[a-z]?)?( .*)?$/i;

/** Places players have named that match what's typed (at most 12), for one region. */
export async function searchNamedPlaces(region: string, query: string): Promise<NamedPlace[]> {
  if (!REGIONS[region]) return [];
  const q = String(query ?? "").trim().slice(0, 40);
  if (q.length < 2) return [];
  // Typed % and _ are letters here, not wildcards.
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const inRegion = `${region}:%`;
  const db = createAdminClient();
  const [buildings, units, leases] = await Promise.all([
    db.from("property_buildings").select("building_id, name").eq("region", region).not("name", "is", null).ilike("name", like).limit(12),
    db.from("property_units").select("building_id, label, use").like("building_id", inRegion).ilike("label", like).limit(40),
    db.from("business_leases").select("building_id, name, category").eq("region", region).eq("status", "live").gt("ends_at", new Date().toISOString()).ilike("name", like).limit(12),
  ]);
  const out: NamedPlace[] = [];
  for (const b of (buildings.data ?? []) as { building_id: string; name: string }[]) out.push({ label: b.name, note: "Named building", building: b.building_id });
  for (const l of (leases.data ?? []) as { building_id: string; name: string; category: string | null }[]) {
    out.push({ label: l.name, note: l.category || "Business", building: l.building_id });
  }
  for (const u of (units.data ?? []) as { building_id: string; label: string; use: string }[]) {
    if (PLAIN_UNIT.test(u.label)) continue;
    out.push({ label: u.label, note: u.use === "home" ? "Home" : "Named place", building: u.building_id });
  }
  const seen = new Set<string>();
  return out.filter((p) => !seen.has(p.label + p.building) && seen.add(p.label + p.building)).slice(0, 12);
}
