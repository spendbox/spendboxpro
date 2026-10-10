// A 3D view of one avatar for the page (the avatar studio, profile cards): lights, a camera you can
// turn by dragging, the avatar built in the background worker, breathing and blinking, and a smooth
// move between a close-up of the face and the whole body.

import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getAvatarModel } from "./client.ts";
import { type MaterialSet, makeMaterials } from "./materials.ts";
import { MOVES, applyMove } from "./moves.ts";
import type { Recipe } from "./recipe.ts";
import { type AvatarObject, type FaceState, mountModel, updateFace } from "./scene.ts";

/** Where the camera looks (height) and from how far, for the face close-up and the whole body. */
const FRAMING = { face: { y: -0.3, d: 9 }, body: { y: -6.9, d: 36 } };
export type Framing = keyof typeof FRAMING;

export type Viewer = {
  /** Shows this avatar (built in the background; the old one stays until the new one is ready). */
  setRecipe(r: Recipe): Promise<void>;
  setFraming(f: Framing): void;
  /** A move to play (by id, e.g. "idle", "wave") and an expression. */
  setMove(id: string): void;
  setExpression(e: Partial<FaceState>): void;
  dispose(): void;
};

/** Mounts a viewer in a container element. Returns null if the browser can't draw 3D. */
export function createViewer(el: HTMLElement, opts: { background?: string } = {}): Viewer | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: !opts.background });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  const scene = new Scene();
  if (opts.background) scene.background = new Color(opts.background);
  // The same lights as the studio prototype (intensities x PI for three.js's physical light units).
  scene.add(new HemisphereLight(0xfff4ea, 0x3a2c26, 0.65 * Math.PI));
  const key = new DirectionalLight(0xfff1e2, 1.25 * Math.PI);
  key.position.set(4, 6, 8);
  const fill = new DirectionalLight(0xd8e6ff, 0.4 * Math.PI);
  fill.position.set(-6, 2, 4);
  const rim = new DirectionalLight(0xbfe3ff, 0.8 * Math.PI);
  rim.position.set(-2, 4, -8);
  scene.add(key, fill, rim);
  const camera = new PerspectiveCamera(30, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 2.2;
  // Framing eases from where it is to where it is going.
  const aim = { y: FRAMING.body.y, d: FRAMING.body.d }, goal = { ...aim };
  camera.position.set(0, aim.y, aim.d);
  controls.target.set(0, aim.y, 0);

  let current: { obj: AvatarObject; mats: MaterialSet } | null = null, move = MOVES[0], face: Partial<FaceState> = {}, building = 0;
  const resize = () => {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  let raf = 0, last = performance.now(), t = 0, nextBlink = 1.5, blinkT = -1;
  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    // Glide the camera towards its framing, keeping the angle the player turned it to.
    const k = Math.min(1, dt * 5), off = new Vector3().subVectors(camera.position, controls.target);
    aim.y += (goal.y - aim.y) * k;
    aim.d += (goal.d - aim.d) * k;
    controls.target.set(0, aim.y, 0);
    off.setLength(aim.d);
    camera.position.copy(controls.target).add(off);
    controls.update();
    if (current) {
      if (t > nextBlink && blinkT < 0) {
        blinkT = 0;
        nextBlink = t + 2.4 + Math.random() * 3.2;
      }
      let blink = 0;
      if (blinkT >= 0) {
        blinkT += dt;
        blink = Math.sin(Math.PI * Math.min(blinkT / 0.17, 1));
        if (blinkT > 0.17) blinkT = -1;
      }
      updateFace(current.obj, face, blink, { x: 0, y: 0 }, dt);
      applyMove(current.obj.nodes, current.obj.rest, move, t, current.obj.stride);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    async setRecipe(r) {
      const id = ++building, model = await getAvatarModel(r, 1);
      if (id !== building) return; // a newer choice arrived while this one was building
      const mats = makeMaterials(r), obj = mountModel(model, mats);
      if (current) {
        scene.remove(current.obj.root);
        current.mats.dispose();
      }
      current = { obj, mats };
      scene.add(obj.root);
    },
    setFraming(f) {
      Object.assign(goal, FRAMING[f]);
      controls.minDistance = FRAMING[f].d * 0.5;
      controls.maxDistance = FRAMING[f].d * 1.6;
    },
    setMove(id) {
      move = MOVES.find((m) => m.id === id) ?? MOVES[0];
    },
    setExpression(e) {
      face = e;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (current) current.mats.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
