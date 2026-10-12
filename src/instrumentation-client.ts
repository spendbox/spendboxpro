// Runs in the browser before the app starts (Next.js instrumentation-client). Older iPhones'
// Safari (before iOS 15.4 / 16.4) lacks a few small things the game uses; without them the page
// stops before anything shows. These fill them in.

/* eslint-disable no-extend-native */
type AtFn = (this: { length: number; [k: number]: unknown }, i: number) => unknown;
const at: AtFn = function (i) {
  const n = Math.trunc(i) || 0;
  const k = n < 0 ? this.length + n : n;
  return k < 0 || k >= this.length ? undefined : this[k];
};
for (const C of [Array, String, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array]) {
  const proto = C.prototype as unknown as { at?: AtFn };
  if (!proto.at) Object.defineProperty(proto, "at", { value: at, writable: true, configurable: true });
}
if (!Object.hasOwn) {
  Object.defineProperty(Object, "hasOwn", { value: (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k), writable: true, configurable: true });
}
if (typeof window !== "undefined" && !("structuredClone" in window)) {
  (window as unknown as { structuredClone: (v: unknown) => unknown }).structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
}
