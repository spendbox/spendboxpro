"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { HAIR_COLOR, SKIN, TOP_COLOR } from "@/lib/avatar";
import { EYE_COLORS, HAIRS, loadPeople, type Look, type PeopleKit } from "./people";

// Test 3D avatars: pick one, watch it under soft light, and see the frames per second, how long
// it took to load, how much was downloaded and how detailed it is.
// - People: male and female bodies you can dress up (skin, hair, hair colour, beard, eyes), with
//   animations, and a crowd test (10 or 25 people at once).
// - Knight: the slimmed-down KayKit Knight and his animations.
// - Placeholder: a simple figure made for this page.

const AVATARS = [
  { key: "people", label: "People" },
  { key: "knight", label: "Knight", file: "/test-assets/knight-slim.glb" },
  { key: "placeholder", label: "Placeholder", file: "/test-assets/avatar-placeholder.glb" },
] as const;
type AvatarKey = (typeof AVATARS)[number]["key"];
const CROWDS = [1, 10, 25];

type Info = { ms: number; kb: number; triangles: number };

const START_LOOK: Look = { body: "female", skin: SKIN[4], hair: "long", hairColor: HAIR_COLOR[0], beard: false, eyes: EYE_COLORS[0], clothes: TOP_COLOR[0] };

/** Count the triangles in everything under an object. */
function triangles(root: THREE.Object3D) {
  let n = 0;
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (g && (o as THREE.Mesh).visible) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

/** Stand a model on the floor, about 1.9 tall, whatever size it was made at. Measured as it
 * stands (skeleton applied): some bodies are stored lying down and only stand up once posed. */
function fit(o: THREE.Object3D) {
  const measure = () => {
    o.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(o, true);
  };
  const size = measure();
  o.scale.setScalar(1.9 / Math.max(size.max.y - size.min.y, 0.01));
  o.position.y -= measure().min.y;
}

export function AvatarTest() {
  const box = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<AvatarKey>("people");
  const [fps, setFps] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<string[]>([]);
  const [clip, setClip] = useState<string | null>(null);
  const [look, setLook] = useState<Look>(START_LOOK);
  const [crowd, setCrowd] = useState(1);
  // The running scene hands back ways to switch animation and to change the people.
  const play = useRef<(name: string) => void>(() => {});
  const restyle = useRef<((look: Look, crowd: number) => void) | null>(null);
  const wanted = useRef({ look, crowd });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const choice = AVATARS.find((a) => a.key === pick)!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe9f3);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
    const frame = (many: boolean) => {
      camera.position.set(0, many ? 3.2 : 1.2, many ? 12 : 4.2);
      camera.lookAt(0, many ? 1.2 : 0.95, many ? -1.5 : 0);
    };
    frame(false);
    // Soft light: sky and ground fill, plus one warm key light.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1dd, 2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.MeshStandardMaterial({ color: 0xc8d6e5, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Everything showing, each with its own animation player.
    let shown: { root: THREE.Object3D; mixer: THREE.AnimationMixer | null; action: THREE.AnimationAction | null }[] = [];
    let clipList: THREE.AnimationClip[] = [];
    let current: string | null = null;
    let spin = false;
    let live = true;
    const started = performance.now();

    play.current = (name) => {
      const next = THREE.AnimationClip.findByName(clipList, name);
      if (!next) return;
      current = name;
      setClip(name);
      shown.forEach((s, k) => {
        if (!s.mixer) return;
        const action = s.mixer.clipAction(next).reset().play();
        // A crowd doesn't move in step: each starts at a different point.
        action.time = (k * 0.37) % Math.max(next.duration, 0.01);
        if (s.action && s.action !== action) s.action.crossFadeTo(action, 0.3, false);
        s.action = action;
      });
    };
    const clear = () => {
      for (const s of shown) {
        s.mixer?.stopAllAction();
        s.root.removeFromParent();
        s.root.traverse((o) => {
          const m = o as THREE.Mesh;
          (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => {
            const mat = x as THREE.MeshStandardMaterial;
            if (mat.map instanceof THREE.CanvasTexture) mat.map.dispose();
            mat.dispose();
          });
        });
      }
      shown = [];
    };
    const show = (roots: THREE.Object3D[]) => {
      clear();
      const many = roots.length > 1;
      roots.forEach((root, k) => {
        fit(root);
        if (many) {
          const cols = 5;
          root.position.x = ((k % cols) - (cols - 1) / 2) * 1.3;
          root.position.z = -Math.floor(k / cols) * 1.5;
        }
        scene.add(root);
        shown.push({ root, mixer: clipList.length ? new THREE.AnimationMixer(root) : null, action: null });
      });
      floor.scale.setScalar(many ? 6 : 1);
      frame(many);
      if (current) play.current(current);
    };
    const report = (kb: number, from: number) => setInfo({ ms: Math.round(performance.now() - from), kb: Math.round(kb / 1024), triangles: shown.reduce((n, s) => n + triangles(s.root), 0) });

    if (choice.key === "people") {
      let kit: PeopleKit | null = null;
      let ask = 0;
      let first = true;
      restyle.current = (l, n) => {
        if (!kit) return;
        const mine = ++ask;
        const k = kit;
        const from = performance.now();
        Promise.all(
          Array.from({ length: n }, (_, i) =>
            // In a crowd, everyone after the first gets a random look.
            k.build(i === 0 ? l : {
              body: Math.random() < 0.5 ? "male" : "female",
              skin: SKIN[Math.floor(Math.random() * SKIN.length)],
              hair: HAIRS[Math.floor(Math.random() * HAIRS.length)].key,
              hairColor: HAIR_COLOR[Math.floor(Math.random() * 6)],
              beard: Math.random() < 0.25,
              eyes: EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)],
              clothes: TOP_COLOR[Math.floor(Math.random() * TOP_COLOR.length)],
            }),
          ),
        )
          .then((roots) => {
            if (!live || mine !== ask) return;
            show(roots);
            report(k.bytes, first ? started : from);
            first = false;
          })
          .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't build the people."));
      };
      loadPeople(() => {})
        .then((k) => {
          if (!live) return;
          kit = k;
          clipList = k.clips;
          const names = k.clips.map((c) => c.name).sort((a, b) => (a === "Idle_Loop" ? -1 : b === "Idle_Loop" ? 1 : a.localeCompare(b)));
          setClips(names);
          current = names[0] ?? null;
          setClip(current);
          restyle.current?.(wanted.current.look, wanted.current.crowd);
        })
        .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load the people."));
    } else {
      spin = choice.key === "placeholder";
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      fetch(choice.file)
        .then((r) => {
          if (!r.ok) throw new Error(`Couldn't load ${choice.file} (${r.status})`);
          return r.arrayBuffer();
        })
        .then((data) => loader.parseAsync(data, "").then((gltf) => ({ gltf, bytes: data.byteLength })))
        .then(({ gltf, bytes }) => {
          if (!live) return;
          clipList = gltf.animations;
          const names = gltf.animations.map((a) => a.name).sort((a, b) => (a === "Idle" ? -1 : b === "Idle" ? 1 : a.localeCompare(b)));
          setClips(names);
          current = names[0] ?? null;
          show([gltf.scene]);
          report(bytes, started);
        })
        .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load the avatar."));
    }

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
      for (const s of shown) {
        s.mixer?.update(dt);
        if (shown.length === 1) s.root.rotation.y = spin ? now / 2000 : Math.sin(now / 3000) * 0.6;
      }
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
      restyle.current = null;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      clear();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [pick]);

  // A new look or crowd size goes straight onto the people showing.
  useEffect(() => {
    wanted.current = { look, crowd };
    restyle.current?.(look, crowd);
  }, [look, crowd]);

  function choose(key: AvatarKey) {
    if (key === pick) return;
    setInfo(null);
    setError(null);
    setClips([]);
    setClip(null);
    setPick(key);
  }
  const set = (patch: Partial<Look>) => setLook((l) => ({ ...l, ...patch }));
  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-xs font-semibold ${on ? "bg-ink text-white" : "bg-white/90 text-ink"}`;
  const swatch = (on: boolean) => `size-6 shrink-0 rounded-full ring-2 ${on ? "ring-ink" : "ring-white"}`;

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
        {!info && !error && <p className="text-xs text-white/80">Loading…</p>}
        {error && <p className="text-xs text-[#ffa8a8]">{error}</p>}
      </div>
      <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)]">
        {pick === "people" && (
          <div className="flex w-full max-w-md flex-col gap-1.5 rounded-2xl bg-white/80 p-2 shadow backdrop-blur">
            <div className="flex flex-wrap items-center gap-1.5">
              {(["female", "male"] as const).map((b) => (
                <button key={b} onClick={() => set({ body: b })} className={chip(look.body === b)}>
                  {b === "female" ? "Female" : "Male"}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-ink/20" />
              <button onClick={() => set({ beard: !look.beard })} className={chip(look.beard)}>
                Beard
              </button>
              <span className="mx-1 h-4 w-px bg-ink/20" />
              {CROWDS.map((n) => (
                <button key={n} onClick={() => setCrowd(n)} className={chip(crowd === n)}>
                  {n === 1 ? "1 person" : `${n} people`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-12 text-[11px] font-semibold text-muted">Hair</span>
              {HAIRS.map((h) => (
                <button key={h.key} onClick={() => set({ hair: h.key })} className={chip(look.hair === h.key)}>
                  {h.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="w-12 shrink-0 text-[11px] font-semibold text-muted">Skin</span>
              {SKIN.map((c) => (
                <button key={c} onClick={() => set({ skin: c })} className={swatch(look.skin === c)} style={{ background: c }} aria-label={`Skin ${c}`} />
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="w-12 shrink-0 text-[11px] font-semibold text-muted">Colour</span>
              {HAIR_COLOR.map((c) => (
                <button key={c} onClick={() => set({ hairColor: c })} className={swatch(look.hairColor === c)} style={{ background: c }} aria-label={`Hair colour ${c}`} />
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="w-12 shrink-0 text-[11px] font-semibold text-muted">Clothes</span>
              {TOP_COLOR.map((c) => (
                <button key={c} onClick={() => set({ clothes: c })} className={swatch(look.clothes === c)} style={{ background: c }} aria-label={`Clothes ${c}`} />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-12 shrink-0 text-[11px] font-semibold text-muted">Eyes</span>
              {EYE_COLORS.map((c) => (
                <button key={c} onClick={() => set({ eyes: c })} className={swatch(look.eyes === c)} style={{ background: c }} aria-label={`Eyes ${c}`} />
              ))}
            </div>
          </div>
        )}
        {clips.length > 0 && (
          <div className="flex max-w-full flex-wrap justify-center gap-1.5">
            {clips.map((name) => (
              <button key={name} onClick={() => play.current(name)} className={`${chip(clip === name)} shadow`}>
                {name.replace(/_Loop$/, "").replace(/_/g, " ")}
              </button>
            ))}
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
