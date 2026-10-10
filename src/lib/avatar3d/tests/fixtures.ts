// FROZEN saved avatars. Each one must keep loading as exactly `expect`, forever.
// Add new fixtures when a new recipe version or key appears; never edit or delete existing ones.

const base = {
  face: 0, chin: 0, fat: 1, skin: 0, eye: 0, eyeC: 0, brow: 0, nose: 0, lips: 0, lipT: 0, hair: 0, hairC: 0,
  facial: 0, frame: 0, build: 3, bust: 0, butt: 1, outfit: 0, top: 0, pattern: 0, bottom: 0, glasses: 0, ear: 0,
  pierce: 0, hw: 0, hwC: 0, watch: 0, chain: 0, bg: 0, height: 0,
};

const amaka = { ...base, skin: 4, eyeC: 1, nose: 2, lips: 1, hair: 3, frame: 1, top: 1, bottom: 1, ear: 1 };
const tunde = { ...base, face: 2, skin: 2, eye: 2, brow: 1, nose: 3, hair: 2, facial: 4, build: 0, outfit: 3, top: 4, hw: 5, hwC: 2 };
const segun = {
  ...base, face: 2, eye: 4, brow: 5, nose: 4, lips: 7, facial: 5, build: 2, outfit: 4, top: 3, pattern: 1, glasses: 3,
  watch: 1, chain: 3,
};
const halima = {
  ...base, face: 5, skin: 5, eyeC: 3, brow: 3, nose: 2, lips: 5, lipT: 1, hair: 3, frame: 1, outfit: 6, top: 6,
  pattern: 1, ear: 3, hw: 6, hwC: 6,
};

export const RECIPE_FIXTURES: { name: string; input: unknown; expect: Record<string, number> }[] = [
  // Version 1, saved as JSON on a profile.
  { name: "v1 json Amaka", input: { v: 1, ...amaka }, expect: amaka },
  { name: "v1 json Segun", input: { v: 1, ...segun }, expect: segun },
  // Version 1, text form.
  { name: "v1 text Tunde", input: "NT1201220130020400013400000520000", expect: tunde },
  { name: "v1 text Halima", input: "NT1501503325130013016610030660000", expect: halima },
  // Text copied from the prototype studio (no version digit, 28 keys, no bg/height).
  { name: "prototype text Amaka", input: "NT0014010210300130101010100000", expect: amaka },
  // Old 2D avatars (lib/avatar.ts), converted to the nearest 3D look.
  {
    name: "2D avatar, light skin, long platinum hair, striped tee",
    input: { skin: 0, hair: 4, hairColor: 5, eyes: 1, brows: 2, mouth: 0, beard: 0, glasses: 1, top: 9, topColor: 7, bg: 3, earrings: 2 },
    expect: { ...base, skin: 11, hair: 10, hairC: 7, brow: 3, glasses: 1, ear: 2, top: 12, pattern: 3, bg: 3 },
  },
  {
    name: "2D avatar, dark skin, afro, full beard, dashiki",
    input: { skin: 7, hair: 3, hairColor: 0, eyes: 0, brows: 1, mouth: 2, beard: 2, glasses: 0, top: 20, topColor: 3, bg: 0, earrings: 0 },
    expect: { ...base, hair: 4, brow: 1, facial: 5, outfit: 3, top: 3, pattern: 1 },
  },
  {
    name: "2D avatar, mohawk, blue hair, moustache, shades, blazer",
    input: { skin: 3, hair: 7, hairColor: 9, eyes: 4, brows: 3, mouth: 4, beard: 4, glasses: 3, top: 14, topColor: 5, bg: 7, earrings: 1 },
    expect: { ...base, skin: 7, hair: 2, hairC: 10, brow: 4, facial: 2, glasses: 3, ear: 1, outfit: 10, top: 5, bg: 7 },
  },
  {
    name: "2D avatar with broken values keeps the good ones",
    input: { skin: 99, hair: -1, hairColor: "x", eyes: 0, brows: 0, mouth: 0, beard: 1.5, glasses: 2, top: 0, topColor: 0, bg: 2, earrings: 0 },
    expect: { ...base, top: 9, glasses: 2, bg: 2 },
  },
];
