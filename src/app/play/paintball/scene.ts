// Paintball, drawn: a speedball field on astroturf (team-coloured ends, white lines), bright
// inflatable bunkers, tall nets on poles round it, trees and hills beyond under a big sky, a
// scoreboard screen on the sideline and team flags. Players in team jerseys and masks with their
// markers, legs that run, a name over each head. Paintballs fly as little bright streaks and
// burst into splats that stay on bunkers, the turf and the nets. Third-person camera over the
// right shoulder; aiming brings it in close.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FIELD, RULES, TEAM, segmentHit, type Ball, type Shape, type V3 } from "./world";

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

  constructor(host: HTMLElement, shapes: Shape[]) {
    this.shapes = shapes;
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
    sc.fog = new THREE.Fog(0xbfd9ee, 70, 260);

    // The sky: a soft gradient dome and the sun.
    const skyGeo = new THREE.SphereGeometry(400, 32, 16);
    const cols: number[] = [];
    const top = new THREE.Color(0x2f7fd0);
    const low = new THREE.Color(0xd6ebf7);
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

    sc.add(new THREE.HemisphereLight(0xeaf4ff, 0x4d6b3a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
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
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x5f9f4a });
    const grass = new THREE.Mesh(new THREE.CircleGeometry(380, 48).rotateX(-Math.PI / 2), grassMat);
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    sc.add(grass);
    const turfTex = canvasTex(1024, 640, (g) => {
      for (let k = 0; k < 16; k++) {
        g.fillStyle = k % 2 ? "#3f9a3b" : "#46a643";
        g.fillRect((k * 1024) / 16, 0, 1024 / 16 + 1, 640);
      }
      g.globalAlpha = 0.35;
      g.fillStyle = "#e03131";
      g.fillRect(0, 0, 70, 640);
      g.fillStyle = "#1c7ed6";
      g.fillRect(1024 - 70, 0, 70, 640);
      g.globalAlpha = 1;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 6;
      g.strokeRect(8, 8, 1008, 624);
      g.beginPath();
      g.moveTo(512, 8);
      g.lineTo(512, 632);
      g.stroke();
      g.beginPath();
      g.arc(512, 320, 70, 0, Math.PI * 2);
      g.stroke();
      // Turf speckle.
      for (let k = 0; k < 9000; k++) {
        g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
        g.fillRect(Math.random() * 1024, Math.random() * 640, 2, 2);
      }
    });
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
    for (const s of shapes) {
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

    // Trees and hills beyond.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4f37 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a4f, flatShading: true });
    const hillMat = new THREE.MeshLambertMaterial({ color: 0x5a8c4f });
    this.disposables.push(trunkMat, leafMat, hillMat);
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 4, 6);
    const leafGeo = new THREE.IcosahedronGeometry(2.8, 0);
    const N = 90;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const rx = 52 + ((k * 37) % 23);
      const rz = 36 + ((k * 53) % 19);
      const x = Math.cos(a) * rx;
      const z = Math.sin(a) * rz;
      const s = 0.8 + ((k * 29) % 10) / 12;
      m4.compose(new THREE.Vector3(x, 2 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(k, m4);
      m4.compose(new THREE.Vector3(x, 5.2 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, k, 0)), new THREE.Vector3(s, s * 1.2, s));
      leaves.setMatrixAt(k, m4);
    }
    trunks.castShadow = leaves.castShadow = true;
    sc.add(trunks, leaves);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(40 + (k % 4) * 12, 16, 8), hillMat);
      hill.scale.y = 0.35;
      hill.position.set(Math.cos(a) * 220, -6, Math.sin(a) * 200);
      sc.add(hill);
    }

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
    const back = aiming ? 0.9 : 2.7;
    const side = aiming ? 0.32 : 0.62;
    const want = head.clone().addScaledVector(right, side).addScaledVector(fwd, -back).add(new THREE.Vector3(0, aiming ? 0.05 : 0.3, 0));
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
