"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// One placeholder avatar (public/test-assets/avatar-placeholder.glb) turning slowly under soft
// light, with a frames-per-second counter, how long the file took to load and how big it is.

const FILE = "/test-assets/avatar-placeholder.glb";

type Info = { ms: number; kb: number; triangles: number };

export function AvatarTest() {
  const box = useRef<HTMLDivElement>(null);
  const [fps, setFps] = useState(0);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
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
    let live = true;
    const started = performance.now();
    fetch(FILE)
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't load ${FILE} (${r.status})`);
        return r.arrayBuffer();
      })
      .then((data) => new GLTFLoader().parseAsync(data, "").then((gltf) => ({ gltf, bytes: data.byteLength })))
      .then(({ gltf, bytes }) => {
        if (!live) return;
        avatar = gltf.scene;
        scene.add(avatar);
        let triangles = 0;
        avatar.traverse((o) => {
          const g = (o as THREE.Mesh).geometry;
          if (g) triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
        });
        setInfo({ ms: Math.round(performance.now() - started), kb: Math.round(bytes / 1024), triangles });
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
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (avatar) avatar.rotation.y = now / 2000;
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
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

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
    </main>
  );
}
