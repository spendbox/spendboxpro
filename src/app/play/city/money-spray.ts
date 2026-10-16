// Money sprayed in a club, for real in 3D: banknotes flicked one after another from the sprayer's
// hand at the dancer, fluttering and turning as they fall, then lying in a growing pile on the
// floor round the dancer's feet (as at a Nigerian party) before they're swept away.
// One instanced mesh for every note; room space (metres), floor at y = 0.

import * as THREE from "three";

const MAX = 320;
/** How long a note lies on the floor (seconds) before it fades away. */
const LIE = 40;

/** The notes' colours: ₦1000 (brown and blue), ₦500 (navy and green), ₦200 (blue-green). */
const TINTS = [0xd7a27a, 0x8fb0e3, 0x8fd1a9, 0xe8c38f];

function noteTexture() {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 120;
  const c = cv.getContext("2d")!;
  // A light note (tinted by each instance's colour), a darker border and printing, a portrait, ₦.
  c.fillStyle = "#f4f1ea";
  c.fillRect(0, 0, 256, 120);
  c.strokeStyle = "#6b6b6b";
  c.lineWidth = 6;
  c.strokeRect(6, 6, 244, 108);
  c.globalAlpha = 0.25;
  c.fillStyle = "#555";
  for (let i = 0; i < 18; i++) c.fillRect(14 + i * 13, 14, 5, 92);
  c.globalAlpha = 1;
  c.fillStyle = "#9a9a9a";
  c.beginPath();
  c.ellipse(70, 60, 30, 38, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#3d3d3d";
  c.font = "900 40px system-ui, sans-serif";
  c.textAlign = "right";
  c.fillText("₦1000", 240, 52);
  c.font = "700 16px system-ui, sans-serif";
  c.fillText("CENTRAL BANK", 240, 80);
  c.fillText("OF NIGERIA", 240, 100);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Note = { on: boolean; at: number; p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; landed: boolean; seed: number };

export function createMoneySpray() {
  const tex = noteTexture();
  const geo = new THREE.PlaneGeometry(0.16, 0.075);
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x2a2a2a });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const notes: Note[] = Array.from({ length: MAX }, () => ({ on: false, at: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), landed: false, seed: 0 }));
  const col = new THREE.Color();
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, col.setHex(TINTS[i % TINTS.length]));
  let head = 0;
  let clock = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();

  return {
    object: mesh,
    /**
     * Spray: `count` notes at a dancer standing at `to`, from someone at `from` (null: from round
     * about, at hand height). They leave one after another over a couple of seconds.
     */
    spray(to: { x: number; z: number }, from: { x: number; z: number } | null, count: number) {
      const n = Math.max(6, Math.min(140, Math.round(count)));
      const fx = from?.x ?? to.x + (Math.random() - 0.5) * 2.4;
      const fz = from?.z ?? to.z + (Math.random() - 0.5) * 2.4;
      // The sprayer's hand, a little in front of them, towards the dancer.
      const dx = to.x - fx;
      const dz = to.z - fz;
      const len = Math.hypot(dx, dz) || 1;
      const hx = fx + (dx / len) * Math.min(0.6, len * 0.5);
      const hz = fz + (dz / len) * Math.min(0.6, len * 0.5);
      for (let k = 0; k < n; k++) {
        const nt = notes[head];
        head = (head + 1) % MAX;
        nt.on = true;
        nt.landed = false;
        nt.seed = Math.random() * 100;
        // A quick rhythm of flicks, a tiny pause every few notes.
        nt.at = clock + k * 0.055 + Math.floor(k / 6) * 0.12;
        nt.p.set(hx + (Math.random() - 0.5) * 0.1, 1.45 + Math.random() * 0.2, hz + (Math.random() - 0.5) * 0.1);
        // Aimed over the dancer's head, landing round their feet; a bit of scatter.
        const tx = to.x + (Math.random() - 0.5) * 1.1 - nt.p.x;
        const tz = to.z + (Math.random() - 0.5) * 1.1 - nt.p.z;
        const flight = 0.55 + Math.random() * 0.25;
        nt.v.set(tx / flight, 2.4 + Math.random() * 1.2, tz / flight);
        nt.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        nt.w.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 16);
      }
    },
    update(dt: number) {
      clock += dt;
      let shown = 0;
      for (let i = 0; i < MAX; i++) {
        const nt = notes[i];
        if (!nt.on || clock < nt.at) continue;
        const age = clock - nt.at;
        if (!nt.landed) {
          // Paper in the air: gravity, a lot of drag (the falling speed tops out), a flutter side to side.
          nt.v.y -= 9.8 * dt;
          const drag = Math.exp(-2.6 * dt);
          nt.v.x *= drag;
          nt.v.z *= drag;
          if (nt.v.y < -1.1) nt.v.y = -1.1 + (nt.v.y + 1.1) * Math.exp(-6 * dt);
          const flutter = Math.sin(age * 9 + nt.seed) * 0.9;
          nt.p.x += (nt.v.x + flutter * Math.cos(nt.seed)) * dt;
          nt.p.z += (nt.v.z + flutter * Math.sin(nt.seed)) * dt;
          nt.p.y += nt.v.y * dt;
          nt.r.x += nt.w.x * dt;
          nt.r.y += nt.w.y * dt;
          nt.r.z += nt.w.z * dt;
          if (nt.p.y <= 0.012 + (i % 7) * 0.002) {
            // Down: flat on the floor (a little pile, each a hair above the last).
            nt.landed = true;
            nt.p.y = 0.012 + (i % 7) * 0.002;
            nt.r.set(-Math.PI / 2, 0, nt.seed);
            nt.at = clock;
          }
        } else if (age > LIE) {
          nt.on = false;
          continue;
        }
        q.setFromEuler(nt.r);
        const fade = nt.landed && age > LIE - 3 ? Math.max(0.01, (LIE - age) / 3) : 1;
        m4.compose(nt.p, q, tmp.copy(one).multiplyScalar(fade));
        mesh.setMatrixAt(shown, m4);
        mesh.setColorAt(shown, col.setHex(TINTS[i % TINTS.length]));
        shown++;
      }
      mesh.count = shown;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      tex.dispose();
      mesh.dispose();
    },
  };
}
