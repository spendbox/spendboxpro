// The city's own characters (NPCs) in the new 3D avatar design (src/lib/avatar3d): inside places,
// each one standing about is swapped for a full avatar built from their look (the same skin, hair
// and clothes colours as their face), breathing, looking round and talking with their hands, or
// dancing in a club. Seated ones keep their old figure for now (the new avatars can't sit yet).
// The avatars build in the background (a worker), so the place opens straight away and each
// character changes over when theirs is ready.

import * as THREE from "three";
import type { Npc } from "@/lib/npcs";
import { getAvatarModel } from "@/lib/avatar3d/client";
import { LOD } from "@/lib/avatar3d/lod";
import { makeMaterials, type MaterialSet } from "@/lib/avatar3d/materials";
import { MOVES, applyMove } from "@/lib/avatar3d/moves";
import { seededRecipe } from "@/lib/avatar3d/recipe";
import { recipeOf } from "@/lib/avatar";
import { mountModel, type AvatarObject } from "@/lib/avatar3d/scene";
import type { Pose, Act } from "./figures";

/** What createFigures hands back for each person (only what's needed here). */
type FigLike = { id: string; root: THREE.Group; mesh: THREE.Object3D; pose: Pose; act: Act };

/** At most this many 3D characters in one place (they cost more to draw than the old figures). */
const MAX = 12;

export function upgradeNpcs(figs: FigLike[], people: { id: string; avatar?: unknown; npc?: boolean }[]) {
  const live: { obj: AvatarObject; mats: MaterialSet; move: (typeof MOVES)[number]; t: number; speed: number }[] = [];
  let gone = false;
  const npcIds = new Set(people.filter((p) => (p as { npc?: boolean }).npc !== false && String(p.id).startsWith("npc:")).map((p) => p.id));
  const byId = new Map(people.map((p) => [p.id, p]));
  const chosen = figs.filter((f) => npcIds.has(f.id) && f.pose === "stand" && f.act !== "dj" && f.act !== "cook").slice(0, MAX);
  chosen.forEach((f, k) => {
    const p = byId.get(f.id) as Npc | undefined;
    let recipe;
    try {
      recipe = p?.avatar ? recipeOf(p.avatar) : seededRecipe(f.id);
    } catch {
      recipe = seededRecipe(f.id);
    }
    void getAvatarModel(recipe, LOD.near)
      .then((model) => {
        if (gone) return;
        const mats = makeMaterials(recipe);
        const obj = mountModel(model, mats);
        // Into metres, standing on the floor: about 1.7 m tall (the avatar's own proportions kept).
        const box = new THREE.Box3().setFromObject(obj.root);
        const tall = Math.max(0.01, box.max.y - box.min.y);
        const k = 1.72 / tall;
        obj.root.scale.setScalar(k);
        obj.root.position.y = -box.min.y * k;
        obj.root.traverse((o) => {
          (o as THREE.Mesh).castShadow = true;
          // Skinned parts move every frame: their bounds would hide them at the wrong moment.
          o.frustumCulled = false;
        });
        f.root.add(obj.root);
        f.mesh.visible = false;
        const id = f.act === "dance" ? "dance" : f.act === "wave" ? "wave" : f.act === "idle" ? "idle" : k % 3 === 0 ? "idle" : "talk";
        live.push({ obj, mats, move: MOVES.find((m) => m.id === id) ?? MOVES[0], t: k * 1.7, speed: 0.9 + ((k * 37) % 20) / 100 });
      })
      .catch(() => {
        // The old figure stays.
      });
  });
  return {
    update(dt: number) {
      for (const a of live) {
        a.t += dt * a.speed;
        applyMove(a.obj.nodes, a.obj.rest, a.move, a.t, a.obj.stride);
      }
    },
    dispose() {
      gone = true;
      for (const a of live) {
        a.obj.root.removeFromParent();
        a.mats.dispose();
      }
      live.length = 0;
    },
  };
}
