// Lets plain Node run the game's TypeScript that imports "@/..." (the city layout), for the world
// scripts: node --import ./scripts/world/alias.mjs scripts/world/snapshot.ts ...
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
const root = ${JSON.stringify(new URL("../../src/", import.meta.url).href)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) {
    for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
      try { return await next(root + spec.slice(2) + ext, ctx); } catch {}
    }
  }
  if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.[a-z]+$/.test(spec)) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) { try { return await next(spec + ext, ctx); } catch {} }
  }
  return next(spec, ctx);
}`),
);
