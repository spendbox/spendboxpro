"use client";

import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useDispose } from "../../hooks";
import { shade } from "../../textures";
import { SHOWROOM, type CarSpot, type HallItem } from "../hall";
import { Built, Kit } from "../kit";
import { softShadow } from "../surfaces";
import { tap } from "../tap";
import { useCar, type CarGeometry } from "./car-model";
import type { CarMaterialSpec } from "./coupe";
import { usePaints } from "./car-paint";

// A showroom section: each car on a low round platform with a brass edge and
// a soft glow beneath it, painted like the car in its photo. Every car is
// drawn from the one shared car (one draw per part for the whole fleet), and
// small fleets get the full-detail car, bigger ones a lighter one. Tapping a
// car goes to it, like tapping a frame.

const PLATFORM_TOP = SHOWROOM.height + 0.005;

function material(name: string, spec: CarMaterialSpec) {
  const base = {
    // Paint is white here: each car's own colour multiplies it.
    color: name === "paint" ? 0xffffff : spec.color,
    metalness: spec.metal,
    roughness: spec.rough,
    side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  };
  if (spec.clearcoat) return new THREE.MeshPhysicalMaterial({ ...base, clearcoat: spec.clearcoat, clearcoatRoughness: spec.clearcoatRough ?? 0.05 });
  if (spec.emissive) return new THREE.MeshStandardMaterial({ ...base, emissive: spec.emissive, emissiveIntensity: spec.emissiveStrength ?? 1 });
  return new THREE.MeshStandardMaterial(base);
}

/** The whole fleet as instanced meshes: the body once per car, the wheel four times per car. */
function buildFleet(car: CarGeometry, cars: CarSpot[]) {
  const group = new THREE.Group();
  const mats = new Map<string, THREE.Material>();
  const matOf = (name: string) => {
    let m = mats.get(name);
    if (!m) {
      m = material(name, car.materials[name]!);
      mats.set(name, m);
    }
    return m;
  };
  const carMatrix = (c: CarSpot) => new THREE.Matrix4().compose(new THREE.Vector3(c.x, PLATFORM_TOP, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotY), new THREE.Vector3(1, 1, 1));
  const wheels = car.nodes.filter((n) => n.mesh === "wheel").map((n) => new THREE.Matrix4().compose(new THREE.Vector3(...n.t), new THREE.Quaternion(...n.r), new THREE.Vector3(1, 1, 1)));
  let paint: THREE.InstancedMesh | null = null;
  const m = new THREE.Matrix4();
  for (const part of car.parts.body) {
    const mesh = new THREE.InstancedMesh(part.geometry, matOf(part.material), cars.length);
    cars.forEach((c, i) => mesh.setMatrixAt(i, carMatrix(c)));
    if (part.material === "paint") {
      cars.forEach((_, i) => mesh.setColorAt(i, new THREE.Color("#8f0b12")));
      paint = mesh;
    }
    group.add(mesh);
  }
  for (const part of car.parts.wheel) {
    const mesh = new THREE.InstancedMesh(part.geometry, matOf(part.material), cars.length * wheels.length);
    cars.forEach((c, i) => {
      const cm = carMatrix(c);
      wheels.forEach((w, j) => mesh.setMatrixAt(i * wheels.length + j, m.multiplyMatrices(cm, w)));
    });
    group.add(mesh);
  }
  group.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) {
      o.instanceMatrix.needsUpdate = true;
      // The fleet spans the hall; and taps go to the simple boxes below, not the detailed car.
      o.frustumCulled = false;
      o.raycast = () => undefined;
    }
  });
  return { group, paint: paint as THREE.InstancedMesh | null, dispose: () => mats.forEach((x) => x.dispose()) };
}

/** Each car's paint. */
function repaint(mesh: THREE.InstancedMesh | null, paints: string[]) {
  if (!mesh) return;
  const c = new THREE.Color();
  paints.forEach((p, i) => mesh.setColorAt(i, c.set(p)));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function Fleet({ car, cars, paints }: { car: CarGeometry; cars: CarSpot[]; paints: string[] }) {
  const invalidate = useThree((s) => s.invalidate);
  const fleet = useMemo(() => buildFleet(car, cars), [car, cars]);
  useEffect(() => () => fleet.dispose(), [fleet]);
  useEffect(() => {
    repaint(fleet.paint, paints);
    invalidate();
  }, [fleet, paints, invalidate]);
  useEffect(() => invalidate(), [fleet, invalidate]);
  return <primitive object={fleet.group} />;
}

export function Showroom({ cars, items, accent, onPick }: { cars: CarSpot[]; items: HallItem[]; accent: string; onPick: (item: HallItem, far: boolean) => void }) {
  // The full car for a car or two; a lighter one for a fleet.
  const car = useCar(cars.length <= 2 ? 1 : 0.5);
  const byId = useMemo(() => new Map(items.map((i) => [i.product.id, i])), [items]);
  const photos = cars.map((c) => {
    const p = byId.get(c.productId)?.product;
    return p ? (p.media_type === "video" ? p.poster_url : p.media_url) : null;
  });
  const paints = usePaints(photos);

  // Platforms: a deep base in the shop's colour, a polished top, a brass edge.
  const platforms = useMemo(() => {
    const k = new Kit();
    const base = shade(accent, -0.55);
    for (const c of cars) {
      k.cyl("satin", SHOWROOM.radius - 0.04, SHOWROOM.radius, SHOWROOM.height - 0.02, [c.x, (SHOWROOM.height - 0.02) / 2, c.z], base, 64);
      k.cyl("darkMarble", SHOWROOM.radius - 0.08, SHOWROOM.radius - 0.08, 0.02, [c.x, SHOWROOM.height - 0.01, c.z], "#ffffff", 64);
      k.torus("brass", SHOWROOM.radius - 0.06, 0.018, [c.x, SHOWROOM.height, c.z], "#ffffff", [Math.PI / 2, 0, 0]);
    }
    return k.build();
  }, [cars, accent]);
  const glow = useMemo(() => new THREE.RingGeometry(SHOWROOM.radius + 0.02, SHOWROOM.radius + 0.38, 72), []);
  useDispose(glow);
  const glowColor = useMemo(() => new THREE.Color(accent).lerp(new THREE.Color("#ffffff"), 0.55), [accent]);

  return (
    <>
      <Built parts={platforms} shadows={false} />
      {cars.map((c) => {
        const item = byId.get(c.productId);
        return (
          <group key={c.productId}>
            {/* A soft glow on the floor round the platform. */}
            <mesh geometry={glow} rotation-x={-Math.PI / 2} position={[c.x, 0.004, c.z]}>
              <meshBasicMaterial color={glowColor} transparent opacity={0.35} depthWrite={false} toneMapped={false} />
            </mesh>
            {/* The car's shadow on its platform. */}
            <mesh rotation={[-Math.PI / 2, 0, c.rotY]} position={[c.x, PLATFORM_TOP + 0.002, c.z]} renderOrder={1}>
              <planeGeometry args={[2.5, 5.2]} />
              <meshBasicMaterial map={softShadow()} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
            </mesh>
            {/* What a tap finds: a plain box the size of the car. */}
            {item && (
              <mesh
                position={[c.x, PLATFORM_TOP + 0.66, c.z]}
                rotation-y={c.rotY}
                onClick={tap((e: ThreeEvent<MouseEvent>) => {
                  const dx = e.camera.position.x - c.x;
                  const dz = e.camera.position.z - c.z;
                  onPick(item, dx * dx + dz * dz > 7 * 7);
                })}
              >
                <boxGeometry args={[1.95, 1.32, 4.5]} />
                <meshBasicMaterial visible={false} />
              </mesh>
            )}
          </group>
        );
      })}
      {car && <Fleet car={car} cars={cars} paints={paints} />}
    </>
  );
}
