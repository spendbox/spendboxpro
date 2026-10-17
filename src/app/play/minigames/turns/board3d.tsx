"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { playSfx } from "../../sound";
import { canWebGL } from "../webgl";

// The 3D board chess and draughts are played on, full screen: a polished wooden board with its
// letters and numbers on the frame, on a table in a dim club room, real-looking pieces (carved
// chess men in ivory and ebony, draughts in red and black with gold-crowned kings), soft shadows
// and reflections. Pieces glide (or hop, for knights and jumps) to their squares; taken pieces fly
// off to the side of the board. Tap a piece, then where it goes; drag to look round the board,
// pinch or scroll to come closer. Each square is r * 8 + c, row 0 at the far side for seat 0.

export type BoardStyle = "chess" | "draughts";
/** What's on a square: a short code ("wQ", "bP"; draughts "0M", "1K"), or null. */
export type Board = (string | null)[];

type Props = {
  style: BoardStyle;
  board: Board;
  /** The last move (squares visited, first to last), for its animation and the highlight. */
  last: number[];
  /** Seat 1 looks from the other side. */
  flip: boolean;
  /** Squares you can tap now: your pieces that can move, and where the selected one can go. */
  pickable: Set<number>;
  selected: number | null;
  targets: Set<number>;
  /** A king in check (chess). */
  danger: number | null;
  onSquare: (i: number) => void;
};

const SQ = 1;
const TOP = 0.12;
const centre = (i: number) => new THREE.Vector3((i % 8) - 3.5, TOP, Math.floor(i / 8) - 3.5);

// ---------------------------------------------------------------- the pieces

function lathe(points: [number, number][], segs = 40) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}
const BASE: [number, number][] = [[0, 0], [0.36, 0], [0.37, 0.03], [0.36, 0.07], [0.32, 0.09], [0.33, 0.12], [0.28, 0.15]];

const geoCache = new Map<string, THREE.BufferGeometry[]>();
function chessGeos(kind: string): THREE.BufferGeometry[] {
  const hit = geoCache.get(kind);
  if (hit) return hit;
  let out: THREE.BufferGeometry[] = [];
  switch (kind) {
    case "P":
      out = [lathe([...BASE, [0.2, 0.2], [0.13, 0.4], [0.11, 0.48], [0.17, 0.5], [0.17, 0.53], [0.1, 0.56], [0, 0.56]]), new THREE.SphereGeometry(0.15, 28, 18).translate(0, 0.66, 0)];
      break;
    case "R": {
      out = [lathe([...BASE, [0.24, 0.22], [0.2, 0.3], [0.2, 0.62], [0.26, 0.66], [0.26, 0.8], [0, 0.8]])];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        out.push(new THREE.BoxGeometry(0.1, 0.12, 0.09).rotateY(-a).translate(Math.cos(a) * 0.2, 0.86, Math.sin(a) * 0.2));
      }
      break;
    }
    case "N": {
      // The horse's head: a side view cut out and given depth, with soft edges.
      const sh = new THREE.Shape();
      sh.moveTo(-0.2, 0);
      sh.lineTo(0.22, 0);
      sh.bezierCurveTo(0.22, 0.2, 0.12, 0.3, 0.16, 0.42);
      sh.bezierCurveTo(0.2, 0.52, 0.3, 0.55, 0.33, 0.66);
      sh.lineTo(0.27, 0.74);
      sh.bezierCurveTo(0.16, 0.74, 0.1, 0.8, 0.04, 0.9);
      sh.lineTo(-0.02, 0.98);
      sh.lineTo(-0.06, 0.86);
      sh.bezierCurveTo(-0.2, 0.82, -0.26, 0.62, -0.24, 0.4);
      sh.bezierCurveTo(-0.22, 0.24, -0.2, 0.12, -0.2, 0);
      const head = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 4, curveSegments: 18 });
      head.translate(0, 0, -0.08);
      head.rotateY(Math.PI / 2);
      head.translate(0, 0.16, 0);
      out = [lathe([...BASE, [0.26, 0.18], [0, 0.18]]), head];
      break;
    }
    case "B":
      out = [
        lathe([...BASE, [0.2, 0.22], [0.12, 0.42], [0.1, 0.52], [0.18, 0.55], [0.18, 0.59], [0.1, 0.61], [0.15, 0.7], [0.15, 0.8], [0.08, 0.92], [0.03, 0.96], [0, 0.96]]),
        new THREE.SphereGeometry(0.045, 16, 10).translate(0, 1.0, 0),
      ];
      break;
    case "Q": {
      out = [lathe([...BASE, [0.24, 0.22], [0.14, 0.48], [0.11, 0.7], [0.2, 0.74], [0.2, 0.78], [0.13, 0.81], [0.19, 0.98], [0.12, 1.0], [0, 1.02]])];
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        out.push(new THREE.SphereGeometry(0.035, 10, 8).translate(Math.cos(a) * 0.17, 1.0, Math.sin(a) * 0.17));
      }
      out.push(new THREE.SphereGeometry(0.06, 16, 10).translate(0, 1.07, 0));
      break;
    }
    case "K":
      out = [
        lathe([...BASE, [0.25, 0.22], [0.15, 0.5], [0.12, 0.74], [0.21, 0.78], [0.21, 0.82], [0.13, 0.85], [0.18, 1.0], [0.1, 1.04], [0, 1.04]]),
        new THREE.BoxGeometry(0.06, 0.22, 0.06).translate(0, 1.15, 0),
        new THREE.BoxGeometry(0.17, 0.06, 0.06).translate(0, 1.18, 0),
      ];
      break;
  }
  geoCache.set(kind, out);
  return out;
}

function draughtGeos(king: boolean): THREE.BufferGeometry[] {
  const key = king ? "dK" : "dM";
  const hit = geoCache.get(key);
  if (hit) return hit;
  const disc = (y: number) =>
    lathe(
      [[0, 0], [0.36, 0], [0.4, 0.02], [0.41, 0.06], [0.4, 0.1], [0.36, 0.12], [0.3, 0.12], [0.29, 0.1], [0.24, 0.1], [0.23, 0.12], [0, 0.12]].map(([r, h]) => [r, h + y] as [number, number]),
      48,
    );
  const out = king ? [disc(0), disc(0.125)] : [disc(0)];
  geoCache.set(key, out);
  return out;
}

type Mats = { white: THREE.Material; black: THREE.Material; red: THREE.Material; gold: THREE.Material };

function makePiece(style: BoardStyle, code: string, mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  if (style === "chess") {
    const mat = code[0] === "w" ? mats.white : mats.black;
    for (const geo of chessGeos(code[1])) add(geo, mat);
    // Knights look towards the other side.
    // Knights look across the board (their heads side on, as on a real set).
    if (code[1] === "N") g.rotation.y = code[0] === "w" ? -Math.PI / 2 : Math.PI / 2;
  } else {
    const mat = code[0] === "0" ? mats.red : mats.black;
    const king = code[1] === "K";
    for (const geo of draughtGeos(king)) add(geo, mat);
    if (king) {
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 10, 32).rotateX(Math.PI / 2).translate(0, 0.27, 0), mats.gold);
      crown.castShadow = true;
      g.add(crown);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const pt = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 8).translate(Math.cos(a) * 0.16, 0.32, Math.sin(a) * 0.16), mats.gold);
        g.add(pt);
      }
    }
  }
  g.userData.code = code;
  return g;
}

// ---------------------------------------------------------------- textures

function boardTexture(style: BoardStyle) {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  const s = 1024 / 8;
  const [light, dark] = style === "chess" ? ["#ecd9b8", "#8b5a35"] : ["#efdcbc", "#3b6b46"];
  for (let r = 0; r < 8; r++) {
    for (let col = 0; col < 8; col++) {
      g.fillStyle = (r + col) % 2 ? dark : light;
      g.fillRect(col * s, r * s, s, s);
      // Wood grain.
      g.globalAlpha = 0.08;
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = (r + col) % 2 ? "#2b1708" : "#7a5230";
        g.lineWidth = 1 + ((k * 7 + r * 3 + col) % 3);
        g.beginPath();
        const y = r * s + ((k * 37 + col * 13) % s);
        g.moveTo(col * s, y);
        g.bezierCurveTo(col * s + s * 0.3, y + 4, col * s + s * 0.7, y - 5, col * s + s, y + 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function frameTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 1024, 1024);
  grad.addColorStop(0, "#4a2a14");
  grad.addColorStop(0.5, "#5c3519");
  grad.addColorStop(1, "#3e220f");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = "rgba(255,236,200,0.75)";
  g.font = "600 44px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  // The frame is 9.2 units across, the squares 8 of them: letters along the near and far edges
  // (the far ones upside down, for the player over there), numbers down both sides.
  const unit = 1024 / 9.2;
  const write = (text: string, x: number, y: number, turn: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(turn);
    g.fillText(text, 0, 0);
    g.restore();
  };
  for (let k = 0; k < 8; k++) {
    const x = (0.6 + k + 0.5) * unit;
    write("abcdefgh"[k], x, 1024 - unit * 0.3, 0);
    write("abcdefgh"[k], x, unit * 0.3, Math.PI);
    write(String(8 - k), unit * 0.3, x, 0);
    write(String(8 - k), 1024 - unit * 0.3, x, Math.PI);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------- the scene

type Anim = { obj: THREE.Object3D; path: THREE.Vector3[]; t: number; dur: number; hop: number; then?: () => void };

export function Board3D(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const api = useRef<{ sync: (board: Board, last: number[]) => void; marks: (p: Props) => void; flip: (f: boolean) => void } | null>(null);
  const props = useRef(p);
  const [failed] = useState(() => !canWebGL());
  useEffect(() => {
    props.current = p;
  });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15110e);
    scene.fog = new THREE.Fog(0x15110e, 32, 62);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.6;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    const { style } = props.current;

    // Light: a warm lamp over the table, a cool fill, soft room light.
    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a1d14, 0.55));
    const lamp = new THREE.SpotLight(0xffe2b8, 160, 30, 0.6, 0.55, 1.6);
    lamp.position.set(1.5, 11, 2.5);
    lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.radius = 4;
    scene.add(lamp, lamp.target);
    const fill = new THREE.DirectionalLight(0x9ec5ff, 0.35);
    fill.position.set(-6, 5, -4);
    scene.add(fill);

    // The table, the frame and the board.
    const disposables: { dispose(): void }[] = [env, pmrem];
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.55, metalness: 0.05 });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.6, 64), tableMat);
    table.position.y = -0.9;
    table.receiveShadow = true;
    const felt = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.4, 0.02, 64), new THREE.MeshStandardMaterial({ color: style === "chess" ? 0x1f3a2c : 0x2c1f3a, roughness: 0.95 }));
    felt.position.y = -0.59;
    felt.receiveShadow = true;
    const frameTex = frameTexture();
    const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x4a2a14, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const frame = new THREE.Mesh(new RoundedBoxGeometry(9.2, 0.62, 9.2, 4, 0.12), frameMat);
    frame.position.y = -0.2;
    frame.castShadow = frame.receiveShadow = true;
    const boardTex = boardTexture(style);
    const boardMat = new THREE.MeshPhysicalMaterial({ map: boardTex, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(8, 0.06, 8), boardMat);
    top.position.y = TOP - 0.03;
    top.receiveShadow = true;
    // The frame's top face shows the letters: a plane just above it.
    const letters = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 9.2), new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.4, transparent: true }));
    letters.rotation.x = -Math.PI / 2;
    letters.position.y = 0.112;
    letters.receiveShadow = true;
    const board = new THREE.Group();
    board.add(table, felt, frame, letters, top);
    scene.add(board);
    disposables.push(tableMat, frameTex, frameMat, boardTex, boardMat, letters.material as THREE.Material);

    // A dim room beyond: walls with warm wall lights, far away.
    const roomMat = new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 0.9, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.CylinderGeometry(44, 44, 24, 32, 1, true), roomMat);
    room.position.y = 6;
    scene.add(room);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc078 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), glowMat);
      l.position.set(Math.cos(a) * 43, 5, Math.sin(a) * 43);
      scene.add(l);
    }
    disposables.push(roomMat, glowMat);

    const mats: Mats = {
      white: new THREE.MeshPhysicalMaterial({ color: 0xf2e8d5, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.15, sheen: 0.2 }),
      black: new THREE.MeshPhysicalMaterial({ color: 0x1b1716, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }),
      red: new THREE.MeshPhysicalMaterial({ color: 0xb3261e, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.25, metalness: 1 }),
    };
    disposables.push(...Object.values(mats));

    // Highlights: the selected square, where it can go, the last move, a king in check.
    const markGeo = new THREE.PlaneGeometry(SQ * 0.98, SQ * 0.98).rotateX(-Math.PI / 2);
    const dotGeo = new THREE.CircleGeometry(0.15, 24).rotateX(-Math.PI / 2);
    const ringGeo = new THREE.RingGeometry(0.36, 0.46, 32).rotateX(-Math.PI / 2);
    const mk = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const selMat = mk(0xffd43b, 0.5);
    const lastMat = mk(0xc0eb75, 0.32);
    const dotMat = mk(0x20c997, 0.85);
    const pickMat = mk(0xffffff, 0.1);
    const dangerMat = mk(0xff2b2b, 0.55);
    disposables.push(markGeo, dotGeo, ringGeo, selMat, lastMat, dotMat, pickMat, dangerMat);
    const marks = new THREE.Group();
    scene.add(marks);

    // The pieces, by square.
    const at = new Map<number, THREE.Group>();
    const taken: THREE.Object3D[] = [];
    const anims: Anim[] = [];
    let shown: Board = Array(64).fill(null);
    const place = (obj: THREE.Object3D, i: number) => obj.position.copy(centre(i));
    const tray = (side: string) => {
      // Taken pieces line up beside the board, on the side of whoever took them.
      const mineSide = side === (style === "chess" ? "b" : "1");
      const n = taken.filter((o) => (o.userData.code as string)[0] === side).length;
      const row = Math.floor(n / 8);
      return new THREE.Vector3(-3.5 + (n % 8), -0.58, (mineSide ? 5.4 : -5.4) + (mineSide ? row : -row) * 0.9);
    };
    function spawn(code: string, i: number) {
      const obj = makePiece(style, code, mats);
      place(obj, i);
      scene.add(obj);
      at.set(i, obj);
      return obj;
    }
    function remove(obj: THREE.Object3D) {
      scene.remove(obj);
    }
    function capture(obj: THREE.Object3D) {
      const code = obj.userData.code as string;
      const to = tray(code[0]);
      taken.push(obj);
      anims.push({ obj, path: [obj.position.clone(), obj.position.clone().add(new THREE.Vector3(0, 1.4, 0)), to], t: 0, dur: 0.7, hop: 0 });
    }
    function sync(next: Board, last: number[]) {
      const prev = shown;
      shown = [...next];
      const animate = last.length >= 2 && prev[last[0]] && !next[last[0]] && next[last[last.length - 1]];
      const moved = new Set<number>();
      if (animate) {
        const from = last[0];
        const to = last[last.length - 1];
        const obj = at.get(from);
        if (obj) {
          at.delete(from);
          // Whatever was on the landing square is taken.
          const victim = at.get(to);
          if (victim) {
            at.delete(to);
            capture(victim);
          }
          at.set(to, obj);
          moved.add(to);
          const code = next[to]!;
          const jump = style === "draughts" ? last.length > 1 && Math.abs(Math.floor(last[1] / 8) - Math.floor(last[0] / 8)) === 2 : code[1] === "N";
          anims.push({
            obj,
            path: last.map((i) => centre(i)),
            t: 0,
            dur: 0.32 * (last.length - 1) + 0.12,
            hop: jump ? 0.9 : 0.25,
            then: () => {
              // Crowned, or a pawn made a queen: the new piece in its place.
              if (obj.userData.code !== code) {
                remove(obj);
                const fresh = spawn(code, to);
                fresh.scale.setScalar(0.2);
                anims.push({ obj: fresh, path: [fresh.position.clone(), fresh.position.clone()], t: 0, dur: 0.35, hop: 0, then: () => fresh.scale.setScalar(1) });
                playSfx("found");
              }
              playSfx("tick");
            },
          });
        }
      }
      // Everything else: pieces gone (taken, or castled away) and pieces that turned up.
      const gone: number[] = [];
      const came: number[] = [];
      for (let i = 0; i < 64; i++) {
        if (moved.has(i)) continue;
        const have = at.get(i);
        const want = next[i];
        if (have && (!want || (have.userData.code as string) !== want)) gone.push(i);
        if (want && (!have || (have.userData.code as string) !== want)) came.push(i);
      }
      for (const i of came) {
        const j = gone.findIndex((g) => at.get(g)?.userData.code === next[i]);
        if (j >= 0 && animate) {
          // A castling rook: slide it over.
          const from = gone.splice(j, 1)[0];
          const obj = at.get(from)!;
          at.delete(from);
          at.set(i, obj);
          anims.push({ obj, path: [centre(from), centre(i)], t: 0, dur: 0.4, hop: 0.2 });
        } else {
          const old = at.get(i);
          if (old) {
            at.delete(i);
            if (animate) capture(old);
            else remove(old);
          }
          spawn(next[i]!, i);
        }
      }
      for (const i of gone) {
        const obj = at.get(i);
        if (!obj) continue;
        at.delete(i);
        if (animate) {
          capture(obj);
          playSfx("pop");
        } else remove(obj);
      }
    }
    function setMarks(q: Props) {
      for (const c of [...marks.children]) marks.remove(c);
      const put = (geo: THREE.BufferGeometry, mat: THREE.Material, i: number, y = 0.005) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(centre(i)).setY(TOP + y);
        m.renderOrder = 3;
        marks.add(m);
      };
      for (const i of q.last) put(markGeo, lastMat, i, 0.003);
      for (const i of q.pickable) if (!q.targets.has(i) && i !== q.selected) put(markGeo, pickMat, i, 0.004);
      if (q.selected !== null) put(markGeo, selMat, q.selected, 0.006);
      for (const i of q.targets) put(q.board[i] ? ringGeo : dotGeo, dotMat, i, 0.008);
      if (q.danger !== null) put(markGeo, dangerMat, q.danger, 0.007);
    }
    sync(props.current.board, []);
    setMarks(props.current);

    // ---- the camera: from your side, drag to look round, pinch or scroll to come closer
    const view = { yaw: props.current.flip ? Math.PI : 0, pitch: 0.95, dist: 14 };
    const aim = { ...view };
    let zoomed = false;
    // Pass and play: the board turns round to whoever's move it is.
    api.current = { sync, marks: setMarks, flip: (f) => (aim.yaw = f ? Math.PI : 0) };
    function fit() {
      const w = el!.clientWidth || 1;
      const h = el!.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 0.8 ? 50 : 40;
      camera.updateProjectionMatrix();
      // Far enough back that the whole board fits across (portrait phones: further).
      const across = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1.3, camera.aspect);
      if (!zoomed) aim.dist = view.dist = Math.min(30, Math.max(12, 5.6 / across));
    }
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);
    const hit = new THREE.Vector3();
    const touches = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; moved: number; pinch: number } | null = null;
    function squareAt(cx: number, cy: number) {
      const r = renderer.domElement.getBoundingClientRect();
      ptr.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      // Pieces first (they stand above their squares), then the board.
      const objs = [...at.values()];
      const h = ray.intersectObjects(objs, true)[0];
      if (h) {
        let o: THREE.Object3D | null = h.object;
        while (o && !objs.includes(o as THREE.Group)) o = o.parent;
        for (const [i, g] of at) if (g === o) return i;
      }
      if (!ray.ray.intersectPlane(plane, hit)) return -1;
      const c = Math.floor(hit.x + 4);
      const rr = Math.floor(hit.z + 4);
      return c >= 0 && c < 8 && rr >= 0 && rr < 8 ? rr * 8 + c : -1;
    }
    const pinchDist = () => {
      const [a, b] = [...touches.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    function down(e: PointerEvent) {
      renderer.domElement.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag = { x: e.clientX, y: e.clientY, moved: 0, pinch: touches.size === 2 ? pinchDist() : 0 };
    }
    function move(e: PointerEvent) {
      if (!touches.has(e.pointerId) || !drag) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        const d = pinchDist();
        if (drag.pinch) aim.dist = Math.min(30, Math.max(7, aim.dist * (drag.pinch / d)));
        zoomed = true;
        drag.pinch = d;
        drag.moved = 99;
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.moved > 8) {
        aim.yaw -= dx * 0.006;
        aim.pitch = Math.min(1.42, Math.max(0.45, aim.pitch + dy * 0.004));
      }
    }
    function up(e: PointerEvent) {
      const wasTap = drag && drag.moved <= 8 && touches.size === 1;
      touches.delete(e.pointerId);
      if (wasTap) {
        const i = squareAt(e.clientX, e.clientY);
        if (i >= 0) props.current.onSquare(i);
      }
      if (!touches.size) drag = null;
    }
    function wheel(e: WheelEvent) {
      e.preventDefault();
      aim.dist = Math.min(30, Math.max(7, aim.dist * (1 + Math.sign(e.deltaY) * 0.08)));
      zoomed = true;
    }
    const cv = renderer.domElement;
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", wheel, { passive: false });

    // ---- the loop
    let raf = 0;
    let lastT = performance.now();
    const tmp = new THREE.Vector3();
    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      // Ease the camera.
      const k = 1 - Math.exp(-dt * 6);
      view.yaw += (aim.yaw - view.yaw) * k;
      view.pitch += (aim.pitch - view.pitch) * k;
      view.dist += (aim.dist - view.dist) * k;
      camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, Math.sin(view.pitch) * view.dist, Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist);
      camera.lookAt(0, -0.2, 0.3 * Math.cos(view.yaw));
      for (let a = anims.length - 1; a >= 0; a--) {
        const an = anims[a];
        an.t = Math.min(1, an.t + dt / an.dur);
        const legs = an.path.length - 1;
        const f = an.t * legs;
        const leg = Math.min(legs - 1, Math.floor(f));
        const u = f - leg;
        const e2 = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        tmp.copy(an.path[leg]).lerp(an.path[leg + 1], e2);
        tmp.y += Math.sin(u * Math.PI) * an.hop;
        an.obj.position.copy(tmp);
        if (an.obj.scale.x < 1 && an.dur < 0.4 && !an.hop) an.obj.scale.setScalar(0.2 + 0.8 * an.t);
        if (an.t >= 1) {
          anims.splice(a, 1);
          an.then?.();
        }
      }
      // The selected piece lifts a little.
      const sel = props.current.selected;
      for (const [i, g] of at) {
        if (anims.some((an) => an.obj === g)) continue;
        const want = TOP + (i === sel ? 0.18 + Math.sin(now / 220) * 0.03 : 0);
        g.position.y += (want - g.position.y) * k * 1.5;
      }
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("wheel", wheel);
      api.current = null;
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh && !(o.parent && o.parent.userData.code)) o.geometry.dispose();
      });
      for (const d of disposables) d.dispose();
      renderer.dispose();
      cv.remove();
    };
  }, []);

  // A new position: animate the move.
  const boardKey = p.board.map((x) => x ?? ".").join(",");
  useEffect(() => {
    api.current?.sync(props.current.board, props.current.last);
  }, [boardKey]);
  useEffect(() => {
    api.current?.flip(p.flip);
  }, [p.flip]);
  // Highlights.
  const marksKey = `${[...p.pickable].join(".")}|${[...p.targets].join(".")}|${p.selected}|${p.danger}|${p.last.join(".")}|${boardKey}`;
  useEffect(() => {
    api.current?.marks(props.current);
  }, [marksKey]);

  if (failed) return <div className="grid h-full place-items-center p-6 text-center text-sm text-white/70">This phone couldn&apos;t start the 3D board.</div>;
  return <div ref={wrap} className="absolute inset-0" />;
}
