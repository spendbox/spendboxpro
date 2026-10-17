// Guns for the shop (../item-art.tsx): each drawn side-on with the muzzle to the right, and the
// details that tell one from another: the squared polymer slide of a Glock, the cylinder and vented
// rib of a revolver, the triangular barrel of a Desert Eagle, the long thin barrel of a Dane gun,
// the pump of a shotgun, the scope and bolt of a hunting rifle, the rail and curved magazine of an
// AR-15, the bipod and big glass of a sniper rifle, and the gold and wood of a showpiece AK.

type P = { id: string };

/** A soft shadow under the gun. */
const shadow = (cx = 60, cy = 104, rx = 46) => <ellipse cx={cx} cy={cy} rx={rx} ry="4.5" fill="#00000020" />;

/** A top-to-bottom gradient: highlight along the top edge, dark underneath. */
function V({ id, name, stops }: { id: string; name: string; stops: [number, string][] }) {
  return (
    <linearGradient id={`${id}-${name}`} x1="0" y1="0" x2="0" y2="1">
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
}

const STOPS: Record<string, [number, string][]> = {
  poly: [[0, "#4a5058"], [0.18, "#2a2e33"], [0.7, "#17191c"], [1, "#0b0c0e"]],
  black: [[0, "#6c737c"], [0.15, "#33383f"], [0.6, "#1a1d21"], [1, "#08090a"]],
  blued: [[0, "#9fb0c6"], [0.18, "#4a5a70"], [0.55, "#1d2633"], [0.85, "#0e131b"], [1, "#2d3a4c"]],
  steel: [[0, "#e9edf1"], [0.3, "#a9b2bc"], [0.7, "#5f6873"], [1, "#2f353c"]],
  gold: [[0, "#fff4c6"], [0.22, "#f3c64f"], [0.55, "#b8820f"], [0.82, "#7a5208"], [1, "#d9a63a"]],
  walnut: [[0, "#b06a35"], [0.35, "#7a4019"], [0.8, "#4c240c"], [1, "#2e1505"]],
  wood: [[0, "#c58a4e"], [0.4, "#8e5a2a"], [0.85, "#5a3414"], [1, "#3a200a"]],
  dark: [[0, "#8a4a22"], [0.4, "#5a2a10"], [1, "#2a1105"]],
  tan: [[0, "#e6d4a8"], [0.3, "#c2a978"], [0.75, "#8f7a50"], [1, "#655535"]],
  olive: [[0, "#9aa06a"], [0.3, "#6b7243"], [0.8, "#454a2a"], [1, "#2c301a"]],
  glass: [[0, "#9be7ff"], [0.5, "#1c6e9a"], [1, "#0a2233"]],
};

function Defs({ id, use }: { id: string; use: string[] }) {
  return (
    <defs>
      {use.map((n) => (
        <V key={n} id={id} name={n} stops={STOPS[n]} />
      ))}
    </defs>
  );
}

const u = (id: string, n: string) => `url(#${id}-${n})`;
/** A long gun is drawn flat along y=60 and tilted a little so it fills the square. */
const tilt = (deg: number, s = 1) => `translate(60 61) rotate(${deg}) scale(${s}) translate(-60 -60)`;

/** Glock 19: a squared black polymer slide, a rail under the front, a stippled grip. */
function Glock({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["poly", "black", "steel"]} />
      {shadow(60, 104, 42)}
      <g transform="rotate(-6 60 60)">
        {/* grip */}
        <path d="M17 52 L52 54 L49 64 Q45 66 46 72 Q42 74 43 80 Q39 82 40 88 L38 98 Q37 101 34 101 L22 101 Q18 101 18 97 L20 70 Q16 62 12 58 Q12 54 17 52 Z" fill="#1c1f23" />
        <path d="M14 54 L50 55" stroke="#4a5058" strokeWidth="1" opacity="0.6" />
        {Array.from({ length: 30 }, (_, i) => (
          <circle key={i} cx={26 + (i % 5) * 3.4 - Math.floor(i / 5) * 0.7} cy={70 + Math.floor(i / 5) * 4.4} r="0.6" fill="#5a6068" opacity="0.6" />
        ))}
        <path d="M18 97 L37 97 L36 101 L20 101 Z" fill="#0b0c0e" />
        {/* frame and trigger guard */}
        <path d="M40 52 L104 52 L104 59 L80 60 Q78 61 78 63 L78 70 Q78 76 72 76 L54 76 Q49 76 49 71 L49 62 Z M54 61 L74 61 L74 69 Q74 72 71 72 L57 72 Q54 72 54 69 Z" fill={u(id, "poly")} fillRule="evenodd" />
        <path d="M61 61 Q64 65 62 71" stroke="#16181b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        {[86, 91, 96].map((x) => (
          <rect key={x} x={x} y="56" width="3" height="3" rx="0.6" fill="#08090a" />
        ))}
        <rect x="42" y="56" width="4" height="2" rx="1" fill="#3b4047" />
        {/* slide */}
        <path d="M12 33 L106 33 L109 36 L109 52 L12 52 Z" fill={u(id, "black")} />
        <path d="M12 33 L106 33 L108 35 L12 35 Z" fill="#8a929c" opacity="0.55" />
        {[15, 18, 21, 24, 27].map((x) => (
          <path key={x} d={`M${x} 36 L${x + 1.4} 36 L${x + 1.4} 51 L${x} 51 Z`} fill="#000" opacity="0.6" />
        ))}
        <rect x="50" y="35.5" width="20" height="7" rx="0.8" fill={u(id, "steel")} />
        <rect x="50" y="42" width="20" height="1.2" fill="#000" opacity="0.5" />
        <rect x="16" y="30" width="5" height="3" fill="#16181b" />
        <rect x="100" y="30" width="3" height="3" fill="#16181b" />
        <circle cx="101.5" cy="31" r="0.7" fill="#ffffff" />
        <circle cx="18.5" cy="31" r="0.7" fill="#ffffff" />
        <rect x="108" y="40" width="1.6" height="7" fill="#2f353c" />
        <path d="M12 52 L109 52" stroke="#000" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

/** Colt Python: blued steel, a vented rib and full under-lug on the barrel, a fluted cylinder, wood. */
function Revolver({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["blued", "walnut"]} />
      {shadow(60, 104, 42)}
      <g transform="rotate(-5 60 60)">
        {/* grip */}
        <path d="M24 58 L42 62 Q38 72 34 80 Q28 92 30 100 Q24 104 14 101 Q6 98 9 88 Q14 74 20 62 Z" fill={u(id, "walnut")} />
        <path d="M20 68 Q15 80 13 94" stroke="#d99a5c" strokeWidth="1.6" fill="none" opacity="0.55" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${22 + i * 2.6} 70 L${15 + i * 2.6} 92`} stroke="#2e1505" strokeWidth="0.5" opacity="0.5" />
        ))}
        <circle cx="24" cy="80" r="2" fill="#c9a26a" stroke="#5a3a14" strokeWidth="0.6" />
        {/* frame */}
        <path d="M22 44 Q24 38 32 38 L64 38 L64 58 L52 60 Q48 70 40 66 L42 62 L26 60 Q20 56 22 44 Z" fill={u(id, "blued")} />
        {/* trigger guard and trigger */}
        <path d="M40 60 Q40 74 52 72 Q58 70 56 60" stroke={u(id, "blued")} strokeWidth="3" fill="none" />
        <path d="M46 60 Q48 65 46 69" stroke="#11161f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        {/* hammer */}
        <path d="M24 42 L21 35 Q20 32.6 22.6 33 L27 35 L31 40 Z" fill="#1d2633" />
        <path d="M22 34.4 L25.6 36" stroke="#4a5a70" strokeWidth="0.6" />
        {/* cylinder */}
        <rect x="35" y="39" width="25" height="20" rx="3" fill={u(id, "blued")} />
        {[42, 50].map((x) => (
          <rect key={x} x={x} y="41" width="5" height="16" rx="2.5" fill="#0a0e14" opacity="0.65" />
        ))}
        <rect x="36" y="40" width="23" height="2" rx="1" fill="#c3d0e0" opacity="0.5" />
        {/* barrel: under-lug, rib with vents */}
        <path d="M62 40 L113 40 L113 52 L108 56 L66 56 L62 58 Z" fill={u(id, "blued")} />
        <path d="M62 47 L113 47" stroke="#0a0e14" strokeWidth="0.6" opacity="0.6" />
        <path d="M30 35 L113 35 L113 40 L30 40 Z" fill={u(id, "blued")} />
        {[66, 72, 78, 84, 90, 96, 102].map((x) => (
          <rect key={x} x={x} y="36" width="3.4" height="2.6" fill="#e9ecef" />
        ))}
        <path d="M108 35 L111 31 L113 31 L113 35 Z" fill="#11161f" />
        <path d="M64 41 L112 41" stroke="#dbe5f0" strokeWidth="1" opacity="0.6" />
        <rect x="112" y="41" width="2" height="5" fill="#05070a" />
        <circle cx="30" cy="44" r="1.3" fill="#0a0e14" />
      </g>
    </svg>
  );
}

/** Desert Eagle, gold plated: a long slab-sided barrel with its triangular bevel, big slide, wide grip. */
function DesertEagle({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["gold", "black"]} />
      {shadow(60, 104, 44)}
      <g transform="rotate(-6 60 60)">
        {/* grip */}
        <path d="M12 54 L52 56 L48 70 L42 100 Q41 103 37 103 L18 103 Q13 103 14 98 L18 66 Q12 60 12 54 Z" fill="#1a1d21" />
        {Array.from({ length: 7 }, (_, i) => (
          <path key={i} d={`M${24 + i * 0.4} ${68 + i * 4} L${42 - i * 0.6} ${70 + i * 4}`} stroke="#3b4047" strokeWidth="1" />
        ))}
        <path d="M16 98 L39 98 L39 103 L20 103 Q15 103 16 98 Z" fill={u(id, "gold")} />
        {/* frame and trigger guard */}
        <path d="M38 54 L100 54 L100 62 L82 62 L82 74 Q82 78 77 78 L56 78 Q51 78 50 73 L48 62 Z M55 62 L77 62 L77 72 Q77 74 75 74 L58 74 Q55 74 55 71 Z" fill={u(id, "gold")} fillRule="evenodd" />
        <path d="M82 64 L86 64 L86 70 L82 72 Z" fill={u(id, "gold")} />
        <path d="M63 62 Q66 67 64 72" stroke="#7a5208" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        {/* slide */}
        <path d="M10 33 L56 33 L56 55 L10 55 Z" fill={u(id, "gold")} />
        {[13, 16, 19, 22, 25, 28].map((x) => (
          <rect key={x} x={x} y="38" width="1.4" height="15" fill="#6b4708" opacity="0.7" />
        ))}
        <rect x="12" y="29" width="6" height="4" fill="#7a5208" />
        {/* barrel: flat top, bevelled triangular sides, slanted muzzle */}
        <path d="M54 31 L112 31 L114 54 L54 54 Z" fill={u(id, "gold")} />
        <path d="M56 44 L113 44 L114 54 L56 54 Z" fill="#7a5208" opacity="0.45" />
        <path d="M56 44 L113 44" stroke="#fff4c6" strokeWidth="1" opacity="0.8" />
        <path d="M54 31 L112 31 L112 33.5 L54 33.5 Z" fill="#fffbe6" opacity="0.6" />
        <rect x="104" y="27" width="4" height="4" fill="#7a5208" />
        <rect x="64" y="35" width="26" height="5" rx="1" fill="#6b4708" opacity="0.35" />
        <path d="M54 31 L54 55" stroke="#6b4708" strokeWidth="0.8" />
        <rect x="111" y="36" width="2" height="6" fill="#2a1d05" />
        <circle cx="44" cy="58" r="1.4" fill="#6b4708" />
      </g>
    </svg>
  );
}

/** Dane gun: the Nigerian hunter's long gun, a long thin barrel bound to a plain carved stock with iron bands. */
function DaneGun({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["wood", "steel", "black"]} />
      {shadow(60, 98, 48)}
      <g transform={tilt(-24, 0.9)}>
        {/* barrel */}
        <path d="M36 55 L128 56.2 L128 58.6 L36 60 Z" fill={u(id, "steel")} />
        <rect x="126" y="55.2" width="2.6" height="4.2" fill="#2f353c" />
        <rect x="120" y="54" width="1.4" height="2" fill="#2f353c" />
        {/* stock: a long fore-end and a carved butt */}
        <path d="M30 57 L104 59 L104 63 L44 64 L38 68 L30 66 Z" fill={u(id, "wood")} />
        <path d="M34 56 L-6 64 Q-10 66 -9 70 L-6 80 L4 77 Q14 70 28 68 L40 68 L40 58 Z" fill={u(id, "wood")} />
        <path d="M30 60 Q14 64 -2 70" stroke="#e0ad78" strokeWidth="1" fill="none" opacity="0.6" />
        <path d="M18 66 L22 70 M12 68 L16 72" stroke="#3a200a" strokeWidth="0.8" />
        <path d="M-9 70 L-6 80 L-3 79 L-6 69 Z" fill="#2a1505" />
        {/* ramrod */}
        <path d="M46 63.5 L104 62" stroke="#c9a26a" strokeWidth="1.1" />
        {/* iron bands */}
        {[62, 82, 100].map((x) => (
          <rect key={x} x={x} y="54.6" width="2.4" height="9.4" rx="0.6" fill={u(id, "black")} />
        ))}
        {/* lock plate, hammer, trigger */}
        <path d="M30 59 L44 59 L42 64 L30 64 Z" fill={u(id, "black")} />
        <path d="M32 59 L30 52 Q30 49 33 50 L35 52 L34 59 Z" fill={u(id, "black")} />
        <path d="M36 66 Q36 74 42 72" stroke="#2f353c" strokeWidth="1.4" fill="none" />
        <path d="M38 66 L37 71" stroke="#2f353c" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Pump-action shotgun: black receiver, ribbed wooden pump on the magazine tube, wooden stock. */
function PumpShotgun({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["walnut", "black", "steel"]} />
      {shadow(60, 98, 48)}
      <g transform={tilt(-20, 0.84)}>
        {/* barrel and magazine tube */}
        <path d="M58 49 L126 49 L126 54 L58 54 Z" fill={u(id, "black")} />
        <path d="M58 55 L112 55 L112 60 L58 60 Z" fill={u(id, "black")} />
        <rect x="111" y="55" width="2" height="5" fill="#2f353c" />
        <circle cx="124" cy="48.5" r="1" fill="#e9ecef" />
        {/* receiver */}
        <path d="M30 46 Q32 44 36 44 L60 44 L60 62 L34 62 L30 58 Z" fill={u(id, "black")} />
        <rect x="40" y="48" width="14" height="5" rx="1" fill="#0b0c0e" />
        <rect x="41" y="49" width="12" height="1.6" fill="#495057" />
        {/* trigger guard */}
        <path d="M34 62 L50 62 Q50 70 44 70 L38 70 Q34 70 34 62 Z" fill="none" stroke="#1a1d21" strokeWidth="2" />
        <path d="M41 62 Q43 65 41 68" stroke="#1a1d21" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        {/* pump */}
        <path d="M66 52 L96 52 Q98 52 98 54 L98 61 Q98 63 96 63 L66 63 Q64 63 64 61 L64 54 Q64 52 66 52 Z" fill={u(id, "walnut")} />
        {[68, 72, 76, 80, 84, 88, 92].map((x) => (
          <rect key={x} x={x} y="53.6" width="1.6" height="8" rx="0.8" fill="#2e1505" opacity="0.7" />
        ))}
        {/* stock */}
        <path d="M31 46 L32 61 Q22 64 8 70 L-6 74 L-8 54 L4 51 Q18 49 31 46 Z" fill={u(id, "walnut")} />
        <path d="M30 48 Q16 51 -4 56" stroke="#e0a066" strokeWidth="1" fill="none" opacity="0.6" />
        <path d="M-8 54 L-6 74 L-10 75 L-12 54 Z" fill="#111" />
      </g>
    </svg>
  );
}

/** Hunting rifle: walnut stock with a cheek-piece, a slim barrel, a bolt handle and a scope on two mounts. */
function HuntingRifle({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["walnut", "black", "blued", "glass"]} />
      {shadow(60, 98, 48)}
      <g transform={tilt(-20, 0.84)}>
        {/* barrel */}
        <path d="M62 52 L128 53.4 L128 56 L62 57 Z" fill={u(id, "blued")} />
        {/* stock */}
        <path d="M30 52 L104 54.5 Q106 55 105 57 L100 58.6 L60 60 Q50 61 46 64 Q42 68 42 72 L36 72 Q34 66 28 64 Q16 66 -6 74 L-8 52 Q10 48 30 52 Z" fill={u(id, "walnut")} />
        <path d="M28 54 Q10 52 -6 55" stroke="#e0a066" strokeWidth="1" fill="none" opacity="0.6" />
        
        <path d="M-8 52 L-6 74 L-10 74.5 L-12 52 Z" fill="#111" />
        {/* action and bolt */}
        <path d="M34 49 L64 49 L64 54.5 L34 54 Z" fill={u(id, "blued")} />
        <path d="M38 52 L34 60" stroke="#1d2633" strokeWidth="2" strokeLinecap="round" />
        <circle cx="33.6" cy="61" r="2.6" fill={u(id, "blued")} />
        {/* trigger guard */}
        <path d="M46 59 Q46 66 52 65 Q56 64 56 59" fill="none" stroke="#1d2633" strokeWidth="1.6" />
        <path d="M50 59 Q51 62 50 64" stroke="#1d2633" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* scope mounts */}
        {[42, 70].map((x) => (
          <path key={x} d={`M${x} 49 L${x + 1} 43 L${x + 6} 43 L${x + 7} 49 Z`} fill={u(id, "black")} />
        ))}
        {/* scope */}
        <path d="M30 37 L40 38 L40 44 L30 45 Z" fill={u(id, "black")} />
        <rect x="38" y="38.4" width="46" height="5.2" fill={u(id, "black")} />
        <path d="M82 38.4 L92 34.6 L94 34.6 L94 47.4 L92 47.4 L82 43.6 Z" fill={u(id, "black")} />
        <rect x="93.4" y="35.2" width="1.4" height="11.6" rx="0.6" fill={u(id, "glass")} />
        <rect x="56" y="34" width="5" height="4.4" rx="0.8" fill={u(id, "black")} />
        <rect x="38" y="39" width="46" height="1.2" fill="#9aa1a9" opacity="0.5" />
        <rect x="28.6" y="37.6" width="1.4" height="6.8" fill={u(id, "glass")} />
      </g>
    </svg>
  );
}

/** AR-15: black, flat-top rail, long handguard, curved magazine, pistol grip and collapsible stock. */
function AR15({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["black", "poly"]} />
      {shadow(60, 98, 48)}
      <g transform={tilt(-18, 0.86)}>
        {/* barrel, front sight, flash hider */}
        <rect x="96" y="50" width="22" height="3.2" fill={u(id, "black")} />
        <path d="M100 50 L102 42 L104 42 L105 50 Z" fill={u(id, "black")} />
        <rect x="117" y="49" width="9" height="5.2" rx="0.8" fill={u(id, "black")} />
        {[119, 122].map((x) => (
          <rect key={x} x={x} y="49.6" width="1.2" height="4" fill="#000" />
        ))}
        {/* magazine */}
        <path d="M47 58 L58 58 L59 70 Q60 78 64 86 L53 89 Q49 80 48 70 Z" fill={u(id, "poly")} />
        <path d="M50 62 Q51 76 56 87" stroke="#4a5058" strokeWidth="0.8" fill="none" />
        {/* lower receiver, grip, trigger guard */}
        <path d="M34 54 L66 54 L66 60 L58 60 L46 60 L38 61 Z" fill={u(id, "poly")} />
        <path d="M36 59 L44 60 L40 76 Q39 78 36 78 L31 77 Q29 76 30 73 Z" fill={u(id, "poly")} />
        <path d="M44 61 L44 66 L54 66 L56 60" fill="none" stroke="#1a1d21" strokeWidth="1.6" />
        <path d="M48 60 Q50 63 48 65" stroke="#1a1d21" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* upper receiver */}
        <path d="M32 46 L66 46 L66 55 L32 55 Z" fill={u(id, "black")} />
        <rect x="46" y="48.5" width="12" height="4" rx="0.6" fill="#08090a" />
        <circle cx="60" cy="52" r="1.6" fill="#2a2e33" stroke="#555c64" strokeWidth="0.5" />
        {/* handguard with slots */}
        <path d="M66 45 L98 45 L98 56 L66 56 Z" fill={u(id, "black")} />
        {[70, 78, 86].map((x) => (
          <rect key={x} x={x} y="51" width="6" height="2" rx="1" fill="#000" />
        ))}
        {/* top rail */}
        <rect x="32" y="43" width="66" height="3" fill="#2a2e33" />
        {Array.from({ length: 22 }, (_, i) => (
          <rect key={i} x={33 + i * 3} y="43" width="1.6" height="1.4" fill="#000" />
        ))}
        {/* rear flip sight */}
        <path d="M36 43 L37 38 L41 38 L42 43 Z" fill={u(id, "black")} />
        <path d="M30 47 L34 47 L34 49 L30 49 Z" fill="#2a2e33" />
        {/* buffer tube and collapsible stock */}
        <rect x="8" y="47" width="25" height="5" fill={u(id, "black")} />
        <path d="M-6 44 L18 46 L18 54 L10 56 L2 64 L-6 64 Z" fill={u(id, "poly")} />
        <rect x="-8" y="43" width="3" height="22" rx="1" fill="#0b0c0e" />
        <rect x="4" y="50" width="8" height="2" fill="#000" opacity="0.6" />
      </g>
    </svg>
  );
}

/** Sniper rifle: long, in tan and olive, a heavy barrel with a muzzle brake, big scope, folding bipod. */
function Sniper({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["tan", "olive", "black", "glass"]} />
      {shadow(60, 98, 48)}
      <g transform={tilt(-14, 0.84)}>
        {/* bipod */}
        <path d="M80 58 L72 82" stroke="#1a1d21" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M82 58 L92 82" stroke="#33383f" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="77" y="56" width="8" height="4" rx="1" fill={u(id, "black")} />
        {/* heavy barrel and muzzle brake */}
        <path d="M76 49 L120 49.6 L120 54 L76 55 Z" fill={u(id, "black")} />
        <rect x="119" y="47.6" width="9" height="8" rx="1" fill={u(id, "black")} />
        {[121, 124].map((x) => (
          <rect key={x} x={x} y="48.6" width="1.6" height="6" fill="#000" />
        ))}
        {/* chassis forend */}
        <path d="M40 47 L84 47 L84 57 L40 58 Z" fill={u(id, "tan")} />
        {[50, 58, 66, 74].map((x) => (
          <rect key={x} x={x} y="51" width="5" height="2.4" rx="1.2" fill="#655535" />
        ))}
        {/* magazine */}
        <path d="M42 57 L54 57 L53 68 L43 68 Z" fill={u(id, "black")} />
        {/* grip, trigger guard */}
        <path d="M30 56 L38 57 L34 74 Q33 76 30 76 L25 75 Q23 74 24 71 Z" fill={u(id, "olive")} />
        <path d="M37 58 L37 63 Q38 66 42 65 L42 58" fill="none" stroke="#2c301a" strokeWidth="1.6" />
        {/* action and bolt */}
        <path d="M26 46 L42 46 L42 54 L26 54 Z" fill={u(id, "black")} />
        <path d="M30 52 L27 60" stroke="#1a1d21" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="26.6" cy="61" r="2.4" fill={u(id, "black")} />
        {/* butt stock with cheek riser */}
        <path d="M26 47 L4 49 L-8 46 L-8 70 L0 70 L8 60 L20 58 L26 56 Z" fill={u(id, "tan")} />
        <path d="M3 49.5 L4 45 L18 44 L19 48.6 Z" fill={u(id, "olive")} />
        <rect x="-10" y="45" width="3" height="26" rx="1" fill="#1a1d21" />
        {/* scope */}
        <rect x="32" y="42" width="5" height="4.4" fill={u(id, "black")} />
        <rect x="58" y="42" width="5" height="4.4" fill={u(id, "black")} />
        <path d="M20 34 L32 35 L32 42 L20 43 Z" fill={u(id, "olive")} />
        <rect x="30" y="35.4" width="46" height="6.4" fill={u(id, "olive")} />
        <path d="M74 35.4 L86 31 L92 31 L92 46 L86 46 L74 41.8 Z" fill={u(id, "olive")} />
        <rect x="91" y="31.6" width="1.6" height="13.8" rx="0.6" fill={u(id, "glass")} />
        <rect x="46" y="30" width="7" height="5.6" rx="1" fill={u(id, "black")} />
        <rect x="47.5" y="40.6" width="4" height="1" fill="#000" />
        <rect x="18.6" y="34.8" width="1.6" height="7.4" fill={u(id, "glass")} />
        <rect x="30" y="36" width="46" height="1.2" fill="#e8ebc8" opacity="0.4" />
      </g>
    </svg>
  );
}

/** Gold-plated AK: gold receiver, gas tube, sights and curved magazine, with dark wood furniture. */
function GoldAK({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <Defs id={id} use={["gold", "dark"]} />
      {shadow(60, 98, 48)}
      <g transform={tilt(-18, 0.86)}>
        {/* barrel, front sight, muzzle brake */}
        <rect x="88" y="51" width="32" height="3" fill={u(id, "gold")} />
        <path d="M108 51 L110 42 L112 42 L114 51 Z" fill={u(id, "gold")} />
        <path d="M118 50 L126 50 L127 55 L118 55 Z" fill={u(id, "gold")} />
        {/* gas tube with upper handguard */}
        <rect x="64" y="45" width="34" height="4" rx="1.5" fill={u(id, "gold")} />
        <path d="M66 44.4 L88 44.4 Q90 44.4 90 46.4 L90 48 L66 48 Z" fill={u(id, "dark")} />
        {/* lower handguard */}
        <path d="M64 49 L90 49 Q92 50 91 53 L88 58 L64 58 Z" fill={u(id, "dark")} />
        <path d="M66 50 L88 50" stroke="#c07a42" strokeWidth="0.8" opacity="0.6" />
        {/* magazine */}
        <path d="M46 57 L58 57 Q61 71 70 83 L60 90 Q49 78 46 62 Z" fill={u(id, "gold")} />
        <path d="M48 60 Q51 76 62 88" stroke="#fff4c6" strokeWidth="0.8" fill="none" opacity="0.7" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${50 + i * 3} ${64 + i * 6} L${57 + i * 3.6} ${62 + i * 6}`} stroke="#7a5208" strokeWidth="0.8" />
        ))}
        {/* receiver with dust cover and rear sight block */}
        <path d="M30 47 Q30 44 34 44 L64 44 L64 58 L30 58 Z" fill={u(id, "gold")} />
        <path d="M32 44 Q32 42 36 42 L60 43 L60 47 L32 47 Z" fill={u(id, "gold")} />
        <path d="M60 41 L66 41 L66 45 L60 45 Z" fill={u(id, "gold")} />
        <path d="M36 50 L54 50" stroke="#7a5208" strokeWidth="2" strokeLinecap="round" />
        <path d="M54 50 L57 52" stroke="#7a5208" strokeWidth="2" strokeLinecap="round" />
        <rect x="56" y="47" width="5" height="2" rx="1" fill="#7a5208" />
        {/* trigger guard */}
        <path d="M38 58 L38 63 Q38 66 42 66 L48 66 L48 58" fill="none" stroke={u(id, "gold")} strokeWidth="1.8" />
        <path d="M42 58 Q44 61 42 64" stroke="#7a5208" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* pistol grip */}
        <path d="M32 57 L39 57 L36 74 Q35 76 32 76 L28 75 Q26 74 27 71 Z" fill={u(id, "dark")} />
        {/* wooden stock with gold butt plate */}
        <path d="M30 46 L30 57 Q16 60 2 70 L-6 72 L-6 54 Q10 50 30 46 Z" fill={u(id, "dark")} />
        <path d="M28 48 Q12 51 -4 56" stroke="#c07a42" strokeWidth="1" fill="none" opacity="0.6" />
        <path d="M-6 54 L-6 72 L-9 72.6 L-9 54 Z" fill={u(id, "gold")} />
      </g>
    </svg>
  );
}

export const ART: Record<string, (p: P) => React.ReactElement> = {
  pistol_glock: Glock,
  revolver: Revolver,
  desert_eagle: DesertEagle,
  dane_gun: DaneGun,
  pump_shotgun: PumpShotgun,
  hunting_rifle: HuntingRifle,
  ar15: AR15,
  sniper: Sniper,
  gold_ak: GoldAK,
};
