// While the 3D avatar is being tried out, the new studio is switched on per browser: open the game
// with ?avatar3d=1 to turn it on (it stays on in that browser), ?avatar3d=0 to turn it off. Everyone
// else keeps the old editor until it is switched on for all.

const KEY = "newtown.avatar3d";

export function avatar3dEnabled(): boolean {
  try {
    const q = new URLSearchParams(location.search).get("avatar3d");
    if (q === "1") localStorage.setItem(KEY, "1");
    if (q === "0") localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
