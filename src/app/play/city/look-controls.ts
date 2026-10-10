// Looking around from one spot (the balloon basket, inside a building, on a roof): drag with
// one finger (or the mouse) to turn the view, pinch (or scroll) to zoom in a little. No panning
// and no flying off: the camera stays where it is, only the direction and zoom change. Every
// change is smoothed, so the view glides instead of jumping, and drifts to a stop after a flick.

export type Look = {
  /** Where the view is pointing now (smoothed), radians: yaw round the vertical, pitch up/down. */
  yaw: number;
  pitch: number;
  /** Zoom: 1 = normal, below 1 = zoomed in (narrower view). */
  zoom: number;
  /** True while a finger or the mouse is down and dragging. */
  dragging: boolean;
};

export type LookLimits = { pitchMin: number; pitchMax: number; zoomMin: number; zoomMax: number };

export function createLookControls(dom: HTMLElement) {
  const state: Look = { yaw: 0, pitch: 0, zoom: 1, dragging: false };
  const target = { yaw: 0, pitch: 0, zoom: 1 };
  const vel = { yaw: 0, pitch: 0 };
  let limits: LookLimits = { pitchMin: -1.2, pitchMax: 0.6, zoomMin: 0.6, zoomMax: 1.15 };
  let enabled = false;
  /** How far one pixel of drag turns the view (set from the field of view every frame). */
  let perPixel = 0.004;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; zoom: number } | null = null;
  let last: { x: number; y: number; t: number } | null = null;
  /** A second finger touched during this gesture (so it isn't a tap). */
  let multi = false;

  const clampPitch = (p: number) => Math.min(limits.pitchMax, Math.max(limits.pitchMin, p));
  const clampZoom = (z: number) => Math.min(limits.zoomMax, Math.max(limits.zoomMin, z));

  function pinchDist() {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  const onDown = (e: PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) multi = false;
    if (pointers.size >= 2) {
      multi = true;
      pinch = { dist: Math.max(1, pinchDist()), zoom: target.zoom };
      last = null;
    } else {
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      vel.yaw = vel.pitch = 0;
    }
    try {
      dom.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured (that's fine).
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!enabled || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2 && pinch) {
      // Fingers apart: zoom in (a narrower view).
      target.zoom = clampZoom((pinch.zoom * pinch.dist) / Math.max(1, pinchDist()));
      return;
    }
    if (!last) return;
    const now = performance.now();
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const dt = Math.max(1, now - last.t) / 1000;
    last = { x: e.clientX, y: e.clientY, t: now };
    // The scene follows the finger: drag right and the view turns left.
    const k = perPixel * target.zoom;
    const dyaw = dx * k;
    const dpitch = dy * k;
    target.yaw += dyaw;
    target.pitch = clampPitch(target.pitch + dpitch);
    state.dragging = true;
    // Remember how fast it was going, for a gentle glide after letting go.
    vel.yaw = vel.yaw * 0.6 + (dyaw / dt) * 0.4;
    vel.pitch = vel.pitch * 0.6 + (dpitch / dt) * 0.4;
  };
  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      // Back to one finger: carry on turning from where it is (no jump).
      const [p] = [...pointers.values()];
      last = { x: p.x, y: p.y, t: performance.now() };
      vel.yaw = vel.pitch = 0;
    } else if (pointers.size === 0) {
      last = null;
      state.dragging = false;
      // A slow release just stops; a flick glides on a little.
      const speed = Math.hypot(vel.yaw, vel.pitch);
      if (speed < 0.25) vel.yaw = vel.pitch = 0;
      const cap = 2.2;
      if (speed > cap) {
        vel.yaw *= cap / speed;
        vel.pitch *= cap / speed;
      }
    }
  };
  const onWheel = (e: WheelEvent) => {
    if (!enabled) return;
    e.preventDefault();
    target.zoom = clampZoom(target.zoom * Math.exp(e.deltaY * 0.0012));
  };

  dom.addEventListener("pointerdown", onDown);
  dom.addEventListener("pointermove", onMove);
  dom.addEventListener("pointerup", onUp);
  dom.addEventListener("pointercancel", onUp);
  dom.addEventListener("wheel", onWheel, { passive: false });

  /** Shortest way round from a to b (radians). */
  const turn = (a: number, b: number) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  return {
    state,
    /** True if a second finger touched during the current/last gesture. */
    get multiTouch() {
      return multi;
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (!on) {
        pointers.clear();
        pinch = null;
        last = null;
        state.dragging = false;
        vel.yaw = vel.pitch = 0;
      }
    },
    get enabled() {
      return enabled;
    },
    setLimits(l: Partial<LookLimits>) {
      limits = { ...limits, ...l };
      target.pitch = clampPitch(target.pitch);
      target.zoom = clampZoom(target.zoom);
    },
    /** Point the view somewhere. Instantly (snap) or gliding there. */
    lookAt(yaw: number, pitch: number, snap = false) {
      // Keep yaw continuous (no spinning the long way round).
      target.yaw = state.yaw + turn(state.yaw, yaw);
      target.pitch = clampPitch(pitch);
      vel.yaw = vel.pitch = 0;
      if (snap) {
        state.yaw = target.yaw;
        state.pitch = target.pitch;
      }
    },
    /** Zoom by a step (the + and − buttons): below 1 zooms in. */
    zoomBy(f: number) {
      target.zoom = clampZoom(target.zoom * f);
    },
    resetZoom(snap = false) {
      target.zoom = 1;
      if (snap) state.zoom = 1;
    },
    /** Move the view a step towards where it's going. fovRad: the current field of view, viewH: screen height. */
    update(dt: number, fovRad: number, viewH: number) {
      perPixel = (fovRad / Math.max(200, viewH)) * 1.05;
      if (!state.dragging && (vel.yaw || vel.pitch)) {
        target.yaw += vel.yaw * dt;
        target.pitch = clampPitch(target.pitch + vel.pitch * dt);
        const decay = Math.exp(-dt * 4.5);
        vel.yaw *= decay;
        vel.pitch *= decay;
        if (Math.abs(vel.yaw) < 0.01 && Math.abs(vel.pitch) < 0.01) vel.yaw = vel.pitch = 0;
      }
      const f = 1 - Math.exp(-dt * 11);
      state.yaw += (target.yaw - state.yaw) * f;
      state.pitch += (target.pitch - state.pitch) * f;
      state.zoom += (target.zoom - state.zoom) * (1 - Math.exp(-dt * 8));
    },
    dispose() {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
    },
  };
}

export type LookControls = ReturnType<typeof createLookControls>;
