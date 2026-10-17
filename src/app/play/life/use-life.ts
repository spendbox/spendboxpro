"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OwnedProperty } from "@/lib/world/owned";
import type { AssetsData, OwnedBuildingRow, OwnedChanges, PropertyApi } from "@/lib/world/property-api";
import { whileHere } from "../activity";

/** The city's owned buildings (/api/owned, game-db/125): all of them, or what changed since `since` (ms). fresh: not the CDN's copy. */
export async function ownedChanges(region: string, since: number | null, fresh: boolean): Promise<OwnedChanges | null> {
  const q = new URLSearchParams({ region });
  if (since) q.set("since", String(since));
  if (fresh) q.set("fresh", "1");
  const r = await fetch(`/api/owned?${q}`, fresh ? { cache: "no-store" } : undefined).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json()) as OwnedChanges;
}

/** Looks again this often (ms): your own changes show at once (refresh), others' within this. */
const EVERY_MS = 5 * 60_000;

/**
 * Your life on a real map: your assets and every owned building there (for the map), kept fresh.
 * The buildings come whole once, then only what changed (api.ownedChanges; asked from a minute
 * before the last answer, rounded to the minute so phones share the CDN's answers).
 */
export function useLife(api: PropertyApi, region: string | null, who?: string | null) {
  const [assets, setAssets] = useState<AssetsData | null>(null);
  const [owned, setOwned] = useState<OwnedProperty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const list = useRef<{ region: string; at: number; rows: Map<string, OwnedBuildingRow> } | null>(null);

  const buildings = useCallback(
    async (fresh: boolean): Promise<OwnedBuildingRow[] | null> => {
      if (!region) return null;
      if (!api.ownedChanges) return api.ownedBuildings(region);
      const have = list.current?.region === region ? list.current : null;
      const since = have ? Math.floor((have.at - 60_000) / 60_000) * 60_000 : null;
      const d = await api.ownedChanges(region, since, fresh);
      if (!d) return have ? [...have.rows.values()] : null;
      const rows = d.full || !have ? new Map<string, OwnedBuildingRow>() : have.rows;
      for (const r of d.rows) rows.set(r.id, r);
      list.current = { region, at: d.at, rows };
      return [...rows.values()];
    },
    [api, region],
  );

  const load = useCallback(
    async (fresh: boolean) => {
      if (!region) return;
      const [a, rows] = await Promise.all([api.myAssets(), buildings(fresh)]);
      setAssets(a);
      if (rows) setOwned(rows.map((r) => ({ id: r.id, building: r.building, name: r.name ?? undefined })));
      setLoaded(true);
      // `who` (the player's name) only makes it ask again once signing up is finished.
    },
    [api, region, who, buildings], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /** Look again now (after you bought, named or moved something: not the CDN's copy). */
  const refresh = useCallback(() => load(true), [load]);
  useEffect(() => {
    // Straight away, and again a few seconds later if that didn't work (just after signing up).
    const first = setTimeout(() => void load(false).catch(() => setTimeout(() => void load(false).catch(() => {}), 4000)), 0);
    // Other people buy and name buildings too: look again now and then.
    const stop = whileHere(() => void load(false), EVERY_MS);
    return () => {
      clearTimeout(first);
      stop();
    };
  }, [load]);
  return { assets, owned, loaded, refresh };
}
