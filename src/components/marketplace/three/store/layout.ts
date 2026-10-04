// The store's size and where its main pieces stand (metres, more or less).

export const W = 12; // room width (x)
export const D = 9; // room depth (z)
export const H = 5; // wall height
export const BACK = -D / 2;
export const COUNTER_Z = -1.5;

/** The lounge corner: where its table set stands, and which way it faces (towards the door you walk in from). */
export const LOUNGE = { x: 3.95, z: 1.35, rotY: -0.8 };
