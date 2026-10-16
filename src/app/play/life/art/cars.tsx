// Cars and rides for the shop (../item-art.tsx): side on, three-quarters lit, on a soft shadow. One
// careful car drawn from a profile (how long, how tall, where the roof starts and ends, the nose
// and the tail), so a Corolla, a G-Wagon and a Cullinan are each their own shape; plus the keke and
// the motorbike, which are their own things. No badges or logos: each is drawn to read as its kind.

type P = { id: string };

type Profile = {
  /** Body colour, and a darker shade for its lower half. */
  paint: string;
  shade: string;
  /** Lowest point of the body above the road (y), top of the bonnet line, top of the roof. */
  sill: number;
  belt: number;
  roof: number;
  /** Where the windscreen and rear window start and end along the car (x). */
  aFoot: number;
  aTop: number;
  cTop: number;
  cFoot: number;
  /** Front and back of the car (x) and how square the corners are (0 round, 1 square). */
  nose: number;
  tail: number;
  square: number;
  /** Wheel centres and size. */
  wheels: [number, number];
  wheelR: number;
  rim: "spoke" | "multi" | "classic";
  /** Chrome details. */
  chrome?: boolean;
  /** A spare wheel on the back (G-Wagon), roof rails, two-tone (a darker upper body). */
  spare?: boolean;
  rails?: boolean;
  twoTone?: string;
  /** An open load bed behind the cab (a pickup), or a sliding side door (a people carrier). */
  bed?: boolean;
  slider?: boolean;
};

const ROAD = 92;

function Wheel({ x, r, rim, id }: { x: number; r: number; rim: Profile["rim"]; id: string }) {
  const y = ROAD - r;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#1a1b1e" />
      <circle cx={x} cy={y} r={r * 0.66} fill={`url(#${id}-rim)`} stroke="#495057" strokeWidth="0.6" />
      {rim === "classic" ? (
        <circle cx={x} cy={y} r={r * 0.4} fill="none" stroke="#868e96" strokeWidth="1" />
      ) : (
        Array.from({ length: rim === "multi" ? 10 : 5 }, (_, i) => {
          const a = (i * 2 * Math.PI) / (rim === "multi" ? 10 : 5);
          return <line key={i} x1={x} y1={y} x2={x + Math.cos(a) * r * 0.62} y2={y + Math.sin(a) * r * 0.62} stroke="#495057" strokeWidth={rim === "multi" ? 0.9 : 2} />;
        })
      )}
      <circle cx={x} cy={y} r={r * 0.15} fill="#343a40" />
    </g>
  );
}

function Car({ id, p }: { id: string; p: Profile }) {
  const r = 3 + (1 - p.square) * 9;
  // The body: the nose, a bonnet rising to the windscreen, a curved roof (flatter the squarer the
  // car), the rear window down to the boot, and the tail.
  const crown = (1 - p.square) * 1.8;
  const noseTop = p.belt + 5 - p.square * 4;
  const body = [
    `M${p.nose + r} ${p.sill}`,
    `Q${p.nose} ${p.sill} ${p.nose} ${p.sill - r}`,
    `L${p.nose} ${noseTop + r * 0.5}`,
    `Q${p.nose} ${noseTop} ${p.nose + r} ${noseTop - 0.5}`,
    `Q${(p.nose + p.aFoot) / 2} ${p.belt - 0.5} ${p.aFoot} ${p.belt - 1}`,
    `L${p.aTop} ${p.roof}`,
    `Q${(p.aTop + p.cTop) / 2} ${p.roof - crown} ${p.cTop} ${p.roof}`,
    `L${p.cFoot} ${p.belt - 1}`,
    `L${p.tail - r} ${p.belt}`,
    `Q${p.tail} ${p.belt} ${p.tail} ${p.belt + r * 0.6}`,
    `L${p.tail} ${p.sill - r}`,
    `Q${p.tail} ${p.sill} ${p.tail - r} ${p.sill}`,
    "Z",
  ].join(" ");
  // The glass: inset inside the roof and pillars, split by the B pillar.
  const mid = (p.aTop + p.cTop) / 2;
  const gT = p.roof + 2.8;
  const gF = p.belt - 2.2;
  // Where a pillar is at height y (straight from its foot on the belt to its top at the roof).
  const along = (foot: number, top: number, y: number) => foot + ((top - foot) * (p.belt - 1 - y)) / Math.max(1, p.belt - 1 - p.roof);
  const front = `M${along(p.aFoot, p.aTop, gF) + 2.6} ${gF} L${along(p.aFoot, p.aTop, gT) + 2.6} ${gT} L${mid - 1.6} ${gT - crown * 0.5} L${mid - 1.6} ${gF} Z`;
  const back = `M${mid + 1.6} ${gF} L${mid + 1.6} ${gT - crown * 0.5} L${along(p.cFoot, p.cTop, gT) - 2.6} ${gT} L${along(p.cFoot, p.cTop, gF) - 2.6} ${gF} Z`;
  const [w1, w2] = p.wheels;
  const arch = (x: number) => `M${x - p.wheelR - 3} ${p.sill} A${p.wheelR + 3} ${p.wheelR + 3} 0 0 1 ${x + p.wheelR + 3} ${p.sill}`;
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-paint`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.paint} />
          <stop offset="0.55" stopColor={p.paint} />
          <stop offset="1" stopColor={p.shade} />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d0ebff" />
          <stop offset="0.6" stopColor="#4c6178" />
          <stop offset="1" stopColor="#1f2d3d" />
        </linearGradient>
        <radialGradient id={`${id}-rim`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#adb5bd" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy={ROAD + 1} rx="54" ry="4" fill="#00000022" />
      {p.spare && <rect x={p.tail - 1} y={p.belt + 2} width="7" height={(p.sill - p.belt) * 0.8} rx="3" fill="#1a1b1e" />}
      <path d={body} fill={`url(#${id}-paint)`} stroke="#00000066" strokeWidth="0.8" />
      {p.twoTone && <path d={`M${p.aFoot} ${p.belt - 1} L${p.aTop} ${p.roof} L${p.cTop} ${p.roof} L${p.cFoot} ${p.belt - 1} Z`} fill={p.twoTone} />}
      {p.rails && <line x1={p.aTop + 2} y1={p.roof - 1.6} x2={p.cTop - 2} y2={p.roof - 1.6} stroke="#343a40" strokeWidth="1.6" strokeLinecap="round" />}
      <path d={front} fill={`url(#${id}-glass)`} />
      <path d={back} fill={`url(#${id}-glass)`} />
      {/* the shoulder line catching the light, door gap, handles */}
      <line x1={p.nose + 4} y1={p.belt + 3} x2={p.tail - 4} y2={p.belt + 3} stroke="#ffffff" strokeWidth="1" opacity="0.5" />
      <line x1={mid} y1={p.belt} x2={mid + 1} y2={p.sill - 3} stroke="#00000044" strokeWidth="0.7" />
      <rect x={mid - 9} y={p.belt + 6} width="5" height="1.6" rx="0.8" fill={p.chrome ? "#e9ecef" : "#00000055"} />
      <rect x={mid + 5} y={p.belt + 6} width="5" height="1.6" rx="0.8" fill={p.chrome ? "#e9ecef" : "#00000055"} />
      {/* lights */}
      <rect x={p.nose} y={p.belt + 2.5} width="5" height="3.5" rx="1.5" fill="#fff9db" stroke="#adb5bd" strokeWidth="0.4" />
      <rect x={p.tail - 4} y={p.belt + 2.5} width="4" height="3.5" rx="1.2" fill="#e03131" />
      {p.chrome && <line x1={p.nose + 4} y1={p.sill - 3} x2={p.tail - 4} y2={p.sill - 3} stroke="#e9ecef" strokeWidth="1.2" opacity="0.9" />}
      {p.bed && (
        <g>
          <rect x={p.cFoot + 1} y={p.belt - 4} width={p.tail - p.cFoot - 2} height="4" rx="1" fill={p.shade} />
          <line x1={p.cFoot + 2} y1={p.belt - 4.5} x2={p.tail - 1} y2={p.belt - 4.5} stroke="#343a40" strokeWidth="1.2" />
          <line x1={p.cFoot + 1} y1={p.belt} x2={p.cFoot + 1} y2={p.sill - 3} stroke="#00000044" strokeWidth="0.7" />
        </g>
      )}
      {p.slider && <line x1={mid + 12} y1={p.belt + 4} x2={mid + 12} y2={p.sill - 4} stroke="#00000044" strokeWidth="0.7" />}
      {/* wheel arches and wheels */}
      <path d={arch(w1)} fill="#1a1b1e" />
      <path d={arch(w2)} fill="#1a1b1e" />
      <Wheel x={w1} r={p.wheelR} rim={p.rim} id={id} />
      <Wheel x={w2} r={p.wheelR} rim={p.rim} id={id} />
    </svg>
  );
}

const sedan = (paint: string, shade: string, extra: Partial<Profile> = {}): Profile => ({
  paint,
  shade,
  sill: 83,
  belt: 66,
  roof: 51,
  aFoot: 34,
  aTop: 50,
  cTop: 82,
  cFoot: 100,
  nose: 4,
  tail: 116,
  square: 0.15,
  wheels: [26, 94],
  wheelR: 10,
  rim: "spoke",
  ...extra,
});
const suv = (paint: string, shade: string, extra: Partial<Profile> = {}): Profile => ({
  paint,
  shade,
  sill: 80,
  belt: 58,
  roof: 36,
  aFoot: 34,
  aTop: 50,
  cTop: 96,
  cFoot: 108,
  nose: 4,
  tail: 116,
  square: 0.45,
  wheels: [25, 95],
  wheelR: 12,
  rim: "multi",
  rails: true,
  ...extra,
});

const CARS: Record<string, Profile> = {
  car_corolla: sedan("#ced4da", "#868e96", { rim: "classic", nose: 8, tail: 112, wheels: [28, 92], aFoot: 36, aTop: 50, cTop: 80, cFoot: 98 }),
  car_accord: sedan("#1c3d5a", "#0b1d2e", { aFoot: 32, aTop: 50, cTop: 84, cFoot: 102, roof: 52 }),
  car_camry: sedan("#212529", "#000000", { chrome: true, rim: "multi", roof: 50 }),
  car_lexus: suv("#f1f3f5", "#adb5bd", { square: 0.4, cTop: 92, cFoot: 108, chrome: true }),
  car_gwagon: suv("#1a1b1e", "#000000", { square: 1, aFoot: 36, aTop: 40, roof: 32, cTop: 104, cFoot: 106, spare: true, rails: false, belt: 56, tail: 110, nose: 6 }),
  car_bentayga: suv("#1d4b3a", "#0b2a1f", { chrome: true, square: 0.35, cTop: 92, cFoot: 108 }),
  car_urus: suv("#fab005", "#c47f00", { square: 0.05, roof: 44, belt: 62, aFoot: 30, aTop: 52, cTop: 86, cFoot: 108, sill: 82, rails: false, rim: "spoke" }),
  car_hilux: suv("#e9ecef", "#868e96", { square: 0.6, aFoot: 30, aTop: 42, roof: 36, cTop: 68, cFoot: 70, belt: 56, sill: 80, bed: true, rails: false, wheelR: 12.5 }),
  car_sienna: suv("#7d1d2f", "#3d0a15", { square: 0.35, aFoot: 24, aTop: 44, roof: 38, cTop: 104, cFoot: 110, belt: 60, slider: true, rails: true, rim: "multi" }),
  car_cullinan: suv("#c0c6cc", "#6c757d", { square: 0.9, roof: 30, belt: 56, aFoot: 38, aTop: 46, cTop: 100, cFoot: 104, twoTone: "#212529", chrome: true, rails: false, wheelR: 13 }),
};

/** Keke: the yellow tricycle, canopy and all. */
function Keke({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-y`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe066" />
          <stop offset="1" stopColor="#f08c00" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="96" rx="50" ry="4" fill="#00000022" />
      {/* canopy */}
      <path d="M22 26 Q24 18 34 18 L98 18 Q106 18 106 28 L106 34 L22 34 Z" fill="#212529" />
      <path d="M26 34 L26 70 M104 34 L104 74" stroke="#343a40" strokeWidth="2.4" />
      {/* the body: nose low at the front, the passenger bench behind */}
      <path d="M8 84 Q6 70 18 64 L32 40 Q34 36 40 36 L46 36 L46 70 L100 70 Q112 72 112 86 L112 88 L8 88 Z" fill={`url(#${id}-y)`} stroke="#7a4a00" strokeWidth="1" />
      <path d="M34 40 L46 40 L46 62 L24 62 Z" fill="#a5d8ff" opacity="0.85" />
      <rect x="54" y="52" width="40" height="18" rx="3" fill="#1864ab" />
      <path d="M50 76 L108 76" stroke="#2f9e44" strokeWidth="2.4" />
      <circle cx="16" cy="72" r="3" fill="#fff9db" stroke="#adb5bd" strokeWidth="0.5" />
      {/* wheels: one at the front, two behind (one seen) */}
      {[20, 92].map((x) => (
        <g key={x}>
          <circle cx={x} cy="86" r="8" fill="#1a1b1e" />
          <circle cx={x} cy="86" r="4" fill="#adb5bd" />
        </g>
      ))}
    </svg>
  );
}

/** Danfo: the yellow Lagos bus with its black stripes, door slid open for the conductor. */
function Danfo({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-y`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe066" />
          <stop offset="1" stopColor="#f08c00" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="96" rx="54" ry="4" fill="#00000022" />
      <path d="M8 86 L8 50 Q8 32 22 30 L100 30 Q112 30 112 44 L112 86 Q112 88 110 88 L10 88 Q8 88 8 86 Z" fill={`url(#${id}-y)`} stroke="#7a4a00" strokeWidth="1" />
      {/* windows, the open door, the stripes */}
      <path d="M12 52 Q12 38 22 36 L30 36 L30 54 L12 54 Z" fill="#a5d8ff" />
      {[34, 52, 70, 88].map((x) => (
        <rect key={x} x={x} y="36" width="15" height="18" rx="2" fill="#a5d8ff" stroke="#7a4a00" strokeWidth="0.6" />
      ))}
      <rect x="52" y="56" width="16" height="26" fill="#212529" />
      <rect x="70" y="34" width="2" height="48" fill="#7a4a00" opacity="0.4" />
      <rect x="8" y="62" width="104" height="3.5" fill="#212529" />
      <rect x="8" y="70" width="104" height="3.5" fill="#212529" />
      <circle cx="12" cy="78" r="2.6" fill="#fff9db" stroke="#adb5bd" strokeWidth="0.5" />
      <rect x="22" y="24" width="60" height="6" rx="2" fill="#343a40" />
      {[26, 96].map((x) => (
        <g key={x}>
          <path d={`M${x - 13} 88 A13 13 0 0 1 ${x + 13} 88`} fill="#1a1b1e" />
          <circle cx={x} cy="86" r="10" fill="#1a1b1e" />
          <circle cx={x} cy="86" r="5" fill="#adb5bd" />
        </g>
      ))}
    </svg>
  );
}

/** Motorbike: an okada-style street bike, side on. */
function Motorbike({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-tank`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="1" stopColor="#a61e1e" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="98" rx="50" ry="4" fill="#00000022" />
      {[26, 94].map((x) => (
        <g key={x}>
          <circle cx={x} cy="78" r="18" fill="none" stroke="#1a1b1e" strokeWidth="5" />
          <circle cx={x} cy="78" r="12" fill="none" stroke="#adb5bd" strokeWidth="0.8" />
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i * Math.PI) / 5;
            return <line key={i} x1={x} y1="78" x2={x + Math.cos(a) * 12} y2={78 + Math.sin(a) * 12} stroke="#adb5bd" strokeWidth="0.5" />;
          })}
          <circle cx={x} cy="78" r="2.4" fill="#495057" />
        </g>
      ))}
      {/* frame, engine, exhaust */}
      <path d="M26 78 L46 58 L74 58 L94 78" fill="none" stroke="#343a40" strokeWidth="3" />
      <rect x="46" y="62" width="22" height="18" rx="3" fill="#495057" />
      {Array.from({ length: 4 }, (_, i) => (
        <line key={i} x1="48" y1={65 + i * 4} x2="66" y2={65 + i * 4} stroke="#212529" strokeWidth="1.4" />
      ))}
      <path d="M58 80 L98 84" stroke="#ced4da" strokeWidth="4" strokeLinecap="round" />
      {/* tank, seat, rack */}
      <path d="M44 58 Q46 44 62 44 L72 46 Q74 56 70 58 Z" fill={`url(#${id}-tank)`} stroke="#7a1414" strokeWidth="0.8" />
      <path d="M70 50 L98 52 Q100 56 96 58 L70 58 Z" fill="#212529" />
      <rect x="92" y="48" width="14" height="4" rx="1" fill="#343a40" />
      {/* forks, bars, mirror, light */}
      <path d="M26 78 L40 36" stroke="#adb5bd" strokeWidth="3" strokeLinecap="round" />
      <path d="M34 34 L48 30" stroke="#212529" strokeWidth="3" strokeLinecap="round" />
      <path d="M44 30 L46 22" stroke="#212529" strokeWidth="1.4" />
      <ellipse cx="47" cy="21" rx="3" ry="2" fill="#adb5bd" />
      <circle cx="36" cy="42" r="4.4" fill="#fff9db" stroke="#495057" strokeWidth="1" />
    </svg>
  );
}

export const ART: Record<string, (p: P) => React.ReactElement> = {
  ...Object.fromEntries(Object.entries(CARS).map(([k, prof]) => [k, ({ id }: P) => <Car id={id} p={prof} />])),
  car_keke: Keke,
  car_danfo: Danfo,
  car_bike: Motorbike,
};
