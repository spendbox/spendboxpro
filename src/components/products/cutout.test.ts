import assert from "node:assert/strict";
import { test } from "node:test";
import { cutMask } from "./cutout.ts";

/** A w×h picture: a background colour, with `paint` choosing other pixels. */
function picture(w: number, h: number, background: [number, number, number], paint: (x: number, y: number) => [number, number, number] | null) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = paint(x, y) ?? background;
      // A little noise, like a real photo.
      const n = ((x * 7 + y * 13) % 5) - 2;
      px.set([c[0] + n, c[1] + n, c[2] + n, 255], (y * w + x) * 4);
    }
  return px;
}

test("a product on a plain background is cut out, with the gaps inside it", () => {
  const w = 80;
  const h = 100;
  // A red "dress" with a background-coloured gap in the middle (like between arms).
  const px = picture(w, h, [235, 235, 230], (x, y) => (x > 20 && x < 60 && y > 15 && y < 90 && !(x > 36 && x < 44 && y > 40 && y < 60) ? [200, 30, 40] : null));
  const mask = cutMask(px, w, h);
  assert.ok(mask);
  assert.equal(mask[50 * w + 25], 255, "the product stays");
  assert.equal(mask[5 * w + 5], 0, "the background goes");
  assert.equal(mask[50 * w + 40], 0, "the gap inside goes too");
});

test("specks are dropped", () => {
  const w = 60;
  const h = 60;
  const px = picture(w, h, [20, 20, 25], (x, y) => ((x > 15 && x < 45 && y > 15 && y < 45) || (x === 3 && y === 50) ? [240, 200, 60] : null));
  const mask = cutMask(px, w, h)!;
  assert.equal(mask[30 * w + 30], 255);
  assert.equal(mask[50 * w + 3], 0);
});

test("a busy background is left alone", () => {
  const w = 60;
  const h = 60;
  const px = picture(w, h, [0, 0, 0], (x, y) => [(x * 37) % 255, (y * 91) % 255, ((x + y) * 53) % 255]);
  assert.equal(cutMask(px, w, h), null);
});
