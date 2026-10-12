// Selfies with the 3D avatar (src/lib/avatar3d): your avatar, head and shoulders, smiling at the
// camera, drawn once into a picture with a clear background, the same size as the 2D cutouts, so
// the camera lays it over the town the same way. Cached per look.

import * as THREE from "three";
import { type Avatar, recipeOf } from "@/lib/avatar";
import { getAvatarModel } from "@/lib/avatar3d/client";
import { LOD } from "@/lib/avatar3d/lod";
import { makeMaterials } from "@/lib/avatar3d/materials";
import { MOVES, applyMove } from "@/lib/avatar3d/moves";
import { encodeRecipe } from "@/lib/avatar3d/recipe";
import { mountModel, updateFace } from "@/lib/avatar3d/scene";

const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

/** The avatar in 3D as a square picture (clear round it), or null if this phone can't draw 3D. */
export function avatar3dCutout(avatar: Avatar, size = 720): Promise<HTMLCanvasElement | null> {
  const recipe = recipeOf(avatar);
  const key = `${encodeRecipe(recipe)}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = draw(recipe, size).catch(() => null);
  cache.set(key, p);
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  return p;
}

async function draw(recipe: ReturnType<typeof recipeOf>, size: number): Promise<HTMLCanvasElement | null> {
  const model = await getAvatarModel(recipe, LOD.own);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  const mats = makeMaterials(recipe);
  try {
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const scene = new THREE.Scene();
    // The studio's lights: soft from above, a warm key from the front, a cool rim behind.
    scene.add(new THREE.HemisphereLight(0xfff4ea, 0x3a2c26, 0.65 * Math.PI));
    const keyL = new THREE.DirectionalLight(0xfff1e2, 1.25 * Math.PI);
    keyL.position.set(4, 6, 8);
    const fill = new THREE.DirectionalLight(0xd8e6ff, 0.4 * Math.PI);
    fill.position.set(-6, 2, 4);
    const rim = new THREE.DirectionalLight(0xbfe3ff, 0.8 * Math.PI);
    rim.position.set(-2, 4, -8);
    scene.add(keyL, fill, rim);
    const obj = mountModel(model, mats);
    scene.add(obj.root);
    // Standing easy, with a smile.
    applyMove(obj.nodes, obj.rest, MOVES[0], 1.2, obj.stride);
    for (let i = 0; i < 30; i++) updateFace(obj, { smile: 0.85, brow: 0.2 }, 0, { x: 0, y: 0 }, 0.1);
    obj.root.updateMatrixWorld(true);
    // Head and shoulders: the top third of the body, the face a little above the middle.
    const box = new THREE.Box3().setFromObject(obj.root);
    const tall = box.max.y - box.min.y;
    const fov = 28;
    const show = tall * 0.36;
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 1000);
    const cy = box.max.y - show * 0.52;
    const d = show / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    camera.position.set(0, cy + show * 0.04, d);
    camera.lookAt(0, cy, 0);
    renderer.render(scene, camera);
    // A copy that outlives the renderer.
    const out = document.createElement("canvas");
    out.width = out.height = size;
    out.getContext("2d")!.drawImage(canvas, 0, 0);
    return out;
  } finally {
    mats.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
