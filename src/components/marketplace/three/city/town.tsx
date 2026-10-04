"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { box, cylinder, hash, merge } from "../geometry";
import { useDispose } from "../hooks";
import { roadTexture } from "../textures";
import { BD, BW, PLOT, PLOT_D, ROAD, type RoadLine, type TownPlan } from "./layout";

// The town around the shops: grass, roads, pavements, parks, trees, street
// lamps and a few cars. Repeated things (trees, lamps) are instanced, and
// still things are merged, so it stays light however big the town gets.

export function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.05}>
      <planeGeometry args={[800, 800]} />
      <meshLambertMaterial color="#9ccc86" />
    </mesh>
  );
}

function Road({ line }: { line: RoadLine }) {
  const length = line.max - line.min;
  const texture = useMemo(() => {
    const t = roadTexture();
    t.repeat.set(length / ROAD, 1);
    return t;
  }, [length]);
  useDispose(texture);
  const middle = (line.min + line.max) / 2;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, line.axis === "z" ? Math.PI / 2 : 0]}
      position={line.axis === "x" ? [middle, 0.01, line.at] : [line.at, 0.012, middle]}
    >
      <planeGeometry args={[length, ROAD]} />
      <meshLambertMaterial map={texture} />
    </mesh>
  );
}

export function Roads({ plan }: { plan: TownPlan }) {
  // Plain squares where roads cross, so the dashes don't overlap.
  const crossings = useMemo(
    () =>
      merge(
        plan.crossings.map(([x, z]) => {
          const g = new THREE.PlaneGeometry(ROAD, ROAD).toNonIndexed();
          g.rotateX(-Math.PI / 2);
          g.translate(x, 0.015, z);
          return g;
        }),
      ),
    [plan],
  );
  useDispose(crossings);
  return (
    <>
      {plan.roads.map((line) => (
        <Road key={`${line.axis}${line.at}`} line={line} />
      ))}
      <mesh geometry={crossings}>
        <meshLambertMaterial color="#4b5150" />
      </mesh>
    </>
  );
}

/** Pavements, the gardens behind the shops, and parks on empty plots. */
export function Blocks({ plan }: { plan: TownPlan }) {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const [bx, bz] of plan.blocks) {
      const cx = bx * (BW + ROAD);
      const cz = bz * (BD + ROAD);
      parts.push(box(BW, 0.18, BD, cx, 0.09, cz, "#d9d6cd"));
      parts.push(box(BW - 0.6, 0.06, BD - PLOT_D - 0.4, cx, 0.2, cz - BD / 2 + (BD - PLOT_D) / 2, "#8fc779"));
    }
    plan.parks.forEach(([x, z], i) => {
      parts.push(box(PLOT - 0.6, 0.1, PLOT_D - 0.6, x, 0.23, z, "#8fc779"));
      if (i % 3 === 0) {
        parts.push(cylinder(1.4, 1.5, 0.45, x, 0.5, z, "#e8e3d8"), cylinder(1.2, 1.2, 0.05, x, 0.74, z, "#7cc6e6"), cylinder(0.15, 0.25, 1.1, x, 1.1, z, "#e8e3d8", 8));
      } else {
        parts.push(box(1.6, 0.12, 0.5, x, 0.62, z + 1.6, "#a0683f"), box(1.6, 0.4, 0.12, x, 0.85, z + 1.85, "#a0683f"));
      }
    });
    return merge(parts);
  }, [plan]);
  useDispose(geometry);
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

const GREENS = ["#4f9b4a", "#5fae55", "#3f8a3f", "#76b85e"].map((c) => new THREE.Color(c));

export function Trees({ plan }: { plan: TownPlan }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    plan.trees.forEach((t, i) => {
      const s = new THREE.Vector3(t.scale, t.scale, t.scale);
      trunks.current!.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, 0.6 * t.scale, t.z), new THREE.Quaternion(), s));
      leaves.current!.setMatrixAt(
        i,
        m.compose(new THREE.Vector3(t.x, 1.7 * t.scale, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, t.seed * 6, 0)), new THREE.Vector3(t.scale, t.scale * 1.1, t.scale)),
      );
      leaves.current!.setColorAt(i, GREENS[Math.floor(t.seed * GREENS.length) % GREENS.length]!);
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    leaves.current!.instanceMatrix.needsUpdate = true;
    if (leaves.current!.instanceColor) leaves.current!.instanceColor.needsUpdate = true;
  }, [plan]);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, plan.trees.length]}>
        <cylinderGeometry args={[0.16, 0.22, 1.2, 6]} />
        <meshLambertMaterial color="#8a5a36" />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, plan.trees.length]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshLambertMaterial color="#ffffff" flatShading />
      </instancedMesh>
    </>
  );
}

export function Lamps({ plan }: { plan: TownPlan }) {
  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    plan.lamps.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.18, z);
      poles.current!.setMatrixAt(i, m);
      heads.current!.setMatrixAt(i, m);
    });
    poles.current!.instanceMatrix.needsUpdate = true;
    heads.current!.instanceMatrix.needsUpdate = true;
  }, [plan]);
  const pole = useMemo(() => new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6).translate(0, 1.3, 0), []);
  useDispose(pole);
  const head = useMemo(() => new THREE.SphereGeometry(0.22, 8, 6).translate(0, 2.7, 0), []);
  useDispose(head);
  return (
    <>
      <instancedMesh ref={poles} args={[pole, undefined, plan.lamps.length]}>
        <meshLambertMaterial color="#34403a" />
      </instancedMesh>
      <instancedMesh ref={heads} args={[head, undefined, plan.lamps.length]}>
        <meshBasicMaterial color="#fff3c4" />
      </instancedMesh>
    </>
  );
}

const CAR_COLORS = ["#e4572e", "#2a77b5", "#f2c14e", "#ffffff", "#2a772c", "#8e5bd8"];

function Car({ line, index, moving }: { line: RoadLine; index: number; moving: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const color = CAR_COLORS[index % CAR_COLORS.length]!;
  const geometry = useMemo(
    () =>
      merge([
        box(1.5, 0.45, 0.8, 0, 0.42, 0, color),
        box(0.8, 0.4, 0.72, -0.1, 0.85, 0, "#dff1fa"),
        box(0.3, 0.3, 0.86, -0.55, 0.22, 0, "#222222"),
        box(0.3, 0.3, 0.86, 0.5, 0.22, 0, "#222222"),
      ]),
    [color],
  );
  useDispose(geometry);
  const dir = index % 2 ? 1 : -1;
  const lane = line.at + dir * 0.8;
  const speed = 3 + (index % 4) * 0.8;
  const start = line.min + ((index * 13.7) % (line.max - line.min));
  useFrame((_, dt) => {
    if (!moving || !ref.current) return;
    const p = ref.current.position;
    const key = line.axis === "x" ? "x" : "z";
    p[key] += dir * speed * dt;
    if (p[key] > line.max) p[key] = line.min;
    if (p[key] < line.min) p[key] = line.max;
  });
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      position={line.axis === "x" ? [start, 0, lane] : [lane, 0, start]}
      rotation-y={line.axis === "x" ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? -Math.PI / 2 : Math.PI / 2}
    >
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

export function Cars({ plan, moving }: { plan: TownPlan; moving: boolean }) {
  const cars = useMemo(() => {
    const count = Math.min(10, Math.max(3, plan.roads.length));
    return Array.from({ length: count }, (_, i) => ({ line: plan.roads[(i * 7) % plan.roads.length]!, i }));
  }, [plan]);
  return (
    <>
      {cars.map(({ line, i }) => (
        <Car key={i} line={line} index={i} moving={moving} />
      ))}
    </>
  );
}

export { hash };
