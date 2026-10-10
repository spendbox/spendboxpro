// The "picture" level: players far away drawn as a flat picture (two triangles) that turns to face
// the camera. The pictures are drawn once per recipe from the far level, from 8 directions, standing and
// in 4 walking frames, into one small texture (an atlas); each frame the card shows the picture for the
// direction it is seen from and the step it is at.

import {
  AmbientLight, type BufferAttribute, Color, DirectionalLight, DoubleSide, type Camera, HemisphereLight, LinearFilter, Mesh, MeshBasicMaterial,
  OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderTarget, type WebGLRenderer,
} from "three";
import type { MaterialSet } from "./materials.ts";
import { MOVES, applyMove } from "./moves.ts";
import type { Model } from "./parts.ts";
import { mountModel } from "./scene.ts";

const DIRS = 8, FRAMES = 5, CELL_W = 48, CELL_H = 120;
/** Avatar space: from the soles (meta.floorY) to just above the top of the head. */
const TOP = 1.35;

export type Impostor = {
  mesh: Mesh;
  /**
   * Turns the card to the camera and picks its picture. facing: which way the avatar faces (radians,
   * 0 = +z); walkPhase: 0..1 through a stride, or null when standing.
   */
  update(camera: Camera, facing: number, walkPhase: number | null): void;
  dispose(): void;
};

export function makeImpostor(renderer: WebGLRenderer, model: Model, mats: MaterialSet): Impostor {
  const floor = model.meta.floorY ?? -14.7, H = TOP - floor, W = (H * CELL_W) / CELL_H;
  const rt = new WebGLRenderTarget(CELL_W * FRAMES, CELL_H * DIRS, { minFilter: LinearFilter, magFilter: LinearFilter });
  rt.texture.colorSpace = SRGBColorSpace;
  // Draw the atlas: the avatar posed and lit, seen from each direction.
  const scene = new Scene(), obj = mountModel(model, mats);
  scene.add(obj.root, new HemisphereLight(0xfff4ea, 0x3a2c26, 0.65 * Math.PI), new AmbientLight(0xffffff, 0.2));
  const key = new DirectionalLight(0xfff1e2, 1.25 * Math.PI);
  scene.add(key, key.target);
  const cam = new OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 200);
  const prev = { rt: renderer.getRenderTarget(), color: renderer.getClearColor(new Color()), alpha: renderer.getClearAlpha() };
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  // (Drawing into a render target, its own viewport and scissor set where each picture goes.)
  rt.scissorTest = true;
  const walk = MOVES.find((m) => m.id === "walk")!, idle = MOVES.find((m) => m.id === "idle")!;
  for (let f = 0; f < FRAMES; f++) {
    if (f === 0) applyMove(obj.nodes, obj.rest, idle, 0, obj.stride);
    else applyMove(obj.nodes, obj.rest, walk, ((f - 1) / (FRAMES - 1)) * walk.period, obj.stride);
    obj.root.updateMatrixWorld(true);
    for (let k = 0; k < DIRS; k++) {
      const a = (k / DIRS) * Math.PI * 2, cy = floor + H / 2;
      cam.position.set(Math.sin(a) * 60, cy, Math.cos(a) * 60);
      cam.lookAt(0, cy, 0);
      // The key light from in front and above the viewer, a little to the side.
      key.position.set(Math.sin(a + 0.6) * 10, cy + 12, Math.cos(a + 0.6) * 10);
      const x = f * CELL_W, y = k * CELL_H;
      rt.viewport.set(x, y, CELL_W, CELL_H);
      rt.scissor.set(x, y, CELL_W, CELL_H);
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
    }
  }
  renderer.setRenderTarget(prev.rt);
  renderer.setClearColor(prev.color, prev.alpha);
  // The geometry and materials were only needed to draw the pictures.
  scene.clear();

  const geo = new PlaneGeometry(W, H).translate(0, floor + H / 2, 0);
  const mat = new MeshBasicMaterial({ map: rt.texture, transparent: true, alphaTest: 0.5, side: DoubleSide });
  const mesh = new Mesh(geo, mat);
  mesh.name = "impostor";
  const uv = geo.attributes.uv as BufferAttribute, toCam = new Vector3();
  return {
    mesh,
    update(camera, facing, walkPhase) {
      // Turn about the vertical to face the camera.
      camera.getWorldPosition(toCam).sub(mesh.getWorldPosition(new Vector3()));
      const view = Math.atan2(toCam.x, toCam.z);
      mesh.rotation.y = view;
      // The direction we see the avatar from, relative to where it faces, and the walking frame.
      const rel = (((view - facing) / (Math.PI * 2)) % 1 + 1) % 1, k = Math.round(rel * DIRS) % DIRS;
      const f = walkPhase === null ? 0 : 1 + (Math.floor(walkPhase * (FRAMES - 1)) % (FRAMES - 1));
      // (Inset by a pixel so the neighbouring picture never bleeds in at the edges.)
      const iu = 1 / (CELL_W * FRAMES), iv = 1 / (CELL_H * DIRS);
      const u0 = f / FRAMES + iu, u1 = (f + 1) / FRAMES - iu, v0 = k / DIRS + iv, v1 = (k + 1) / DIRS - iv;
      // PlaneGeometry's corners: top-left, top-right, bottom-left, bottom-right.
      uv.setXY(0, u0, v1);
      uv.setXY(1, u1, v1);
      uv.setXY(2, u0, v0);
      uv.setXY(3, u1, v0);
      uv.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      rt.dispose();
    },
  };
}
