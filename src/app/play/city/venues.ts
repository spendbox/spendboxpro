// The sports venues as they stand in the city (the football stadium is drawn with the other big
// buildings in city-view): a basketball court with a sports hall behind it, and the round
// boxing and wrestling arenas. Plus the little games going on outside: players shooting hoops
// on the outdoor court, and a kick-about on the stadium's pitch. Inside, each venue is a place
// with seats facing the action (see interiors.ts).

import * as THREE from "three";
import type { Tile } from "@/lib/city/layout";
import { createAthletes, faceRig, runRig, skinOf } from "./arenas";
import { rngFrom } from "./kit";

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;

const WHITE = 0xf8f9fa;

/** The outdoor court's centre (from the anchor tile) and the hoops' rims (city units). */
const COURT = { x: 0.5, z: 0.95, w: 1.3, d: 0.66, y: 0.102, rimX: 0.67, rimY: 0.379 };

/** The fixed parts of a court, a boxing arena or a wrestling arena (2×2, from the anchor tile). */
export function venueParts(t: Tile, B: BoxFn) {
  const type = t.structure?.type;
  const c = 0.5;
  if (type === "court") {
    // The sports hall at the back: walls, a glass band, a rounded roof and a sign.
    B(c, 0.09, c - 0.5, 1.75, 0.55, 0.8, 0xe9ecef);
    B(c, 0.3, c - 0.5, 1.76, 0.12, 0.81, 0x4c6e91, 0, "glass");
    B(c, 0.64, c - 0.5, 1.75, 0.36, 0.8, 0xb8c4d2, 0, "dome");
    B(c, 0.63, c - 0.5, 1.77, 0.03, 0.82, 0xf08c00);
    B(c, 0.45, c - 0.09, 0.62, 0.12, 0.02, 0x1c7ed6, 0, "paint");
    B(c - 0.6, 0.09, c - 0.08, 0.22, 0.22, 0.04, 0x343a40);
    // The outdoor court: a blue surround, the orange court and its lines.
    const { x, z, w, d } = COURT;
    B(x, 0.09, z, w + 0.2, 0.012, d + 0.16, 0x2f6fd1, 0, "ground");
    B(x, 0.102, z, w, 0.004, d, 0xe8590c, 0, "paint");
    for (const [lx, lz, lw, ld] of [[0, -d / 2, w, 0.012], [0, d / 2, w, 0.012], [-w / 2, 0, 0.012, d], [w / 2, 0, 0.012, d], [0, 0, 0.012, d]]) {
      B(x + lx, 0.106, z + lz, lw, 0.003, ld, WHITE, 0, "paint");
    }
    for (const side of [-1, 1]) {
      B(x + side * 0.52, 0.105, z, 0.26, 0.003, 0.22, 0x1c7ed6, 0, "paint");
      // Hoop: a pole, the backboard, the rim.
      B(x + side * 0.72, 0.09, z, 0.025, 0.34, 0.025, 0x495057);
      B(x + side * 0.695, 0.355, z, 0.012, 0.09, 0.14, WHITE);
      B(x + side * COURT.rimX, COURT.rimY - 0.004, z, 0.045, 0.008, 0.045, 0xf76707, 0, "paint");
    }
    // A few rows of bleachers along the front.
    for (let s = 0; s < 3; s++) B(x + 0.2, 0.09, z + d / 2 + 0.12 + s * 0.045, 0.85, 0.025 + s * 0.03, 0.045, s % 2 ? 0xadb5bd : 0xced4da);
    // Floodlights at the corners of the court.
    for (const side of [-1, 1]) {
      B(x + side * 0.82, 0.09, z + d / 2 + 0.05, 0.02, 0.5, 0.02, 0x868e96);
      B(x + side * 0.82, 0.59, z + d / 2 + 0.05, 0.08, 0.04, 0.03, 0xfff3bf, 0, "lamp");
    }
    return;
  }
  if (type === "boxing" || type === "wrestling") {
    const accent = type === "boxing" ? 0xe03131 : 0x7c3aed;
    const roof = type === "boxing" ? 0xdee2e6 : 0x343a40;
    // A round arena: walls, a dark glass band, a coloured ring under a big dome.
    B(c, 0.09, c, 1.7, 0.75, 1.7, 0xf1f3f5, 0, "disc");
    B(c, 0.4, c, 1.72, 0.16, 1.72, 0x22324a, 0, "disc");
    B(c, 0.8, c, 1.76, 0.05, 1.76, accent, 0, "disc");
    B(c, 0.84, c, 1.66, 0.9, 1.66, roof, 0, "dome");
    // The entrance: a canopy, the venue's colour, and a screen over the doors.
    B(c, 0.09, c + 0.88, 0.5, 0.26, 0.18, 0x343a40);
    B(c, 0.35, c + 0.92, 0.62, 0.05, 0.3, accent);
    B(c, 0.44, c + 0.86, 0.46, 0.22, 0.03, 0x74c0fc, 0, "glass");
    // Flags and a couple of lamps out front.
    for (const side of [-1, 1]) {
      B(c + side * 0.55, 0.09, c + 0.85, 0.02, 0.6, 0.02, 0xadb5bd);
      B(c + side * 0.55 + 0.05, 0.58, c + 0.85, 0.1, 0.07, 0.005, side < 0 ? accent : 0xf5a524, 0, "paint");
    }
  }
}

/** A little game being played outdoors: shooting hoops on the court, a kick-about on the pitch. */
export type VenueGame = { group: THREE.Group; update: (time: number, dt: number) => void; dispose: () => void };

export function createVenueGame(t: Tile): VenueGame | null {
  const type = t.structure?.type;
  if (!t.structure?.anchor || (type !== "court" && type !== "arena")) return null;
  const rnd = rngFrom(`game|${t.x}|${t.z}`);
  const group = new THREE.Group();
  // Built in metres, a tenth of a city unit each.
  group.scale.setScalar(0.1);
  const ballMat = new THREE.MeshLambertMaterial({ color: type === "court" ? 0xe8590c : WHITE });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(type === "court" ? 0.14 : 0.16, 10, 8), ballMat);
  ball.castShadow = true;
  group.add(ball);
  let update: (time: number, dt: number) => void;
  let team: ReturnType<typeof createAthletes>;

  if (type === "court") {
    group.position.set(t.x + COURT.x, COURT.y + 0.002, t.z + COURT.z);
    const colors = [0xf5a524, 0x1c7ed6, 0xf1f3f5];
    team = createAthletes(colors.map((shirt) => ({ shirt, shorts: shirt, skin: skinOf(rnd), shoes: WHITE })));
    const rimX = (COURT.rimX / 0.1) * 1;
    const rimY = (COURT.rimY - COURT.y) / 0.1;
    team.rigs.forEach((r, i) => {
      r.x = (i - 1) * 2;
      r.z = (i % 2 ? 1 : -1);
    });
    update = (time, dt) => {
      // Take turns: dribble to a spot, shoot, through the net, and the ball goes to the next one.
      const k = Math.floor(time / 4.5);
      const u = time - k * 4.5;
      const shooter = team.rigs[k % 3];
      const next = team.rigs[(k + 1) % 3];
      const dir = k % 2 ? 1 : -1;
      const rim = dir * rimX;
      const sx = dir * (3.4 + Math.sin(k * 1.3) * 1.0);
      const sz = Math.cos(k * 2.1) * 2.0;
      team.rigs.forEach((r, i) => {
        r.y = 0;
        r.guard = 0;
        if (r === shooter) return;
        runRig(r, Math.sin(time * 0.3 + i * 2) * 4, Math.cos(time * 0.4 + i) * 2.2, 2, dt, false);
        faceRig(r, ball.position.x, ball.position.z, Math.min(1, dt * 3));
      });
      if (u < 2.4) {
        runRig(shooter, sx, sz, 3.5, dt);
        const f = Math.abs(Math.sin(u * 7));
        ball.position.set(shooter.x + Math.sin(shooter.yaw) * 0.35 + Math.cos(shooter.yaw) * 0.25, 0.14 + f * 0.7, shooter.z + Math.cos(shooter.yaw) * 0.35 - Math.sin(shooter.yaw) * 0.25);
        shooter.reachR = 0.3;
      } else if (u < 3.4) {
        const s = u - 2.4;
        faceRig(shooter, rim, 0, 0.3);
        shooter.y = Math.sin(Math.min(1, s * 2.4) * Math.PI) * 0.4;
        shooter.guard = 1;
        ball.position.set(shooter.x + (rim - shooter.x) * s, 2.1 + (rimY + 0.15 - 2.1) * s + Math.sin(s * Math.PI) * 1.6, shooter.z * (1 - s));
      } else if (u < 3.7) {
        const s = (u - 3.4) / 0.3;
        ball.position.set(rim, rimY - s * (rimY - 0.14), 0);
      } else {
        const s = (u - 3.7) / 0.8;
        ball.position.set(rim + (next.x - rim) * s, 0.14 + Math.abs(Math.sin(s * 8)) * (1 - s) * 0.8, next.z * s);
      }
      team.update();
    };
  } else {
    // The stadium's pitch (the top of the middle of the bowl), three a side.
    group.position.set(t.x + 0.5, 0.773, t.z + 0.5);
    const home = [0xe03131, WHITE];
    const away = [0x1c7ed6, 0x18202b];
    team = createAthletes([0, 1, 2, 3, 4, 5].map((i) => ({ shirt: i < 3 ? home[0] : away[0], shorts: i < 3 ? home[1] : away[1], skin: skinOf(rnd), shoes: 0x111418 })));
    const hold = [[-2.6, -1.2], [-2.6, 1.2], [-0.8, 0]];
    team.rigs.forEach((r, i) => {
      const h = hold[i % 3];
      r.x = i < 3 ? h[0] : -h[0];
      r.z = h[1];
    });
    update = (time, dt) => {
      const bx = Math.sin(time * 0.4) * 3.2 + Math.sin(time * 1.1) * 0.6;
      const bz = Math.sin(time * 0.55 + 1) * 2.0;
      ball.position.set(bx, 0.16 + Math.max(0, Math.sin(time * 1.7)) ** 8 * 0.9, bz);
      ball.rotation.x = time * 5;
      for (let side = 0; side < 2; side++) {
        let best = side * 3;
        for (let i = side * 3; i < side * 3 + 3; i++) {
          const r = team.rigs[i];
          if (Math.hypot(r.x - bx, r.z - bz) < Math.hypot(team.rigs[best].x - bx, team.rigs[best].z - bz)) best = i;
        }
        for (let i = side * 3; i < side * 3 + 3; i++) {
          const r = team.rigs[i];
          const h = hold[i % 3];
          const hx = side === 0 ? h[0] : -h[0];
          if (i === best) runRig(r, bx + (side === 0 ? -0.4 : 0.4), bz, 4.5, dt);
          else {
            runRig(r, hx + (bx - hx) * 0.4, h[1] + (bz - h[1]) * 0.3, 3, dt, false);
            faceRig(r, bx, bz, Math.min(1, dt * 3));
          }
        }
      }
      team.update();
    };
  }
  group.add(team.group);
  team.group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return {
    group,
    update,
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    },
  };
}
