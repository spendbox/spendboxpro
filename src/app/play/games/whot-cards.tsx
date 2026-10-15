// Whot! cards, drawn like the real Nigerian deck: cream cards with maroon shapes (circle,
// triangle, cross, square, star) and the number in the corners; the Whot (20) card in maroon and
// gold; the back a maroon pattern with WHOT across it. Sized by the CSS variable --cw (card width).

import { cn } from "@/lib/cn";
import { shapeOf, valueOf, WHOT } from "../minigames/turns/whot";

export const MAROON = "#8b1e2d";

/** A shape (0 circle, 1 triangle, 2 cross, 3 square, 4 star) in a 100 × 100 box. */
export function ShapePath({ shape, fill = MAROON }: { shape: number; fill?: string }) {
  switch (shape) {
    case 0:
      return <circle cx="50" cy="50" r="40" fill={fill} />;
    case 1:
      return <path d="M50 9 L93 86 H7 Z" fill={fill} strokeLinejoin="round" />;
    case 2:
      return <path d="M38 8 H62 V38 H92 V62 H62 V92 H38 V62 H8 V38 H38 Z" fill={fill} />;
    case 3:
      return <rect x="12" y="12" width="76" height="76" rx="4" fill={fill} />;
    default:
      return <path d="M50 6 L61.8 37.8 L95.6 38.6 L69 59.4 L78.2 92 L50 73 L21.8 92 L31 59.4 L4.4 38.6 L38.2 37.8 Z" fill={fill} />;
  }
}

export function ShapeIcon({ shape, className, fill }: { shape: number; className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <ShapePath shape={shape} fill={fill} />
    </svg>
  );
}

/** The face of a card. */
export function CardFace({ c, className, style }: { c: number; className?: string; style?: React.CSSProperties }) {
  const whot = c === WHOT;
  const sh = shapeOf(c);
  const v = valueOf(c);
  const label = whot ? "Whot 20" : `${["Circle", "Triangle", "Cross", "Square", "Star"][sh]} ${v}`;
  return (
    <div
      className={cn("whot-card relative overflow-hidden rounded-[10%/7%] shadow-[0_2px_6px_rgba(0,0,0,0.35)]", className)}
      style={{ background: whot ? "linear-gradient(160deg, #a52a3a, #6d1320)" : "linear-gradient(160deg, #fffdf6, #f4ead3)", ...style }}
      role="img"
      aria-label={label}
    >
      <div className="absolute inset-[5%] rounded-[8%/6%] border" style={{ borderColor: whot ? "rgba(255,215,130,0.6)" : "rgba(139,30,45,0.25)" }} />
      {/* Corners. */}
      {[false, true].map((flip) => (
        <div key={String(flip)} className={cn("absolute flex flex-col items-center leading-none", flip ? "bottom-[6%] right-[8%] rotate-180" : "left-[8%] top-[6%]")} style={{ color: whot ? "#ffd982" : MAROON }}>
          <span className="font-display font-black" style={{ fontSize: "calc(var(--cw) * 0.24)" }}>
            {v}
          </span>
          {!whot && <ShapeIcon shape={sh} className="whot-pip mt-[6%]" fill={MAROON} />}
        </div>
      ))}
      {/* The middle. */}
      <div className="absolute inset-0 grid place-items-center">
        {whot ? (
          <div className="flex flex-col items-center">
            <ShapeIcon shape={4} className="whot-mid" fill="#ffd982" />
            <span className="font-display font-black tracking-wide text-[#ffd982]" style={{ fontSize: "calc(var(--cw) * 0.22)" }}>
              WHOT
            </span>
          </div>
        ) : (
          <ShapeIcon shape={sh} className="whot-mid" fill={MAROON} />
        )}
      </div>
    </div>
  );
}

/** The back of a card. */
export function CardBack({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("whot-back relative overflow-hidden rounded-[10%/7%] shadow-[0_2px_6px_rgba(0,0,0,0.35)]", className)}
      style={{
        width: "var(--cw)",
        height: "calc(var(--cw) * 1.45)",
        background: `repeating-linear-gradient(45deg, rgba(255,255,255,0.07) 0 6%, transparent 6% 12%), repeating-linear-gradient(-45deg, rgba(0,0,0,0.12) 0 6%, transparent 6% 12%), linear-gradient(160deg, #a52a3a, #5e101b)`,
        ...style,
      }}
      aria-hidden
    >
      <div className="absolute inset-[7%] grid place-items-center rounded-[8%/6%] border-2 border-[#ffd982]/60">
        <span className="-rotate-[30deg] font-display font-black tracking-wider text-[#ffd982]" style={{ fontSize: "calc(var(--cw) * 0.2)" }}>
          WHOT
        </span>
      </div>
    </div>
  );
}
