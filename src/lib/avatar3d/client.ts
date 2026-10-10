// Asks the worker for avatar meshes and caches them, so each recipe is built once per detail level.
// Falls back to building on the main thread if workers aren't available.

import { buildAvatar } from "./avatar.ts";
import { LOD, buildFar } from "./lod.ts";
import { type Model, type PackedModel, unpack } from "./parts.ts";
import { type Recipe, encodeRecipe } from "./recipe.ts";

const CACHE_SIZE = 40;
const build = (r: Recipe, lod: number) => (lod === LOD.far ? buildFar(r) : buildAvatar(r, lod));
const cache = new Map<string, Promise<Model>>();
let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (m: Model) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<{ id: number; packed?: PackedModel; error?: string }>) => {
      const w = waiting.get(ev.data.id);
      if (!w) return;
      waiting.delete(ev.data.id);
      if (ev.data.packed) w.resolve(unpack(ev.data.packed));
      else w.reject(new Error(ev.data.error || "avatar build failed"));
    };
    worker.onerror = () => {
      // A broken worker: finish everything waiting on the main thread instead.
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * The meshes for a recipe at a detail level (1 = your own avatar, 0.5 = nearby players).
 * Shared and cached: don't dispose the returned geometry yourself.
 */
export function getAvatarModel(recipe: Recipe, lod: number): Promise<Model> {
  const key = encodeRecipe(recipe) + "@" + lod;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // most recently used goes to the end
    return hit;
  }
  const w = getWorker();
  const p = w
    ? new Promise<Model>((resolve, reject) => {
        const id = nextId++;
        waiting.set(id, { resolve, reject });
        w.postMessage({ id, recipe, lod });
      }).catch(() => build(recipe, lod))
    : Promise.resolve().then(() => build(recipe, lod));
  cache.set(key, p);
  while (cache.size > CACHE_SIZE) {
    const [oldKey, old] = cache.entries().next().value!;
    cache.delete(oldKey);
    old.then((m) => m.parts.forEach((part) => part.geo.dispose())).catch(() => {});
  }
  return p;
}
