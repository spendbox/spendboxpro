// Cuts a product (or the model wearing it) out of its photo, in the browser,
// for the 3D shop.
//
// 1. Learn the background: the colours round the edge of the photo, grouped
//    into a few clusters (a wall and a floor, a gradient, a backdrop), with
//    room for the softer, darker shadows they carry.
// 2. Grow the background in from the edges through anything that matches it,
//    stopping at real edges, and clear gaps inside the shape that match it too.
// 3. Learn the product's own colours, and decide the pixels along the outline
//    by which they're closer to, at full size, for a clean, soft edge, then
//    take the background's tint back out of those edge pixels.
//
// It handles studio shots, plain walls and wall-and-floor photos. When the
// edges of a photo are too varied to tell background from product (a street,
// a crowded room) it gives up rather than cut badly.

const ANALYSE_SIDE = 640;
const OUTPUT_SIDE = 1400;

export interface Cutout {
  /** A PNG with a see-through background, cropped to the product. */
  blob: Blob;
  width: number;
  height: number;
}

interface Cluster {
  y: number;
  cb: number;
  cr: number;
  r: number;
  g: number;
  b: number;
  spread: number;
}

async function loadImage(source: Blob | string): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof source !== "string") return createImageBitmap(source);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = source;
  await img.decode();
  return img;
}

function pixels(image: CanvasImageSource & { width: number; height: number }, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, w, h);
  return { canvas, ctx, data: ctx.getImageData(0, 0, w, h), w, h };
}

/** Makes a cutout, or null if the background can't be told apart from the product. */
export async function makeCutout(source: Blob | string): Promise<Cutout | null> {
  const image = await loadImage(source);
  const small = pixels(image, ANALYSE_SIDE);
  const found = analyse(small.data.data, small.w, small.h);
  if (!found) return null;
  const full = pixels(image, OUTPUT_SIDE);
  const alpha = refine(found, full.data.data, full.w, full.h, small.w, small.h);

  // Crop to the product, with a little room round it.
  const { w, h } = full;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alpha[y * w + x]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = Math.round(Math.max(w, h) * 0.01);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  full.ctx.putImageData(full.data, 0, 0);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(full.canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  return blob ? { blob, width: out.width, height: out.height } : null;
}

// ---------------------------------------------------------------- Colour helpers

const yOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const cbOf = (r: number, g: number, b: number) => -0.1687 * r - 0.3313 * g + 0.5 * b;
const crOf = (r: number, g: number, b: number) => 0.5 * r - 0.4187 * g - 0.0813 * b;

/**
 * How far a colour is from a cluster, in multiples of the cluster's own spread.
 * Colour (hue) counts fully; brightness counts less, and darker counts least,
 * so a shadow on the floor still reads as floor.
 */
function clusterDist(c: Cluster, y: number, cb: number, cr: number, shadows: boolean) {
  const dy = y - c.y;
  const wy = shadows && dy < 0 ? 0.28 : 0.6;
  return Math.sqrt((cb - c.cb) ** 2 + (cr - c.cr) ** 2 + (wy * dy) ** 2) / (c.spread + 5);
}

/** Groups colour samples into up to k clusters (k-means), dropping tiny ones. */
function clusters(samples: number[][], k: number, minShare: number): Cluster[] {
  if (!samples.length) return [];
  const centres: number[][] = [samples[0]!.slice()];
  // Start from colours far apart from each other.
  while (centres.length < k) {
    let best = samples[0]!;
    let bestD = -1;
    for (const s of samples) {
      const d = Math.min(...centres.map((c) => (s[0]! - c[0]!) ** 2 * 0.36 + (s[1]! - c[1]!) ** 2 + (s[2]! - c[2]!) ** 2));
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    if (bestD < 30) break;
    centres.push(best.slice());
  }
  let owner = new Int32Array(samples.length);
  for (let iter = 0; iter < 10; iter++) {
    owner = new Int32Array(samples.length);
    samples.forEach((s, i) => {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((c, j) => {
        const d = (s[0]! - c[0]!) ** 2 * 0.36 + (s[1]! - c[1]!) ** 2 + (s[2]! - c[2]!) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      owner[i] = best;
    });
    centres.forEach((c, j) => {
      const mine = samples.filter((_, i) => owner[i] === j);
      if (!mine.length) return;
      for (let d = 0; d < 6; d++) c[d] = mine.reduce((a, s) => a + s[d]!, 0) / mine.length;
    });
  }
  const out: Cluster[] = [];
  centres.forEach((c, j) => {
    const mine = samples.filter((_, i) => owner[i] === j);
    if (mine.length < samples.length * minShare) return;
    const dists = mine.map((s) => Math.sqrt((s[0]! - c[0]!) ** 2 * 0.36 + (s[1]! - c[1]!) ** 2 + (s[2]! - c[2]!) ** 2)).sort((a, b) => a - b);
    out.push({ y: c[0]!, cb: c[1]!, cr: c[2]!, r: c[3]!, g: c[4]!, b: c[5]!, spread: dists[Math.floor(dists.length * 0.9)] ?? 0 });
  });
  return out;
}

const sampleAt = (px: Uint8ClampedArray, i: number) => {
  const r = px[i * 4]!;
  const g = px[i * 4 + 1]!;
  const b = px[i * 4 + 2]!;
  return [yOf(r, g, b), cbOf(r, g, b), crOf(r, g, b), r, g, b];
};

// ---------------------------------------------------------------- Finding the product

interface Analysis {
  /** Soft mask (0–1) at the analysed size. */
  alpha: Float32Array;
  bg: Cluster[];
  fg: Cluster[];
}

function analyse(px: Uint8ClampedArray, w: number, h: number): Analysis | null {
  const n = w * h;
  const Y = new Float32Array(n);
  const CB = new Float32Array(n);
  const CR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = px[i * 4]!;
    const g = px[i * 4 + 1]!;
    const b = px[i * 4 + 2]!;
    Y[i] = yOf(r, g, b);
    CB[i] = cbOf(r, g, b);
    CR[i] = crOf(r, g, b);
  }

  // The edge band: a few pixels in from each side.
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const edge: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (x < band || y < band || x >= w - band || y >= h - band) edge.push(y * w + x);
  const step = Math.max(1, Math.floor(edge.length / 3000));
  const bg = clusters(
    edge.filter((_, k) => k % step === 0).map((i) => sampleAt(px, i)),
    5,
    0.03,
  );
  if (!bg.length) return null;
  const bgDist = new Float32Array(n);
  for (let i = 0; i < n; i++) bgDist[i] = Math.min(...bg.map((c) => clusterDist(c, Y[i]!, CB[i]!, CR[i]!, true)));

  // Most of the edge has to look like the background we learned.
  const covered = edge.filter((i) => bgDist[i]! < 2.2).length / edge.length;
  if (covered < 0.8) return null;

  // Edges in the picture (brightness and colour changes), where growing stops.
  const grad = new Float32Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let g = 0;
      for (const ch of [Y, CB, CR]) {
        const gx = ch[i + 1]! - ch[i - 1]!;
        const gy = ch[i + w]! - ch[i - w]!;
        g += gx * gx + gy * gy;
      }
      grad[i] = Math.sqrt(g);
    }
  const edgeGrads = edge.map((i) => grad[i]!).sort((a, b) => a - b);
  const gradLimit = Math.max(16, edgeGrads[Math.floor(edgeGrads.length * 0.92)]! * 1.8);

  // Grow the background in from the edges.
  const isBg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        const i = y * w + x;
        if (bgDist[i]! < 2.4) {
          isBg[i] = 1;
          queue[tail++] = i;
        }
      }
  const neighbours = (i: number) => {
    const x = i % w;
    return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
  };
  while (head < tail) {
    const i = queue[head++]!;
    for (const j of neighbours(i)) {
      if (j < 0 || j >= n || isBg[j]) continue;
      const d = bgDist[j]!;
      if (d < 1.2 || (d < 2.6 && grad[j]! < gradLimit)) {
        isBg[j] = 1;
        queue[tail++] = j;
      }
    }
  }

  // Gaps inside the shape that are clearly background (between arms and body, inside a handle).
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (isBg[s] || seen[s] || bgDist[s]! >= 1.3) continue;
    head = tail = 0;
    queue[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const i = queue[head++]!;
      for (const j of neighbours(i)) {
        if (j < 0 || j >= n || seen[j] || isBg[j] || bgDist[j]! >= 1.3) continue;
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
    if (tail > n * 0.0015) for (let k = 0; k < tail; k++) isBg[queue[k]!] = 1;
  }

  // Keep the product: the biggest piece and any others that aren't specks (a bottle's cap, a pair's second shoe).
  const label = new Int32Array(n);
  const sizes = [0];
  for (let s = 0; s < n; s++) {
    if (isBg[s] || label[s]) continue;
    const id = sizes.length;
    head = tail = 0;
    queue[tail++] = s;
    label[s] = id;
    while (head < tail) {
      const i = queue[head++]!;
      for (const j of neighbours(i)) {
        if (j < 0 || j >= n || isBg[j] || label[j]) continue;
        label[j] = id;
        queue[tail++] = j;
      }
    }
    sizes.push(tail);
  }
  const biggest = Math.max(...sizes);
  const fgMask = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++)
    if (!isBg[i] && sizes[label[i]!]! >= Math.max(biggest / 30, n * 0.002)) {
      fgMask[i] = 1;
      count++;
    }
  if (count < n * 0.03 || count > n * 0.93) return null;

  // Thin lines in the background's own colours (where a wall meets the floor, a
  // skirting board, a crease in a backdrop) go, even where they touch the product.
  const grey = (i: number) => Math.min(...bg.map((c) => Math.sqrt((CB[i]! - c.cb) ** 2 + (CR[i]! - c.cr) ** 2) / (c.spread + 5))) < 1.3;
  const run = (i: number, stride: number, limit: number) => {
    let k = 1;
    for (let j = i - stride; j >= 0 && j < n && fgMask[j] && k <= limit; j -= stride) k++;
    for (let j = i + stride; j >= 0 && j < n && fgMask[j] && k <= limit; j += stride) k++;
    return k;
  };
  const thin = Math.max(3, Math.round(Math.min(w, h) * 0.008));
  const drop: number[] = [];
  for (let i = 0; i < n; i++) if (fgMask[i] && grey(i) && (run(i, w, thin + 1) <= thin || run(i, 1, thin + 1) <= thin)) drop.push(i);
  for (const i of drop) fgMask[i] = 0;

  // Small background specks enclosed by the product (a stray highlight) become product.
  const bgLabel = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (fgMask[s] || bgLabel[s]) continue;
    head = tail = 0;
    queue[tail++] = s;
    bgLabel[s] = 1;
    let touchesEdge = false;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % w;
      if (x === 0 || x === w - 1 || i < w || i >= n - w) touchesEdge = true;
      for (const j of neighbours(i)) {
        if (j < 0 || j >= n || fgMask[j] || bgLabel[j]) continue;
        bgLabel[j] = 1;
        queue[tail++] = j;
      }
    }
    if (!touchesEdge && tail < n * 0.0008) for (let k = 0; k < tail; k++) fgMask[queue[k]!] = 1;
  }

  // The product's own colours, from well inside it.
  const inner: number[][] = [];
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (fgMask[i] && fgMask[i - 2] && fgMask[i + 2] && fgMask[i - 2 * w] && fgMask[i + 2 * w] && (x + y) % 3 === 0) inner.push(sampleAt(px, i));
    }
  const fgStep = Math.max(1, Math.floor(inner.length / 3000));
  const fg = clusters(
    inner.filter((_, k) => k % fgStep === 0),
    7,
    0.01,
  );

  // A soft edge: along the outline, how much more like the product than the background each pixel is.
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) alpha[i] = fgMask[i]!;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const border = fgMask[i] !== fgMask[i - 1] || fgMask[i] !== fgMask[i + 1] || fgMask[i] !== fgMask[i - w] || fgMask[i] !== fgMask[i + w];
      if (!border || !fg.length) continue;
      alpha[i] = softness(bgDist[i]!, Math.min(...fg.map((c) => clusterDist(c, Y[i]!, CB[i]!, CR[i]!, false))), fgMask[i]!);
    }
  return { alpha, bg, fg };
}

/** 0–1: how much a pixel belongs to the product, from its distances to both. */
function softness(dBg: number, dFg: number, hard: number) {
  const soft = (dBg * dBg) / (dBg * dBg + dFg * dFg + 1e-6);
  return Math.min(1, Math.max(0, 0.45 * hard + 0.55 * soft));
}

// ---------------------------------------------------------------- Full-size edge

function refine(found: Analysis, px: Uint8ClampedArray, w: number, h: number, sw: number, sh: number) {
  const n = w * h;
  const alpha = new Uint8ClampedArray(n);
  const sx = (sw - 1) / Math.max(1, w - 1);
  const sy = (sh - 1) / Math.max(1, h - 1);
  for (let y = 0; y < h; y++) {
    const fy = y * sy;
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = x * sx;
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const a = found.alpha;
      let v = (a[y0 * sw + x0]! * (1 - tx) + a[y0 * sw + x1]! * tx) * (1 - ty) + (a[y1 * sw + x0]! * (1 - tx) + a[y1 * sw + x1]! * tx) * ty;
      const i = y * w + x;
      // Along the outline, decide again from this pixel's own colour, at full size.
      if (v > 0.03 && v < 0.97 && found.fg.length) {
        const r = px[i * 4]!;
        const g = px[i * 4 + 1]!;
        const b = px[i * 4 + 2]!;
        const yy = yOf(r, g, b);
        const cb = cbOf(r, g, b);
        const cr = crOf(r, g, b);
        const dBg = Math.min(...found.bg.map((c) => clusterDist(c, yy, cb, cr, true)));
        const dFg = Math.min(...found.fg.map((c) => clusterDist(c, yy, cb, cr, false)));
        v = 0.5 * v + 0.5 * softness(dBg, dFg, v > 0.5 ? 1 : 0);
        // Take the background's tint out of the edge pixel.
        if (v > 0.05 && v < 0.95) {
          let best = found.bg[0]!;
          let bestD = Infinity;
          for (const c of found.bg) {
            const d = clusterDist(c, yy, cb, cr, true);
            if (d < bestD) {
              bestD = d;
              best = c;
            }
          }
          px[i * 4] = Math.max(0, Math.min(255, (r - (1 - v) * best.r) / v));
          px[i * 4 + 1] = Math.max(0, Math.min(255, (g - (1 - v) * best.g) / v));
          px[i * 4 + 2] = Math.max(0, Math.min(255, (b - (1 - v) * best.b) / v));
        }
      }
      // A slightly firmer curve, so edges are crisp rather than misty.
      const firm = Math.min(1, Math.max(0, (v - 0.12) / 0.76));
      alpha[i] = Math.round(firm * 255);
    }
  }
  for (let i = 0; i < n; i++) px[i * 4 + 3] = alpha[i]!;
  return alpha;
}

/**
 * The see-through mask (0 = background, 255 = product, soft at the edges) for
 * an RGBA image at its own size, or null when it can't be cut cleanly. For tests.
 */
export function cutMask(px: Uint8ClampedArray, w: number, h: number): Uint8Array | null {
  const found = analyse(px, w, h);
  if (!found) return null;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.round(Math.min(1, Math.max(0, (found.alpha[i]! - 0.12) / 0.76)) * 255);
  return out;
}
