"use client";

import { useCallback, useEffect, useState } from "react";
import type { OwnedProperty } from "@/lib/world/owned";
import type { AssetsData, PropertyApi } from "@/lib/world/property-api";

/** Your life on a real map: your assets and every owned building there (for the map), kept fresh. */
export function useLife(api: PropertyApi, region: string | null) {
  const [assets, setAssets] = useState<AssetsData | null>(null);
  const [owned, setOwned] = useState<OwnedProperty[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    if (!region) return;
    const [a, rows] = await Promise.all([api.myAssets(), api.ownedBuildings(region)]);
    setAssets(a);
    setOwned(rows.map((r) => ({ id: r.id, building: r.building, name: r.name ?? undefined })));
    setLoaded(true);
  }, [api, region]);
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    // Other people buy and name buildings too: look again now and then.
    const t = setInterval(() => void refresh(), 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);
  return { assets, owned, loaded, refresh };
}
