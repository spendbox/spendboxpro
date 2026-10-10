"use client";

import { useRef } from "react";
import { playSfx } from "../../sound";
import { bomb, circle, clay, duck, FRUITS, fruit, line, mole, popText, rrect, runner, sky, target, text } from "../draw";
import { makeRng, pick } from "../rng";
import { Stage, useFinish } from "../stage";
import type { EngineProps } from "../types";

// Things to hit. Themes:
//   range      - Shooting Range: targets pop up behind cover; bullseyes score more; don't hit hostages.
//   clay       - Clay Pigeon: clays arc across the sky; 25 shells.
//   ducks      - Duck Hunt: ducks fly out of the reeds in waves; three shots a duck.
//   pads       - Boxing Pads: pads light up on a 3×3 grid; hit them fast, never the red ones.
//   moles      - Whack-a-Mole: moles (and gold moles, and bombs) pop out of holes.
//   fruit      - Fruit Slice: swipe through flying fruit, never bombs; 3 dropped fruit and you're out.
//   pickpocket - Pickpocket: tap people only while their wallet glints; 3 wrong taps and you're caught.

const W = 360;
const H = 480;

type Thing = {
  id: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  hit: number;
  /** Extra per-thing number (fruit type, pad index, glint time...). */
  k: number;
  shots?: number;
};

export default function Targets({ cfg, seed, onEnd }: EngineProps) {
  const finish = useFinish(onEnd);
  const theme = String(cfg.theme ?? "range");
  const seconds = Number(cfg.seconds ?? 40);
  const g = useRef<{
    r: ReturnType<typeof makeRng>;
    t: number;
    score: number;
    combo: number;
    things: Thing[];
    next: number;
    id: number;
    lives: number;
    shells: number;
    pops: { text: string; x: number; y: number; at: number; colour: string }[];
    trail: { x: number; y: number; at: number }[];
    over: boolean;
    flash: number;
    wave: number;
  } | null>(null);
  /** The game's state, made the first time it's needed (never while drawing the page). */
  function get() {
    if (!g.current) g.current = { r: makeRng(seed), t: 0, score: 0, combo: 0, things: [], next: 0.6, id: 1, lives: 3, shells: 25, pops: [], trail: [], over: false, flash: 0, wave: 0 };
    return g.current!;
  }

  const holes = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => ({ x: 70 + col * 110, y: 170 + row * 110 })));

  function end() {
    const s = get();
    if (s.over) return;
    s.over = true;
    window.setTimeout(() => finish(Math.max(0, Math.round(s.score))), 700);
  }
  const pop = (t: string, x: number, y: number, colour = "#ffd43b") => get().pops.push({ text: t, x, y, at: get().t, colour });

  function spawn() {
    const s = get();
    const r = s.r;
    const prog = Math.min(1, s.t / seconds);
    const add = (t: Omit<Thing, "id" | "born" | "hit">) => s.things.push({ ...t, id: s.id++, born: s.t, hit: 0 });
    if (theme === "range") {
      const lane = Math.floor(r() * 3);
      add({ kind: r() < 0.18 ? "hostage" : "target", x: 50 + r() * 260, y: 150 + lane * 110, vx: (r() - 0.5) * 60 * prog, vy: 0, life: 1.8 - prog * 0.8, k: lane });
      s.next = s.t + 0.55 - prog * 0.25;
    } else if (theme === "clay") {
      const left = r() < 0.5;
      add({ kind: "clay", x: left ? -20 : W + 20, y: 360 + r() * 60, vx: (left ? 1 : -1) * (150 + r() * 90 + prog * 80), vy: -(330 + r() * 120), life: 4, k: 0 });
      s.next = s.t + (r() < 0.3 ? 0.4 : 1.6 - prog * 0.6);
    } else if (theme === "ducks") {
      const n = s.things.filter((t) => t.kind === "duck" && !t.hit).length;
      if (n < 2) {
        s.wave++;
        const sp = 70 + s.wave * 9;
        add({ kind: "duck", x: 60 + r() * 240, y: 400, vx: (r() < 0.5 ? -1 : 1) * sp, vy: -sp * (0.6 + r() * 0.5), life: 7, k: 0, shots: 3 });
      }
      s.next = s.t + 0.9;
    } else if (theme === "pads") {
      const free = holes.map((_, i) => i).filter((i) => !s.things.some((t) => t.k === i && !t.hit));
      if (free.length) add({ kind: r() < 0.16 + prog * 0.08 ? "red" : "pad", x: 0, y: 0, vx: 0, vy: 0, life: 1.0 - prog * 0.45, k: pick(r, free) });
      s.next = s.t + 0.45 - prog * 0.2;
    } else if (theme === "moles") {
      const free = holes.map((_, i) => i).filter((i) => !s.things.some((t) => t.k === i));
      if (free.length) {
        const roll = r();
        add({ kind: roll < 0.15 + prog * 0.08 ? "bomb" : roll > 0.92 ? "gold" : "mole", x: 0, y: 0, vx: 0, vy: 0, life: 1.3 - prog * 0.55, k: pick(r, free) });
      }
      s.next = s.t + 0.5 - prog * 0.25;
    } else if (theme === "fruit") {
      const n = 1 + (r() < 0.3 + prog * 0.3 ? 1 : 0) + (r() < prog * 0.3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const isBomb = r() < 0.12 + prog * 0.08;
        add({ kind: isBomb ? "bomb" : "fruit", x: 60 + r() * 240, y: H + 30, vx: (r() - 0.5) * 120, vy: -(520 + r() * 120), life: 6, k: Math.floor(r() * FRUITS.length) });
      }
      s.next = s.t + 1.1 - prog * 0.4;
    } else if (theme === "pickpocket") {
      const lane = Math.floor(r() * 3);
      const left = r() < 0.5;
      add({ kind: "person", x: left ? -30 : W + 30, y: 170 + lane * 110, vx: (left ? 1 : -1) * (45 + r() * 40 + prog * 40), vy: 0, life: 12, k: s.t + 0.8 + r() * 2.5 });
      s.next = s.t + 0.7 - prog * 0.25;
    }
  }

  function hitAt(x: number, y: number, swipe = false) {
    const s = get();
    if (s.over) return;
    let any = false;
    if (theme === "clay" || theme === "ducks" || theme === "range") s.flash = 0.08;
    if (theme === "clay") {
      if (s.shells <= 0) return;
      s.shells--;
    }
    for (const t of s.things) {
      if (t.hit) continue;
      if (theme === "pads" || theme === "moles") {
        const h = holes[t.k];
        if (Math.hypot(x - h.x, y - h.y + (theme === "moles" ? 30 : 0)) > 46) continue;
        t.hit = s.t;
        any = true;
        if (t.kind === "red" || t.kind === "bomb") {
          s.score = Math.max(0, s.score - 5);
          s.combo = 0;
          pop("-5", h.x, h.y, "#ff8787");
          playSfx("explode");
        } else {
          s.combo++;
          const add = t.kind === "gold" ? 3 : theme === "pads" ? 1 + Math.floor(s.combo / 10) : 1;
          s.score += add;
          pop(`+${add}`, h.x, h.y - 20);
          playSfx(t.kind === "gold" ? "found" : "pop");
        }
        break;
      }
      if (theme === "range") {
        const d = Math.hypot(x - t.x, y - (t.y - 34));
        if (d > 26) continue;
        t.hit = s.t;
        any = true;
        if (t.kind === "hostage") {
          s.score = Math.max(0, s.score - 20);
          pop("Hostage! -20", t.x, t.y - 50, "#ff8787");
          playSfx("denied");
        } else {
          const pts = d < 6 ? 25 : d < 13 ? 15 : 10;
          s.score += pts;
          pop(d < 6 ? `Bullseye +${pts}` : `+${pts}`, t.x, t.y - 60);
          playSfx("pop");
        }
        break;
      }
      if (theme === "clay") {
        if (Math.hypot(x - t.x, y - t.y) > 30) continue;
        t.hit = s.t;
        any = true;
        s.score += 1;
        pop("+1", t.x, t.y);
        playSfx("pop");
        break;
      }
      if (theme === "ducks") {
        if (Math.hypot(x - t.x, y - t.y) > 30) continue;
        t.hit = s.t;
        any = true;
        s.score += 1;
        pop("+1", t.x, t.y);
        playSfx("pop");
        break;
      }
      if (theme === "fruit" && swipe) {
        if (Math.hypot(x - t.x, y - t.y) > 30) continue;
        t.hit = s.t;
        any = true;
        if (t.kind === "bomb") {
          pop("BOOM", t.x, t.y, "#ff8787");
          playSfx("explode");
          end();
        } else {
          s.combo++;
          s.score += 1;
          playSfx("whoosh");
        }
      }
      if (theme === "pickpocket") {
        if (Math.abs(x - t.x) > 22 || Math.abs(y - (t.y - 30)) > 45) continue;
        t.hit = s.t;
        any = true;
        if (Math.abs(s.t - t.k) < 0.55) {
          s.score += 1;
          pop("+1 wallet", t.x, t.y - 70, "#69db7c");
          playSfx("found");
        } else {
          s.lives--;
          pop("Hey!", t.x, t.y - 70, "#ff8787");
          playSfx("denied");
          if (s.lives <= 0) end();
        }
        break;
      }
    }
    if (theme === "ducks" && !any) {
      // Each miss uses up one of the nearest duck's shots.
      const d = s.things.find((t) => t.kind === "duck" && !t.hit);
      if (d && d.shots !== undefined) {
        d.shots--;
        if (d.shots <= 0) {
          d.hit = -1;
          d.vy = -260;
          pop("Flew away", d.x, d.y, "#ff8787");
        }
      }
    }
    if (!any && (theme === "pads" || theme === "moles")) s.combo = 0;
  }

  const swiping = useRef(false);
  function frame(c: CanvasRenderingContext2D, dt: number) {
    const s = get();
    s.t += dt;
    if (!s.over && s.t >= seconds) end();
    if (!s.over && s.t >= s.next) spawn();
    if (theme === "clay" && s.shells <= 0 && !s.things.some((t) => !t.hit && t.kind === "clay") && !s.over) end();

    // Background.
    if (theme === "range") {
      c.fillStyle = "#3d3427";
      c.fillRect(0, 0, W, H);
      for (let k = 0; k < 3; k++) rrect(c, 0, 168 + k * 110, W, 26, 0, "#5c4a37");
    } else if (theme === "clay" || theme === "ducks") {
      sky(c, W, H, theme === "ducks" ? "#4dabf7" : "#91a7ff", "#e7f5ff");
      rrect(c, 0, 400, W, 80, 0, "#2f9e44");
      if (theme === "ducks") for (let k = 0; k < 18; k++) line(c, k * 21, 410, k * 21 + 5, 360 + (k % 3) * 12, "#2b8a3e", 4);
    } else if (theme === "pads" || theme === "moles") {
      c.fillStyle = theme === "pads" ? "#25262b" : "#5c940d";
      c.fillRect(0, 0, W, H);
      for (const h of holes) {
        if (theme === "pads") circle(c, h.x, h.y, 42, "#373a40", "#495057", 3);
        else circle(c, h.x, h.y + 6, 44, "#4a7d0b");
      }
    } else if (theme === "fruit") {
      c.fillStyle = "#3b2a1e";
      c.fillRect(0, 0, W, H);
      for (let k = 0; k < 8; k++) line(c, 0, k * 64, W, k * 64 + 20, "rgba(255,255,255,.04)", 22);
    } else if (theme === "pickpocket") {
      c.fillStyle = "#868e96";
      c.fillRect(0, 0, W, H);
      for (let k = 0; k < 3; k++) rrect(c, 0, 175 + k * 110, W, 10, 0, "#adb5bd");
    }

    // Things.
    s.things = s.things.filter((t) => {
      const age = s.t - t.born;
      if (theme === "clay" || theme === "fruit") {
        if (!t.hit || theme === "fruit") {
          t.vy += (theme === "fruit" ? 520 : 300) * dt;
          t.x += t.vx * dt;
          t.y += t.vy * dt;
        }
        if (theme === "fruit" && !t.hit && t.kind === "fruit" && t.vy > 0 && t.y > H + 40) {
          s.lives--;
          pop("Dropped!", Math.min(W - 40, Math.max(40, t.x)), H - 40, "#ff8787");
          if (s.lives <= 0) end();
          return false;
        }
        if (t.y > H + 60 || (t.hit && s.t - t.hit > 0.6 && theme === "clay")) return false;
      } else if (theme === "ducks") {
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        if (!t.hit) {
          if (t.x < 30 || t.x > W - 30) t.vx = -t.vx;
          if (t.y < 40) t.vy = Math.abs(t.vy);
          if (t.y > 380) t.vy = -Math.abs(t.vy);
          if (age > t.life) {
            t.hit = -1;
            t.vy = -260;
          }
        } else if (t.hit > 0) t.vy = 260;
        if (t.y < -40 || t.y > H + 40) return false;
      } else if (theme === "range" || theme === "pickpocket") {
        t.x += t.vx * dt;
        if (theme === "pickpocket" && (t.x < -50 || t.x > W + 50)) return false;
        if (theme === "range" && (age > t.life || (t.hit && s.t - t.hit > 0.3))) return false;
      } else if (theme === "pads" || theme === "moles") {
        if (t.hit && s.t - t.hit > 0.25) return false;
        if (!t.hit && age > t.life) {
          if (theme === "pads" && t.kind === "pad") s.combo = 0;
          return false;
        }
      }
      return true;
    });

    for (const t of s.things) {
      const age = s.t - t.born;
      if (theme === "range") {
        const rise = Math.min(1, age / 0.15, Math.max(0, (t.life - age) / 0.15));
        c.save();
        c.beginPath();
        c.rect(0, 0, W, t.y + 2);
        c.clip();
        const y = t.y + 60 * (1 - rise) - 34;
        if (t.kind === "hostage") {
          runner(c, t.x, y + 34, 50, "#fab005", 0, "stand");
          text(c, "Don't shoot", t.x, y - 26, 11, "#fff");
        } else {
          line(c, t.x, y, t.x, y + 36, "#5c4a37", 4);
          target(c, t.x, y, 24);
        }
        c.restore();
      } else if (theme === "clay") {
        clay(c, t.x, t.y, 34, t.hit ? (s.t - t.hit) * 2 : 0);
      } else if (theme === "ducks") {
        duck(c, t.x, t.y, 52, s.t, t.vx >= 0 ? 1 : -1, t.hit > 0);
      } else if (theme === "pads") {
        const h = holes[t.k];
        const glow = t.hit ? 1 - (s.t - t.hit) * 4 : Math.min(1, age * 8);
        circle(c, h.x, h.y, 40 * Math.max(0.2, glow), t.kind === "red" ? "#e03131" : "#fab005");
        if (!t.hit) {
          c.beginPath();
          c.arc(h.x, h.y, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - age / t.life));
          c.strokeStyle = "rgba(255,255,255,.6)";
          c.lineWidth = 3;
          c.stroke();
        }
      } else if (theme === "moles") {
        const h = holes[t.k];
        const up = t.hit ? Math.max(0, 1 - (s.t - t.hit) * 5) : Math.min(1, age / 0.12, (t.life - age) / 0.12);
        mole(c, h.x, h.y, 70, Math.max(0, up), t.kind as "mole" | "gold" | "bomb", !!t.hit);
      } else if (theme === "fruit") {
        if (t.kind === "bomb") {
          if (!t.hit) bomb(c, t.x, t.y, 20, s.t);
        } else if (t.hit) {
          const a = s.t - t.hit;
          fruit(c, t.x - a * 60, t.y, 22, FRUITS[t.k], a * 3, -1);
          fruit(c, t.x + a * 60, t.y, 22, FRUITS[t.k], -a * 3, 1);
        } else fruit(c, t.x, t.y, 22, FRUITS[t.k], s.t * 2);
      } else if (theme === "pickpocket") {
        runner(c, t.x, t.y, 70, ["#e64980", "#1c7ed6", "#2f9e44", "#f08c00", "#7048e8"][t.id % 5], s.t);
        const glint = Math.abs(s.t - t.k) < 0.55 && !t.hit;
        rrect(c, t.x + 6, t.y - 34, 12, 9, 2, glint ? "#ffd43b" : "#5c3d22");
        if (glint) circle(c, t.x + 12, t.y - 30, 12 + 4 * Math.sin(s.t * 20), "rgba(255,212,59,.35)");
      }
    }

    // The swipe trail.
    s.trail = s.trail.filter((p) => s.t - p.at < 0.15);
    for (let i = 1; i < s.trail.length; i++) line(c, s.trail[i - 1].x, s.trail[i - 1].y, s.trail[i].x, s.trail[i].y, "rgba(255,255,255,.85)", 6 * (1 - (s.t - s.trail[i].at) / 0.15));
    if (s.flash > 0) {
      s.flash -= dt;
      c.fillStyle = "rgba(255,255,255,.15)";
      c.fillRect(0, 0, W, H);
    }
    s.pops = s.pops.filter((p) => s.t - p.at < 1);
    for (const p of s.pops) popText(c, p.text, p.x, p.y, s.t - p.at, p.colour);

    // The bar along the top.
    rrect(c, 0, 0, W, 34, 0, "rgba(0,0,0,.45)");
    text(c, `${Math.round(s.score)}`, 26, 17, 18, "#ffd43b");
    text(c, `${Math.max(0, Math.ceil(seconds - s.t))}s`, W - 26, 17, 16, "#fff");
    if (theme === "clay") text(c, `Shells ${s.shells}`, W / 2, 17, 14, "#fff");
    if (theme === "fruit" || theme === "pickpocket") for (let k = 0; k < 3; k++) circle(c, W / 2 - 20 + k * 20, 17, 6, k < s.lives ? "#ff8787" : "rgba(255,255,255,.25)");
    if ((theme === "pads" || theme === "moles") && s.combo >= 5) text(c, `x${s.combo}`, W / 2, 17, 15, "#69db7c");
  }

  return (
    <Stage
      w={W}
      h={H}
      handlers={{
        frame,
        down: (p) => {
          swiping.current = true;
          get().trail.push({ x: p.x, y: p.y, at: get().t });
          if (theme !== "fruit") hitAt(p.x, p.y);
          else hitAt(p.x, p.y, true);
        },
        move: (p) => {
          if (!swiping.current || theme !== "fruit") return;
          get().trail.push({ x: p.x, y: p.y, at: get().t });
          hitAt(p.x, p.y, true);
        },
        up: () => {
          swiping.current = false;
          const s = get();
          if (theme === "fruit" && s.combo >= 3) {
            s.score += s.combo;
            pop(`Combo +${s.combo}`, W / 2, 80, "#69db7c");
          }
          if (theme === "fruit") s.combo = 0;
        },
      }}
    />
  );
}
