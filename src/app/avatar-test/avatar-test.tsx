"use client";

import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { AvatarFace, AvatarFaceFeatures } from "@/components/avatar";
import { HAIR_COLOR, SKIN, defaultAvatar, type Avatar } from "@/lib/avatar";

// Test 3D avatars: pick one, watch it under soft light, and see the frames per second, how long
// the file took to load, how big it is and how detailed. The Knight can play its animations.
// "Our face" is the Knight without his helmet and cape, wearing a player's face from the game:
// their skin colour, their 2D face drawing on the front of his head, and their hair colour
// (with a few simple 3D shapes for hair styles his own short hair can't do).

const AVATARS = [
  { key: "face", label: "Our face", file: "/test-assets/knight-slim.glb", spin: false, ourFace: true },
  { key: "knight", label: "Knight", file: "/test-assets/knight-slim.glb", spin: false, ourFace: false },
  { key: "placeholder", label: "Placeholder", file: "/test-assets/avatar-placeholder.glb", spin: true, ourFace: false },
] as const;
type AvatarKey = (typeof AVATARS)[number]["key"];

type Info = { ms: number; kb: number; triangles: number };

/** Darken (or lighten, with a negative amount) a #rrggbb colour. */
function shade(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(1 - amount).getStyle();
}

/** The face drawing (no hair, no background) as an image, cropped to the face. */
function faceCanvas(a: Avatar): Promise<HTMLCanvasElement> {
  const svg = renderToStaticMarkup(<AvatarFaceFeatures avatar={a} size={480} />);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // The face sits in x 34-86, y 30-86 of the 120 x 120 drawing.
      const k = 480 / 120;
      const c = document.createElement("canvas");
      c.width = 52 * 6;
      c.height = 56 * 6;
      c.getContext("2d")!.drawImage(img, 34 * k, 30 * k, 52 * k, 56 * k, 0, 0, c.width, c.height);
      resolve(c);
    };
    img.onerror = () => reject(new Error("Couldn't draw the face."));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export function AvatarTest() {
  const box = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<AvatarKey>("face");
  const [fps, setFps] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<string[]>([]);
  const [clip, setClip] = useState<string | null>(null);
  const [face, setFace] = useState<Avatar>(() => defaultAvatar("Newtown"));
  // The running scene hands back ways to switch animation and to put on a face.
  const play = useRef<(name: string) => void>(() => {});
  const wearFace = useRef<((a: Avatar) => void) | null>(null);
  const faceNow = useRef(face);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const avatarInfo = AVATARS.find((a) => a.key === pick)!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe9f3);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 1.2, 4.2);
    camera.lookAt(0, 0.95, 0);
    // Soft light: sky and ground fill, plus one warm key light.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1dd, 2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshStandardMaterial({ color: 0xc8d6e5, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    let avatar: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let current: THREE.AnimationAction | null = null;
    let live = true;
    const started = performance.now();
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    fetch(avatarInfo.file)
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load ${avatarInfo.file} (${r.status})`);
        return r.arrayBuffer();
      })
      .then((data) => loader.parseAsync(data, "").then((gltf) => ({ gltf, bytes: data.byteLength })))
      .then(({ gltf, bytes }) => {
        if (!live) return;
        avatar = gltf.scene;
        // Stand it on the floor, about 1.9 tall, whatever size it was made at.
        const size = new THREE.Box3().setFromObject(avatar);
        avatar.scale.setScalar(1.9 / Math.max(size.max.y - size.min.y, 0.01));
        const fitted = new THREE.Box3().setFromObject(avatar);
        avatar.position.y -= fitted.min.y;
        scene.add(avatar);
        let triangles = 0;
        avatar.traverse((o) => {
          const g = (o as THREE.Mesh).geometry;
          if (g) triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
        });
        setInfo({ ms: Math.round(performance.now() - started), kb: Math.round(bytes / 1024), triangles });
        if (avatarInfo.ourFace) {
          wearFace.current = setUpFace(avatar);
          wearFace.current(faceNow.current);
        }
        // Animations: start on Idle (or the first one), and blend smoothly between them.
        if (gltf.animations.length) {
          const m = new THREE.AnimationMixer(avatar);
          mixer = m;
          play.current = (name) => {
            const next = THREE.AnimationClip.findByName(gltf.animations, name);
            if (!next) return;
            const action = m.clipAction(next).reset().play();
            if (current && current !== action) current.crossFadeTo(action, 0.3, false);
            current = action;
            setClip(name);
          };
          const names = gltf.animations.map((a) => a.name).sort((a, b) => (a === "Idle" ? -1 : b === "Idle" ? 1 : a.localeCompare(b)));
          setClips(names);
          play.current(names[0]);
        }
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load the avatar."));

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // Count frames and show the rate twice a second.
    let frames = 0;
    let since = performance.now();
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      mixer?.update(dt);
      if (avatar) avatar.rotation.y = avatarInfo.spin ? now / 2000 : Math.sin(now / 3000) * 0.6;
      renderer.render(scene, camera);
      frames++;
      if (now - since >= 500) {
        setFps(Math.round((frames * 1000) / (now - since)));
        frames = 0;
        since = now;
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      live = false;
      play.current = () => {};
      wearFace.current = null;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      mixer?.stopAllAction();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => {
          (x as THREE.MeshStandardMaterial).map?.dispose();
          x.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [pick]);

  // A new face goes straight onto the avatar that's showing.
  useEffect(() => {
    faceNow.current = face;
    wearFace.current?.(face);
  }, [face]);

  function choose(key: AvatarKey) {
    if (key === pick) return;
    setInfo(null);
    setError(null);
    setClips([]);
    setClip(null);
    setPick(key);
  }

  return (
    <main className="fixed inset-0 bg-[#dfe9f3]">
      <div ref={box} className="absolute inset-0" />
      <div className="absolute left-3 top-3 rounded-xl bg-ink/80 px-3 py-2 font-mono text-sm text-white tabular-nums">
        <p className="text-lg font-bold">{fps} FPS</p>
        {info && (
          <p className="text-xs text-white/80">
            Loaded in {info.ms} ms · {info.kb} KB · {info.triangles.toLocaleString()} triangles
          </p>
        )}
        {!info && !error && <p className="text-xs text-white/80">Loading avatar…</p>}
        {error && <p className="text-xs text-[#ffa8a8]">{error}</p>}
      </div>
      <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)]">
        {clips.length > 0 && (
          <div className="flex max-w-full flex-wrap justify-center gap-1.5">
            {clips.map((name) => (
              <button
                key={name}
                onClick={() => play.current(name)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow ${clip === name ? "bg-ink text-white" : "bg-white/90 text-ink"}`}
              >
                {name.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}
        {pick === "face" && (
          <div className="flex items-center gap-2 rounded-full bg-white/90 p-1 pr-1.5 shadow">
            <AvatarFace avatar={face} size={36} className="rounded-full" />
            <span className="text-xs font-semibold text-muted">The same face in 2D</span>
            <button
              onClick={() => setFace(defaultAvatar(`face-${Math.random()}`))}
              className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white"
            >
              New face
            </button>
          </div>
        )}
        <div className="flex gap-1 rounded-full bg-white/90 p-1 shadow">
          {AVATARS.map((a) => (
            <button
              key={a.key}
              onClick={() => choose(a.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${pick === a.key ? "bg-ink text-white" : "text-ink"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

/**
 * Take the Knight's helmet and cape off and get him ready to wear our faces. Returns a function
 * that puts a face on: skin and hair colour on his head, the face drawing on the front of it,
 * and an extra hair shape for styles his own short hair doesn't cover.
 */
function setUpFace(avatar: THREE.Object3D) {
  for (const name of ["Knight_Helmet", "Knight_Cape"]) {
    const o = avatar.getObjectByName(name);
    if (o) o.visible = false;
  }
  const head = avatar.getObjectByName("Knight_Head") as THREE.SkinnedMesh | undefined;
  const bone = avatar.getObjectByName("head");
  if (!head || !bone) return () => {};
  let extras: THREE.Object3D[] = [];

  // His head gets its own copy of the colour palette, so we can repaint skin and hair.
  const base = head.material as THREE.MeshStandardMaterial;
  const palette = base.map?.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = palette?.width || 1024;
  canvas.height = palette?.height || 1024;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const mat = base.clone();
  mat.map = tex;
  head.material = mat;
  // The palette is 8 x 4 squares: skin is square (0, 0), his hair (1, 0) and his eyes (2, 0).
  const cell = (col: number, row: number, from: string, to: string) => {
    const w = canvas.width / 8;
    const h = canvas.height / 4;
    const g = ctx.createLinearGradient(0, row * h, 0, (row + 1) * h);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    ctx.fillStyle = g;
    ctx.fillRect(col * w, row * h, w, h);
  };

  // Hair and face are placed in the head's own coordinates, then fixed to the head bone using
  // where that bone sits in his starting pose (worked out now, before any animation moves it).
  avatar.updateMatrixWorld(true);
  const toBone = head.matrixWorld.clone().invert().multiply(bone.matrixWorld).invert();
  const pin = (o: THREE.Object3D) => {
    o.applyMatrix4(toBone);
    bone.add(o);
    extras.push(o);
  };
  // The head's shape in that pose, unpacked (the file stores it compressed), to cut the face from.
  const restGeo = new THREE.BufferGeometry();
  {
    const src = head.geometry.attributes.position;
    const out = new Float32Array(src.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < src.count; i++) {
      head.applyBoneTransform(i, v.fromBufferAttribute(src, i)).toArray(out, i * 3);
    }
    restGeo.setAttribute("position", new THREE.BufferAttribute(out, 3));
    if (head.geometry.index) restGeo.setIndex(head.geometry.index.clone());
    restGeo.computeVertexNormals();
  }
  const restHead = new THREE.Mesh(restGeo);
  restHead.updateMatrixWorld(true);
  // His own eyebrows are hair-coloured bumps above the eyes: move them onto the skin colour,
  // so only the drawn brows show. (Hair-coloured, on the front, below the fringe.)
  {
    const uv = head.geometry.attributes.uv;
    const pos = restGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      if (Math.floor(u * 8) === 1 && pos.getZ(i) > 0.25 && pos.getY(i) < 1.85) uv.setX(i, u - 1 / 8);
    }
    uv.needsUpdate = true;
  }
  let ask = 0;

  return (a: Avatar) => {
    const skin = SKIN[a.skin] ?? SKIN[0];
    const hair = HAIR_COLOR[a.hairColor] ?? HAIR_COLOR[0];
    const noTopHair = a.hair === 9 || a.hair === 7; // bald, mohawk
    if (palette) ctx.drawImage(palette, 0, 0, canvas.width, canvas.height);
    cell(0, 0, shade(skin, -0.06), shade(skin, 0.12));
    cell(2, 0, shade(skin, -0.06), shade(skin, 0.12)); // his own eyes disappear into the skin
    cell(1, 0, noTopHair ? shade(skin, -0.06) : shade(hair, -0.1), noTopHair ? shade(skin, 0.12) : shade(hair, 0.2));
    tex.needsUpdate = true;

    for (const o of extras) {
      o.removeFromParent();
      o.traverse((x) => {
        const m = x as THREE.Mesh;
        m.geometry?.dispose();
        const mm = m.material as THREE.MeshStandardMaterial | undefined;
        mm?.map?.dispose();
        mm?.dispose();
      });
    }
    extras = [];

    // Extra hair, in the head's own coordinates, then fixed to the head bone so it moves with it.
    const hairMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.85 });
    const blob = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), hairMat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      return m;
    };
    const style = new THREE.Group();
    if (a.hair === 3) style.add(blob(0, 2.05, -0.08, 0.68, 0.6, 0.66)); // afro
    if (a.hair === 4) style.add(blob(0, 1.45, -0.36, 0.5, 0.62, 0.22)); // long
    if (a.hair === 5) style.add(blob(0, 2.33, -0.3, 0.2, 0.2, 0.2)); // bun
    if (a.hair === 7) style.add(blob(0, 2.3, -0.02, 0.1, 0.3, 0.5)); // mohawk
    if (a.hair === 11) style.add(blob(-0.47, 1.6, -0.05, 0.13, 0.36, 0.42), blob(0.47, 1.6, -0.05, 0.13, 0.36, 0.42), blob(0, 1.6, -0.32, 0.45, 0.36, 0.18)); // bob
    if (a.hair === 6 || a.hair === 10) {
      // braids, locs: strands hanging down the back
      for (let k = 0; k < 7; k++) {
        const t = (k - 3) / 3;
        const strand = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.6, 4, 8), hairMat);
        strand.position.set(t * 0.36, 1.45, -0.36 - (1 - Math.abs(t)) * 0.08);
        strand.rotation.x = 0.15;
        style.add(strand);
      }
    }
    if (style.children.length) pin(style);
    else hairMat.dispose();

    // The face drawing, wrapped onto the front of his head.
    const mine = ++ask;
    faceCanvas(a)
      .then((c) => {
        if (mine !== ask) return;
        const faceTex = new THREE.CanvasTexture(c);
        faceTex.colorSpace = THREE.SRGBColorSpace;
        faceTex.anisotropy = 4;
        // Cut from the unpacked head shape, so it comes out in head coordinates already.
        const geo = new DecalGeometry(restHead, new THREE.Vector3(0, 1.53, 0.55), new THREE.Euler(0, 0, 0), new THREE.Vector3(0.95, 1.02, 0.8));
        const decal = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.8 }),
        );
        pin(decal);
      })
      .catch(() => {});
  };
}
