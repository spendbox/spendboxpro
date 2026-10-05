// Cuts a product (or the model wearing it) out of its photo's background, in
// the browser, for the 3D shop. It works by finding the background colour
// around the edges of the photo and flooding inwards from the edges while the
// colour stays close to it, so it does best with a plain or simple background
// (a wall, a sheet, a studio backdrop). On a busy background it gives up
// rather than cut badly, and the shop shows the photo on its usual display.

const MAX_SIDE = 900;

export interface Cutout {
  /** A PNG with a see-through background, cropped to the product. */
  blob: Blob;
  width: number;
  height: number;
}

async function loadImage(source: Blob | string): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof source !== "string") return createImageBitmap(source);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = source;
  await img.decode();
  return img;
}

/** Makes a cutout, or null if the background is too busy (or the product too small) to cut cleanly. */
export async function makeCutout(source: Blob | string): Promise<Cutout | null> {
  const image = await loadImage(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const alpha = cutMask(data.data, w, h);
  if (!alpha) return null;

  // Crop to the product, with a little room round it.
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alpha[y * w + x]! > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const pad = Math.round(Math.max(w, h) * 0.015);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  for (let i = 0; i < w * h; i++) data.data[i * 4 + 3] = alpha[i]!;
  ctx.putImageData(data, 0, 0);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  return blob ? { blob, width: out.width, height: out.height } : null;
}

/**
 * The see-through mask (0 = background, 255 = product, soft at the edges) for
 * an RGBA image, or null when it can't be cut cleanly. Exported for tests.
 */
export function cutMask(px: Uint8ClampedArray, w: number, h: number): Uint8Array | null {
  const n = w * h;
  const dist = (i: number, r: number, g: number, b: number) => {
    const dr = px[i * 4]! - r;
    const dg = px[i * 4 + 1]! - g;
    const db = px[i * 4 + 2]! - b;
    return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.7;
  };

  // The background colour: the middle of the colours round the edge.
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  const median = (c: number) => {
    const v = border.map((i) => px[i * 4 + c]!).sort((a, b) => a - b);
    return v[v.length >> 1]!;
  };
  const [br, bg, bb] = [median(0), median(1), median(2)];
  const borderDist = border.map((i) => dist(i, br, bg, bb)).sort((a, b) => a - b);
  // A busy edge (patterned floor, street, a crowd) can't be cut by colour.
  const plain = borderDist.filter((d) => d < 40).length / borderDist.length;
  if (plain < 0.6) return null;
  const tol = Math.min(72, Math.max(26, borderDist[Math.floor(borderDist.length * 0.9)]! * 1.5 + 16));

  // Flood in from the edges while the colour stays near the background (and changes gently).
  const bgMask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (const i of border)
    if (!bgMask[i] && dist(i, br, bg, bb) < tol) {
      bgMask[i] = 1;
      queue[tail++] = i;
    }
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    const r = px[i * 4]!;
    const g = px[i * 4 + 1]!;
    const b = px[i * 4 + 2]!;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || bgMask[j]) continue;
      if (dist(j, br, bg, bb) < tol && dist(j, r, g, b) < tol * 0.55) {
        bgMask[j] = 1;
        queue[tail++] = j;
      }
    }
  }

  // Gaps inside the product that show the background (between arms and body,
  // inside a handle) go too, when they're clearly background-coloured.
  const seen = new Uint8Array(n);
  const strict = tol * 0.6;
  for (let s = 0; s < n; s++) {
    if (bgMask[s] || seen[s] || dist(s, br, bg, bb) >= strict) continue;
    head = tail = 0;
    queue[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || seen[j] || bgMask[j] || dist(j, br, bg, bb) >= strict) continue;
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
    if (tail > n * 0.002) for (let k = 0; k < tail; k++) bgMask[queue[k]!] = 1;
  }

  // Keep the product: the biggest piece, and any others at least a sixth its size (no specks).
  const label = new Int32Array(n);
  const sizes: number[] = [0];
  for (let s = 0; s < n; s++) {
    if (bgMask[s] || label[s]) continue;
    const id = sizes.length;
    head = tail = 0;
    queue[tail++] = s;
    label[s] = id;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || bgMask[j] || label[j]) continue;
        label[j] = id;
        queue[tail++] = j;
      }
    }
    sizes.push(tail);
  }
  const biggest = Math.max(0, ...sizes);
  const keep = sizes.map((size) => size >= biggest / 6 && size > 0);
  const fg = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++)
    if (!bgMask[i] && keep[label[i]!]) {
      fg[i] = 1;
      count++;
    }
  // Nothing left, or nothing removed: not a clean cut.
  if (count < n * 0.04 || count > n * 0.96) return null;

  // Soften the edge by a pixel so it doesn't look jagged.
  const alpha = new Uint8Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cells = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          sum += fg[yy * w + xx]!;
          cells++;
        }
      alpha[y * w + x] = Math.round((sum / cells) * 255);
    }
  return alpha;
}
