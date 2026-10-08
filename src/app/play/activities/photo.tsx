"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Share2, Sparkles } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cleanAvatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { playSfx } from "../sound";
import { useActivityRoom } from "./hub";
import { questEvent } from "./quest-store";
import { BigButton, GameHeader, type GameProps, rand } from "./ui";

// Photo spots. The window shows the view with a little thought about the city; the photo booth
// puts your face in a frame. Either way you can snap a postcard to save or share.

const VIEW_LINES = [
  "The city glitters below. Somewhere out there, a ghost is holding its breath.",
  "Drones hum past like busy bees. Not one of them knows you're watching.",
  "From up here, the hunters look like ants with flashlights.",
  "Rooftops, river, a balloon drifting by. What a place to hide.",
  "Traffic glows like a river of fireflies. Peaceful, until the next siren.",
  "Every lit window is a story. One of them might be a hiding spot.",
];
const FRAMES = [
  { name: "Gold", a: "#ffc53d", b: "#f76707" },
  { name: "Party", a: "#e64980", b: "#7048e8" },
  { name: "Ocean", a: "#2f6fd1", b: "#0c8599" },
  { name: "Jungle", a: "#12a37a", b: "#2b8a3e" },
];

/** Sky colours for the time of day on this phone. */
function skyNow() {
  const h = new Date().getHours();
  if (h >= 19 || h < 5) return { top: "#0b1d3a", bottom: "#3b2a6b", night: true };
  if (h >= 17) return { top: "#ff8a5c", bottom: "#ffd27a", night: false };
  if (h < 8) return { top: "#ffb38a", bottom: "#bfe3ff", night: false };
  return { top: "#5ab0ff", bottom: "#d8efff", night: false };
}

/** A made-up skyline, the same every time for the same place. */
function skyline(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h >>> 0) % 1000) / 1000;
  };
  const out: { x: number; w: number; hgt: number; lit: boolean[] }[] = [];
  for (let x = 0; x < 360; ) {
    const w = 22 + rnd() * 34;
    const hgt = 50 + rnd() * 140;
    out.push({ x, w, hgt, lit: Array.from({ length: 40 }, () => rnd() > 0.55) });
    x += w + 2;
  }
  return out;
}

export function PhotoSpot({ booth, ...props }: GameProps & { booth?: boolean }) {
  const [line] = useState(() => VIEW_LINES[Math.floor(rand() * VIEW_LINES.length)]);
  const [frame, setFrame] = useState(0);
  const [shot, setShot] = useState<string | null>(null);
  const [sky] = useState(skyNow);
  const faceBox = useRef<HTMLDivElement>(null);
  const room = useActivityRoom(props.roundId, props.roomId, props.me);
  const buildings = skyline(props.roomId);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot);
  }, [shot]);

  async function snap() {
    const W = 600;
    const H = 760;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const f = FRAMES[frame];
    // Frame.
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, booth ? f.a : "#ffffff");
    g.addColorStop(1, booth ? f.b : "#f1f3f5");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Picture.
    const px = 40;
    const py = 40;
    const pw = W - 80;
    const ph = 520;
    const s = ctx.createLinearGradient(0, py, 0, py + ph);
    s.addColorStop(0, sky.top);
    s.addColorStop(1, sky.bottom);
    ctx.fillStyle = s;
    ctx.fillRect(px, py, pw, ph);
    if (!booth) {
      if (sky.night) {
        ctx.fillStyle = "rgba(255,255,255,.8)";
        for (let i = 0; i < 40; i++) ctx.fillRect(px + ((i * 137) % pw), py + ((i * 71) % 220), 2, 2);
      }
      const scale = pw / 360;
      for (const b of buildings) {
        const bx = px + b.x * scale;
        const bw = b.w * scale;
        const bh = b.hgt * scale * 1.4;
        ctx.fillStyle = sky.night ? "#1d2333" : "#4b5563";
        ctx.fillRect(bx, py + ph - bh, bw, bh);
        ctx.fillStyle = sky.night ? "#ffd43b" : "rgba(255,255,255,.55)";
        let k = 0;
        for (let wy = py + ph - bh + 10; wy < py + ph - 10; wy += 18) {
          for (let wx = bx + 6; wx < bx + bw - 8; wx += 12) {
            if (b.lit[k++ % b.lit.length]) ctx.fillRect(wx, wy, 6, 8);
          }
        }
      }
    } else {
      // The player's face, drawn from their avatar picture.
      const svg = faceBox.current?.querySelector("svg");
      if (svg) {
        const xml = new XMLSerializer().serializeToString(svg);
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
        });
        try {
          ctx.drawImage(img, px + pw / 2 - 200, py + ph / 2 - 200, 400, 400);
        } catch {
          // Some browsers won't draw SVGs into a canvas; the frame still works.
        }
      }
    }
    // Caption.
    ctx.fillStyle = booth ? "#ffffff" : "#18202b";
    ctx.textAlign = "center";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.fillText(booth ? (props.me?.name ?? "Me") : "Greetings from the city!", W / 2, py + ph + 70);
    ctx.font = "22px system-ui, sans-serif";
    ctx.fillStyle = booth ? "rgba(255,255,255,.85)" : "#64707d";
    ctx.fillText(`${props.label} · ${new Date().toLocaleDateString()}`, W / 2, py + ph + 110);
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("Hide & Seek", W / 2, py + ph + 150);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
    if (!blob) return;
    if (shot) URL.revokeObjectURL(shot);
    setShot(URL.createObjectURL(blob));
    playSfx("toy");
    questEvent({ type: "play", game: "photo" });
    if (props.me) room.send({ t: "toast", icon: "camera", from: props.me.id, text: `${props.me.name} snapped a ${booth ? "photo booth picture" : "postcard of the view"}.` });
  }

  async function share() {
    if (!shot) return;
    const blob = await (await fetch(shot)).blob();
    const file = new File([blob], "hide-and-seek.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "Hide & Seek" });
        return;
      } catch {
        // Cancelled: fall through to saving.
      }
    }
    const a = document.createElement("a");
    a.href = shot;
    a.download = "hide-and-seek.png";
    a.click();
  }

  const me = props.me;
  return (
    <div className="space-y-3">
      <GameHeader icon={Camera} title={booth ? "Photo booth" : "The view"} sub={props.label} onClose={props.onClose} color="#0c8599" />
      {shot ? (
        <div className="act-pop space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture made on this phone */}
          <img src={shot} alt="Your postcard" className="w-full rounded-2xl shadow-md" />
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
          <div
            className="relative h-56 overflow-hidden rounded-3xl"
            style={{ background: booth ? `linear-gradient(135deg, ${FRAMES[frame].a}, ${FRAMES[frame].b})` : `linear-gradient(${sky.top}, ${sky.bottom})` }}
          >
            {booth ? (
              <div ref={faceBox} className="grid h-full place-items-center">
                {me ? <AvatarFace avatar={cleanAvatar(me.avatar, me.id)} size={170} /> : <Camera className="size-16 text-white" />}
                <Sparkles className="act-pulse absolute right-6 top-6 size-8 text-white" />
              </div>
            ) : (
              <svg viewBox="0 0 360 224" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice" aria-hidden>
                {sky.night && Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 97) % 360} cy={(i * 53) % 110} r={1} fill="#fff" opacity={0.8} />)}
                {buildings.map((b, i) => (
                  <g key={i}>
                    <rect x={b.x} y={224 - b.hgt} width={b.w} height={b.hgt} fill={sky.night ? "#1d2333" : "#4b5563"} />
                    {b.lit.slice(0, Math.floor(b.hgt / 16) * 2).map((on, k) =>
                      on ? (
                        <rect key={k} x={b.x + 5 + (k % 2) * (b.w / 2 - 4)} y={224 - b.hgt + 8 + Math.floor(k / 2) * 16} width={5} height={7} fill={sky.night ? "#ffd43b" : "#ffffff88"} />
                      ) : null,
                    )}
                  </g>
                ))}
              </svg>
            )}
          </div>
          {booth ? (
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
          ) : (
            <p className="text-center text-sm italic text-muted">{line}</p>
          )}
          <BigButton tone="gold" onClick={() => void snap()}>
            <Camera className="size-5" /> {booth ? "Say cheese!" : "Snap a postcard"}
          </BigButton>
        </>
      )}
    </div>
  );
}
