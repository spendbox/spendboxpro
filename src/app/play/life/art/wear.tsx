// Things you wear (../item-art.tsx): the bracelet, the diamond necklace, the Ankara outfit, the
// Agbada with its cap, the sneakers and the bag. Drawn in the same light, from the same side.

type P = { id: string };

/** Love-style bracelet: a flat gold oval band with little screw heads all round. */
function LoveBracelet({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset="0.35" stopColor="#f2c14e" />
          <stop offset="0.65" stopColor="#a8740f" />
          <stop offset="1" stopColor="#ffe08a" />
        </linearGradient>
        <linearGradient id={`${id}-in`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a5208" />
          <stop offset="1" stopColor="#d9a632" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="66" rx="44" ry="30" fill="#00000014" />
      {/* the band: outside face, then the inside seen through the opening */}
      <ellipse cx="60" cy="58" rx="44" ry="30" fill={`url(#${id}-g)`} stroke="#6b4505" strokeWidth="0.8" />
      <ellipse cx="60" cy="54" rx="36" ry="21" fill={`url(#${id}-in)`} />
      <ellipse cx="60" cy="56" rx="36" ry="21" fill="#f1f3f5" />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const x = 60 + Math.cos(a) * 40;
        const y = 58 + Math.sin(a) * 26;
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r="2.6" fill="#c8901a" stroke="#6b4505" strokeWidth="0.5" />
            <line x1="-1.6" y1="0.9" x2="1.6" y2="-0.9" stroke="#6b4505" strokeWidth="0.7" />
          </g>
        );
      })}
      <path d="M22 50 Q60 22 98 50" fill="none" stroke="#fff" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

/** Diamond necklace: a line of stones round the neck and a big drop at the front. */
function DiamondNecklace({ id }: P) {
  const stones = Array.from({ length: 21 }, (_, i) => {
    const t = -1.15 + (2.3 * i) / 20;
    // A U round the neck: highest at the shoulders, lowest at the front.
    return { x: 60 + Math.sin(t) * 38, y: 66 - (1 - Math.cos(t)) * 62, r: 3.2 + Math.cos(t) * 1.4 };
  });
  const gem = (x: number, y: number, r: number, k: string) => (
    <g key={k} transform={`translate(${x} ${y})`}>
      <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} fill={`url(#${id}-d)`} stroke="#5c7cfa" strokeWidth="0.4" />
      <polygon points={`0,${-r} ${r * 0.45},0 0,${r * 0.45} ${-r * 0.45},0`} fill="#ffffff" opacity="0.7" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-d`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#d0ebff" />
          <stop offset="0.7" stopColor="#91a7ff" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      {/* the velvet bust it sits on */}
      <path d="M14 120 Q20 70 42 58 Q60 70 78 58 Q100 70 106 120 Z" fill="#1c2541" />
      <path d="M42 58 Q60 70 78 58 L76 8 Q60 2 44 8 Z" fill="#232f55" />
      {stones.map((s, i) => gem(s.x, s.y, s.r, `s${i}`))}
      <line x1="60" y1="66" x2="60" y2="76" stroke="#ced4da" strokeWidth="1" />
      <g transform="translate(60 88)">
        <path d="M0,-12 L9,-3 L0,14 L-9,-3 Z" fill={`url(#${id}-d)`} stroke="#5c7cfa" strokeWidth="0.6" />
        <path d="M-9,-3 L9,-3 M0,-12 L-3,-3 L0,14 M0,-12 L3,-3 L0,14" fill="none" stroke="#ffffff" strokeWidth="0.6" opacity="0.8" />
      </g>
      <path d="M86 18 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 Z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

/** An Ankara pattern tile: bold circles and leaves in wax-print colours. */
function AnkaraPattern({ id, a, b, c }: { id: string; a: string; b: string; c: string }) {
  return (
    <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse">
      <rect width="14" height="14" fill={a} />
      <circle cx="7" cy="7" r="4.6" fill={b} />
      <circle cx="7" cy="7" r="2.2" fill={c} />
      <path d="M0 0 Q3.5 3 0 7 M14 7 Q10.5 10 14 14" fill={c} />
      <circle cx="0" cy="14" r="1.6" fill={b} />
      <circle cx="14" cy="0" r="1.6" fill={b} />
    </pattern>
  );
}

/** Ankara outfit: a fitted shirt in bold wax print on a hanger. */
function Ankara({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <AnkaraPattern id={`${id}-p`} a="#f08c00" b="#1864ab" c="#fab005" />
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <path d="M60 6 q6 0 6 6 q0 4 -6 6" fill="none" stroke="#868e96" strokeWidth="2" />
      <path d="M60 18 L26 30 L88 30 Z" fill="none" stroke="#868e96" strokeWidth="2.2" strokeLinejoin="round" />
      {/* body and sleeves */}
      <path d="M38 28 L22 34 L12 62 L24 66 L32 48 L32 112 L88 112 L88 48 L96 66 L108 62 L98 34 L82 28 Q60 40 38 28 Z" fill={`url(#${id}-p)`} stroke="#7a3e00" strokeWidth="1" />
      <path d="M38 28 L22 34 L12 62 L24 66 L32 48 L32 112 L88 112 L88 48 L96 66 L108 62 L98 34 L82 28 Q60 40 38 28 Z" fill={`url(#${id}-shade)`} />
      {/* collar, placket and buttons */}
      <path d="M48 30 L60 44 L72 30" fill="#1864ab" stroke="#0b3d6e" strokeWidth="1" />
      <line x1="60" y1="44" x2="60" y2="112" stroke="#0b3d6e" strokeWidth="1.2" />
      {[54, 68, 82, 96].map((y) => (
        <circle key={y} cx="60" cy={y} r="1.6" fill="#fff3bf" stroke="#7a3e00" strokeWidth="0.4" />
      ))}
    </svg>
  );
}

/** Agbada: the wide flowing robe, embroidered at the neck, with the fila cap above it. */
function Agbada({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e7f5ff" />
          <stop offset="0.5" stopColor="#74c0fc" />
          <stop offset="1" stopColor="#1971c2" />
        </linearGradient>
        <linearGradient id={`${id}-cap`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5c0f2b" />
          <stop offset="0.5" stopColor="#c2255c" />
          <stop offset="1" stopColor="#5c0f2b" />
        </linearGradient>
      </defs>
      {/* the cap (fila), tilted */}
      <path d="M44 22 Q46 4 70 6 Q82 8 80 22 Z" fill={`url(#${id}-cap)`} transform="rotate(-8 62 16)" />
      <path d="M44 22 Q62 26 80 22" fill="none" stroke="#3b0a1d" strokeWidth="1.4" transform="rotate(-8 62 16)" />
      {/* the robe: a great wide trapezium with the folds */}
      <path d="M48 30 Q60 36 72 30 L112 54 Q114 92 100 112 L20 112 Q6 92 8 54 Z" fill={`url(#${id}-c)`} stroke="#0b4f8a" strokeWidth="1" />
      <path d="M24 70 Q30 92 26 112 M96 70 Q90 92 94 112 M40 64 Q44 90 40 112 M80 64 Q76 90 80 112" fill="none" stroke="#0b4f8a" strokeWidth="0.8" opacity="0.5" />
      {/* the embroidered chest panel */}
      <path d="M48 30 Q60 36 72 30 L70 70 Q60 78 50 70 Z" fill="#ffd43b" opacity="0.35" />
      <path d="M48 30 Q60 36 72 30 M50 40 Q60 46 70 40 M51 50 Q60 56 69 50 M52 60 Q60 66 68 60" fill="none" stroke="#f08c00" strokeWidth="1.4" />
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={52 + i * 2.7} cy={44 + (i % 2) * 2} r="0.9" fill="#fab005" />
      ))}
    </svg>
  );
}

/** Designer sneakers: a chunky white trainer, side on. */
function Sneakers({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-up`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dee2e6" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="96" rx="50" ry="5" fill="#00000018" />
      {/* the chunky sole */}
      <path d="M10 80 Q8 92 20 94 L104 94 Q114 92 112 82 L108 74 L12 74 Z" fill="#f8f9fa" stroke="#adb5bd" strokeWidth="1" />
      <path d="M12 86 L110 86" stroke="#ced4da" strokeWidth="1.2" />
      <path d="M14 90 L108 90" stroke="#e9ecef" strokeWidth="1" />
      {/* the upper */}
      <path d="M14 76 Q12 58 26 52 L48 44 Q56 34 66 34 L78 36 Q84 46 98 54 Q110 60 110 76 Z" fill={`url(#${id}-up)`} stroke="#868e96" strokeWidth="1" />
      {/* the coloured swoosh-like panel, heel tab and toe */}
      <path d="M30 70 Q60 72 98 54 Q78 66 44 62 Z" fill="#e03131" />
      <path d="M78 36 Q84 46 98 54 L104 58 Q96 40 86 34 Z" fill="#1c7ed6" />
      <path d="M14 76 Q12 64 20 58 L26 76 Z" fill="#dee2e6" />
      {/* laces */}
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={50 + i * 6} y1={44 - i * 1.5} x2={56 + i * 6} y2={50 - i * 1.5} stroke="#495057" strokeWidth="1.6" strokeLinecap="round" />
      ))}
      <path d="M68 34 Q74 26 80 30" fill="none" stroke="#495057" strokeWidth="1.4" />
    </svg>
  );
}

/** Birkin-style bag: orange leather, the flap, two handles, the lock and the clochette. */
function Birkin({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-l`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffa94d" />
          <stop offset="0.6" stopColor="#e8590c" />
          <stop offset="1" stopColor="#a63c00" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3bf" />
          <stop offset="0.5" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#a8740f" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="108" rx="44" ry="4" fill="#00000018" />
      {/* handles */}
      <path d="M36 50 Q36 18 52 18 Q60 18 60 34" fill="none" stroke="#a63c00" strokeWidth="5" strokeLinecap="round" />
      <path d="M60 34 Q60 18 70 18 Q84 18 84 50" fill="none" stroke="#c2410c" strokeWidth="5" strokeLinecap="round" />
      {/* body */}
      <path d="M18 50 L102 50 L108 104 Q108 108 104 108 L16 108 Q12 108 12 104 Z" fill={`url(#${id}-l)`} stroke="#7a2e00" strokeWidth="1" />
      {/* the flap with its straps and stitching */}
      <path d="M18 50 L102 50 L100 70 Q60 78 20 70 Z" fill="#d9480f" stroke="#7a2e00" strokeWidth="1" />
      <path d="M22 54 L98 54 L96 68 Q60 75 24 68 Z" fill="none" stroke="#ffd8a8" strokeWidth="0.7" strokeDasharray="2 1.5" />
      <rect x="40" y="58" width="6" height="22" rx="2" fill="#c2410c" stroke="#7a2e00" strokeWidth="0.6" />
      <rect x="74" y="58" width="6" height="22" rx="2" fill="#c2410c" stroke="#7a2e00" strokeWidth="0.6" />
      {/* the lock and the clochette hanging off a handle */}
      <rect x="54" y="68" width="12" height="12" rx="2" fill={`url(#${id}-gold)`} stroke="#7a5208" strokeWidth="0.6" />
      <path d="M56 68 Q56 62 60 62 Q64 62 64 68" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="2" />
      <path d="M84 44 L88 58 L84 64 Q80 58 84 44 Z" fill="#c2410c" stroke="#7a2e00" strokeWidth="0.6" />
    </svg>
  );
}

export const ART: Record<string, (p: P) => React.ReactElement> = {
  cartier_love: LoveBracelet,
  diamond_necklace: DiamondNecklace,
  ankara: Ankara,
  agbada: Agbada,
  sneakers: Sneakers,
  hermes_birkin: Birkin,
};
