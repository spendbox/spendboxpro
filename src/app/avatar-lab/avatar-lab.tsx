"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getAvatarModel } from "@/lib/avatar3d/client";
import { type MaterialSet, makeMaterials } from "@/lib/avatar3d/materials";
import { triangleCount } from "@/lib/avatar3d/parts";
import { CATALOGS, DEFAULT_RECIPE, type Recipe, type RecipeKey, encodeRecipe, parseRecipe, randomRecipe } from "@/lib/avatar3d/recipe";
import { type AvatarObject, type FaceState, mountModel, updateFace } from "@/lib/avatar3d/scene";

// The parts built so far (head, face, hair, facial hair, headwear). Colour lists show as swatches.
const SECTIONS: [RecipeKey, string][] = [
  ["face", "Face shape"], ["chin", "Chin"], ["fat", "Fullness"], ["skin", "Skin"], ["eye", "Eyes"], ["eyeC", "Eye colour"],
  ["brow", "Brows"], ["hair", "Hair"], ["hairC", "Hair colour"], ["nose", "Nose"], ["lips", "Lips"], ["lipT", "Lip tint"], ["ear", "Earrings"],
  ["pierce", "Piercings"], ["glasses", "Glasses"], ["facial", "Facial hair"], ["hw", "Headwear"], ["hwC", "Headwear colour"],
  ["pattern", "Pattern (head tie, gele, headwrap)"], ["top", "Top colour (headwrap)"], ["frame", "Frame"], ["build", "Body type (neck)"],
];

const EXPRESSIONS: { n: string; v: Partial<FaceState>; talk?: boolean }[] = [
  { n: "Neutral", v: {} }, { n: "Smile", v: { smile: 0.75, lid: 0.12 } }, { n: "Big smile", v: { smile: 1, open: 0.3, wide: 0.15, lid: 0.22 } },
  { n: "Surprised", v: { open: 0.6, pucker: 0.3, brow: 1, lid: -0.3 } }, { n: "Pout", v: { pucker: 1, brow: -0.15 } },
  { n: "Frown", v: { smile: -0.6, brow: -0.5, lid: 0.1 } }, { n: "Talking", v: { smile: 0.15 }, talk: true },
];

export function AvatarLab({ initialRecipe, initialExpr }: { initialRecipe?: string; initialExpr: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [recipe, setRecipe] = useState<Recipe>(() =>
    initialRecipe ? parseRecipe(initialRecipe) : { ...DEFAULT_RECIPE, skin: 4, eyeC: 1, nose: 2, lips: 1, frame: 1 },
  );
  const [lod, setLod] = useState(1);
  const [expr, setExpr] = useState(Math.min(Math.max(0, initialExpr), EXPRESSIONS.length - 1));
  const [info, setInfo] = useState("Loading…");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const stage = useRef<{ scene: THREE.Scene; current?: { obj: AvatarObject; mats: MaterialSet } } | null>(null);
  const exprRef = useRef(expr);
  useEffect(() => {
    exprRef.current = expr;
  }, [expr]);

  // Renderer, lights and camera: set up once.
  useEffect(() => {
    const el = box.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      if (errorRef.current) errorRef.current.hidden = false;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    // Same light set-up as the reference studio (intensities x PI for three.js's physical light units).
    scene.add(new THREE.HemisphereLight(0xfff4ea, 0x3a2c26, 0.65 * Math.PI));
    const key = new THREE.DirectionalLight(0xfff1e2, 1.25 * Math.PI);
    key.position.set(4, 6, 8);
    const fill = new THREE.DirectionalLight(0xd8e6ff, 0.4 * Math.PI);
    fill.position.set(-6, 2, 4);
    const rim = new THREE.DirectionalLight(0xbfe3ff, 0.8 * Math.PI);
    rim.position.set(-2, 4, -8);
    scene.add(key, fill, rim);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 2.5;
    controls.maxDistance = 14;
    controls.target.set(0, -0.2, 0);
    camera.position.set(0, 0, 6.4);
    const params = new URLSearchParams(location.search);
    // ?yaw= and ?pitch= (radians) turn the camera, for screenshots from the side or below.
    const yaw = Number(params.get("yaw") || 0), pitch = Number(params.get("pitch") || 0);
    camera.position.set(6.4 * Math.sin(yaw) * Math.cos(pitch), 6.4 * Math.sin(pitch) - 0.2, 6.4 * Math.cos(yaw) * Math.cos(pitch));
    // ?bg=<colour> paints the background (a gap in the skin then shows in that colour).
    if (params.get("bg")) scene.background = new THREE.Color(params.get("bg")!);
    stage.current = { scene };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const still = params.has("still");
    let raf = 0, last = performance.now(), nextBlink = 1.5, blinkT = -1, nextLook = 1, gaze = { x: 0, y: 0 }, t = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;
      controls.update();
      const cur = stage.current?.current;
      if (cur && !still) {
        if (t > nextBlink && blinkT < 0) {
          blinkT = 0;
          nextBlink = t + 2.4 + Math.random() * 3.2;
        }
        let blink = 0;
        if (blinkT >= 0) {
          blinkT += dt;
          blink = Math.sin(Math.PI * Math.min(blinkT / 0.17, 1));
          if (blinkT > 0.17) blinkT = -1;
        }
        if (t > nextLook) {
          nextLook = t + 1 + Math.random() * 2.4;
          gaze = { x: (Math.random() - 0.5) * 0.1, y: (Math.random() - 0.5) * 0.24 };
        }
        const X = EXPRESSIONS[exprRef.current], target = { ...X.v };
        if (X.talk) {
          const w = Math.sin(t * 11) * Math.sin(t * 3.7);
          target.open = Math.max(0, Math.min(1, 0.12 + 0.32 * (0.5 + 0.5 * w)));
          target.pucker = 0.55 * Math.max(0, Math.sin(t * 2.3));
          target.wide = 0.45 * Math.max(0, Math.sin(t * 2.9 + 1));
        }
        updateFace(cur.obj, target, blink, gaze, X.talk ? dt * 2 : dt);
      } else if (cur) updateFace(cur.obj, EXPRESSIONS[exprRef.current].v, 0, { x: 0, y: 0 }, 1);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      stage.current = null;
    };
  }, []);

  // Rebuild whenever the recipe or detail level changes.
  useEffect(() => {
    let cancelled = false;
    const t0 = performance.now();
    getAvatarModel(recipe, lod).then((model) => {
      const s = stage.current;
      if (cancelled || !s) return;
      const mats = makeMaterials(recipe);
      const obj = mountModel(model, mats);
      // ?hide=name1,name2 hides parts by name (for checking what is drawn where).
      const hide = new URLSearchParams(location.search).get("hide")?.split(",") ?? [];
      // ?inside=1 paints the inside of surfaces bright green (shows skin that faces the wrong way).
      const inside = new URLSearchParams(location.search).has("inside");
      obj.root.traverse((o) => {
        if (hide.includes(o.name)) o.visible = false;
        if (inside && o instanceof THREE.Mesh && o.name === "headSkin") {
          const back = new THREE.Mesh(o.geometry, new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.BackSide }));
          o.add(back);
        }
      });
      if (s.current) {
        s.scene.remove(s.current.obj.root);
        s.current.mats.dispose();
      }
      s.current = { obj, mats };
      s.scene.add(obj.root);
      setInfo(`${Math.round(triangleCount(model)).toLocaleString()} triangles · ${Math.round(performance.now() - t0)} ms`);
      document.body.dataset.avatarReady = encodeRecipe(recipe) + "@" + lod;
    });
    return () => {
      cancelled = true;
    };
  }, [recipe, lod]);

  const set = (k: RecipeKey, i: number) => setRecipe((r) => ({ ...r, [k]: i }));

  return (
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 md:grid-cols-[1.3fr_1fr]">
      <section className="relative h-[60vh] overflow-hidden rounded-3xl bg-gradient-to-b from-slate-200 to-slate-400 md:sticky md:top-4 md:h-[85vh]">
        <div ref={box} className="h-full w-full touch-none" />
        <p ref={errorRef} hidden className="absolute inset-0 grid place-items-center p-6 text-center">
          This browser could not start 3D graphics.
        </p>
        <div className="absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 font-mono text-xs text-slate-700">{info}</div>
        <div className="absolute bottom-3 left-3 flex gap-2">
          <button type="button" className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => setRecipe(randomRecipe())}>
            Randomize
          </button>
          <button type="button" aria-pressed={lod < 1} className="rounded-full bg-white px-4 py-2 text-sm" onClick={() => setLod((l) => (l < 1 ? 1 : 0.5))}>
            {lod < 1 ? "Nearby detail (on)" : "Nearby detail"}
          </button>
        </div>
      </section>
      <section className="grid content-start gap-4">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Expression</h2>
          <div className="flex flex-wrap gap-2">
            {EXPRESSIONS.map((x, i) => (
              <button key={x.n} type="button" aria-pressed={i === expr} onClick={() => setExpr(i)}
                className={`rounded-xl border px-3 py-1.5 text-sm ${i === expr ? "border-teal-700 bg-teal-50" : "border-slate-300 bg-white"}`}>
                {x.n}
              </button>
            ))}
          </div>
        </div>
        {SECTIONS.map(([k, label]) => {
          const list = CATALOGS[k] as readonly { id: string; n: string; c?: string }[];
          return (
            <div key={k}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label} <span className="ml-1 normal-case tracking-normal text-slate-900">{list[recipe[k]].n}</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {list.map((o, i) =>
                  o.c ? (
                    <button key={o.id} type="button" title={o.n} aria-label={o.n} aria-pressed={i === recipe[k]} onClick={() => set(k, i)}
                      className={`h-9 w-9 rounded-full border-2 border-white ${i === recipe[k] ? "ring-2 ring-teal-700" : "ring-1 ring-slate-300"}`}
                      style={{ background: o.c }} />
                  ) : (
                    <button key={o.id} type="button" aria-pressed={i === recipe[k]} onClick={() => set(k, i)}
                      className={`rounded-xl border px-3 py-1.5 text-sm ${i === recipe[k] ? "border-teal-700 bg-teal-50" : "border-slate-300 bg-white"}`}>
                      {o.n}
                    </button>
                  ),
                )}
              </div>
            </div>
          );
        })}
        <p className="break-all font-mono text-xs text-slate-500">Recipe: {encodeRecipe(recipe)}</p>
      </section>
    </main>
  );
}
