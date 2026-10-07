import { BG, HAIR_COLOR, SKIN, TOP_COLOR, type Avatar } from "@/lib/avatar";

/** Darken (or lighten, with a negative amount) a #rrggbb colour. */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A player's portrait, drawn in SVG from their choices: soft shading, layered hair, proper
 * eyes, and clothes. Scales to any size.
 */
export function AvatarFace({ avatar: a, size = 40, className, ring }: { avatar: Avatar; size?: number; className?: string; ring?: string }) {
  const skin = SKIN[a.skin];
  const skinShade = shade(skin, 0.12);
  const hair = HAIR_COLOR[a.hairColor];
  const hairShade = shade(hair, 0.25);
  const top = TOP_COLOR[a.topColor];
  const id = `av${a.skin}${a.hair}${a.hairColor}${a.top}${a.topColor}${a.bg}`;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role="img" aria-label="Player avatar">
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="1" stopColor={BG[a.bg]} />
        </radialGradient>
        <radialGradient id={`${id}-face`} cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor={shade(skin, -0.08)} />
          <stop offset="1" stopColor={skinShade} />
        </radialGradient>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(top, -0.1)} />
          <stop offset="1" stopColor={shade(top, 0.2)} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="120" height="120" fill={`url(#${id}-bg)`} />
        {/* Hair that falls behind the head */}
        {[4, 6, 10, 11].includes(a.hair) && (
          <path
            d={a.hair === 11 ? "M28 52 Q28 92 40 96 L80 96 Q92 92 92 52 Z" : a.hair === 6 || a.hair === 10 ? "M26 50 Q22 104 34 112 L86 112 Q98 104 94 50 Z" : "M27 50 Q24 100 36 108 L84 108 Q96 100 93 50 Z"}
            fill={hairShade}
          />
        )}
        {/* Shoulders and clothes */}
        <path d="M14 120 Q16 92 42 86 L78 86 Q104 92 106 120 Z" fill={`url(#${id}-top)`} />
        {a.top === 1 && <path d="M40 86 Q60 104 80 86 L78 96 Q60 110 42 96 Z" fill={shade(top, 0.3)} />}
        {a.top === 2 && <path d="M48 86 L60 100 L72 86 L68 84 L60 92 L52 84 Z" fill="#ffffff" />}
        {a.top === 3 && <path d="M56 88 L60 120 L64 88 Z M42 88 L54 120 L46 120 Z M78 88 L66 120 L74 120 Z" fill={shade(top, 0.35)} />}
        {a.top === 4 && <path d="M30 100 Q60 112 90 100 L92 106 Q60 118 28 106 Z" fill="#f5c542" opacity="0.9" />}
        {/* Neck */}
        <path d="M50 74 L50 88 Q60 94 70 88 L70 74 Z" fill={skinShade} />
        {/* Ears */}
        <ellipse cx="33" cy="58" rx="5.5" ry="7.5" fill={skinShade} />
        <ellipse cx="87" cy="58" rx="5.5" ry="7.5" fill={skinShade} />
        {a.earrings === 1 && (
          <>
            <circle cx="33" cy="66" r="2" fill="#ffd43b" />
            <circle cx="87" cy="66" r="2" fill="#ffd43b" />
          </>
        )}
        {a.earrings === 2 && (
          <>
            <circle cx="33" cy="68" r="3.5" fill="none" stroke="#ffd43b" strokeWidth="1.6" />
            <circle cx="87" cy="68" r="3.5" fill="none" stroke="#ffd43b" strokeWidth="1.6" />
          </>
        )}
        {/* Head */}
        <ellipse cx="60" cy="54" rx="26" ry="29" fill={`url(#${id}-face)`} />
        {/* Cheeks */}
        <ellipse cx="45" cy="64" rx="5" ry="3" fill="#ff8a8a" opacity="0.18" />
        <ellipse cx="75" cy="64" rx="5" ry="3" fill="#ff8a8a" opacity="0.18" />
        {/* Eyes */}
        <Eyes kind={a.eyes} />
        {/* Brows */}
        <Brows kind={a.brows} color={a.hair === 9 ? shade(skin, 0.45) : hairShade} />
        {/* Nose */}
        <path d="M60 56 Q57 64 59 66 Q61 67 63 66" fill="none" stroke={shade(skin, 0.28)} strokeWidth="1.6" strokeLinecap="round" />
        {/* Mouth */}
        <Mouth kind={a.mouth} />
        {/* Beard */}
        {a.beard === 1 && <path d="M38 62 Q40 84 60 86 Q80 84 82 62 Q80 78 60 80 Q40 78 38 62 Z" fill={hair} opacity="0.35" />}
        {a.beard === 2 && <path d="M36 58 Q38 90 60 92 Q82 90 84 58 Q80 74 70 76 Q60 72 50 76 Q40 74 36 58 Z" fill={hair} />}
        {a.beard === 3 && <path d="M52 76 Q60 90 68 76 Q60 80 52 76 Z" fill={hair} />}
        {(a.beard === 2 || a.beard === 4) && <path d="M50 70 Q60 66 70 70 Q66 73 60 71 Q54 73 50 70 Z" fill={hair} />}
        {/* Hair on top */}
        <Hair kind={a.hair} color={hair} shadeColor={hairShade} />
        {/* Glasses */}
        {a.glasses === 1 && (
          <g fill="none" stroke="#2b2b2b" strokeWidth="2">
            <circle cx="49" cy="54" r="7.5" />
            <circle cx="71" cy="54" r="7.5" />
            <path d="M56.5 54 L63.5 54" />
          </g>
        )}
        {a.glasses === 2 && (
          <g fill="none" stroke="#2b2b2b" strokeWidth="2">
            <rect x="40" y="48" width="16" height="12" rx="2.5" />
            <rect x="64" y="48" width="16" height="12" rx="2.5" />
            <path d="M56 53 L64 53" />
          </g>
        )}
        {a.glasses === 3 && (
          <g>
            <path d="M39 49 L57 49 L55 60 Q48 63 41 59 Z M63 49 L81 49 L79 59 Q72 63 65 60 Z" fill="#18202b" />
            <path d="M57 51 L63 51" stroke="#18202b" strokeWidth="2" />
          </g>
        )}
      </g>
      {ring && <circle cx="60" cy="60" r="57.5" fill="none" stroke={ring} strokeWidth="5" />}
    </svg>
  );
}

function Eyes({ kind }: { kind: number }) {
  if (kind === 2)
    return (
      <g stroke="#2b2b2b" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M44 55 Q49 58 54 55" />
        <path d="M66 55 Q71 58 76 55" />
      </g>
    );
  if (kind === 1)
    return (
      <g stroke="#2b2b2b" strokeWidth="2.2" strokeLinecap="round" fill="none">
        <path d="M44 56 Q49 51 54 56" />
        <path d="M66 56 Q71 51 76 56" />
      </g>
    );
  const r = kind === 3 ? 5.2 : 4.4;
  return (
    <g>
      <ellipse cx="49" cy="54" rx={r + 1.2} ry={r} fill="#ffffff" />
      {kind === 4 ? (
        <path d="M66 55 Q71 51 76 55" stroke="#2b2b2b" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      ) : (
        <ellipse cx="71" cy="54" rx={r + 1.2} ry={r} fill="#ffffff" />
      )}
      <circle cx="49.5" cy="54.5" r={r * 0.62} fill="#3b2a1e" />
      <circle cx="50.6" cy="53.2" r="1.1" fill="#ffffff" />
      {kind !== 4 && (
        <>
          <circle cx="71.5" cy="54.5" r={r * 0.62} fill="#3b2a1e" />
          <circle cx="72.6" cy="53.2" r="1.1" fill="#ffffff" />
        </>
      )}
    </g>
  );
}

function Brows({ kind, color }: { kind: number; color: string }) {
  const w = kind === 1 ? 3.6 : 2.6;
  const d = [
    ["M43 46 Q49 43 55 45", "M65 45 Q71 43 77 46"],
    ["M42 46 Q49 42 56 45", "M64 45 Q71 42 78 46"],
    ["M43 43 Q49 39 55 42", "M65 42 Q71 39 77 43"],
    ["M43 44 Q49 46 55 47", "M65 47 Q71 46 77 44"],
  ][kind];
  return (
    <g stroke={color} strokeWidth={w} strokeLinecap="round" fill="none">
      <path d={d[0]} />
      <path d={d[1]} />
    </g>
  );
}

function Mouth({ kind }: { kind: number }) {
  switch (kind) {
    case 1:
      return <path d="M50 70 Q60 80 70 70 Q60 74 50 70 Z" fill="#7a2e2e" stroke="#7a2e2e" strokeWidth="1.5" strokeLinejoin="round" />;
    case 2:
      return <path d="M53 72 L67 72" stroke="#8a3b3b" strokeWidth="2.2" strokeLinecap="round" />;
    case 3:
      return <path d="M52 72 Q60 74 68 69" stroke="#8a3b3b" strokeWidth="2.2" strokeLinecap="round" fill="none" />;
    case 4:
      return (
        <g>
          <path d="M49 69 Q60 84 71 69 Z" fill="#7a2e2e" />
          <path d="M51 70 L69 70 L67 73 L53 73 Z" fill="#ffffff" />
        </g>
      );
    default:
      return <path d="M51 70 Q60 77 69 70" stroke="#8a3b3b" strokeWidth="2.4" strokeLinecap="round" fill="none" />;
  }
}

function Hair({ kind, color, shadeColor }: { kind: number; color: string; shadeColor: string }) {
  switch (kind) {
    case 0: // Buzz
      return <path d="M34 50 Q36 24 60 23 Q84 24 86 50 Q80 36 60 35 Q40 36 34 50 Z" fill={color} opacity="0.85" />;
    case 1: // Short
      return <path d="M32 52 Q30 20 60 19 Q90 20 88 52 Q84 38 74 34 Q62 40 44 36 Q36 42 32 52 Z" fill={color} />;
    case 2: // Curly
      return (
        <g fill={color}>
          {[...Array(11)].map((_, k) => {
            const a = Math.PI + (k / 10) * Math.PI;
            return <circle key={k} cx={60 + Math.cos(a) * 26} cy={44 + Math.sin(a) * 22} r="9" />;
          })}
          <circle cx="60" cy="26" r="11" />
        </g>
      );
    case 3: // Afro
      return <path d="M24 58 Q14 8 60 8 Q106 8 96 58 Q92 40 84 38 Q60 30 36 38 Q28 40 24 58 Z" fill={color} />;
    case 4: // Long
      return <path d="M30 60 Q26 18 60 18 Q94 18 90 60 Q88 40 78 32 Q64 40 42 34 Q32 42 30 60 Z" fill={color} />;
    case 5: // Bun
      return (
        <g fill={color}>
          <circle cx="60" cy="14" r="11" />
          <path d="M33 50 Q32 22 60 21 Q88 22 87 50 Q82 34 60 32 Q38 34 33 50 Z" />
        </g>
      );
    case 6: // Braids
      return (
        <g fill={color}>
          <path d="M32 54 Q30 20 60 19 Q90 20 88 54 Q84 36 60 34 Q36 36 32 54 Z" />
          {[38, 46, 54, 62, 70, 78].map((x) => (
            <path key={x} d={`M${x} 22 L${x} 36`} stroke={shadeColor} strokeWidth="2" />
          ))}
        </g>
      );
    case 7: // Mohawk
      return <path d="M52 40 Q50 8 60 6 Q70 8 68 40 Z" fill={color} />;
    case 8: // Side part
      return <path d="M32 54 Q28 18 62 18 Q92 20 88 50 Q78 30 56 30 Q46 30 40 38 Q34 44 32 54 Z" fill={color} />;
    case 9: // Bald
      return <ellipse cx="54" cy="34" rx="9" ry="4" fill="#ffffff" opacity="0.18" />;
    case 10: // Locs
      return (
        <g fill={color}>
          <path d="M32 52 Q30 18 60 17 Q90 18 88 52 Q84 34 60 32 Q36 34 32 52 Z" />
          {[30, 36, 84, 90].map((x) => (
            <rect key={x} x={x - 3} y="40" width="6" height="40" rx="3" />
          ))}
        </g>
      );
    default: // Bob
      return <path d="M30 70 Q24 16 60 16 Q96 16 90 70 L84 70 Q86 40 72 32 Q60 38 46 34 Q34 42 36 70 Z" fill={color} />;
  }
}
