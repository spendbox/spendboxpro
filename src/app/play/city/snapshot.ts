// A picture of what the 3D view shows right now (the city, or the place you're in), for the
// photo booth's "Right here" backdrop and the phone camera. The city view registers how to take one while it's on
// screen: it draws a fresh frame and copies it straight away (WebGL forgets the picture once
// it's on screen, so it can't be read back later).

let take: (() => HTMLCanvasElement | null) | null = null;

/** Called by the city view (null when it goes away). */
export function setSceneSnapshot(fn: (() => HTMLCanvasElement | null) | null) {
  take = fn;
}

/** The 3D view right now, or null if there isn't one. */
export function snapshotScene(): HTMLCanvasElement | null {
  try {
    return take ? take() : null;
  } catch {
    return null;
  }
}

/** True when a copied picture came out empty (some phones won't hand the 3D view over). */
export function blank(c: HTMLCanvasElement) {
  try {
    const px = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let bright = 0;
    for (let i = 0; i < px.length; i += 4 * 997) bright += px[i] + px[i + 1] + px[i + 2];
    return bright <= 2000;
  } catch {
    return true;
  }
}

/** The live 3D scene (the city, or the room you're in), copied off the screen, or null. */
export function captureScene(): Promise<HTMLCanvasElement | null> {
  // Best: the city view draws a fresh frame for us.
  const snap = snapshotScene();
  if (snap && snap.width >= 100 && !blank(snap)) return Promise.resolve(snap);
  // The biggest canvas on the page that isn't one of ours (the 3D view).
  const src = [...document.querySelectorAll<HTMLCanvasElement>("canvas:not([data-photo])")].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!src || src.width < 100) return Promise.resolve(null);
  return new Promise((resolve) => {
    // Right after the city draws a frame (its own callback runs first), the picture is still there.
    requestAnimationFrame(() => {
      try {
        const c = document.createElement("canvas");
        c.dataset.photo = "1";
        c.width = src.width;
        c.height = src.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(src, 0, 0);
        resolve(blank(c) ? null : c);
      } catch {
        resolve(null);
      }
    });
  });
}
