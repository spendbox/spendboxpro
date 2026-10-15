// Parties on the map, as big as their hosts make them (docs/EVENTS.md, "How big"): every road inside
// a party's reach strung with coloured bulbs that chase and twinkle (brightest at night), the area
// tinted in the party's colour, and a glowing ring at its edge that shows from far away, so a
// carnival kilometres wide lights up the city. Kept cheap: two instanced meshes of bulbs (one draw
// each, capped), and a ring and a tint per party.

import * as THREE from "three";
import { hash, type Tile } from "@/lib/city/layout";

/** A party on the map: its middle (tiles), how far it reaches (tiles) and its colour. */
export type PartyZone = { id: number; x: number; z: number; r: number; colour: string };

/** The most bulbs drawn (each road tile gets a string of them). */
const MAX_BULBS = 6000;
const PER_STRING = 7;
const PALETTE = [0xff3b6b, 0xffd43b, 0x51cf66, 0x4dabf7, 0xcc5de8, 0xff922b];

export function createPartyLights(parent: THREE.Object3D) {
  const group = new THREE.Group();
  group.userData.name = "partyLights";
  parent.add(group);
  const bulbGeo = new THREE.SphereGeometry(0.035, 6, 4);
  // Two sets that take turns being bright: the chase.
  const mats = [0, 1].map(() => new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const sets = mats.map((m) => {
    const mesh = new THREE.InstancedMesh(bulbGeo, m, MAX_BULBS / 2);
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });
  const discs: THREE.Mesh[] = [];
  let zones: PartyZone[] = [];
  let builtFor: { tiles: Tile[] | null; key: string } = { tiles: null, key: "" };
  /** Which parties are lit (worked out when they change, not every frame). */
  let zonesKey = "";
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();

  function clearDiscs() {
    for (const d of discs) {
      group.remove(d);
      d.geometry.dispose();
      (d.material as THREE.Material).dispose();
    }
    discs.length = 0;
  }

  function build(tiles: Tile[]) {
    clearDiscs();
    const counts = [0, 0];
    for (const z of zones) {
      const c = new THREE.Color(z.colour);
      // The edge: a glowing ring (seen from anywhere), and the area faintly tinted inside it.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.3, z.r - 0.18), z.r + 0.18, Math.min(160, 32 + Math.round(z.r * 6))).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }),
      );
      ring.position.set(z.x, 0.07, z.z);
      ring.renderOrder = 2;
      const tint = new THREE.Mesh(
        new THREE.CircleGeometry(z.r, Math.min(160, 32 + Math.round(z.r * 6))).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, depthWrite: false }),
      );
      tint.position.set(z.x, 0.065, z.z);
      group.add(ring, tint);
      discs.push(ring, tint);
    }
    // Bulbs over every road tile inside a party (the near tiles only: those drawn in full).
    for (const t of tiles) {
      if (t.kind !== "road" && t.kind !== "bridge") continue;
      const zone = zones.find((z) => Math.hypot(t.x - z.x, t.z - z.z) <= z.r);
      if (!zone) continue;
      // A string across the road, corner to corner (which way, by the tile), sagging in the middle.
      const flip = hash(t.x, t.z, 9311) < 0.5 ? 1 : -1;
      for (let k = 0; k < PER_STRING; k++) {
        const u = k / (PER_STRING - 1);
        const set = (k + t.x + t.z) & 1;
        if (counts[set] >= MAX_BULBS / 2) continue;
        const x = t.x - 0.42 + u * 0.84;
        const z = t.z + flip * (-0.42 + u * 0.84);
        const y = 0.55 - 0.12 * Math.sin(u * Math.PI);
        m4.makeTranslation(x, y, z);
        sets[set].setMatrixAt(counts[set], m4);
        sets[set].setColorAt(counts[set], col.setHex(PALETTE[(k + Math.abs(t.x) * 3 + Math.abs(t.z)) % PALETTE.length]));
        counts[set]++;
      }
    }
    sets.forEach((s, i) => {
      s.count = counts[i];
      s.instanceMatrix.needsUpdate = true;
      if (s.instanceColor) s.instanceColor.needsUpdate = true;
    });
  }

  return {
    /** The parties on now (an empty list clears them). */
    set(list: PartyZone[]) {
      zones = list.filter((z) => Number.isFinite(z.x) && Number.isFinite(z.z) && z.r > 0);
      zonesKey = zones.map((z) => `${z.id}:${z.x},${z.z},${z.r}`).join("|");
      builtFor = { tiles: null, key: "" };
      group.visible = zones.length > 0;
    },
    /** Each frame: rebuild when the city round the camera changed, and run the chase. */
    update(time: number, tiles: Tile[], night: number) {
      if (!zones.length) return;
      if (builtFor.tiles !== tiles || builtFor.key !== zonesKey) {
        build(tiles);
        builtFor = { tiles, key: zonesKey };
      }
      // The two sets take turns, a little faster at night; dimmer by day so they don't glare.
      const on = Math.floor(time * (night > 0.5 ? 2.5 : 1.6)) % 2;
      const bright = 0.55 + 0.45 * night;
      mats[0].color.setScalar(on ? bright : bright * 0.35);
      mats[1].color.setScalar(on ? bright * 0.35 : bright);
    },
  };
}
