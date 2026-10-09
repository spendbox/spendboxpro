"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

// Test 3D avatars: pick one, watch it under soft light, and see the frames per second, how long
// the file took to load, how big it is and how detailed. The Knight can play its animations.

const AVATARS = [
  { key: "knight", label: "Knight", file: "/test-assets/knight-slim.glb", spin: false },
  { key: "placeholder", label: "Placeholder", file: "/test-assets/avatar-placeholder.glb", spin: true },
] as const;
type AvatarKey = (typeof AVATARS)[number]["key"];

type Info = { ms: number; kb: number; triangles: number };

export function AvatarTest() {
  const box = useRef<HTMLDivElement>(null);
  const [pick, setPick] = useState<AvatarKey>("knight");
  const [fps, setFps] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<string[]>([]);
  const [clip, setClip] = useState<string | null>(null);
  // The running scene hands back a way to switch animation.
  const play = useRef<(name: string) => void>(() => {});

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
