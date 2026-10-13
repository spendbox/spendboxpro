// People in the new 3D avatar design (src/lib/avatar3d): inside places, on rides and on the dance
// floor, each figure is swapped for a full avatar built from their look (an NPC's colours, or a
// player's own avatar), doing what the old figure did: standing about, talking, sitting (still,
// talking, sipping, eating, typing at a desk), leaning, cooking, DJing, working, sipping or eating
// on their feet, dancing (docs/AVATAR_POSES.md). The avatars build in the background (a worker),
// so the place opens straight away and each person changes over when theirs is ready; until then
// (or on a phone that can't build them) the old figure stays.

import * as THREE from "three";
import type { Npc } from "@/lib/npcs";
import { getAvatarModel } from "@/lib/avatar3d/client";
import { LOD } from "@/lib/avatar3d/lod";
import { makeMaterials, type MaterialSet } from "@/lib/avatar3d/materials";
import { MOVES, applyMove, type Dims, type Move } from "@/lib/avatar3d/moves";
import { seededRecipe } from "@/lib/avatar3d/recipe";
import { recipeOf } from "@/lib/avatar";
import { mountModel, type AvatarObject } from "@/lib/avatar3d/scene";
import type { Pose, Act } from "./figures";
import { clubBeat, type DanceMove } from "./dance-moves";

/** What createFigures hands back for each person (only what's needed here). */
type FigLike = {
  id: string; root: THREE.Group; mesh: THREE.Object3D; pose: Pose; act: Act; hipsY: number; baseY: number; prop?: THREE.Object3D | null;
  /** Dancing: the move picked (players), or the three a regular mixes up, and when they start. */
  move?: DanceMove | null; moves?: DanceMove[]; phase?: number;
};

/** At most this many 3D people in one place (they cost more to draw than the old figures). */
const MAX = 16;

const byIdMove = (id: string): Move => MOVES.find((m) => m.id === id) ?? MOVES[0];

/** The move for what someone's doing, sitting or standing. */
export function moveFor(pose: Pose, act: Act, k = 0): Move {
  if (pose === "sit") return byIdMove(act === "talk" ? "sitTalk" : act === "sip" ? "sitSip" : act === "eat" ? "sitEat" : act === "work" ? "sitType" : k % 3 === 1 ? "sitTalk" : "sit");
  if (pose === "lean") return byIdMove("lean");
  switch (act) {
    case "dance":
    case "wave":
    case "idle":
    case "cook":
    case "dj":
    case "sip":
    case "eat":
    case "work":
      return byIdMove(act);
    default:
      return byIdMove(k % 3 === 0 ? "idle" : "talk");
  }
}

/** A cup in the hand, for sipping (in the avatar's own units). */
function cup(unit: number) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * unit, 0.028 * unit, 0.11 * unit, 12), new THREE.MeshLambertMaterial({ color: 0xe7f5ff, transparent: true, opacity: 0.85 }));
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * unit, 0.025 * unit, 0.07 * unit, 12), new THREE.MeshLambertMaterial({ color: 0xe8590c }));
  drink.position.y = -0.015 * unit;
  g.add(glass, drink);
  return g;
}

/**
 * Swap figures for 3D avatars. people: who they are (NPCs by id "npc:...", or players with their
 * avatar). players: also swap the players (not only the NPCs).
 */
export function upgradeNpcs(figs: FigLike[], people: { id: string; avatar?: unknown; npc?: boolean }[], opts?: { players?: boolean; max?: number; level?: number }) {
  const live: { obj: AvatarObject; mats: MaterialSet; move: Move; t: number; speed: number; extra?: Partial<Dims>; extras: THREE.Object3D[]; fig: FigLike }[] = [];
  let gone = false;
  const byId = new Map(people.map((p) => [p.id, p]));
  // Dancers first (a dance floor full of the old figures stands out most), then everyone else.
  const chosen = figs
    .filter((f) => (opts?.players || String(f.id).startsWith("npc:")) && byId.has(f.id))
    .sort((a, b) => Number(b.act === "dance") - Number(a.act === "dance"))
    .slice(0, opts?.max ?? MAX);
  chosen.forEach((f, k) => {
    const p = byId.get(f.id) as (Npc & { npc?: boolean }) | undefined;
    let recipe;
    try {
      recipe = p?.avatar ? recipeOf(p.avatar as Npc["avatar"]) : seededRecipe(f.id);
    } catch {
      recipe = seededRecipe(f.id);
    }
    // Past the first 16, a lighter version (a big crowd stays smooth on a phone).
    void getAvatarModel(recipe, opts?.level ?? (k < MAX ? LOD.near : LOD.far))
      .then((model) => {
        if (gone) return;
        const mats = makeMaterials(recipe);
        const obj = mountModel(model, mats);
        // Into metres, standing on the floor: about 1.7 m tall (the avatar's own proportions kept).
        const box = new THREE.Box3().setFromObject(obj.root);
        const tall = Math.max(0.01, box.max.y - box.min.y);
        const scale = 1.72 / tall;
        obj.root.scale.setScalar(scale);
        obj.root.position.y = -box.min.y * scale;
        obj.root.traverse((o) => {
          (o as THREE.Mesh).castShadow = true;
          // Skinned parts move every frame: their bounds would hide them at the wrong moment.
          o.frustumCulled = false;
        });
        const move = moveFor(f.pose, f.act, k);
        // Sitting: the seat's height, in the avatar's own units (the old figure's hips rest just above it).
        const extra: Partial<Dims> | undefined = f.pose === "sit" ? { seat: Math.max(0.2, f.hipsY - 0.05) / scale + box.min.y } : undefined;
        const extras: THREE.Object3D[] = [];
        if ((move.id === "sip" || move.id === "sitSip") && obj.nodes.hand0) {
          const c = cup(1 / scale);
          c.position.set(0, -0.06 / scale, 0.03 / scale);
          obj.nodes.hand0.add(c);
          extras.push(c);
        }
        f.root.add(obj.root);
        f.mesh.visible = false;
        if (f.prop) f.prop.visible = false;
        live.push({ obj, mats, move, t: k * 1.7, speed: 0.9 + ((k * 37) % 20) / 100, extra, extras, fig: f });
      })
      .catch(() => {
        // The old figure stays.
      });
  });
  return {
    update(dt: number) {
      const beat = clubBeat();
      for (const a of live) {
        const f = a.fig;
        if (f.act === "dance") {
          // The club's dances, on the club's beat: the move they picked, or every 16 beats the next of their three.
          const list = f.moves?.length ? f.moves : (["groove"] as DanceMove[]);
          const id = f.move ?? list[Math.floor((beat + (f.phase ?? 0) * 3) / 16) % list.length];
          const P = applyMove(a.obj.nodes, a.obj.rest, byIdMove(`dance_${id}`), (beat + (f.phase ?? 0) * 0.02) / 2, a.obj.stride);
          a.obj.root.rotation.y = P.spin ?? 0;
          continue;
        }
        a.t += dt * a.speed;
        applyMove(a.obj.nodes, a.obj.rest, a.move, a.t, a.obj.stride, a.extra);
      }
    },
    dispose() {
      gone = true;
      for (const a of live) {
        a.obj.root.removeFromParent();
        a.mats.dispose();
        for (const e of a.extras)
          e.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.geometry.dispose();
              (m.material as THREE.Material).dispose();
            }
          });
      }
      live.length = 0;
    },
  };
}

/**
 * You, as your own 3D avatar (walking round a home in the third person): it builds in the
 * background and appears when ready. Each frame, say where you are, which way you face and what
 * you're doing (walking, standing, sitting on a seat this high).
 */
/** level: how detailed (LOD.own close up in a home; a light one on the street, where you're small on screen). */
/** seed: someone with no avatar of their own (a passer-by in the street) gets a look made from it. */
export function createMyAvatar(avatar: unknown, level: number = LOD.own, seed = "me") {
  const root = new THREE.Group();
  let live: { obj: AvatarObject; mats: MaterialSet; scale: number; floor: number } | null = null;
  let gone = false;
  let t = 0;
  let recipe;
  try {
    recipe = avatar ? recipeOf(avatar as Npc["avatar"]) : seededRecipe(seed);
  } catch {
    recipe = seededRecipe(seed);
  }
  void getAvatarModel(recipe, level)
    .then((model) => {
      if (gone) return;
      const mats = makeMaterials(recipe);
      const obj = mountModel(model, mats);
      const box = new THREE.Box3().setFromObject(obj.root);
      const scale = 1.72 / Math.max(0.01, box.max.y - box.min.y);
      obj.root.scale.setScalar(scale);
      obj.root.position.y = -box.min.y * scale;
      obj.root.traverse((o) => {
        (o as THREE.Mesh).castShadow = true;
        o.frustumCulled = false;
      });
      root.add(obj.root);
      live = { obj, mats, scale, floor: box.min.y };
    })
    .catch(() => {});
  return {
    root,
    /** Built and showing yet? */
    ready: () => !!live,
    /** doing: "walk", "run", "idle" or "sit" (seat: its height in metres). */
    update(dt: number, doing: "walk" | "run" | "idle" | "sit", seat = 0.46) {
      if (!live) return;
      t += dt;
      const move = byIdMove(doing === "sit" ? "sit" : doing);
      applyMove(live.obj.nodes, live.obj.rest, move, t, live.obj.stride, doing === "sit" ? { seat: seat / live.scale + live.floor } : undefined);
    },
    dispose() {
      gone = true;
      root.removeFromParent();
      live?.mats.dispose();
      live = null;
    },
  };
}
