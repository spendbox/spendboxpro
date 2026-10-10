// A picture of what the 3D view shows right now (the city, or the place you're in), for the
// photo booth's "Right here" backdrop. The city view registers how to take one while it's on
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
