"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, ChevronsUp } from "lucide-react";
import { playSfx } from "../../sound";
import { boatTop, carTop, circle, coin, line, moneyBag, popText, rrect, runner, text } from "../draw";
import { makeRng } from "../rng";
import { Pad, Pads, Stage, useFinish, useKeys } from "../stage";
import type { EngineProps } from "../types";

// Three lanes, the road (or water) racing towards you: change lanes to dodge and to collect.
// Three crashes and it's over.
//   getaway  - cars to dodge, cash bags (+25 m)
//   chase    - roadblocks and spikes; boost pads; the police close in when you hit things
//   bike     - potholes and parked cars; water bottles for a burst of speed
//   jetski   - buoys and rocks; ramps make you jump
//   runner   - barriers to jump (swipe up), cones to dodge, mint coins (+10 m)
//   taxi     - passengers to pick up (score: fares)
//   delivery - parcels to pick up (carry 3), glowing doors to deliver to (score: parcels)

const W = 360;
const H = 480;
const LANES = [80, 180, 280];
const ME_Y = 400;

type Obj = { id: number; lane: number; y: number; kind: string; speed: number; got: boolean };

export default function Lanes({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const theme = String(cfg.theme ?? "getaway");
  const seconds = Number(cfg.seconds ?? 45);
  const counting = theme === "taxi" || theme === "delivery";
  const g = useRef<{
    r: ReturnType<typeof makeRng>;
    t: number;
    lane: number;
    x: number;
    dist: number;
    bonus: number;
    speed: number;
    boost: number;
    air: number;
    hurt: number;
    lives: number;
    objs: Obj[];
    next: number;
    id: number;
    count: number;
    carry: number;
    police: number;
    pops: { text: string; x: number; y: number; at: number; colour: string }[];
    over: boolean;
    scroll: number;
    swipe: { x: number; y: number } | null;
  } | null>(null);
  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) g.current = { r: makeRng(seed), t: 0, lane: 1, x: LANES[1], dist: 0, bonus: 0, speed: 170, boost: 0, air: 0, hurt: 0, lives: 3, objs: [], next: 0.8, id: 1, count: 0, carry: 0, police: 0, pops: [], over: false, scroll: 0, swipe: null };
    return g.current!;
  }

  const score = () => {
    const s = get();
    return counting ? s.count : Math.round(s.dist / 10 + s.bonus);
  };
  function end() {
    const s = get();
    if (s.over) return;
    s.over = true;
    window.setTimeout(() => finish(score()), 900);
  }
  const pop = (t: string, x: number, y: number, colour = "#ffd43b") => get().pops.push({ text: t, x, y, at: get().t, colour });

  function steer(d: number) {
    const s = get();
    if (s.over) return;
    s.lane = Math.max(0, Math.min(2, s.lane + d));
    playSfx("move");
  }
  function jump() {
    const s = get();
    if (s.over || s.air > 0) return;
    if (theme === "runner") {
      s.air = 0.7;
      playSfx("whoosh");
    }
  }
  useKeys((k) => {
    if (k === "ArrowLeft" || k === "a") steer(-1);
    if (k === "ArrowRight" || k === "d") steer(1);
    if (k === "ArrowUp" || k === "w" || k === " ") jump();
  });

  const BAD: Record<string, string[]> = {
    getaway: ["car", "car", "truck"],
    chase: ["block", "spikes", "car"],
    bike: ["pothole", "parked", "pothole"],
    jetski: ["buoy", "rock", "buoy"],
    runner: ["barrier", "cone", "barrier"],
    taxi: ["car", "car", "bus"],
    delivery: ["walker", "pothole", "walker"],
  };
  const GOOD: Record<string, string> = { getaway: "cash", chase: "boostpad", bike: "bottle", jetski: "ramp", runner: "coin", taxi: "fare", delivery: "parcel" };

  function spawn() {
    const s = get();
    const r = s.r;
    const prog = Math.min(1, s.t / seconds);
    const lanes = [0, 1, 2].sort(() => r() - 0.5);
    const nBad = r() < 0.25 + prog * 0.35 ? 2 : 1;
    for (let i = 0; i < nBad; i++) {
      const kind = BAD[theme][Math.floor(r() * 3)];
      const moving = kind === "car" || kind === "truck" || kind === "bus" || kind === "walker";
      s.objs.push({ id: s.id++, lane: lanes[i], y: -60, kind, speed: moving ? 60 + r() * 40 : 0, got: false });
    }
    if (r() < 0.55) s.objs.push({ id: s.id++, lane: lanes[2], y: -60 - r() * 60, kind: GOOD[theme], speed: 0, got: false });
    if (theme === "delivery" && s.carry > 0 && r() < 0.5) s.objs.push({ id: s.id++, lane: lanes[nBad < 2 ? 1 : 2], y: -140, kind: "door", speed: 0, got: false });
    s.next = s.t + Math.max(0.55, 1.15 - prog * 0.5) * (220 / s.speed);
  }

  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    if (!s.over) {
      s.t += dt;
      if (s.t >= seconds) end();
      s.speed = 170 + Math.min(1, s.t / seconds) * 190 + (s.boost > 0 ? 160 : 0);
      if (s.boost > 0) s.boost -= dt;
      if (s.air > 0) s.air -= dt;
      if (s.hurt > 0) s.hurt -= dt;
      s.dist += s.speed * dt;
      s.scroll = (s.scroll + s.speed * dt) % 80;
      if (s.t >= s.next) spawn();
      if (theme === "chase") s.police = Math.max(0, s.police - dt * 0.05);
    }
    s.x += (LANES[s.lane] - s.x) * Math.min(1, dt * 14);

    // The road / water.
    const water = theme === "jetski";
    c.fillStyle = water ? "#1971c2" : theme === "runner" || theme === "delivery" ? "#868e96" : "#343a40";
    c.fillRect(0, 0, W, H);
    if (water) {
      for (let k = 0; k < 8; k++) line(c, 20 + ((k * 53) % 320), ((k * 97 + s.scroll * 1.5) % (H + 40)) - 20, 50 + ((k * 53) % 320), ((k * 97 + s.scroll * 1.5) % (H + 40)) - 20, "rgba(255,255,255,.25)", 3);
    } else {
      rrect(c, 0, 0, 30, H, 0, theme === "runner" ? "#adb5bd" : "#2f9e44");
      rrect(c, W - 30, 0, 30, H, 0, theme === "runner" ? "#adb5bd" : "#2f9e44");
      for (const lx of [130, 230]) for (let y = -80 + s.scroll; y < H; y += 80) line(c, lx, y, lx, y + 40, "#f8f9fa", 4);
    }

    // Things on the road.
    s.objs = s.objs.filter((o) => {
      if (!s.over) o.y += (s.speed - o.speed) * dt;
      if (o.y > H + 80) return false;
      const x = LANES[o.lane];
      const near = Math.abs(o.y - ME_Y) < 40 && Math.abs(x - s.x) < 40 && !o.got;
      if (near && !s.over) {
        const good = o.kind === GOOD[theme] || o.kind === "door";
        if (good) {
          o.got = true;
          if (o.kind === "cash") {
            s.bonus += 25;
            pop("+25 m", x, ME_Y - 40);
          } else if (o.kind === "coin") {
            s.bonus += 10;
            pop("+10", x, ME_Y - 40);
          } else if (o.kind === "boostpad" || o.kind === "bottle") {
            s.boost = 1.5;
            pop("Boost!", x, ME_Y - 40, "#69db7c");
          } else if (o.kind === "ramp") {
            s.air = 0.9;
            s.bonus += 15;
            pop("Air! +15", x, ME_Y - 40, "#69db7c");
          } else if (o.kind === "fare") {
            s.count++;
            pop("+1 fare", x, ME_Y - 40, "#69db7c");
          } else if (o.kind === "parcel") {
            if (s.carry < 3) {
              s.carry++;
              pop("Parcel", x, ME_Y - 40);
            } else o.got = false;
          } else if (o.kind === "door") {
            if (s.carry > 0) {
              s.carry--;
              s.count++;
              pop("Delivered!", x, ME_Y - 40, "#69db7c");
            } else o.got = false;
          }
          if (o.got) playSfx("pop");
        } else if (s.hurt <= 0 && !(s.air > 0 && (o.kind === "barrier" || theme === "jetski"))) {
          o.got = true;
          s.lives--;
          s.hurt = 1.2;
          s.speed *= 0.5;
          if (counting) s.count = Math.max(0, s.count - 1);
          if (theme === "chase") s.police = Math.min(1, s.police + 0.4);
          pop(theme === "chase" ? "The police are closer!" : "Crash!", x, ME_Y - 50, "#ff8787");
          playSfx("explode");
          if (s.lives <= 0) end();
        }
      }
      if (o.got && (o.kind !== "door" && o.kind !== GOOD[theme])) {
        // Knocked aside.
        c.globalAlpha = 0.4;
      }
      if (!(o.got && (o.kind === GOOD[theme] || o.kind === "door"))) drawObj(c, o, x, s.t);
      c.globalAlpha = 1;
      return true;
    });

    // You.
    const up = s.air > 0 ? Math.sin((1 - s.air / (theme === "runner" ? 0.7 : 0.9)) * Math.PI) * 18 : 0;
    const blink = s.hurt > 0 && Math.floor(s.t * 12) % 2 === 0;
    if (!blink) {
      c.save();
      c.translate(0, -up);
      if (theme === "jetski") boatTop(c, s.x, ME_Y, 34, 60, "#fab005");
      else if (theme === "runner") runner(c, s.x, ME_Y + 20, 56, "#fab005", s.t * 1.4);
      else if (theme === "bike" || theme === "delivery") {
        rrect(c, s.x - 6, ME_Y - 30, 12, 60, 6, "#212529");
        circle(c, s.x, ME_Y - 4, 12, theme === "delivery" ? "#f08c00" : "#2f9e44");
        circle(c, s.x, ME_Y - 8, 7, "#f1c27d");
        if (theme === "delivery") for (let k = 0; k < s.carry; k++) rrect(c, s.x - 10, ME_Y + 8 + k * 9, 20, 8, 2, "#c0793d");
      } else carTop(c, s.x, ME_Y, 40, 70, theme === "taxi" ? "#fab005" : theme === "chase" ? "#495057" : "#e03131", theme === "taxi" ? "taxi" : "car");
      c.restore();
      if (s.boost > 0) for (let k = 0; k < 3; k++) line(c, s.x - 10 + k * 10, ME_Y + 40, s.x - 10 + k * 10, ME_Y + 60 + Math.abs(Math.sin(s.t * 40 + k)) * 10, "#ffd43b", 3);
    }
    if (theme === "chase") carTop(c, W / 2, H + 50 - s.police * 90, 40, 70, "#f8f9fa", "police");

    s.pops = s.pops.filter((p) => s.t - p.at < 1);
    for (const p of s.pops) popText(c, p.text, p.x, p.y, s.t - p.at, p.colour);
    rrect(c, 0, 0, W, 32, 0, "rgba(0,0,0,.5)");
    text(c, counting ? `${s.count} ${theme === "taxi" ? "fares" : "delivered"}` : `${score()} m`, 60, 16, 16, "#ffd43b");
    text(c, `${Math.max(0, Math.ceil(seconds - s.t))}s`, W - 26, 16, 15, "#fff");
    for (let k = 0; k < 3; k++) circle(c, W / 2 - 18 + k * 18, 16, 6, k < s.lives ? "#ff8787" : "rgba(255,255,255,.25)");
  }

  function drawObj(c: CanvasRenderingContext2D, o: Obj, x: number, t: number) {
    const y = o.y;
    switch (o.kind) {
      case "car":
        return carTop(c, x, y, 40, 70, ["#1c7ed6", "#2f9e44", "#ae3ec9", "#868e96", "#f8f9fa"][o.id % 5]);
      case "truck":
        return carTop(c, x, y, 46, 96, "#e8590c", "truck");
      case "bus":
        return carTop(c, x, y, 48, 110, "#c92a2a", "bus");
      case "parked":
        return carTop(c, x, y, 40, 70, "#495057");
      case "block":
        rrect(c, x - 40, y - 12, 80, 24, 4, "#f8f9fa");
        for (let k = 0; k < 4; k++) rrect(c, x - 40 + k * 20, y - 12, 10, 24, 0, "#e03131");
        return;
      case "spikes":
        rrect(c, x - 36, y - 6, 72, 12, 3, "#212529");
        for (let k = 0; k < 7; k++) line(c, x - 32 + k * 10, y, x - 28 + k * 10, y - 12, "#adb5bd", 2);
        return;
      case "pothole":
        c.beginPath();
        c.ellipse(x, y, 30, 18, 0, 0, Math.PI * 2);
        c.fillStyle = "#1a1a1a";
        c.fill();
        return;
      case "buoy":
        circle(c, x, y, 16, "#e8590c", "#fff", 3);
        return;
      case "rock":
        circle(c, x, y, 26, "#495057", "#343a40", 3);
        return;
      case "barrier":
        rrect(c, x - 40, y - 10, 80, 20, 4, "#fab005");
        for (let k = 0; k < 4; k++) line(c, x - 36 + k * 22, y - 10, x - 26 + k * 22, y + 10, "#212529", 4);
        text(c, "JUMP", x, y - 22, 10, "#fff");
        return;
      case "cone":
        c.beginPath();
        c.moveTo(x, y - 22);
        c.lineTo(x + 14, y + 14);
        c.lineTo(x - 14, y + 14);
        c.closePath();
        c.fillStyle = "#fd7e14";
        c.fill();
        return;
      case "walker":
        return runner(c, x, y + 20, 50, "#7048e8", t);
      case "cash":
        return moneyBag(c, x, y, 38);
      case "coin":
        return coin(c, x, y, 14, t);
      case "boostpad":
        rrect(c, x - 30, y - 20, 60, 40, 8, "#ffd43b");
        text(c, "»", x, y, 26, "#e8590c");
        return;
      case "bottle":
        rrect(c, x - 7, y - 18, 14, 36, 5, "#4dabf7");
        rrect(c, x - 4, y - 24, 8, 8, 2, "#1c7ed6");
        return;
      case "ramp":
        rrect(c, x - 34, y - 18, 68, 36, 6, "#fab005");
        text(c, "RAMP", x, y, 12, "#212529");
        return;
      case "fare":
        runner(c, x, y + 20, 50, "#e64980", 0, "stand");
        line(c, x, y - 18, x + 16, y - 34 + Math.sin(t * 10) * 4, "#f1c27d", 4);
        return;
      case "parcel":
        rrect(c, x - 16, y - 14, 32, 28, 4, "#c0793d", "#8d5524", 2);
        return;
      case "door":
        rrect(c, x - 22, y - 30, 44, 60, 6, "#69db7c");
        text(c, "Deliver", x, y, 11, "#212529");
        return;
    }
  }

  return (
    <div>
      <Stage
        w={W}
        h={H}
        handlers={{
          frame,
          down: (p) => {
            get().swipe = { x: p.x, y: p.y };
          },
          up: (p) => {
            const st = get().swipe;
            get().swipe = null;
            if (!st) return;
            const dx = p.x - st.x;
            const dy = p.y - st.y;
            if (Math.abs(dy) > 30 && dy < 0 && Math.abs(dy) > Math.abs(dx)) return jump();
            if (Math.abs(dx) > 25) return steer(dx > 0 ? 1 : -1);
            steer(p.x < get().x ? -1 : 1);
          },
        }}
      />
      <Pads>
        <Pad onDown={() => steer(-1)}>
          <ChevronLeft className="size-6" />
        </Pad>
        {theme === "runner" && (
          <Pad onDown={jump} className="bg-[#e8590c]">
            <ChevronsUp className="size-6" />
          </Pad>
        )}
        <Pad onDown={() => steer(1)}>
          <ChevronRight className="size-6" />
        </Pad>
      </Pads>
    </div>
  );
}
