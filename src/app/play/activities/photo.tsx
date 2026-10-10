"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowLeft, Camera, Megaphone, RefreshCw, Share2, SwitchCamera, User, Users } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { makePlan } from "@/lib/city/layout";
import { cn } from "@/lib/cn";
import { captureScene } from "../city/snapshot";
import { playSfx } from "../sound";
import { useActivityRoom } from "./hub";
import { questEvent } from "./quest-store";
import { BigButton, GameHeader, type GameProps } from "./ui";

// Photo spots: the photo booth and windows with a view.
//
// The booth makes a proper picture: a real selfie from your phone's camera (or your avatar),
// in front of a backdrop of the city (the live scene right where you are, or a painted skyline
// at sunset, at night, with fireworks or in golden-hour sun, with this town's landmarks), with
// "Greetings from <city>" across the top. Group photo puts everyone in the room in it too. The
// selfie never leaves your phone: it's drawn into the picture here, and only shared if you
// share it.
//
// A window makes a postcard of the view out of it (the real view, when the phone allows).

const FRAMES = [
  { name: "Gold", a: "#ffc53d", b: "#f76707" },
  { name: "Party", a: "#e64980", b: "#7048e8" },
  { name: "Ocean", a: "#2f6fd1", b: "#0c8599" },
  { name: "Jungle", a: "#12a37a", b: "#2b8a3e" },
];
type Backdrop = "live" | "sunset" | "night" | "fireworks" | "golden";
const BACKDROPS: { key: Backdrop; label: string }[] = [
  { key: "live", label: "Right here" },
  { key: "sunset", label: "Sunset skyline" },
  { key: "night", label: "Night lights" },
  { key: "fireworks", label: "Fireworks" },
  { key: "golden", label: "Golden hour" },
];

const W = 1080;
const H = 1350;
const BAND = 210;

type Person = { id: string; name: string; avatar: unknown };

// ---------------------------------------------------------------- pictures

/** A repeatable random number generator from a text key. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h >>> 0) % 100000) / 100000;
  };
}

/** Draw `img` to cover the box (like CSS object-fit: cover). */
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

/** A skyline across the bottom of the box: towers with lit windows and this town's landmarks. */
function skyline(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number, colour: string, windows: string | null, depth: number) {
  const rnd = rng(`${seed}:${depth}`);
  const base = y + h;
  ctx.fillStyle = colour;
  let bx = x - 20;
  let k = 0;
  while (bx < x + w + 20) {
    const bw = (40 + rnd() * 70) * (1 - depth * 0.15);
    const bh = h * (0.25 + rnd() * 0.55) * (1 - depth * 0.25);
    const kind = rnd();
    ctx.fillStyle = colour;
    if (depth === 0 && kind < 0.08 && k > 1) {
      // A dome with two minarets.
      ctx.beginPath();
      ctx.arc(bx + bw / 2, base - bh * 0.55, bw * 0.42, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(bx + bw * 0.08, base - bh * 0.55, bw * 0.84, bh * 0.55);
      for (const mx of [bx - 6, bx + bw]) {
        ctx.fillRect(mx, base - bh * 1.15, 8, bh * 1.15);
        ctx.beginPath();
        ctx.moveTo(mx - 2, base - bh * 1.15);
        ctx.lineTo(mx + 4, base - bh * 1.3);
        ctx.lineTo(mx + 10, base - bh * 1.15);
        ctx.fill();
      }
    } else if (depth === 0 && kind < 0.14 && k > 1) {
      // A cathedral: a steep roof and a spire.
      ctx.fillRect(bx, base - bh * 0.6, bw, bh * 0.6);
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.35, base - bh * 0.6);
      ctx.lineTo(bx + bw * 0.5, base - bh * 1.35);
      ctx.lineTo(bx + bw * 0.65, base - bh * 0.6);
      ctx.fill();
    } else if (depth === 1 && kind < 0.07) {
      // A Ferris wheel.
      ctx.strokeStyle = colour;
      ctx.lineWidth = 5;
      const r = bw * 0.6;
      ctx.beginPath();
      ctx.arc(bx + bw / 2, base - r - 10, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let s = 0; s < 8; s++) {
        ctx.beginPath();
        ctx.moveTo(bx + bw / 2, base - r - 10);
        ctx.lineTo(bx + bw / 2 + Math.cos(s * 0.785) * r, base - r - 10 + Math.sin(s * 0.785) * r);
        ctx.stroke();
      }
      ctx.fillRect(bx + bw / 2 - 4, base - r - 10, 8, r + 10);
    } else if (kind < 0.2) {
      // A needle tower.
      ctx.fillRect(bx + bw * 0.42, base - bh * 1.5, bw * 0.16, bh * 1.5);
      ctx.beginPath();
      ctx.ellipse(bx + bw / 2, base - bh * 1.2, bw * 0.4, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(bx + bw / 2 - 2, base - bh * 1.75, 4, bh * 0.3);
    } else {
      // A tower, sometimes stepped.
      ctx.fillRect(bx, base - bh, bw, bh);
      if (kind > 0.75) ctx.fillRect(bx + bw * 0.2, base - bh * 1.18, bw * 0.6, bh * 0.2);
      if (windows) {
        ctx.fillStyle = windows;
        for (let wy = base - bh + 14; wy < base - 10; wy += 22) {
          for (let wx = bx + 8; wx < bx + bw - 10; wx += 16) if (rnd() > 0.45) ctx.fillRect(wx, wy, 8, 11);
        }
      }
    }
    bx += bw + 4 + rnd() * 10;
    k++;
  }
}

/** One of the painted backdrops, filling the box. */
function paintBackdrop(ctx: CanvasRenderingContext2D, kind: Exclude<Backdrop, "live">, seed: string, x: number, y: number, w: number, h: number) {
  const rnd = rng(`${seed}:${kind}`);
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  const night = kind === "night" || kind === "fireworks";
  if (kind === "sunset") {
    sky.addColorStop(0, "#2b1b5a");
    sky.addColorStop(0.45, "#e2557a");
    sky.addColorStop(0.75, "#ff9e5e");
    sky.addColorStop(1, "#ffd27a");
  } else if (kind === "golden") {
    sky.addColorStop(0, "#4aa3f0");
    sky.addColorStop(0.65, "#bfe3ff");
    sky.addColorStop(1, "#ffe4a8");
  } else {
    sky.addColorStop(0, "#050b1f");
    sky.addColorStop(0.6, "#1b1f4b");
    sky.addColorStop(1, "#40285f");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  if (night) {
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
      const r = rnd() * 2.2;
      ctx.beginPath();
      ctx.arc(x + rnd() * w, y + rnd() * h * 0.6, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // The moon.
    const mx = x + w * 0.78;
    const my = y + h * 0.16;
    const glow = ctx.createRadialGradient(mx, my, 10, mx, my, 160);
    glow.addColorStop(0, "rgba(255,248,220,0.55)");
    glow.addColorStop(1, "rgba(255,248,220,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 160, my - 160, 320, 320);
    ctx.fillStyle = "#fff8dc";
    ctx.beginPath();
    ctx.arc(mx, my, 50, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // The sun, low (sunset) or high (golden hour), with a big glow.
    const sx = x + w * (kind === "sunset" ? 0.5 : 0.22);
    const sy = y + h * (kind === "sunset" ? 0.58 : 0.2);
    const glow = ctx.createRadialGradient(sx, sy, 20, sx, sy, kind === "sunset" ? 420 : 300);
    glow.addColorStop(0, "rgba(255,240,180,0.9)");
    glow.addColorStop(1, "rgba(255,240,180,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#fff4c2";
    ctx.beginPath();
    ctx.arc(sx, sy, kind === "sunset" ? 110 : 70, 0, Math.PI * 2);
    ctx.fill();
    // Soft clouds.
    for (let c = 0; c < 6; c++) {
      ctx.fillStyle = kind === "sunset" ? "rgba(255,190,200,0.35)" : "rgba(255,255,255,0.75)";
      const cx = x + rnd() * w;
      const cy = y + 80 + rnd() * h * 0.35;
      for (let b = 0; b < 5; b++) {
        ctx.beginPath();
        ctx.ellipse(cx + b * 40 - 80, cy + Math.sin(b) * 10, 70, 32, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (kind === "fireworks") {
    const colours = ["#ff6b6b", "#ffd43b", "#4dabf7", "#da77f2", "#69db7c", "#ff922b"];
    for (let f = 0; f < 6; f++) {
      const fx = x + w * (0.12 + rnd() * 0.76);
      const fy = y + h * (0.12 + rnd() * 0.3);
      const r = 80 + rnd() * 90;
      const col = colours[f % colours.length];
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      for (let s = 0; s < 22; s++) {
        const a = (s / 22) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(fx + Math.cos(a) * r * 0.25, fy + Math.sin(a) * r * 0.25);
        ctx.lineTo(fx + Math.cos(a) * r, fy + Math.sin(a) * r);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(fx + Math.cos(a) * r, fy + Math.sin(a) * r, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Three layers of skyline, the nearest the darkest, windows lit at night.
  const far = kind === "sunset" ? "#7a3e6e" : kind === "golden" ? "#9fb7cf" : "#262a52";
  const mid = kind === "sunset" ? "#4e2550" : kind === "golden" ? "#6f8aa6" : "#191c3a";
  const near = kind === "sunset" ? "#2a1433" : kind === "golden" ? "#3f5670" : "#0d0f24";
  const lit = night ? "#ffd27a" : kind === "sunset" ? "rgba(255,210,140,0.55)" : "rgba(255,255,255,0.5)";
  skyline(ctx, seed, x, y + h * 0.42, w, h * 0.4, far, null, 2);
  skyline(ctx, seed, x, y + h * 0.48, w, h * 0.42, mid, night ? "rgba(255,210,122,0.5)" : null, 1);
  skyline(ctx, seed, x, y + h * 0.55, w, h * 0.45, near, lit, 0);
  // Water at the bottom with a shimmer.
  const water = ctx.createLinearGradient(0, y + h * 0.94, 0, y + h);
  water.addColorStop(0, night ? "#141a3d" : kind === "sunset" ? "#a14d6b" : "#6aa6d6");
  water.addColorStop(1, night ? "#0a0d22" : kind === "sunset" ? "#5a2848" : "#3c7db4");
  ctx.fillStyle = water;
  ctx.fillRect(x, y + h * 0.94, w, h * 0.06);
  ctx.fillStyle = night ? "rgba(255,210,122,0.35)" : "rgba(255,255,255,0.35)";
  for (let s = 0; s < 40; s++) ctx.fillRect(x + rnd() * w, y + h * (0.95 + rnd() * 0.045), 20 + rnd() * 40, 2);
}

/** A face as an image (from a saved avatar). */
function avatarImage(p: Person): Promise<HTMLImageElement | null> {
  const svg = renderToStaticMarkup(<AvatarFace avatar={cleanAvatar(p.avatar, p.id)} size={400} />).replace(/^<svg(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** A round photo with a white ring and a soft shadow. */
function roundPhoto(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, cx: number, cy: number, r: number, ring: string) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, r + r * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#f1f3f5";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  cover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

type Compose = {
  backdrop: Backdrop;
  live: HTMLCanvasElement | null;
  seed: string;
  city: string;
  frame: number;
  people: { img: (CanvasImageSource & { width: number; height: number }) | null; name: string }[];
  title: string;
  line: string;
};

/** The whole picture, at any size (drawn at 1080 × 1350 and scaled). */
function compose(c: HTMLCanvasElement, o: Compose, scale = 1) {
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const f = FRAMES[o.frame];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, f.a);
  g.addColorStop(1, f.b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // The backdrop, inside a rounded window.
  const bx = 28;
  const by = 28;
  const bw = W - 56;
  const bh = H - BAND - 28;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 36);
  ctx.clip();
  if (o.backdrop === "live" && o.live) {
    cover(ctx, o.live, bx, by, bw, bh);
    const v = ctx.createRadialGradient(W / 2, by + bh / 2, bh * 0.35, W / 2, by + bh / 2, bh * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = v;
    ctx.fillRect(bx, by, bw, bh);
  } else paintBackdrop(ctx, o.backdrop === "live" ? "golden" : o.backdrop, o.seed, bx, by, bw, bh);
  // A darker band at the top behind the title.
  const top = ctx.createLinearGradient(0, by, 0, by + 300);
  top.addColorStop(0, "rgba(0,0,0,0.38)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(bx, by, bw, 300);
  // The people: the first one big in the middle, everyone else round them.
  const ps = o.people;
  if (ps.length) {
    const main = ps[0];
    const rMain = ps.length === 1 ? 250 : 200;
    const cy = by + bh - rMain - 50;
    const others = ps.slice(1, 7);
    others.forEach((p, k) => {
      const side = k % 2 === 0 ? 1 : -1;
      const step = Math.floor(k / 2);
      const r = 125 - step * 12;
      const x = W / 2 + side * (rMain + 30 + step * 190 + r * 0.6);
      const y = cy + 60 + step * 30;
      if (p.img) roundPhoto(ctx, p.img, x, y, r, "#ffffff");
    });
    if (main.img) roundPhoto(ctx, main.img, W / 2, cy, rMain, "#ffffff");
  }
  ctx.restore();
  // The title: "Greetings from" and the city, big, white with a coloured edge.
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 16;
  ctx.font = "italic 600 54px Georgia, 'Times New Roman', serif";
  ctx.fillText(o.title, W / 2, by + 100);
  const size = Math.max(70, Math.min(150, 1500 / Math.max(6, o.city.length)));
  ctx.font = `900 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = f.b;
  ctx.shadowBlur = 0;
  ctx.strokeText(o.city.toUpperCase(), W / 2, by + 100 + size * 0.95, bw - 60);
  ctx.fillText(o.city.toUpperCase(), W / 2, by + 100 + size * 0.95, bw - 60);
  // The band at the bottom: who's in it, where and when, and the game.
  ctx.shadowBlur = 0;
  const names = ps.map((p) => p.name);
  const who = names.length <= 1 ? (names[0] ?? "") : names.length <= 3 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : `${names.slice(0, 2).join(", ")} & ${names.length - 2} friends`;
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 54px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(who || o.line, W / 2, H - BAND + 82, W - 80);
  ctx.font = "32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillText(who ? o.line : new Date().toLocaleDateString(), W / 2, H - BAND + 135, W - 80);
  ctx.font = "600 26px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Newtown · newtown.world", W / 2, H - 30);
}

// ---------------------------------------------------------------- the screen

export function PhotoSpot({ booth, ...props }: GameProps & { booth?: boolean }) {
  const room = useActivityRoom(props.roundId, props.roomId, props.me);
  const city = useMemo(() => (props.roundId ? makePlan(props.roundId).city.name : "Newtown"), [props.roundId]);
  const [backdrop, setBackdrop] = useState<Backdrop>("live");
  const [live, setLive] = useState<HTMLCanvasElement | null>(null);
  const [liveTried, setLiveTried] = useState(false);
  const [frame, setFrame] = useState(0);
  const [useSelfie, setUseSelfie] = useState(false);
  const [selfie, setSelfie] = useState<HTMLCanvasElement | null>(null);
  const [group, setGroup] = useState(false);
  const [faces, setFaces] = useState<Record<string, HTMLImageElement | null>>({});
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);

  const me = props.me;
  const others = useMemo(() => props.members.filter((m) => m.id !== me?.id).slice(0, 6), [props.members, me?.id]);
  const people: Person[] = useMemo(() => (booth && me ? [me, ...(group ? others : [])] : []), [booth, me, group, others]);

  // The live scene behind you, copied when the screen opens (tried again a couple of times if
  // the 3D view isn't ready yet).
  useEffect(() => {
    let on = true;
    let timer = 0;
    const attempt = (left: number) => {
      void captureScene().then((c) => {
        if (!on) return;
        if (c || left <= 0) {
          setLive(c);
          setLiveTried(true);
          if (!c) setBackdrop((b) => (b === "live" ? "sunset" : b));
          return;
        }
        timer = window.setTimeout(() => attempt(left - 1), 1500);
      });
    };
    attempt(3);
    return () => {
      on = false;
      window.clearTimeout(timer);
    };
  }, []);
  // Everyone's faces as pictures.
  useEffect(() => {
    let on = true;
    const need = people.filter((p) => !(p.id in faces));
    if (!need.length) return;
    void Promise.all(need.map((p) => avatarImage(p).then((img) => [p.id, img] as const))).then((list) => {
      if (on) setFaces((f) => ({ ...f, ...Object.fromEntries(list) }));
    });
    return () => {
      on = false;
    };
  }, [people, faces]);

  const options = (): Compose => ({
    backdrop,
    live,
    seed: city,
    city,
    frame,
    people: people.map((p, k) => ({ img: k === 0 && useSelfie && selfie ? selfie : (faces[p.id] ?? null), name: p.name })),
    title: "Greetings from",
    line: booth ? `${props.label} · ${new Date().toLocaleDateString()}` : `The view from ${props.label}`,
  });
  // Keep the little preview up to date.
  useEffect(() => {
    if (preview.current && !shot) compose(preview.current, options(), 0.36);
  });

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot);
  }, [shot]);

  async function make() {
    setBusy(true);
    const c = document.createElement("canvas");
    c.dataset.photo = "1";
    compose(c, options(), 1);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    setBusy(false);
    if (!blob) return;
    if (shot) URL.revokeObjectURL(shot);
    setShot(URL.createObjectURL(blob));
    playSfx("toy");
    questEvent({ type: "play", game: "photo" });
    if (me) {
      room.send({
        t: "toast",
        icon: "camera",
        from: me.id,
        text: booth ? (people.length > 1 ? `${me.name} took a group photo with ${people.length - 1} ${people.length === 2 ? "person" : "people"}!` : `${me.name} took a photo at the booth.`) : `${me.name} snapped a postcard of the view.`,
      });
    }
  }

  async function share() {
    if (!shot) return;
    const blob = await (await fetch(shot)).blob();
    const file = new File([blob], "newtown.jpg", { type: "image/jpeg" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: `Greetings from ${city}` });
        return;
      } catch {
        // Cancelled: fall through to saving.
      }
    }
    const a = document.createElement("a");
    a.href = shot;
    a.download = "newtown.jpg";
    a.click();
  }

  function callEveryone() {
    if (!me) return;
    room.send({ t: "toast", icon: "camera", from: me.id, text: `${me.name} wants a group photo at the ${props.label.toLowerCase()}. Come and get in it!` });
    playSfx("pop");
  }

  return (
    <div className="space-y-3">
      <GameHeader icon={Camera} title={booth ? "Photo booth" : "The view"} sub={booth ? `Greetings from ${city}` : props.label} onClose={props.onClose} color="#0c8599" />
      {shot ? (
        <div className="act-pop space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture made on this phone */}
          <img src={shot} alt="Your photo" className="w-full rounded-2xl shadow-md" />
          <div className="grid grid-cols-2 gap-2">
            <BigButton tone="green" onClick={() => void share()}>
              <Share2 className="size-4" /> Share
            </BigButton>
            <BigButton tone="soft" onClick={() => setShot(null)}>
              <ArrowLeft className="size-4" /> Back
            </BigButton>
          </div>
        </div>
      ) : (
        <>
          <div className="relative mx-auto w-full max-w-xs">
            <canvas ref={preview} data-photo className="w-full rounded-2xl shadow-md" aria-label="Preview of your photo" />
            {booth && useSelfie && !selfie && (
              <div className="absolute inset-0 grid place-items-center rounded-2xl bg-ink/70 p-3">
                <SelfieCamera onShot={setSelfie} onCancel={() => setUseSelfie(false)} />
              </div>
            )}
          </div>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {BACKDROPS.filter((b) => b.key !== "live" || live || !liveTried).map((b) => (
              <button
                key={b.key}
                onClick={() => setBackdrop(b.key)}
                className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold", backdrop === b.key ? "bg-ink text-white" : "bg-panel-2 text-muted")}
              >
                {b.label}
              </button>
            ))}
          </div>

          {booth && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setUseSelfie(false)}
                  className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold", !useSelfie ? "bg-ink text-white" : "bg-panel-2")}
                >
                  <User className="size-4" /> My avatar
                </button>
                <button
                  onClick={() => setUseSelfie(true)}
                  className={cn("flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold", useSelfie ? "bg-ink text-white" : "bg-panel-2")}
                >
                  <Camera className="size-4" /> Selfie
                </button>
              </div>
              {useSelfie && selfie && (
                <button onClick={() => setSelfie(null)} className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <RefreshCw className="size-3.5" /> Retake selfie
                </button>
              )}
              <div className="flex items-center gap-2 rounded-xl bg-panel-2 p-2">
                <button
                  onClick={() => setGroup((g) => !g)}
                  className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", group ? "bg-ink text-white" : "bg-panel")}
                  aria-pressed={group}
                >
                  <Users className="size-4" /> Group photo
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {others.length ? (group ? `With ${others.map((o) => o.name).join(", ")}` : `${others.length} ${others.length === 1 ? "person" : "people"} here`) : "Nobody else here yet"}
                </span>
                <button onClick={callEveryone} className="flex shrink-0 items-center gap-1 rounded-lg bg-panel px-2 py-1.5 text-xs font-semibold" title="Ask everyone in the room to come and get in the photo">
                  <Megaphone className="size-3.5" /> Call everyone
                </button>
              </div>
              <div className="flex gap-2">
                {FRAMES.map((f, i) => (
                  <button
                    key={f.name}
                    onClick={() => setFrame(i)}
                    className={cn("flex-1 rounded-xl py-2 text-xs font-semibold text-white", frame === i && "ring-2 ring-ink ring-offset-2")}
                    style={{ background: `linear-gradient(135deg, ${f.a}, ${f.b})` }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <BigButton tone="gold" onClick={() => void make()} disabled={busy || (booth && useSelfie && !selfie)}>
            <Camera className="size-5" /> {booth ? (useSelfie && !selfie ? "Take your selfie first" : "Make my photo") : "Snap a postcard"}
          </BigButton>
          {booth && useSelfie && <p className="text-center text-[11px] text-muted">Your selfie stays on your phone. It&apos;s only shared if you share the photo.</p>}
        </>
      )}
    </div>
  );
}

/** The front camera in a circle, a 3-2-1 countdown and a flash. Gives back the photo (mirrored, like a mirror). */
function SelfieCamera({ onShot, onCancel }: { onShot: (c: HTMLCanvasElement) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let on = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      const t = setTimeout(() => setError("This phone's browser can't use the camera here."), 0);
      return () => clearTimeout(t);
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (!on) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
      })
      .catch(() => on && setError("No camera (or no permission). Allow the camera in your browser, or use your avatar."));
    return () => {
      on = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  function take() {
    let n = 3;
    setCount(n);
    playSfx("tick");
    const id = window.setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        playSfx("tick");
        return;
      }
      window.clearInterval(id);
      setCount(null);
      setFlash(true);
      playSfx("toy");
      const v = video.current;
      if (v && v.videoWidth) {
        const size = Math.min(v.videoWidth, v.videoHeight);
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const ctx = c.getContext("2d")!;
        if (facing === "user") {
          ctx.translate(size, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(v, (v.videoWidth - size) / 2, (v.videoHeight - size) / 2, size, size, 0, 0, size, size);
        window.setTimeout(() => onShot(c), 250);
      }
    }, 800);
  }

  if (error)
    return (
      <div className="space-y-2 text-center text-sm text-white">
        <p>{error}</p>
        <button onClick={onCancel} className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold">
          Use my avatar
        </button>
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-44 overflow-hidden rounded-full ring-4 ring-white">
        <video ref={video} playsInline muted className="size-full object-cover" style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }} />
        {count !== null && <span className="absolute inset-0 grid place-items-center font-display text-6xl font-extrabold text-white drop-shadow">{count}</span>}
        {flash && <span className="absolute inset-0 bg-white" style={{ animation: "act-pop .3s ease-out reverse both" }} />}
      </div>
      <div className="flex gap-2">
        <button onClick={take} disabled={count !== null} className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-ink">
          <Camera className="mr-1 inline size-4 align-[-0.15em]" /> Take selfie
        </button>
        <button onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} className="grid size-9 place-items-center rounded-full bg-white/15 text-white" aria-label="Switch camera">
          <SwitchCamera className="size-4" />
        </button>
      </div>
    </div>
  );
}
