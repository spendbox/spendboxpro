"use client";

import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar, defaultAvatar, type Avatar } from "@/lib/avatar";
import {
  addressOf,
  hash,
  makePlan,
  railCentre,
  smoothNoise,
  stationName,
  stationXZ,
  spiralIndex,
  spiralXY,
  structureCentre,
  structureSize,
  tileAt,
  VENUE_SPORT,
  type CityPlan,
  type Tile,
} from "@/lib/city/layout";
import { ABBREV } from "@/lib/city/places";
import { daylight, weatherAt } from "@/lib/city/sky";
import { npcsFor, type Npc } from "@/lib/npcs";
import { createBirds } from "./city/birds";
import { createBubbles, type BubbleSpot } from "./city/bubbles";
import { createBuildingSite, createSites } from "./city/construction";
import { createFigures, type Figures, type Person, type Spot } from "./city/figures";
import { createInteractables, createWalker, type Interactables, type Item } from "./city/interact";
import { coolingTowerGeometry, createPlumes, industryParts } from "./city/industry";
import { createInterior, type Interior, type RoomItem } from "./city/interiors";
import { disposeBlobTexture, disposeKitCaches, rngFrom } from "./city/kit";
import { clubBeat, type DanceMove } from "./city/dance-moves";
import { EYE, levelsOf, levelUse, METRES, ROOM_LABEL, THEME_SPORT, type PlaceLevel } from "./city/levels";
import { createLookControls } from "./city/look-controls";
import { createPeople } from "./city/people";
import { createBasket, createDeck, createOpenAir, type Deck } from "./city/rooftops";
import { billboardTexture, botTexture, disposePills, pillTexture } from "./city/textures";
import { createTrains, railParts } from "./city/trains";
import { createTraffic, type VehiclePose } from "./city/traffic";
import { clubParts, eggParts, fireStationParts, restaurantParts } from "./city/street-bits";
import { createCabin, type Cabin } from "./city/rides";
import { disposeVehicleCaches } from "./city/vehicles";
import { createBoats } from "./city/boats";
import { createAirliner, LIVERIES } from "./city/airliner";
import { createSlideRide, createWaterpark, waterparkParts, type Slide, type SlideRide, type Waterpark } from "./city/waterpark";
import { createVenueGame, venueParts, type VenueGame } from "./city/venues";
import { BRIDGE_TOP, makeWorld, signalJunction } from "./city/world";
import { playSfx } from "./sound";
import type { WorldEvent } from "@/lib/world-events";
import { createWorldEvents } from "./city/world-events";
import { placeHouses } from "@/lib/city/houses";
import { megaParts, statue } from "./city/megas";
import { buildWater, disposeWater } from "./city/water";
import { createCountryside, regionOf } from "./city/countryside";
import { buildLandmarks as buildCountryLandmarks } from "./city/landmarks";
import { causewayParts, jettyParts, neighbourhoodParts, pond, pool, supertallParts } from "./city/neighbourhood";
import { homeLabel, type TownHouse } from "@/lib/houses";

/** The country's famous landmarks out in the farmland round each town (hidden for now). */
const SHOW_COUNTRY_LANDMARKS = false;

// The game board, drawn as a small living 3D city with three.js.
// Every tile is a lot: a road, a building, a park... New tiles rise out of the ground
// as the city grows. Cars drive the roads, birds and clouds drift overhead.
// Lightweight on purpose: a handful of shared shapes drawn many times (instancing).

export type CityMarkers = {
  searchedEmpty: number[];
  searchedHit: number[];
  caught: number[];
  left: number[];
  me: number | null;
  sweeps: { tile: number; radius: number; count: number }[];
  pending: number | null;
  /** Latest searches by anyone, and how long ago (ms). They light up. */
  recent: { tile: number; ageMs: number }[];
  /** Every searched tile (hiders only): shown as locked. */
  locked: number[];
  /** Your own decoy's tile (only you see it): a little inflatable dummy stands there. */
  decoy: number | null;
};

/** Something that just happened, for a short animation (see GameEvent). */
export type CityEvent = {
  id: number;
  kind: string;
  /** Where it happened (null for things with no place, like "respawn"). */
  tile: number | null;
  ageMs: number;
  detail?: {
    radius?: number;
    /** decoy_found: "explode" or "toy". */
    outcome?: string;
    hiders?: { name: string | null; avatar: unknown; bot: boolean }[];
  } | null;
};

/** An advert shown on the city's billboards (image: a public URL, ideally about 2:1). */
export type CityAd = { id: string; image: string; headline: string; brand: string; link: string | null };

/**
 * One place inside a building: "g" the ground floor (lobby, living room, shop...), "f<n>" floor n
 * (a few floors of taller buildings, e.g. "Floor 12 · Sky lounge"), "r" the roof (or a terrace /
 * deck high up), "o" an open-air spot at street level (parks, plazas, markets...).
 */
export type CityLevel = {
  id: string;
  label: string;
  capacity: number;
  /**
   * What it is: a room, a nightclub, a restaurant (or food court), a rooftop, open air, or a
   * sports venue ("arena": the stands at a stadium, an indoor court, ringside at a boxing or
   * wrestling arena; it has a "match" thing to tap).
   */
  kind?: "room" | "club" | "restaurant" | "roof" | "outdoor" | "arena";
};

/**
 * A chat room: a building (id "b:<tile index>", the corner tile for big 2×2 buildings) or a
 * hot-air balloon (id "balloon:<k>"). Buildings list the levels you can go to (capacity is
 * their total); balloons have none.
 */
export type CityRoom = { id: string; name: string; capacity: number; kind: "building" | "balloon"; levels?: CityLevel[] };

/** Someone dancing on the dance floor of the club you're in: their move, and who they dance with (a player's or an NPC's id). */
export type CityDancer = { id: string; name: string; avatar: Avatar; move: DanceMove; with: string | null };
/** A friend in a place in town (their face shows over it): the room id from useRooms ("b:12:f4", "balloon:2"). */
export type CityFriendPin = { id: string; name: string; avatar: Avatar; room: string };
/** A ghost lit up on the map: free to challenge, in a duel right now, or golden (safe). */
export type CityGhost = { id: string; name: string; avatar: Avatar; tile: number; status: "free" | "playing" | "golden"; mine?: boolean };
/** You dancing: your id (so everyone places the dancers the same way), your move, your partner. */
export type CityDance = { id: string; move: DanceMove; with: string | null };

/** Where you are inside a building: its room id ("b:<tile>") and a level id from its levels. */
export type CityPlace = { building: string; level: string };

/** Something you can ride. (For the `ride` prop a plain number still means hot-air balloon k.) */
export type RideKind = "balloon" | "train" | "bus" | "car" | "boat" | "ferris" | "slide";
export type RideTarget = { kind: RideKind; index: number };
/**
 * A ride that exists this round (see onRides). Its chat room id is `v:<kind>:<index>`, except
 * balloons, which keep `balloon:<k>`.
 */
export type CityRide = { kind: RideKind; index: number; name: string; capacity: number };
/** Which way to go at a junction when you're driving a car. */
export type TurnDir = "left" | "right" | "straight";

/** Things you can do inside places (shown with a soft glow and a label; tap to use). */
export type InteractKind =
  | "seat" | "darts" | "archery" | "arcade" | "pool" | "cards" | "dance" | "dj" | "bar" | "jukebox" | "menu" | "stairs" | "window" | "piano" | "karaoke" | "slots-free" | "photo"
  /** At a sports venue: "Watch the match" / "Watch the fight" (by the big screen). */
  | "match";
/** The sport played at a venue. */
export type CitySport = "football" | "basketball" | "boxing" | "wrestling";
/**
 * Something tapped inside a place. id is stable for everyone: "<room>:seat:<n>" for seats,
 * "<room>:<kind>:<n>" for the rest; place is the room id ("b:12:f4"). At a sports venue, "match"
 * items and the seats there also say which sport it is.
 */
export type CityInteract = { id: string; kind: InteractKind; label: string; place: string; sport?: CitySport };
/** Someone sitting in a seat (a player): their name and avatar. */
export type SeatTaker = { id?: string; name: string; avatar: unknown };
/** Another real player in the place you're in (drawn standing about, unless sitting or dancing). */
export type CityPerson = { id: string; name: string; avatar: unknown };

/** A ghost caught this round: their face stays floating over the spot. */
export type CaughtFace = { tile: number; name: string | null; avatar: unknown };

type Props = {
  seed: number;
  tileCount: number;
  markers: CityMarkers;
  events: CityEvent[];
  /** A billboard was tapped: which board, and the ad it was showing (null = "advertise here"). */
  onBillboard: (info: { id: string; tile: number; adId: string | null }) => void;
  onHover?: (info: { tile: number; label: string } | null) => void;
  /** Your face, floating over your hiding spot. */
  meAvatar: Avatar;
  /** A coin balloon drifting by just for you (its slot number), or none. */
  coinBalloon: number | null;
  onBalloon: (slot: number) => void;
  /** How far through the hunt we are (0..1), for day and night, and which way it runs. */
  progress: number;
  nightFirst: boolean;
  /** Adverts to rotate through on the billboards (empty = the house "advertise here" boards). */
  ads: CityAd[];
  /** Ad views seen on screen since the last call ({ adId: views }), sent at most every 15 s. */
  onAdViews: (counts: Record<string, number>) => void;
  /**
   * False during the join window: the real city stays secret and the whole map is a building
   * site. When it turns true (the hunt starts) the city rises. Default true.
   */
  revealed?: boolean;
  /** How many people are in each chat room right now ({ roomId: count }). */
  roomCounts?: Record<string, number>;
  /** A building or balloon was tapped (each one is a place to go inside). */
  onRoom?: (room: CityRoom) => void;
  /**
   * Ride something: a hot-air balloon (a plain number k, or { kind: "balloon", index: k }), a
   * train, bus, car, boat, Ferris wheel cabin or water slide ({ kind, index } from onRides). The
   * camera flies in and you can look round. null for the normal view.
   */
  ride?: number | RideTarget | null;
  /** Everything there is to ride this round (called after the city is built, when it changes). */
  onRides?: (rides: CityRide[]) => void;
  /** A ride that ends by itself (a water slide, after the splash) has finished. */
  onRideEnd?: () => void;
  /** Driving a car: take this turn at the next junction (a new `at` each time). Otherwise it picks. */
  steer?: { dir: TurnDir; at: number } | null;
  /** Driving a car: a junction is coming up, and these are the ways you can go. */
  onJunction?: (options: TurnDir[]) => void;
  /** Inside a place: something you can use (a seat, the bar, darts...) was tapped. */
  onInteract?: (item: CityInteract) => void;
  /** Seats taken by players ({ seatId: who }): they're drawn sitting there with their name. */
  seats?: Record<string, SeatTaker>;
  /** Your own seat (a seat id in the place you're in): the camera sits down there. */
  mySeat?: string | null;
  /** How many hot-air balloons there are (called after the city is built). */
  onBalloons?: (count: number) => void;
  /** Ghosts caught this round (preferred over working it out from events, which get trimmed). */
  caughtFaces?: CaughtFace[];
  /**
   * Go inside a building (or onto its roof): the camera flies there and you can look round.
   * null (default) for the normal view. Takes priority over `ride`.
   */
  place?: CityPlace | null;
  /** One of the regulars (NPCs) standing in the place was tapped: their id from npcsFor(). */
  onNpc?: (npcId: string) => void;
  /** Which viewpoint inside the place (0, 1, 2...; wraps round). Default 0. */
  spot?: number;
  /** How many viewpoints the current place has (called when you arrive somewhere). */
  onSpots?: (count: number) => void;
  /** World events (src/lib/world-events.ts) to show in the city while they're on (see ./city/world-events). */
  worldEvents?: WorldEvent[];
  /** Fly the map camera to look at an event (a new `at` each time). Ignored while riding or inside. */
  focusEvent?: { id: number; at: number } | null;
  /** An event's reward (cash, a treasure chest, a lost dog...) was tapped. */
  onEventTap?: (id: number) => void;
  /**
   * An event's pin (or the little title bubble over it) was tapped: show what's happening.
   * Works in both modes, on the normal map view. Without it, pins have no bubbles and taps on
   * them go through to whatever is underneath, as before.
   */
  onEventInfo?: (id: number) => void;
  /**
   * What's on at the sports venues right now: a short live label per sport ("Lions 2-1 Eagles"),
   * or null / missing when nothing is. The venue's info bubble shows it.
   */
  liveVenues?: Partial<Record<CitySport, string | null>>;
  /** Server clock minus this device's clock (ms), so events start on time everywhere. Default 0. */
  clockOffsetMs?: number;
  /** Players' houses standing in this game (src/lib/houses.ts): drawn in their colours, each one a place. */
  houses?: TownHouse[];
  /**
   * In a club: dance on the dance floor (you're drawn dancing among everyone, and the camera
   * circles round you; drag to look round). null: walk about as usual.
   */
  dance?: CityDance | null;
  /** Other players dancing in the club you're in. */
  dancers?: CityDancer[];
  /** Your friends who are in a place right now: each one's face and name shows over it. */
  friendsAt?: CityFriendPin[];
  /** Open a building's place (as if it was tapped: onRoom is called with it), e.g. to go to a friend. A new `at` each time. */
  openRoom?: { id: string; at: number } | null;
  /** The other real players in the place you're in: the ones not sitting or dancing are drawn standing about. */
  roomPeople?: CityPerson[];
  /** Ghosts lit up on the map (tap one: onGhost). */
  ghosts?: CityGhost[];
  onGhost?: (id: string) => void;
  /** Fly the camera over a spot (a new `at` each time), e.g. a ghost picked from a list. */
  flyTo?: { tile: number; at: number } | null;
  /** Freeze the town (it stops moving and drawing), e.g. behind the sign-in pop-up. */
  paused?: boolean;
};

type Part = { tile: number; x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; color: number; tilt?: number };

/** A very big town draws only this many tiles each way round the camera (see build). */
const WINDOW = 40;
const SKY = 0xd7ebf7;
const BALLOON_NAMES = ["Red", "Yellow", "Blue", "Purple", "Mint"];
const GROUND = 0xd3e4c8;
const ASPHALT = 0x5b6470;
const SIDEWALK = 0xf3f1ec;
const GRASS = 0xa8d79a;
const WATER = 0x7cc4e8;
/** Traffic-light bulbs carry this plus (direction × 3 + bulb) as their colour until lit. */
const SIGNAL_TAG = 1000;
/** Blinking lights carry this plus their kind as their colour (see FLASH below). */
const FLASH_TAG = 2000;
const FLASH = { hazard: 0, policeRed: 1, policeBlue: 2, works: 3 } as const;

// ---------------------------------------------------------------- shapes
function geometries() {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roof = new THREE.CylinderGeometry(0, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 1, 5).translate(0, 0.5, 0);
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);
  // Half a ring, standing up: the arch under a bridge.
  const arch = new THREE.TorusGeometry(0.29, 0.035, 6, 18, Math.PI);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 20).translate(0, 0.5, 0);
  const cone = new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0);
  const dome = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  // A quarter ring lying flat, centred on a tile corner: a bend in the road.
  const curve = new THREE.RingGeometry(0.2, 0.8, 14, 1, 0, Math.PI / 2).rotateX(-Math.PI / 2);
  const curveLine = new THREE.RingGeometry(0.485, 0.515, 14, 1, 0, Math.PI / 2).rotateX(-Math.PI / 2);
  const lamp = new THREE.SphereGeometry(0.5, 8, 6);
  const cooling = coolingTowerGeometry();
  return { box, roof, crown, trunk, disc, arch, cyl, cone, dome, curve, curveLine, lamp, cooling };
}

// ---------------------------------------------------------------- what stands on a tile
function partsFor(t: Tile, plan: CityPlan, add: (mesh: string, p: Omit<Part, "tile">) => void) {
  basePartsFor(t, plan, add);
  // The railway viaduct passes over some tiles (whatever is underneath).
  if (t.rail) railParts(t, plan, add);
}

/**
 * A player's house: one of the city's house shapes in the owner's wall and roof colours, with a
 * purple name board by the path (purple marks players' houses). Only ever a few dozen pieces.
 */
function homeParts(
  t: Tile,
  B: (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void,
  add: (mesh: string, p: Omit<Part, "tile">) => void,
  tree: (dx: number, dz: number, size: number, v: number) => void,
) {
  const h = t.home!;
  const { x, z, r } = t;
  const wall = parseInt(h.wall.slice(1), 16) || 0xffe8cc;
  const roof = parseInt(h.roof.slice(1), 16) || 0xc92a2a;
  const roofOn = (cx: number, y: number, cz: number, w: number, d: number, tall: number) =>
    add("roof", { x: x + cx, y, z: z + cz, sx: (w + 0.08) / Math.SQRT2, sy: tall, sz: (d + 0.08) / Math.SQRT2, ry: 0, color: roof });
  // A little lawn and a path to the door.
  B(0, 0.08, 0, 0.9, 0.004, 0.9, 0x9fd88f, 0, "ground");
  B(0, 0.082, 0.33, 0.12, 0.004, 0.26, 0xe9ecef, 0, "ground");
  switch (h.style) {
    case "bungalow":
      B(0, 0.08, -0.04, 0.74, 0.3, 0.5, wall);
      roofOn(0, 0.38, -0.04, 0.74, 0.5, 0.24);
      B(0, 0.08, 0.215, 0.12, 0.2, 0.02, 0x6b4430);
      B(-0.22, 0.2, 0.215, 0.16, 0.1, 0.02, 0xfff1b8, 0, "glass");
      B(0.22, 0.2, 0.215, 0.16, 0.1, 0.02, 0xfff1b8, 0, "glass");
      break;
    case "modern":
      B(-0.08, 0.08, -0.05, 0.56, 0.3, 0.45, wall);
      B(-0.08, 0.2, -0.05, 0.57, 0.08, 0.46, 0x495057, 0, "glass");
      B(-0.05, 0.38, -0.05, 0.68, 0.04, 0.55, roof);
      pool(B, 0.3, 0.08, 0.22, 0.2, 0.28, false);
      tree(-0.36, 0.33, 0.45, r[0]);
      break;
    case "duplex":
      B(-0.06, 0.08, -0.04, 0.5, 0.6, 0.44, wall);
      add("roof", { x: x - 0.06, y: 0.68, z: z - 0.04, sx: 0.58 / Math.SQRT2, sy: 0.26, sz: 0.52 / Math.SQRT2, ry: 0, color: roof });
      B(0.3, 0.08, 0.05, 0.24, 0.22, 0.32, wall);
      B(0.3, 0.3, 0.05, 0.26, 0.03, 0.34, roof);
      B(-0.06, 0.36, 0.2, 0.4, 0.03, 0.1, 0xced4da);
      tree(-0.38, 0.35, 0.45, r[0]);
      break;
    case "villa":
      B(-0.06, 0.08, -0.08, 0.7, 0.26, 0.5, wall);
      B(-0.14, 0.34, -0.12, 0.46, 0.24, 0.36, wall);
      B(-0.14, 0.44, -0.12, 0.47, 0.06, 0.37, 0x495057, 0, "glass");
      B(-0.06, 0.34, -0.08, 0.76, 0.03, 0.56, roof);
      B(-0.14, 0.58, -0.12, 0.54, 0.04, 0.44, roof);
      for (const cx of [-0.3, -0.12, 0.06]) B(cx, 0.08, 0.19, 0.04, 0.26, 0.04, 0xf8f9fa, 0, "cyl");
      pool(B, 0.3, 0.08, 0.27, 0.26, 0.18, false);
      tree(0.36, -0.3, 0.5, r[0]);
      break;
    default: {
      // cottage
      B(0, 0.08, 0, 0.54, 0.38, 0.48, wall);
      roofOn(0, 0.46, 0, 0.54, 0.48, 0.3);
      B(0, 0.08, 0.245, 0.11, 0.22, 0.02, 0x6b4430);
      B(0.14, 0.62, -0.1, 0.07, 0.16, 0.07, 0xb5654a);
      tree(0.36, 0.32, 0.5, r[0]);
    }
  }
  // The name board by the path, in the players' purple.
  B(-0.13, 0.08, 0.4, 0.02, 0.14, 0.02, 0x8d5a3b);
  B(-0.13, 0.19, 0.405, 0.2, 0.08, 0.02, 0x7048e8);
}

function basePartsFor(t: Tile, plan: CityPlan, add: (mesh: string, p: Omit<Part, "tile">) => void) {
  const { x, z, r } = t;
  const pal = plan.palette;
  const pick = (list: number[], v: number) => list[Math.floor(v * list.length) % list.length];
  const tree = (dx: number, dz: number, size: number, v: number) => {
    add("trunk", { x: x + dx, y: 0.08, z: z + dz, sx: size, sy: 0.35 * size, sz: size, ry: 0, color: 0x8a6a4f });
    add("crown", { x: x + dx, y: 0.08 + 0.25 * size, z: z + dz, sx: 0.6 * size, sy: 0.75 * size, sz: 0.6 * size, ry: v * 6, color: pick(pal.leaves, v) });
  };

  if (t.kind === "river" || t.kind === "lake") {
    // The water itself is one smooth surface over all the water tiles (see ./city/water).
    if (t.jetty !== undefined) jettyParts(t, add);
    return;
  }

  if (t.kind === "bridge") {
    // A humped bridge: ramps up from the road on both banks, a flat span with an arch
    // under it, railings and street lamps. Drawn along x, turned for streets along z.
    const alongX = t.road === "x";
    const ry = alongX ? 0 : Math.PI / 2;
    const at = (dx: number, dz: number) => (alongX ? { x: x + dx, z: z + dz } : { x: x + dz, z: z - dx });
    const rise = BRIDGE_TOP - 0.06;
    const ramp = Math.atan2(rise, 0.3);
    const rampLen = Math.hypot(0.3, rise) + 0.02;
    const segs = [
      { dx: -0.35, y: 0.06 + rise / 2, len: rampLen, tilt: ramp },
      { dx: 0, y: BRIDGE_TOP, len: 0.42, tilt: 0 },
      { dx: 0.35, y: 0.06 + rise / 2, len: rampLen, tilt: -ramp },
    ];
    for (const sg of segs) {
      const c = at(sg.dx, 0);
      add("building", { ...c, y: sg.y - 0.06, sx: sg.len, sy: 0.05, sz: 0.66, ry, tilt: sg.tilt, color: 0xd5d9df });
      add("ground", { ...c, y: sg.y - 0.012, sx: sg.len, sy: 0.014, sz: 0.5, ry, tilt: sg.tilt, color: ASPHALT });
      for (const side of [-0.31, 0.31]) {
        const r2 = at(sg.dx, side);
        add("building", { ...r2, y: sg.y, sx: sg.len, sy: 0.06, sz: 0.03, ry, tilt: sg.tilt, color: 0xc0504a });
      }
    }
    for (const side of [-0.3, 0.3]) {
      add("arch", { ...at(0, side), y: -0.06, sx: 1, sy: 1, sz: 1, ry, color: 0xb9c0c9 });
      const lamp = at(0, side + (side > 0 ? 0.02 : -0.02));
      add("trunk", { ...lamp, y: BRIDGE_TOP, sx: 0.35, sy: 0.32, sz: 0.35, ry: 0, color: 0x495057 });
      add("disc", { ...lamp, y: BRIDGE_TOP + 0.32, sx: 0.07, sy: 0.04, sz: 0.07, ry: 0, color: 0xffe8a3 });
    }
    return;
  }

  if (t.kind === "road" && t.causeway) {
    causewayParts(t, add);
    return;
  }

  if (t.kind === "road") {
    const m = t.mask ?? 0;
    // Bends: pavement with a curved stretch of road sweeping round the corner.
    const bend: Record<number, [number, number, number]> = { 3: [0.5, -0.5, Math.PI], 6: [0.5, 0.5, Math.PI / 2], 12: [-0.5, 0.5, 0], 9: [-0.5, -0.5, -Math.PI / 2] };
    if (bend[m]) {
      const [cx, cz, ry] = bend[m];
      add("ground", { x, y: 0, z, sx: 1, sy: 0.06, sz: 1, ry: 0, color: SIDEWALK });
      add("curve", { x: x + cx, y: 0.062, z: z + cz, sx: 1, sy: 1, sz: 1, ry, color: ASPHALT });
      add("curveLine", { x: x + cx, y: 0.064, z: z + cz, sx: 1, sy: 1, sz: 1, ry, color: 0xffffff });
      // A tree tucked into the outside of the bend.
      add("trunk", { x: x - cx * 0.7, y: 0.06, z: z - cz * 0.7, sx: 0.45, sy: 0.16, sz: 0.45, ry: 0, color: 0x8a6a4f });
      add("crown", { x: x - cx * 0.7, y: 0.17, z: z - cz * 0.7, sx: 0.27, sy: 0.34, sz: 0.27, ry: t.r[0] * 6, color: plan.palette.leaves[0] });
      return;
    }
    add("ground", { x, y: 0, z, sx: 1, sy: 0.06, sz: 1, ry: 0, color: ASPHALT });
    if (t.roundabout) {
      // Roundabout: a grassy island with a fountain or a tree, and a painted ring.
      add("curveLine", { x: x + 0.5, y: 0.064, z: z - 0.5, sx: 0.8, sy: 1, sz: 0.8, ry: Math.PI, color: 0xffffff });
      add("curveLine", { x: x + 0.5, y: 0.064, z: z + 0.5, sx: 0.8, sy: 1, sz: 0.8, ry: Math.PI / 2, color: 0xffffff });
      add("curveLine", { x: x - 0.5, y: 0.064, z: z + 0.5, sx: 0.8, sy: 1, sz: 0.8, ry: 0, color: 0xffffff });
      add("curveLine", { x: x - 0.5, y: 0.064, z: z - 0.5, sx: 0.8, sy: 1, sz: 0.8, ry: -Math.PI / 2, color: 0xffffff });
      add("disc", { x, y: 0.06, z, sx: 0.46, sy: 0.08, sz: 0.46, ry: 0, color: 0xdee2e6 });
      add("disc", { x, y: 0.06, z, sx: 0.4, sy: 0.1, sz: 0.4, ry: 0, color: GRASS });
      if (t.r[1] < 0.5) {
        add("disc", { x, y: 0.16, z, sx: 0.2, sy: 0.06, sz: 0.2, ry: 0, color: 0xcfd6dd });
        add("waterDisc", { x, y: 0.2, z, sx: 0.17, sy: 0.02, sz: 0.17, ry: 0, color: WATER });
        add("cyl", { x, y: 0.16, z, sx: 0.04, sy: 0.18, sz: 0.04, ry: 0, color: 0xcfd6dd });
      } else {
        add("trunk", { x, y: 0.16, z, sx: 0.6, sy: 0.2, sz: 0.6, ry: 0, color: 0x8a6a4f });
        add("crown", { x, y: 0.3, z, sx: 0.32, sy: 0.4, sz: 0.32, ry: t.r[2] * 6, color: plan.palette.leaves[1] });
      }
      return;
    }
    const straight = m === 5 || m === 10 || m === 1 || m === 4 || m === 2 || m === 8;
    if (straight) {
      const along = m === 10 || m === 2 || m === 8;
      // A street light on every other stretch, alternating sides.
      if ((x + z) % 2 === 0) {
        const side = (x * 3 + z) % 4 < 2 ? 0.47 : -0.47;
        const lx = along ? x : x + side;
        const lz = along ? z + side : z;
        add("trunk", { x: lx, y: 0.06, z: lz, sx: 0.3, sy: 0.5, sz: 0.3, ry: 0, color: 0x495057 });
        add("lamp", { x: lx - (along ? 0 : side * 0.12), y: 0.56, z: lz - (along ? side * 0.12 : 0), sx: 0.11, sy: 0.07, sz: 0.11, ry: 0, color: 0xffffff });
      }
      for (const o of [-0.25, 0.25]) {
        add("paint", { x: x + (along ? o : 0), y: 0.061, z: z + (along ? 0 : o), sx: along ? 0.22 : 0.04, sy: 0.005, sz: along ? 0.04 : 0.22, ry: 0, color: 0xffffff });
      }
      // Dead end: a turning circle.
      if (m === 1 || m === 4 || m === 2 || m === 8) add("disc", { x, y: 0.0, z, sx: 1.05, sy: 0.061, sz: 1.05, ry: 0, color: ASPHALT });
      if (t.works) roadWorksParts(t, along, add);
      else if (t.incident) incidentParts(t, along, plan, add);
    } else {
      // Junctions: a zebra crossing on each side that has a road.
      add("ground", { x, y: 0, z, sx: 0.5, sy: 0.062, sz: 0.5, ry: 0, color: 0x6a7380 });
      // Traffic lights on two opposite corners, one for each direction of traffic. The bulbs
      // are coloured live (see updateSignals); their colour here only says which is which.
      for (const [cx, cz, axis] of [[0.43, -0.43, 0], [-0.43, 0.43, 1]] as const) {
        add("trunk", { x: x + cx, y: 0.06, z: z + cz, sx: 0.28, sy: 0.5, sz: 0.28, ry: 0, color: 0x343a40 });
        add("building", { x: x + cx, y: 0.42, z: z + cz, sx: 0.07, sy: 0.19, sz: 0.07, ry: 0, color: 0x212529 });
        for (let k = 0; k < 3; k++) {
          add("signal", { x: x + cx, y: 0.585 - k * 0.058, z: z + cz, sx: 0.05, sy: 0.05, sz: 0.05, ry: 0, color: SIGNAL_TAG + axis * 3 + k });
        }
      }
      for (const [bit, dx, dz] of [[1, 0, -0.38], [2, 0.38, 0], [4, 0, 0.38], [8, -0.38, 0]] as const) {
        if (!(m & bit)) continue;
        for (let k = -2; k <= 2; k++) {
          const ns = bit === 1 || bit === 4;
          add("paint", { x: x + dx + (ns ? k * 0.09 : 0), y: 0.061, z: z + dz + (ns ? 0 : k * 0.09), sx: ns ? 0.05 : 0.16, sy: 0.005, sz: ns ? 0.16 : 0.05, ry: 0, color: 0xffffff });
        }
      }
    }
    return;
  }

  const GREEN_LOTS = ["park", "trees", "pond", "ferris", "turbine", "watertower", "mast", "pitch", "playground", "school", "worship", "monument"];
  const greenStructure = t.kind === "structure" && ["funfair", "solar", "campus", "dam"].includes(t.structure!.type);
  const lot = GREEN_LOTS.includes(t.kind) || greenStructure ? GRASS : SIDEWALK;
  add("ground", { x, y: 0, z, sx: 0.98, sy: 0.08, sz: 0.98, ry: 0, color: lot });

  // Little helpers: a box / cylinder / cone standing on the ground at (dx, dz) from the tile centre.
  const B = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry = 0, mesh = "building", tilt = 0) =>
    add(mesh, { x: x + dx, y, z: z + dz, sx, sy, sz, ry, color, tilt });
  const bands = (dx: number, dz: number, w: number, d: number, from: number, to: number, step: number, color = 0x5d7fa3, ry = 0) => {
    for (let y = from + step; y < to - 0.05; y += step) B(dx, y, dz, w + 0.012, 0.07, d + 0.012, color, ry, "glass");
  };

  if (t.kind === "structure") {
    if (t.structure!.anchor) structureParts(t, plan, B, tree);
    return;
  }

  switch (t.kind) {
    case "tower": {
      const color = pick(pal.towers, r[3]);
      const w = 0.62 + r[2] * 0.18;
      if (t.v === 5) {
        supertallParts(t, color, B);
      } else if (t.v === 1) {
        // Round glass tower
        const h = t.top - 0.4;
        B(0, 0.08, 0, w, h, w, color, 0, "cyl");
        for (let y = 0.5; y < h; y += 0.42) B(0, 0.08 + y, 0, w + 0.03, 0.06, w + 0.03, 0x4c6e91, 0, "cyl");
        B(0, 0.08 + h, 0, w * 0.6, 0.25, w * 0.6, color, 0, "cyl");
        B(0, 0.33 + h, 0, 0.12, 0.35, 0.12, 0xdee2e6, 0, "cone");
      } else if (t.v === 2) {
        // Twisting tower: floors turn a little as they rise
        const h = t.top - 0.4;
        const floors = Math.max(4, Math.floor(h / 0.32));
        for (let k = 0; k < floors; k++) {
          B(0, 0.08 + k * (h / floors), 0, w * 0.9, h / floors - 0.03, w * 0.9, k % 2 ? color : 0x6c8eae, k * 0.11);
        }
      } else if (t.v === 3) {
        // Needle spire
        const h = t.top - 1.6;
        B(0, 0.08, 0, w, h * 0.8, w, color);
        bands(0, 0, w, w, 0.08, 0.08 + h * 0.8, 0.5);
        B(0, 0.08 + h * 0.8, 0, w * 0.7, h * 0.2, w * 0.7, color);
        B(0, 0.08 + h, 0, 0.16, 1.5, 0.16, 0xe9ecef, 0, "cone");
      } else if (t.v === 4) {
        // Helipad on the roof
        const h = t.top - 0.4;
        B(0, 0.08, 0, w + 0.06, h, w + 0.06, color);
        bands(0, 0, w + 0.06, w + 0.06, 0.08, 0.08 + h, 0.45);
        B(0, 0.08 + h, 0, w * 0.85, 0.03, w * 0.85, 0x495057, 0, "cyl");
        B(-0.08, 0.115 + h, 0, 0.04, 0.005, 0.26, 0xffffff, 0, "paint");
        B(0.08, 0.115 + h, 0, 0.04, 0.005, 0.26, 0xffffff, 0, "paint");
        B(0, 0.115 + h, 0, 0.16, 0.005, 0.04, 0xffffff, 0, "paint");
      } else {
        // Stepped tower
        const h = t.top - 0.4;
        B(0, 0.08, 0, w, h * 0.72, w, color);
        B(0, 0.08 + h * 0.72, 0, w * 0.78, h * 0.28, w * 0.78, color);
        B(0.08, 0.08 + h, -0.06, 0.18, 0.18, 0.14, 0xdee2e6);
        if (r[0] > 0.55) add("trunk", { x: x - 0.1, y: 0.08 + h, z: z + 0.08, sx: 0.25, sy: 0.6, sz: 0.25, ry: 0, color: 0xadb5bd });
        bands(0, 0, w, w, 0.08, 0.08 + h * 0.72, 0.55);
      }
      break;
    }
    case "office": {
      const h = t.top - 0.08;
      const color = pick(pal.offices, r[1]);
      if (t.v === 1) {
        // L-shaped block
        B(0, 0.08, -0.2, 0.84, h, 0.38, color);
        B(-0.23, 0.08, 0.12, 0.38, h * 0.7, 0.42, color);
        bands(0, -0.2, 0.84, 0.38, 0.08, 0.08 + h, 0.38, 0x6c8eae);
        tree(0.25, 0.25, 0.5, r[0]);
      } else if (t.v === 2) {
        // Rooftop garden and stepped terraces
        const w = 0.74;
        B(0, 0.08, 0, w, h, w * 0.85, color);
        bands(0, 0, w, w * 0.85, 0.08, 0.08 + h, 0.36, 0x6c8eae);
        B(0, 0.08 + h, 0, w * 0.9, 0.03, w * 0.75, GRASS, 0, "ground");
        add("crown", { x: x - 0.15, y: 0.11 + h, z, sx: 0.25, sy: 0.3, sz: 0.25, ry: r[2], color: pick(pal.leaves, r[3]) });
        add("crown", { x: x + 0.15, y: 0.11 + h, z: z + 0.1, sx: 0.2, sy: 0.25, sz: 0.2, ry: r[1], color: pick(pal.leaves, r[0]) });
      } else {
        const w = 0.7 + r[2] * 0.15;
        const d = 0.6 + r[3] * 0.25;
        B(0, 0.08, 0, w, h, d, color);
        for (let k = 1; k <= Math.floor(h / 0.38); k++) B(0, 0.08 + k * 0.38 - 0.16, 0, w + 0.01, 0.08, d + 0.01, 0x6c8eae, 0, "glass");
        B(-w * 0.2, 0.08 + h, 0, 0.16, 0.1, 0.16, 0xced4da);
      }
      break;
    }
    case "house": {
      if (t.home) {
        homeParts(t, B, add, tree);
        break;
      }
      const dx = (r[1] - 0.5) * 0.1;
      if (t.v === 1) {
        // Flat-roofed modern house with a pool
        B(dx - 0.08, 0.08, -0.05, 0.56, 0.3, 0.45, 0xf8f9fa);
        B(dx - 0.08, 0.2, -0.05, 0.57, 0.08, 0.46, 0x495057, 0, "glass");
        B(dx - 0.05, 0.38, -0.05, 0.68, 0.04, 0.55, 0xdee2e6);
        pool(B, dx + 0.3, 0.08, 0.22, 0.2, 0.28, false);
        tree(-0.36, 0.33, 0.45, r[0]);
      } else if (t.v === 2) {
        // Two-storey duplex with a garage
        const wall = pick(pal.walls, r[2]);
        B(dx - 0.06, 0.08, -0.04, 0.5, 0.6, 0.44, wall);
        add("roof", { x: x + dx - 0.06, y: 0.68, z: z - 0.04, sx: 0.58 / Math.SQRT2, sy: 0.26, sz: 0.52 / Math.SQRT2, ry: 0, color: pick(pal.roofs, r[3]) });
        B(dx + 0.3, 0.08, 0.05, 0.24, 0.22, 0.32, wall);
        B(dx - 0.06, 0.36, 0.2, 0.4, 0.03, 0.1, 0xced4da);
        tree(-0.38, 0.35, 0.45, r[0]);
      } else {
        const w = 0.5 + r[2] * 0.12;
        const d = 0.45 + r[3] * 0.12;
        B(dx, 0.08, 0, w, 0.38, d, pick(pal.walls, r[1]));
        add("roof", { x: x + dx, y: 0.46, z, sx: (w + 0.08) / Math.SQRT2, sy: 0.3, sz: (d + 0.08) / Math.SQRT2, ry: 0, color: pick(pal.roofs, r[3]) });
        tree(0.34 * (dx > 0 ? -1 : 1), 0.32, 0.55, r[0]);
      }
      break;
    }
    case "hospital":
      B(0, 0.08, -0.05, 0.82, 1.25, 0.62, 0xf8f9fa);
      B(0.2, 0.08, 0.2, 0.42, 0.7, 0.5, 0xf1f3f5);
      bands(0, -0.05, 0.82, 0.62, 0.08, 1.33, 0.32, 0x74c0fc);
      B(-0.15, 0.62, 0.265, 0.08, 0.3, 0.02, 0xe03131, 0, "paint");
      B(-0.15, 0.73, 0.265, 0.3, 0.08, 0.02, 0xe03131, 0, "paint");
      B(0, 1.33, -0.05, 0.5, 0.02, 0.5, 0x495057, 0, "cyl");
      B(0, 1.355, -0.05, 0.05, 0.005, 0.2, 0xe03131, 0, "paint");
      B(0, 1.355, -0.05, 0.2, 0.005, 0.05, 0xe03131, 0, "paint");
      break;
    case "clock":
      B(0, 0.08, 0, 0.6, 0.1, 0.6, 0xe7e1d5);
      B(0, 0.18, 0, 0.32, 1.9, 0.32, 0xd9c7a7);
      for (const [fx, fz, ry] of [[0, 0.165, Math.PI / 2], [0, -0.165, Math.PI / 2], [0.165, 0, 0], [-0.165, 0, 0]] as const) {
        B(fx, 1.78, fz, 0.24, 0.02, 0.24, 0xffffff, ry, "disc", Math.PI / 2);
      }
      add("roof", { x, y: 2.08, z, sx: 0.4 / Math.SQRT2, sy: 0.5, sz: 0.4 / Math.SQRT2, ry: 0, color: 0x2f9e44 });
      tree(0.32, 0.32, 0.45, r[0]);
      break;
    case "crane":
      // A building site: the building itself goes up during the hunt (see createSites), the
      // crane's arm is added separately so it can turn. Here: the earth, a fence, the mast.
      B(-0.06, 0.08, 0.05, 0.74, 0.004, 0.72, 0x9c8466, 0, "ground");
      for (const [fx, fz, fw, fd] of [[0, -0.45, 0.9, 0.02], [0, 0.45, 0.9, 0.02], [-0.45, 0, 0.02, 0.9]] as const) {
        B(fx, 0.08, fz, fw, 0.1, fd, 0xff922b);
      }
      B(0.32, 0.08, -0.32, 0.08, 3.0, 0.08, 0xfab005);
      B(0.3, 0.08, 0.3, 0.2, 0.12, 0.14, 0xf2b705);
      break;
    case "watertower":
      for (const [lx, lz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
        add("trunk", { x: x + lx, y: 0.08, z: z + lz, sx: 0.6, sy: 1.3, sz: 0.6, ry: 0, color: 0x868e96 });
      }
      B(0, 1.35, 0, 0.55, 0.5, 0.55, 0x74c0fc, 0, "cyl");
      B(0, 1.85, 0, 0.6, 0.3, 0.6, 0x495057, 0, "cone");
      break;
    case "mast":
      B(0, 0.08, 0, 0.3, 0.2, 0.3, 0xadb5bd);
      B(0, 0.28, 0, 0.28, 3.6, 0.28, 0xf03e3e, 0, "cone");
      for (const y of [1.0, 1.9, 2.8]) B(0, 0.28 + y, 0, 0.28 * (1 - y / 3.6) + 0.02, 0.18, 0.28 * (1 - y / 3.6) + 0.02, 0xffffff, 0, "cyl");
      break;
    case "police": {
      // Blue-and-white police station with a light on the roof and a patrol car outside.
      B(-0.05, 0.08, -0.08, 0.72, 0.62, 0.55, 0xf8f9fa);
      B(-0.05, 0.42, -0.08, 0.73, 0.1, 0.56, 0x1c3faa);
      B(-0.05, 0.7, -0.08, 0.5, 0.04, 0.4, 0xdee2e6);
      B(-0.05, 0.74, -0.08, 0.08, 0.08, 0.08, 0x4dabf7, 0, "lamp");
      B(-0.05, 0.08, 0.22, 0.24, 0.24, 0.04, 0x1c3faa);
      B(0.28, 0.08, 0.34, 0.3, 0.09, 0.15, 0xffffff);
      B(0.28, 0.12, 0.34, 0.305, 0.03, 0.155, 0x1c3faa);
      B(0.28, 0.17, 0.34, 0.15, 0.06, 0.13, 0x343a40);
      break;
    }
    case "fuel": {
      const brand = [0xe03131, 0x1971c2, 0x2f9e44, 0xf08c00][Math.floor(r[2] * 4)];
      for (const [px, pz] of [[-0.32, -0.2], [0.32, -0.2], [-0.32, 0.25], [0.32, 0.25]]) {
        add("trunk", { x: x + px, y: 0.08, z: z + pz, sx: 0.5, sy: 0.42, sz: 0.5, ry: 0, color: 0xdee2e6 });
      }
      B(0, 0.48, 0.02, 0.84, 0.06, 0.6, brand);
      B(0, 0.08, -0.05, 0.08, 0.16, 0.12, brand);
      B(0, 0.08, 0.15, 0.08, 0.16, 0.12, brand);
      B(-0.22, 0.08, -0.36, 0.45, 0.28, 0.22, 0xf8f9fa);
      break;
    }
    case "park": {
      const n = 2 + Math.floor(r[1] * 3);
      for (let k = 0; k < n; k++) {
        const a = r[2] * 6.28 + (k * 6.28) / n;
        tree(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.7 + ((r[3] * (k + 1)) % 0.4), (r[0] + k * 0.37) % 1);
      }
      add("disc", { x, y: 0.08, z, sx: 0.32, sy: 0.01, sz: 0.32, ry: 0, color: 0xe9dcc3 });
      break;
    }
    case "trees":
      for (let k = 0; k < 5; k++) {
        tree((hashish(r[1], k) - 0.5) * 0.7, (hashish(r[2], k) - 0.5) * 0.7, 0.75 + hashish(r[3], k) * 0.5, hashish(r[0], k));
      }
      break;
    case "pond":
      pond(B, 0.08, r);
      tree(0.36, -0.36, 0.6, r[2]);
      break;
    case "ferris":
      // The legs; the turning wheel is added separately (see landmarks).
      for (const o of [-0.2, 0.2]) {
        add("building", { x: x + o, y: 0.08, z, sx: 0.05, sy: 1.25, sz: 0.05, ry: 0, color: 0xdee2e6 });
      }
      add("building", { x, y: 0.08, z: z + 0.32, sx: 0.5, sy: 0.12, sz: 0.2, ry: 0, color: 0xf08c6b });
      break;
    case "turbine":
      add("trunk", { x, y: 0.08, z, sx: 1.1, sy: 2.6, sz: 1.1, ry: 0, color: 0xf1f3f5 });
      add("building", { x, y: 2.6, z: z + 0.02, sx: 0.1, sy: 0.1, sz: 0.2, ry: 0, color: 0xf1f3f5 });
      tree(0.32, 0.3, 0.5, r[1]);
      break;
    case "stadium":
      add("disc", { x, y: 0.08, z, sx: 0.96, sy: 0.4, sz: 0.82, ry: 0, color: 0xdfe3e8 });
      add("disc", { x, y: 0.08, z, sx: 0.78, sy: 0.43, sz: 0.62, ry: 0, color: 0xd9734e });
      add("disc", { x, y: 0.08, z, sx: 0.62, sy: 0.44, sz: 0.46, ry: 0, color: 0x69c06a });
      add("paint", { x, y: 0.52, z, sx: 0.02, sy: 0.005, sz: 0.4, ry: 0, color: 0xffffff });
      break;
    case "billboard":
      // The board itself is added separately (see billboards); a little greenery here.
      add("ground", { x, y: 0.08, z, sx: 0.5, sy: 0.01, sz: 0.5, ry: 0, color: GRASS });
      break;
    case "plaza":
      add("ground", { x, y: 0.08, z, sx: 0.8, sy: 0.02, sz: 0.8, ry: 0, color: 0xe7e1d5 });
      if (t.forecourt) {
        // Under the station hall's roof: benches and planters.
        for (const [px, pz] of [[-0.25, -0.25], [0.25, 0.25]]) {
          B(px, 0.1, pz, 0.22, 0.05, 0.06, 0x8d5a3b);
          tree(-px, pz, 0.35, r[0]);
        }
      } else if (r[1] < 0.22 && !t.rail) {
        // A statue on a plinth in the middle of the square.
        statue(B, 0, 0, 0.7);
      } else {
        add("disc", { x, y: 0.1, z, sx: 0.3, sy: 0.12, sz: 0.3, ry: 0, color: 0xcfd6dd });
        add("waterDisc", { x, y: 0.22, z, sx: 0.25, sy: 0.02, sz: 0.25, ry: 0, color: WATER });
        add("cyl", { x, y: 0.22, z, sx: 0.04, sy: 0.12, sz: 0.04, ry: 0, color: 0xcfd6dd });
      }
      break;
    case "school":
    case "worship":
    case "pitch":
    case "playground":
    case "monument":
      neighbourhoodParts(t, plan, B, tree);
      break;
    case "fire":
      fireStationParts(t, B);
      break;
    case "club":
      clubParts(t, B);
      break;
    case "restaurant":
      restaurantParts(t, B);
      break;
  }
  // A little named thing on some parks and squares (a suya spot, a danfo park, a mural...).
  if (t.egg) eggParts(t, B);
}

type AddFn = (mesh: string, p: Omit<Part, "tile">) => void;


/** A soft round glow (white in the middle, fading to nothing), for pools of light. */
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const c = canvas.getContext("2d")!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Road works on a straight road: a dug-up patch, barriers, cones, blinking lamps and a digger or roller. */
function roadWorksParts(t: Tile, along: boolean, add: AddFn) {
  // a = along the road, c = across it.
  const at = (a: number, c: number) => (along ? { x: t.x + a, z: t.z + c } : { x: t.x + c, z: t.z + a });
  const ry = along ? 0 : -Math.PI / 2;
  const P = (mesh: string, a: number, y: number, c: number, sa: number, sy: number, sc: number, color: number, tilt = 0, turn = 0) =>
    add(mesh, { ...at(a, c), y, sx: sa, sy, sz: sc, ry: ry + turn, color, tilt });
  // The hole and a heap of earth.
  P("ground", 0, 0.055, -0.04, 0.46, 0.012, 0.36, 0x7a5a3c);
  P("ground", 0, 0.062, -0.04, 0.34, 0.006, 0.24, 0x5e4430);
  add("crown", { ...at(0.12, 0.27), y: 0.04, sx: 0.22, sy: 0.14, sz: 0.18, ry: t.r[1] * 6, color: 0x8b6a48 });
  // Red-and-white barriers right across the road at both ends, with a blinking lamp on each.
  for (const a of [-0.4, 0.4]) {
    P("building", a, 0.15, 0, 0.035, 0.06, 0.74, 0xffffff);
    for (const c of [-0.27, 0, 0.27]) P("paint", a, 0.15, c, 0.04, 0.062, 0.1, 0xe03131);
    for (const c of [-0.34, 0.34]) {
      P("trunk", a, 0.06, c, 0.2, 0.1, 0.2, 0x495057);
      add("flash", { ...at(a, c), y: 0.235, sx: 0.045, sy: 0.045, sz: 0.045, ry: 0, color: FLASH_TAG + FLASH.works });
    }
  }
  // Cones round the hole.
  for (const [a, c] of [[-0.24, -0.3], [0, -0.3], [0.24, -0.3], [-0.26, 0.18], [0.26, 0.18]]) {
    P("cone", a, 0.06, c, 0.07, 0.12, 0.07, 0xff7a1a);
    P("paint", a, 0.06, c, 0.09, 0.012, 0.09, 0x343a40);
  }
  if (t.r[2] < 0.6) {
    // A little digger: tracks, a yellow body, a cab and an arm reaching into the hole.
    const c0 = 0.22;
    P("building", -0.14, 0.06, c0, 0.24, 0.045, 0.15, 0x343a40);
    P("building", -0.14, 0.105, c0, 0.2, 0.07, 0.13, 0xf2b705);
    P("glass", -0.18, 0.175, c0, 0.09, 0.09, 0.11, 0x74c0fc);
    P("building", -0.18, 0.265, c0, 0.1, 0.015, 0.12, 0xf2b705);
    P("building", -0.02, 0.17, c0 - 0.06, 0.2, 0.03, 0.03, 0xf2b705, 0.55);
    P("building", 0.07, 0.1, c0 - 0.12, 0.03, 0.14, 0.03, 0xf2b705, -0.35);
    P("building", 0.1, 0.07, c0 - 0.16, 0.07, 0.05, 0.07, 0x495057);
  } else {
    // A road roller: a drum at the front, a body and a canopy.
    const c0 = 0.24;
    // (the drum is a lying cylinder drawn from one end, so shift it to centre it)
    add("cyl", { ...at(0.0, along ? c0 - 0.075 : c0 + 0.075), y: 0.105, sx: 0.09, sy: 0.15, sz: 0.09, ry: ry + Math.PI / 2, color: 0x868e96, tilt: Math.PI / 2 });
    P("building", -0.15, 0.07, c0, 0.18, 0.08, 0.13, 0xf2b705);
    P("trunk", -0.18, 0.15, c0, 0.15, 0.12, 0.15, 0x343a40);
    P("building", -0.17, 0.27, c0, 0.14, 0.015, 0.14, 0xf2b705);
  }
}

/** A broken-down car with its hazards on and its bonnet up, or a police car with lights flashing. */
function incidentParts(t: Tile, along: boolean, plan: CityPlan, add: AddFn) {
  const at = (a: number, c: number) => (along ? { x: t.x + a, z: t.z + c } : { x: t.x + c, z: t.z + a });
  const ry = along ? 0 : -Math.PI / 2;
  const side = t.r[1] < 0.5 ? 0.33 : -0.33;
  const P = (mesh: string, a: number, y: number, c: number, sa: number, sy: number, sc: number, color: number, tilt = 0) =>
    add(mesh, { ...at(a, c), y, sx: sa, sy, sz: sc, ry, color, tilt });
  const flash = (a: number, y: number, c: number, kind: number, size = 0.035) =>
    add("flash", { ...at(a, c), y, sx: size, sy: size, sz: size, ry: 0, color: FLASH_TAG + kind });
  if (t.incident === "breakdown") {
    const body = plan.palette.car[Math.floor(t.r[2] * plan.palette.car.length) % plan.palette.car.length];
    P("building", 0, 0.06, side, 0.3, 0.09, 0.15, body);
    P("building", -0.03, 0.15, side, 0.15, 0.06, 0.13, 0xe9f2fb);
    // Bonnet up.
    P("building", 0.1, 0.19, side, 0.1, 0.008, 0.13, body, -1.0);
    for (const a of [-0.15, 0.15]) for (const c of [-0.06, 0.06]) flash(a, 0.12, side + c, FLASH.hazard, 0.03);
    // A warning triangle behind it.
    add("roof", { ...at(-0.36, side), y: 0.06, sx: 0.035, sy: 0.07, sz: 0.035, ry: ry + Math.PI / 4, color: 0xe03131 });
  } else {
    P("building", 0, 0.06, side, 0.32, 0.09, 0.16, 0xffffff);
    P("paint", 0, 0.09, side, 0.325, 0.03, 0.165, 0x1c3faa);
    P("building", -0.02, 0.15, side, 0.16, 0.06, 0.14, 0x343a40);
    flash(-0.02, 0.225, side - 0.04, FLASH.policeRed);
    flash(-0.02, 0.225, side + 0.04, FLASH.policeBlue);
  }
}

type BoxFn = (dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: number, ry?: number, mesh?: string, tilt?: number) => void;
type TreeFn = (dx: number, dz: number, size: number, v: number) => void;

/** The big 2×2 buildings, drawn from their corner tile (the block's centre is at +0.5, +0.5). */
function structureParts(t: Tile, plan: CityPlan, B: BoxFn, tree: TreeFn) {
  // The big ones (the stadium, the capitol, mega malls) have their own drawings.
  if (megaParts(t, B, tree)) return;
  const st = t.structure!;
  const pal = plan.palette;
  const r = t.r;
  const pick = (list: number[], v: number) => list[Math.floor(v * list.length) % list.length];
  const c = 0.5; // centre offset
  const floor =
    st.type === "funfair" || st.type === "solar" || st.type === "campus" || st.type === "dam"
      ? GRASS
      : st.type === "military"
        ? 0xa3ad7f
        : st.type === "airport"
          ? 0xb7c4a5
          : st.type === "power"
            ? 0xc9cdd2
            : st.type === "oilrig"
              ? 0x2f74b5
              : st.type === "waterpark"
                ? 0xd9eeea
                : 0xe7e1d5;
  B(c, 0.02, c, 1.98, 0.07, 1.98, floor, 0, "ground");
  switch (st.type) {
    case "mall": {
      const color = pick(pal.offices, r[1]);
      B(c, 0.09, c - 0.3, 1.7, 0.6, 1.05, color);
      B(c, 0.09, c - 0.3, 1.71, 0.12, 1.06, 0x6c8eae, 0, "glass");
      B(c, 0.69, c - 0.3, 0.8, 0.32, 0.6, 0xa5d8ff, 0, "glass");
      B(c, 0.4, c + 0.25, 0.6, 0.05, 0.12, 0xfa5252);
      B(c, 0.09, c + 0.6, 1.7, 0.012, 0.66, ASPHALT, 0, "ground");
      for (let k = -3; k <= 3; k++) B(c + k * 0.22, 0.103, c + 0.6, 0.02, 0.004, 0.3, 0xffffff, 0, "paint");
      break;
    }
    case "twin": {
      const color = pick(pal.towers, r[2]);
      const H = 6 + r[1] * 1.5;
      for (const side of [-0.42, 0.42]) {
        B(c + side, 0.09, c, 0.6, H, 0.6, color);
        for (let y = 0.6; y < H - 0.2; y += 0.55) B(c + side, 0.09 + y, c, 0.612, 0.07, 0.612, 0x5d7fa3, 0, "glass");
        B(c + side, 0.09 + H, c, 0.12, 0.9, 0.12, 0xe9ecef, 0, "cone");
      }
      B(c, 0.09 + H * 0.55, c, 0.3, 0.22, 0.28, 0xadb5bd);
      break;
    }
    case "museum": {
      B(c, 0.09, c, 1.8, 0.15, 1.6, 0xf1ece2);
      B(c, 0.24, c - 0.1, 1.3, 0.65, 1.0, 0xf8f4ec);
      B(c, 0.89, c - 0.1, 0.9, 0.6, 0.9, 0x96c7c1, 0, "dome");
      for (let k = 0; k < 6; k++) B(c - 0.55 + k * 0.22, 0.24, c + 0.5, 0.08, 0.6, 0.08, 0xffffff, 0, "cyl");
      B(c, 0.84, c + 0.5, 1.3, 0.08, 0.2, 0xf8f4ec);
      B(c, 0.09, c + 0.78, 1.2, 0.08, 0.2, 0xe9ecef);
      break;
    }
    case "funfair": {
      // Ferris wheel and carousel turn (see landmarks); tents and a little roller coaster here.
      const tents = [0xff6b6b, 0xffd43b, 0x4dabf7, 0xda77f2];
      [[c - 0.55, c + 0.55], [c - 0.2, c + 0.7], [c + 0.65, c - 0.6]].forEach(([tx, tz], k) => {
        B(tx, 0.09, tz, 0.3, 0.2, 0.3, 0xffffff, 0, "cyl");
        B(tx, 0.29, tz, 0.36, 0.3, 0.36, tents[k % tents.length], 0, "cone");
      });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI;
        B(c + 0.55 + Math.cos(a) * 0.35, 0.09, c + 0.55, 0.05, 0.3 + Math.sin(a) * 0.6, 0.05, 0xe03131);
      }
      B(c + 0.55, 0.39, c + 0.55, 1, 1, 1, 0xe03131, 0, "arch");
      break;
    }
    case "market": {
      const roofs = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xf783ac, 0xff922b];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const sx = c - 0.6 + i * 0.6;
          const sz = c - 0.6 + j * 0.6;
          B(sx, 0.09, sz, 0.36, 0.22, 0.36, 0xf1e3c8);
          B(sx, 0.31, sz, 0.48 / Math.SQRT2, 0.2, 0.48 / Math.SQRT2, roofs[(i * 3 + j + Math.floor(r[0] * 6)) % roofs.length], 0, "roof");
        }
      }
      break;
    }
    case "arena": {
      B(c, 0.09, c, 1.92, 0.62, 1.62, 0xdfe3e8, 0, "disc");
      B(c, 0.09, c, 1.6, 0.66, 1.3, 0xadb5bd, 0, "disc");
      B(c, 0.09, c, 1.35, 0.67, 1.05, 0xd9734e, 0, "disc");
      B(c, 0.09, c, 1.05, 0.68, 0.75, 0x69c06a, 0, "disc");
      B(c, 0.775, c, 0.02, 0.005, 0.6, 0xffffff, 0, "paint");
      for (const [lx, lz] of [[-0.85, -0.7], [0.85, -0.7], [-0.85, 0.7], [0.85, 0.7]]) {
        B(c + lx, 0.09, c + lz, 0.04, 1.3, 0.04, 0x868e96);
        B(c + lx, 1.39, c + lz, 0.2, 0.1, 0.06, 0xfff3bf);
      }
      break;
    }
    case "campus": {
      const brick = 0xb5523b;
      B(c, 0.09, c - 0.6, 1.4, 0.75, 0.4, brick);
      B(c, 0.09, c - 0.6, 1.41, 0.08, 0.41, 0xf1e3c8, 0, "glass");
      B(c - 0.68, 0.09, c + 0.1, 0.36, 0.55, 0.9, brick);
      B(c + 0.68, 0.09, c + 0.1, 0.36, 0.55, 0.9, brick);
      B(c, 0.09, c - 0.3, 0.2, 1.5, 0.2, 0xd9c7a7);
      B(c, 1.59, c - 0.3, 0.2 / Math.SQRT2 + 0.05, 0.25, 0.2 / Math.SQRT2 + 0.05, 0x2f9e44, 0, "roof");
      B(c, 0.09, c + 0.3, 0.12, 0.01, 0.9, 0xe9dcc3, 0, "ground");
      tree(c - 0.3, c + 0.45, 0.6, r[0]);
      tree(c + 0.3, c + 0.6, 0.55, r[1]);
      break;
    }
    case "hotel": {
      const color = pick(pal.towers, r[3]);
      B(c, 0.09, c - 0.1, 1.6, 0.4, 1.1, 0xf1f3f5);
      B(c - 0.2, 0.49, c - 0.25, 0.95, 3.7, 0.55, color);
      for (let y = 0.4; y < 3.6; y += 0.4) B(c - 0.2, 0.49 + y, c - 0.25, 0.962, 0.06, 0.562, 0x4c6e91, 0, "glass");
      B(c - 0.2, 4.19, c - 0.25, 0.7, 0.2, 0.4, 0xffd43b);
      pool(B, c + 0.5, 0.49, c + 0.2, 0.4, 0.46, true);
      tree(c + 0.75, c + 0.75, 0.6, r[2]);
      break;
    }
    case "airport": {
      // Runway with markings, a terminal, a control tower, a hangar and a parked plane.
      B(c, 0.09, c + 0.35, 1.94, 0.012, 0.5, 0x4b5563, 0, "ground");
      for (let k = -3; k <= 3; k++) B(c + k * 0.25, 0.103, c + 0.35, 0.12, 0.004, 0.03, 0xffffff, 0, "paint");
      B(c - 0.9, 0.103, c + 0.35, 0.04, 0.004, 0.3, 0xffffff, 0, "paint");
      B(c + 0.9, 0.103, c + 0.35, 0.04, 0.004, 0.3, 0xffffff, 0, "paint");
      B(c - 0.15, 0.09, c - 0.5, 1.0, 0.32, 0.42, 0xe9ecef);
      B(c - 0.15, 0.19, c - 0.5, 1.01, 0.1, 0.43, 0x74c0fc, 0, "glass");
      B(c + 0.7, 0.09, c - 0.55, 0.12, 1.25, 0.12, 0xdee2e6, 0, "cyl");
      B(c + 0.7, 1.34, c - 0.55, 0.3, 0.16, 0.3, 0x4dabf7, 0, "cyl");
      B(c + 0.7, 1.5, c - 0.55, 0.32, 0.04, 0.32, 0x495057, 0, "cyl");
      B(c - 0.75, 0.09, c - 0.05, 0.42, 0.28, 0.3, 0xadb5bd, 0, "dome");
      // A parked airliner: fuselage with a nose and tail cone, swept wings, engines, tail fin.
      B(c + 0.6, 0.16, c - 0.05, 0.085, 0.58, 0.085, 0xf8f9fa, 0, "cyl", Math.PI / 2);
      B(c + 0.6, 0.16, c - 0.05, 0.085, 0.07, 0.085, 0xf8f9fa, 0, "cone", -Math.PI / 2);
      B(c + 0.02, 0.165, c - 0.05, 0.08, 0.1, 0.08, 0xf8f9fa, 0, "cone", Math.PI / 2);
      for (const s of [-1, 1]) {
        B(c + 0.27, 0.14, c - 0.05 + s * 0.16, 0.1, 0.012, 0.28, 0xdee2e6, -s * 0.45);
        B(c + 0.36, 0.105, c - 0.05 + s * 0.11, 0.035, 0.08, 0.035, 0xadb5bd, 0, "cyl", -Math.PI / 2);
        B(c + 0.05, 0.17, c - 0.05 + s * 0.06, 0.05, 0.008, 0.1, 0xf8f9fa, -s * 0.5);
      }
      B(c + 0.33, 0.175, c - 0.05, 0.4, 0.012, 0.087, 0x2f9e44);
      B(c + 0.08, 0.2, c - 0.05, 0.1, 0.13, 0.012, 0x2f9e44, 0, undefined, 0.55);
      break;
    }
    case "port": {
      // A harbour basin with a ship, container stacks and a big gantry crane.
      B(c, 0.0, c + 0.45, 1.98, 0.08, 1.05, 0x5b9bd5, 0, "water");
      B(c, 0.09, c - 0.55, 1.98, 0.04, 0.85, 0xced4da, 0, "ground");
      const boxes = [0xe5484d, 0x228be6, 0xfab005, 0x2f9e44, 0xf76707, 0x7048e8];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 2; j++)
          for (let h = 0; h <= (i + j) % 3; h++) B(c - 0.75 + i * 0.25, 0.13 + h * 0.11, c - 0.75 + j * 0.16, 0.22, 0.1, 0.13, boxes[(i * 2 + j + h) % boxes.length]);
      B(c + 0.45, 0.13, c - 0.3, 0.06, 1.3, 0.06, 0xe03131);
      B(c + 0.75, 0.13, c - 0.3, 0.06, 1.3, 0.06, 0xe03131);
      B(c + 0.6, 1.43, c + 0.05, 0.4, 0.08, 1.0, 0xe03131);
      // The ship
      B(c - 0.1, 0.0, c + 0.5, 1.2, 0.22, 0.36, 0x343a40);
      B(c - 0.1, 0.22, c + 0.5, 1.15, 0.04, 0.34, 0xc92a2a);
      B(c - 0.55, 0.26, c + 0.5, 0.22, 0.3, 0.28, 0xffffff);
      for (let k = 0; k < 3; k++) B(c - 0.2 + k * 0.25, 0.26, c + 0.5, 0.2, 0.12, 0.26, boxes[k + 2]);
      break;
    }
    case "military": {
      // A fenced camp: barracks, tents, a watchtower, a flag, and a tank.
      for (const [fx, fz, w, d] of [[c, c - 0.95, 1.9, 0.03], [c, c + 0.95, 1.9, 0.03], [c - 0.95, c, 0.03, 1.9], [c + 0.95, c, 0.03, 1.9]]) {
        B(fx, 0.09, fz, w, 0.12, d, 0x868e96);
      }
      B(c - 0.45, 0.09, c - 0.5, 0.7, 0.3, 0.32, 0x6b7a4b);
      B(c - 0.45, 0.39, c - 0.5, 0.72 / Math.SQRT2, 0.14, 0.34 / Math.SQRT2, 0x55603b, 0, "roof");
      for (const [tx, tz] of [[c + 0.25, c - 0.55], [c + 0.6, c - 0.55], [c + 0.6, c - 0.15]]) {
        B(tx, 0.09, tz, 0.3 / Math.SQRT2, 0.26, 0.3 / Math.SQRT2, 0x5c6b3a, 0, "roof");
      }
      for (const [lx, lz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) B(c - 0.75 + lx, 0.09, c + 0.7 + lz, 0.025, 0.85, 0.025, 0x495057);
      B(c - 0.75, 0.94, c + 0.7, 0.26, 0.16, 0.26, 0x6b7a4b);
      B(c, 0.09, c + 0.1, 0.02, 1.0, 0.02, 0xdee2e6);
      B(c + 0.13, 0.95, c + 0.1, 0.24, 0.13, 0.01, 0x2f9e44, 0, "paint");
      // Tank
      B(c + 0.4, 0.09, c + 0.55, 0.42, 0.12, 0.26, 0x55603b);
      B(c + 0.4, 0.21, c + 0.55, 0.22, 0.09, 0.18, 0x6b7a4b);
      B(c + 0.15, 0.25, c + 0.55, 0.3, 0.03, 0.03, 0x343a40);
      break;
    }
    case "power":
    case "dam":
    case "oilrig":
      industryParts(st.type, B);
      break;
    case "waterpark":
      waterparkParts(t, B, tree);
      break;
    case "court":
    case "boxing":
    case "wrestling":
      venueParts(t, B);
      break;
    case "solar": {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          B(c - 0.66 + i * 0.44, 0.16, c - 0.55 + j * 0.5, 0.38, 0.02, 0.3, 0x1c3f6e, 0, "glass", 0);
          B(c - 0.66 + i * 0.44, 0.09, c - 0.55 + j * 0.5, 0.03, 0.08, 0.03, 0x868e96);
        }
      }
      B(c + 0.7, 0.09, c + 0.75, 0.3, 0.25, 0.25, 0xf1f3f5);
      break;
    }
  }
}

/**
 * An ad's picture, letterboxed onto a 2:1 canvas (the billboard's shape): the whole picture
 * shows, and any space round it is filled with a soft blur of the picture itself.
 */
function adTexture(img: CanvasImageSource & { width: number; height: number }) {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d")!;
  const iw = img.width || W;
  const ih = img.height || H;
  // The blur: shrink the picture to a few pixels, then stretch it back up.
  const tiny = document.createElement("canvas");
  tiny.width = 16;
  tiny.height = 8;
  tiny.getContext("2d")!.drawImage(img, 0, 0, 16, 8);
  c.imageSmoothingEnabled = true;
  c.drawImage(tiny, 0, 0, W, H);
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.fillRect(0, 0, W, H);
  const k = Math.min(W / iw, H / ih);
  const dw = iw * k;
  const dh = ih * k;
  c.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A player's face as a round sprite texture (drawn from the same SVG as the rest of the app). */
const faceCache = new Map<string, THREE.CanvasTexture>();
function faceTexture(avatar: Avatar, ring: string) {
  const key = JSON.stringify(avatar) + ring;
  const cached = faceCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // As a picture on its own, an SVG needs its namespace (React leaves it out).
  const svg = renderToStaticMarkup(<AvatarFace avatar={avatar} size={128} ring={ring} />).replace(/^<svg(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  img.onload = () => {
    canvas.getContext("2d")!.drawImage(img, 0, 0, 128, 128);
    tex.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  faceCache.set(key, tex);
  return tex;
}

function labelTexture(text: string, bg: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.fillStyle = bg;
  c.beginPath();
  c.arc(64, 64, 56, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#ffffff";
  c.font = "800 72px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A cartoon "BOOM!" in a spiky yellow burst. */
function boomTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.beginPath();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    const r = k % 2 ? 0.62 : 1;
    const x = 128 + Math.cos(a) * 124 * r;
    const y = 64 + Math.sin(a) * 62 * r;
    if (k) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
  c.fillStyle = "#ffd43b";
  c.fill();
  c.lineWidth = 6;
  c.strokeStyle = "#e8590c";
  c.stroke();
  c.font = "900 52px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = 8;
  c.strokeStyle = "#ffffff";
  c.strokeText("BOOM!", 128, 68);
  c.fillStyle = "#e03131";
  c.fillText("BOOM!", 128, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hashish = (v: number, k: number) => {
  const s = Math.sin(v * 9301 + k * 49297) * 233280;
  return s - Math.floor(s);
};

const easeOutBack = (t: number) => {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// ---------------------------------------------------------------- component
export function CityView({
  seed,
  tileCount,
  markers,
  events,
  onBillboard,
  onHover,
  meAvatar,
  coinBalloon,
  onBalloon,
  progress,
  nightFirst,
  ads,
  onAdViews,
  revealed = true,
  roomCounts,
  onRoom,
  ride = null,
  onInteract,
  seats,
  mySeat = null,
  onRides,
  onRideEnd,
  steer = null,
  onJunction,
  onBalloons,
  caughtFaces,
  place = null,
  onNpc,
  spot = 0,
  onSpots,
  worldEvents,
  focusEvent = null,
  onEventTap,
  onEventInfo,
  liveVenues,
  clockOffsetMs = 0,
  houses,
  dance = null,
  dancers,
  friendsAt,
  openRoom = null,
  roomPeople,
  ghosts,
  onGhost,
  flyTo = null,
  paused = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    build: (seed: number, count: number) => void;
    setMarkers: (m: CityMarkers) => void;
    playEvents: (e: CityEvent[]) => void;
    setBalloon: (slot: number | null) => void;
    setAds: (ads: CityAd[]) => void;
    setRevealed: (on: boolean) => void;
    setRoomCounts: (counts: Record<string, number>) => void;
    setRide: (r: RideTarget | null) => void;
    setSteer: (dir: TurnDir) => void;
    setSeats: (list: Record<string, SeatTaker> | undefined, mine: string | null) => void;
    setPlace: (p: CityPlace | null) => void;
    setSpot: (n: number) => void;
    setCaughtFaces: (list: CaughtFace[] | undefined) => void;
    setWorldEvents: (list: WorldEvent[] | undefined) => void;
    setHouses: (list: TownHouse[] | undefined) => void;
    setDance: (me: CityDance | null, others: CityDancer[]) => void;
    setFriendPins: (list: CityFriendPin[]) => void;
    setRoomPeople: (list: CityPerson[]) => void;
    openRoom: (id: string) => void;
    focusEvent: (id: number) => void;
    setGhosts: (list: CityGhost[]) => void;
    flyToTile: (tile: number) => void;
  } | null>(null);
  const cb = useRef({ onHover, onBillboard, onBalloon, onAdViews, onRoom, onBalloons, onNpc, onSpots, onEventTap, onEventInfo, liveVenues, clockOffsetMs, onRides, onRideEnd, onJunction, onInteract, onGhost, paused });
  const atmos = useRef({ progress, nightFirst, meAvatar });
  useEffect(() => {
    cb.current = { onHover, onBillboard, onBalloon, onAdViews, onRoom, onBalloons, onNpc, onSpots, onEventTap, onEventInfo, liveVenues, clockOffsetMs, onRides, onRideEnd, onJunction, onInteract, onGhost, paused };
    atmos.current = { progress, nightFirst, meAvatar };
  });

  // Set up the scene once.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // Phones have very dense screens; 1.5× looks just as sharp and draws much faster.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 40, 110);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.2;
    controls.minDistance = 6;
    controls.maxDistance = 90;
    controls.screenSpacePanning = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    const hemi = new THREE.HemisphereLight(0xeef7ff, 0xc9d3c0, 1.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    // The flat ground the city stands on (a circle; the countryside starts round its edge).
    const base = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: GROUND }));
    base.receiveShadow = true;
    base.position.y = -0.01;
    scene.add(base);

    const geo = geometries();
    const mat = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const meshDefs: Record<string, { geometry: THREE.BufferGeometry; material: THREE.Material; shadow: boolean }> = {
      ground: { geometry: geo.box, material: mat(), shadow: false },
      paint: { geometry: geo.box, material: mat(), shadow: false },
      building: { geometry: geo.box, material: mat(), shadow: true },
      glass: { geometry: geo.box, material: mat({ emissive: 0x0b1a2a, emissiveIntensity: 0.2 }), shadow: false },
      roof: { geometry: geo.roof, material: mat({ flatShading: true }), shadow: true },
      crown: { geometry: geo.crown, material: mat({ flatShading: true }), shadow: true },
      trunk: { geometry: geo.trunk, material: mat(), shadow: true },
      disc: { geometry: geo.disc, material: mat(), shadow: false },
      arch: { geometry: geo.arch, material: mat(), shadow: true },
      cyl: { geometry: geo.cyl, material: mat(), shadow: true },
      cone: { geometry: geo.cone, material: mat({ flatShading: true }), shadow: true },
      dome: { geometry: geo.dome, material: mat(), shadow: true },
      curve: { geometry: geo.curve, material: mat(), shadow: false },
      curveLine: { geometry: geo.curveLine, material: mat(), shadow: false },
      // Street-lamp heads: plain colour that we brighten as night falls.
      lamp: { geometry: geo.lamp, material: lampMat, shadow: false },
      // Traffic-light bulbs (red, amber, green), lit in turn.
      signal: { geometry: geo.lamp, material: new THREE.MeshBasicMaterial({ color: 0xffffff }), shadow: false },
      // Blinking lamps: hazard lights, police lights, road-works lamps (see updateFlashers).
      flash: { geometry: geo.lamp, material: new THREE.MeshBasicMaterial({ color: 0xffffff }), shadow: false },
      water: { geometry: geo.box, material: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90, specular: 0xffffff }), shadow: false },
      // Round water: ponds, fountains.
      waterDisc: { geometry: geo.disc, material: new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 90, specular: 0xffffff }), shadow: false },
      cooling: { geometry: geo.cooling, material: mat({ side: THREE.DoubleSide }), shadow: true },
    };

    const city = new THREE.Group();
    scene.add(city);
    const moving = new THREE.Group();
    scene.add(moving);
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);
    const fxGroup = new THREE.Group();
    scene.add(fxGroup);
    // Street life (traffic, people, trains, billboards, moving landmarks): hidden while the map
    // is still a secret building site.
    const life = new THREE.Group();
    scene.add(life);
    const world = makeWorld();

    let meshes: Record<string, THREE.InstancedMesh> = {};
    /** Rivers, lakes and the sea as one smooth surface (see ./city/water). */
    let waterGroup: THREE.Group | null = null;
    let parts: Record<string, Part[]> = {};
    let tiles: Tile[] = [];
    let kindAt = new Map<string, Tile["kind"]>();
    let tileIndex = new Map<string, number>();
    let currentPlan: CityPlan | null = null;
    let currentSeed = -1;
    /** How many tiles the town has (the last build). */
    let builtCount = 0;
    /**
     * A very big town only draws the square of tiles around the camera (WINDOW tiles each way),
     * so drawing costs the same however big the town grows. null: the whole town is drawn
     * (towns up to about 6,500 tiles, which is every town so far).
     */
    let win: { cx: number; cz: number } | null = null;
    /** The drawn tiles by tile number. */
    let tileById = new Map<number, Tile>();
    /** Players' houses in this game, and a key to spot changes. */
    let homesNow: TownHouse[] = [];
    let homesKey = "";
    let born = new Map<number, number>(); // tile → time it started rising
    let growing: number[] = [];
    // Traffic lights: which direction and bulb each lit instance is, and the last phase shown.
    let signalTags: number[] = [];
    let signalPhase = -1;
    let tileParts = new Map<number, [string, number][]>();
    let radius = 10;
    /** The tallest thing in the city (balloon rides float above it). */
    let tallest = 0;
    let framed = false;
    let focus: THREE.Vector3 | null = null;
    let lastMe: number | null = null;

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const color = new THREE.Color();

    const tiltQ = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    function writePart(mesh: THREE.InstancedMesh, idx: number, p: Part, g: number) {
      const gx = Math.min(1, g * 1.15);
      v.set(p.x, p.y * g, p.z);
      s.set(p.sx * gx, Math.max(0.0001, p.sy * g), p.sz * gx);
      q.setFromAxisAngle(up, p.ry);
      if (p.tilt) q.multiply(tiltQ.setFromAxisAngle(zAxis, p.tilt));
      m4.compose(v, q, s);
      mesh.setMatrixAt(idx, m4);
    }

    // ---- traffic (cars, taxis, buses, lorries...) and boats: see ./city/traffic and ./city/boats.
    let carNight = 0;
    let blocked = new Set<string>();

    // ---- birds and clouds
    const birds = createBirds(world, moving);

    const clouds: THREE.Group[] = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, flatShading: true });
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Group();
      const puffs = 3 + (k % 3);
      for (let p = 0; p < puffs; p++) {
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat);
        ball.position.set(p * 1.1 - puffs * 0.5, Math.sin(p * 2) * 0.3, (p % 2) * 0.6);
        ball.scale.setScalar(0.5 + ((p * 37) % 5) * 0.1);
        c.add(ball);
      }
      c.userData = { speed: 0.25 + (k % 4) * 0.1, z: (k / 6 - 0.5), y: 0, x: ((k * 23) % 60) / 60 - 0.5 };
      clouds.push(c);
      moving.add(c);
    }

    function updateSky(time: number, dt: number) {
      birds.update(time, dt, camera, performance.now());
      // Clouds drift across, high above the city.
      const span = radius * 3 + 20;
      for (const c of clouds) {
        c.userData.x += (c.userData.speed * dt) / span;
        if (c.userData.x > 0.5) c.userData.x = -0.5;
        c.position.set(c.userData.x * span, radius * 0.9 + 9, c.userData.z * radius * 2.2);
      }
    }

    // ---- landmarks that move: Ferris wheels turn, wind turbines spin
    let landmarks: { obj: THREE.Object3D; spin: THREE.Object3D; tile: number; speed: number; axis?: "y" | "z" }[] = [];
    const lmMat = {
      white: new THREE.MeshLambertMaterial({ color: 0xf1f3f5 }),
      frame: new THREE.MeshLambertMaterial({ color: 0xe9ecef }),
      cabins: [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2, 0xff922b].map((c) => new THREE.MeshLambertMaterial({ color: c })),
    };
    const lmGeo = {
      rim: new THREE.TorusGeometry(0.62, 0.025, 6, 32),
      spoke: new THREE.BoxGeometry(0.02, 1.24, 0.02),
      cabin: new THREE.BoxGeometry(0.12, 0.12, 0.12),
      blade: new THREE.BoxGeometry(0.06, 0.9, 0.02).translate(0, 0.45, 0),
    };
    // ---- billboards: the city's ad space. Big panels on legs with a lit frame and two little
    // spotlights, glowing at night. Each one turns to a different ad every few seconds (or shows
    // "advertise here" when there are none). Tap one to see the ad, or to advertise.
    const boardTextures = [0, 1, 2, 3].map((d) => billboardTexture(d));
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x495057 });
    const boardGlowMat = new THREE.MeshBasicMaterial({ color: 0x5c636a });
    const boardBeamMat = new THREE.MeshBasicMaterial({
      color: 0xfff1c4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // Per design: panel width and height (about 2:1), panel centre height, where the legs go.
    const BOARD_SPEC = [
      { w: 1.5, h: 0.75, y: 1.75, poles: [-0.45, 0.45] },
      { w: 1.4, h: 0.7, y: 2.3, poles: [0] },
      { w: 1.7, h: 0.85, y: 1.5, poles: [-0.6, 0, 0.6] },
      { w: 1.24, h: 0.62, y: 1.4, poles: [-0.36, 0.36] },
    ];
    const AD_SECONDS = 12;
    const AD_FLIP = 0.32;
    type Board = {
      obj: THREE.Group;
      tile: number;
      id: string;
      design: number;
      panel: THREE.Mesh;
      mat: THREE.MeshLambertMaterial;
      beams: THREE.Mesh;
      /** Middle of the panel (world), and its width: for "is it on screen?". */
      centre: THREE.Vector3;
      w: number;
      /** Which turn of the rotation we're on, the ad it wants, and the ad actually showing. */
      slot: number;
      want: CityAd | null;
      shown: string | null;
      /** Seconds on screen during this turn, and whether this turn's view is counted. */
      seen: number;
      counted: boolean;
      flip: number;
      swapped: boolean;
    };
    let boards: Board[] = [];
    let boardHits: THREE.Mesh[] = [];
    function buildBillboard(t: Tile, index: number): Board {
      const b = t.billboard!;
      const spec = BOARD_SPEC[b.design] ?? BOARD_SPEC[0];
      const { w, h } = spec;
      const cy = spec.y + 0.08;
      const g = new THREE.Group();
      const lampY = cy + h / 2 + 0.08;
      const armZ = 0.3;
      const lampXs = [-w * 0.28, w * 0.28];
      // Legs, the backing board, a walkway on the tall one, and the lamp arms: one mesh.
      const solid: THREE.BufferGeometry[] = spec.poles.map((px) =>
        new THREE.CylinderGeometry(px === 0 ? 0.06 : 0.035, px === 0 ? 0.075 : 0.045, cy, 8).translate(px, cy / 2, 0),
      );
      solid.push(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.045).translate(0, cy, 0));
      if (b.design === 1) solid.push(new THREE.BoxGeometry(w, 0.025, 0.16).translate(0, cy - h / 2 - 0.06, 0.09));
      for (const lx of lampXs) solid.push(new THREE.BoxGeometry(0.022, 0.022, armZ).translate(lx, lampY, armZ / 2 + 0.02));
      const structure = new THREE.Mesh(mergeGeometries(solid), poleMat);
      structure.castShadow = true;
      // The lit frame and the lamp heads: one glowing mesh.
      const lit: THREE.BufferGeometry[] = [
        new THREE.BoxGeometry(w + 0.12, 0.04, 0.075).translate(0, cy + h / 2 + 0.04, 0),
        new THREE.BoxGeometry(w + 0.12, 0.04, 0.075).translate(0, cy - h / 2 - 0.04, 0),
        new THREE.BoxGeometry(0.04, h + 0.12, 0.075).translate(-w / 2 - 0.04, cy, 0),
        new THREE.BoxGeometry(0.04, h + 0.12, 0.075).translate(w / 2 + 0.04, cy, 0),
        ...lampXs.map((lx) => new THREE.BoxGeometry(0.09, 0.045, 0.07).translate(lx, lampY, armZ + 0.02)),
      ];
      const glow = new THREE.Mesh(mergeGeometries(lit), boardGlowMat);
      // Soft beams of light from the lamps down onto the panel (seen at night).
      const dy = lampY - cy;
      const dz = armZ - 0.01;
      const len = Math.hypot(dy, dz) + h * 0.35;
      const beamGeo = lampXs.map((lx) =>
        new THREE.ConeGeometry(w * 0.3, len, 14, 1, true)
          .translate(0, -len / 2, 0)
          .rotateX(Math.atan2(dz, dy))
          .translate(lx, lampY, armZ + 0.02),
      );
      const beams = new THREE.Mesh(mergeGeometries(beamGeo), boardBeamMat);
      beams.renderOrder = 5;
      beams.visible = false;
      for (const x of [...solid, ...lit, ...beamGeo]) x.dispose();
      // The picture, on both sides.
      const front = new THREE.PlaneGeometry(w, h).translate(0, 0, 0.027);
      const back = new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, 0, -0.027);
      const house = boardTextures[b.design] ?? boardTextures[0];
      const mat = new THREE.MeshLambertMaterial({ map: house, emissive: 0xffffff, emissiveMap: house, emissiveIntensity: 0.28 });
      const panel = new THREE.Mesh(mergeGeometries([front, back]), mat);
      front.dispose();
      back.dispose();
      panel.position.y = cy;
      panel.userData = { billboard: b.id, tile: t.i, board: index };
      g.add(structure, glow, beams, panel);
      // Stand at the road edge of the tile, facing the road.
      const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][b.face];
      g.position.set(t.x + dir[0] * 0.28, 0, t.z + dir[1] * 0.28);
      g.rotation.y = [Math.PI / 2, -Math.PI / 2, 0, Math.PI][b.face];
      return {
        obj: g,
        tile: t.i,
        id: b.id,
        design: b.design,
        panel,
        mat,
        beams,
        centre: new THREE.Vector3(g.position.x, cy, g.position.z),
        w,
        slot: -1,
        want: null,
        shown: null,
        seen: 0,
        counted: false,
        flip: 0,
        swapped: true,
      };
    }

    // The ads: loaded once each (by id), drawn letterboxed onto a 2:1 canvas.
    let adsList: CityAd[] = [];
    const adCache = new Map<string, { url: string; tex: THREE.CanvasTexture | null; failed: boolean }>();
    const adLoader = new THREE.TextureLoader();
    adLoader.setCrossOrigin("anonymous");
    let alive = true;
    /**
     * The order this viewer's billboards go through the ads: shuffled per viewer (so different
     * people see different ads on the same board), with the ads the server ranks first (those
     * with more budget left) coming up a bit more often, and never the same ad twice in a row.
     */
    let adCycle: CityAd[] = [];
    const viewerSeed = (() => {
      try {
        const saved = Number(localStorage.getItem("nt-ad-seed"));
        if (Number.isInteger(saved) && saved > 0) return saved;
        const fresh = 1 + Math.floor(Math.random() * 2_000_000_000);
        localStorage.setItem("nt-ad-seed", String(fresh));
        return fresh;
      } catch {
        return 1 + Math.floor(Math.random() * 2_000_000_000);
      }
    })();
    function makeAdCycle(list: CityAd[]) {
      const rich = Math.ceil(list.length / 3);
      const cycle = list.flatMap((a, i) => (i < rich && list.length > 1 ? [a, a] : [a]));
      let seedV = viewerSeed;
      const rand = () => {
        seedV = (seedV + 0x6d2b79f5) | 0;
        let t = Math.imul(seedV ^ (seedV >>> 15), 1 | seedV);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (let i = cycle.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
      }
      for (let i = 1; i < cycle.length; i++) {
        if (cycle[i].id !== cycle[i - 1].id) continue;
        const j = cycle.findIndex((c, k) => k > i && c.id !== cycle[i].id);
        if (j > 0) [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
      }
      return cycle;
    }
    function setAds(list: CityAd[]) {
      adsList = (list ?? []).filter((a) => a && a.id && a.image);
      adCycle = makeAdCycle(adsList);
      const wanted = new Map(adsList.map((a) => [a.id, a.image]));
      for (const [id, entry] of adCache) {
        if (wanted.get(id) === entry.url) continue;
        entry.tex?.dispose();
        adCache.delete(id);
      }
      for (const ad of adsList) {
        if (adCache.has(ad.id)) continue;
        const entry: { url: string; tex: THREE.CanvasTexture | null; failed: boolean } = { url: ad.image, tex: null, failed: false };
        adCache.set(ad.id, entry);
        adLoader.load(
          ad.image,
          (loaded) => {
            if (alive && adCache.get(ad.id) === entry) {
              try {
                entry.tex = adTexture(loaded.image as CanvasImageSource & { width: number; height: number });
              } catch {
                entry.failed = true;
              }
            }
            loaded.dispose();
          },
          undefined,
          () => {
            entry.failed = true;
          },
        );
      }
      // Every board picks its ad again from the new list.
      for (const b of boards) b.slot = -1;
    }
    const adReady = (id: string) => !!adCache.get(id)?.tex;
    /** What board k shows in time slot `slot`: neighbouring boards show different ads. */
    function pickAd(slot: number, k: number): CityAd | null {
      const n = adCycle.length;
      const step = Math.max(1, boards.length);
      for (let j = 0; j < n; j++) {
        const ad = adCycle[(((slot * step + k + j) % n) + n) % n];
        if (!adCache.get(ad.id)?.failed) return ad;
      }
      return null;
    }

    // Counting views: an ad counts once per turn on a board, if the board was on screen (and
    // not tiny) for 1.5 s while showing it. Sent up at most every 15 s.
    const MIN_AD_PX = 40;
    const frustum = new THREE.Frustum();
    const projScreen = new THREE.Matrix4();
    const boardSphere = new THREE.Sphere();
    let viewCounts: Record<string, number> = {};
    let viewsPending = false;
    let lastFlush = performance.now();
    let viewAcc = 0;
    function flushViews(now: number) {
      lastFlush = now;
      if (!viewsPending) return;
      const out = viewCounts;
      viewCounts = {};
      viewsPending = false;
      cb.current.onAdViews?.(out);
    }

    function updateBoards(dt: number, time: number, now: number) {
      for (let k = 0; k < boards.length; k++) {
        const b = boards[k];
        const grow = Math.min(1, Math.max(0, (now - (born.get(b.tile) ?? 0)) / 700));
        b.obj.scale.setScalar(Math.max(0.0001, grow));
        const slot = Math.floor((time + k * 4.7) / AD_SECONDS);
        if (slot !== b.slot) {
          b.slot = slot;
          b.want = pickAd(slot, k);
          b.seen = 0;
          b.counted = false;
        }
        const target = b.want && adReady(b.want.id) ? b.want.id : null;
        if (target !== b.shown) {
          // A quick flip to the next ad (the picture changes half way).
          b.shown = target;
          b.flip = AD_FLIP;
          b.swapped = false;
          b.seen = 0;
          b.counted = false;
        }
        if (b.flip > 0) {
          b.flip = Math.max(0, b.flip - dt);
          const f = 1 - b.flip / AD_FLIP;
          if (!b.swapped && f >= 0.5) {
            b.swapped = true;
            const tex = (b.shown && adCache.get(b.shown)?.tex) || boardTextures[b.design] || boardTextures[0];
            b.mat.map = tex;
            b.mat.emissiveMap = tex;
          }
          b.panel.scale.y = Math.max(0.04, Math.abs(Math.cos(f * Math.PI)));
        }
      }
      viewAcc += dt;
      if (viewAcc >= 0.2) {
        const step = viewAcc;
        viewAcc = 0;
        projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projScreen);
        const focal = (el.clientHeight || 1) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
        for (const b of boards) {
          if (!b.shown || b.counted) continue;
          boardSphere.center.copy(b.centre);
          boardSphere.radius = b.w / 2;
          const px = (b.w * focal) / Math.max(0.001, camera.position.distanceTo(b.centre));
          if (b.obj.scale.x >= 1 && b.flip === 0 && px >= MIN_AD_PX && frustum.intersectsSphere(boardSphere)) {
            b.seen += step;
            if (b.seen >= 1.5) {
              b.counted = true;
              viewCounts[b.shown] = (viewCounts[b.shown] ?? 0) + 1;
              viewsPending = true;
            }
          } else b.seen = 0;
        }
      }
      if (now - lastFlush >= 15000) flushViews(now);
    }

    function addFerris(px: number, pz: number, rotY: number, tile: number, scale: number) {
      const obj = new THREE.Group();
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(lmGeo.rim, lmMat.frame));
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(lmGeo.spoke, lmMat.frame);
        sp.rotation.z = (k * Math.PI) / 4;
        wheel.add(sp);
      }
      const cabins: THREE.Mesh[] = [];
      for (let k = 0; k < 8; k++) {
        const c = new THREE.Mesh(lmGeo.cabin, lmMat.cabins[k % lmMat.cabins.length]);
        const a = (k / 8) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
        c.castShadow = true;
        wheel.add(c);
        cabins.push(c);
      }
      wheel.position.y = 1.35;
      obj.add(wheel);
      if (scale !== 1) {
        // Legs for the bigger funfair wheel (the single-tile one has legs drawn with the tile).
        for (const o of [-0.2, 0.2]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), lmMat.frame);
          leg.position.set(o, 0.7, 0);
          obj.add(leg);
        }
      }
      obj.position.set(px, 0, pz);
      obj.rotation.y = rotY;
      obj.userData.scale = scale;
      // A slow wheel (about 75 s a turn), its cabins hanging upright as it goes round.
      obj.userData.cabins = cabins;
      landmarks.push({ obj, spin: wheel, tile, speed: (Math.PI * 2) / 75 });
      wheels.push({ obj, wheel, tile, scale });
      life.add(obj);
    }
    /** The Ferris wheels (for rides), and the water parks (their slides and swimmers). */
    let wheels: { obj: THREE.Group; wheel: THREE.Group; tile: number; scale: number }[] = [];
    let parks: Waterpark[] = [];
    // Games going on outdoors at the sports venues (hoops on the court, a kick-about on the pitch).
    let games: VenueGame[] = [];

    function buildLandmarks() {
      // Boards keep showing what they showed (no flicker when the city grows).
      const wasShowing = new Map(boards.map((b) => [b.id, b.shown]));
      for (const l of landmarks) life.remove(l.obj);
      landmarks = [];
      wheels = [];
      for (const p of parks) p.dispose();
      parks = [];
      for (const g of games) g.dispose();
      games = [];
      for (const b of boards) {
        life.remove(b.obj);
        b.obj.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        b.mat.dispose();
      }
      boards = [];
      boardHits = [];
      for (const t of tiles) {
        if (t.kind === "billboard") {
          const board = buildBillboard(t, boards.length);
          const shown = wasShowing.get(board.id);
          const tex = shown ? adCache.get(shown)?.tex : null;
          if (shown && tex) {
            board.shown = shown;
            board.mat.map = tex;
            board.mat.emissiveMap = tex;
          }
          boards.push(board);
          boardHits.push(board.panel);
          life.add(board.obj);
        }
        if (t.kind === "ferris") addFerris(t.x, t.z, t.r[1] < 0.5 ? 0 : Math.PI / 2, t.i, 1);
        if (t.kind === "crane") {
          // The crane's arm swings slowly round, with a load hanging off it.
          const obj = new THREE.Group();
          const jib = new THREE.Group();
          const yellow = new THREE.MeshLambertMaterial({ color: 0xfab005 });
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.07), yellow);
          arm.position.x = 0.45;
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), lmMat.frame);
          back.position.x = -0.35;
          const cab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), yellow);
          cab.position.set(0.05, -0.08, 0.06);
          const cable = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.6, 0.01), lmMat.frame);
          cable.position.set(0.9, -0.3, 0);
          const load = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), new THREE.MeshLambertMaterial({ color: 0x8a6a4f }));
          load.position.set(0.9, -0.64, 0);
          jib.add(arm, back, cab, cable, load);
          jib.position.y = 3.08;
          obj.add(jib);
          obj.position.set(t.x + 0.32, 0, t.z - 0.32);
          // The hook winds up and down, and the trolley runs along the arm.
          obj.userData.lift = { cable, load, phase: t.r[0] * 6 };
          landmarks.push({ obj, spin: jib, tile: t.i, speed: 0.15, axis: "y" });
          life.add(obj);
        }
        if (t.structure?.anchor && (t.structure.type === "court" || t.structure.type === "arena")) {
          const game = createVenueGame(t);
          if (game) {
            games.push(game);
            life.add(game.group);
          }
        }
        if (t.structure?.anchor && t.structure.type === "waterpark") {
          const park = createWaterpark(t, t.structure.name);
          parks.push(park);
          life.add(park.group);
        }
        if (t.structure?.anchor && t.structure.type === "funfair") {
          addFerris(t.x + 0.05, t.z, Math.PI / 4, t.i, 1.15);
          // A carousel that turns
          const obj = new THREE.Group();
          const spin = new THREE.Group();
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), lmMat.frame);
          base.position.y = 0.12;
          const top = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 20), lmMat.cabins[0]);
          top.position.y = 0.48;
          spin.add(base, top);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const pole = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.33, 0.015), lmMat.frame);
            pole.position.set(Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22);
            const horse = new THREE.Mesh(lmGeo.cabin, lmMat.cabins[(k + 1) % lmMat.cabins.length]);
            horse.position.set(Math.cos(a) * 0.22, 0.24, Math.sin(a) * 0.22);
            horse.scale.set(0.8, 0.6, 0.5);
            spin.add(pole, horse);
          }
          obj.add(spin);
          obj.position.set(t.x + 0.95, 0, t.z + 0.15);
          landmarks.push({ obj, spin, tile: t.i, speed: 0.8, axis: "y" });
          life.add(obj);
        }
        if (t.kind === "turbine") {
          const obj = new THREE.Group();
          const rotor = new THREE.Group();
          for (let k = 0; k < 3; k++) {
            const b = new THREE.Mesh(lmGeo.blade, lmMat.white);
            b.rotation.z = (k * Math.PI * 2) / 3;
            rotor.add(b);
          }
          rotor.position.set(0, 2.68, 0.14);
          obj.add(rotor);
          obj.position.set(t.x, 0, t.z);
          obj.rotation.y = t.r[2] * 0.6;
          landmarks.push({ obj, spin: rotor, tile: t.i, speed: 1.6 + t.r[3] });
          life.add(obj);
        }
      }
    }
    function updateLandmarks(dt: number, now: number) {
      const secs = now / 1000;
      for (const l of landmarks) {
        if (l.axis === "y") l.spin.rotation.y += l.speed * dt;
        else l.spin.rotation.z += l.speed * dt;
        const cabins = l.obj.userData.cabins as THREE.Object3D[] | undefined;
        if (cabins) for (const c of cabins) c.rotation.z = -l.spin.rotation.z;
        const lift = l.obj.userData.lift as { cable: THREE.Object3D; load: THREE.Object3D; phase: number } | undefined;
        if (lift) {
          const drop = 0.35 + 0.9 * (0.5 + 0.5 * Math.sin(secs * 0.45 + lift.phase));
          const reach = 0.75 + 0.3 * Math.sin(secs * 0.23 + lift.phase);
          lift.cable.scale.y = drop / 0.6;
          lift.cable.position.set(reach, -drop / 2, 0);
          lift.load.position.set(reach, -drop - 0.04, 0);
        }
        const t = Math.min(1, Math.max(0, (now - (born.get(l.tile) ?? 0)) / 700));
        l.obj.scale.setScalar(Math.max(0.0001, t) * (l.obj.userData.scale ?? 1));
      }
    }

    // ---- hot-air balloons and planes
    const balloonColors = [0xff6b6b, 0xffd43b, 0x4dabf7, 0xda77f2, 0x38d9a9];
    // Balloons carry no ads (ads are on billboards only). They slowly turn as they drift. Each
    // one is a place you can ride in and chat with the people there.
    const ropeGeo = mergeGeometries(
      [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]].map(([rx, rz]) => new THREE.BoxGeometry(0.008, 0.2, 0.008).translate(rx, -0.52, rz)),
    );
    const BALLOON_SCALE = 1.25;
    type Balloon = {
      obj: THREE.Group;
      body: THREE.Group;
      basket: THREE.Object3D;
      /** Extra height while you ride it (to clear the tallest towers). */
      lift: number;
      /** How much it bobs up and down (calms right down while you ride it). */
      bob: number;
      hits: THREE.Object3D[];
      a: number;
      r: number;
      h: number;
      speed: number;
      cx: number;
      cz: number;
      k: number;
    };
    const balloons: Balloon[] = balloonColors.map((c, k) => {
      const g = new THREE.Group();
      const body = new THREE.Group();
      const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
      envelope.scale.y = 1.15;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.38, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      band.position.y = -0.12;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.14), new THREE.MeshLambertMaterial({ color: 0x8a6a4f }));
      basket.position.y = -0.68;
      // A second band of colour where the ad banner used to be.
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.44, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
      stripe.position.y = 0.1;
      body.add(envelope, band, stripe);
      // The basket and its ropes (hidden while you ride in it).
      const rig = new THREE.Group();
      rig.add(new THREE.Mesh(ropeGeo, lmMat.frame), basket);
      g.add(body, rig);
      g.scale.setScalar(BALLOON_SCALE);
      moving.add(g);
      return {
        obj: g,
        body,
        basket: rig,
        lift: 0,
        bob: 1,
        hits: [envelope, band, stripe, basket],
        a: (k / balloonColors.length) * Math.PI * 2,
        r: 0.45 + (k % 3) * 0.22,
        h: 5.6 + (k % 3) * 1.3,
        speed: 0.022 + k * 0.005,
        cx: (k - 2) * 0.7,
        cz: ((k * 3) % 5 - 2) * 0.6,
        k,
      };
    });
    const balloonHits = balloons.flatMap((b) => b.hits);
    /** Where balloon b is (into out), and which way it's heading (into dir). A gentle loop over the city. */
    function balloonPose(b: Balloon, time: number, out: THREE.Vector3, dir?: THREE.Vector3) {
      const R = Math.max(3, radius * b.r);
      const a = b.a;
      out.set(b.cx + Math.cos(a) * R, b.h + b.lift + Math.sin(time * 0.5 + b.k) * 0.25 * b.bob, b.cz + Math.sin(a) * R * 0.78 + Math.sin(2 * a + b.k) * R * 0.18);
      dir?.set(-Math.sin(a) * R, 0, Math.cos(a) * R * 0.78 + Math.cos(2 * a + b.k) * R * 0.36).normalize();
    }
    // Airliners crossing high over the town, slowly, trailing vapour (see ./city/airliner).
    const planes = [0, 1].map((k) => {
      const jet = createAirliner(LIVERIES[(k * 3) % LIVERIES.length]);
      jet.group.scale.setScalar(2.4);
      jet.group.userData = { t: k * 0.5, angle: 0.4 + k * 2.2, jet };
      moving.add(jet.group);
      return jet.group;
    });
    function updateAir(time: number, dt: number) {
      for (const b of balloons) {
        b.a += b.speed * dt;
        const riding = view?.kind === "ride" && view.k === b.k;
        const lift = riding ? Math.max(0, tallest + 1.8 - b.h) : 0;
        // Rise smoothly (no jolts) to clear the tallest towers, and stop bobbing about.
        b.lift += (lift - b.lift) * Math.min(1, dt * 0.35);
        b.bob += ((riding ? 0 : 1) - b.bob) * Math.min(1, dt * 0.8);
        balloonPose(b, time, b.obj.position);
        b.body.rotation.y += dt * 0.12;
      }
      for (const p of planes) {
        const u = p.userData;
        // High and slow: a minute or so to cross, then a new heading.
        u.t += dt / 70;
        if (u.t > 1) {
          u.t = 0;
          u.angle += 1.9;
        }
        const span = radius * 3 + 70;
        const ca = Math.cos(u.angle);
        const sa = Math.sin(u.angle);
        const d = (u.t - 0.5) * span;
        p.position.set(ca * d - sa * 6, 24 + radius * 0.35, sa * d + ca * 6);
        p.rotation.y = -u.angle;
        (u.jet as ReturnType<typeof createAirliner>).update(time);
      }
    }

    // ---- the countryside round the city: gentle hills and little valleys near the edge, rising
    // to mountains in the distance (different every round), fading into the haze. Two meshes
    // (the land and its trees), rebuilt only when the city changes size. Never tappable.
    const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const terrain = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    terrain.receiveShadow = true;
    terrain.frustumCulled = false;
    scene.add(terrain);
    const HILL_TREES = 340;
    // The trees on the land round the town, shaped for the country (palms, flat-topped acacias,
    // round oaks or pines), one colour each so they stay a single cheap draw.
    const hillTreeShapes = new Map<string, THREE.BufferGeometry>();
    function hillTreeShape(kind: string) {
      let g = hillTreeShapes.get(kind);
      if (g) return g;
      const stem = (h: number, r: number) => new THREE.CylinderGeometry(r * 0.7, r, h, 5).translate(0, h / 2, 0).toNonIndexed();
      if (kind === "acacia") g = mergeGeometries([stem(0.62, 0.07), new THREE.CylinderGeometry(0.62, 0.5, 0.16, 7).translate(0, 0.68, 0).toNonIndexed()]);
      else if (kind === "palm") g = mergeGeometries([stem(0.8, 0.06), new THREE.IcosahedronGeometry(0.36, 0).scale(1.1, 0.5, 1.1).translate(0, 0.84, 0)]);
      else if (kind === "round") g = mergeGeometries([stem(0.35, 0.08), new THREE.IcosahedronGeometry(0.42, 0).translate(0, 0.62, 0)]);
      else g = new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0);
      hillTreeShapes.set(kind, g);
      return g;
    }
    const hillTrees = new THREE.InstancedMesh(hillTreeShape("pine"), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), HILL_TREES);
    hillTrees.count = 0;
    hillTrees.frustumCulled = false;
    scene.add(hillTrees);
    let terrainKey = "";
    // This round's land: its seed, the half-size of the flat ground the city stands on, how hilly
    // it is, how high the mountains get, and how far out they start and reach full height.
    const land = { seed: 0, half: 10, hills: 1, peaks: 14, start: 20, full: 60, flat: 18 };
    /** The railway's line, anywhere along it (in town or out in the countryside). */
    function railOut(x: number, z: number, pad: number) {
      const r = currentPlan?.rail;
      if (!r || !currentPlan) return false;
      const along = r.along === "z" ? z : x;
      const across = r.along === "z" ? x : z;
      return Math.abs(across - railCentre(currentPlan, along)) < pad;
    }
    let country: ReturnType<typeof buildCountryLandmarks> | null = null;
    // Farmland, villages and trees made up round you while you ride (see ./city/countryside).
    const countryside = createCountryside({
      parent: life,
      ground: (x, z) => landHeight(x, z),
      plan: () => currentPlan,
      half: () => land.half,
      flat: () => land.flat,
      reserved: (x, z) => railOut(x, z, 1.2) || !!country?.covers(x, z),
    });
    const LAND_COLORS = [
      { meadow: 0xb9d99b, hill: 0x8cc178, forest: 0x5f9e5a, rock: 0x9b958a, low: 0x9fcb8a },
      { meadow: 0xd3d8a2, hill: 0xbcc283, forest: 0x7b9b58, rock: 0xa89a86, low: 0xb7c98d },
      { meadow: 0xcfd9a6, hill: 0xcdb47c, forest: 0xa8743f, rock: 0x948b85, low: 0xb5c894 },
    ];
    const SNOW = new THREE.Color(0xf3f6f9);
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    /** How far outside the city's flat ground the last landHeight() point was. */
    let landE = 0;
    /** Level ground under each landmark (so the land's gentle roll doesn't poke through its lake or plaza). */
    let pads: { x: number; z: number; r: number; y: number }[] = [];
    function landHeight(x: number, z: number) {
      const h = rawLandHeight(x, z);
      if (!pads.length) return h;
      let out = h;
      for (const p of pads) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < p.r + 2) out += (p.y - out) * (1 - smooth(p.r + 0.3, p.r + 2, d));
      }
      return out;
    }
    function rawLandHeight(x: number, z: number) {
      // Distance outside a square with rounded corners round the city.
      const c = 2.5;
      const qx = Math.abs(x) - land.half + c;
      const qz = Math.abs(z) - land.half + c;
      const e = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - c;
      landE = Math.max(0, e);
      if (e <= 0) return -0.02;
      const n = smoothNoise(x / 4.5, z / 4.5, land.seed) * 0.65 + smoothNoise(x / 1.9 + 50, z / 1.9, land.seed + 1) * 0.35 - 0.5;
      // Flat farmland round the town (just a gentle roll), hills only beyond it, the mountains
      // far off on the horizon: a ride out of town never heads into mountains.
      const hills = n * (0.12 * smooth(0, 4, e) + 3.4 * land.hills * smooth(land.flat, land.flat + 22, e));
      const r1 = 1 - Math.abs(2 * smoothNoise(x / 20, z / 20, land.seed + 2) - 1);
      const r2 = 1 - Math.abs(2 * smoothNoise(x / 8 + 9, z / 8 - 4, land.seed + 3) - 1);
      const ridges = r1 * r1 * 0.75 + r2 * r2 * 0.3;
      const range = 0.35 + 0.9 * smoothNoise(x / 55, z / 55, land.seed + 4);
      return -0.02 + hills + ridges * range * land.peaks * smooth(land.start, land.full, e);
    }
    function buildTerrain(seedV: number, R: number) {
      const key = `${seedV}:${R}`;
      if (key === terrainKey) return;
      terrainKey = key;
      const rr = (k: number) => hash(seedV, k, 5151);
      land.seed = (seedV * 31 + 7) | 0;
      land.half = R + 1.2;
      land.hills = 0.45 + rr(1) * 0.9;
      land.peaks = (9 + R * 0.5) * (0.6 + rr(2) * 0.8);
      land.flat = 16 + R * 0.35;
      land.start = land.flat + 14 + R * 0.4;
      land.full = land.start + 30 + R * 1.2;
      // This country's famous landmarks, out in the farmland (see ./city/landmarks). Switched off
      // for now (SHOW_COUNTRY_LANDMARKS).
      country?.dispose();
      pads = [];
      country =
        SHOW_COUNTRY_LANDMARKS && currentPlan ? buildCountryLandmarks(currentPlan, land.half, landHeight, (x, z, r) => railOut(x, z, r + 1)) : null;
      pads = (country?.spots ?? []).map((p) => ({ ...p, y: landHeight(p.x, p.z) }));
      if (country) life.add(country.group);
      countryside.reset();
      const pal = LAND_COLORS[Math.floor(rr(3) * LAND_COLORS.length) % LAND_COLORS.length];
      const cGround = new THREE.Color(GROUND);
      const cMeadow = new THREE.Color(pal.meadow);
      const cHill = new THREE.Color(pal.hill);
      const cForest = new THREE.Color(pal.forest);
      const cRock = new THREE.Color(pal.rock);
      const cLow = new THREE.Color(pal.low);
      const snowy = land.peaks > 11;
      // A polar grid: rings close together near the city, wide apart far out.
      const N = 60;
      const M = 144;
      const r0 = land.half - 0.8;
      const rOut = R * 14 + 80;
      const pos = new Float32Array((N + 1) * M * 3);
      const col = new Float32Array((N + 1) * M * 3);
      const cc = new THREE.Color();
      for (let i = 0; i <= N; i++) {
        const r = r0 + (rOut - r0) * Math.pow(i / N, 1.9);
        for (let j = 0; j < M; j++) {
          const a = (j / M) * Math.PI * 2 + (i % 2) * (Math.PI / M);
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          const y = landHeight(x, z);
          const e = landE;
          const o = (i * M + j) * 3;
          pos[o] = x;
          pos[o + 1] = y;
          pos[o + 2] = z;
          cc.copy(cGround).lerp(cMeadow, smooth(0, 4, e));
          if (y < -0.12) cc.lerp(cLow, smooth(-0.12, -0.8, y));
          cc.lerp(cHill, smooth(0.3, 2, y));
          cc.lerp(cForest, smooth(1.5, 4, y) * (0.4 + 0.6 * smoothNoise(x / 9, z / 9, land.seed + 5)));
          cc.lerp(cRock, smooth(land.peaks * 0.22, land.peaks * 0.45, y));
          if (snowy) cc.lerp(SNOW, smooth(land.peaks * 0.55, land.peaks * 0.7, y));
          col[o] = cc.r;
          col[o + 1] = cc.g;
          col[o + 2] = cc.b;
        }
      }
      const index = new Uint32Array(N * M * 6);
      let n = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
          const a = i * M + j;
          const b = i * M + ((j + 1) % M);
          const c = (i + 1) * M + j;
          const d = (i + 1) * M + ((j + 1) % M);
          index.set([a, b, c, c, b, d], n);
          n += 6;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(index, 1));
      g.computeVertexNormals();
      terrain.geometry.dispose();
      terrain.geometry = g;
      // Little woods on the hills.
      const treeKind = regionOf(currentPlan).tree;
      hillTrees.geometry = hillTreeShape(treeKind);
      const wide = treeKind === "pine" ? 0.42 : 0.8;
      // Leafy trees stay green whatever the hills' colour (a brown palm looks like a table).
      const cLeaf = cForest.clone().lerp(new THREE.Color(treeKind === "acacia" ? 0x7a9a3a : 0x3f9b46), treeKind === "pine" ? 0 : 0.7);
      let count = 0;
      for (let k = 0; k < 4000 && count < HILL_TREES; k++) {
        const a = hash(k, 1, seedV + 5252) * Math.PI * 2;
        const d = land.half + 1 + Math.sqrt(hash(k, 2, seedV + 5252)) * (32 + R * 0.6);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const y = landHeight(x, z);
        if (landE < 1.2 || y > land.peaks * 0.2 || smoothNoise(x / 7, z / 7, land.seed + 6) < 0.5) continue;
        if (railOut(x, z, 1.5) || country?.covers(x, z)) continue;
        const h = (0.55 + hash(k, 3, seedV + 5252) * 0.6) * (1 + landE / 45);
        m4.compose(v.set(x, y - 0.05, z), q.identity(), s.set(h * wide, h, h * wide));
        hillTrees.setMatrixAt(count, m4);
        hillTrees.setColorAt(count, cc.copy(cLeaf).multiplyScalar(0.75 + hash(k, 4, seedV + 5252) * 0.35));
        count++;
      }
      hillTrees.count = count;
      hillTrees.instanceMatrix.needsUpdate = true;
      if (hillTrees.instanceColor) hillTrees.instanceColor.needsUpdate = true;
      // The flat ground under the city, and how far we can see.
      base.scale.setScalar(land.half);
      camera.far = Math.max(400, rOut * 1.3);
      camera.updateProjectionMatrix();
    }

    // ---- traffic lights light up the road at night: soft coloured pools on the asphalt
    // under each light, following its colour.
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    let pools: THREE.InstancedMesh | null = null;
    let poolAxis: number[] = [];
    function buildPools() {
      if (pools) {
        scene.remove(pools);
        pools.dispose();
      }
      const spots: { x: number; z: number; axis: number }[] = [];
      for (const t of tiles) {
        if (!signalJunction(t)) continue;
        spots.push({ x: t.x + 0.24, z: t.z - 0.24, axis: 0 }, { x: t.x - 0.24, z: t.z + 0.24, axis: 1 });
      }
      poolAxis = spots.map((p) => p.axis);
      pools = new THREE.InstancedMesh(poolGeo, poolMat, Math.max(1, spots.length));
      pools.count = spots.length;
      spots.forEach((p, k) => {
        m4.compose(v.set(p.x, 0.072, p.z), q.identity(), s.set(1.15, 1, 1.15));
        pools!.setMatrixAt(k, m4);
        pools!.setColorAt(k, color.setHex(0x000000));
      });
      pools.renderOrder = 3;
      pools.visible = false;
      pools.computeBoundingSphere();
      scene.add(pools);
    }

    // ---- blinking lamps: hazard lights, police lights, road-works lamps
    let flashTags: number[] = [];
    let flashState = -1;
    const FLASH_COL = {
      amber: new THREE.Color(0xffa41b),
      amberOff: new THREE.Color(0x4a3a20),
      red: new THREE.Color(0xff2d2d),
      blue: new THREE.Color(0x2d6bff),
      off: new THREE.Color(0x1d2330),
    };
    function updateFlashers(time: number) {
      const mesh = meshes.flash;
      if (!mesh || !flashTags.length) return;
      const hazard = Math.sin(time * 5.5) > 0 ? 1 : 0;
      const police = Math.floor(time * 6) % 2;
      const works = Math.sin(time * 3.2) > 0.2 ? 1 : 0;
      const state = hazard | (police << 1) | (works << 2);
      if (state === flashState) return;
      flashState = state;
      for (let k = 0; k < flashTags.length; k++) {
        const tag = flashTags[k];
        const c =
          tag === FLASH.hazard
            ? hazard ? FLASH_COL.amber : FLASH_COL.amberOff
            : tag === FLASH.policeRed
              ? police ? FLASH_COL.red : FLASH_COL.off
              : tag === FLASH.policeBlue
                ? police ? FLASH_COL.off : FLASH_COL.blue
                : works ? FLASH_COL.amber : FLASH_COL.amberOff;
        mesh.setColorAt(k, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // ---- the city's moving parts and things being built (see ./city/*)
    const people = createPeople(world, life);
    const trains = createTrains(world, life);
    const traffic = createTraffic(world, life);
    const boats = createBoats(world, life);
    const plumes = createPlumes(world, life);
    const sites = createSites(world, life);
    const buildingSite = createBuildingSite(scene);
    // World events (fires, parades, a UFO...): drawn over the city while they're on.
    const worldEventsLayer = createWorldEvents({ scene, parent: life, camera, renderer, hemi, sun, tiles: () => tiles, plan: () => currentPlan, ground: (x, z) => landHeight(x, z), night: () => carNight });
    /** Flying the map camera over to an event (target and camera glide together). */
    let eventFly: THREE.Vector3 | null = null;
    const flyStep = new THREE.Vector3();
    /** False while the map is still a secret building site (the join window). */
    let isRevealed = true;
    /** Street life comes back a moment after the city starts rising. */
    let lifeAt = 0;

    // ---- build / grow the city
    function build(newSeed: number, count: number, centre?: { cx: number; cz: number }) {
      const sameCity = newSeed === currentSeed;
      if (!sameCity) {
        born = new Map();
        framed = false;
        caughtFromEvents.clear();
      }
      currentSeed = newSeed;
      builtCount = count;
      const plan = makePlan(newSeed);
      placeHouses(plan, count, homesNow);
      // The spiral ring the last tile is on: the town is (2 × ring + 1) tiles across.
      const ring = Math.ceil((Math.sqrt(count) - 1) / 2);
      const moved = Boolean(centre) && sameCity;
      if (ring <= WINDOW) {
        win = null;
        tiles = Array.from({ length: count }, (_, i) => tileAt(plan, i));
      } else {
        const c = centre ?? (sameCity && win ? win : { cx: 0, cz: 0 });
        const lim = Math.max(0, ring - WINDOW);
        win = { cx: Math.max(-lim, Math.min(lim, c.cx)), cz: Math.max(-lim, Math.min(lim, c.cz)) };
        tiles = [];
        for (let x = win.cx - WINDOW; x <= win.cx + WINDOW; x++) {
          for (let z = win.cz - WINDOW; z <= win.cz + WINDOW; z++) {
            const i = spiralIndex(x, z);
            if (i < count) tiles.push(tileAt(plan, i));
          }
        }
        tiles.sort((a, b) => a.i - b.i);
      }
      // A big building only appears once all four of its tiles exist; until then each
      // of its tiles shows what it would otherwise be.
      const present = new Set(tiles.map((t) => `${t.x},${t.z}`));
      tiles = tiles.map((t) => {
        if (t.kind !== "structure" || !t.structure || !t.fallback) return t;
        const { ax, az } = t.structure;
        const { w, d } = structureSize(t.structure);
        let whole = true;
        for (let dx = 0; dx < w && whole; dx++) for (let dz = 0; dz < d && whole; dz++) whole = present.has(`${ax + dx},${az + dz}`);
        return whole ? t : { ...t.fallback, i: t.i };
      });
      tileById = new Map(tiles.map((t) => [t.i, t]));
      kindAt = new Map(tiles.map((t) => [`${t.x},${t.z}`, t.kind]));
      tileIndex = new Map(tiles.map((t) => [`${t.x},${t.z}`, t.i]));
      blocked = new Set(tiles.filter((t) => t.works).map((t) => `${t.x},${t.z}`));
      currentPlan = plan;

      const now = performance.now();
      for (const t of tiles) {
        if (!born.has(t.i)) {
          // First load: rise from the centre outwards. Later: new tiles pop up. Tiles that come
          // into view as you move round a very big town are simply there.
          const delay = moved ? -1000 : sameCity ? (t.i - born.size) * 25 : Math.hypot(t.x - (win?.cx ?? 0), t.z - (win?.cz ?? 0)) * 45;
          born.set(t.i, now + Math.min(delay, 2500));
        }
      }
      // Forget tiles far out of view (a very big town), so this never grows without end.
      if (win && born.size > tiles.length * 3) for (const i of born.keys()) if (!tileById.has(i)) born.delete(i);

      parts = {};
      tileParts = new Map();
      for (const t of tiles) {
        partsFor(t, plan, (mesh, p) => {
          (parts[mesh] ??= []).push({ ...p, tile: t.i });
          const list = tileParts.get(t.i) ?? [];
          list.push([mesh, parts[mesh].length - 1]);
          tileParts.set(t.i, list);
        });
      }

      for (const m of Object.values(meshes)) {
        city.remove(m);
        m.dispose();
      }
      disposeWater(waterGroup);
      waterGroup = buildWater(tiles, newSeed);
      if (waterGroup) city.add(waterGroup);
      meshes = {};
      growing = [];
      for (const [name, def] of Object.entries(meshDefs)) {
        const list = parts[name] ?? [];
        const mesh = new THREE.InstancedMesh(def.geometry, def.material, Math.max(1, list.length));
        mesh.count = list.length;
        mesh.castShadow = def.shadow;
        mesh.receiveShadow = true;
        mesh.userData.name = name;
        list.forEach((p, k) => {
          const b = born.get(p.tile)!;
          const g = now >= b + 700 ? 1 : 0;
          writePart(mesh, k, p, g);
          mesh.setColorAt(k, color.setHex(p.color));
        });
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        meshes[name] = mesh;
        city.add(mesh);
      }
      for (const t of tiles) if (now < born.get(t.i)! + 700) growing.push(t.i);
      signalTags = (parts.signal ?? []).map((p) => p.color - SIGNAL_TAG);
      signalPhase = -1;
      flashTags = (parts.flash ?? []).map((p) => p.color - FLASH_TAG);
      flashState = -1;

      // radius: half the width of what's drawn. The hills start beyond the whole town.
      radius = win ? WINDOW + 1.5 : tiles.reduce((m, t) => Math.max(m, Math.abs(t.x), Math.abs(t.z)), 4) + 1.5;
      tallest = tiles.reduce((m, t) => Math.max(m, t.top), 0);
      buildTerrain(newSeed, win ? ring + 1.5 : radius);
      const ox = win?.cx ?? 0;
      const oz = win?.cz ?? 0;
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -radius * 1.3;
      sc.right = sc.top = radius * 1.3;
      sc.near = 1;
      sc.far = radius * 6 + 40;
      sc.updateProjectionMatrix();
      sun.position.set(ox - radius * 1.2, radius * 2 + 12, oz + radius * 0.9);
      sun.target.position.set(ox, 0, oz);
      sun.target.updateMatrixWorld();
      controls.maxDistance = Math.max(30, radius * (win ? 3 : 4.5));
      if (!framed) {
        framed = true;
        const d = (radius * 2.3 + 8) * Math.max(1, 0.95 / camera.aspect);
        camera.position.set(ox + d * 0.62, d * 0.72, oz + d * 0.62);
        controls.target.set(ox, 0, oz);
        controls.update();
      }
      buildPools();
      buildGhosts(count);
      for (const g of ghosts) g.visible = isRevealed;
      // Everyone else who needs to know about the new city.
      world.tiles = tiles;
      world.byIndex = tileById;
      world.plan = plan;
      world.radius = radius;
      world.kindAt = kindAt;
      world.tileIndex = tileIndex;
      world.blocked = blocked;
      world.born = born;
      birds.build(newSeed);
      people.build();
      // The railway runs on out into the farmland (not in a huge town drawn only round the camera).
      trains.build(win ? 0 : Math.max(0, Math.min(26, Math.floor(land.flat - 3))));
      traffic.build(plan);
      boats.build();
      buildLandmarks();
      plumes.build();
      sites.build();
      if (!isRevealed) buildingSite.build(newSeed, count, siteBox());
      cb.current.onBalloons?.(balloons.length);
      listRides();
      setMarkers(lastMarkers);
      rebuildPills();
      caughtKey = "";
      drawCaught();
      // The meshes were made afresh: hide the roof bits again if we're up there; and if we were
      // asked to go somewhere that didn't exist yet, go now.
      if (view?.kind === "place" && view.stage.level.hide) {
        view.stage.hidden = false;
        hideRoof(view.stage, true);
      }
      syncView();
    }

    /** The part of a very big town the building site covers (null: all of it). */
    const siteBox = () => (win ? { x0: win.cx - WINDOW, x1: win.cx + WINDOW, z0: win.cz - WINDOW, z1: win.cz + WINDOW } : null);

    /**
     * A very big town: when the camera has wandered well away from the middle of what's drawn,
     * draw the part around it instead (checked a few times a second, never while inside a
     * place or riding something).
     */
    let windowCheckAt = 0;
    function followWindow(now: number) {
      if (!win || now < windowCheckAt) return;
      windowCheckAt = now + 400;
      if (view || eventFly) return;
      const tx = controls.target.x;
      const tz = controls.target.z;
      if (Math.max(Math.abs(tx - win.cx), Math.abs(tz - win.cz)) < WINDOW * 0.45) return;
      const step = 10;
      build(currentSeed, builtCount, { cx: Math.round(tx / step) * step, cz: Math.round(tz / step) * step });
    }

    function updateGrowth(now: number) {
      if (!growing.length) return;
      const touched = new Set<string>();
      growing = growing.filter((tile) => {
        const b = born.get(tile)!;
        const t = Math.min(1, Math.max(0, (now - b) / 700));
        const g = t <= 0 ? 0 : easeOutBack(t);
        for (const [name, idx] of tileParts.get(tile) ?? []) {
          writePart(meshes[name], idx, parts[name][idx], g);
          touched.add(name);
        }
        return t < 1;
      });
      for (const name of touched) {
        meshes[name].instanceMatrix.needsUpdate = true;
        meshes[name].computeBoundingSphere();
      }
    }

    // ---- markers
    let lastMarkers: CityMarkers = { searchedEmpty: [], searchedHit: [], caught: [], left: [], me: null, sweeps: [], pending: null, recent: [], locked: [], decoy: null };
    const pulsers: { obj: THREE.Object3D; kind: "pulse" | "bob" | "spin" | "flash" | "sway"; base: number }[] = [];
    const glassBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const markerGeo = {
      pinHead: new THREE.SphereGeometry(0.14, 16, 12),
      pinStick: new THREE.ConeGeometry(0.06, 0.32, 10).rotateX(Math.PI),
      ring: new THREE.TorusGeometry(0.36, 0.05, 8, 32).rotateX(Math.PI / 2),
      beam: new THREE.CylinderGeometry(0.22, 0.22, 1, 24, 1, true).translate(0, 0.5, 0),
      gem: new THREE.OctahedronGeometry(0.22),
      square: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      cross: new THREE.BoxGeometry(0.42, 0.04, 0.08),
      // Your decoy: an inflatable tube man.
      tube: new THREE.CylinderGeometry(0.06, 0.075, 0.5, 10).translate(0, 0.25, 0),
      arm: new THREE.CylinderGeometry(0.025, 0.03, 0.26, 8).translate(0, 0.13, 0),
      ball: new THREE.SphereGeometry(0.5, 12, 8),
      dash: new THREE.RingGeometry(0.34, 0.4, 32).rotateX(-Math.PI / 2),
      stand: new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0),
    };
    // Shared with the little scenes (which free what they made, but not these).
    markerGeo.square.userData.keep = true;
    const topOf = (tile: number) => tileById.get(tile)?.top ?? 0.2;
    const posOf = (tile: number) => {
      const t = tileById.get(tile);
      if (t) return t;
      // Not drawn (far out in a very big town): it's still at its place on the spiral.
      const [x, z] = spiralXY(tile);
      return { x, z };
    };

    function pin(tile: number, hex: number) {
      const g = new THREE.Group();
      const head = new THREE.Mesh(markerGeo.pinHead, new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.25 }));
      head.position.y = 0.42;
      const stick = new THREE.Mesh(markerGeo.pinStick, new THREE.MeshLambertMaterial({ color: hex }));
      stick.position.y = 0.2;
      g.add(head, stick);
      g.position.set(posOf(tile).x, topOf(tile) + 0.05, posOf(tile).z);
      return g;
    }

    function setMarkers(m: CityMarkers) {
      lastMarkers = m;
      for (const c of [...markerGroup.children]) {
        markerGroup.remove(c);
        c.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        });
      }
      pulsers.length = 0;
      if (!tiles.length) return;
      const ok = (t: number) => t >= 0 && t < builtCount;

      // Searched tiles: a coloured glass block over the whole tile, with a solid cap on top.
      // Blue = you searched, empty. Red = you found someone. Orange = searched (hiders' view).
      const mineSet = new Set([...m.searchedEmpty, ...m.searchedHit]);
      const blocks: { tile: number; color: number }[] = [
        ...m.locked.filter((t) => ok(t) && !mineSet.has(t)).map((tile) => ({ tile, color: 0xff922b })),
        ...m.searchedEmpty.filter(ok).map((tile) => ({ tile, color: 0x5c7cfa })),
        ...m.searchedHit.filter(ok).map((tile) => ({ tile, color: 0xe5484d })),
      ];
      if (blocks.length) {
        const glass = new THREE.InstancedMesh(glassBox, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false }), blocks.length);
        const caps = new THREE.InstancedMesh(glassBox, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85 }), blocks.length);
        blocks.forEach((b, k) => {
          const p = posOf(b.tile);
          const h = topOf(b.tile) + 0.12;
          m4.compose(v.set(p.x, 0, p.z), q.identity(), s.set(1.02, h, 1.02));
          glass.setMatrixAt(k, m4);
          m4.compose(v.set(p.x, h, p.z), q.identity(), s.set(1.02, 0.04, 1.02));
          caps.setMatrixAt(k, m4);
          glass.setColorAt(k, color.setHex(b.color));
          caps.setColorAt(k, color.setHex(b.color));
        });
        glass.renderOrder = 2;
        markerGroup.add(glass, caps);
      }
      for (const t of m.caught.filter(ok)) markerGroup.add(pin(t, 0xe5484d));

      // Everyone's latest searches light up: a bright beam that fades, then a ring that stays.
      for (const r of m.recent.filter((x) => ok(x.tile))) {
        const p = posOf(r.tile);
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: 0xfff3bf, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.scale.set(2.2, topOf(r.tile) + 7, 2.2);
        beam.position.set(p.x, 0, p.z);
        beam.renderOrder = 4;
        markerGroup.add(beam);
        pulsers.push({ obj: beam, kind: "flash", base: Date.now() - r.ageMs });
        const ring = new THREE.Mesh(markerGeo.ring, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
        ring.scale.setScalar(1.25);
        ring.position.set(p.x, topOf(r.tile) + 0.2, p.z);
        markerGroup.add(ring);
      }
      for (const t of m.left.filter(ok)) {
        const ring = new THREE.Mesh(markerGeo.ring, new THREE.MeshBasicMaterial({ color: 0xffb400 }));
        ring.position.set(posOf(t).x, topOf(t) + 0.15, posOf(t).z);
        markerGroup.add(ring);
        pulsers.push({ obj: ring, kind: "pulse", base: 1 });
      }
      for (const sw of m.sweeps) {
        if (!ok(sw.tile)) continue;
        const size = sw.radius * 2 + 1;
        const hex = sw.count > 0 ? 0xffb400 : 0x4dabf7;
        const sq = new THREE.Mesh(
          markerGeo.square,
          new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.18, depthWrite: false }),
        );
        sq.scale.set(size, 1, size);
        sq.position.set(posOf(sw.tile).x, 0.12, posOf(sw.tile).z);
        sq.renderOrder = 2;
        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(size, 0.01, size)),
          new THREE.LineBasicMaterial({ color: hex }),
        );
        edge.position.copy(sq.position);
        markerGroup.add(sq, edge);
      }
      if (m.me !== null && ok(m.me) && m.me !== lastMe) {
        // Glide the camera to the player's hiding spot when it is first known (or after a move).
        focus = new THREE.Vector3(posOf(m.me).x, 0, posOf(m.me).z);
      }
      lastMe = m.me;
      if (m.me !== null && ok(m.me)) {
        const g = new THREE.Group();
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: 0x12b886, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.scale.set(1.6, topOf(m.me) + 6, 1.6);
        beam.renderOrder = 3;
        // Your own face floats above your hiding spot.
        const gem = new THREE.Sprite(new THREE.SpriteMaterial({ map: faceTexture(atmos.current.meAvatar, "#12b886"), depthTest: false }));
        gem.renderOrder = 7;
        gem.scale.setScalar(1.1);
        gem.position.y = topOf(m.me) + 1.3;
        const pinTip = new THREE.Mesh(markerGeo.pinStick, new THREE.MeshBasicMaterial({ color: 0x12b886 }));
        pinTip.scale.set(1.4, 1.4, 1.4);
        pinTip.position.y = topOf(m.me) + 0.55;
        g.add(beam, gem, pinTip);
        g.position.set(posOf(m.me).x, 0, posOf(m.me).z);
        markerGroup.add(g);
        pulsers.push({ obj: gem, kind: "bob", base: gem.position.y });
      }
      if (m.decoy !== null && m.decoy !== undefined && ok(m.decoy)) {
        // Your decoy: a purple inflatable tube man waving about (only you see it).
        const g = new THREE.Group();
        const purple = new THREE.MeshLambertMaterial({ color: 0x9775fa, emissive: 0x5f3dc4, emissiveIntensity: 0.25 });
        const man = new THREE.Group();
        const tube = new THREE.Mesh(markerGeo.tube, purple);
        tube.castShadow = true;
        const head = new THREE.Mesh(markerGeo.ball, purple);
        head.scale.setScalar(0.16);
        head.position.y = 0.56;
        const face = new THREE.MeshBasicMaterial({ color: 0x1b1b1b });
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(markerGeo.ball, face);
          eye.scale.setScalar(0.03);
          eye.position.set(side * 0.035, 0.58, 0.07);
          man.add(eye);
        }
        const mouth = new THREE.Mesh(markerGeo.ball, face);
        mouth.scale.set(0.06, 0.02, 0.02);
        mouth.position.set(0, 0.525, 0.075);
        const arms: THREE.Mesh[] = [];
        for (const side of [-1, 1]) {
          const arm = new THREE.Mesh(markerGeo.arm, purple);
          arm.position.set(side * 0.05, 0.4, 0);
          arm.rotation.z = -side * 1.1;
          arms.push(arm);
          man.add(arm);
        }
        man.add(tube, head, mouth);
        man.userData.arms = arms;
        man.scale.setScalar(1.5);
        const base = new THREE.Mesh(markerGeo.stand, new THREE.MeshLambertMaterial({ color: 0x5f3dc4 }));
        base.scale.set(0.3, 0.04, 0.3);
        const ring = new THREE.Mesh(markerGeo.dash, new THREE.MeshBasicMaterial({ color: 0x9775fa, transparent: true, opacity: 0.85, depthWrite: false }));
        ring.position.y = 0.02;
        g.add(man, base, ring);
        g.position.set(posOf(m.decoy).x, topOf(m.decoy) + 0.02, posOf(m.decoy).z);
        markerGroup.add(g);
        pulsers.push({ obj: man, kind: "sway", base: Math.random() * 6 });
      }
      if (m.pending !== null && ok(m.pending)) {
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
        );
        beam.scale.set(2, topOf(m.pending) + 2, 2);
        beam.position.set(posOf(m.pending).x, 0, posOf(m.pending).z);
        markerGroup.add(beam);
        pulsers.push({ obj: beam, kind: "spin", base: 1 });
      }
    }

    function updateMarkers(time: number) {
      for (const p of pulsers) {
        if (p.kind === "pulse") p.obj.scale.setScalar(1 + Math.sin(time * 4) * 0.12);
        if (p.kind === "bob") {
          p.obj.position.y = p.base + Math.sin(time * 2.5) * 0.15;
        }
        if (p.kind === "spin") ((p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(time * 5)) * 0.3;
        if (p.kind === "sway") {
          // The tube man wobbles and flaps its arms.
          const t = time + p.base;
          p.obj.rotation.z = Math.sin(t * 2.6) * 0.18 + Math.sin(t * 6.1) * 0.05;
          p.obj.rotation.x = Math.sin(t * 1.9) * 0.08;
          const arms = p.obj.userData.arms as THREE.Object3D[];
          arms[0].rotation.z = 1.1 + Math.sin(t * 7) * 0.6;
          arms[1].rotation.z = -1.1 + Math.sin(t * 6.3 + 1) * 0.6;
        }
        if (p.kind === "flash") {
          const age = (Date.now() - p.base) / 1000;
          const mat = (p.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = age < 0 || age > 12 ? 0 : (1 - age / 12) * (0.45 + Math.abs(Math.sin(time * 6)) * 0.25);
          p.obj.visible = mat.opacity > 0.01;
        }
      }
    }

    // ---- little scenes for things that just happened
    // Search: a person, soldier or dog walks round the tile and looks about; if nobody turns
    // up, a puff and a "?" . Sweep: a drone flies over and scans the area. Catch: police
    // lights and a siren ring. Move: a puff where the hider was.
    type Fx = { obj: THREE.Object3D; start: number; dur: number; step: (t: number) => void };
    let fx: Fx[] = [];
    const seenEvents = new Set<number>();
    const fxMat = (color: number) => new THREE.MeshLambertMaterial({ color });
    const unknownTex = labelTexture("?", "#8b95a1");
    const cuffTex = labelTexture("!", "#e5484d");
    const ringGeo = new THREE.RingGeometry(0.42, 0.5, 32).rotateX(-Math.PI / 2);

    // Searchers share their shapes and paints (marked "keep" so finished scenes don't free them).
    const keep = <T extends THREE.BufferGeometry | THREE.Material>(x: T) => {
      x.userData.keep = true;
      return x;
    };
    const walkerGeo = {
      body: keep(new THREE.CylinderGeometry(0.045, 0.055, 0.18, 8)),
      legs: keep(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8)),
      head: keep(new THREE.SphereGeometry(0.045, 10, 8)),
      helmet: keep(new THREE.SphereGeometry(0.052, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
      dogBody: keep(new THREE.BoxGeometry(0.2, 0.08, 0.08)),
      dogHead: keep(new THREE.BoxGeometry(0.08, 0.08, 0.07)),
      dogTail: keep(new THREE.BoxGeometry(0.06, 0.02, 0.02)),
      dogLeg: keep(new THREE.BoxGeometry(0.025, 0.08, 0.025)),
    };
    const paints = new Map<number, THREE.MeshLambertMaterial>();
    const paint = (hex: number) => {
      let m = paints.get(hex);
      if (!m) {
        m = keep(new THREE.MeshLambertMaterial({ color: hex }));
        paints.set(hex, m);
      }
      return m;
    };
    function makeWalker(kind: number) {
      const g = new THREE.Group();
      if (kind === 2) {
        // Dog
        const fur = paint(0xa0703c);
        const body = new THREE.Mesh(walkerGeo.dogBody, fur);
        body.position.y = 0.11;
        const head = new THREE.Mesh(walkerGeo.dogHead, fur);
        head.position.set(0.12, 0.16, 0);
        const tail = new THREE.Mesh(walkerGeo.dogTail, fur);
        tail.position.set(-0.12, 0.15, 0);
        tail.rotation.z = 0.6;
        g.add(body, head, tail);
        for (const [lx, lz] of [[0.07, 0.03], [0.07, -0.03], [-0.07, 0.03], [-0.07, -0.03]]) {
          const leg = new THREE.Mesh(walkerGeo.dogLeg, fur);
          leg.position.set(lx, 0.04, lz);
          g.add(leg);
        }
      } else {
        // Person (kind 0) or soldier (kind 1)
        const shirt = kind === 1 ? 0x5c7a3a : [0x4dabf7, 0xff6b6b, 0xffd43b, 0x845ef7][Math.floor(Math.random() * 4)];
        const body = new THREE.Mesh(walkerGeo.body, paint(shirt));
        body.position.y = 0.17;
        const legs = new THREE.Mesh(walkerGeo.legs, paint(kind === 1 ? 0x4a5d2f : 0x343a40));
        legs.position.y = 0.045;
        const head = new THREE.Mesh(walkerGeo.head, paint(0xf1c27d));
        head.position.y = 0.3;
        g.add(body, legs, head);
        if (kind === 1) {
          const helmet = new THREE.Mesh(walkerGeo.helmet, paint(0x4a5d2f));
          helmet.position.y = 0.305;
          g.add(helmet);
        }
      }
      g.traverse((o) => (o.castShadow = true));
      g.scale.setScalar(1.5);
      return g;
    }

    function addFx(obj: THREE.Object3D, dur: number, step: (t: number) => void) {
      fxGroup.add(obj);
      fx.push({ obj, start: performance.now(), dur, step });
    }

    function puff(tile: Tile, color: number, delay = 0) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
      ring.position.set(tile.x, 0.12, tile.z);
      addFx(ring, 1400 + delay, (t) => {
        const k = Math.max(0, (t * (1400 + delay) - delay) / 1400);
        ring.visible = k > 0;
        ring.scale.setScalar(0.4 + k * 1.6);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      });
    }

    function searchScene(tile: Tile, found: boolean) {
      const kind = Math.floor(hashish(tile.r[0], tile.i) * 3);
      const walker = makeWalker(kind);
      const corners = [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]];
      const start = Math.floor(Math.random() * 4);
      addFx(walker, 2000, (t) => {
        // A dash along two sides of the tile, a good look around, then gone (two seconds).
        const walk = Math.min(1, t / 0.7) * 2;
        const a = corners[(start + Math.floor(walk)) % 4];
        const b = corners[(start + Math.floor(walk) + 1) % 4];
        const f = walk % 1;
        const px = a[0] + (b[0] - a[0]) * (walk >= 2 ? 1 : f);
        const pz = a[1] + (b[1] - a[1]) * (walk >= 2 ? 1 : f);
        walker.position.set(tile.x + px, 0.08 + (t < 0.7 ? Math.abs(Math.sin(t * 40)) * 0.02 : 0), tile.z + pz);
        walker.rotation.y = t < 0.7 ? Math.atan2(-(b[1] - a[1]), b[0] - a[0]) : Math.sin(t * 9) * 1.2;
        const fade = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
        walker.scale.setScalar(1.5 * Math.min(1, t * 10) * fade + 0.0001);
      });
      if (!found) {
        puff(tile, 0x8b95a1, 1350);
        const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: unknownTex, transparent: true, depthTest: false }));
        q.renderOrder = 6;
        addFx(q, 2800, (t) => {
          const k = Math.max(0, (t - 0.5) / 0.5);
          q.visible = k > 0;
          q.position.set(tile.x, tile.top + 0.4 + k * 0.6, tile.z);
          q.scale.setScalar(0.45);
          q.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        });
      }
    }

    function sweepScene(tile: Tile, radius: number) {
      const drone = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), fxMat(0x343a40));
      drone.add(body);
      const rotors: THREE.Mesh[] = [];
      for (const [rx, rz] of [[0.15, 0.15], [-0.15, 0.15], [0.15, -0.15], [-0.15, -0.15]]) {
        const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.02), fxMat(0xdee2e6));
        rotor.position.set(rx, 0.05, rz);
        drone.add(rotor);
        rotors.push(rotor);
      }
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4dabf7 }));
      light.position.y = -0.04;
      drone.add(light);
      drone.scale.setScalar(1.6);
      const size = radius * 2 + 1;
      const scan = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x4dabf7, transparent: true, opacity: 0, depthWrite: false }),
      );
      scan.position.set(tile.x, 0.14, tile.z);
      scan.renderOrder = 3;
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(size, 0.02, 0.05),
        new THREE.MeshBasicMaterial({ color: 0xa5d8ff, transparent: true, depthWrite: false }),
      );
      line.renderOrder = 4;
      const fromX = tile.x + 8;
      const fromZ = tile.z + 6;
      addFx(drone, 6500, (t) => {
        for (const r of rotors) r.rotation.y += 0.9;
        const h = 2.6 + radius * 0.4;
        if (t < 0.2) {
          const k = t / 0.2;
          drone.position.set(fromX + (tile.x - fromX) * k, h + 2 * (1 - k), fromZ + (tile.z - fromZ) * k);
        } else if (t < 0.8) {
          const a = ((t - 0.2) / 0.6) * Math.PI * 2;
          drone.position.set(tile.x + Math.cos(a) * radius * 0.6, h, tile.z + Math.sin(a) * radius * 0.6);
        } else {
          const k = (t - 0.8) / 0.2;
          drone.position.set(tile.x - k * 6, h + k * 4, tile.z - k * 5);
        }
      });
      addFx(scan, 6500, (t) => {
        const on = t > 0.2 && t < 0.8;
        (scan.material as THREE.MeshBasicMaterial).opacity = on ? 0.18 + Math.abs(Math.sin(t * 30)) * 0.12 : 0;
      });
      addFx(line, 6500, (t) => {
        const on = t > 0.2 && t < 0.8;
        line.visible = on;
        line.position.set(tile.x, 0.16, tile.z - size / 2 + (((t - 0.2) / 0.3) % 1) * size);
      });
    }

    function arrestScene(tile: Tile, hiders: { name: string | null; avatar: unknown; bot: boolean }[] = []) {
      // The faces of whoever got caught pop up over the spot.
      hiders.slice(0, 3).forEach((h, k) => {
        const tex = h.bot ? botTexture() : faceTexture(cleanAvatar(h.avatar, h.name ?? "ghost"), "#e5484d");
        const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        face.renderOrder = 8;
        addFx(face, 6000, (t) => {
          const pop = Math.min(1, t * 6);
          face.scale.setScalar(0.9 * pop);
          face.position.set(tile.x + (k - (Math.min(hiders.length, 3) - 1) / 2) * 0.95, tile.top + 1.5 + Math.sin(t * 10) * 0.05, tile.z);
          face.material.opacity = t > 0.85 ? (1 - t) / 0.15 : 1;
        });
      });
      const g = new THREE.Group();
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
      const blue = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0x2d6bff }));
      red.position.x = -0.1;
      blue.position.x = 0.1;
      g.add(red, blue);
      const car = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.17), fxMat(0xffffff));
      shell.position.y = 0.08;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.345, 0.03, 0.175), fxMat(0x1c3faa));
      band.position.y = 0.09;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.15), fxMat(0x343a40));
      cab.position.y = 0.16;
      car.add(shell, band, cab);
      car.position.set(tile.x + 0.42, 0.06, tile.z);
      car.rotation.y = Math.PI / 2;
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: cuffTex, transparent: true, depthTest: false }));
      sign.renderOrder = 6;
      addFx(car, 5500, (t) => car.scale.setScalar(Math.min(1, t * 10) * (t > 0.9 ? (1 - t) * 10 : 1) + 0.0001));
      addFx(g, 5500, (t) => {
        g.position.set(tile.x + 0.42, 0.33, tile.z);
        const flip = Math.sin(t * 70) > 0;
        red.visible = flip;
        blue.visible = !flip;
      });
      addFx(sign, 5500, (t) => {
        sign.position.set(tile.x, tile.top + 0.6 + Math.sin(t * 12) * 0.05, tile.z);
        sign.scale.setScalar(0.5);
        sign.material.opacity = t > 0.85 ? (1 - t) / 0.15 : 1;
      });
      puff(tile, 0xe5484d);
      puff(tile, 0xe5484d, 600);
    }

    // A big search: a squad fans out over the 3×3 block round the tile while a searchlight sweeps it.
    const searchlightGeo = keep(new THREE.ConeGeometry(0.9, 1, 20, 1, true).translate(0, -0.5, 0));
    function areaSearchScene(tile: Tile, r: number) {
      const size = r * 2 + 1;
      const ORDER = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [0, 0]];
      ORDER.forEach(([ox, oz], k) => {
        const kind = k === 8 ? 2 : k % 3 === 2 ? 2 : k % 2;
        const walker = makeWalker(kind);
        const tx = tile.x + ox * r;
        const tz = tile.z + oz * r;
        const spin = Math.random() * Math.PI * 2;
        const delay = k * 0.025;
        addFx(walker, 2500, (t) => {
          const u = Math.max(0, t - delay);
          let px: number;
          let pz: number;
          let face: number;
          if (u < 0.32) {
            // Fan out from the middle.
            const f = u / 0.32;
            px = tile.x + (tx - tile.x) * f;
            pz = tile.z + (tz - tile.z) * f;
            face = Math.atan2(-(tz - tile.z), tx - tile.x || 0.001);
          } else {
            // Search round the tile, looking about.
            const a = spin + (u - 0.32) * 9;
            px = tx + Math.cos(a) * 0.28;
            pz = tz + Math.sin(a) * 0.28;
            face = -a - Math.PI / 2 + Math.sin(u * 30) * 0.5;
          }
          walker.position.set(px, 0.08 + (u < 0.85 ? Math.abs(Math.sin(u * 45)) * 0.025 : 0), pz);
          walker.rotation.y = face;
          const fade = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
          walker.scale.setScalar(1.5 * Math.min(1, u * 12) * fade + 0.0001);
        });
      });
      // The area lights up...
      const zone = new THREE.Mesh(
        markerGeo.square,
        new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, opacity: 0, depthWrite: false }),
      );
      zone.scale.set(size, 1, size);
      zone.position.set(tile.x, 0.13, tile.z);
      zone.renderOrder = 3;
      addFx(zone, 2500, (t) => {
        const env = Math.min(1, t * 6) * (t > 0.8 ? (1 - t) / 0.2 : 1);
        (zone.material as THREE.MeshBasicMaterial).opacity = env * (0.12 + Math.abs(Math.sin(t * 14)) * 0.1);
      });
      // ...and a searchlight sweeps round it.
      const beam = new THREE.Mesh(
        searchlightGeo,
        new THREE.MeshBasicMaterial({ color: 0xfff3bf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.renderOrder = 5;
      const spot = new THREE.Mesh(
        markerGeo.square,
        new THREE.MeshBasicMaterial({ map: poolMat.map, color: 0xfff3bf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      spot.renderOrder = 4;
      const H = 4.5;
      addFx(beam, 2500, (t) => {
        const env = Math.min(1, t * 5) * (t > 0.85 ? (1 - t) / 0.15 : 1);
        const a = t * Math.PI * 2 * 1.3;
        const gx = tile.x + Math.cos(a) * r * 0.9;
        const gz = tile.z + Math.sin(a) * r * 0.9;
        // Hang the beam from above the middle and point it at (gx, gz).
        const dx = gx - tile.x;
        const dz = gz - tile.z;
        const len = Math.hypot(dx, dz, H);
        beam.position.set(tile.x, H, tile.z);
        beam.scale.set(1, len, 1);
        beam.quaternion.setFromUnitVectors(up, v.set(-dx / len, H / len, -dz / len));
        (beam.material as THREE.MeshBasicMaterial).opacity = env * 0.28;
        spot.position.set(gx, 0.15, gz);
        spot.scale.set(2.2, 1, 2.2);
        (spot.material as THREE.MeshBasicMaterial).opacity = env * 0.8;
      });
      addFx(spot, 2500, () => {});
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd43b, transparent: true, depthWrite: false }));
      ring.position.set(tile.x, 0.14, tile.z);
      addFx(ring, 2500, (t) => {
        const k = Math.min(1, t / 0.4);
        ring.scale.setScalar(0.5 + k * size * 1.1);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      });
    }

    // A decoy goes off: a cartoon explosion, or a toy pops out and wobbles.
    const sparkGeo = keep(new THREE.BoxGeometry(0.05, 0.05, 0.05));
    const blobGeo = keep(new THREE.IcosahedronGeometry(0.5, 1));
    const smokeRingGeo = keep(new THREE.TorusGeometry(0.5, 0.13, 6, 24).rotateX(Math.PI / 2));
    const ballGeo = keep(new THREE.SphereGeometry(0.5, 14, 10));
    const boomTex = boomTexture();
    function explodeScene(tile: Tile) {
      const y0 = tile.top + 0.1;
      const fire = new THREE.Group();
      const outer = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true }));
      const inner = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true }));
      inner.scale.setScalar(0.65);
      fire.add(outer, inner);
      fire.position.set(tile.x, y0, tile.z);
      addFx(fire, 3000, (t) => {
        const k = t / 0.16;
        const size = t < 0.16 ? easeOutBack(Math.min(1, k)) * 1.5 : 1.5 * Math.max(0, 1 - (t - 0.16) / 0.2);
        fire.scale.setScalar(size + 0.0001);
        fire.rotation.y = t * 4;
        fire.visible = size > 0.01;
      });
      const ring = new THREE.Mesh(smokeRingGeo, new THREE.MeshLambertMaterial({ color: 0xb8bec6, transparent: true, depthWrite: false }));
      ring.position.set(tile.x, y0, tile.z);
      addFx(ring, 3000, (t) => {
        const k = Math.min(1, t / 0.6);
        ring.scale.setScalar(0.4 + k * 2.4);
        ring.position.y = y0 + k * 0.3;
        (ring.material as THREE.MeshLambertMaterial).opacity = 0.85 * (1 - Math.min(1, t / 0.7));
      });
      // Puffs of smoke drifting up.
      const smokeMat = new THREE.MeshLambertMaterial({ color: 0x9aa1aa, transparent: true, depthWrite: false, flatShading: true });
      const smoke = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const b = new THREE.Mesh(blobGeo, smokeMat);
        const a = (k / 6) * Math.PI * 2;
        b.userData = { dx: Math.cos(a) * 0.3, dz: Math.sin(a) * 0.3, s: 0.5 + (k % 3) * 0.2 };
        smoke.add(b);
      }
      smoke.position.set(tile.x, y0, tile.z);
      addFx(smoke, 3000, (t) => {
        const k = Math.max(0, (t - 0.08) / 0.92);
        smoke.visible = k > 0;
        for (const b of smoke.children) {
          const u = b.userData as { dx: number; dz: number; s: number };
          b.position.set(u.dx * (1 + k * 2), 0.2 + k * 1.6, u.dz * (1 + k * 2));
          b.scale.setScalar(u.s * (0.4 + k * 1.2));
        }
        smokeMat.opacity = 0.75 * (1 - k);
      });
      // Sparks flying out.
      const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd43b });
      const sparks = new THREE.Group();
      for (let k = 0; k < 12; k++) {
        const b = new THREE.Mesh(sparkGeo, sparkMat);
        const a = Math.random() * Math.PI * 2;
        const sp = 1.6 + Math.random() * 1.8;
        b.userData = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 2.5 };
        sparks.add(b);
      }
      sparks.position.set(tile.x, y0, tile.z);
      addFx(sparks, 3000, (t) => {
        const tt = t * 3;
        sparks.visible = tt < 0.9;
        for (const b of sparks.children) {
          const u = b.userData as { vx: number; vy: number; vz: number };
          b.position.set(u.vx * tt, u.vy * tt - 4.9 * tt * tt, u.vz * tt);
          b.rotation.set(tt * 9, tt * 7, 0);
        }
      });
      // "BOOM!"
      const word = new THREE.Sprite(new THREE.SpriteMaterial({ map: boomTex, transparent: true, depthTest: false }));
      word.renderOrder = 8;
      addFx(word, 3000, (t) => {
        const k = Math.min(1, t / 0.12);
        word.scale.set(1.6 * easeOutBack(k), 0.8 * easeOutBack(k), 1);
        word.position.set(tile.x, y0 + 1.1 + t * 0.4, tile.z);
        word.material.opacity = t > 0.7 ? (1 - t) / 0.3 : 1;
      });
    }

    function toyScene(tile: Tile, id: number) {
      const y0 = tile.top + 0.05;
      const toy = new THREE.Group();
      const duck = id % 2 === 0;
      if (duck) {
        // A rubber duck
        const yellow = new THREE.MeshLambertMaterial({ color: 0xffd43b });
        const body = new THREE.Mesh(ballGeo, yellow);
        body.scale.set(0.62, 0.44, 0.48);
        body.position.y = 0.22;
        const head = new THREE.Mesh(ballGeo, yellow);
        head.scale.setScalar(0.3);
        head.position.set(0.18, 0.52, 0);
        const beak = new THREE.Mesh(ballGeo, new THREE.MeshLambertMaterial({ color: 0xff8a1f }));
        beak.scale.set(0.16, 0.06, 0.14);
        beak.position.set(0.34, 0.5, 0);
        const tail = new THREE.Mesh(ballGeo, yellow);
        tail.scale.set(0.16, 0.18, 0.16);
        tail.position.set(-0.3, 0.36, 0);
        toy.add(body, head, beak, tail);
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0x1b1b1b }));
          eye.scale.setScalar(0.05);
          eye.position.set(0.27, 0.58, side * 0.08);
          toy.add(eye);
        }
      } else {
        // A teddy bear
        const fur = new THREE.MeshLambertMaterial({ color: 0xb07d48 });
        const light = new THREE.MeshLambertMaterial({ color: 0xe8c9a0 });
        const add = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
          const b = new THREE.Mesh(ballGeo, m);
          b.scale.set(sx, sy, sz);
          b.position.set(x, y, z);
          toy.add(b);
        };
        add(fur, 0, 0.22, 0, 0.42, 0.46, 0.38);
        add(light, 0.12, 0.22, 0, 0.12, 0.26, 0.24);
        add(fur, 0, 0.58, 0, 0.32);
        add(light, 0.13, 0.55, 0, 0.12, 0.1, 0.13);
        for (const side of [-1, 1]) {
          add(fur, -0.02, 0.73, side * 0.12, 0.12);
          add(fur, 0.02, 0.3, side * 0.2, 0.13, 0.22, 0.13);
          add(fur, 0.08, 0.05, side * 0.11, 0.15, 0.12, 0.15);
          const eye = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0x1b1b1b }));
          eye.scale.setScalar(0.045);
          eye.position.set(0.14, 0.63, side * 0.06);
          toy.add(eye);
        }
      }
      toy.traverse((o) => (o.castShadow = true));
      toy.position.set(tile.x, y0, tile.z);
      const turn = Math.random() * Math.PI * 2;
      addFx(toy, 3000, (t) => {
        const pop = t < 0.12 ? easeOutBack(t / 0.12) : t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
        const sc = 1.3 * pop + 0.0001;
        // Squash and stretch as it bounces, wobbling side to side.
        const bounce = Math.abs(Math.sin(t * 16)) * Math.max(0, 0.6 - t) * 0.5;
        toy.scale.set(sc * (1 - bounce * 0.3), sc * (1 + bounce * 0.4), sc * (1 - bounce * 0.3));
        toy.position.y = y0 + bounce * 0.4;
        toy.rotation.set(Math.sin(t * 22) * 0.3 * (1 - t), turn + t * 1.5, Math.sin(t * 18) * 0.35 * (1 - t));
      });
      // A burst of confetti.
      const conf = new THREE.Group();
      const hues = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2];
      for (let k = 0; k < 14; k++) {
        const b = new THREE.Mesh(sparkGeo, paint(hues[k % hues.length]));
        const a = Math.random() * Math.PI * 2;
        const sp = 0.8 + Math.random() * 1.2;
        b.scale.set(1, 0.3, 0.7);
        b.userData = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2.2 + Math.random() * 1.5 };
        conf.add(b);
      }
      conf.position.set(tile.x, y0 + 0.2, tile.z);
      addFx(conf, 3000, (t) => {
        const tt = t * 3;
        conf.visible = tt < 1.4;
        for (const b of conf.children) {
          const u = b.userData as { vx: number; vy: number; vz: number };
          b.position.set(u.vx * tt, Math.max(-0.2, u.vy * tt - 3 * tt * tt), u.vz * tt);
          b.rotation.set(tt * 8, tt * 5, tt * 3);
        }
      });
      puff(tile, 0xf783ac);
    }

    function playEvents(list: CityEvent[]) {
      for (const e of list) {
        if (seenEvents.has(e.id)) continue;
        // Things with no place on the map (respawns, new decoys...) have nothing to show.
        if (typeof e.tile !== "number" || !Number.isInteger(e.tile) || e.tile < 0) {
          seenEvents.add(e.id);
          continue;
        }
        const tile = tileById.get(e.tile);
        if (!tile) continue; // not built yet: try again once the city has grown
        seenEvents.add(e.id);
        // Whoever got caught keeps floating over the spot for the rest of the round.
        if (e.kind === "caught") {
          (e.detail?.hiders ?? []).forEach((h, k) => caughtFromEvents.set(`${e.id}:${k}`, { tile: e.tile!, name: h.name, avatar: h.avatar, bot: h.bot }));
        }
        if (e.ageMs > 15000) continue;
        if (e.kind === "searched") {
          const found = list.some((x) => x.kind === "caught" && x.tile === e.tile && Math.abs(x.id - e.id) <= 2);
          searchScene(tile, found);
        } else if (e.kind === "area_search") areaSearchScene(tile, Math.max(1, Math.min(3, e.detail?.radius ?? 1)));
        else if (e.kind === "decoy_found") {
          if (e.detail?.outcome === "toy") toyScene(tile, e.id);
          else explodeScene(tile);
        } else if (e.kind === "sweep") sweepScene(tile, e.detail?.radius ?? 1);
        else if (e.kind === "caught") arrestScene(tile, e.detail?.hiders ?? []);
        else if (e.kind === "moved") puff(tile, 0xffb400);
        else if (e.kind === "shielded") {
          // A shield flash: the hider blinked away to somewhere nearby.
          puff(tile, 0x9775fa);
          puff(tile, 0x9775fa, 250);
          puff(tile, 0xd0bfff, 500);
        }
      }
      drawCaught();
    }

    function updateFx(now: number) {
      fx = fx.filter((f) => {
        const t = (now - f.start) / f.dur;
        if (t >= 1) {
          fxGroup.remove(f.obj);
          f.obj.traverse((o) => {
            if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
              if (o instanceof THREE.Mesh && o.geometry !== ringGeo && !o.geometry.userData.keep) o.geometry.dispose();
              const m = o.material as THREE.Material;
              if (!m.userData.keep) m.dispose();
            }
          });
          return false;
        }
        f.step(t);
        return true;
      });
    }

    // ---- sky: day and night, weather, stars and rain
    const glassMat = meshDefs.glass.material as THREE.MeshLambertMaterial;
    const C = {
      day: new THREE.Color(SKY),
      dusk: new THREE.Color(0xf2b48a),
      night: new THREE.Color(0x0d1630),
      grey: new THREE.Color(0x9aa5b1),
      fog: new THREE.Color(0xcfd6dc),
      lampOff: new THREE.Color(0x868e96),
      lampOn: new THREE.Color(0xfff1b8),
      windowDay: new THREE.Color(0x0b1a2a),
      windowNight: new THREE.Color(0xffc970),
      frameDay: new THREE.Color(0x5c636a),
      frameNight: new THREE.Color(0xfff4d6),
      flash: new THREE.Color(0xe4e9ff),
      plotDay: new THREE.Color(0xdfe5ec),
      plotNight: new THREE.Color(0x3a4352),
      ghostDay: new THREE.Color(0x7c8da3),
      ghostNight: new THREE.Color(0x5a6a80),
    };
    const skyCol = new THREE.Color();
    let fogFactor = 0;
    let atmosT = 1;

    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(700 * 3);
    for (let k = 0; k < 700; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.45 + 0.08;
      starPos.set([Math.cos(a) * Math.cos(e) * 160, Math.sin(e) * 160, Math.sin(a) * Math.cos(e) * 160], k * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const RAIN = 900;
    const rainPos = new Float32Array(RAIN * 6);
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0xb8cce6, transparent: true, opacity: 0, depthWrite: false });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.visible = false;
    scene.add(rain);
    const rainSpan = () => radius * 1.4 + 8;
    for (let k = 0; k < RAIN; k++) {
      const x = (Math.random() - 0.5) * 2;
      const y = Math.random() * 14;
      const z = (Math.random() - 0.5) * 2;
      rainPos.set([x, y, z, x, y - 0.35, z], k * 6);
    }

    function updateAtmosphere(dt: number) {
      atmosT += dt;
      if (atmosT < 0.25) return;
      atmosT = 0;
      const { progress, nightFirst } = atmos.current;
      const dl = daylight(progress, nightFirst);
      const w = weatherAt(currentSeed, progress);
      const cloud = w.kind === "clear" ? 0 : w.kind === "cloudy" ? 0.45 * w.strength : w.kind === "rain" ? 0.45 + 0.3 * w.strength : 0.5 * w.strength;
      if (dl > 0.5) skyCol.copy(C.dusk).lerp(C.day, (dl - 0.5) / 0.5);
      else skyCol.copy(C.night).lerp(C.dusk, dl / 0.5);
      skyCol.lerp(dl > 0.3 ? C.grey : C.night, cloud * 0.6);
      if (w.kind === "fog") skyCol.lerp(C.fog, 0.35 * w.strength * Math.max(dl, 0.25));
      (scene.background as THREE.Color).copy(skyCol);
      (scene.fog as THREE.Fog).color.copy(skyCol);
      hemi.intensity = 0.3 + 1.2 * dl * (1 - cloud * 0.35);
      sun.intensity = Math.max(0.3, 2.4 * dl * (1 - cloud * 0.7));
      sun.color.set(dl <= 0.12 ? 0x9fb4ff : dl < 0.75 ? 0xffb37a : 0xfff1dc);
      glassMat.emissive.copy(C.windowDay).lerp(C.windowNight, 1 - dl);
      glassMat.emissiveIntensity = 0.2 + (1 - dl) * 0.8;
      lampMat.color.copy(C.lampOff).lerp(C.lampOn, Math.min(1, (1 - dl) * 1.6));
      starMat.opacity = Math.max(0, (0.35 - dl) / 0.35) * (1 - cloud);
      cloudMat.color.setRGB(1 - cloud * 0.4, 1 - cloud * 0.38, 1 - cloud * 0.33);
      rain.visible = w.kind === "rain";
      rainMat.opacity = 0.45 * w.strength;
      storm = w.kind === "rain" ? w.strength : 0;
      fogFactor = w.kind === "fog" ? 0.6 * w.strength : w.kind === "rain" ? 0.25 * w.strength : 0;
      baseHemi = hemi.intensity;
      // Night lights: traffic-light pools, glowing billboards, car headlights.
      const night = Math.min(1, Math.max(0, (0.75 - dl) / 0.6));
      poolMat.opacity = 0.6 * night;
      if (pools) pools.visible = night > 0.02 && isRevealed;
      sites.setNight(night, C.windowDay, C.windowNight);
      boardGlowMat.color.copy(C.frameDay).lerp(C.frameNight, night);
      boardBeamMat.opacity = 0.2 * night;
      for (const b of boards) {
        b.mat.emissiveIntensity = 0.28 + 0.62 * night;
        b.beams.visible = night > 0.02;
      }
      carNight = night;
      // The see-through plots round the edge dim with the light (instead of glowing at night).
      plotMat.color.copy(C.plotDay).lerp(C.plotNight, night);
      ghostMat.color.copy(C.ghostDay).lerp(C.ghostNight, night);
    }

    // ---- thunder and lightning, now and then while it pours
    let storm = 0;
    let baseHemi = hemi.intensity;
    let nextStrike = 4 + Math.random() * 8;
    let strikeT = -1;
    const flashSky = new THREE.Color();
    const BOLT_PTS = 14;
    const boltPos = new Float32Array(BOLT_PTS * 2 * 3);
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute("position", new THREE.BufferAttribute(boltPos, 3));
    const boltIdx: number[] = [];
    for (let k = 0; k < BOLT_PTS - 1; k++) boltIdx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3);
    boltGeo.setIndex(boltIdx);
    const boltMat = new THREE.MeshBasicMaterial({ color: 0xf4f1ff, transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide });
    const bolt = new THREE.Mesh(boltGeo, boltMat);
    bolt.frustumCulled = false;
    bolt.visible = false;
    bolt.renderOrder = 1;
    scene.add(bolt);
    function strike() {
      // A jagged bolt far off over the hills, roughly on the side we're looking at.
      const look = Math.atan2(controls.target.z - camera.position.z, controls.target.x - camera.position.x);
      const a = look + (Math.random() - 0.5) * 1.6;
      const d = radius * 1.8 + 22 + Math.random() * 25;
      let x = controls.target.x + Math.cos(a) * d;
      let z = controls.target.z + Math.sin(a) * d;
      const ground = landHeight(x, z);
      const top = ground + 34 + Math.random() * 10;
      // Ribbon across the view.
      const px = -Math.sin(look);
      const pz = Math.cos(look);
      for (let k = 0; k < BOLT_PTS; k++) {
        const f = k / (BOLT_PTS - 1);
        const y = top + (ground - top) * f;
        if (k > 0) {
          x += (Math.random() - 0.5) * 2.4 * px;
          z += (Math.random() - 0.5) * 2.4 * pz;
        }
        const wd = 0.45 * (1 - f * 0.6);
        boltPos.set([x - px * wd, y, z - pz * wd, x + px * wd, y, z + pz * wd], k * 6);
      }
      boltGeo.attributes.position.needsUpdate = true;
      strikeT = 0;
      playSfx("thunder", { delay: 0.35 + d / 140 });
    }
    function updateLightning(dt: number) {
      if (storm > 0.45) {
        nextStrike -= dt;
        if (nextStrike <= 0 && strikeT < 0) {
          strike();
          nextStrike = 7 + Math.random() * 16;
        }
      }
      if (strikeT < 0) return;
      strikeT += dt;
      // Two or three quick flickers, then gone.
      const t = strikeT;
      const f = t < 0.07 ? 1 : t < 0.13 ? 0.15 : t < 0.2 ? 0.75 : t < 0.27 ? 0.1 : t < 0.36 ? 0.55 * (1 - (t - 0.27) / 0.09) : 0;
      hemi.intensity = baseHemi + f * 2.4;
      flashSky.copy(skyCol).lerp(C.flash, f * 0.55);
      (scene.background as THREE.Color).copy(flashSky);
      (scene.fog as THREE.Fog).color.copy(flashSky);
      boltMat.opacity = Math.min(1, f * 1.4);
      bolt.visible = f > 0.02;
      if (t > 0.4) {
        strikeT = -1;
        bolt.visible = false;
        hemi.intensity = baseHemi;
        (scene.background as THREE.Color).copy(skyCol);
        (scene.fog as THREE.Fog).color.copy(skyCol);
      }
    }

    function updateRain(dt: number) {
      if (!rain.visible) return;
      const span = rainSpan();
      if (immersive()) rain.position.set(camera.position.x, 0, camera.position.z);
      else rain.position.set(controls.target.x, 0, controls.target.z);
      rain.scale.set(span, 1, span);
      for (let k = 0; k < RAIN; k++) {
        const i = k * 6;
        let y = rainPos[i + 1] - dt * 13;
        if (y < 0) y += 14;
        rainPos[i + 1] = y;
        rainPos[i + 4] = y - 0.35;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    // ---- the edge of the city: see-through outlines of what's about to be built
    let ghosts: THREE.Object3D[] = [];
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7c8da3, wireframe: true, transparent: true, opacity: 0.35 });
    const plotMat = new THREE.MeshBasicMaterial({ color: 0xdfe5ec, transparent: true, opacity: 0.45, depthWrite: false });
    const craneMat = new THREE.MeshBasicMaterial({ color: 0xfab005, transparent: true, opacity: 0.5 });
    function buildGhosts(count: number) {
      for (const g of ghosts) scene.remove(g);
      ghosts = [];
      const n = Math.min(200, Math.round(8 * Math.sqrt(count) + 8));
      const frame = new THREE.InstancedMesh(geo.box, ghostMat, n);
      const plot = new THREE.InstancedMesh(geo.box, plotMat, n);
      for (let k = 0; k < n; k++) {
        const [gx, gz] = spiralXY(count + k);
        const h = 0.3 + hashish(gx * 0.13, gz) * 1.2;
        m4.compose(v.set(gx, 0.02, gz), q.identity(), s.set(0.7, h, 0.7));
        frame.setMatrixAt(k, m4);
        m4.compose(v.set(gx, 0, gz), q.identity(), s.set(0.94, 0.02, 0.94));
        plot.setMatrixAt(k, m4);
        if (k % 23 === 7) {
          const crane = new THREE.Group();
          const mast = new THREE.Mesh(geo.box, craneMat);
          mast.scale.set(0.07, 2.4, 0.07);
          const jib = new THREE.Mesh(geo.box, craneMat);
          jib.scale.set(1.3, 0.05, 0.05);
          jib.position.set(0.4, 2.4, 0);
          crane.add(mast, jib);
          crane.position.set(gx, 0, gz);
          crane.rotation.y = hashish(gx, gz) * 6;
          ghosts.push(crane);
          scene.add(crane);
        }
      }
      ghosts.push(frame, plot);
      scene.add(frame, plot);
    }

    // ---- a coin balloon, just for you: tap it to pop it
    let coin: { slot: number; obj: THREE.Group; hits: THREE.Object3D[]; born: number } | null = null;
    const coinTex = labelTexture("+", "#f5a524");
    function setBalloon(slot: number | null) {
      if (coin && coin.slot === slot) return;
      if (coin) {
        scene.remove(coin.obj);
        coin = null;
      }
      if (slot === null) return;
      const obj = new THREE.Group();
      const gold = new THREE.MeshLambertMaterial({ color: 0xffc53d, emissive: 0xb37400, emissiveIntensity: 0.35, flatShading: true });
      const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), gold);
      envelope.scale.y = 1.15;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.51, 0.45, 0.14, 14), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      band.position.y = -0.14;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), new THREE.MeshLambertMaterial({ color: 0x8a6a4f }));
      basket.position.y = -0.8;
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: coinTex, depthTest: false }));
      tag.renderOrder = 9;
      tag.scale.setScalar(0.45);
      tag.position.y = 0.95;
      obj.add(envelope, band, basket, tag);
      scene.add(obj);
      coin = { slot, obj, hits: [envelope, band, basket], born: performance.now() };
    }
    function updateCoin(time: number) {
      if (!coin) return;
      const a = time * 0.12 + coin.slot;
      const r = Math.min(radius * 0.5, 5);
      coin.obj.position.set(controls.target.x + Math.cos(a) * r, 3.2 + Math.sin(time * 1.3) * 0.25, controls.target.z + Math.sin(a) * r);
      coin.obj.scale.setScalar(Math.min(1, (performance.now() - coin.born) / 800));
    }
    function coinUnder(clientX: number, clientY: number) {
      if (!coin) return false;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      return ray.intersectObjects(coin.hits, false).length > 0;
    }

    // ---- hover highlight and taps
    const hoverBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
      new THREE.LineBasicMaterial({ color: 0x63e6be }),
    );
    hoverBox.visible = false;
    scene.add(hoverBox);
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function tileUnder(clientX: number, clientY: number): number | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      if (!isRevealed) {
        // The city is hidden: use the ground.
        if (Math.abs(ray.ray.direction.y) < 1e-4) return null;
        const d = -ray.ray.origin.y / ray.ray.direction.y;
        if (d < 0) return null;
        const gx = Math.round(ray.ray.origin.x + ray.ray.direction.x * d);
        const gz = Math.round(ray.ray.origin.z + ray.ray.direction.z * d);
        return tileIndex.get(`${gx},${gz}`) ?? null;
      }
      const hits = ray.intersectObjects(Object.values(meshes), false);
      for (const h of hits) {
        // The square under the exact point touched (big buildings cover several squares).
        const byPoint = tileIndex.get(`${Math.round(h.point.x)},${Math.round(h.point.z)}`);
        if (byPoint !== undefined) return byPoint;
        const name = (h.object as THREE.InstancedMesh).userData.name as string;
        if (h.instanceId === undefined) continue;
        const p = parts[name]?.[h.instanceId];
        if (p) return p.tile;
      }
      return null;
    }

    function boardUnder(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const boardHit = ray.intersectObjects(boardHits, false)[0];
      if (!boardHit) return null;
      const tileHit = ray.intersectObjects(Object.values(meshes), false)[0];
      if (tileHit && tileHit.distance < boardHit.distance) return null;
      const board = boards[boardHit.object.userData.board as number];
      return { id: boardHit.object.userData.billboard as string, tile: boardHit.object.userData.tile as number, adId: board?.shown ?? null };
    }

    function showHover(tile: number | null) {
      if (tile === null) {
        hoverBox.visible = false;
        cb.current.onHover?.(null);
        return;
      }
      const t = tileById.get(tile);
      if (!t) return;
      if (!isRevealed) {
        // The city is still a secret: no addresses, no shapes.
        hoverBox.visible = true;
        hoverBox.position.set(t.x, 0, t.z);
        hoverBox.scale.set(1.02, 0.3, 1.02);
        cb.current.onHover?.({ tile, label: "Building site · the city appears when the hunt starts" });
        return;
      }
      // Highlight the whole building, and say who's inside.
      const r = roomFor(tile);
      if (!r) {
        hoverBox.visible = false;
        cb.current.onHover?.(null);
        return;
      }
      const a = r.anchor;
      const size = a.structure ? structureSize(a.structure) : { w: 1, d: 1 };
      hoverBox.visible = true;
      hoverBox.position.set(a.x + (size.w - 1) / 2, 0, a.z + (size.d - 1) / 2);
      hoverBox.scale.set(size.w + 0.04, a.top + 0.12, size.d + 0.04);
      const n = roomCountsNow[r.room.id] ?? 0;
      cb.current.onHover?.({ tile: a.i, label: `${r.room.name}${t.egg ? ` · ${t.egg.name}` : ""} · ${n ? `${n} inside` : "nobody inside yet"} · tap to go in` });
    }

    // ---- places: buildings and balloons are places to go inside, with people to chat with
    let roomCountsNow: Record<string, number> = {};
    const shortAddress = (a: string) => {
      for (const [full, short] of Object.entries(ABBREV)) {
        if (a.endsWith(` ${full}`)) return `${a.slice(0, -full.length)}${short}`;
      }
      return a;
    };
    /** The tile a place hangs off: big buildings use their corner tile, the station its middle tile. */
    function anchorOf(i: number): { anchor: Tile; big: boolean } | null {
      const t = tileById.get(i);
      if (!t || !currentPlan) return null;
      const rail = currentPlan.rail;
      const sxz = t.station && rail ? stationXZ(currentPlan) : null;
      if (sxz) {
        const at = tileIndex.get(`${sxz.x},${sxz.z}`);
        return { anchor: (at !== undefined && tileById.get(at)) || t, big: false };
      }
      if (t.kind === "structure" && t.structure) {
        const at = tileIndex.get(`${t.structure.ax},${t.structure.az}`);
        return { anchor: (at !== undefined && tileById.get(at)) || t, big: true };
      }
      return ROOM_LABEL[t.kind] ? { anchor: t, big: false } : null;
    }
    /** The chat room a tile belongs to (with its levels), or null. */
    function roomFor(i: number): { room: CityRoom; anchor: Tile; big: boolean; levels: PlaceLevel[] } | null {
      const a = anchorOf(i);
      if (!a || !currentPlan) return null;
      const { anchor, big } = a;
      const levels = levelsOf(anchor, currentPlan);
      if (!levels.length) return null;
      const name = anchor.home
        ? homeLabel(anchor.home)
        : anchor.station
        ? stationName(currentPlan)
        : anchor.kind === "structure" && anchor.structure
          ? anchor.structure.name
          : anchor.name
            ? anchor.name
            : `${shortAddress(addressOf(currentPlan, anchor))} · ${ROOM_LABEL[anchor.kind]}`;
      const capacity = levels.reduce((n, l) => n + l.capacity, 0);
      const room: CityRoom = { id: `b:${anchor.i}`, name, capacity, kind: "building", levels: levels.map((l) => ({ id: l.id, label: l.label, capacity: l.capacity, kind: levelUse(l) })) };
      return { room, anchor, big, levels };
    }
    /** A name for signs inside a building (company, hotel, hospital...). */
    function signName(anchor: Tile) {
      if (!currentPlan) return "Welcome";
      if (anchor.station) return stationName(currentPlan);
      if (anchor.structure) return anchor.structure.name;
      if (anchor.name) return anchor.name;
      const street = addressOf(currentPlan, anchor).replace(/^\d+\s+/, "").split(" ").slice(0, -1).join(" ") || currentPlan.city.name;
      if (anchor.kind === "hospital") return `${currentPlan.city.name} General Hospital`;
      if (anchor.kind === "police") return `${currentPlan.city.name} Police`;
      if (anchor.kind === "clock") return `${street} Clock Tower`;
      const ends = ["House", "Plaza", "Tower", "Centre", "Court", "Point", "Exchange", "Place"];
      return `${street} ${ends[Math.floor(anchor.r[1] * ends.length) % ends.length]}`;
    }
    const balloonRoom = (k: number): CityRoom => ({ id: `balloon:${k}`, name: `${BALLOON_NAMES[k] ?? `Balloon ${k + 1}`} hot-air balloon`, capacity: 1000, kind: "balloon" });

    function balloonUnder(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(balloonHits, false)[0];
      if (!hit) return null;
      const k = balloons.findIndex((b) => b.hits.includes(hit.object));
      return k >= 0 ? k : null;
    }

    // Count pills (a people icon and a number) over the busiest rooms (at most 40, for speed).
    // A building's pill steps aside (fades out) while it has an info bubble, or one covers it.
    type Pill = { sprite: THREE.Sprite; balloon: number; id: string; tile: number; hide: boolean; a: number };
    let pillPicks = -1;
    let pills: Pill[] = [];
    const pillGroup = new THREE.Group();
    scene.add(pillGroup);
    let pillKey = "";
    function rebuildPills() {
      const entries = Object.entries(roomCountsNow)
        .filter(([, n]) => typeof n === "number" && n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40);
      // The counts often arrive as a new object with the same numbers: nothing to redo then.
      const key = `${currentSeed}|${tiles.length}|${entries.join(";")}`;
      if (key === pillKey) return;
      pillKey = key;
      for (const p of pills) {
        pillGroup.remove(p.sprite);
        p.sprite.material.dispose();
      }
      pills = [];
      for (const [id, n] of entries) {
        let balloon = -1;
        let tile = -1;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pillTexture(n), depthTest: false, transparent: true, toneMapped: false }));
        sprite.center.set(0.5, 0);
        sprite.renderOrder = 9;
        if (id.startsWith("balloon:")) {
          balloon = Number(id.slice(8));
          if (!balloons[balloon]) continue;
        } else if (id.startsWith("b:")) {
          tile = Number(id.slice(2));
          const t = tileById.get(tile);
          if (!t) continue;
          const c = t.structure ? structureCentre(t.structure) : t;
          sprite.position.set(c.x, t.top + 0.35, c.z);
        } else continue;
        pills.push({ sprite, balloon, id, tile, hide: false, a: 1 });
        pillGroup.add(sprite);
      }
    }
    function updatePills() {
      pillGroup.visible = isRevealed;
      if (!pillGroup.visible) return;
      const recheck = bubbles.picks() !== pillPicks;
      pillPicks = bubbles.picks();
      const bubbled = bubbles.active();
      for (const p of pills) {
        if (p.balloon >= 0) {
          const b = balloons[p.balloon];
          p.sprite.position.copy(b.obj.position);
          p.sprite.position.y += 0.75 * BALLOON_SCALE;
          // No label on the balloon you're riding in.
          p.sprite.visible = !(view?.kind === "ride" && view.k === p.balloon);
        } else p.sprite.visible = !(view?.kind === "place" && view.stage.building === p.id);
        // Keep them readable at any zoom.
        const k = Math.min(2.4, Math.max(0.35, camera.position.distanceTo(p.sprite.position) * 0.045));
        p.sprite.scale.set(k * 0.95, k * 0.386, 1);
        if (p.balloon >= 0) continue;
        if (recheck) {
          const at = p.sprite.position;
          // (The pill drawn on the sprite is about half its width.)
          p.hide = bubbled && (bubbles.showsPlace(p.tile) || bubbles.covers(at.x, at.y, at.z, k * 0.55, k * 0.386));
        }
        p.a += ((p.hide ? 0 : 1) - p.a) * 0.25;
        p.sprite.material.opacity = p.a;
        if (p.a < 0.02) p.sprite.visible = false;
      }
    }
    // Friends in places: their face, with their name under it, over the place
    // they're in (just above its info bubble), side by side when several are in one place.
    // Drawn as small page elements over the canvas (like the bubbles), so they're always on top.
    type Pin = { root: HTMLDivElement; tile: number; balloon: number; building: string; slot: number; of: number; shown: boolean };
    let pins: Pin[] = [];
    const pinLayer = document.createElement("div");
    pinLayer.style.cssText = "position:absolute;inset:0;z-index:2;pointer-events:none;overflow:hidden;contain:strict;";
    el.appendChild(pinLayer);
    let pinKey = "";
    const pinAt = new THREE.Vector3();
    function setFriendPins(list: CityFriendPin[]) {
      const key = `${currentSeed}|${tiles.length}|${list.map((f) => `${f.id}@${f.room}|${f.name}|${JSON.stringify(f.avatar)}`).join(";")}`;
      if (key === pinKey) return;
      pinKey = key;
      for (const p of pins) p.root.remove();
      pins = [];
      const counts = new Map<string, number>();
      const placed: { f: CityFriendPin; building: string; tile: number; balloon: number }[] = [];
      for (const f of list) {
        const building = /^(b:\d+)/.exec(f.room)?.[1] ?? f.room;
        let tile = -1;
        let balloon = -1;
        if (building.startsWith("b:")) {
          tile = Number(building.slice(2));
          if (!tileById.get(tile)) continue;
        } else if (building.startsWith("balloon:")) {
          balloon = Number(building.slice(8));
          if (!balloons[balloon]) continue;
        } else continue;
        counts.set(building, (counts.get(building) ?? 0) + 1);
        placed.push({ f, building, tile, balloon });
      }
      const seen = new Map<string, number>();
      for (const { f, building, tile, balloon } of placed) {
        const slot = seen.get(building) ?? 0;
        seen.set(building, slot + 1);
        const root = document.createElement("div");
        root.style.cssText = "position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:2px;will-change:transform;visibility:hidden;";
        const face = document.createElement("img");
        const svg = renderToStaticMarkup(<AvatarFace avatar={cleanAvatar(f.avatar, f.name)} size={40} />).replace(/^<svg(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
        face.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        face.alt = "";
        face.style.cssText = "width:40px;height:40px;border-radius:999px;border:3px solid #d6336c;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25);";
        const name = document.createElement("div");
        name.textContent = f.name;
        name.style.cssText =
          "max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 8px;border-radius:999px;background:#d6336c;color:#fff;font:700 11px/16px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.2);";
        root.append(face, name);
        pinLayer.appendChild(root);
        pins.push({ root, tile, balloon, building, slot, of: counts.get(building) ?? 1, shown: false });
      }
    }
    function updatePins() {
      const on = isRevealed && pins.length > 0;
      pinLayer.style.display = on ? "" : "none";
      if (!on) return;
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      for (const p of pins) {
        if (p.balloon >= 0) {
          const b = balloons[p.balloon];
          pinAt.copy(b.obj.position);
          pinAt.y += 0.75 * BALLOON_SCALE;
        } else {
          const t = tileById.get(p.tile);
          if (!t) continue;
          const c = t.structure ? structureCentre(t.structure) : t;
          pinAt.set(c.x, t.top + 0.35, c.z);
        }
        const inside = (view?.kind === "place" && view.stage.building === p.building) || (view?.kind === "ride" && p.balloon === view.k);
        pinAt.project(camera);
        const show = !inside && pinAt.z < 1 && Math.abs(pinAt.x) < 1.1 && Math.abs(pinAt.y) < 1.1;
        if (show !== p.shown) {
          p.shown = show;
          p.root.style.visibility = show ? "visible" : "hidden";
        }
        if (!show) continue;
        // Above the place's info bubble, side by side when several friends are in one place.
        const x = ((pinAt.x + 1) / 2) * w + (p.slot - (p.of - 1) / 2) * 48;
        const y = ((1 - pinAt.y) / 2) * h - 52;
        p.root.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    }
    // ---- ghost lights: every ghost glows on the map (blue: free to challenge, orange: in a
    // duel right now, gold: golden and safe). A beam of light over their spot and a ring on the
    // ground, with their face over it (a page element, so it's easy to tap).
    type GhostLight = { id: string; tile: number; status: CityGhost["status"]; beam: THREE.Mesh; ring: THREE.Mesh; root: HTMLButtonElement; shown: boolean };
    const GHOST_GLOW: Record<CityGhost["status"], { hex: number; css: string; label: string }> = {
      free: { hex: 0x4dabf7, css: "#1c7ed6", label: "Free" },
      playing: { hex: 0xff922b, css: "#e8590c", label: "In a duel" },
      golden: { hex: 0xffd43b, css: "#e8a800", label: "Golden" },
    };
    let ghostLights: GhostLight[] = [];
    let ghostKey = "";
    const ghostGroup = new THREE.Group();
    scene.add(ghostGroup);
    const ghostLayer = document.createElement("div");
    ghostLayer.style.cssText = "position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;contain:strict;";
    el.appendChild(ghostLayer);
    const ghostAt = new THREE.Vector3();
    function clearGhosts() {
      for (const g of ghostLights) {
        g.root.remove();
        ghostGroup.remove(g.beam, g.ring);
        (g.beam.material as THREE.Material).dispose();
        (g.ring.material as THREE.Material).dispose();
      }
      ghostLights = [];
    }
    function setGhosts(list: CityGhost[]) {
      // Phones get smaller faces and just the name (the colour already says free, in a duel or golden).
      const small = (el.clientWidth || 1) < 640;
      const key = `${currentSeed}|${small ? "s" : "l"}|${list.map((g) => `${g.id}@${g.tile}|${g.status}|${g.name}|${g.mine ? 1 : 0}|${JSON.stringify(g.avatar)}`).join(";")}`;
      if (key === ghostKey) return;
      ghostKey = key;
      clearGhosts();
      for (const g of list) {
        if (!Number.isInteger(g.tile) || g.tile < 0) continue;
        const glow = GHOST_GLOW[g.status];
        const beam = new THREE.Mesh(
          markerGeo.beam,
          new THREE.MeshBasicMaterial({ color: glow.hex, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
        );
        beam.renderOrder = 4;
        const ring = new THREE.Mesh(markerGeo.ring, new THREE.MeshBasicMaterial({ color: glow.hex, transparent: true, opacity: 0.9 }));
        ring.scale.setScalar(1.6);
        ghostGroup.add(beam, ring);
        const root = document.createElement("button");
        root.type = "button";
        root.setAttribute("aria-label", `${g.mine ? "You" : g.name}: ghost, ${glow.label.toLowerCase()}`);
        root.style.cssText =
          "position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:2px;will-change:transform;visibility:hidden;pointer-events:auto;background:none;border:0;padding:0;cursor:pointer;";
        const face = document.createElement("img");
        const size = small ? 32 : 44;
        const svg = renderToStaticMarkup(<AvatarFace avatar={cleanAvatar(g.avatar, g.name)} size={size} />).replace(/^<svg(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
        face.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        face.alt = "";
        face.style.cssText = small
          ? `width:${size}px;height:${size}px;border-radius:999px;border:2px solid ${glow.css};background:#fff;box-shadow:0 0 0 3px ${glow.css}55,0 0 12px 4px ${glow.css}aa;`
          : `width:${size}px;height:${size}px;border-radius:999px;border:3px solid ${glow.css};background:#fff;box-shadow:0 0 0 4px ${glow.css}55,0 0 18px 6px ${glow.css}aa;`;
        const name = document.createElement("div");
        name.textContent = small ? (g.mine ? "You" : g.name) : `${g.mine ? "You" : g.name} · ${glow.label}`;
        name.style.cssText = small
          ? `max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px;border-radius:999px;background:${glow.css};color:#fff;font:700 10px/14px system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.2);`
          : `max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 8px;border-radius:999px;background:${glow.css};color:#fff;font:700 11px/16px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.2);`;
        root.append(face, name);
        root.addEventListener("click", (e) => {
          e.stopPropagation();
          cb.current.onGhost?.(g.id);
        });
        root.addEventListener("pointerdown", (e) => e.stopPropagation());
        ghostLayer.appendChild(root);
        ghostLights.push({ id: g.id, tile: g.tile, status: g.status, beam, ring, root, shown: false });
      }
    }
    function updateGhosts(time: number) {
      const on = isRevealed && ghostLights.length > 0 && !immersive();
      ghostLayer.style.display = on ? "" : "none";
      ghostGroup.visible = isRevealed && ghostLights.length > 0;
      if (!ghostGroup.visible) return;
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      for (const g of ghostLights) {
        const p = posOf(g.tile);
        const top = topOf(g.tile);
        // In a duel: a quick orange throb. Free and golden: a slow breathing glow.
        const k = g.status === "playing" ? 0.5 + 0.5 * Math.abs(Math.sin(time * 6)) : 0.75 + 0.25 * Math.sin(time * 1.8);
        g.beam.scale.set(1.4 + 0.3 * k, top + 10, 1.4 + 0.3 * k);
        g.beam.position.set(p.x, 0, p.z);
        (g.beam.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.25 * k;
        g.ring.position.set(p.x, top + 0.15, p.z);
        g.ring.scale.setScalar(1.4 + 0.4 * k);
        if (!on) continue;
        ghostAt.set(p.x, top + 0.6, p.z);
        ghostAt.project(camera);
        const show = ghostAt.z < 1 && Math.abs(ghostAt.x) < 1.1 && Math.abs(ghostAt.y) < 1.1;
        if (show !== g.shown) {
          g.shown = show;
          g.root.style.visibility = show ? "visible" : "hidden";
        }
        if (!show) continue;
        const x = ((ghostAt.x + 1) / 2) * w;
        const y = ((1 - ghostAt.y) / 2) * h - 8;
        g.root.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      }
    }
    const flyToTile = (tile: number) => {
      if (immersive()) return;
      const p = posOf(tile);
      focus = null;
      eventFly = new THREE.Vector3(p.x, 0, p.z);
      // Outline the building there, so it's easy to spot.
      showHover(tile);
    };

    /** Open a building's place as if it had been tapped (onRoom), e.g. to go to a friend. */
    function openRoomById(id: string) {
      const m = /^b:(\d+)/.exec(id);
      const r = m ? roomFor(Number(m[1])) : null;
      if (r) cb.current.onRoom?.(r.room);
    }
    function setRoomCounts(counts: Record<string, number>) {
      roomCountsNow = counts ?? {};
      countByTile.clear();
      for (const [id, n] of Object.entries(roomCountsNow)) if (id.startsWith("b:") && typeof n === "number" && n > 0) countByTile.set(Number(id.slice(2)), n);
      rebuildPills();
    }

    // ---- info bubbles: over the places near the middle of the view (name, what it is, who's
    // inside; tap to go in) and over the world events' pins (tap for info).
    const countByTile = new Map<number, number>();
    let spotTiles: Tile[] | null = null;
    let spotList: BubbleSpot[] = [];
    const bubbleLabels = new Map<number, { name: string; tile: Tile } | null>();
    // How tall each tile is, on a grid (to tell when a taller building hides a roof from view).
    const tops = { x0: 0, z0: 0, w: 0, h: 0, max: 0, v: new Float32Array(0), at: new Int32Array(0) };
    function bubbleSpots() {
      if (spotTiles !== tiles) {
        spotTiles = tiles;
        bubbleLabels.clear();
        spotList = [];
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const t of tiles) {
          x0 = Math.min(x0, t.x);
          x1 = Math.max(x1, t.x);
          z0 = Math.min(z0, t.z);
          z1 = Math.max(z1, t.z);
        }
        tops.x0 = x0;
        tops.z0 = z0;
        tops.w = tiles.length ? x1 - x0 + 1 : 0;
        tops.h = tiles.length ? z1 - z0 + 1 : 0;
        tops.v = new Float32Array(tops.w * tops.h);
        tops.at = new Int32Array(tops.w * tops.h).fill(-1);
        tops.max = 0;
        for (const t of tiles) {
          const k = t.x - x0 + (t.z - z0) * tops.w;
          tops.v[k] = t.top;
          tops.max = Math.max(tops.max, t.top);
          // Which place each tile belongs to (so a building never hides itself).
          const a = anchorOf(t.i);
          tops.at[k] = a ? a.anchor.i : -1;
        }
        const seen = new Set<number>();
        for (const t of tiles) {
          const a = anchorOf(t.i);
          if (!a || seen.has(a.anchor.i)) continue;
          seen.add(a.anchor.i);
          const at = a.anchor;
          const c = at.structure ? structureCentre(at.structure) : at;
          spotList.push({ i: at.i, x: c.x, y: at.top + 0.12, z: c.z });
        }
      }
      return spotList;
    }
    // What the bubbles gather round: the map's middle, or (from a balloon) what you're looking at.
    const bubbleTarget = new THREE.Vector3();
    const lookDir = new THREE.Vector3();
    let bubbleZoom: number | null = null;
    const bubbles = createBubbles({
      el,
      canvas: renderer.domElement,
      camera,
      target: bubbleTarget,
      zoom: () => bubbleZoom,
      events: worldEventsLayer,
      spots: bubbleSpots,
      label: (i) => {
        if (spotTiles !== tiles) bubbleSpots();
        let l = bubbleLabels.get(i);
        if (l === undefined) {
          const r = roomFor(i);
          l = r ? { name: r.room.name, tile: r.anchor } : null;
          bubbleLabels.set(i, l);
        }
        return l;
      },
      count: (i) => countByTile.get(i) ?? 0,
      note: (i) => {
        // A match on at a stadium or arena: say so (the lead's live label, e.g. "Lions 2-1 Eagles").
        const st = tileById.get(i)?.structure;
        const sport = st ? VENUE_SPORT[st.type] : undefined;
        const live = sport ? cb.current.liveVenues?.[sport] : null;
        if (live === null || live === undefined) return null;
        return live.trim() || (sport === "boxing" || sport === "wrestling" ? "Fight on now" : "Match on now");
      },
      hidden: (sp) => {
        // Walk back from the roof towards the camera, tile by tile, until the line of sight is
        // above everything: is a taller building in the way?
        const c = camera.position;
        const dx = c.x - sp.x;
        const dy = c.y - sp.y;
        const dz = c.z - sp.z;
        if (dy <= 0.05 || !tops.w) return false;
        const tMax = Math.min(1, (tops.max - sp.y) / dy);
        if (tMax <= 0) return false;
        const steps = Math.ceil((Math.hypot(dx, dz) * tMax) / 0.25);
        for (let k = 1; k <= steps; k++) {
          const t = (k / steps) * tMax;
          const x = sp.x + dx * t;
          const z = sp.z + dz * t;
          const tx = Math.round(x);
          const tz = Math.round(z);
          const gx = tx - tops.x0;
          const gz = tz - tops.z0;
          if (gx < 0 || gz < 0 || gx >= tops.w || gz >= tops.h) continue;
          const g = gx + gz * tops.w;
          if (tops.at[g] === sp.i) continue;
          // Buildings stand a little inside their lot.
          if (Math.abs(x - tx) > 0.4 || Math.abs(z - tz) > 0.4) continue;
          if (sp.y + dy * t < tops.v[g] * 0.92) return true;
        }
        return false;
      },
      onBuilding: (i) => {
        if (!isRevealed || (immersive() && !aloft())) return;
        const r = roomFor(i);
        if (!r) return;
        showHover(i);
        cb.current.onRoom?.(r.room);
      },
      onEvent: (id) => {
        if (!isRevealed || immersive()) return;
        cb.current.onEventInfo?.(id);
      },
    });

    // ---- looking round from one spot: riding a balloon, or inside a building / on its roof.
    // The camera flies there (eased, about 1.5 s) and then stays put: drag with one finger (or
    // the mouse) to turn the view, pinch or scroll to zoom a little. No panning, no flying off.
    // The normal map controls come back when you leave. Inside buildings the room is drawn on
    // top of the real city (which shows through the windows, at the right height); rooftops and
    // open-air spots stand in the city itself. Taps there only ever reach the people (NPCs).
    type StageView = { p: THREE.Vector3; yaw: number; pitch: number; lx: number; lz: number };
    type Stage = {
      building: string;
      tile: number;
      level: PlaceLevel;
      /** Interiors: the room's own scene (drawn over the city), and how city space maps onto it. */
      scene: THREE.Scene | null;
      origin: THREE.Vector3;
      unit: number;
      holder: THREE.Group;
      interior: Interior | null;
      deck: Deck | null;
      figures: Figures | null;
      views: StageView[];
      alpha: number;
      npcs: Npc[];
      hidden: boolean;
      /** The room id ("b:12:f4"), every seat (fixed order), things to use, and their markers. */
      place: string;
      seats: Spot[];
      npcSeats: Set<Spot>;
      interact: Interactables | null;
      hover: string | null;
      walker: ReturnType<typeof createWalker> | null;
      /** Where you are in the room (metres), your eye height, and the walk you're on. */
      local: { x: number; z: number };
      eye: number;
      eyeTo: number;
      walk: { pts: { x: number; z: number }[]; i: number } | null;
      /** Players sitting in seats here (and which seats they're in). */
      players: Figures | null;
      playersKey: string;
      /** Moving parts of the room (club lights...). */
      update: ((time: number) => void) | null;
      /** A club's dance floor: where it is, the spots kept free for players, the crowd dancing on it, and the players dancing (you too). */
      floor: { x: number; z: number; w: number; d: number } | null;
      slots: { x: number; z: number }[];
      crowd: Figures | null;
      dancers: Figures | null;
      dancersKey: string;
      /** Where you're dancing (room metres), or null. */
      meAt: { x: number; z: number; ry: number } | null;
      /** Regulars dancing with a player: which way they faced before. */
      partnered: Map<string, number>;
      /** You just started dancing: turn the camera to face you. And the glowing ring under you. */
      danceCam: boolean;
      meRing: THREE.Mesh | null;
      /** Where the dance camera is (room metres). */
      camAt: { x: number; z: number } | null;
      /** Standing spots the regulars aren't using (for other players standing about). */
      free: Spot[];
    };
    /** On a ride (not a balloon): the cabin drawn round you, the people in it, where it is. */
    type VehicleView = {
      kind: "vehicle";
      ride: RideTarget;
      scene: THREE.Scene;
      cabin: Cabin | null;
      figures: Figures | null;
      npcs: Npc[];
      /** Where the vehicle is now (its floor, or a slide's start), and its smoothed heading. */
      pose: VehiclePose;
      yaw: number;
      origin: THREE.Vector3;
      alpha: number;
      /** Ferris wheels: which cabin, and whether you face the far side. */
      cabinK: number;
      flip: boolean;
      slide: { ride: SlideRide; data: Slide; length: number; phase: "top" | "slide" | "splash"; t: number; d: number; v: number; roll: number; pitch: number; ended: boolean } | null;
    };
    type ViewMode = { kind: "ride"; k: number } | { kind: "place"; stage: Stage } | VehicleView;
    const look = createLookControls(renderer.domElement);
    const overlayCam = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
    const basketScene = new THREE.Scene();
    const basket = createBasket();
    basketScene.add(basket.group);
    let basketAlpha = 0;
    let wantRide: RideTarget | null = null;
    let leavingVehicle: VehicleView | null = null;
    let wantPlace: CityPlace | null = null;
    let wantSpot = 0;
    let spotIndex = 0;
    let view: ViewMode | null = null;
    /** The place (or balloon) we're flying away from: it fades out, then goes. */
    let leaving: Stage | null = null;
    let leavingRide = false;
    const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 38 };
    type Flight = { from: THREE.Vector3; quat: THREE.Quaternion; fov: number; ctrl: THREE.Vector3 | null; t: number; dur: number; kind: "enter" | "exit" | "move" };
    let flight: Flight | null = null;
    const aim = { yaw: 0, pitch: -0.38 };
    const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60 };
    const eul = new THREE.Euler(0, 0, 0, "YXZ");
    const rideEye = new THREE.Vector3();
    const tmpV2 = new THREE.Vector3();
    const leanDir = new THREE.Vector3();
    const tmpV = new THREE.Vector3();
    /** How far the eye is below a balloon's middle (in the basket). */
    const BASKET_EYE = 0.77;
    const immersive = () => view !== null || flight !== null;
    // Up in a hot-air balloon (not flying there or back): the town's bubbles still show, and
    // tapping a building (or its bubble) takes you there.
    const aloft = () => view?.kind === "ride" && flight === null;
    const smoothstep = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const turnTo = (a: number, b: number) => {
      let d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    const cameraYaw = () => eul.setFromQuaternion(camera.quaternion, "YXZ").y;
    /** Vertical field of view for a wanted sideways view (wide enough on portrait phones too). */
    const fovFor = (hfovDeg: number) => {
      const v = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfovDeg) / 2) / Math.max(0.3, camera.aspect)) * 180) / Math.PI;
      return Math.min(88, Math.max(48, v));
    };

    /** Hide (or bring back) the building's own bits on its roof while we're up there. */
    function hideRoof(st: Stage, on: boolean) {
      const h = st.level.hide;
      if (!h || st.hidden === on) return;
      st.hidden = on;
      const touched = new Set<string>();
      for (const [name, idx] of tileParts.get(st.tile) ?? []) {
        const p = parts[name]?.[idx];
        const mesh = meshes[name];
        if (!p || !mesh || p.y < h.above) continue;
        if (h.rect && (p.x < h.rect[0] || p.x > h.rect[2] || p.z < h.rect[1] || p.z > h.rect[3])) continue;
        if (h.maxH !== undefined && p.sy > h.maxH) continue;
        writePart(mesh, idx, p, on ? 0 : 1);
        touched.add(name);
      }
      for (const name of touched) meshes[name].instanceMatrix.needsUpdate = true;
    }

    function buildStage(building: string, anchor: Tile, lvl: PlaceLevel): Stage {
      const plan = currentPlan!;
      const key = `${currentSeed}|${building}|${lvl.id}`;
      const npcs = npcsFor(`${building}:${lvl.id}`, currentSeed, lvl.capacity, lvl.theme);
      const st: Stage = {
        building,
        tile: anchor.i,
        level: lvl,
        scene: null,
        origin: new THREE.Vector3(lvl.x, lvl.y + EYE, lvl.z),
        unit: 1 / METRES,
        holder: new THREE.Group(),
        interior: null,
        deck: null,
        figures: null,
        views: [],
        alpha: 0,
        npcs,
        hidden: false,
        place: `${building}:${lvl.id}`,
        seats: [],
        npcSeats: new Set(),
        interact: null,
        hover: null,
        walker: null,
        local: { x: 0, z: 0 },
        eye: 1.6,
        eyeTo: 1.6,
        walk: null,
        players: null,
        playersKey: "",
        update: null,
        floor: null,
        slots: [],
        crowd: null,
        dancers: null,
        dancersKey: "",
        meAt: null,
        partnered: new Map(),
        danceCam: false,
        meRing: null,
        camAt: null,
        free: [],
      };
      if (lvl.kind === "interior") {
        const interior = createInterior({
          theme: lvl.theme,
          key,
          floor: lvl.floor,
          name: signName(anchor),
          city: plan.city.name,
          places: plan.city.flavor.cities.filter((c) => c !== plan.city.name),
          variant: anchor.kind === "clock" && lvl.id === "g" ? "small" : anchor.station ? "station" : undefined,
          flavor: plan.city.flavor.id,
        });
        const figures = createFigures(npcs, interior.spots, { key, act: lvl.theme === "club" ? "dance" : undefined });
        st.holder.add(interior.group, figures.group);
        // Turn the room so its first view looks the way the camera looks now (no spinning round).
        const rot = cameraYaw() - interior.views[0].yaw;
        st.holder.rotation.y = rot;
        st.scene = new THREE.Scene();
        st.scene.add(st.holder);
        // City units per metre inside: the room fits inside the building's footprint.
        const half = Math.max(interior.w, interior.d) / 2;
        st.unit = (Math.min(lvl.hw, lvl.hd) * 0.85) / half;
        st.views = interior.views.map((v) => {
          const e = tmpV.set(v.x, 0, v.z).applyAxisAngle(up, rot);
          return { p: new THREE.Vector3(st.origin.x + e.x * st.unit, st.origin.y, st.origin.z + e.z * st.unit), yaw: v.yaw + rot, pitch: v.pitch, lx: v.x, lz: v.z };
        });
        st.interior = interior;
        st.figures = figures;
        interior.setNight(carNight);
        st.update = interior.update;
        setupUse(st, interior.seats, interior.items, interior.spots, npcs.length);
        st.walker = createWalker(interior.w, interior.d, interior.blocks);
        if (interior.danceFloor) setupFloor(st, interior.danceFloor, interior.spots.slice(0, npcs.length), key);
      } else {
        const deck = lvl.kind === "roof" ? createDeck(lvl.theme, key, lvl.hw * 2 * METRES, lvl.hd * 2 * METRES) : createOpenAir(lvl.theme, key);
        const figures = createFigures(npcs, deck.spots, { key, tags: true });
        figures.group.traverse((o) => {
          if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial) o.castShadow = true;
        });
        st.holder.add(deck.group, figures.group);
        st.holder.position.set(lvl.x, lvl.y + 0.001, lvl.z);
        st.holder.rotation.y = lvl.ry;
        st.holder.scale.setScalar(1 / METRES);
        scene.add(st.holder);
        const deckTop = lvl.kind === "roof" ? 0.005 : 0;
        const views = deck.views.map((v) => {
          const e = tmpV.set(v.x, 0, v.z).applyAxisAngle(up, lvl.ry).multiplyScalar(1 / METRES);
          return { p: new THREE.Vector3(lvl.x + e.x, lvl.y + deckTop + EYE, lvl.z + e.z), yaw: v.yaw + lvl.ry, pitch: v.pitch, lx: v.x, lz: v.z };
        });
        // Start with whichever view looks most like the way we're facing now.
        const now = cameraYaw();
        let best = 0;
        views.forEach((v, i) => {
          if (Math.abs(turnTo(now, v.yaw)) < Math.abs(turnTo(now, views[best].yaw))) best = i;
        });
        st.views = [...views.slice(best), ...views.slice(0, best)];
        st.deck = deck;
        st.figures = figures;
        deck.setNight(carNight);
        hideRoof(st, true);
        setupUse(st, deck.seats, deck.items, deck.spots, npcs.length);
        st.walker = createWalker(deck.w, deck.d, deck.blocks, 0.3);
      }
      return st;
    }

    function disposeStage(st: Stage) {
      hideRoof(st, false);
      st.holder.removeFromParent();
      st.interior?.dispose();
      st.deck?.dispose();
      st.figures?.dispose();
      st.interact?.dispose();
      st.players?.dispose();
      st.crowd?.dispose();
      st.dancers?.dispose();
      if (st.meRing) {
        st.meRing.geometry.dispose();
        (st.meRing.material as THREE.Material).dispose();
      }
    }

    // ---- things to use inside places, sitting down, and walking round
    let seatsNow: Record<string, SeatTaker> = {};
    let mySeatNow: string | null = null;
    /** The things to use in a place (seats the regulars aren't in, the bar, darts...). */
    function setupUse(st: Stage, seats: Spot[], raw: RoomItem[], npcSpots: Spot[], npcCount: number) {
      st.seats = seats;
      st.npcSeats = new Set(npcSpots.slice(0, npcCount));
      st.free = npcSpots.slice(npcCount).filter((sp) => sp.pose !== "sit");
      const counts: Record<string, number> = {};
      const things: Item[] = raw.map((it) => {
        const n = (counts[it.kind] = (counts[it.kind] ?? -1) + 1);
        return { id: `${st.place}:${it.kind}:${n}`, kind: it.kind, label: it.label, x: it.x, y: it.y, z: it.z, r: it.r };
      });
      st.interact = createInteractables([...seatItems(st), ...things]);
      st.holder.add(st.interact.group);
      syncPlayers(st);
    }
    function seatItems(st: Stage): Item[] {
      const out: Item[] = [];
      st.seats.forEach((sp, n) => {
        const id = `${st.place}:seat:${n}`;
        if (st.npcSeats.has(sp) || id === mySeatNow) return;
        out.push({ id, kind: "seat", label: "Sit here", x: sp.x, y: (sp.y ?? 0.46) - 0.02, z: sp.z, r: 0.45, taken: seatsNow[id]?.name ?? null });
      });
      return out;
    }
    /** Players sitting here: draw them in their seats; keep the seat markers up to date. */
    function syncPlayers(st: Stage) {
      const mine = st.seats.map((_, n) => `${st.place}:seat:${n}`);
      // Everyone else here who isn't sitting down or dancing stands about in a free spot.
      const busy = new Set<string>([...Object.values(seatsNow).flatMap((w) => (w.id ? [w.id] : [])), ...dancersNow.map((d) => d.id)]);
      const standing = roomPeopleNow
        .filter((p) => !busy.has(p.id))
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, st.free.length);
      const key =
        mine.filter((id) => seatsNow[id] && id !== mySeatNow).map((id) => `${id}=${seatsNow[id].name}`).join("|") +
        `|me:${mySeatNow}|` +
        standing.map((p) => `${p.id}=${p.name}=${JSON.stringify(p.avatar)}`).join(",");
      if (key === st.playersKey) return;
      st.playersKey = key;
      st.players?.dispose();
      st.players = null;
      const people: Person[] = [];
      const spots: Spot[] = [];
      st.seats.forEach((sp, n) => {
        const id = `${st.place}:seat:${n}`;
        const who = seatsNow[id];
        if (!who || id === mySeatNow || st.npcSeats.has(sp)) return;
        people.push({ id: `seat:${id}`, name: who.name, avatar: cleanAvatar(who.avatar, who.name), npc: false, seat: id });
        spots.push({ ...sp, act: "idle" });
      });
      standing.forEach((p, i) => {
        people.push({ id: `here:${p.id}`, name: p.name, avatar: cleanAvatar(p.avatar, p.name), npc: false, seat: `here:${p.id}` });
        spots.push({ ...st.free[i], act: st.free[i].act ?? "talk" });
      });
      if (people.length) {
        st.players = createFigures(people, spots, { key: st.place });
        st.holder.add(st.players.group);
      }
      if (st.interact) {
        const things = st.interact.items.filter((it) => it.kind !== "seat");
        st.interact.setItems([...seatItems(st), ...things]);
      }
      // Sitting down in my seat (or standing up again).
      const n = mySeatNow?.startsWith(`${st.place}:seat:`) ? Number(mySeatNow.slice(st.place.length + 6)) : -1;
      const sp = n >= 0 ? st.seats[n] : undefined;
      if (sp) {
        walkTo(st, sp.x, sp.z, true);
        st.eyeTo = (sp.y ?? 0.46) + 0.72;
        // Face the way the seat faces.
        const fx = Math.sin(sp.ry);
        const fz = Math.cos(sp.ry);
        aim.yaw = Math.atan2(-fx, -fz) + stageTurn(st);
        aim.pitch = -0.12;
        look.lookAt(0, 0);
      } else st.eyeTo = 1.6;
    }
    const stageTurn = (st: Stage) => (st.interior ? st.holder.rotation.y : st.level.ry);

    // ---- the dance floor (clubs): a crowd dancing, the players dancing, and you
    let danceNow: CityDance | null = null;
    let dancersNow: CityDancer[] = [];
    /** Lay out a club's dance floor: spots kept free for players near the middle, a crowd round them. */
    function setupFloor(st: Stage, floor: { x: number; z: number; w: number; d: number }, npcSpots: Spot[], key: string) {
      st.floor = floor;
      const rnd = rngFrom(`${key}|floor`);
      const taken = npcSpots.filter((sp) => sp.act === "dance");
      const grid: { x: number; z: number }[] = [];
      for (let gx = -floor.w / 2 + 0.55; gx <= floor.w / 2 - 0.55; gx += 0.72) {
        for (let gz = -floor.d / 2 + 0.55; gz <= floor.d / 2 - 0.55; gz += 0.72) grid.push({ x: floor.x + gx + (rnd() - 0.5) * 0.18, z: floor.z + gz + (rnd() - 0.5) * 0.18 });
      }
      const free = grid.filter((p) => taken.every((sp) => Math.hypot(sp.x - p.x, sp.z - p.z) > 0.65));
      free.sort((a, b) => Math.hypot(a.x - floor.x, a.z - floor.z) - Math.hypot(b.x - floor.x, b.z - floor.z));
      // The middle is kept for players; a crowd dances round it (facing the DJ, more or less).
      st.slots = free.slice(0, 10);
      const around = free.slice(10).filter(() => rnd() < 0.6).slice(0, 12);
      const people: Person[] = around.map((_, i) => ({ id: `crowd:${i}`, name: "", avatar: defaultAvatar(`${key}|crowd|${i}`), npc: false }));
      const spots: Spot[] = around.map((p) => ({ x: p.x, z: p.z, ry: (rnd() - 0.5) * 1.4, pose: "stand", act: "dance" }));
      if (people.length) {
        st.crowd = createFigures(people, spots, { key, inert: true, tags: false });
        st.holder.add(st.crowd.group);
      }
      syncDancers(st);
    }
    /** Draw the players dancing here (you too), each in their place with their move; partners face each other. */
    function syncDancers(st: Stage) {
      const fl = st.floor;
      if (!fl) return;
      const list: CityDancer[] = dancersNow.filter((d) => d.id !== danceNow?.id);
      if (danceNow) list.push({ id: danceNow.id, name: "You", avatar: atmos.current.meAvatar, move: danceNow.move, with: danceNow.with });
      // Everyone works out the same places (in id order), so all phones agree.
      list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const at = new Map<string, { x: number; z: number; ry: number }>();
      const crowded = new Map<string, number>();
      let next = 0;
      const nextSlot = () => st.slots[next++ % Math.max(1, st.slots.length)] ?? { x: fl.x, z: fl.z };
      const face = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
      /** A spot next to someone (towards the middle of the floor; the next one round them, and so on). */
      const beside = (p: { x: number; z: number }, who: string) => {
        const n = crowded.get(who) ?? 0;
        crowded.set(who, n + 1);
        let a = Math.hypot(fl.x - p.x, fl.z - p.z) < 0.3 ? Math.PI / 2 : Math.atan2(fl.x - p.x, fl.z - p.z);
        a += n * 2.1;
        return { x: p.x + Math.sin(a) * 0.78, z: p.z + Math.cos(a) * 0.78 };
      };
      const npcFacing = new Map<string, number>();
      const npcMoves = new Map<string, DanceMove>();
      const later: CityDancer[] = [];
      for (const d of list) {
        const partner = d.with ? list.find((p) => p.id === d.with && p.id !== d.id) : undefined;
        if (partner) {
          const pp = at.get(partner.id);
          if (!pp) {
            later.push(d);
            continue;
          }
          const p = beside(pp, partner.id);
          at.set(d.id, { ...p, ry: face(p, pp) });
          if (!partner.with || partner.with === d.id) pp.ry = face(pp, p);
          continue;
        }
        const npc = d.with?.startsWith("npc:") ? st.figures?.where(d.with) : null;
        if (npc && d.with) {
          const p = beside(npc, d.with);
          at.set(d.id, { ...p, ry: face(p, npc) });
          if (!npcFacing.has(d.with)) npcFacing.set(d.with, face(npc, p));
          npcMoves.set(d.with, d.move);
          continue;
        }
        const p = nextSlot();
        at.set(d.id, { ...p, ry: 0 });
      }
      for (const d of later) {
        const pp = d.with ? at.get(d.with) : undefined;
        if (pp) {
          const p = beside(pp, d.with!);
          at.set(d.id, { ...p, ry: face(p, pp) });
          pp.ry = face(pp, p);
        } else at.set(d.id, { ...nextSlot(), ry: 0 });
      }
      // (Re)build the dancers when who's dancing changes; moves and places change in place.
      const key = list.map((d) => `${d.id}|${d.name}|${JSON.stringify(d.avatar)}`).join(";");
      if (key !== st.dancersKey) {
        st.dancersKey = key;
        st.dancers?.dispose();
        st.dancers = null;
        if (list.length) {
          const people: Person[] = list.map((d) => ({ id: d.id, name: d.name, avatar: d.avatar, npc: false, seat: `dancer:${d.id}` }));
          const spots: Spot[] = list.map((d) => ({ ...(at.get(d.id) ?? { x: fl.x, z: fl.z, ry: 0 }), pose: "stand", act: "dance", move: d.move }));
          st.dancers = createFigures(people, spots, { key: st.place });
          st.holder.add(st.dancers.group);
        }
      }
      for (const d of list) {
        const p = at.get(d.id);
        if (p) st.dancers?.place(d.id, p.x, p.z, p.ry);
        st.dancers?.setMove(d.id, d.move);
      }
      // Regulars dancing with a player turn to them and copy their move; the rest go back to their own.
      for (const [id, ry0] of st.partnered) {
        if (npcMoves.has(id)) continue;
        const w = st.figures?.where(id);
        if (w) st.figures?.place(id, w.x, w.z, ry0);
        st.figures?.setMove(id, null);
        st.partnered.delete(id);
      }
      for (const [id, move] of npcMoves) {
        const w = st.figures?.where(id);
        if (!w) continue;
        if (!st.partnered.has(id)) st.partnered.set(id, w.ry);
        st.figures?.place(id, w.x, w.z, npcFacing.get(id) ?? w.ry);
        st.figures?.setMove(id, move);
      }
      // You: the camera comes out to circle round you while you dance, and back in when you stop.
      const mine = danceNow ? (at.get(danceNow.id) ?? null) : null;
      const was = st.meAt;
      st.meAt = mine ? { ...mine } : null;
      if (mine && !st.meRing) {
        // A glowing ring on the floor under you, pulsing with the beat, so you can always spot yourself.
        st.meRing = new THREE.Mesh(
          new THREE.RingGeometry(0.34, 0.44, 40).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x63e6be, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        st.meRing.renderOrder = 3;
        st.holder.add(st.meRing);
      }
      if (mine && !was) st.danceCam = true;
      if (view?.kind !== "place" || view.stage !== st) return;
      if (mine && !was) startFlight("move", 0.9, null);
      else if (!mine && was) {
        st.local.x = was.x;
        st.local.z = was.z;
        st.walk = null;
        aim.yaw = stageTurn(st) + was.ry + Math.PI;
        aim.pitch = -0.1;
        look.setLimits({ pitchMin: -1.0 - aim.pitch, pitchMax: 0.75 - aim.pitch, zoomMin: 0.55, zoomMax: 1.15 });
        look.lookAt(0, 0);
        startFlight("move", 0.8, null);
      }
    }
    function setDance(me: CityDance | null, others: CityDancer[]) {
      danceNow = me;
      dancersNow = others;
      if (view?.kind === "place") {
        syncDancers(view.stage);
        syncPlayers(view.stage);
      }
    }
    let roomPeopleNow: CityPerson[] = [];
    function setRoomPeople(list: CityPerson[]) {
      roomPeopleNow = list;
      if (view?.kind === "place") syncPlayers(view.stage);
    }
    /** Walk to (x, z) in the room (round the furniture; `exact`: right to that spot, e.g. a seat). */
    function walkTo(st: Stage, x: number, z: number, exact = false) {
      const pts = st.walker?.path(st.local.x, st.local.z, x, z) ?? null;
      if (!pts && !exact) return false;
      const list = pts ?? [];
      if (exact) list.push({ x, z });
      st.walk = list.length ? { pts: list, i: 0 } : null;
      return true;
    }
    function stepWalk(st: Stage, dt: number) {
      st.eye += (st.eyeTo - st.eye) * (1 - Math.exp(-dt * 3.5));
      const w = st.walk;
      if (!w) return;
      let step = dt * 1.5;
      while (step > 0 && w.i < w.pts.length) {
        const t = w.pts[w.i];
        const dx = t.x - st.local.x;
        const dz = t.z - st.local.z;
        const d = Math.hypot(dx, dz);
        if (d <= step) {
          st.local.x = t.x;
          st.local.z = t.z;
          step -= d;
          w.i++;
        } else {
          st.local.x += (dx / d) * step;
          st.local.z += (dz / d) * step;
          step = 0;
        }
      }
      if (w.i >= w.pts.length) st.walk = null;
    }
    /** Room metres → city (the camera), at eye height `eye` metres. */
    function stageToCity(st: Stage, x: number, z: number, eye: number, out: THREE.Vector3) {
      if (st.interior) {
        const e = tmpV.set(x, 0, z).applyAxisAngle(up, st.holder.rotation.y);
        return out.set(st.origin.x + e.x * st.unit, st.origin.y - (1.6 - eye) * st.unit, st.origin.z + e.z * st.unit);
      }
      const e = tmpV.set(x, 0, z).applyAxisAngle(up, st.level.ry).multiplyScalar(1 / METRES);
      return out.set(st.level.x + e.x, st.level.y + (st.level.kind === "roof" ? 0.005 : 0) + eye / METRES, st.level.z + e.z);
    }
    const camLocal = new THREE.Vector3();
    /** What's under the pointer in a place: a seated player's seat, or a thing to use. */
    function itemUnder(clientX: number, clientY: number): Item | null {
      if (view?.kind !== "place" || flight) return null;
      const st = view.stage;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, st.scene ? overlayCam : camera);
      if (st.players) {
        const hit = ray.intersectObjects(st.players.hits, true)[0];
        const id = hit ? st.players.seatOf(hit.object) : null;
        // (Someone standing about isn't a seat: the tap goes to the floor.)
        if (id && !id.startsWith("here:")) return { id, kind: "seat", label: `${seatsNow[id]?.name ?? "Someone"}'s seat`, x: 0, y: 0, z: 0, r: 0, taken: seatsNow[id]?.name ?? null };
      }
      return st.interact?.pick(ray.ray) ?? null;
    }
    const floorHit = new THREE.Vector3();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    /** Tap on the floor of a place: walk there. */
    function walkTap(clientX: number, clientY: number) {
      if (view?.kind !== "place" || flight) return false;
      const st = view.stage;
      if (mySeatNow?.startsWith(`${st.place}:seat:`) || st.meAt) return false;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, st.scene ? overlayCam : camera);
      st.holder.updateWorldMatrix(true, false);
      floorPlane.constant = -st.holder.getWorldPosition(tmpV).y;
      if (!ray.ray.intersectPlane(floorPlane, floorHit)) return false;
      st.holder.worldToLocal(floorHit);
      const W = st.interior ? st.interior.w : 7;
      const D = st.interior ? st.interior.d : 7;
      if (Math.abs(floorHit.x) > W / 2 + 0.5 || Math.abs(floorHit.z) > D / 2 + 0.5) return false;
      return walkTo(st, floorHit.x, floorHit.z);
    }

    function pickView(i: number) {
      if (view?.kind !== "place") return;
      const n = view.stage.views.length;
      spotIndex = ((i % n) + n) % n;
      const v = view.stage.views[spotIndex];
      view.stage.local.x = v.lx;
      view.stage.local.z = v.lz;
      view.stage.walk = null;
      aim.yaw = v.yaw;
      aim.pitch = v.pitch;
      const inside = view.stage.level.kind === "interior";
      const roof = view.stage.level.kind === "roof";
      look.setLimits({ pitchMin: (inside ? -1.0 : roof ? -1.3 : -0.95) - aim.pitch, pitchMax: (inside ? 0.75 : 0.65) - aim.pitch, zoomMin: 0.55, zoomMax: 1.15 });
    }

    function startFlight(kind: Flight["kind"], dur: number, ctrl: THREE.Vector3 | null) {
      flight = { from: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, ctrl, t: 0, dur, kind };
    }

    /** Work out where we should be (from the props) and fly there if it changed. */
    function syncView() {
      type Next = { kind: "place"; anchor: Tile; level: PlaceLevel; building: string } | { kind: "ride"; k: number } | { kind: "vehicle"; ride: RideTarget } | null;
      let next: Next = null;
      if (wantPlace && currentPlan) {
        const m = /^b:(\d+)$/.exec(wantPlace.building);
        const r = m ? roomFor(Number(m[1])) : null;
        if (r && r.room.id === wantPlace.building) {
          const level = r.levels.find((l) => l.id === wantPlace!.level) ?? r.levels[0];
          next = { kind: "place", anchor: r.anchor, level, building: r.room.id };
        }
      }
      if (!next && wantRide?.kind === "balloon" && balloons[wantRide.index]) next = { kind: "ride", k: wantRide.index };
      if (!next && wantRide && wantRide.kind !== "balloon" && rideExists(wantRide)) next = { kind: "vehicle", ride: wantRide };
      if (next?.kind === "place" && view?.kind === "place" && view.stage.building === next.building && view.stage.level.id === next.level.id) return;
      if (next?.kind === "ride" && view?.kind === "ride" && view.k === next.k) return;
      if (next?.kind === "vehicle" && view?.kind === "vehicle" && view.ride.kind === next.ride.kind && view.ride.index === next.ride.index) return;
      if (!next && !view) return;
      if (!view && !flight) {
        // Leaving the normal map view: remember it, to fly back later.
        saved.pos.copy(camera.position);
        saved.target.copy(controls.target);
        saved.quat.copy(camera.quaternion);
        saved.fov = camera.fov;
      }
      if (leaving) disposeStage(leaving);
      if (leavingVehicle) disposeVehicle(leavingVehicle);
      const prev = view;
      leaving = prev?.kind === "place" ? prev.stage : null;
      leavingRide = prev?.kind === "ride";
      leavingVehicle = prev?.kind === "vehicle" ? prev : null;
      if (leavingVehicle) endVehicle(leavingVehicle);
      controls.enabled = false;
      focus = null;
      hoverBox.visible = false;
      cb.current.onHover?.(null);
      const from = camera.position.clone();
      if (!next) {
        view = null;
        look.setEnabled(false);
        // Out the way we came in: back out through the side we're facing from, then up.
        let ctrl: THREE.Vector3 | null = null;
        if (prev?.kind === "place") {
          const dir = tmpV.copy(saved.pos).sub(from).setY(0);
          const dist = from.distanceTo(saved.pos);
          ctrl = from.clone().add(dir.normalize().multiplyScalar(Math.min(3.5, Math.max(0.5, dist * 0.3)))).add(new THREE.Vector3(0, Math.min(1.5, dist * 0.12), 0));
        }
        startFlight("exit", 1.5, ctrl);
        return;
      }
      look.setEnabled(true);
      if (next.kind === "vehicle") {
        const vv = startVehicle(next.ride);
        view = vv;
        look.lookAt(0, 0, true);
        look.resetZoom(true);
        const am = vv.cabin?.aim ?? { yaw: 0, pitch: -0.12, pitchMin: -0.9, pitchMax: 0.5 };
        aim.yaw = am.yaw;
        aim.pitch = am.pitch;
        look.setLimits({ pitchMin: am.pitchMin - aim.pitch, pitchMax: am.pitchMax - aim.pitch, zoomMin: 0.55, zoomMax: 1.15 });
        vehicleEye(vv, 0, rideEye);
        const mid = from.clone().add(rideEye).multiplyScalar(0.5);
        mid.y += Math.min(2.5, from.distanceTo(rideEye) * 0.15);
        startFlight("enter", 1.7, mid);
        return;
      }
      if (next.kind === "ride") {
        view = { kind: "ride", k: next.k };
        aim.yaw = cameraYaw();
        aim.pitch = -0.55;
        look.lookAt(0, 0, true);
        look.resetZoom(true);
        look.setLimits({ pitchMin: -1.25 - aim.pitch, pitchMax: 0.3 - aim.pitch, zoomMin: 0.55, zoomMax: 1.15 });
        const b = balloons[next.k];
        const mid = from.clone().add(b.obj.position).multiplyScalar(0.5);
        mid.y += Math.min(2, from.distanceTo(b.obj.position) * 0.1);
        startFlight("enter", 1.6, mid);
        return;
      }
      const sameBuilding = prev?.kind === "place" && prev.stage.building === next.building;
      const st = buildStage(next.building, next.anchor, next.level);
      view = { kind: "place", stage: st };
      look.lookAt(0, 0, true);
      look.resetZoom(true);
      pickView(wantSpot);
      // Already have a seat here? Sit straight down.
      st.playersKey = "";
      syncPlayers(st);
      cb.current.onSpots?.(st.views.length);
      const target = st.views[spotIndex].p;
      let ctrl: THREE.Vector3 | null = null;
      if (!sameBuilding) {
        // Swoop in from the side we're looking from, arriving level (through the facade).
        const dir = tmpV.copy(from).sub(target).setY(0);
        const dist = from.distanceTo(target);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        ctrl = target
          .clone()
          .add(dir.normalize().multiplyScalar(Math.min(3.5, Math.max(0.5, dist * 0.3))))
          .add(new THREE.Vector3(0, Math.min(1.5, Math.max(0.05, dist * 0.12)), 0));
      }
      startFlight("enter", 1.5, ctrl);
    }

    function setRide(r: RideTarget | null) {
      wantRide = r;
      syncView();
    }
    function setSteer(dir: TurnDir) {
      traffic.steer(dir);
    }

    // ---- rides other than balloons: trains, buses, cars, boats, Ferris wheels, water slides
    const RIDE_CAP: Record<RideKind, number> = { balloon: 1000, train: 300, bus: 40, car: 4, boat: 30, ferris: 8, slide: 1 };
    let rideIdx: { buses: number[]; cars: number[] } = { buses: [], cars: [] };
    let slidesFlat: Slide[] = [];
    let ridesKey = "";
    function rideExists(r: RideTarget) {
      switch (r.kind) {
        case "train":
          return r.index >= 0 && r.index < trains.count;
        case "bus":
          return rideIdx.buses[r.index] !== undefined;
        case "car":
          return rideIdx.cars[r.index] !== undefined;
        case "boat":
          return r.index >= 0 && r.index < boats.count;
        case "ferris":
          return !!wheels[r.index];
        case "slide":
          return !!slidesFlat[r.index];
        default:
          return !!balloons[r.index];
      }
    }
    /** Work out what can be ridden this round, and tell the UI (when it changed). */
    function listRides() {
      rideIdx = traffic.rideables();
      slidesFlat = parks.flatMap((p) => p.slides);
      const plan = currentPlan;
      if (!plan) return;
      const out: CityRide[] = balloons.map((_, k) => ({ kind: "balloon" as const, index: k, name: `${BALLOON_NAMES[k] ?? `Balloon ${k + 1}`} hot-air balloon`, capacity: RIDE_CAP.balloon }));
      const city = plan.city.name;
      for (let i = 0; i < trains.count; i++) out.push({ kind: "train", index: i, name: `${city} train ${i + 1}`, capacity: RIDE_CAP.train });
      const busLabel = ({ ng: "BRT bus", uk: "Double-decker bus", us: "City bus", gh: "Metro bus", ke: "City Hoppa bus", za: "Rea Vaya bus" } as Record<string, string>)[plan.city.flavor.id] ?? "City bus";
      rideIdx.buses.forEach((_, j) => out.push({ kind: "bus", index: j, name: `${busLabel} · route ${[12, 7, 25][j] ?? j + 1}`, capacity: RIDE_CAP.bus }));
      let cars = 0;
      rideIdx.cars.forEach((k, j) => out.push({ kind: "car", index: j, name: traffic.isTaxi(k) ? `${city} taxi` : `Car ${++cars}`, capacity: RIDE_CAP.car }));
      const boatNames = [`${city} River Bus`, "Lady of the River", "Sunset Cruiser", "Island Hopper", "Blue Heron"];
      for (let i = 0; i < boats.count; i++) out.push({ kind: "boat", index: i, name: boatNames[i] ?? `River boat ${i + 1}`, capacity: RIDE_CAP.boat });
      wheels.forEach((w, i) => {
        const t = tileById.get(w.tile);
        const name = t?.name ?? (t?.structure ? `${t.structure.name} wheel` : t ? `Ferris wheel, ${shortAddress(addressOf(plan, t))}` : "Ferris wheel");
        out.push({ kind: "ferris", index: i, name, capacity: RIDE_CAP.ferris });
      });
      slidesFlat.forEach((sl, i) => out.push({ kind: "slide", index: i, name: sl.name, capacity: RIDE_CAP.slide }));
      const key = out.map((r) => `${r.kind}${r.index}:${r.name}`).join("|");
      if (key !== ridesKey) {
        ridesKey = key;
        cb.current.onRides?.(out);
      }
    }

    function startVehicle(r: RideTarget): VehicleView {
      const scene = new THREE.Scene();
      const key = `${currentSeed}|v:${r.kind}:${r.index}`;
      const vv: VehicleView = { kind: "vehicle", ride: r, scene, cabin: null, figures: null, npcs: [], pose: { x: 0, y: 0, z: 0, yaw: 0, speed: 0 }, yaw: 0, origin: new THREE.Vector3(), alpha: 0, cabinK: 0, flip: false, slide: null };
      if (r.kind === "slide") {
        const data = slidesFlat[r.index];
        const sr = createSlideRide(data);
        scene.add(sr.group);
        vv.slide = { ride: sr, data, length: data.curve.getLength(), phase: "top", t: 0, d: 0, v: 0, roll: 0, pitch: 0, ended: false };
        vehiclePose(vv, 0);
        vv.yaw = vv.pose.yaw;
        return vv;
      }
      const plan = currentPlan!;
      let color = 0xe03131;
      if (r.kind === "train") color = [0xe03131, 0x1971c2, 0x2f9e44, 0xf08c00][Math.abs(currentSeed) % 4];
      else if (r.kind === "bus") color = [0xe03131, 0x1971c2, 0x2f9e44][Math.abs(plan.seed) % 3];
      else if (r.kind === "car") {
        const k = rideIdx.cars[r.index];
        color = traffic.isTaxi(k) ? 0xffd43b : plan.palette.car[k % plan.palette.car.length];
        traffic.setRide(k, (opts) => cb.current.onJunction?.(opts));
      } else if (r.kind === "boat") {
        color = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2, 0xff922b][r.index % 6];
        boats.setRide(r.index);
      } else if (r.kind === "ferris") {
        // Board the cabin nearest the bottom, facing out over the city.
        const w = wheels[r.index];
        let best = 0;
        let bestD = 9;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + w.wheel.rotation.z;
          const d = Math.abs(turnTo(a, -Math.PI / 2));
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        vv.cabinK = best;
        const ry = w.obj.rotation.y;
        vv.flip = -Math.sin(ry) * -w.obj.position.x + -Math.cos(ry) * -w.obj.position.z < 0;
        color = (lmMat.cabins[best % lmMat.cabins.length].color as THREE.Color).getHex();
      }
      if (r.kind === "bus") traffic.setRide(rideIdx.buses[r.index], null);
      const cabin = createCabin(r.kind === "train" ? "train" : r.kind === "bus" ? "bus" : r.kind === "car" ? "car" : r.kind === "boat" ? "boat" : "ferris", key, color);
      scene.add(cabin.group);
      vv.cabin = cabin;
      // Fellow passengers (never in your own seat).
      const spots = cabin.spots.filter((sp) => Math.hypot(sp.x - cabin.eye.x, sp.z - cabin.eye.z) > 0.55);
      const npcs = npcsFor(`v:${r.kind}:${r.index}`, currentSeed, RIDE_CAP[r.kind]).slice(0, spots.length);
      if (npcs.length) {
        vv.npcs = npcs;
        vv.figures = createFigures(npcs, spots, { key });
        cabin.group.add(vv.figures.group);
      }
      vehiclePose(vv, 0);
      vv.yaw = vv.pose.yaw;
      return vv;
    }
    /** Stop steering / hiding the vehicle you were in (its cabin fades out separately). */
    function endVehicle(vv: VehicleView) {
      if (vv.ride.kind === "car" || vv.ride.kind === "bus") traffic.setRide(-1, null);
      if (vv.ride.kind === "boat") boats.setRide(-1);
    }
    function disposeVehicle(vv: VehicleView) {
      vv.cabin?.dispose();
      vv.figures?.dispose();
      vv.slide?.ride.dispose();
    }
    /** Where the vehicle is now (into vv.pose). False if it's gone. */
    function vehiclePose(vv: VehicleView, time: number) {
      const r = vv.ride;
      const out = vv.pose;
      switch (r.kind) {
        case "train":
          return trains.pose(r.index, out);
        case "bus":
          return traffic.pose(rideIdx.buses[r.index] ?? -1, out);
        case "car":
          return traffic.pose(rideIdx.cars[r.index] ?? -1, out);
        case "boat":
          return boats.pose(r.index, time, out);
        case "ferris": {
          const w = wheels[r.index];
          if (!w) return false;
          const sc = w.obj.scale.x;
          const a = (vv.cabinK / 8) * Math.PI * 2 + w.wheel.rotation.z;
          const lx = Math.cos(a) * 0.62 * sc;
          const ry = w.obj.rotation.y;
          out.x = w.obj.position.x + Math.cos(ry) * lx;
          out.z = w.obj.position.z - Math.sin(ry) * lx;
          out.y = (1.35 + Math.sin(a) * 0.62) * sc;
          out.yaw = ry + (vv.flip ? Math.PI : 0);
          out.speed = 0;
          return true;
        }
        case "slide": {
          const sl = vv.slide!;
          const u = Math.min(1, sl.d / sl.length);
          sl.data.curve.getPointAt(u, tmpV);
          out.x = tmpV.x;
          out.y = tmpV.y;
          out.z = tmpV.z;
          // Look a little way ahead round the bends (not straight into the wall).
          sl.data.curve.getPointAt(Math.min(1, u + 0.16 / sl.length), leanDir).sub(tmpV);
          if (leanDir.lengthSq() < 1e-8) sl.data.curve.getTangentAt(u, leanDir);
          leanDir.normalize();
          out.yaw = Math.atan2(-leanDir.x, -leanDir.z);
          out.speed = sl.v;
          sl.pitch = Math.asin(Math.max(-1, Math.min(1, leanDir.y)));
          return true;
        }
      }
      return false;
    }
    /** Your eyes on the vehicle (city space), into out. */
    function vehicleEye(vv: VehicleView, time: number, out: THREE.Vector3) {
      vehiclePose(vv, time);
      if (vv.slide) {
        const sl = vv.slide;
        if (sl.phase === "splash") {
          // Into the pool: a dip under the surface, then bobbing about.
          const s2 = sl.t;
          const end = sl.data.points[sl.data.points.length - 1];
          const f = Math.min(1, s2 / 0.7);
          out.set(end.x - Math.sin(vv.yaw) * Math.min(0.12, s2 * 0.3), sl.data.pool.y + 0.035 - Math.sin(f * Math.PI) * 0.06 + (s2 > 0.7 ? Math.sin(s2 * 2.4) * 0.004 : 0), end.z - Math.cos(vv.yaw) * Math.min(0.12, s2 * 0.3));
        } else out.set(vv.pose.x, vv.pose.y + 0.075, vv.pose.z);
        vv.origin.copy(sl.ride.origin);
        return out;
      }
      const e = vv.cabin!.eye;
      const c = Math.cos(vv.yaw);
      const sn = Math.sin(vv.yaw);
      // Turn the cabin's eye point by the heading (yaw about +y), metres → city units.
      out.set(vv.pose.x + (e.x * c + e.z * sn) / METRES, vv.pose.y + e.y / METRES, vv.pose.z + (-e.x * sn + e.z * c) / METRES);
      vv.origin.set(vv.pose.x, vv.pose.y, vv.pose.z);
      return out;
    }
    /** Move a ride along a step (slides go down by themselves). */
    function stepVehicle(vv: VehicleView, dt: number, time: number) {
      const sl = vv.slide;
      if (sl && !flight) {
        sl.t += dt;
        if (sl.phase === "top" && sl.t > 2.0) {
          sl.phase = "slide";
          sl.v = 0.32;
          playSfx("whoosh");
        } else if (sl.phase === "slide") {
          sl.v = Math.min(1.3, sl.v + dt * 0.85);
          sl.d += sl.v * dt;
          if (sl.d >= sl.length) {
            sl.d = sl.length;
            sl.phase = "splash";
            sl.t = 0;
            playSfx("splash");
          }
        } else if (sl.phase === "splash" && sl.t > 1.4 && !sl.ended) {
          sl.ended = true;
          cb.current.onRideEnd?.();
        }
        sl.ride.splash(sl.phase === "splash" ? sl.t : -1);
      }
      const prevYaw = vv.yaw;
      vehiclePose(vv, time);
      // A steady view: the heading follows the vehicle smoothly (no jolts on phones).
      vv.yaw += turnTo(vv.yaw, vv.pose.yaw) * (1 - Math.exp(-dt * (sl ? 16 : 5)));
      if (sl && dt > 0) {
        const rate = turnTo(prevYaw, vv.yaw) / dt;
        sl.roll += (Math.max(-0.55, Math.min(0.55, rate * 0.16)) - sl.roll) * Math.min(1, dt * 5);
      }
      if (vv.cabin) {
        vv.cabin.group.rotation.y = vv.yaw;
        const steerAmt = vv.ride.kind === "car" ? Math.max(-1, Math.min(1, turnTo(prevYaw, vv.yaw) / Math.max(0.001, dt) * 0.6)) : 0;
        vv.cabin.update(time, carNight, steerAmt);
      } else sl?.ride.setNight(carNight);
      vv.figures?.update(time);
    }
    function setPlace(p: CityPlace | null) {
      wantPlace = p;
      syncView();
    }
    function setSpot(n: number) {
      wantSpot = n;
      if (view?.kind !== "place" || !view.stage.views.length) return;
      const nv = view.stage.views.length;
      if (((n % nv) + nv) % nv === spotIndex) return;
      pickView(n);
      look.lookAt(0, 0);
      startFlight("move", 1.0, null);
    }

    /** Where the camera wants to be right now (balloon basket or the viewpoint in a place). */
    function targetPose(dt: number) {
      let hfov = 74;
      if (view?.kind === "ride") {
        // A calmer, narrower view from the basket on tall phone screens.
        hfov = (el.clientWidth || 1) < (el.clientHeight || 1) ? 62 : 74;
        const b = balloons[view.k];
        rideEye.copy(b.obj.position);
        rideEye.y -= BASKET_EYE;
        pose.pos.copy(rideEye);
        // The basket turns slowly to keep the middle of the city in front of you.
        const want = Math.atan2(rideEye.x, rideEye.z);
        if (Math.hypot(rideEye.x, rideEye.z) > 1.5) aim.yaw += turnTo(aim.yaw, want) * (1 - Math.exp(-dt / 9));
      } else if (view?.kind === "place" && view.stage.meAt) {
        // Dancing: the camera circles you (drag to go round), looking at you among the crowd.
        const st = view.stage;
        const me = st.meAt!;
        if (st.danceCam) {
          // Just started: stand the camera in front of you.
          st.danceCam = false;
          // Side-on when you're dancing with someone, so you see the two of you.
          aim.yaw = stageTurn(st) + me.ry + (danceNow?.with ? 1.1 : 0);
          aim.pitch = 0;
          look.setLimits({ pitchMin: -0.35, pitchMax: 0.55, zoomMin: 0.65, zoomMax: 1.35 });
          look.lookAt(0, 0);
        }
        const W = (st.interior?.w ?? 7) / 2 - 0.45;
        const D = (st.interior?.d ?? 7) / 2 - 0.45;
        const ly = aim.yaw + look.state.yaw - stageTurn(st);
        const dist = 3.0 / Math.max(0.6, look.state.zoom);
        const cx = Math.max(-W, Math.min(W, me.x + Math.sin(ly) * dist));
        const cz = Math.max(-D, Math.min(D, me.z + Math.cos(ly) * dist));
        st.camAt = { x: cx, z: cz };
        // High enough to see over the crowd's heads.
        stageToCity(st, cx, cz, 2.5 + look.state.pitch * 1.2, pose.pos);
        stageToCity(st, me.x, me.z, 1.05, tmpV2);
        tmpV2.sub(pose.pos);
        pose.quat.setFromEuler(eul.set(Math.atan2(tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z)), Math.atan2(-tmpV2.x, -tmpV2.z), 0, "YXZ"));
        pose.fov = fovFor(78);
        return;
      } else if (view?.kind === "place") {
        const st = view.stage;
        stepWalk(st, dt);
        stageToCity(st, st.local.x, st.local.z, st.eye, pose.pos);
        hfov = st.level.kind === "interior" ? 84 : 80;
      } else if (view?.kind === "vehicle") {
        const tall = (el.clientWidth || 1) < (el.clientHeight || 1);
        stepVehicle(view, dt, clock.elapsedTime);
        vehicleEye(view, clock.elapsedTime, pose.pos);
        hfov = view.slide ? 96 : tall ? 70 : 80;
        const sl = view.slide;
        const yaw = view.yaw + aim.yaw + look.state.yaw;
        const pitch = (sl && sl.phase === "slide" ? sl.pitch * 0.8 : 0) + aim.pitch + look.state.pitch;
        pose.quat.setFromEuler(eul.set(pitch, yaw, sl && sl.phase === "slide" ? sl.roll : 0, "YXZ"));
        pose.fov = fovFor(hfov) * look.state.zoom;
        return;
      }
      const yaw = aim.yaw + look.state.yaw;
      const pitch = aim.pitch + look.state.pitch;
      pose.quat.setFromEuler(eul.set(pitch, yaw, 0, "YXZ"));
      pose.fov = fovFor(hfov) * look.state.zoom;
    }

    /** Moves the camera when riding or in a place (or flying to / from one). False when the map controls are in charge. */
    function updateView(dt: number) {
      if (!view && !flight) return false;
      look.update(dt, THREE.MathUtils.degToRad(camera.fov), el.clientHeight || 600);
      if (view) targetPose(dt);
      else {
        pose.pos.copy(saved.pos);
        pose.quat.copy(saved.quat);
        pose.fov = saved.fov;
      }
      let e = 1;
      if (flight) {
        flight.t = Math.min(1, flight.t + dt / flight.dur);
        e = easeInOut(flight.t);
        const f = flight;
        if (f.ctrl) {
          // A gentle curve (quadratic Bézier) rather than a straight line.
          const u = 1 - e;
          camera.position.set(
            u * u * f.from.x + 2 * u * e * f.ctrl.x + e * e * pose.pos.x,
            u * u * f.from.y + 2 * u * e * f.ctrl.y + e * e * pose.pos.y,
            u * u * f.from.z + 2 * u * e * f.ctrl.z + e * e * pose.pos.z,
          );
        } else camera.position.lerpVectors(f.from, pose.pos, e);
        camera.quaternion.slerpQuaternions(f.quat, pose.quat, e);
        camera.fov = f.fov + (pose.fov - f.fov) * e;
      } else {
        camera.position.copy(pose.pos);
        camera.quaternion.copy(pose.quat);
        camera.fov = pose.fov;
      }
      // Fading rooms and the basket in and out: a room appears round you as you pass in
      // through its walls, and melts away as you leave.
      const kind = flight?.kind;
      const out = kind === "enter" || kind === "exit" ? 1 - smoothstep(0.15, 0.6, e) : 0;
      if (view?.kind === "place") view.stage.alpha = view.stage.level.kind === "interior" ? (kind === "enter" ? Math.min(smoothstep(0.35, 0.8, e), insideRoom(view.stage)) : 1) : 1;
      if (leaving) leaving.alpha = flight ? Math.min(out, insideRoom(leaving)) : 0;
      basketAlpha = view?.kind === "ride" ? (kind === "enter" ? smoothstep(0.6, 0.95, e) : 1) : leavingRide && flight ? 1 - smoothstep(0, 0.3, e) : 0;
      if (view?.kind === "vehicle") view.alpha = kind === "enter" ? smoothstep(0.55, 0.95, e) : 1;
      if (leavingVehicle) leavingVehicle.alpha = flight ? 1 - smoothstep(0, 0.3, e) : 0;
      const outdoors = (view?.kind === "place" && view.stage.level.kind !== "interior") || view?.kind === "vehicle";
      camera.near = outdoors && (!flight || e > 0.5) ? (view?.kind === "vehicle" ? 0.03 : 0.05) : 0.1;
      camera.updateProjectionMatrix();
      if (flight && flight.t >= 1) {
        flight = null;
        if (leaving) {
          disposeStage(leaving);
          leaving = null;
        }
        if (leavingVehicle) {
          disposeVehicle(leavingVehicle);
          leavingVehicle = null;
        }
        leavingRide = false;
        if (!view) {
          // Back to the map: the normal controls take over again.
          camera.position.copy(saved.pos);
          camera.quaternion.copy(saved.quat);
          camera.fov = saved.fov;
          camera.near = 0.1;
          camera.updateProjectionMatrix();
          controls.target.copy(saved.target);
          controls.enabled = true;
          basketAlpha = 0;
          return false;
        }
      }
      return true;
    }

    /** How far inside a room's walls the camera is (0 outside, 1 a metre or more in). */
    function insideRoom(st: Stage) {
      if (!st.interior) return 1;
      const p = tmpV.copy(camera.position).sub(st.origin).divideScalar(st.unit).applyAxisAngle(up, -st.holder.rotation.y);
      const y = p.y + 1.6;
      const margin = Math.min(st.interior.w / 2 - Math.abs(p.x), st.interior.d / 2 - Math.abs(p.z), y, 4 - y);
      return smoothstep(0, 1, margin);
    }

    /** Draw the room we're in (or the basket) over the city: the city shows through the windows. */
    function renderOverlays(time: number) {
      const passes: { scene: THREE.Scene; origin: THREE.Vector3; unit: number; eye: number; lean?: number }[] = [];
      for (const st of [leaving, view?.kind === "place" ? view.stage : null]) {
        if (!st?.scene || !st.interior) continue;
        st.interior.setAlpha(st.alpha);
        if (st.alpha > 0.002) passes.push({ scene: st.scene, origin: st.origin, unit: st.unit, eye: 1.6 });
      }
      for (const vv of [leavingVehicle, view?.kind === "vehicle" ? view : null]) {
        if (!vv) continue;
        vv.cabin?.setAlpha(vv.alpha);
        vv.slide?.ride.setAlpha(vv.alpha);
        if (vv.alpha > 0.002) passes.push({ scene: vv.scene, origin: vv.origin, unit: 1 / METRES, eye: 0 });
      }
      basket.setAlpha(basketAlpha);
      const rideK = view?.kind === "ride" ? view.k : null;
      for (const b of balloons) b.basket.visible = !(rideK === b.k && basketAlpha > 0.5);
      if (basketAlpha > 0.002 && rideK !== null) {
        basket.update(time, carNight);
        basket.group.rotation.y = aim.yaw;
        // Eye a little above the rim, so the basket is just a frame at the bottom of the view.
        passes.push({ scene: basketScene, origin: rideEye, unit: 1 / METRES, eye: 1.85, lean: 0.62 });
      }
      if (!passes.length) return;
      overlayCam.quaternion.copy(camera.quaternion);
      overlayCam.fov = camera.fov;
      overlayCam.aspect = camera.aspect;
      overlayCam.updateProjectionMatrix();
      renderer.autoClear = false;
      for (const p of passes) {
        overlayCam.position.copy(camera.position).sub(p.origin).divideScalar(p.unit);
        overlayCam.position.y += p.eye;
        if (p.lean) {
          // Lean over the rim in the direction you're looking, like a real passenger: the
          // basket then only frames the bottom of the view instead of filling it.
          leanDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
          leanDir.y = 0;
          if (leanDir.lengthSq() > 1e-6) overlayCam.position.addScaledVector(leanDir.normalize(), p.lean);
        }
        overlayCam.updateMatrixWorld();
        renderer.clearDepth();
        renderer.render(p.scene, overlayCam);
      }
      renderer.autoClear = true;
    }

    function updateStages(time: number) {
      for (const st of [leaving, view?.kind === "place" ? view.stage : null]) {
        if (!st) continue;
        st.interior?.setNight(carNight);
        st.deck?.setNight(carNight);
        camLocal.set(st.local.x, 0, st.local.z);
        st.figures?.update(time, camLocal);
        st.players?.update(time, camLocal);
        st.crowd?.update(time);
        st.dancers?.update(time);
        // While you dance, nobody stands between the camera and you.
        const cam = st.meAt ? st.camAt : null;
        for (const f of [st.crowd, st.figures, st.dancers]) {
          if (!f) continue;
          if (cam && st.meAt) f.clearView(cam.x, cam.z, st.meAt.x, st.meAt.z, 0.5, danceNow?.id);
          else f.showAll();
        }
        if (st.meRing) {
          st.meRing.visible = !!st.meAt;
          if (st.meAt) {
            st.meRing.position.set(st.meAt.x, 0.09, st.meAt.z);
            const k = 1 + 0.12 * Math.max(0, Math.cos(clubBeat() * Math.PI * 2));
            st.meRing.scale.set(k, k, 1);
          }
        }
        st.update?.(time);
        st.interact?.update(time, camLocal, st.hover);
      }
    }
    function setSeats(list: Record<string, SeatTaker> | undefined, mine: string | null) {
      seatsNow = list ?? {};
      mySeatNow = mine;
      if (view?.kind === "place") syncPlayers(view.stage);
    }

    /** The regular (NPC) under the pointer in the place we're in, if any. */
    function npcUnder(clientX: number, clientY: number): Npc | null {
      if (view?.kind === "vehicle" && !flight && view.figures) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(pointer, overlayCam);
        const hit = ray.intersectObjects(view.figures.hits, true)[0];
        const id = hit ? view.figures.npcOf(hit.object) : null;
        const npcs = view.npcs;
        return id ? (npcs.find((n) => n.id === id) ?? null) : null;
      }
      if (view?.kind !== "place" || flight) return null;
      const st = view.stage;
      if (!st.figures) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(pointer, st.scene ? overlayCam : camera);
      const hit = ray.intersectObjects(st.figures.hits, true)[0];
      const id = hit ? st.figures.npcOf(hit.object) : null;
      return id ? (st.npcs.find((n) => n.id === id) ?? null) : null;
    }

    // ---- caught ghosts: their faces float over where they were caught, all round long
    type Caught = CaughtFace & { bot?: boolean };
    const caughtFromEvents = new Map<string, Caught>();
    let caughtProp: CaughtFace[] | undefined;
    let caughtKey = "";
    const caughtGroup = new THREE.Group();
    scene.add(caughtGroup);
    function drawCaught() {
      const list: Caught[] = caughtProp ?? [...caughtFromEvents.values()];
      const key = `${tiles.length}|${list.map((f) => `${f.tile}:${f.name ?? ""}`).join(",")}`;
      if (key === caughtKey) return;
      caughtKey = key;
      for (const c of [...caughtGroup.children]) {
        caughtGroup.remove(c);
        ((c as THREE.Sprite).material as THREE.Material).dispose();
      }
      const perTile = new Map<number, number>();
      for (const f of list.slice(-40)) {
        const t = tileById.get(f.tile);
        if (!t) continue;
        const n = perTile.get(f.tile) ?? 0;
        perTile.set(f.tile, n + 1);
        const tex = f.bot ? botTexture() : faceTexture(cleanAvatar(f.avatar, f.name ?? "ghost"), "#e5484d");
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        sp.renderOrder = 6;
        sp.scale.setScalar(0.55);
        const col = n % 3;
        sp.userData = {
          x: t.x + (col === 0 ? 0 : col === 1 ? -0.42 : 0.42),
          y: t.top + 0.95 + Math.floor(n / 3) * 0.5,
          z: t.z,
          phase: (f.tile * 1.7 + n) % 6.28,
        };
        caughtGroup.add(sp);
      }
    }
    function setCaughtFaces(list: CaughtFace[] | undefined) {
      caughtProp = list;
      drawCaught();
    }
    function updateCaught(time: number) {
      caughtGroup.visible = isRevealed;
      for (const c of caughtGroup.children) {
        const u = c.userData as { x: number; y: number; z: number; phase: number };
        c.position.set(u.x, u.y + Math.sin(time * 1.6 + u.phase) * 0.08, u.z);
      }
    }

    // ---- little extras when you tap things: trees shake, parked cars honk, fountains splash
    const shakes = new Map<number, number>();
    const wobble = new THREE.Quaternion();
    const wobbleE = new THREE.Euler();
    function tapExtras(i: number) {
      const t = tileById.get(i);
      if (!t || !isRevealed) return;
      const fountain = t.kind === "plaza" || (t.kind === "road" && t.roundabout && t.r[1] < 0.5);
      if (fountain) {
        splashScene(t);
        playSfx("splash");
        return;
      }
      if ((t.kind === "road" && t.incident) || t.kind === "police") {
        honkScene(t);
        playSfx("honk");
        return;
      }
      if ((tileParts.get(i) ?? []).some(([n]) => n === "crown")) {
        if (!shakes.has(i)) leavesScene(t, i);
        shakes.set(i, performance.now());
        playSfx("rustle");
      }
    }
    function updateShakes(now: number) {
      if (!shakes.size) return;
      const mesh = meshes.crown;
      if (!mesh) return;
      for (const [tile, start] of shakes) {
        const k = (now - start) / 1000;
        const done = k >= 1.1;
        for (const [name, idx] of tileParts.get(tile) ?? []) {
          if (name !== "crown") continue;
          const p = parts.crown[idx];
          if (done || growing.includes(tile)) {
            writePart(mesh, idx, p, 1);
            continue;
          }
          const amp = 0.25 * (1 - k / 1.1);
          wobble.setFromEuler(wobbleE.set(Math.sin(k * 31 + idx) * amp, 0, Math.sin(k * 26 + idx * 2) * amp));
          q.setFromAxisAngle(up, p.ry);
          wobble.multiply(q);
          m4.compose(v.set(p.x, p.y, p.z), wobble, s.set(p.sx, p.sy, p.sz));
          mesh.setMatrixAt(idx, m4);
        }
        if (done) shakes.delete(tile);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    function leavesScene(t: Tile, i: number) {
      const crowns = (tileParts.get(i) ?? []).filter(([n]) => n === "crown").slice(0, 3);
      crowns.forEach(([, idx], j) => {
        const p = parts.crown[idx];
        for (let k = 0; k < 2; k++) {
          const leaf = new THREE.Mesh(sparkGeo, paint(p.color));
          const sx = (Math.random() - 0.5) * p.sx * 0.8;
          const sz = (Math.random() - 0.5) * p.sz * 0.8;
          const top = p.y + p.sy * 0.6;
          const delay = 0.1 + Math.random() * 0.2 + j * 0.05;
          const spin = Math.random() * 6;
          addFx(leaf, 2400, (u) => {
            const f = Math.max(0, u - delay / 2.4) / (1 - delay / 2.4);
            leaf.visible = u > delay / 2.4;
            const y = top - (top - 0.09) * Math.min(1, f * 1.15);
            leaf.position.set(p.x + sx + Math.sin(f * 9 + spin) * 0.12, y, p.z + sz + Math.cos(f * 7 + spin) * 0.08);
            leaf.rotation.set(f * 8 + spin, f * 5, Math.sin(f * 10) * 0.8);
            leaf.scale.set(1, 0.25, 0.8);
            leaf.scale.multiplyScalar(f > 0.85 ? Math.max(0.0001, (1 - f) / 0.15) : 1);
          });
        }
      });
    }
    function splashScene(t: Tile) {
      const y0 = t.kind === "plaza" ? 0.24 : 0.22;
      const drops = new THREE.Group();
      for (let k = 0; k < 16; k++) {
        const d = new THREE.Mesh(sparkGeo, paint(k % 2 ? 0xa5d8ff : 0xe7f5ff));
        const a = Math.random() * Math.PI * 2;
        const sp = 0.25 + Math.random() * 0.45;
        d.userData = { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 1.6 + Math.random() * 1.2 };
        drops.add(d);
      }
      drops.position.set(t.x, y0, t.z);
      addFx(drops, 1300, (u) => {
        const tt = u * 1.3;
        for (const d of drops.children) {
          const w = d.userData as { vx: number; vy: number; vz: number };
          d.position.set(w.vx * tt, Math.max(-0.05, w.vy * tt - 4 * tt * tt), w.vz * tt);
          d.scale.setScalar(0.8 * (1 - u * 0.5));
        }
      });
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x74c0fc, transparent: true, depthWrite: false }));
      ring.position.set(t.x, y0 + 0.01, t.z);
      addFx(ring, 900, (u) => {
        ring.scale.setScalar(0.2 + u * 0.7);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
      });
    }
    function honkScene(t: Tile) {
      // Where the parked car is.
      let cx = t.x + 0.28;
      let cz = t.z + 0.34;
      if (t.kind === "road") {
        const side = t.r[1] < 0.5 ? 0.33 : -0.33;
        const alongX = t.mask === 10;
        cx = alongX ? t.x : t.x + side;
        cz = alongX ? t.z + side : t.z;
      }
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: poolMat.map, color: 0xffd43b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(cx, 0.16, cz);
      glow.renderOrder = 6;
      addFx(glow, 1300, (u) => {
        const on = Math.sin(u * Math.PI * 8) > 0;
        glow.scale.setScalar(on ? 0.75 : 0.0001);
      });
      const hop = new THREE.Sprite(new THREE.SpriteMaterial({ map: honkTex, transparent: true, depthTest: false }));
      hop.renderOrder = 7;
      addFx(hop, 1300, (u) => {
        hop.position.set(cx, 0.55 + u * 0.4, cz);
        hop.scale.set(0.7, 0.35, 1);
        hop.material.opacity = u > 0.7 ? (1 - u) / 0.3 : 1;
      });
    }
    const honkTex = (() => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const c = canvas.getContext("2d")!;
      c.font = "900 64px system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 10;
      c.strokeStyle = "#ffffff";
      c.strokeText("BEEP!", 128, 66);
      c.fillStyle = "#1c7ed6";
      c.fillText("BEEP!", 128, 66);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    })();

    // ---- the secret city: a building site until the hunt starts, then the big reveal
    function setRevealed(on: boolean) {
      if (on === isRevealed) return;
      isRevealed = on;
      world.revealed = on;
      if (!on) {
        city.visible = false;
        life.visible = false;
        for (const g of ghosts) g.visible = false;
        hoverBox.visible = false;
        buildingSite.build(currentSeed, builtCount, siteBox());
        buildingSite.show(true);
        return;
      }
      // Everything rises out of the ground, from the middle outwards, in about three seconds.
      const now = performance.now();
      const far = tiles.reduce((m, t) => Math.max(m, Math.hypot(t.x, t.z)), 1);
      born = new Map();
      for (const t of tiles) born.set(t.i, now + 350 + (Math.hypot(t.x, t.z) / far) * 2200 + Math.random() * 200);
      world.born = born;
      growing = tiles.map((t) => t.i);
      for (const [name, list] of Object.entries(parts)) {
        const mesh = meshes[name];
        if (!mesh) continue;
        list.forEach((p, k) => writePart(mesh, k, p, 0));
        mesh.instanceMatrix.needsUpdate = true;
      }
      city.visible = true;
      for (const g of ghosts) g.visible = true;
      buildingSite.show(false);
      lifeAt = now + 1600;
    }

    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      eventFly = null;
      if (immersive()) renderer.domElement.style.cursor = "grabbing";
    };
    const onUp = (e: PointerEvent) => {
      // A press that started on an info bubble is the bubble's (a tap opens it; a drag only panned).
      if (bubbles.release(e)) {
        down = null;
        return;
      }
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (immersive()) {
        // Riding or inside somewhere: dragging only looks round. A tap only ever reaches the
        // people standing there (never the map, buildings or balloons behind).
        renderer.domElement.style.cursor = "grab";
        if (moved > 8 || !quick || look.multiTouch) return;
        const npc = npcUnder(e.clientX, e.clientY);
        if (npc) {
          cb.current.onNpc?.(npc.id);
          return;
        }
        if (aloft()) {
          const tile = isRevealed ? tileUnder(e.clientX, e.clientY) : null;
          const r = tile !== null ? roomFor(tile) : null;
          if (r) cb.current.onRoom?.(r.room);
          return;
        }
        const it = itemUnder(e.clientX, e.clientY);
        if (it && view?.kind === "place") {
          playSfx("chime");
          const sport = THEME_SPORT[view.stage.level.theme];
          cb.current.onInteract?.({ id: it.id, kind: it.kind, label: it.label, place: view.stage.place, ...(sport && (it.kind === "match" || it.kind === "seat") ? { sport } : {}) });
          return;
        }
        walkTap(e.clientX, e.clientY);
        return;
      }
      if (moved > 8 || !quick) return;
      // An event's pin (drawn over everything): what's happening there.
      const pinTap = isRevealed && cb.current.onEventInfo ? worldEventsLayer.pinAt(e.clientX, e.clientY) : null;
      if (pinTap !== null) {
        cb.current.onEventInfo?.(pinTap);
        return;
      }
      const eventTap = isRevealed ? worldEventsLayer.pickAt(e.clientX, e.clientY) : null;
      if (eventTap !== null) {
        cb.current.onEventTap?.(eventTap);
        return;
      }
      if (coin && coinUnder(e.clientX, e.clientY)) {
        // Pop! A burst of gold where the balloon was.
        const at = coin.obj.position.clone();
        const burst = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc53d, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        burst.position.copy(at);
        addFx(burst, 700, (t) => {
          burst.scale.setScalar(0.5 + t * 3);
          burst.lookAt(camera.position);
          (burst.material as THREE.MeshBasicMaterial).opacity = 1 - t;
        });
        const slot = coin.slot;
        scene.remove(coin.obj);
        coin = null;
        cb.current.onBalloon(slot);
        return;
      }
      const board = isRevealed ? boardUnder(e.clientX, e.clientY) : null;
      if (board) {
        cb.current.onBillboard(board);
        return;
      }
      // Buildings and balloons are places: tap one to go inside.
      // (No rides while the town is still a building site.)
      const k = isRevealed ? balloonUnder(e.clientX, e.clientY) : null;
      if (k !== null) {
        cb.current.onRoom?.(balloonRoom(k));
        return;
      }
      const tile = tileUnder(e.clientX, e.clientY);
      if (tile === null) return;
      tapExtras(tile);
      const r = isRevealed ? roomFor(tile) : null;
      if (r) {
        showHover(tile);
        cb.current.onRoom?.(r.room);
      }
    };
    let hoverQueued: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && !down) hoverQueued = e;
    };
    const onLeave = () => showHover(null);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    // ---- size and loop
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      bubbles.resize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Traffic lights cycle every 10 s: one direction green, then amber, then the other's turn.
    const SIGNAL_ON = [new THREE.Color(0xff3b30), new THREE.Color(0xffb020), new THREE.Color(0x2fd158)];
    const SIGNAL_OFF = new THREE.Color(0x2b2f33);
    function updateSignals(time: number) {
      const mesh = meshes.signal;
      if (!mesh || !signalTags.length) return;
      const c = time % 10;
      const phase = c < 4 ? 0 : c < 5 ? 1 : c < 9 ? 2 : 3;
      if (phase === signalPhase) return;
      signalPhase = phase;
      // Which bulb is lit for each direction in this phase (0 red, 1 amber, 2 green).
      const lit = [[2, 0], [1, 0], [0, 2], [0, 1]][phase];
      signalTags.forEach((tag, k) => {
        const axis = Math.floor(tag / 3);
        const bulb = tag % 3;
        mesh.setColorAt(k, bulb === lit[axis] ? SIGNAL_ON[bulb] : SIGNAL_OFF);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (pools) {
        for (let k = 0; k < poolAxis.length; k++) pools.setColorAt(k, SIGNAL_ON[lit[poolAxis[k]]]);
        if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
      }
    }

    const clock = new THREE.Clock();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      // Frozen (behind the sign-in pop-up): the last picture stays, nothing moves. (Not in the
      // first few seconds, so there's a town to see behind it when the page opens with it up.)
      if (cb.current.paused && clock.elapsedTime > 3) {
        clock.getDelta();
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.1);
      const time = clock.elapsedTime;
      const now = performance.now();
      if (hoverQueued && immersive()) {
        // Inside somewhere: point at people to see who they are.
        const npc = npcUnder(hoverQueued.clientX, hoverQueued.clientY);
        const it = npc ? null : itemUnder(hoverQueued.clientX, hoverQueued.clientY);
        if (view?.kind === "place") view.stage.hover = it?.id ?? null;
        renderer.domElement.style.cursor = npc || it ? "pointer" : "grab";
        cb.current.onHover?.(
          npc
            ? { tile: -1, label: `${npc.name} · ${npc.role} · NPC · tap to chat` }
            : it
              ? { tile: -1, label: it.kind === "seat" ? (it.taken ? `${it.taken} is sitting here` : "A free seat · tap to sit") : `${it.label} · tap to use` }
              : null,
        );
        hoverQueued = null;
      }
      if (hoverQueued) {
        const pinId = isRevealed && cb.current.onEventInfo ? worldEventsLayer.pinAt(hoverQueued.clientX, hoverQueued.clientY) : null;
        if (pinId !== null) {
          renderer.domElement.style.cursor = "pointer";
          hoverBox.visible = false;
          cb.current.onHover?.({ tile: -1, label: `${worldEventsLayer.titleOf(pinId) ?? "Town event"} · tap for details` });
          hoverQueued = null;
        }
      }
      if (hoverQueued) {
        const balloonK = isRevealed ? balloonUnder(hoverQueued.clientX, hoverQueued.clientY) : null;
        const board = balloonK === null && isRevealed ? boardUnder(hoverQueued.clientX, hoverQueued.clientY) : null;
        renderer.domElement.style.cursor = board || balloonK !== null ? "pointer" : "";
        if (balloonK !== null) {
          const room = balloonRoom(balloonK);
          const n = roomCountsNow[room.id] ?? 0;
          hoverBox.visible = false;
          cb.current.onHover?.({ tile: -1, label: `${room.name} · ${n ? `${n} aboard` : "nobody aboard yet"} · tap to climb in` });
        } else if (board) {
          const t = tileById.get(board.tile);
          const ad = board.adId ? adsList.find((a) => a.id === board.adId) : null;
          const where = t && currentPlan ? addressOf(currentPlan, t) : "this spot";
          cb.current.onHover?.({ tile: board.tile, label: ad ? `${ad.brand}: ${ad.headline} · tap to see more` : `Billboard at ${where} · your ad here, tap to find out more` });
        } else showHover(tileUnder(hoverQueued.clientX, hoverQueued.clientY));
        hoverQueued = null;
      }
      world.night = carNight;
      world.rain = storm;
      world.progress = atmos.current.progress;
      life.visible = isRevealed && now >= lifeAt;
      followWindow(now);
      updateGrowth(now);
      updateShakes(now);
      if (life.visible) {
        traffic.update(dt, time);
        updateLandmarks(dt, now);
        for (const p of parks) p.update(time);
        for (const g of games) g.update(time, dt);
        updateBoards(dt, time, now);
        boats.update(time, dt);
        people.update(dt, now);
        trains.update(dt, now);
        plumes.update(time, now);
        sites.update(now);
      }
      updateSignals(time);
      updateSky(time, dt);
      updateFlashers(time);
      updateAir(time, dt);
      buildingSite.update(dt, now);
      updateFx(now);
      updateAtmosphere(dt);
      updateLightning(dt);
      updateRain(dt);
      updateCoin(time);
      updateMarkers(time);
      updateCaught(time);
      // The city dims a little so the places' counts stand out (but not once you're inside
      // somewhere, looking round).
      const exposure = immersive() ? 1.0 : 0.8;
      renderer.toneMappingExposure += (exposure - renderer.toneMappingExposure) * Math.min(1, dt * 3);
      updateStages(time);
      const riding = updateView(dt);
      countryside.update(camera.position, view?.kind === "ride" || view?.kind === "vehicle", currentSeed);
      if (!riding) {
        if (focus) {
          controls.target.lerp(focus, 0.06);
          if (controls.target.distanceTo(focus) < 0.05) focus = null;
        }
        if (eventFly) {
          flyStep.subVectors(eventFly, controls.target).multiplyScalar(0.06);
          controls.target.add(flyStep);
          camera.position.add(flyStep);
          // Come in closer if we're zoomed right out.
          const far = camera.position.distanceTo(controls.target) > 13;
          if (far) camera.position.lerp(controls.target, 0.03);
          if (flyStep.lengthSq() < 1e-6 && !far) eventFly = null;
        }
        controls.update();
      }
      updatePills();
      updatePins();
      updateGhosts(time);
      const dist = riding ? 10 : camera.position.distanceTo(controls.target);
      const fog = scene.fog as THREE.Fog;
      fog.near = (dist + radius * 0.8) * (1 - fogFactor * 0.45);
      fog.far = (dist + radius * 4 + 30) * (1 - fogFactor * 0.3);
      worldEventsLayer.update(dt, time, Date.now() + cb.current.clockOffsetMs);
      renderer.render(scene, camera);
      renderOverlays(time);
      // After drawing: the camera's matrices are this frame's now.
      const map = isRevealed && !immersive();
      if (aloft()) {
        // From a balloon: bubbles over the spot on the ground you're looking at, as many as on
        // a map zoomed in fairly close.
        camera.getWorldDirection(lookDir);
        bubbleTarget.copy(camera.position).addScaledVector(lookDir, lookDir.y < -0.05 ? Math.min(70, camera.position.y / -lookDir.y) : 40);
        bubbleTarget.y = 0;
        bubbleZoom = 22;
      } else {
        bubbleTarget.copy(controls.target);
        bubbleZoom = null;
      }
      bubbles.update(dt, now, map || (isRevealed && aloft()), map && !!cb.current.onEventInfo);
    };
    loop();

    // Coming back to the game: stop drawing while the page is hidden (saves battery and keeps
    // the phone from throttling us), and pick straight up again when it's visible. If the phone
    // dropped the 3D canvas while we were away, three.js restores it; we just restart drawing.
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === "visible") {
        clock.getDelta();
        loop();
      }
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frame);
    };
    const onRestored = () => {
      clock.getDelta();
      loop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    renderer.domElement.addEventListener("webglcontextlost", onLost);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored);

    const setWorldEvents = (list: WorldEvent[] | undefined) => worldEventsLayer.set(list);
    const focusEventAt = (id: number) => {
      if (immersive()) return;
      const p = worldEventsLayer.locate(id);
      if (!p) return;
      focus = null;
      eventFly = p;
      worldEventsLayer.ping(id);
    };
    function setHouses(list: TownHouse[] | undefined) {
      const next = list ?? [];
      const key = next.map((h) => `${h.slot}:${h.ownerId}:${h.style}:${h.wall}:${h.roof}:${h.interior}:${h.name}`).join("|");
      if (key === homesKey) return;
      homesKey = key;
      homesNow = next;
      if (currentSeed >= 0 && builtCount > 0) build(currentSeed, builtCount);
    }

    api.current = { build, setMarkers, playEvents, setBalloon, setAds, setRevealed, setRoomCounts, setRide, setSteer, setSeats, setPlace, setSpot, setCaughtFaces, setWorldEvents, setHouses, setDance, setFriendPins, setRoomPeople, openRoom: openRoomById, focusEvent: focusEventAt, setGhosts, flyToTile };

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      // Send off any ad views not reported yet.
      flushViews(performance.now());
      for (const entry of adCache.values()) entry.tex?.dispose();
      adCache.clear();
      birds.dispose();
      people.dispose();
      trains.dispose();
      traffic.dispose();
      boats.dispose();
      plumes.dispose();
      sites.dispose();
      buildingSite.dispose();
      worldEventsLayer.dispose();
      bubbles.dispose();
      for (const p of pills) p.sprite.material.dispose();
      disposePills();
      for (const st of [leaving, view?.kind === "place" ? view.stage : null]) if (st) disposeStage(st);
      for (const vv of [leavingVehicle, view?.kind === "vehicle" ? view : null]) if (vv) disposeVehicle(vv);
      for (const p of parks) p.dispose();
      for (const g of games) g.dispose();
      disposeVehicleCaches();
      basket.dispose();
      look.dispose();
      disposeKitCaches();
      disposeBlobTexture();

      honkTex.dispose();
      for (const t of boardTextures) t.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
        }
      });
      disposeWater(waterGroup);
      countryside.dispose();
      country?.dispose();
      for (const p of planes) (p.userData.jet as ReturnType<typeof createAirliner>).dispose();
      pinLayer.remove();
      clearGhosts();
      ghostLayer.remove();
      for (const g of hillTreeShapes.values()) g.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.build(seed, tileCount);
  }, [seed, tileCount]);

  useEffect(() => {
    api.current?.setHouses(houses);
  }, [houses]);

  useEffect(() => {
    api.current?.setMarkers(markers);
  }, [markers]);

  useEffect(() => {
    api.current?.playEvents(events);
  }, [events, tileCount]);

  useEffect(() => {
    api.current?.setBalloon(coinBalloon);
  }, [coinBalloon]);

  useEffect(() => {
    api.current?.setAds(ads ?? []);
  }, [ads]);

  useEffect(() => {
    api.current?.setRevealed(revealed);
  }, [revealed]);

  useEffect(() => {
    api.current?.setRoomCounts(roomCounts ?? {});
  }, [roomCounts]);

  const rideKey = ride === null || ride === undefined ? "" : typeof ride === "number" ? `balloon:${ride}` : `${ride.kind}:${ride.index}`;
  useEffect(() => {
    const [kind, index] = rideKey ? rideKey.split(":") : [];
    api.current?.setRide(kind ? { kind: kind as RideKind, index: Number(index) } : null);
  }, [rideKey]);

  const steerKey = steer ? `${steer.dir}|${steer.at}` : "";
  useEffect(() => {
    if (steerKey) api.current?.setSteer(steerKey.split("|")[0] as TurnDir);
  }, [steerKey]);

  const placeKey = place ? `${place.building}|${place.level}` : "";
  useEffect(() => {
    const [building, level] = placeKey ? placeKey.split("|") : [];
    api.current?.setPlace(building ? { building, level } : null);
  }, [placeKey]);

  useEffect(() => {
    api.current?.setSpot(spot);
  }, [spot]);

  useEffect(() => {
    api.current?.setSeats(seats, mySeat ?? null);
  }, [seats, mySeat]);

  useEffect(() => {
    api.current?.setCaughtFaces(caughtFaces);
  }, [caughtFaces, tileCount]);

  useEffect(() => {
    api.current?.setWorldEvents(worldEvents);
  }, [worldEvents]);

  useEffect(() => {
    if (focusEvent) api.current?.focusEvent(focusEvent.id);
  }, [focusEvent]);

  const ghostsKey = (ghosts ?? []).map((g) => `${g.id}@${g.tile}|${g.status}|${g.name}|${g.mine ? 1 : 0}|${JSON.stringify(g.avatar)}`).join(";");
  const ghostsRef = useRef(ghosts);
  useEffect(() => {
    ghostsRef.current = ghosts;
  });
  useEffect(() => {
    api.current?.setGhosts(ghostsRef.current ?? []);
  }, [ghostsKey, tileCount, seed]);
  useEffect(() => {
    if (flyTo) api.current?.flyToTile(flyTo.tile);
  }, [flyTo]);

  const friendsKey = (friendsAt ?? []).map((f) => `${f.id}@${f.room}|${f.name}|${JSON.stringify(f.avatar)}`).join(";");
  const friendsRef = useRef(friendsAt);
  useEffect(() => {
    friendsRef.current = friendsAt;
  });
  useEffect(() => {
    api.current?.setFriendPins(friendsRef.current ?? []);
  }, [friendsKey, tileCount, seed]);

  const peopleKey = (roomPeople ?? []).map((p) => `${p.id}|${p.name}|${JSON.stringify(p.avatar)}`).join(";");
  const peopleRef = useRef(roomPeople);
  useEffect(() => {
    peopleRef.current = roomPeople;
  });
  useEffect(() => {
    api.current?.setRoomPeople(peopleRef.current ?? []);
  }, [peopleKey]);

  const openKey = openRoom ? `${openRoom.id}|${openRoom.at}` : "";
  useEffect(() => {
    if (openKey) api.current?.openRoom(openKey.split("|")[0]);
  }, [openKey]);

  // Dancing: only redo things when who's dancing (or how) actually changes.
  const danceRef = useRef({ dance, dancers });
  useEffect(() => {
    danceRef.current = { dance, dancers };
  });
  const danceKey = dance ? `${dance.id}|${dance.move}|${dance.with ?? ""}` : "";
  const dancersKey = (dancers ?? []).map((d) => `${d.id}|${d.move}|${d.with ?? ""}|${d.name}|${JSON.stringify(d.avatar)}`).join(";");
  useEffect(() => {
    api.current?.setDance(danceRef.current.dance ?? null, danceRef.current.dancers ?? []);
  }, [danceKey, dancersKey]);

  return <div ref={host} className="absolute inset-0" />;
}
