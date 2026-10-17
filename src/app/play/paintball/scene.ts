// Paintball, drawn: one of four grounds (world.ts ARENAS): a speedball field on astroturf
// (team-coloured ends, white lines) with bright inflatable bunkers, woods of trees, logs and hay
// bales on a forest floor, a yard of walls, cars and containers on concrete among tall buildings,
// or a beach camp of palms, drums, sandbags and boats by the sea. Tall nets on poles round it, a
// big sky, a scoreboard screen on the sideline and team flags. Players in team jerseys and masks with their
// markers, legs that run, a name over each head. Paintballs fly as little bright streaks and
// burst into splats that stay on bunkers, the turf and the nets. Third-person camera over the
// right shoulder; aiming brings it in close.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FIELD, RULES, TEAM, segmentHit, type ArenaId, type Ball, type Shape, type V3 } from "./world";

/** Each ground's sky, light and land round the field. */
const LOOKS: Record<ArenaId, { sky: [number, number]; fog: number; land: number; hemi: number; sun: number }> = {
  speedball: { sky: [0x2f7fd0, 0xd6ebf7], fog: 0xbfd9ee, land: 0x5f9f4a, hemi: 0x4d6b3a, sun: 0xfff2dc },
  woods: { sky: [0x4f86b8, 0xd9e6dc], fog: 0xb7c9b4, land: 0x4a7a3a, hemi: 0x3d5a2e, sun: 0xfff0d0 },
  yard: { sky: [0x5b7fa6, 0xe3e1da], fog: 0xcfd2d4, land: 0x8d9094, hemi: 0x6b6f73, sun: 0xffe9c7 },
  beach: { sky: [0x1d8fe0, 0xe8f6ff], fog: 0xd8eef8, land: 0xe8d5a3, hemi: 0xc9b48a, sun: 0xfff6e0 },
};

type Char = {
  root: THREE.Group;
  legs: [THREE.Object3D, THREE.Object3D];
  arms: THREE.Group;
  body: THREE.Group;
  tag: THREE.Sprite | null;
  stride: number;
  marks: THREE.Mesh[];
};

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class PaintballScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.05, 600);
  private chars = new Map<string, Char>();
  private balls = new Map<number, THREE.Mesh>();
  private ballPool: THREE.Mesh[] = [];
  private splats: THREE.Mesh[] = [];
  private splatNext = 0;
  private disposables: { dispose(): void }[] = [];
  private screen: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; key: string };
  private mats: Record<string, THREE.Material> = {};
  private shapes: Shape[];
  private camLook = new THREE.Vector3();
  private fov = 70;

  constructor(host: HTMLElement, shapes: Shape[], arena: ArenaId = "speedball") {
    this.shapes = shapes;
    const look = LOOKS[arena];
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    const r = this.renderer;
    r.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.style.width = "100%";
    r.domElement.style.height = "100%";
    r.domElement.style.touchAction = "none";
    host.appendChild(r.domElement);

    const sc = this.scene;
    sc.fog = new THREE.Fog(look.fog, arena === "woods" ? 50 : 70, arena === "woods" ? 200 : 260);

    // The sky: a soft gradient dome and the sun.
    const skyGeo = new THREE.SphereGeometry(400, 32, 16);
    const cols: number[] = [];
    const top = new THREE.Color(look.sky[0]);
    const low = new THREE.Color(look.sky[1]);
    const c = new THREE.Color();
    const pos = skyGeo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      c.copy(low).lerp(top, Math.pow(Math.max(0, pos.getY(i) / 400), 0.55));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    sc.add(new THREE.Mesh(skyGeo, skyMat));
    this.disposables.push(skyGeo, skyMat);

    sc.add(new THREE.HemisphereLight(0xeaf4ff, look.hemi, 1.1));
    const sun = new THREE.DirectionalLight(look.sun, 2.4);
    sun.position.set(-30, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sh = sun.shadow.camera as THREE.OrthographicCamera;
    sh.left = -40;
    sh.right = 40;
    sh.top = 30;
    sh.bottom = -30;
    sh.far = 160;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sc.add(sun);

    // Grass all round, the turf field, its lines and team ends.
    const grassMat = new THREE.MeshLambertMaterial({ color: look.land });
    const grass = new THREE.Mesh(new THREE.CircleGeometry(380, 48).rotateX(-Math.PI / 2), grassMat);
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    sc.add(grass);
    const turfTex = canvasTex(1024, 640, (g) => groundOf(arena, g));
    const turfMat = new THREE.MeshLambertMaterial({ map: turfTex });
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.hx * 2 + 2, FIELD.hz * 2 + 2).rotateX(-Math.PI / 2), turfMat);
    turf.receiveShadow = true;
    sc.add(turf);
    this.disposables.push(grassMat, turfTex, turfMat);

    // The bunkers: soft, shiny inflatables, with a white stripe round each.
    const bunkerMats = new Map<number, THREE.Material>();
    const bmat = (col: number) => {
      let m = bunkerMats.get(col);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.42, metalness: 0.0 });
        bunkerMats.set(col, m);
        this.disposables.push(m);
      }
      return m;
    };
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    this.disposables.push(stripe);
    const kit = new Kit(this.disposables);
    for (const s of shapes) {
      if (s.look && s.look !== "inflatable") {
        sc.add(kit.piece(s));
        continue;
      }
      let mesh: THREE.Mesh;
      if (s.kind === "box") {
        mesh = new THREE.Mesh(new RoundedBoxGeometry(s.w, s.h, s.d, 4, Math.min(0.3, s.h / 3, s.w / 3, s.d / 3)), bmat(s.colour));
        mesh.position.set(s.x, s.h / 2, s.z);
        mesh.rotation.y = s.ry ?? 0;
        const band = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.02, 0.12, s.d + 0.02), stripe);
        band.position.y = s.h * 0.15;
        mesh.add(band);
      } else if (s.kind === "cyl") {
        const g = new THREE.CapsuleGeometry(s.w / 2, Math.max(0.01, s.h - s.w), 6, 24);
        mesh = new THREE.Mesh(g, bmat(s.colour));
        mesh.position.set(s.x, s.h / 2, s.z);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(s.w / 2 + 0.015, s.w / 2 + 0.015, 0.14, 24, 1, true), stripe);
        band.position.y = -s.h * 0.2;
        mesh.add(band);
      } else {
        mesh = new THREE.Mesh(new THREE.ConeGeometry(s.w / 2 + 0.2, s.h, 3), bmat(s.colour));
        mesh.position.set(s.x, s.h / 2, s.z);
        mesh.rotation.y = s.x < 0 ? 0 : Math.PI;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.bunker = true;
      sc.add(mesh);
    }

    // Nets on poles round the field.
    const netTex = canvasTex(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(20,20,20,0.85)";
      g.lineWidth = 3;
      for (let k = 0; k <= 256; k += 16) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k, 256);
        g.stroke();
        g.beginPath();
        g.moveTo(0, k);
        g.lineTo(256, k);
        g.stroke();
      }
    });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const netMat = new THREE.MeshLambertMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x343a40 });
    this.disposables.push(netTex, netMat, poleMat);
    const NH = 6;
    for (const [x, z, len, ry] of [[0, -FIELD.hz - 1.5, FIELD.hx * 2 + 6, 0], [0, FIELD.hz + 1.5, FIELD.hx * 2 + 6, 0], [-FIELD.hx - 3, 0, FIELD.hz * 2 + 3, Math.PI / 2], [FIELD.hx + 3, 0, FIELD.hz * 2 + 3, Math.PI / 2]] as const) {
      const tex = netTex.clone();
      tex.repeat.set(len / 1.2, NH / 1.2);
      tex.needsUpdate = true;
      const m = netMat.clone();
      (m as THREE.MeshLambertMaterial).map = tex;
      this.disposables.push(tex, m);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(len, NH), m);
      net.position.set(x, NH / 2, z);
      net.rotation.y = ry;
      net.userData.net = true;
      sc.add(net);
      for (let k = 0; k <= Math.round(len / 8); k++) {
        const along = -len / 2 + (k * len) / Math.round(len / 8);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, NH + 0.4, 8), poleMat);
        pole.position.set(x + Math.cos(ry) * along, (NH + 0.4) / 2, z - Math.sin(ry) * along);
        pole.castShadow = true;
        sc.add(pole);
      }
    }

    // Flags at each end, the scoreboard screen on the far sideline.
    for (const team of [0, 1]) {
      const x = team === 0 ? -FIELD.hx - 5 : FIELD.hx + 5;
      for (const z of [-6, 6]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 8), poleMat);
        pole.position.set(x, 3.5, z);
        sc.add(pole);
        const flagMat = new THREE.MeshLambertMaterial({ color: TEAM[team].colour, side: THREE.DoubleSide });
        this.disposables.push(flagMat);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3, 8, 1), flagMat);
        flag.position.set(x, 6.2, z + 1.1);
        flag.rotation.y = Math.PI / 2;
        flag.userData.flag = true;
        sc.add(flag);
      }
    }
    const sg = document.createElement("canvas");
    sg.width = 512;
    sg.height = 192;
    const screenTex = new THREE.CanvasTexture(sg);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screen = { tex: screenTex, g: sg.getContext("2d")!, key: "" };
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
    this.disposables.push(screenTex, screenMat);
    const board = new THREE.Group();
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(14.5, 5.8, 0.5), poleMat);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.25), screenMat);
    face.position.z = 0.26;
    board.add(frameMesh, face);
    for (const lx of [-5, 5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), poleMat);
      leg.position.set(lx, -5.8, 0);
      board.add(leg);
    }
    board.position.set(0, 8.8, -FIELD.hz - 8);
    sc.add(board);
    this.setScore(0, 0, RULES.seconds);

    // Round the field: trees and hills, deep woods, the city's buildings, or palms and the sea.
    surroundings(sc, arena, this.disposables);

    // Shared bits for the people, balls and splats.
    this.mats.skin = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.7 });
    this.mats.pants = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.8 });
    this.mats.mask = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.4 });
    this.mats.visor = new THREE.MeshStandardMaterial({ color: 0x2a3d55, roughness: 0.05, metalness: 0.6 });
    this.mats.gun = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.35, metalness: 0.6 });
    this.mats.hopper = new THREE.MeshStandardMaterial({ color: 0xfab005, roughness: 0.3 });
    this.mats.shield = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false });
    for (const t of [0, 1]) {
      this.mats[`jersey${t}`] = new THREE.MeshStandardMaterial({ color: TEAM[t].colour, roughness: 0.6 });
      this.mats[`vest${t}`] = new THREE.MeshStandardMaterial({ color: TEAM[t].dark, roughness: 0.7 });
      this.mats[`ball${t}`] = new THREE.MeshBasicMaterial({ color: t ? 0x74c0fc : 0xff8787 });
      const splatTex = canvasTex(128, 128, (g) => {
        g.clearRect(0, 0, 128, 128);
        g.fillStyle = "#ffffff";
        g.beginPath();
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const rr = 34 + Math.sin(k * 2.7) * 8 + (k % 3 === 0 ? 14 : 0);
          const x = 64 + Math.cos(a) * rr;
          const y = 64 + Math.sin(a) * rr;
          if (k) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        g.fill();
        for (let k = 0; k < 8; k++) {
          const a = k * 0.8 + 0.3;
          g.beginPath();
          g.arc(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 4 + (k % 3) * 2, 0, Math.PI * 2);
          g.fill();
        }
      });
      this.disposables.push(splatTex);
      this.mats[`splat${t}`] = new THREE.MeshLambertMaterial({ color: t ? 0x339af0 : 0xff4d4d, map: splatTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    }
    for (const m of Object.values(this.mats)) this.disposables.push(m);
  }

  // ---------------------------------------------------------------- people

  addActor(id: string, name: string, team: number, me: boolean) {
    if (this.chars.has(id)) return;
    const m = this.mats;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const legs: THREE.Object3D[] = [];
    for (const lx of [-0.13, 0.13]) {
      const hip = new THREE.Group();
      hip.position.set(lx, 0.9, 0);
      add(hip, new THREE.CapsuleGeometry(0.1, 0.62, 4, 10), m.pants, 0, -0.42, 0);
      add(hip, new THREE.BoxGeometry(0.16, 0.1, 0.28), m.mask, 0, -0.86, -0.05);
      body.add(hip);
      legs.push(hip);
    }
    add(body, new THREE.CapsuleGeometry(0.24, 0.42, 6, 14), m[`jersey${team}`], 0, 1.22, 0);
    add(body, new THREE.BoxGeometry(0.46, 0.34, 0.3), m[`vest${team}`], 0, 1.3, 0.02);
    const head = new THREE.Group();
    head.position.set(0, 1.62, 0);
    add(head, new THREE.SphereGeometry(0.15, 16, 12), m.skin, 0, 0, 0);
    add(head, new THREE.SphereGeometry(0.165, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m[`jersey${team}`], 0, 0.02, 0);
    add(head, new THREE.BoxGeometry(0.28, 0.2, 0.12), m.mask, 0, -0.02, -0.12);
    add(head, new THREE.BoxGeometry(0.26, 0.08, 0.02), m.visor, 0, 0.02, -0.185);
    body.add(head);
    // Arms and the marker: they tip up and down with where you aim.
    const arms = new THREE.Group();
    arms.position.set(0, 1.38, 0);
    add(arms, new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), m[`jersey${team}`], 0.22, -0.1, -0.2).rotation.x = Math.PI / 2.4;
    add(arms, new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), m[`jersey${team}`], -0.12, -0.08, -0.3).rotation.set(Math.PI / 2.2, 0, -0.5);
    add(arms, new THREE.BoxGeometry(0.08, 0.12, 0.5), m.gun, 0.12, -0.08, -0.45);
    add(arms, new THREE.CylinderGeometry(0.025, 0.025, 0.42, 10).rotateX(Math.PI / 2), m.gun, 0.12, -0.04, -0.85);
    add(arms, new THREE.SphereGeometry(0.11, 14, 10), m.hopper, 0.12, 0.1, -0.42);
    add(arms, new THREE.CylinderGeometry(0.05, 0.05, 0.28, 10).rotateX(Math.PI / 2), m.mask, 0.12, -0.12, -0.12);
    body.add(arms);
    let tag: THREE.Sprite | null = null;
    if (!me) {
      const tex = canvasTex(256, 64, (g) => {
        g.clearRect(0, 0, 256, 64);
        g.fillStyle = "rgba(0,0,0,0.45)";
        g.beginPath();
        g.roundRect(8, 10, 240, 44, 22);
        g.fill();
        g.fillStyle = TEAM[team].css;
        g.font = "800 28px system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(name.slice(0, 16), 128, 33);
      });
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      tag = new THREE.Sprite(mat);
      tag.scale.set(1.6, 0.4, 1);
      tag.position.y = 2.15;
      tag.renderOrder = 10;
      root.add(tag);
      this.disposables.push(tex, mat);
    }
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry) this.disposables.push(o.geometry);
    });
    this.scene.add(root);
    this.chars.set(id, { root, legs: [legs[0], legs[1]], arms, body, tag, stride: 0, marks: [] });
  }

  removeActor(id: string) {
    const c = this.chars.get(id);
    if (!c) return;
    this.scene.remove(c.root);
    this.chars.delete(id);
  }

  setActor(id: string, x: number, y: number, z: number, yaw: number, pitch: number, speed: number, alive: boolean, shielded: boolean, dt: number, hideSelf = false) {
    const c = this.chars.get(id);
    if (!c) return;
    c.root.visible = alive && !hideSelf;
    c.root.position.set(x, y, z);
    c.root.rotation.y = yaw;
    c.arms.rotation.x = pitch * 0.9;
    c.stride += speed * dt * 2.2;
    const swing = Math.sin(c.stride) * Math.min(1, speed / 3) * 0.7;
    c.legs[0].rotation.x = swing;
    c.legs[1].rotation.x = -swing;
    c.body.position.y = Math.abs(Math.cos(c.stride)) * Math.min(1, speed / 3) * 0.05;
    // Just back in: a soft blink.
    c.body.visible = !shielded || Math.floor(performance.now() / 120) % 2 === 0;
  }

  /** A splat of paint on someone (it stays until they're back in). */
  markActor(id: string, team: number) {
    const c = this.chars.get(id);
    if (!c) return;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.mats[`splat${team}`]);
    s.scale.set(1, 1, 0.4);
    s.position.set((Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.4, -0.2);
    c.body.add(s);
    c.marks.push(s);
    this.disposables.push(s.geometry);
  }
  clearMarks(id: string) {
    const c = this.chars.get(id);
    if (!c) return;
    for (const m of c.marks) c.body.remove(m);
    c.marks = [];
  }

  // ---------------------------------------------------------------- paint

  addBall(b: Ball) {
    let mesh = this.ballPool.pop();
    if (!mesh) {
      const geo = new THREE.SphereGeometry(0.05, 8, 6);
      this.disposables.push(geo);
      mesh = new THREE.Mesh(geo, this.mats.ball0);
    }
    mesh.material = this.mats[`ball${b.team}`];
    mesh.position.set(b.x, b.y, b.z);
    this.scene.add(mesh);
    this.balls.set(b.id, mesh);
  }
  moveBall(b: Ball) {
    const m = this.balls.get(b.id);
    if (!m) return;
    m.position.set(b.x, b.y, b.z);
    // A streak along the way it's going.
    m.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    m.scale.set(1, 1, 3.5);
  }
  dropBall(id: number) {
    const m = this.balls.get(id);
    if (!m) return;
    this.scene.remove(m);
    this.balls.delete(id);
    this.ballPool.push(m);
  }

  /** A splat where a ball burst: at p, on a surface facing n. */
  splat(p: V3, n: V3, team: number) {
    let mesh = this.splats[this.splatNext];
    if (!mesh) {
      const geo = new THREE.PlaneGeometry(1, 1);
      this.disposables.push(geo);
      mesh = new THREE.Mesh(geo, this.mats.splat0);
      mesh.renderOrder = 2;
      this.splats[this.splatNext] = mesh;
      this.scene.add(mesh);
    }
    this.splatNext = (this.splatNext + 1) % 360;
    mesh.material = this.mats[`splat${team}`];
    const nn = new THREE.Vector3(n.x, n.y, n.z).normalize();
    mesh.position.set(p.x, p.y, p.z).addScaledVector(nn, 0.02);
    mesh.lookAt(mesh.position.clone().add(nn));
    mesh.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.35 + Math.random() * 0.35;
    mesh.scale.set(s, s, 1);
    mesh.visible = true;
  }

  // ---------------------------------------------------------------- the camera

  /** Over the right shoulder of someone at (x, y, z) looking (yaw, pitch); aiming comes in close. */
  follow(x: number, y: number, z: number, yaw: number, pitch: number, aiming: boolean, dt: number) {
    const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const head = new THREE.Vector3(x, y + 1.65, z);
    // A tall phone screen is narrow: further back, higher and nearly straight behind, so you're
    // in the middle of the view (not cut off at its edge).
    const tall = this.camera.aspect < 1;
    const back = aiming ? 0.9 : tall ? 3.6 : 2.7;
    const side = aiming ? 0.32 : tall ? 0.28 : 0.62;
    const want = head.clone().addScaledVector(right, side).addScaledVector(fwd, -back).add(new THREE.Vector3(0, aiming ? 0.05 : tall ? 0.6 : 0.3, 0));
    // Don't go through a bunker: come in closer.
    const hit = segmentHit(this.shapes, head, want);
    if (hit) want.lerpVectors(head, want, Math.max(0.1, hit.t - 0.08));
    want.y = Math.max(0.25, want.y);
    const k = 1 - Math.exp(-dt * 18);
    this.camera.position.lerp(want, k);
    this.camLook.copy(this.camera.position).addScaledVector(fwd, 10);
    this.camera.lookAt(this.camLook);
    const fov = aiming ? 46 : 72;
    this.fov += (fov - this.fov) * (1 - Math.exp(-dt * 12));
    this.setFov();
  }
  private setFov() {
    const a = this.camera.aspect;
    // Portrait phones: keep the same sideways view.
    this.camera.fov = a < 1 ? Math.min(95, (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.fov) / 2) / Math.max(0.45, a)) * 180) / Math.PI * 0.82) : this.fov;
    this.camera.updateProjectionMatrix();
  }
  /** Where the crosshair (the middle of the screen) points, and which way. */
  ray() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return { o: this.camera.position.clone(), d: dir };
  }

  setScore(red: number, blue: number, secs: number) {
    const key = `${red}|${blue}|${Math.ceil(secs)}`;
    if (key === this.screen.key) return;
    this.screen.key = key;
    const g = this.screen.g;
    g.fillStyle = "#0b0f14";
    g.fillRect(0, 0, 512, 192);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "900 88px system-ui, sans-serif";
    g.fillStyle = TEAM[0].css;
    g.fillText(String(red), 110, 100);
    g.fillStyle = TEAM[1].css;
    g.fillText(String(blue), 402, 100);
    const s = Math.max(0, Math.ceil(secs));
    g.fillStyle = "#ffffff";
    g.font = "800 54px system-ui, sans-serif";
    g.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`, 256, 82);
    g.font = "700 22px system-ui, sans-serif";
    g.fillStyle = "#adb5bd";
    g.fillText(`FIRST TO ${RULES.target}`, 256, 146);
    this.screen.tex.needsUpdate = true;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.setFov();
  }

  render(time: number) {
    // Flags in the wind.
    this.scene.traverse((o) => {
      if (o.userData.flag) o.rotation.x = Math.sin(time * 2 + o.position.z) * 0.08;
    });
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ---------------------------------------------------------------- the grounds

/** The field's own ground (1024 × 640, the whole field): turf, forest floor, concrete or sand. */
function groundOf(arena: ArenaId, g: CanvasRenderingContext2D) {
  const W = 1024;
  const H = 640;
  if (arena === "speedball") {
    for (let k = 0; k < 16; k++) {
      g.fillStyle = k % 2 ? "#3f9a3b" : "#46a643";
      g.fillRect((k * W) / 16, 0, W / 16 + 1, H);
    }
  } else {
    g.fillStyle = arena === "woods" ? "#4f6b33" : arena === "yard" ? "#8a8c8e" : "#e6d29e";
    g.fillRect(0, 0, W, H);
    // Patches: leaves and moss, oil stains and cracks, damp sand and shells.
    const spots = arena === "woods" ? ["#5d4a2c", "#3e5a28", "#6b7d3a"] : arena === "yard" ? ["#6f7173", "#9a9c9e", "#5e6062"] : ["#d6bf86", "#f1e2b8", "#cdb27a"];
    for (let k = 0; k < 160; k++) {
      g.fillStyle = spots[k % spots.length];
      g.globalAlpha = 0.35;
      g.beginPath();
      g.ellipse(Math.random() * W, Math.random() * H, 10 + Math.random() * 50, 6 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    if (arena === "yard") {
      g.strokeStyle = "rgba(40,40,40,.35)";
      g.lineWidth = 2;
      for (let x = 0; x < W; x += 64) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      for (let y = 0; y < H; y += 64) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
    }
  }
  // Team ends and the lines (painted, or chalk and rope on the rougher grounds).
  g.globalAlpha = arena === "speedball" ? 0.16 : 0.22;
  g.fillStyle = "#ff4d4d";
  g.fillRect(0, 0, 70, H);
  g.fillStyle = "#339af0";
  g.fillRect(W - 70, 0, 70, H);
  g.globalAlpha = arena === "speedball" ? 1 : 0.7;
  g.strokeStyle = arena === "yard" ? "#ffd43b" : "#ffffff";
  g.lineWidth = 6;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.beginPath();
  g.moveTo(W / 2, 8);
  g.lineTo(W / 2, H - 8);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  for (let k = 0; k < 9000; k++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
}

/** Builds the bunkers that aren't inflatables, each the size of what you hide behind. */
class Kit {
  private mats = new Map<string, THREE.Material>();
  constructor(private bin: { dispose(): void }[]) {}
  mat(colour: number, rough = 0.8, metal = 0) {
    const key = `${colour}:${rough}:${metal}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: colour, roughness: rough, metalness: metal, flatShading: rough > 0.85 });
      this.mats.set(key, m);
      this.bin.push(m);
    }
    return m;
  }
  mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
    this.bin.push(geo);
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  }
  piece(s: Shape): THREE.Object3D {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.ry ?? 0;
    const { w, d, h } = s;
    const c = s.colour;
    switch (s.look) {
      case "tree": {
        g.add(this.mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.55, h, 9), this.mat(c, 0.95), 0, h / 2, 0));
        const leaf = this.mat(0x3b6e35, 0.95);
        for (const [lx, ly, lz, r] of [[0, h * 0.78, 0, 2.6], [0.9, h * 0.66, 0.5, 1.9], [-0.8, h * 0.7, -0.6, 2], [0.2, h * 0.95, -0.3, 1.8]]) g.add(this.mesh(new THREE.IcosahedronGeometry(r, 0), leaf, lx, ly, lz));
        break;
      }
      case "palm": {
        // A leaning trunk, its fronds on top.
        const trunk = this.mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.5, h, 8), this.mat(c, 0.95), 0, h / 2, 0);
        g.add(trunk);
        const frond = this.mat(0x2f9e44, 0.9);
        for (let k = 0; k < 7; k++) {
          const f = this.mesh(new THREE.BoxGeometry(3.2, 0.06, 0.7), frond);
          const a = (k / 7) * Math.PI * 2;
          f.position.set(Math.cos(a) * 1.4, h - 0.3, Math.sin(a) * 1.4);
          f.rotation.set(0, -a, -0.35);
          g.add(f);
        }
        g.add(this.mesh(new THREE.SphereGeometry(0.35, 8, 6), this.mat(0x6b4f2a), 0, h - 0.4, 0));
        break;
      }
      case "log": {
        const log = this.mesh(new THREE.CylinderGeometry(h / 2, h / 2, w, 12), this.mat(c, 0.95), 0, h / 2, 0);
        log.rotation.z = Math.PI / 2;
        g.add(log);
        const ring = this.mat(0xc8a26a, 0.9);
        for (const e of [-1, 1]) {
          const end = this.mesh(new THREE.CircleGeometry(h / 2 - 0.02, 12), ring, (e * w) / 2 + e * 0.005, h / 2, 0);
          end.rotation.y = (e * Math.PI) / 2;
          g.add(end);
        }
        break;
      }
      case "bale":
        g.add(this.mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 16), this.mat(c, 1), 0, h / 2, 0));
        g.add(this.mesh(new THREE.TorusGeometry(w / 2 + 0.01, 0.025, 4, 24).rotateX(Math.PI / 2), this.mat(0x8c6d1f), 0, h * 0.3, 0));
        g.add(this.mesh(new THREE.TorusGeometry(w / 2 + 0.01, 0.025, 4, 24).rotateX(Math.PI / 2), this.mat(0x8c6d1f), 0, h * 0.7, 0));
        break;
      case "crate": {
        g.add(this.mesh(new THREE.BoxGeometry(w, h, d), this.mat(c, 0.9), 0, h / 2, 0));
        const slat = this.mat(0x7d5527, 0.9);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(this.mesh(new THREE.BoxGeometry(0.12, h + 0.02, 0.12), slat, (sx * (w - 0.1)) / 2, h / 2, (sz * (d - 0.1)) / 2));
        g.add(this.mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), slat, 0, h / 2, 0));
        break;
      }
      case "wall": {
        g.add(this.mesh(new THREE.BoxGeometry(w, h, d), this.mat(c, 0.95), 0, h / 2, 0));
        g.add(this.mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), this.mat(0x6c7075, 0.9), 0, h + 0.06, 0));
        // A bit of colour: graffiti on each side.
        const paint = this.mat([0xe64980, 0x15aabf, 0xfab005][Math.abs(Math.round(s.x * 7 + s.z)) % 3], 0.8);
        for (const e of [-1, 1]) g.add(this.mesh(new THREE.BoxGeometry(w * 0.5, h * 0.35, 0.02), paint, w * 0.1, h * 0.45, e * (d / 2 + 0.011)));
        break;
      }
      case "barrel":
      case "drum": {
        g.add(this.mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 16), this.mat(c, 0.45, 0.4), 0, h / 2, 0));
        for (const y of [0.25, 0.75]) g.add(this.mesh(new THREE.TorusGeometry(w / 2 + 0.01, 0.03, 4, 20).rotateX(Math.PI / 2), this.mat(0x495057, 0.5, 0.5), 0, h * y, 0));
        break;
      }
      case "tyres": {
        const rub = this.mat(c, 0.9);
        const n = Math.max(2, Math.round(h / 0.32));
        for (let k = 0; k < n; k++) g.add(this.mesh(new THREE.TorusGeometry(w / 2 - 0.16, 0.16, 8, 18).rotateX(Math.PI / 2), rub, 0, 0.16 + k * (h - 0.32) / (n - 1), 0));
        break;
      }
      case "car": {
        g.add(this.mesh(new RoundedBoxGeometry(w, h * 0.55, d, 3, 0.12), this.mat(c, 0.35, 0.3), 0, 0.25 + h * 0.275, 0));
        g.add(this.mesh(new RoundedBoxGeometry(w * 0.55, h * 0.4, d * 0.9, 3, 0.1), this.mat(0x2a3d55, 0.1, 0.5), -w * 0.05, h * 0.78, 0));
        const tyre = this.mat(0x1f2124, 0.9);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(this.mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12).rotateX(Math.PI / 2), tyre, sx * w * 0.32, 0.34, sz * (d / 2 - 0.05)));
        break;
      }
      case "container": {
        g.add(this.mesh(new THREE.BoxGeometry(w, h, d), this.mat(c, 0.7, 0.3), 0, h / 2, 0));
        const rib = this.mat(new THREE.Color(c).multiplyScalar(0.75).getHex(), 0.7, 0.3);
        for (let k = 0; k <= 10; k++) for (const e of [-1, 1]) g.add(this.mesh(new THREE.BoxGeometry(0.08, h - 0.2, 0.04), rib, -w / 2 + 0.2 + (k * (w - 0.4)) / 10, h / 2, e * (d / 2 + 0.02)));
        break;
      }
      case "sandbags": {
        const bag = this.mat(c, 1);
        const rows = Math.max(2, Math.round(h / 0.3));
        const per = Math.max(2, Math.round(w / 0.7));
        for (let y = 0; y < rows; y++)
          for (let k = 0; k < per - (y % 2); k++) {
            const b = this.mesh(new THREE.CapsuleGeometry(d * 0.32, 0.32, 3, 8), bag, -w / 2 + 0.35 + (k + (y % 2) * 0.5) * ((w - 0.7) / (per - 1)), 0.16 + y * ((h - 0.2) / rows), 0);
            b.rotation.z = Math.PI / 2;
            b.scale.set(0.6, 1, 1.4);
            g.add(b);
          }
        break;
      }
      case "boat": {
        // Upside down on the sand, its keel up.
        g.add(this.mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2), this.mat(c, 0.6), 0, 0, 0));
        g.add(this.mesh(new THREE.BoxGeometry(w, 0.12, 0.12), this.mat(0xf8f9fa, 0.6), 0, h - 0.06, 0));
        g.add(this.mesh(new THREE.BoxGeometry(w, h * 0.5, d), this.mat(c, 0.6), 0, h * 0.25, 0));
        break;
      }
      case "hut": {
        g.add(this.mesh(new THREE.BoxGeometry(w, h * 0.7, d), this.mat(c, 0.95), 0, h * 0.35, 0));
        const roof = this.mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.8, h * 0.45, 4), this.mat(0xc9a35a, 1), 0, h * 0.7 + h * 0.2, 0);
        roof.rotation.y = Math.PI / 4;
        g.add(roof);
        break;
      }
      default:
        g.add(this.mesh(new THREE.BoxGeometry(w, h, d), this.mat(c), 0, h / 2, 0));
    }
    return g;
  }
}

/** What's round the field, out past the nets. */
function surroundings(sc: THREE.Scene, arena: ArenaId, bin: { dispose(): void }[]) {
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const ring = (k: number, n: number, rx: number, rz: number) => {
    const a = (k / n) * Math.PI * 2;
    return [Math.cos(a) * (rx + ((k * 37) % 23)), Math.sin(a) * (rz + ((k * 53) % 19))] as const;
  };
  if (arena === "yard") {
    // Tall blocks of the city all round, with lit windows.
    const win = canvasTex(64, 128, (g) => {
      g.fillStyle = "#9aa3ab";
      g.fillRect(0, 0, 64, 128);
      for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 14) {
        g.fillStyle = Math.random() < 0.3 ? "#ffe8a3" : "#3b4a5a";
        g.fillRect(x, y, 8, 9);
      }
    });
    win.wrapS = win.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ map: win });
    bin.push(win, geo, mat);
    const N = 46;
    const blocks = new THREE.InstancedMesh(geo, mat, N);
    for (let k = 0; k < N; k++) {
      const [x, z] = ring(k, N, 62, 46);
      const h = 14 + ((k * 31) % 9) * 5;
      const w = 10 + ((k * 17) % 5) * 2;
      m4.compose(new THREE.Vector3(x, h / 2, z), q.setFromEuler(new THREE.Euler(0, Math.atan2(x, z), 0)), new THREE.Vector3(w, h, w * 0.8));
      blocks.setMatrixAt(k, m4);
    }
    sc.add(blocks);
    return;
  }
  // Trees (palms on the beach), and hills, or the sea.
  const palm = arena === "beach";
  const trunkMat = new THREE.MeshLambertMaterial({ color: palm ? 0x8a6a45 : 0x6b4f37 });
  const leafMat = new THREE.MeshLambertMaterial({ color: palm ? 0x2f9e44 : arena === "woods" ? 0x2f5f3a : 0x3f7a4f, flatShading: true });
  bin.push(trunkMat, leafMat);
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, palm ? 8 : 4, 6);
  const leafGeo = palm ? new THREE.ConeGeometry(3, 1.2, 7) : new THREE.IcosahedronGeometry(2.8, 0);
  bin.push(trunkGeo, leafGeo);
  const N = arena === "woods" ? 220 : palm ? 60 : 90;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
  for (let k = 0; k < N; k++) {
    // The woods: three deep rings of trees. The beach: palms on the land side only.
    const deep = arena === "woods" ? (k % 3) * 9 : 0;
    const [x, z0] = ring(k, N, 52 + deep, 36 + deep);
    const z = palm && z0 > 0 ? -z0 * 0.6 - 30 : z0;
    const s = 0.8 + ((k * 29) % 10) / 12;
    const tall = arena === "woods" ? 1.5 : 1;
    m4.compose(new THREE.Vector3(x, (palm ? 4 : 2) * s * tall, z), q.identity(), new THREE.Vector3(s, s * tall, s));
    trunks.setMatrixAt(k, m4);
    m4.compose(new THREE.Vector3(x, (palm ? 8.2 : 5.2) * s * tall, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, k, 0)), new THREE.Vector3(s, s * (palm ? 0.6 : 1.2), s));
    leaves.setMatrixAt(k, m4);
  }
  trunks.castShadow = leaves.castShadow = true;
  sc.add(trunks, leaves);
  if (palm) {
    // The sea on the far side, and its line of surf.
    const seaMat = new THREE.MeshLambertMaterial({ color: 0x1c8fc9 });
    const surfMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const seaGeo = new THREE.PlaneGeometry(900, 300).rotateX(-Math.PI / 2);
    const surfGeo = new THREE.PlaneGeometry(900, 2.5).rotateX(-Math.PI / 2);
    bin.push(seaMat, surfMat, seaGeo, surfGeo);
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.position.set(0, 0.01, 190);
    const surf = new THREE.Mesh(surfGeo, surfMat);
    surf.position.set(0, 0.02, 41);
    sc.add(sea, surf);
    return;
  }
  const hillMat = new THREE.MeshLambertMaterial({ color: arena === "woods" ? 0x47703f : 0x5a8c4f });
  bin.push(hillMat);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const geo = new THREE.SphereGeometry(40 + (k % 4) * 12, 16, 8);
    bin.push(geo);
    const hill = new THREE.Mesh(geo, hillMat);
    hill.scale.y = arena === "woods" ? 0.5 : 0.35;
    hill.position.set(Math.cos(a) * 220, -6, Math.sin(a) * 200);
    sc.add(hill);
  }
}
