// The sky over the trip film (docs/TRIPS.md), set by the time in Lagos: dawn pinks, a hard blue
// noon, a golden late afternoon, dusk, and night with stars and the moon. Gives the colours and
// light for everything else (lamps and windows come on from dusk).

import * as THREE from "three";

type Key = { h: number; top: number; horizon: number; sun: number; sunI: number; hemi: number; hemiI: number; ground: number };

// Hours (Lagos) and how the sky looks then; in between is blended.
const KEYS: Key[] = [
  { h: 0, top: 0x060a1c, horizon: 0x1c2446, sun: 0x9fb4ff, sunI: 0.35, hemi: 0x6c7cae, hemiI: 0.55, ground: 0x2a241f },
  { h: 5, top: 0x0d1433, horizon: 0x3d3560, sun: 0xa9b8ff, sunI: 0.35, hemi: 0x6c7cae, hemiI: 0.6, ground: 0x2a241f },
  { h: 6.2, top: 0x34619c, horizon: 0xffb27a, sun: 0xffc08a, sunI: 1.1, hemi: 0xc9b8d8, hemiI: 1.1, ground: 0x6a5a48 },
  { h: 8, top: 0x3f86d6, horizon: 0xc6e6f7, sun: 0xfff1d8, sunI: 2.2, hemi: 0xffffff, hemiI: 1.6, ground: 0xb39a7a },
  { h: 12.5, top: 0x2f7fdc, horizon: 0xd3ecf9, sun: 0xffffff, sunI: 2.6, hemi: 0xffffff, hemiI: 1.75, ground: 0xb39a7a },
  { h: 16, top: 0x3d84d2, horizon: 0xdcedf5, sun: 0xfff0d2, sunI: 2.4, hemi: 0xfff8ee, hemiI: 1.65, ground: 0xb39a7a },
  { h: 17.8, top: 0x5677b5, horizon: 0xffb067, sun: 0xffa45c, sunI: 1.7, hemi: 0xffe0c4, hemiI: 1.35, ground: 0x9c7c5c },
  { h: 18.8, top: 0x2a2d66, horizon: 0xe2725a, sun: 0xff7a4d, sunI: 0.7, hemi: 0xb4a0c8, hemiI: 0.9, ground: 0x4d3b30 },
  { h: 19.8, top: 0x0b1029, horizon: 0x2a2a52, sun: 0x9fb4ff, sunI: 0.35, hemi: 0x6c7cae, hemiI: 0.6, ground: 0x2a241f },
  { h: 24, top: 0x060a1c, horizon: 0x1c2446, sun: 0x9fb4ff, sunI: 0.35, hemi: 0x6c7cae, hemiI: 0.55, ground: 0x2a241f },
];

const mix = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

export type SkyLook = {
  top: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemi: THREE.Color;
  hemiI: number;
  ground: THREE.Color;
  /** Lamps, windows and headlights on. */
  lights: boolean;
  /** Stars and the moon (0 by day, 1 at night). */
  dark: number;
  /** Where the sun (or the moon at night) is: a direction. */
  sunDir: THREE.Vector3;
};

/** The sky at a Lagos hour (0 to 24, with minutes as a fraction). */
export function skyAt(hour: number): SkyLook {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.h) / Math.max(0.001, b.h - a.h);
  const day = h >= 6 && h < 19;
  // The sun rises in the east about 6:30 and sets in the west about 18:45; the moon by night.
  const u = day ? (h - 6.3) / 12.5 : (((h + 24 - 19) % 24) / 11);
  const elev = Math.max(0.12, Math.sin(Math.min(1, Math.max(0, u)) * Math.PI)) * (day ? 1.15 : 0.9);
  const az = -0.6 + u * 1.6;
  const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev) + 0.3).normalize();
  const dark = h < 5.6 || h >= 19.6 ? 1 : h < 6.4 ? (6.4 - h) / 0.8 : h > 18.8 ? (h - 18.8) / 0.8 : 0;
  return {
    top: mix(a.top, b.top, t),
    horizon: mix(a.horizon, b.horizon, t),
    sun: mix(a.sun, b.sun, t),
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    hemi: mix(a.hemi, b.hemi, t),
    hemiI: a.hemiI + (b.hemiI - a.hemiI) * t,
    ground: mix(a.ground, b.ground, t),
    lights: h >= 18.4 || h < 6.4,
    dark: Math.min(1, Math.max(0, dark)),
    sunDir,
  };
}

/** The time in Lagos now, as an hour with a fraction. */
export function lagosHour(now = new Date()) {
  return (now.getUTCHours() + 1 + now.getUTCMinutes() / 60) % 24;
}

/** The dome, the sun or moon, stars and clouds. Follows the camera (call follow each frame). */
export function buildSky(look: SkyLook, disposers: (() => void)[]) {
  const group = new THREE.Group();
  const domeGeo = new THREE.SphereGeometry(500, 32, 16);
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: look.top }, horizon: { value: look.horizon }, ground: { value: look.ground.clone().lerp(look.horizon, 0.5) }, sunDir: { value: look.sunDir }, sunCol: { value: look.sun }, dark: { value: look.dark } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunCol; uniform float dark; varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 c = y > 0.0 ? mix(horizon, top, pow(min(1.0, y * 1.6), 0.7)) : mix(horizon, ground, min(1.0, -y * 6.0));
        float s = max(0.0, dot(normalize(vDir), normalize(sunDir)));
        c += sunCol * (pow(s, 6.0) * 0.28 * (1.0 - dark * 0.7));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);
  disposers.push(() => (domeGeo.dispose(), domeMat.dispose()));

  // The sun (or moon): a soft disc far away.
  const disc = document.createElement("canvas");
  disc.width = disc.height = 128;
  const dg = disc.getContext("2d")!;
  const gr = dg.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.22, "rgba(255,255,255,1)");
  gr.addColorStop(0.3, "rgba(255,255,255,0.5)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  dg.fillStyle = gr;
  dg.fillRect(0, 0, 128, 128);
  const discTex = new THREE.CanvasTexture(disc);
  const discMat = new THREE.SpriteMaterial({ map: discTex, color: look.dark > 0.5 ? 0xe8eeff : look.sun, depthWrite: false, fog: false, transparent: true });
  const sun = new THREE.Sprite(discMat);
  sun.scale.setScalar(look.dark > 0.5 ? 34 : 60);
  sun.position.copy(look.sunDir).multiplyScalar(420);
  group.add(sun);
  disposers.push(() => (discTex.dispose(), discMat.dispose()));

  // Stars.
  if (look.dark > 0) {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.08 + Math.random() * 1.4;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 450;
      pos[i * 3 + 1] = Math.sin(e) * 450;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 450;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sm = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 * look.dark, depthWrite: false, fog: false });
    const stars = new THREE.Points(sg, sm);
    stars.frustumCulled = false;
    group.add(stars);
    disposers.push(() => (sg.dispose(), sm.dispose()));
  }

  // Clouds: puffy clusters, lit by the sky's colours.
  const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshBasicMaterial({ color: look.dark > 0.5 ? new THREE.Color(0x2a3355) : look.horizon.clone().lerp(new THREE.Color(0xffffff), 0.65), fog: false, transparent: true, opacity: look.dark > 0.5 ? 0.6 : 0.92 });
  disposers.push(() => (cloudGeo.dispose(), cloudMat.dispose()));
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 90);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let k = 0;
  for (let c = 0; c < 15; c++) {
    const a = (c / 15) * Math.PI * 2 + Math.random() * 0.3;
    const dist = 260 + Math.random() * 120;
    const cy = 70 + Math.random() * 60;
    const cx = Math.cos(a) * dist;
    const cz = Math.sin(a) * dist;
    for (let p = 0; p < 6; p++) {
      const s = 10 + Math.random() * 14;
      m.compose(new THREE.Vector3(cx + (p - 2.5) * 11 + Math.random() * 6, cy + Math.random() * 6, cz + Math.random() * 10), q, new THREE.Vector3(s * 1.4, s * 0.6, s));
      clouds.setMatrixAt(k++, m);
    }
  }
  clouds.frustumCulled = false;
  group.add(clouds);

  return {
    group,
    /** Keep the sky centred on the camera. */
    follow(cam: THREE.Camera) {
      group.position.set(cam.position.x, 0, cam.position.z);
    },
    /** Darker for rain. */
    gloom(f: number) {
      const u = domeMat.uniforms;
      u.top.value = look.top.clone().lerp(new THREE.Color(0x5b6470), f * 0.8);
      u.horizon.value = look.horizon.clone().lerp(new THREE.Color(0x868e96), f * 0.8);
      sun.visible = f < 0.3;
    },
  };
}
