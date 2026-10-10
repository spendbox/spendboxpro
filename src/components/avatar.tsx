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
export function AvatarFace({
  avatar: a,
  size = 40,
  className,
  ring,
  cutout,
}: {
  avatar: Avatar;
  size?: number;
  className?: string;
  ring?: string;
  /** Just the person (no round backdrop), e.g. to stand them in front of a photo. */
  cutout?: boolean;
}) {
  const skin = SKIN[a.skin];
  const skinShade = shade(skin, 0.12);
  const hair = HAIR_COLOR[a.hairColor];
  const hairShade = shade(hair, 0.25);
  const top = TOP_COLOR[a.topColor];
  const id = `av${cutout ? "c" : ""}${[a.skin, a.hair, a.hairColor, a.top, a.topColor, a.bg].join("-")}`;
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
        <linearGradient id={`${id}-mat`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(MATERIAL[a.top] ?? top, -0.12)} />
          <stop offset="1" stopColor={shade(MATERIAL[a.top] ?? top, 0.22)} />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          {cutout ? <rect width="120" height="120" /> : <circle cx="60" cy="60" r="60" />}
        </clipPath>
        <clipPath id={`${id}-body`}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        {!cutout && <rect width="120" height="120" fill={`url(#${id}-bg)`} />}
        {/* Hair that falls behind the head */}
        {[4, 6, 10, 11].includes(a.hair) && (
          <path
            d={a.hair === 11 ? "M28 52 Q28 92 40 96 L80 96 Q92 92 92 52 Z" : a.hair === 6 || a.hair === 10 ? "M26 50 Q22 104 34 112 L86 112 Q98 104 94 50 Z" : "M27 50 Q24 100 36 108 L84 108 Q96 100 93 50 Z"}
            fill={hairShade}
          />
        )}
        {/* Shoulders and clothes */}
        <TopBody kind={a.top} color={top} id={id} skin={skinShade} />
        {/* Neck */}
        <path d="M50 74 L50 88 Q60 94 70 88 L70 74 Z" fill={skinShade} />
        {/* The parts of an outfit that wrap over the neck (collars, ties, stethoscopes) */}
        <TopOver kind={a.top} color={top} id={id} />
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

/** The shoulders every outfit is cut from. */
const BODY = "M14 120 Q16 92 42 86 L78 86 Q104 92 106 120 Z";

/** Outfits made of their own material (denim, leather…) — the outfit colour then shows on the shirt under it. */
const MATERIAL: Record<number, string> = { 11: "#4f7bb5", 12: "#2a2d33", 15: "#1f232b", 23: "#f8f9fa" };

/** Whether a colour is pale enough that white details would vanish on it. */
function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 190;
}

/** Whether a colour is dark enough that black details would vanish on it. */
function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 70;
}

/** Blend a #rrggbb colour towards white by the given amount (0–1). */
function mix(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Blotches for the camouflage print, as [path, which tone]. */
const CAMO: [string, number][] = [
  ["M16 98 Q24 90 34 96 Q38 104 28 106 Q18 108 16 98 Z", 0],
  ["M40 104 Q50 98 56 106 Q54 116 44 114 Q36 112 40 104 Z", 1],
  ["M62 96 Q72 90 80 98 Q78 106 70 104 Q60 104 62 96 Z", 2],
  ["M84 104 Q96 100 102 110 Q96 118 88 114 Q80 110 84 104 Z", 0],
  ["M24 112 Q32 108 38 116 Q32 122 24 120 Z", 2],
  ["M60 110 Q70 108 74 116 Q68 122 58 120 Q54 114 60 110 Z", 0],
  ["M88 90 Q96 92 94 98 Q86 100 84 94 Z", 1],
  ["M44 90 Q50 88 52 94 Q46 98 42 94 Z", 2],
];

/** The clothes on the shoulders, drawn before the neck. */
function TopBody({ kind, color: c, id, skin }: { kind: number; color: string; id: string; skin: string }) {
  const fill = `url(#${id}-top)`;
  const mat = `url(#${id}-mat)`;
  const clip = `url(#${id}-body)`;
  const dark = shade(c, 0.3);
  const ink = isLight(c) ? "#18202b" : "#ffffff";
  const base = <path d={BODY} fill={fill} />;
  switch (kind) {
    case 0: // T-shirt
      return base;
    case 1: // Hoodie
      return (
        <>
          {base}
          <path d="M40 86 Q60 104 80 86 L78 96 Q60 110 42 96 Z" fill={shade(c, 0.3)} />
        </>
      );
    case 2: // Collar
      return (
        <>
          {base}
          <path d="M48 86 L60 100 L72 86 L68 84 L60 92 L52 84 Z" fill="#ffffff" />
        </>
      );
    case 3: // Jacket
      return (
        <>
          {base}
          <path d="M56 88 L60 120 L64 88 Z M42 88 L54 120 L46 120 Z M78 88 L66 120 L74 120 Z" fill={shade(c, 0.35)} />
        </>
      );
    case 4: // Agbada
      return (
        <>
          {base}
          <path d="M30 100 Q60 112 90 100 L92 106 Q60 118 28 106 Z" fill="#f5c542" opacity="0.9" />
        </>
      );
    case 5: // Polo
      return (
        <>
          {base}
          <path d="M57.5 92 L62.5 92 L62.5 107 L57.5 107 Z" fill={shade(c, 0.12)} stroke={dark} strokeWidth="0.8" />
          <circle cx="60" cy="98" r="1.1" fill={ink} />
          <circle cx="60" cy="103" r="1.1" fill={ink} />
        </>
      );
    case 6: // Turtleneck
      return (
        <>
          {base}
          <g clipPath={clip} stroke={dark} strokeWidth="0.8" opacity="0.45">
            {[24, 34, 44, 76, 86, 96].map((x) => (
              <path key={x} d={`M${x} 92 L${x + (x < 60 ? -4 : 4)} 120`} />
            ))}
          </g>
        </>
      );
    case 7: // V-neck
      return (
        <>
          {base}
          <path d="M47 86 L60 108 L73 86 Z" fill={skin} />
          <path d="M45.5 86 L60 110 L74.5 86" fill="none" stroke={dark} strokeWidth="2.6" strokeLinejoin="round" />
        </>
      );
    case 8: // Tank top
      return (
        <>
          <path d={BODY} fill={skin} />
          <path d="M30 120 L33 98 Q36 88 42 86 L48 86 Q50 102 60 103 Q70 102 72 86 L78 86 Q84 88 87 98 L90 120 Z" fill={fill} />
          <path d="M33 98 Q36 88 42 86 M78 86 Q84 88 87 98 M48 86 Q50 102 60 103 Q70 102 72 86" fill="none" stroke={dark} strokeWidth="1.6" />
        </>
      );
    case 9: // Striped tee
      return (
        <>
          {base}
          <g clipPath={clip} fill={ink} opacity="0.9">
            {[94, 103, 112].map((y) => (
              <rect key={y} x="0" y={y} width="120" height="4.2" />
            ))}
          </g>
          <path d="M47 87 Q60 99 73 87" fill="none" stroke={dark} strokeWidth="2.6" />
        </>
      );
    case 10: // Football jersey
      return (
        <>
          {base}
          <g clipPath={clip} fill="none" stroke={ink} strokeWidth="2.6">
            <path d="M15 104 Q22 92 38 88 M105 104 Q98 92 82 88" />
            <path d="M18 110 Q24 98 40 93 M102 110 Q96 98 80 93" />
          </g>
          <path d="M49 86 L60 98 L71 86 Z" fill={skin} />
          <path d="M47 86 L60 100 L73 86" fill="none" stroke={ink} strokeWidth="2.6" strokeLinejoin="round" />
          <text
            x="60"
            y="118"
            textAnchor="middle"
            fontSize="17"
            fontWeight="900"
            fontFamily="Arial, Helvetica, sans-serif"
            fill={ink}
            stroke={dark}
            strokeWidth="0.8"
          >
            10
          </text>
        </>
      );
    case 11: // Denim jacket (outfit colour is the tee under it)
      return (
        <>
          <path d={BODY} fill={mat} />
          <path d="M47 86 L73 86 L67 120 L53 120 Z" fill={fill} />
          <path d="M48 87 L54 120 M72 87 L66 120" stroke="#33547f" strokeWidth="1.6" fill="none" />
          <path d="M42 86 L50 87 L55 101 L44 97 Z M78 86 L70 87 L65 101 L76 97 Z" fill="#6189c0" stroke="#33547f" strokeWidth="1" strokeLinejoin="round" />
          <path d="M28 104 L44 104 L43 111 L29 111 Z M92 104 L76 104 L77 111 L91 111 Z" fill="#5a83bb" stroke="#33547f" strokeWidth="0.8" />
          <g fill="none" stroke="#e8b04a" strokeWidth="0.7" strokeDasharray="1.4 1.2">
            <path d="M30 106.5 L42 106.5 M90 106.5 L78 106.5 M51 89 L56 116 M69 89 L64 116" />
          </g>
          <circle cx="36" cy="109" r="1.2" fill="#c98b3a" />
          <circle cx="84" cy="109" r="1.2" fill="#c98b3a" />
        </>
      );
    case 12: // Leather jacket (outfit colour is the tee under it)
      return (
        <>
          <path d={BODY} fill={mat} />
          <path d="M49 86 L71 86 L64 112 L56 112 Z" fill={fill} />
          <path d="M42 86 L50 87 L57 104 L60 120 L50 120 L46 104 L36 98 Z" fill="#3a3f48" stroke="#111317" strokeWidth="1" strokeLinejoin="round" />
          <path d="M78 86 L70 87 L64 100 L58 120 L68 120 L74 102 L84 98 Z" fill="#3a3f48" stroke="#111317" strokeWidth="1" strokeLinejoin="round" />
          <path d="M64 101 L59 120" stroke="#c9ced6" strokeWidth="1.4" strokeDasharray="1 0.8" />
          <path d="M20 104 Q24 94 34 90" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.18" strokeLinecap="round" />
          <path d="M100 104 Q96 94 86 90" fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.18" strokeLinecap="round" />
        </>
      );
    case 13: // Bomber
      return (
        <>
          {base}
          <path d="M43 85 Q60 99 77 85 L78 91 Q60 106 42 91 Z" fill={shade(c, 0.45)} />
          <path d="M42.5 88 Q60 102.5 77.5 88" fill="none" stroke={shade(c, -0.4)} strokeWidth="1" opacity="0.8" />
          <path d="M60 98 L60 120" stroke="#c9ced6" strokeWidth="1.6" />
          <rect x="22" y="103" width="8" height="9" rx="1" fill={shade(c, 0.15)} stroke={dark} strokeWidth="0.8" />
          <path d="M23.5 105 L28.5 105" stroke="#c9ced6" strokeWidth="1" />
          <path d="M24 100 Q30 92 40 90 M96 100 Q90 92 80 90" fill="none" stroke="#ffffff" strokeWidth="2.4" opacity="0.2" strokeLinecap="round" />
        </>
      );
    case 14: // Blazer & tie
      return (
        <>
          {base}
          <path d="M47 86 L73 86 L60 118 Z" fill="#ffffff" />
          <path d="M58 96 L62 96 L64.5 112 L60 117 L55.5 112 Z" fill={[1, 7, 9].includes(TOP_COLOR.indexOf(c)) ? "#18202b" : "#b5332e"} />
          <path
            d="M44 86 L49 86 L59 116 L49 102 L41 98 Z M76 86 L71 86 L61 116 L71 102 L79 98 Z"
            fill={shade(c, 0.12)}
            stroke={shade(c, 0.4)}
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <path d="M78 104 L86 103" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case 15: // Suit & bow tie (outfit colour is the bow tie and pocket square)
      return (
        <>
          <path d={BODY} fill={mat} />
          <path d="M46 86 L74 86 L60 120 Z" fill="#ffffff" />
          <circle cx="60" cy="103" r="1" fill="#2b2b2b" />
          <circle cx="60" cy="109" r="1" fill="#2b2b2b" />
          <path
            d="M44 86 L48 86 L59 118 L47 102 L40 98 Z M76 86 L72 86 L61 118 L73 102 L80 98 Z"
            fill="#363c47"
            stroke="#0e1014"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          <path d="M77 104 L86 103 L84 99 Z" fill={c} />
        </>
      );
    case 16: // Puffer jacket
      return (
        <>
          {base}
          <g clipPath={clip} fill="none">
            {[93, 103, 113].map((y) => (
              <g key={y}>
                <path d={`M0 ${y - 3} Q60 ${y + 4} 120 ${y - 3}`} stroke="#ffffff" strokeWidth="3" opacity="0.22" />
                <path d={`M0 ${y + 1} Q60 ${y + 8} 120 ${y + 1}`} stroke={dark} strokeWidth="1.4" />
              </g>
            ))}
          </g>
          <path d="M60 96 L60 120" stroke={shade(c, 0.5)} strokeWidth="1.6" />
        </>
      );
    case 17: // Varsity jacket
      return (
        <>
          {base}
          <path d="M14 120 Q16 92 42 86 L46 86 Q32 100 31 120 Z M106 120 Q104 92 78 86 L74 86 Q88 100 89 120 Z" fill={isLight(c) ? "#3b2a1e" : "#f4ecd8"} />
          <path d="M44 85 Q60 99 76 85 L77 90 Q60 105 43 90 Z" fill={isLight(c) ? "#3b2a1e" : shade(c, 0.4)} />
          <path d="M43.5 87.5 Q60 102 76.5 87.5" fill="none" stroke="#f4ecd8" strokeWidth="1.2" />
          {[101, 109, 117].map((y) => (
            <circle key={y} cx="60" cy={y} r="1.4" fill="#f4ecd8" stroke={dark} strokeWidth="0.5" />
          ))}
          <text
            x="76"
            y="110"
            textAnchor="middle"
            fontSize="13"
            fontWeight="900"
            fontFamily="Georgia, serif"
            fill="#f4ecd8"
            stroke={shade(c, 0.5)}
            strokeWidth="0.9"
          >
            H
          </text>
        </>
      );
    case 18: // Flannel shirt
      return (
        <>
          {base}
          <g clipPath={clip}>
            <g fill={shade(c, 0.5)} opacity="0.45">
              {[20, 38, 56, 74, 92].map((x) => (
                <rect key={x} x={x} y="80" width="7" height="40" />
              ))}
              {[95, 110].map((y) => (
                <rect key={y} x="0" y={y} width="120" height="6" />
              ))}
            </g>
            <g stroke={isLight(c) ? "#b5332e" : "#ffffff"} strokeWidth="0.7" opacity="0.55">
              {[30, 48, 66, 84, 102].map((x) => (
                <path key={x} d={`M${x} 80 L${x} 120`} />
              ))}
              <path d="M0 104 L120 104" />
            </g>
          </g>
          <path d="M60 94 L60 120" stroke={shade(c, 0.45)} strokeWidth="1" />
          {[101, 109, 117].map((y) => (
            <circle key={y} cx="60" cy={y} r="1.1" fill="#f1f3f5" />
          ))}
        </>
      );
    case 19: {
      // Overalls (outfit colour is the dungarees, over a tee)
      const tee = isLight(c) ? "#3d4a5c" : mix(c, 0.8);
      return (
        <>
          <path d={BODY} fill={tee} />
          <path d={BODY} fill="#000000" opacity="0.06" />
          <path d="M47 87 Q60 97 73 87" fill="none" stroke={shade(tee, 0.15)} strokeWidth="2.2" />
          <path d="M42 99 L78 99 L80 120 L40 120 Z" fill={fill} stroke={dark} strokeWidth="0.8" />
          <path d="M34 87 L41 86 L47 100 L41 100 Z M86 87 L79 86 L73 100 L79 100 Z" fill={fill} stroke={dark} strokeWidth="0.8" strokeLinejoin="round" />
          <circle cx="44.5" cy="101.5" r="1.7" fill="#f5c542" stroke="#9a7413" strokeWidth="0.5" />
          <circle cx="75.5" cy="101.5" r="1.7" fill="#f5c542" stroke="#9a7413" strokeWidth="0.5" />
          <path d="M52 105 L68 105 L67 114 L53 114 Z" fill="none" stroke={dark} strokeWidth="0.9" strokeDasharray="1.4 1" />
        </>
      );
    }
    case 20: {
      // Dashiki
      const band = isDark(c) ? "#f5c542" : "#18202b";
      const trim = isDark(c) ? "#e5484d" : "#f5c542";
      return (
        <>
          {base}
          <path d="M37 87 Q60 124 83 87 L75 86 Q60 108 45 86 Z" fill={band} />
          <path d="M41 87.5 Q60 117 79 87.5" fill="none" stroke={trim} strokeWidth="1.4" strokeDasharray="2.6 1.6" />
          <g fill={trim}>
            {[-16, -8, 0, 8, 16].map((dx) => (
              <path key={dx} d={`M${60 + dx - 2} ${108 - Math.abs(dx) * 0.9} l2 4 l2 -4 Z`} />
            ))}
          </g>
          <path d="M56 89 L60 99 L64 89" fill="none" stroke={band} strokeWidth="1.6" />
          <g clipPath={clip} fill="none" stroke={band} strokeWidth="1.2" opacity="0.6">
            <path d="M18 112 l4 -4 l4 4 l4 -4 l4 4 M86 112 l4 -4 l4 4 l4 -4 l4 4" />
          </g>
        </>
      );
    }
    case 21: {
      // Kimono
      const band = isLight(c) ? "#18202b" : isDark(c) ? "#e5484d" : shade(c, 0.5);
      return (
        <>
          {base}
          <g clipPath={clip} fill={shade(c, -0.45)} opacity="0.55">
            {[
              [26, 98],
              [36, 110],
              [88, 96],
              [94, 110],
              [80, 116],
            ].map(([x, y]) => (
              <g key={`${x}-${y}`}>
                {[0, 72, 144, 216, 288].map((r) => (
                  <ellipse key={r} cx={x} cy={y - 2} rx="1.3" ry="2.2" transform={`rotate(${r} ${x} ${y})`} />
                ))}
              </g>
            ))}
          </g>
          <path d="M45 86 L51 86 L66 112 L60 112 Z" fill={band} />
          <path d="M75 86 L69 86 L50 116 L57 116 Z" fill={band} stroke="#ffffff" strokeWidth="0.6" />
          <path d="M22 110 Q60 120 98 110 L100 120 L20 120 Z" fill={band} />
          <path d="M21 113 Q60 123 99 113" fill="none" stroke="#f5c542" strokeWidth="1.2" />
        </>
      );
    }
    case 22: // Scrubs
      return (
        <>
          {base}
          <path d="M51 86 L60 99 L69 86 Z" fill={skin} />
          <path d="M49 86 L60 101 L71 86" fill="none" stroke={dark} strokeWidth="2" strokeLinejoin="round" />
          <path d="M70 104 L82 104 L81.5 114 L70.5 114 Z" fill={shade(c, 0.08)} stroke={dark} strokeWidth="0.8" />
          <path d="M73 100 L73 106" stroke="#18202b" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M76.5 101 L76.5 106" stroke="#e5484d" strokeWidth="1.4" strokeLinecap="round" />
        </>
      );
    case 23: // Chef's whites (outfit colour is the neckerchief)
      return (
        <>
          <path d={BODY} fill={mat} />
          <path d="M68 92 L66 120" stroke="#ced4da" strokeWidth="1.2" />
          {[100, 110].map((y) => (
            <g key={y} fill="#e9ecef" stroke="#adb5bd" strokeWidth="0.6">
              <circle cx="50" cy={y} r="1.8" />
              <circle cx="72" cy={y} r="1.8" />
            </g>
          ))}
        </>
      );
    case 24: {
      // Camo fatigues
      const tones = [shade(c, 0.35), shade(c, -0.3), shade(c, 0.6)];
      return (
        <>
          {base}
          <g clipPath={clip}>
            {CAMO.map(([d, t]) => (
              <path key={d} d={d} fill={tones[t]} opacity="0.85" />
            ))}
          </g>
          <path d="M60 94 L60 120" stroke={shade(c, 0.55)} strokeWidth="1" />
          <path
            d="M33 101 L47 101 L47 105 L40 107 L33 105 Z M87 101 L73 101 L73 105 L80 107 L87 105 Z"
            fill={shade(c, 0.2)}
            stroke={shade(c, 0.55)}
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
          <path d="M48 86 L60 98 L72 86 L67 84 L60 92 L53 84 Z" fill={shade(c, 0.15)} stroke={shade(c, 0.55)} strokeWidth="0.8" strokeLinejoin="round" />
        </>
      );
    }
    default:
      return base;
  }
}

/** The parts of an outfit that sit over the neck, drawn after it. */
function TopOver({ kind, color: c, id }: { kind: number; color: string; id: string }) {
  const fill = `url(#${id}-top)`;
  const dark = shade(c, 0.3);
  switch (kind) {
    case 5: // Polo collar
      return (
        <path d="M45 84 L51 85 L60 95 L53 101 Z M75 84 L69 85 L60 95 L67 101 Z" fill={shade(c, -0.15)} stroke={dark} strokeWidth="0.9" strokeLinejoin="round" />
      );
    case 6: // Turtleneck
      return (
        <g>
          <path d="M48 76 Q60 81 72 76 L74 92 Q60 99 46 92 Z" fill={fill} />
          <g fill="none" stroke={dark} strokeWidth="1" opacity="0.7">
            <path d="M47.5 82 Q60 87 72.5 82" />
            <path d="M46.5 87 Q60 93 73.5 87" />
          </g>
          <path d="M46 92 Q60 99 74 92" fill="none" stroke={shade(c, 0.4)} strokeWidth="1.4" />
        </g>
      );
    case 14: // Shirt collar and tie knot
      return (
        <g>
          <path d="M50 84 L57 95 L54 98 L47 88 Z M70 84 L63 95 L66 98 L73 88 Z" fill="#ffffff" stroke="#ced4da" strokeWidth="0.6" />
          <path d="M57 92 L63 92 L62 97 L58 97 Z" fill={[1, 7, 9].includes(TOP_COLOR.indexOf(c)) ? "#18202b" : "#b5332e"} />
        </g>
      );
    case 15: // Wing collar and bow tie
      return (
        <g>
          <path d="M51 86 L58 92 L54 94 Z M69 86 L62 92 L66 94 Z" fill="#ffffff" stroke="#ced4da" strokeWidth="0.6" />
          <path d="M51 89 L60 94 L51 99 Z M69 89 L60 94 L69 99 Z" fill={c} stroke={shade(c, 0.4)} strokeWidth="0.7" strokeLinejoin="round" />
          <circle cx="60" cy="94" r="2.2" fill={shade(c, 0.2)} />
        </g>
      );
    case 16: // Puffer collar
      return (
        <g>
          <path d="M47 77 Q60 82 73 77 L76 92 Q60 99 44 92 Z" fill={fill} stroke={dark} strokeWidth="1" />
          <path d="M60 81.5 L60 96" stroke={shade(c, 0.5)} strokeWidth="1.4" />
          <path d="M60 81.5 L60 96" stroke="#c9ced6" strokeWidth="0.5" />
        </g>
      );
    case 18: // Flannel collar
      return (
        <path
          d="M47 85 L60 97 L56 101 L44 90 Z M73 85 L60 97 L64 101 L76 90 Z"
          fill={shade(c, 0.1)}
          stroke={shade(c, 0.45)}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      );
    case 22: // Stethoscope
      return (
        <g fill="none" strokeLinecap="round">
          <path d="M48 84 Q44 96 46 106 M72 84 Q76 94 74 100" stroke="#5c6670" strokeWidth="1.8" />
          <circle cx="46" cy="108.5" r="2.8" fill="#c9ced6" stroke="#5c6670" strokeWidth="1" />
          <path d="M74 100 Q75 103 73 103 M74 100 Q77 102 76 104" stroke="#5c6670" strokeWidth="1.2" />
        </g>
      );
    case 23: // Chef's collar and neckerchief
      return (
        <g>
          <path d="M47 82 Q60 89 73 82 L74 88 Q60 96 46 88 Z" fill="#f8f9fa" stroke="#ced4da" strokeWidth="0.8" />
          <path d="M52 88 Q60 93 68 88 L65 97 L60 95 L55 97 Z" fill={c} stroke={shade(c, 0.35)} strokeWidth="0.6" strokeLinejoin="round" />
        </g>
      );
    default:
      return null;
  }
}
