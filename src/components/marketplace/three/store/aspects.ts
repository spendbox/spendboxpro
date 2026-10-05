"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { StoreTheme } from "@/lib/store-theme";
import { layoutHall, type HallProduct } from "./hall";

// Products posted before photo shapes were saved don't know theirs, so the
// shop measures them once in the browser (the photo, or a video's still
// frame) and lays the hall out again with every frame fitting its picture.
// Shared by the shop, its screen and the editor, so they always agree.

const measured = new Map<string, number>();
const asked = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const MAX = 150;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getVersion = () => version;

function measure(urls: string[]) {
  const todo = urls.filter((u) => !asked.has(u)).slice(0, Math.max(0, MAX - asked.size));
  if (!todo.length) return;
  todo.forEach((u) => asked.add(u));
  let left = todo.length;
  const finish = () => {
    if (--left > 0) return;
    // One relayout once they're all in (or given up on).
    version++;
    listeners.forEach((fn) => fn());
  };
  for (const url of todo) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => ((img.onload = img.onerror = null), finish()), 6000);
    img.onload = () => {
      clearTimeout(timer);
      if (img.naturalWidth && img.naturalHeight) measured.set(url, img.naturalWidth / img.naturalHeight);
      finish();
    };
    img.onerror = () => {
      clearTimeout(timer);
      finish();
    };
    img.src = url;
  }
}

const pictureOf = (p: HallProduct) => (p.media_type === "video" ? p.poster_url : p.media_url);

/** The products, each with its photo's shape (saved, or measured here). */
export function useMeasuredProducts<T extends HallProduct>(products: T[]): T[] {
  const v = useSyncExternalStore(subscribe, getVersion, () => 0);
  useEffect(() => {
    measure(products.filter((p) => !p.media_aspect).map(pictureOf).filter((u): u is string => Boolean(u)));
  }, [products]);
  return useMemo(() => {
    void v;
    return products.map((p) => {
      if (p.media_aspect) return p;
      const url = pictureOf(p);
      const a = url ? measured.get(url) : undefined;
      return a ? { ...p, media_aspect: a } : p;
    });
  }, [products, v]);
}

/** The hall for a shop's design and products (with every photo's shape known). */
export function useHall(products: HallProduct[], theme: StoreTheme, businessCategories: string[]) {
  const sized = useMeasuredProducts(products);
  const backCategory = theme.backWall.feature === "products" ? theme.backWall.category : null;
  return useMemo(() => layoutHall(sized, theme.categories, businessCategories, { backCategory }), [sized, theme.categories, businessCategories, backCategory]);
}
