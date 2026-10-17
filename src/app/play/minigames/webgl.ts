// Can this phone draw 3D at all? Asked once when a 3D game opens (its "this phone couldn't start
// the 3D..." note shows straight away instead of a blank screen).
export function canWebGL() {
  if (typeof document === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
