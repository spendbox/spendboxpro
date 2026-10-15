// The night sky's stars, out in space: each star is a direction, not a place, drawn at the very
// back of the view (behind everything, like a skybox), so they stay where they are however far
// you move, zoom or climb, and the ground hides the ones below the horizon. They cover the whole
// sky, ready for the day the map is a globe you can zoom out of into space.

import * as THREE from "three";
import { hash } from "@/lib/city/layout";

const COUNT = 2400;
/** Where the air thins out (tiles up: 100 m each): from about 20 km the horizon's haze fades, gone by 200 km. */
const AIR_FROM = 200;
const AIR_TO = 2000;

const VERTEX = /* glsl */ `
  attribute float size;
  attribute float phase;
  attribute vec3 color;
  uniform float uPixel;
  uniform float uTime;
  uniform float uHaze;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vHorizon;
  void main() {
    // The camera's turn only (no position): the star is infinitely far away.
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    // On the far plane: behind everything, never in front of the ground.
    gl_Position = p.xyww;
    gl_Position.z = gl_Position.w * 0.99999;
    // A gentle twinkle, each star in its own time.
    float tw = 0.78 + 0.22 * sin(uTime * (1.3 + phase * 2.1) + phase * 40.0);
    vAlpha = tw;
    vColor = color;
    // Through more air near the horizon: fainter (position is a unit direction, y up). Only from
    // down in the air: up in space there's no horizon, and stars are all round.
    vHorizon = mix(1.0, smoothstep(-0.02, 0.28, position.y), uHaze);
    gl_PointSize = size * uPixel;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  varying float vHorizon;
  varying vec3 vColor;
  void main() {
    // A soft round dot, not a square.
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.1, r) * vAlpha * vHorizon * uOpacity;
    gl_FragColor = vec4(vColor, a);
  }
`;

export function createStars(parent: THREE.Object3D, pixelRatio: number) {
  const pos = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT);
  const col = new Float32Array(COUNT * 3);
  for (let k = 0; k < COUNT; k++) {
    // Evenly over the whole sphere (the same sky every time).
    const u = hash(k, 1, 4401) * 2 - 1;
    const a = hash(k, 2, 4401) * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * s, u, Math.sin(a) * s], k * 3);
    // Mostly faint, a few bright.
    const m = hash(k, 3, 4401);
    size[k] = 0.9 + m * m * m * 2.6;
    phase[k] = hash(k, 4, 4401);
    // White, with the odd blue-white or warm star.
    const tint = hash(k, 5, 4401);
    const c = tint < 0.12 ? [0.78, 0.86, 1] : tint > 0.9 ? [1, 0.88, 0.74] : [1, 1, 1];
    col.set(c, k * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("phase", new THREE.BufferAttribute(phase, 1));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const uniforms = { uOpacity: { value: 0 }, uPixel: { value: pixelRatio }, uTime: { value: 0 }, uHaze: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  // Its "positions" are directions, so the usual check of what's in view doesn't apply.
  points.frustumCulled = false;
  points.renderOrder = -1;
  points.userData.name = "stars";
  points.onBeforeRender = (_r, _s, camera) => {
    uniforms.uTime.value = performance.now() / 1000;
    uniforms.uHaze.value = 1 - THREE.MathUtils.smoothstep(camera.position.y, AIR_FROM, AIR_TO);
  };
  parent.add(points);
  return {
    /** How much of the sky's stars show: 0 by day, 1 on a clear night. */
    set opacity(v: number) {
      uniforms.uOpacity.value = v;
      points.visible = v > 0.01;
    },
  };
}
