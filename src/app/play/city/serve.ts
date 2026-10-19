// Food brought to your table (docs/FOOD.md): you order sitting down, a waiter in a white shirt walks
// over from the kitchen with a tray, stops beside you, sets the dishes down, and walks back. The
// plates, bowls and drinks stay on the table in front of you (on whatever's there: a dining table,
// a coffee table, a bar counter) until you leave. Standing up, he walks up to you and hands it over
// instead (nothing is set down). Drawn in the room's own metres, inside its holder.

import * as THREE from "three";
import type { Dish } from "@/lib/world/menu";

/** Where you are and which way you face; standing: no table, he hands it to you. */
type Seat = { x: number; z: number; ry: number; standing?: boolean };

const geo = {
  plate: new THREE.CylinderGeometry(0.13, 0.11, 0.02, 20),
  mound: new THREE.SphereGeometry(0.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  bowl: new THREE.CylinderGeometry(0.1, 0.06, 0.07, 18, 1, true),
  soup: new THREE.CircleGeometry(0.095, 18).rotateX(-Math.PI / 2),
  glass: new THREE.CylinderGeometry(0.035, 0.03, 0.14, 12),
  straw: new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4),
  cutlery: new THREE.BoxGeometry(0.012, 0.004, 0.16),
  platter: new THREE.CylinderGeometry(0.2, 0.18, 0.025, 24),
  // The waiter: legs, body, head, an arm out holding the tray, the tray and a dome on it.
  leg: new THREE.BoxGeometry(0.12, 0.85, 0.14).translate(0, 0.425, 0),
  body: new THREE.BoxGeometry(0.42, 0.6, 0.24).translate(0, 0.3, 0),
  head: new THREE.SphereGeometry(0.11, 14, 10),
  arm: new THREE.BoxGeometry(0.09, 0.09, 0.42).translate(0, 0, 0.21),
  tray: new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20),
  dome: new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  tie: new THREE.BoxGeometry(0.1, 0.04, 0.02),
};
const mat = (color: number, extra?: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial({ color, ...extra });
/** Food colours, one material each (kept for good: there are only a few dozen). */
const FOOD = new Map<number, THREE.MeshLambertMaterial>();
const foodMat = (color: number) => FOOD.get(color) ?? (FOOD.set(color, mat(color)), FOOD.get(color)!);
const MAT = {
  china: mat(0xfbfaf7),
  black: mat(0x1a1b1e),
  white: mat(0xf8f9fa),
  skin: [mat(0x8d5524), mat(0x6b3e1f), mat(0xa86b3c)],
  metal: mat(0xced4da),
  glass: mat(0xd0ebff, { transparent: true, opacity: 0.45 }),
};

function waiterFigure(v: number) {
  const g = new THREE.Group();
  const skin = MAT.skin[Math.floor(v * MAT.skin.length) % MAT.skin.length];
  for (const sx of [-0.1, 0.1]) {
    const leg = new THREE.Mesh(geo.leg, MAT.black);
    leg.position.x = sx;
    g.add(leg);
  }
  const body = new THREE.Mesh(geo.body, MAT.white);
  body.position.y = 0.85;
  g.add(body);
  const tie = new THREE.Mesh(geo.tie, MAT.black);
  tie.position.set(0, 1.4, 0.125);
  g.add(tie);
  const head = new THREE.Mesh(geo.head, skin);
  head.position.y = 1.58;
  g.add(head);
  const arm = new THREE.Mesh(geo.arm, MAT.white);
  arm.position.set(0.22, 1.25, 0.02);
  g.add(arm);
  const tray = new THREE.Mesh(geo.tray, MAT.metal);
  tray.position.set(0.22, 1.31, 0.42);
  g.add(tray);
  const dome = new THREE.Mesh(geo.dome, MAT.metal);
  dome.position.set(0.22, 1.32, 0.42);
  g.add(dome);
  g.userData.tray = [tray, dome];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** One dish as a little group: a plate with a heap of food, a bowl of soup, a drink... */
function dishMesh(d: Dish) {
  const g = new THREE.Group();
  const food = foodMat(d.color);
  if (d.kind === "drink") {
    const glass = new THREE.Mesh(geo.glass, MAT.glass);
    glass.position.y = 0.07;
    const fill = new THREE.Mesh(geo.glass, food);
    fill.scale.set(0.85, 0.75, 0.85);
    fill.position.y = 0.055;
    const straw = new THREE.Mesh(geo.straw, MAT.white);
    straw.position.set(0.012, 0.14, 0);
    straw.rotation.z = 0.2;
    g.add(fill, glass, straw);
    return g;
  }
  if (d.kind === "bowl") {
    const bowl = new THREE.Mesh(geo.bowl, MAT.china);
    bowl.position.y = 0.035;
    const soup = new THREE.Mesh(geo.soup, food);
    soup.position.y = 0.055;
    g.add(bowl, soup);
    if (d.side !== undefined) {
      // A swallow beside it (pounded yam, eba, semo) on its own small plate.
      const plate = new THREE.Mesh(geo.plate, MAT.china);
      plate.scale.setScalar(0.7);
      plate.position.set(0.17, 0.01, 0);
      const ball = new THREE.Mesh(geo.mound, foodMat(d.side));
      ball.scale.set(0.7, 0.9, 0.7);
      ball.position.set(0.17, 0.02, 0);
      g.add(plate, ball);
    }
    return g;
  }
  const plate = new THREE.Mesh(d.kind === "platter" ? geo.platter : geo.plate, MAT.china);
  plate.position.y = 0.012;
  const heap = new THREE.Mesh(geo.mound, food);
  heap.position.y = 0.022;
  if (d.kind === "platter") heap.scale.set(1.8, 0.9, 1.4);
  g.add(plate, heap);
  if (d.side !== undefined) {
    const side = new THREE.Mesh(geo.mound, foodMat(d.side));
    side.scale.setScalar(0.55);
    side.position.set(0.06, 0.022, 0.05);
    g.add(side);
  }
  const fork = new THREE.Mesh(geo.cutlery, MAT.metal);
  fork.position.set(-0.16, 0.004, 0);
  g.add(fork);
  return g;
}

type Trip = {
  waiter: THREE.Group;
  seat: Seat;
  dishes: Dish[];
  /** Kitchen → beside your seat → back. */
  path: THREE.Vector3[];
  t: number;
  phase: "in" | "serve" | "out";
  stand: THREE.Vector3;
};

/**
 * The waiters and what's on the tables in one room. `room` is what the dishes are set down on
 * (raycast from above to find the table top); `holder` is the room's holder (metres inside it).
 */
export function createService(holder: THREE.Object3D, room: THREE.Object3D, kitchen: { x: number; z: number }) {
  const trips: Trip[] = [];
  const onTable: THREE.Object3D[] = [];
  const ray = new THREE.Raycaster();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();

  /** The height of whatever's in front of the seat (a table top), in room metres. */
  function tableTop(x: number, z: number) {
    holder.updateWorldMatrix(true, true);
    a.set(x, 1.3, z);
    holder.localToWorld(a);
    b.set(x, 0, z);
    holder.localToWorld(b);
    const dir = b.clone().sub(a);
    const len = dir.length();
    ray.set(a, dir.normalize());
    ray.far = len;
    for (const hit of ray.intersectObject(room, true)) {
      const p = holder.worldToLocal(hit.point.clone());
      if (p.y > 0.3 && p.y < 1.2) return p.y;
    }
    return 0.75;
  }

  function setDown(t: Trip) {
    if (t.seat.standing) return;
    const fx = Math.sin(t.seat.ry);
    const fz = Math.cos(t.seat.ry);
    const rx = Math.cos(t.seat.ry);
    const rz = -Math.sin(t.seat.ry);
    // The table in front of the seat: its height there. Dishes go in two short rows in front of
    // you (the food nearest, the drinks behind), and anything that would hang off the edge (onto a
    // chair, the floor) is pulled in towards the middle until it sits on the same table top.
    const cx = t.seat.x + fx * 0.45;
    const cz = t.seat.z + fz * 0.45;
    const top = tableTop(cx, cz);
    const food = t.dishes.filter((d) => d.kind !== "drink");
    const drinks = t.dishes.filter((d) => d.kind === "drink");
    const rows = [food.slice(0, 3), [...food.slice(3), ...drinks]].filter((r) => r.length);
    if (rows.length === 1 && rows[0].length > 3) rows.push(rows[0].splice(3));
    rows.forEach((row, ri) => {
      const out = rows.length === 1 ? 0.42 : ri === 0 ? 0.32 : 0.56;
      const gap = row.length > 3 ? 0.15 : 0.22;
      row.forEach((d, k) => {
        let across = (k - (row.length - 1) / 2) * gap;
        let o = out;
        let x = 0;
        let z = 0;
        for (let tries = 0; tries < 6; tries++) {
          x = t.seat.x + fx * o + rx * across;
          z = t.seat.z + fz * o + rz * across;
          if (Math.abs(tableTop(x, z) - top) < 0.04) break;
          across *= 0.6;
          o += (0.45 - o) * 0.5;
        }
        const m = dishMesh(d);
        if (d.kind === "platter" && t.dishes.length > 3) m.scale.setScalar(0.75);
        m.position.set(x, top + 0.002, z);
        m.rotation.y = t.seat.ry;
        holder.add(m);
        onTable.push(m);
      });
    });
  }

  return {
    /** A waiter brings these dishes to the seat. */
    serve(seat: Seat, dishes: Dish[]) {
      const waiter = waiterFigure(Math.abs(Math.sin(seat.x * 12.9 + seat.z * 7.7)));
      // He stops at your side, facing the table.
      const rx = Math.cos(seat.ry);
      const rz = -Math.sin(seat.ry);
      // Standing: he stops in front of you, facing you.
      const stand = seat.standing
        ? new THREE.Vector3(seat.x + Math.sin(seat.ry) * 0.7, 0, seat.z + Math.cos(seat.ry) * 0.7)
        : new THREE.Vector3(seat.x + rx * 0.55 + Math.sin(seat.ry) * 0.35, 0, seat.z + rz * 0.55 + Math.cos(seat.ry) * 0.35);
      const start = new THREE.Vector3(kitchen.x, 0, kitchen.z);
      const path = [start, stand];
      waiter.position.copy(start);
      holder.add(waiter);
      trips.push({ waiter, seat, dishes, path, t: 0, phase: "in", stand });
    },
    update(dt: number) {
      for (let i = trips.length - 1; i >= 0; i--) {
        const tr = trips[i];
        tr.t += dt;
        const w = tr.waiter;
        if (tr.phase === "in" || tr.phase === "out") {
          const [from, to] = tr.phase === "in" ? tr.path : [tr.path[1], tr.path[0]];
          const dist = from.distanceTo(to);
          const k = Math.min(1, (tr.t * 1.3) / Math.max(0.01, dist));
          w.position.lerpVectors(from, to, k);
          w.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
          // A little bounce in the step.
          w.position.y = Math.abs(Math.sin(tr.t * 9)) * 0.03;
          if (k >= 1) {
            if (tr.phase === "in") {
              tr.phase = "serve";
              tr.t = 0;
            } else {
              holder.remove(w);
              trips.splice(i, 1);
            }
          }
        } else {
          w.position.y = 0;
          // Turn to the table, lower the tray, set the dishes down, then go.
          w.rotation.y = tr.seat.ry + (tr.seat.standing ? Math.PI : Math.PI / 2);
          if (tr.t > 0.8 && (w.userData.tray as THREE.Object3D[])[1].visible) {
            for (const o of w.userData.tray as THREE.Object3D[]) o.visible = false;
            setDown(tr);
          }
          if (tr.t > 1.6) {
            tr.phase = "out";
            tr.t = 0;
          }
        }
      }
    },
    /** Clear the table (a new order replaces what's there; leaving takes it away). */
    clear() {
      for (const m of onTable) holder.remove(m);
      onTable.length = 0;
    },
    dispose() {
      for (const tr of trips) holder.remove(tr.waiter);
      trips.length = 0;
      this.clear();
    },
  };
}
