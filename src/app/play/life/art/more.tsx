// More things for the shop (../item-art.tsx): earrings and a ring, the gele, aso-oke, a suit and
// sunglasses, a cookbook, earbuds, a speaker, a tablet, a drone and a camera, the kitchen and the
// comforts of home, a talking drum, adire and a terracotta head, a football, gloves and a treadmill.

type P = { id: string };

const shadow = (cx = 60, cy = 106, rx = 44) => <ellipse cx={cx} cy={cy} rx={rx} ry="4.5" fill="#00000018" />;
const Gold = ({ id }: P) => (
  <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stopColor="#fff6cf" />
    <stop offset="0.35" stopColor="#f2c14e" />
    <stop offset="0.65" stopColor="#a8740f" />
    <stop offset="1" stopColor="#ffe08a" />
  </linearGradient>
);

/** Gold earrings: a pair of big hoops, each with a little drop. */
function Earrings({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <Gold id={id} />
      </defs>
      {[38, 82].map((x, i) => (
        <g key={x} transform={`rotate(${i ? 8 : -8} ${x} 60)`}>
          <circle cx={x} cy="24" r="3" fill={`url(#${id}-gold)`} />
          <ellipse cx={x} cy="58" rx="20" ry="30" fill="none" stroke="#6b4505" strokeWidth="6.2" />
          <ellipse cx={x} cy="58" rx="20" ry="30" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="4.8" />
          <path d={`M${x - 3} 92 L${x} 100 L${x + 3} 92 Q${x} 88 ${x - 3} 92 Z`} fill={`url(#${id}-gold)`} />
          <path d={`M${x - 14} 40 Q${x - 18} 56 ${x - 12} 74`} fill="none" stroke="#fff" strokeWidth="1.6" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}

/** Signet ring: a heavy gold ring with a flat engraved face. */
function SignetRing({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <Gold id={id} />
        <radialGradient id={`${id}-face`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#495057" />
          <stop offset="1" stopColor="#111418" />
        </radialGradient>
      </defs>
      {shadow(60, 104, 34)}
      <ellipse cx="60" cy="72" rx="32" ry="26" fill="none" stroke="#6b4505" strokeWidth="11" />
      <ellipse cx="60" cy="72" rx="32" ry="26" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="9" />
      <path d="M38 40 Q60 26 82 40 L78 54 Q60 46 42 54 Z" fill={`url(#${id}-gold)`} stroke="#6b4505" strokeWidth="0.8" />
      <ellipse cx="60" cy="40" rx="17" ry="9" fill={`url(#${id}-face)`} stroke={`url(#${id}-gold)`} strokeWidth="2" />
      <text x="60" y="43.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#d9a632" fontFamily="Georgia, serif">
        N
      </text>
    </svg>
  );
}

/** Gele: the head tie in stiff, shining fabric, tied in its great fan. */
function Gele({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd6e7" />
          <stop offset="0.5" stopColor="#d6336c" />
          <stop offset="1" stopColor="#7a1a3d" />
        </linearGradient>
      </defs>
      {/* a mannequin head */}
      <path d="M44 112 Q42 92 50 84 L70 84 Q78 92 76 112 Z" fill="#8d5524" />
      <ellipse cx="60" cy="72" rx="18" ry="22" fill="#a0673a" />
      {/* the fan of folds standing up and out */}
      {[-42, -24, -8, 8, 24, 42].map((a, i) => (
        <path key={a} d="M60 60 Q50 26 60 8 Q70 26 60 60 Z" fill={`url(#${id}-f)`} stroke="#5c0f2b" strokeWidth="0.6" transform={`rotate(${a} 60 60) scale(1 ${i % 2 ? 0.86 : 1})`} />
      ))}
      <path d="M40 62 Q60 44 80 62 Q80 54 60 46 Q40 54 40 62 Z" fill="#c2255c" stroke="#5c0f2b" strokeWidth="0.8" />
      <path d="M42 60 Q60 46 78 60" fill="none" stroke="#ffe066" strokeWidth="1.2" strokeDasharray="2 2" />
    </svg>
  );
}

/** Designer sunglasses: big dark lenses in a gold frame. */
function Sunglasses({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <Gold id={id} />
        <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#495057" />
          <stop offset="0.5" stopColor="#111418" />
          <stop offset="1" stopColor="#343a40" />
        </linearGradient>
      </defs>
      {shadow(60, 90, 46)}
      <path d="M8 46 L4 40 M112 46 L116 40" stroke={`url(#${id}-gold)`} strokeWidth="3" strokeLinecap="round" />
      {[34, 86].map((x) => (
        <g key={x}>
          <path d={`M${x - 24} 44 Q${x - 24} 40 ${x - 20} 40 L${x + 20} 40 Q${x + 24} 40 ${x + 24} 44 Q${x + 24} 76 ${x} 76 Q${x - 24} 76 ${x - 24} 44 Z`} fill={`url(#${id}-l)`} stroke={`url(#${id}-gold)`} strokeWidth="2.4" />
          <path d={`M${x - 16} 46 L${x - 4} 46 L${x - 14} 64 Z`} fill="#ffffff" opacity="0.22" />
        </g>
      ))}
      <path d="M58 46 Q60 42 62 46" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="3" />
    </svg>
  );
}

/** Aso-oke set: the hand-woven strip cloth, folded, with its gold thread stripes. */
function AsoOke({ id }: P) {
  const fold = (y: number, k: string, dark: string, light: string) => (
    <g key={k}>
      <path d={`M14 ${y} L106 ${y} L110 ${y + 22} L10 ${y + 22} Z`} fill={dark} stroke="#3b0a1d" strokeWidth="0.8" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={14 + i * 9.4} y={y + 1} width="3.2" height="20" fill={light} opacity="0.85" transform={`skewX(${-(i - 5) * 0.6})`} />
      ))}
      <line x1="12" y1={y + 11} x2="108" y2={y + 11} stroke="#ffe066" strokeWidth="0.8" opacity="0.7" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      {shadow(60, 106, 50)}
      {fold(76, "a", "#5f3dc4", "#fab005")}
      {fold(54, "b", "#862e9c", "#ffd43b")}
      {fold(32, "c", "#5f3dc4", "#fab005")}
      {/* the matching fila cap on top */}
      <path d="M44 32 Q46 14 64 14 Q80 16 80 32 Z" fill="#862e9c" stroke="#3b0a1d" strokeWidth="0.8" />
      <path d="M48 28 L76 28" stroke="#ffd43b" strokeWidth="1.2" />
    </svg>
  );
}

/** Tailored suit: on its hanger, navy, white shirt, red tie, pocket square. */
function Suit({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-n`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0b1d2e" />
          <stop offset="0.5" stopColor="#1c3d5a" />
          <stop offset="1" stopColor="#0b1d2e" />
        </linearGradient>
      </defs>
      <path d="M60 6 q6 0 6 6 q0 4 -6 6" fill="none" stroke="#868e96" strokeWidth="2" />
      <path d="M60 18 L28 30 L92 30 Z" fill="none" stroke="#868e96" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M36 28 L18 36 L12 106 L30 108 L34 60 L36 112 L84 112 L86 60 L90 108 L108 106 L102 36 L84 28 L60 48 Z" fill={`url(#${id}-n)`} stroke="#000" strokeWidth="0.8" />
      {/* shirt and tie in the V */}
      <path d="M48 28 L60 48 L72 28 L66 26 Q60 30 54 26 Z" fill="#f8f9fa" />
      <path d="M58 32 L62 32 L64 36 L61 56 L59 56 L56 36 Z" fill="#c92a2a" />
      {/* lapels, pocket square, buttons */}
      <path d="M48 28 L42 40 L52 52 L60 48 Z M72 28 L78 40 L68 52 L60 48 Z" fill="#0b1d2e" opacity="0.6" />
      <path d="M74 56 L84 56 L82 60 L76 60 Z" fill="#ffffff" />
      <circle cx="58" cy="70" r="1.6" fill="#495057" />
      <circle cx="58" cy="80" r="1.6" fill="#495057" />
      <path d="M40 86 L52 86" stroke="#000" strokeWidth="0.8" opacity="0.6" />
    </svg>
  );
}

/** Earbuds: the case open, two buds standing in it. */
function Earbuds({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ced4da" />
        </linearGradient>
      </defs>
      {shadow(60, 104, 34)}
      <path d="M26 64 Q26 98 60 98 Q94 98 94 64 Z" fill={`url(#${id}-w)`} stroke="#adb5bd" strokeWidth="1" />
      <path d="M26 64 Q26 34 60 30 Q94 34 94 64 Z" fill={`url(#${id}-w)`} stroke="#adb5bd" strokeWidth="1" transform="rotate(-24 26 64)" />
      <rect x="57" y="86" width="6" height="2" rx="1" fill="#40c057" />
      {[44, 76].map((x, i) => (
        <g key={x} transform={`rotate(${i ? 12 : -12} ${x} 62)`}>
          <ellipse cx={x} cy="52" rx="9" ry="10" fill="#ffffff" stroke="#adb5bd" strokeWidth="1" />
          <rect x={x - 3} y="56" width="6" height="16" rx="3" fill="#ffffff" stroke="#adb5bd" strokeWidth="1" />
          <ellipse cx={x - 2} cy="49" rx="3" ry="2.4" fill="#343a40" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}

/** Party speaker: tall, two drivers, the lights glowing round them. */
function Speaker({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0.55" stopColor="#cc5de8" stopOpacity="0" />
          <stop offset="0.8" stopColor="#cc5de8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#4dabf7" stopOpacity="0" />
        </radialGradient>
      </defs>
      {shadow(60, 112, 30)}
      <rect x="32" y="8" width="56" height="102" rx="8" fill="#212529" stroke="#000" strokeWidth="1" />
      <rect x="48" y="4" width="24" height="6" rx="3" fill="#343a40" />
      {[
        [36, 13],
        [78, 20],
      ].map(([y, r]) => (
        <g key={y}>
          <circle cx="60" cy={y} r={r + 7} fill={`url(#${id}-glow)`} />
          <circle cx="60" cy={y} r={r} fill="#343a40" stroke="#495057" strokeWidth="1.4" />
          <circle cx="60" cy={y} r={r * 0.45} fill="#1a1b1e" />
          <circle cx={60 - r * 0.15} cy={y - r * 0.15} r={r * 0.16} fill="#868e96" />
        </g>
      ))}
      <rect x="44" y="54" width="32" height="5" rx="2" fill="#495057" />
      <circle cx="50" cy="56.5" r="1.4" fill="#40c057" />
    </svg>
  );
}

/** Tablet: a thin slab with a video playing. */
function Tablet({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff922b" />
          <stop offset="1" stopColor="#c2255c" />
        </linearGradient>
      </defs>
      {shadow(60, 104, 46)}
      <rect x="10" y="18" width="100" height="78" rx="8" fill="#212529" stroke="#495057" strokeWidth="1" />
      <rect x="15" y="23" width="90" height="68" rx="4" fill={`url(#${id}-s)`} />
      <path d="M15 76 Q40 58 60 70 Q82 82 105 62 L105 91 L15 91 Z" fill="#5f3dc4" opacity="0.6" />
      <circle cx="60" cy="52" r="10" fill="#000" opacity="0.35" />
      <path d="M57 46 L66 52 L57 58 Z" fill="#fff" />
      <rect x="20" y="84" width="80" height="2" rx="1" fill="#fff" opacity="0.4" />
      <rect x="20" y="84" width="34" height="2" rx="1" fill="#fff" />
    </svg>
  );
}

/** Camera drone: four arms, four rotors, the camera slung underneath. */
function Drone({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      {shadow(60, 108, 36)}
      {[
        [22, 34],
        [98, 34],
        [22, 78],
        [98, 78],
      ].map(([x, y], i) => (
        <g key={i}>
          <line x1="60" y1="56" x2={x} y2={y} stroke="#495057" strokeWidth="5" strokeLinecap="round" />
          <ellipse cx={x} cy={y - 4} rx="18" ry="4" fill="#adb5bd" opacity="0.45" />
          <rect x={x - 3} y={y - 6} width="6" height="8" rx="2" fill="#212529" />
        </g>
      ))}
      <rect x="42" y="44" width="36" height="24" rx="8" fill="#343a40" stroke="#212529" strokeWidth="1" />
      <rect x="48" y="48" width="10" height="3" rx="1.5" fill="#e03131" />
      <rect x="54" y="68" width="12" height="6" rx="2" fill="#212529" />
      <circle cx="60" cy="80" r="6" fill="#212529" />
      <circle cx="60" cy="80" r="3" fill="#4dabf7" />
    </svg>
  );
}

/** Pro camera: a black body, a big lens, the strap. */
function Camera({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <radialGradient id={`${id}-glass`} cx="38%" cy="35%" r="70%">
          <stop offset="0" stopColor="#74c0fc" />
          <stop offset="0.4" stopColor="#1c3d5a" />
          <stop offset="1" stopColor="#0b0c0e" />
        </radialGradient>
      </defs>
      {shadow(60, 100, 46)}
      <path d="M14 46 Q8 30 26 26" fill="none" stroke="#212529" strokeWidth="3" />
      <path d="M106 46 Q112 30 94 26" fill="none" stroke="#212529" strokeWidth="3" />
      <path d="M16 40 L44 40 L50 30 L74 30 L80 40 L104 40 Q108 40 108 44 L108 88 Q108 92 104 92 L16 92 Q12 92 12 88 L12 44 Q12 40 16 40 Z" fill="#343a40" stroke="#000" strokeWidth="1" />
      <rect x="14" y="48" width="18" height="38" rx="4" fill="#212529" />
      <circle cx="64" cy="66" r="25" fill="#212529" stroke="#495057" strokeWidth="2" />
      <circle cx="64" cy="66" r="20" fill="#495057" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        return <line key={i} x1={64 + Math.cos(a) * 21} y1={66 + Math.sin(a) * 21} x2={64 + Math.cos(a) * 24} y2={66 + Math.sin(a) * 24} stroke="#212529" strokeWidth="1" />;
      })}
      <circle cx="64" cy="66" r="14" fill={`url(#${id}-glass)`} />
      <circle cx="59" cy="61" r="3.5" fill="#fff" opacity="0.55" />
      <rect x="88" y="34" width="10" height="5" rx="1.5" fill="#e03131" />
    </svg>
  );
}

/** Nigerian cookbook: a book with a pot of jollof on the cover. */
function Cookbook({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      {shadow(62, 108, 36)}
      <path d="M34 18 L46 12 L46 102 L34 108 Z" fill="#f8f1e4" stroke="#c9b99a" strokeWidth="0.6" />
      <path d="M46 12 L92 16 L92 106 L46 102 Z" fill="#f08c00" stroke="#00000055" strokeWidth="0.8" />
      <text x="69" y="34" textAnchor="middle" fontSize="7.4" fontWeight="800" fill="#fff" fontFamily="Georgia, serif">
        JOLLOF
      </text>
      <text x="69" y="42" textAnchor="middle" fontSize="4.4" fontWeight="700" fill="#fff3bf" fontFamily="Arial, sans-serif">
        & MORE
      </text>
      {/* a pot of jollof */}
      <ellipse cx="69" cy="64" rx="17" ry="5" fill="#e8590c" />
      <path d="M52 64 Q52 84 69 86 Q86 84 86 64 Z" fill="#343a40" />
      <path d="M52 64 Q60 56 69 58 Q78 56 86 64" fill="#e03131" />
      {[58, 64, 72, 78].map((x) => (
        <circle key={x} cx={x} cy="62" r="1.2" fill="#ffd43b" />
      ))}
      <path d="M48 70 L52 70 M86 70 L90 70" stroke="#343a40" strokeWidth="3" strokeLinecap="round" />
      <path d="M46 12 L48 12 L48 102 L46 102 Z" fill="#00000040" />
    </svg>
  );
}

/** Blender: the jug half full of a pepper mix, on its base. */
function Blender({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-j`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e7f5ff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#d0ebff" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {shadow(60, 110, 30)}
      <path d="M38 84 L82 84 L86 108 L34 108 Z" fill="#343a40" />
      <circle cx="60" cy="96" r="5" fill="#495057" stroke="#868e96" strokeWidth="1" />
      <path d="M40 20 L80 20 L74 84 L46 84 Z" fill={`url(#${id}-j)`} stroke="#adb5bd" strokeWidth="1.2" />
      <path d="M43 52 Q60 46 77 52 L74 84 L46 84 Z" fill="#e8590c" opacity="0.85" />
      <path d="M80 28 Q92 30 90 48 Q88 60 78 62" fill="none" stroke="#adb5bd" strokeWidth="4" />
      <rect x="38" y="14" width="44" height="8" rx="3" fill="#343a40" />
      {[52, 60, 68].map((y) => (
        <line key={y} x1="46" y1={y} x2="52" y2={y} stroke="#868e96" strokeWidth="0.8" />
      ))}
    </svg>
  );
}

/** Gas cooker: four burners, one lit, the oven door below. */
function GasCooker({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-st`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#dee2e6" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#adb5bd" />
        </linearGradient>
      </defs>
      {shadow(60, 112, 44)}
      <path d="M14 36 L106 36 L110 48 L10 48 Z" fill="#343a40" />
      {[
        [32, 41],
        [56, 41],
        [70, 44],
        [92, 44],
      ].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx="8" ry="2.6" fill="#212529" stroke="#868e96" strokeWidth="0.8" />
          {i === 1 && <path d={`M${x - 6} ${y - 1} Q${x - 4} ${y - 8} ${x - 2} ${y - 1} Q${x} ${y - 10} ${x + 2} ${y - 1} Q${x + 4} ${y - 8} ${x + 6} ${y - 1}`} fill="#4dabf7" opacity="0.9" />}
        </g>
      ))}
      <rect x="10" y="48" width="100" height="60" rx="3" fill={`url(#${id}-st)`} stroke="#868e96" strokeWidth="1" />
      {[24, 44, 64, 84, 100].map((x) => (
        <circle key={x} cx={x} cy="56" r="3" fill="#343a40" />
      ))}
      <rect x="18" y="64" width="84" height="38" rx="3" fill="#212529" />
      <rect x="24" y="70" width="72" height="26" rx="2" fill="#343a40" />
      <rect x="30" y="62" width="60" height="3" rx="1.5" fill="#868e96" />
    </svg>
  );
}

/** Sofa set: a deep three-seater with cushions. */
function Sofa({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e599f7" />
          <stop offset="1" stopColor="#862e9c" />
        </linearGradient>
      </defs>
      {shadow(60, 100, 54)}
      <rect x="14" y="34" width="92" height="34" rx="10" fill={`url(#${id}-f)`} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={20 + i * 27.5} y="58" width="26" height="18" rx="5" fill="#be4bdb" stroke="#862e9c" strokeWidth="0.8" />
      ))}
      <rect x="4" y="46" width="18" height="40" rx="8" fill="#9c36b5" />
      <rect x="98" y="46" width="18" height="40" rx="8" fill="#9c36b5" />
      <rect x="12" y="76" width="96" height="12" rx="4" fill="#862e9c" />
      <rect x="26" y="40" width="16" height="14" rx="4" fill="#fcc419" transform="rotate(-8 34 47)" />
      <rect x="78" y="40" width="16" height="14" rx="4" fill="#20c997" transform="rotate(8 86 47)" />
      <rect x="14" y="88" width="5" height="8" fill="#5c3d1f" />
      <rect x="101" y="88" width="5" height="8" fill="#5c3d1f" />
    </svg>
  );
}

/** Air conditioner: the split unit on the wall, cool air flowing out. */
function AirConditioner({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dee2e6" />
        </linearGradient>
      </defs>
      <rect x="6" y="20" width="108" height="40" rx="10" fill={`url(#${id}-w)`} stroke="#adb5bd" strokeWidth="1" />
      <path d="M12 48 L108 48 L104 58 L16 58 Z" fill="#ced4da" />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1={20 + i * 16} y1="52" x2={22 + i * 16} y2="56" stroke="#868e96" strokeWidth="1" />
      ))}
      <rect x="86" y="28" width="16" height="6" rx="2" fill="#212529" />
      <text x="94" y="33" textAnchor="middle" fontSize="4.6" fill="#4dabf7" fontFamily="Arial, sans-serif">
        18°
      </text>
      <circle cx="16" cy="30" r="2" fill="#40c057" />
      {/* the cool air */}
      {[30, 50, 70, 90].map((x, i) => (
        <path key={x} d={`M${x} 64 Q${x - 6} ${78 + i} ${x + 2} ${92} Q${x + 8} ${102} ${x} ${112}`} fill="none" stroke="#74c0fc" strokeWidth="2.4" strokeLinecap="round" opacity="0.8" />
      ))}
      <path d="M58 80 l3 -5 l3 5 l-3 5 Z M45 96 l2 -3 l2 3 l-2 3 Z M76 98 l2 -3 l2 3 l-2 3 Z" fill="#a5d8ff" />
    </svg>
  );
}

/** Inverter and batteries: the box with its screen, two big batteries beside it. */
function Inverter({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      {shadow(60, 108, 50)}
      <rect x="10" y="22" width="44" height="84" rx="5" fill="#f1f3f5" stroke="#adb5bd" strokeWidth="1" />
      <rect x="16" y="30" width="32" height="16" rx="2" fill="#212529" />
      <text x="32" y="41" textAnchor="middle" fontSize="7" fontWeight="700" fill="#69db7c" fontFamily="Arial, sans-serif">
        230V
      </text>
      {[56, 64, 72].map((y, i) => (
        <circle key={y} cx="22" cy={y} r="2.2" fill={["#40c057", "#fab005", "#e03131"][i]} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1="30" y1={84 + i * 3} x2="48" y2={84 + i * 3} stroke="#adb5bd" strokeWidth="1.4" />
      ))}
      {[62, 88].map((x) => (
        <g key={x}>
          <rect x={x} y="50" width="24" height="56" rx="3" fill="#1c3d5a" stroke="#0b1d2e" strokeWidth="1" />
          <rect x={x + 4} y="46" width="5" height="5" fill="#e03131" />
          <rect x={x + 15} y="46" width="5" height="5" fill="#212529" />
          <rect x={x + 3} y="70" width="18" height="10" rx="1.5" fill="#fab005" />
        </g>
      ))}
      <path d="M50 26 Q60 10 74 46" fill="none" stroke="#212529" strokeWidth="2" />
    </svg>
  );
}

/** Talking drum: the hourglass drum with its tension cords and the curved stick. */
function TalkingDrum({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5c3d1f" />
          <stop offset="0.5" stopColor="#a9714b" />
          <stop offset="1" stopColor="#5c3d1f" />
        </linearGradient>
      </defs>
      {shadow(60, 110, 34)}
      <ellipse cx="60" cy="18" rx="24" ry="7" fill="#f3d9b1" stroke="#5c3d1f" strokeWidth="1.2" />
      <path d="M36 18 Q50 60 36 102 L84 102 Q70 60 84 18 Z" fill={`url(#${id}-w)`} />
      {Array.from({ length: 11 }, (_, i) => {
        const x = 38 + i * 4.4;
        return <path key={i} d={`M${x} 20 Q${60 + (x - 60) * 0.35} 60 ${x} 100`} fill="none" stroke="#e8c39e" strokeWidth="1" />;
      })}
      <ellipse cx="60" cy="102" rx="24" ry="7" fill="#f3d9b1" stroke="#5c3d1f" strokeWidth="1.2" />
      <path d="M96 30 Q106 50 96 70" fill="none" stroke="#5c3d1f" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

/** Adire wall hanging: indigo tie-dye cloth, white circles and lines, on a rod. */
function Adire({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <pattern id={`${id}-p`} width="22" height="22" patternUnits="userSpaceOnUse">
          <rect width="22" height="22" fill="#1b3a6b" />
          <circle cx="11" cy="11" r="7" fill="none" stroke="#dbe4ff" strokeWidth="1.6" />
          <circle cx="11" cy="11" r="3" fill="#dbe4ff" opacity="0.8" />
          <path d="M0 0 L22 22 M22 0 L0 22" stroke="#748ffc" strokeWidth="0.8" opacity="0.5" />
        </pattern>
      </defs>
      <rect x="10" y="10" width="100" height="5" rx="2.5" fill="#5c3d1f" />
      <path d="M16 15 L104 15 L104 104 Q60 110 16 104 Z" fill={`url(#${id}-p)`} stroke="#0b1d3d" strokeWidth="1" />
      {[22, 46, 70, 94].map((x) => (
        <line key={x} x1={x} y1="104" x2={x} y2="112" stroke="#1b3a6b" strokeWidth="1.6" />
      ))}
    </svg>
  );
}

/** Nok-style terracotta head: the long face, pierced eyes, the elaborate hair. */
function Terracotta({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0a868" />
          <stop offset="0.5" stopColor="#c0622a" />
          <stop offset="1" stopColor="#6e2f10" />
        </linearGradient>
      </defs>
      {shadow(60, 112, 30)}
      <rect x="38" y="96" width="44" height="14" rx="2" fill="#343a40" />
      <path d="M48 96 Q46 82 52 80 L68 80 Q74 82 72 96 Z" fill={`url(#${id}-c)`} />
      <path d="M40 46 Q40 80 60 84 Q80 80 80 46 Q80 22 60 22 Q40 22 40 46 Z" fill={`url(#${id}-c)`} stroke="#6e2f10" strokeWidth="0.8" />
      {/* the hair: buns and ridges */}
      <path d="M38 34 Q40 10 60 10 Q80 10 82 34 Q60 26 38 34 Z" fill="#a24f1f" />
      {[44, 60, 76].map((x) => (
        <circle key={x} cx={x} cy="14" r="6" fill="#a24f1f" stroke="#6e2f10" strokeWidth="0.6" />
      ))}
      {/* triangular eyes with pierced pupils, the brows, the mouth */}
      {[50, 70].map((x) => (
        <g key={x}>
          <path d={`M${x - 7} 48 Q${x} 40 ${x + 7} 48 Q${x} 52 ${x - 7} 48 Z`} fill="#8a3a14" />
          <circle cx={x} cy="47.5" r="1.6" fill="#2a0f04" />
        </g>
      ))}
      <path d="M58 50 L56 64 Q60 66 64 64 L62 50" fill="#a24f1f" />
      <path d="M52 72 Q60 76 68 72" fill="none" stroke="#5a250b" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M44 40 Q44 60 50 74" fill="none" stroke="#ffd8a8" strokeWidth="1.2" opacity="0.4" />
    </svg>
  );
}

/** Football: the classic panels, mid-bounce. */
function Football({ id }: P) {
  const pent = (cx: number, cy: number, r: number, k: string) => (
    <polygon key={k} points={Array.from({ length: 5 }, (_, i) => `${cx + Math.cos((i * 2 * Math.PI) / 5 - Math.PI / 2) * r},${cy + Math.sin((i * 2 * Math.PI) / 5 - Math.PI / 2) * r}`).join(" ")} fill="#212529" />
  );
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <radialGradient id={`${id}-b`} cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ced4da" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="60" cy="56" r="38" />
        </clipPath>
      </defs>
      <ellipse cx="60" cy="108" rx="30" ry="4" fill="#00000020" />
      <circle cx="60" cy="56" r="38" fill={`url(#${id}-b)`} stroke="#495057" strokeWidth="1" />
      <g clipPath={`url(#${id}-clip)`}>
        {pent(60, 56, 11, "c")}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
          return (
            <g key={i}>
              <line x1={60 + Math.cos(a) * 11} y1={56 + Math.sin(a) * 11} x2={60 + Math.cos(a) * 24} y2={56 + Math.sin(a) * 24} stroke="#495057" strokeWidth="1" />
              {pent(60 + Math.cos(a + Math.PI / 5) * 33, 56 + Math.sin(a + Math.PI / 5) * 33, 10, `o${i}`)}
            </g>
          );
        })}
      </g>
      <path d="M36 40 Q42 28 54 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/** Boxing gloves: a red pair, laced together, hanging. */
function BoxingGloves({ id }: P) {
  const glove = (x: number, flip: boolean, k: string) => (
    <g key={k} transform={flip ? `translate(${2 * x} 0) scale(-1 1)` : undefined}>
      <path d={`M${x - 18} 70 Q${x - 22} 40 ${x - 2} 36 Q${x + 18} 34 ${x + 18} 56 Q${x + 18} 80 ${x + 6} 86 L${x - 10} 86 Q${x - 18} 82 ${x - 18} 70 Z`} fill={`url(#${id}-r)`} stroke="#5c0a0a" strokeWidth="1" />
      <path d={`M${x - 18} 62 Q${x - 26} 58 ${x - 22} 48 Q${x - 18} 44 ${x - 14} 50`} fill="#c92a2a" stroke="#5c0a0a" strokeWidth="0.8" />
      <rect x={x - 12} y="86" width="20" height="16" rx="3" fill="#f8f9fa" stroke="#adb5bd" strokeWidth="0.8" />
      <path d={`M${x - 8} 46 Q${x} 40 ${x + 8} 44`} fill="none" stroke="#fff" strokeWidth="2" opacity="0.5" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <radialGradient id={`${id}-r`} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ff8787" />
          <stop offset="0.5" stopColor="#e03131" />
          <stop offset="1" stopColor="#7a1414" />
        </radialGradient>
      </defs>
      <path d="M38 102 Q60 6 82 102" fill="none" stroke="#f8f9fa" strokeWidth="2" />
      {glove(38, false, "l")}
      {glove(82, true, "r")}
    </svg>
  );
}

/** Treadmill: the running belt, the frame and the console. */
function Treadmill({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      {shadow(60, 104, 54)}
      <path d="M10 92 L96 92 Q104 92 104 86 L104 82 L10 82 Z" fill="#343a40" />
      <path d="M14 82 L100 82 L98 76 L18 76 Z" fill="#212529" />
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1={22 + i * 10} y1="77" x2={24 + i * 10} y2="81" stroke="#495057" strokeWidth="1" />
      ))}
      <path d="M90 78 L84 28 M98 78 L92 28" stroke="#868e96" strokeWidth="4" strokeLinecap="round" />
      <rect x="70" y="18" width="36" height="16" rx="4" fill="#212529" transform="rotate(-10 88 26)" />
      <rect x="76" y="21" width="22" height="8" rx="1.5" fill="#4dabf7" transform="rotate(-10 88 26)" />
      <text x="87" y="27.5" textAnchor="middle" fontSize="5" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif" transform="rotate(-10 88 26)">
        5.2km
      </text>
      <path d="M84 40 L66 46" stroke="#868e96" strokeWidth="3" strokeLinecap="round" />
      <circle cx="14" cy="88" r="3" fill="#495057" />
    </svg>
  );
}

export const ART: Record<string, (p: P) => React.ReactElement> = {
  gold_earrings: Earrings,
  signet_ring: SignetRing,
  gele: Gele,
  sunglasses: Sunglasses,
  aso_oke: AsoOke,
  suit: Suit,
  cookbook: Cookbook,
  earbuds: Earbuds,
  speaker: Speaker,
  tablet: Tablet,
  drone: Drone,
  camera: Camera,
  blender: Blender,
  gas_cooker: GasCooker,
  sofa: Sofa,
  air_conditioner: AirConditioner,
  inverter: Inverter,
  talking_drum: TalkingDrum,
  adire: Adire,
  terracotta: Terracotta,
  football: Football,
  boxing_gloves: BoxingGloves,
  treadmill: Treadmill,
};
