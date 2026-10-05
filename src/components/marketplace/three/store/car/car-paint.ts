"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";

// Each car in a showroom is painted like the car in its photo: the strongest
// colour in the middle of the picture, deepened into a glossy paint. Grey,
// white and black cars get silver, pearl white or graphite. If the photo
// can't be read, cars take turns through a few classic colours.

export const PAINTS = ["#8f0b12", "#14213d", "#0f3d2e", "#b8bcc2", "#ece9e2", "#2b2e33"];

const cache = new Map<string, Promise<string | null>>();

function readPhoto(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const n = 48;
        const c = document.createElement("canvas");
        c.width = n;
        c.height = n;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, n, n);
        const data = ctx.getImageData(0, 0, n, n).data;
        // Per hue bucket: how strongly it shows (summed saturation), how many pixels, and their summed hue, saturation and lightness.
        const weight = new Array<number>(24).fill(0);
        const count = new Array<number>(24).fill(0);
        const sums = Array.from({ length: 24 }, () => [0, 0, 0]);
        const lights: number[] = [];
        let counted = 0;
        let colourful = 0;
        const hsl = { h: 0, s: 0, l: 0 };
        const col = new THREE.Color();
        // The middle of the picture, where the car usually is.
        for (let y = Math.floor(n * 0.25); y < Math.floor(n * 0.85); y++)
          for (let x = Math.floor(n * 0.1); x < Math.floor(n * 0.9); x++) {
            const i = (y * n + x) * 4;
            col.setRGB(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255, THREE.SRGBColorSpace);
            col.getHSL(hsl, THREE.SRGBColorSpace);
            counted++;
            if (hsl.s > 0.32 && hsl.l > 0.12 && hsl.l < 0.85) {
              const b = Math.min(23, Math.floor(hsl.h * 24));
              weight[b]! += hsl.s;
              count[b]!++;
              sums[b]![0]! += hsl.h;
              sums[b]![1]! += hsl.s;
              sums[b]![2]! += hsl.l;
              colourful++;
            } else if (y > n * 0.45 && y < n * 0.78) lights.push(hsl.l);
          }
        if (colourful > counted * 0.14) {
          let best = 0;
          for (let b = 1; b < 24; b++) if (weight[b]! > weight[best]!) best = b;
          const m = Math.max(1, count[best]!);
          const [hs, ss, ls] = sums[best]!;
          const h = hs! / m;
          const s = Math.min(0.85, Math.max(0.55, ss! / m));
          const l = Math.min(0.42, Math.max(0.2, (ls! / m) * 0.8));
          return resolve(`#${new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace)}`);
        }
        lights.sort((a, b) => a - b);
        const mid = lights.length ? lights[Math.floor(lights.length / 2)]! : 0.5;
        resolve(mid < 0.22 ? "#1b1d21" : mid < 0.5 ? "#3a3d42" : mid < 0.78 ? "#b8bcc2" : "#ece9e2");
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function paintFromPhoto(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = readPhoto(url);
    cache.set(url, p);
  }
  return p;
}

/** The paint for each car, from its photo (a classic colour until it's read, or if it can't be). */
export function usePaints(photos: (string | null)[]) {
  const key = photos.join("|");
  const [read, setRead] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    for (const url of key.split("|")) {
      if (!url) continue;
      paintFromPhoto(url).then((paint) => {
        if (alive && paint) setRead((r) => (r[url] === paint ? r : { ...r, [url]: paint }));
      });
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return photos.map((url, i) => (url && read[url]) || PAINTS[i % PAINTS.length]!);
}
