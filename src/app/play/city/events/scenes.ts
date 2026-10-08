// Which scene draws which world event. The scenes themselves live in scenes-*.ts, grouped
// roughly like the catalog (src/lib/world-events.ts); anything without its own scene gets a
// simple one for its category (so a new event in the catalog still shows up).

import { CloudSun, PartyPopper, Siren, Sparkles, Store, TrainFront, Zap } from "lucide-react";
import { WORLD_EVENT_BY_KEY } from "@/lib/world-events";
import { confetti, crowd, DANCE, fire, flashers, smoke, sparkles, type Ev, type Scene } from "./common";
import { SCENES_A } from "./scenes-a";
import { SCENES_B } from "./scenes-b";
import { SCENES_C } from "./scenes-c";

const SCENES: Record<string, Scene> = { ...SCENES_A, ...SCENES_B, ...SCENES_C };

const generic: Record<string, Scene> = {
  emergency: {
    icon: Siren,
    sound: "siren",
    draw: (e: Ev) => {
      const s = e.s;
      fire(e.k, s.x, s.top, s.z, 0.6, e.t, e.id, e.life);
      smoke(e.k, s.x, s.top + 0.4, s.z, e.t, e.id, 4, 0.6, 0x495057, e.life);
      flashers(e.k, s.fx, 0.4, s.fz, e.t, 0, e.life);
    },
  },
  party: {
    icon: PartyPopper,
    sound: "cheer",
    draw: (e: Ev) => {
      crowd(e, 24, e.s.x, e.s.ground, e.s.z, 0.45, 0.45, DANCE);
      confetti(e.k, e.s.x, e.s.ground, e.s.z, 1.4, 2, e.t, e.id, e.life);
    },
  },
  weather: { icon: CloudSun, sound: "wind", draw: (e: Ev) => sparkles(e.k, e.s.x, 2, e.s.z, 2, 1, 2, e.t, e.id, 0xffffff, e.life) },
  transport: { icon: TrainFront, sound: "engine", draw: (e: Ev) => sparkles(e.k, e.s.x, 1, e.s.z, 1, 0.5, 1, e.t, e.id, 0x63e6be, e.life) },
  city: { icon: Store, sound: "crowd", draw: (e: Ev) => crowd(e, 16, e.s.x, e.s.ground, e.s.z, 0.4, 0.4, DANCE) },
  mystery: { icon: Sparkles, sound: "eerie", draw: (e: Ev) => sparkles(e.k, e.s.x, e.s.top + 0.8, e.s.z, 1, 0.8, 1, e.t, e.id, 0xb197fc, e.life) },
  twist: { icon: Zap, sound: "chime", draw: (e: Ev) => sparkles(e.k, e.s.x, 1.5, e.s.z, 2, 1, 2, e.t, e.id, 0xffd43b, e.life) },
};

export function sceneFor(key: string): Scene {
  return SCENES[key] ?? generic[WORLD_EVENT_BY_KEY[key]?.category ?? "mystery"] ?? generic.mystery;
}

/** Keys that have their own scene (for checks). */
export const SCENE_KEYS = Object.keys(SCENES);
