import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

// The test people (Quaternius Universal Base Characters, CC0): a male and a female body with eyes
// and eyebrows, hair pieces, and one animation file both bodies share (same 65-bone skeleton).
// A person is put together from a look: body, skin, hair, hair colour, beard and eye colour.

const DIR = "/test-assets/people";

export type Look = { body: "male" | "female"; skin: string; hair: HairKey; hairColor: string; beard: boolean; eyes: string; clothes: string };

export const HAIRS = [
  { key: "none", label: "None" },
  { key: "buzzed", label: "Buzzed" },
  { key: "parted", label: "Parted" },
  { key: "long", label: "Long" },
  { key: "buns", label: "Buns" },
] as const;
export type HairKey = (typeof HAIRS)[number]["key"];

export const EYE_COLORS = ["#4b2e1e", "#1e1410", "#7a5a2a", "#3f6b3a", "#3c6fa8", "#7d8a96"];

function hairFile(hair: HairKey, body: Look["body"]) {
  if (hair === "none") return null;
  if (hair === "buzzed") return body === "female" ? "hair-buzzed-female" : "hair-buzzed";
  return `hair-${hair}`;
}

/** An eye: white, a coloured iris with a dark ring, a pupil and a little shine (the eye's front
 * is the middle of its picture). */
function eyeTexture(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f1ec";
  g.fillRect(0, 0, 256, 256);
  const cx = 0.496 * 256;
  const cy = 0.501 * 256;
  const iris = 0.105 * 256;
  const grad = g.createRadialGradient(cx, cy, iris * 0.2, cx, cy, iris);
  grad.addColorStop(0, new THREE.Color(color).offsetHSL(0, 0, 0.12).getStyle());
  grad.addColorStop(0.75, color);
  grad.addColorStop(1, new THREE.Color(color).offsetHSL(0, 0, -0.18).getStyle());
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, iris, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = iris * 0.12;
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.stroke();
  g.fillStyle = "#0b0b0b";
  g.beginPath();
  g.arc(cx, cy, iris * 0.42, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  g.arc(cx - iris * 0.3, cy - iris * 0.32, iris * 0.16, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Simple clothes painted onto the skin until real ones exist: a tank top and shorts. Placed by
 * where each point sits on the body in its starting pose (as a share of its height and width),
 * so they move with the body. Measured on the two bodies.
 */
const OUTFIT = {
  female: { shorts: [0.375, 0.54], top: [0.54, 0.785], half: 0.23 },
  male: { shorts: [0.365, 0.55], top: [0.55, 0.81], half: 0.226 },
};
function paintClothes(mat: THREE.MeshStandardMaterial, geo: THREE.BufferGeometry, body: Look["body"], color: string) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const o = OUTFIT[body];
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMin = { value: box.min.clone() };
    shader.uniforms.uMax = { value: box.max.clone() };
    shader.uniforms.uTop = { value: new THREE.Color(color) };
    shader.uniforms.uShorts = { value: new THREE.Color(color).multiplyScalar(0.35) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBind;\nuniform vec3 uMin;\nuniform vec3 uMax;\nuniform vec3 uTop;\nuniform vec3 uShorts;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float h = (vBind.z - uMin.z) / (uMax.z - uMin.z);
        float x = abs(vBind.x - (uMin.x + uMax.x) * 0.5) / ((uMax.x - uMin.x) * 0.5);
        float e = 0.004;
        float shorts = smoothstep(${o.shorts[0]} - e, ${o.shorts[0]} + e, h) * (1.0 - smoothstep(${o.shorts[1]} - e, ${o.shorts[1]} + e, h));
        float top = smoothstep(${o.top[0]} - e, ${o.top[0]} + e, h) * (1.0 - smoothstep(${o.top[1]} - e, ${o.top[1]} + e, h)) * (1.0 - smoothstep(${o.half} - e, ${o.half} + e, x));
        diffuseColor.rgb = mix(diffuseColor.rgb, uShorts, shorts);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTop, top);`,
      );
  };
  mat.customProgramCacheKey = () => `clothes-${body}`;
}

export type PeopleKit = { clips: THREE.AnimationClip[]; bytes: number; build: (look: Look) => Promise<THREE.Object3D> };

/** Load what every person needs once (the animations), and hand back a way to build people. */
export async function loadPeople(onBytes: (n: number) => void): Promise<PeopleKit> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const files = new Map<string, Promise<GLTF>>();
  let bytes = 0;
  const get = (name: string) => {
    let p = files.get(name);
    if (!p) {
      p = fetch(`${DIR}/${name}.glb`)
        .then((r) => {
          if (!r.ok) throw new Error(`Couldn't load ${name} (${r.status})`);
          return r.arrayBuffer();
        })
        .then((data) => {
          bytes += data.byteLength;
          onBytes(bytes);
          return loader.parseAsync(data, "");
        });
      files.set(name, p);
    }
    return p;
  };
  const moves = await get("moves");

  async function build(look: Look) {
    const [bodyFile, hairGltf, beardGltf] = await Promise.all([
      get(look.body),
      hairFile(look.hair, look.body) ? get(hairFile(look.hair, look.body)!) : null,
      look.beard ? get("beard") : null,
    ]);
    // Each person is a copy, with their own materials (colours).
    const person = cloneSkinned(bodyFile.scene);
    let body: THREE.SkinnedMesh | null = null;
    person.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      if (mat.name === "Skin") {
        mat.color.set(look.skin);
        paintClothes(mat, m.geometry, look.body, look.clothes);
        body = m;
      } else if (mat.name === "Eyes") mat.map = eyeTexture(look.eyes);
      else if (mat.name === "Brows") mat.color.set(look.hairColor);
      m.material = mat;
    });
    // Hair and beard come with their own copy of the skeleton: put them on this body's bones.
    const bones = new Map<string, THREE.Bone>();
    (body as THREE.SkinnedMesh | null)?.skeleton.bones.forEach((b) => bones.set(b.name, b));
    for (const piece of [hairGltf, beardGltf]) {
      if (!piece) continue;
      piece.scene.traverse((o) => {
        const src = o as THREE.SkinnedMesh;
        if (!src.isSkinnedMesh) return;
        const mat = (src.material as THREE.MeshStandardMaterial).clone();
        mat.color.set(look.hairColor);
        const mesh = new THREE.SkinnedMesh(src.geometry, mat);
        mesh.frustumCulled = false;
        const skeleton = new THREE.Skeleton(
          src.skeleton.bones.map((b) => bones.get(b.name) ?? b),
          src.skeleton.boneInverses.map((m) => m.clone()),
        );
        (body as THREE.SkinnedMesh | null)?.parent?.add(mesh);
        mesh.bind(skeleton, src.bindMatrix.clone());
      });
    }
    return person;
  }

  return { clips: moves.animations, get bytes() { return bytes; }, build };
}
