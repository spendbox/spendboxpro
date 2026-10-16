// Things for your home and your life (../item-art.tsx): books, gadgets, furniture, art and fitness
// gear, drawn in the shop's light, slightly from above.

type P = { id: string };

const shadow = (cx = 60, cy = 106, rx = 44) => <ellipse cx={cx} cy={cy} rx={rx} ry="4.5" fill="#00000018" />;

/** A book standing slightly open towards you: cover colour, title band, page edges. */
function Book({ id, cover, band, title, thick = 14, ink = "#ffffff" }: P & { cover: string; band: string; title: string; thick?: number; ink?: string }) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-c`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={cover} stopOpacity="0.85" />
          <stop offset="0.2" stopColor={cover} />
          <stop offset="1" stopColor={cover} />
        </linearGradient>
      </defs>
      {shadow(62, 108, 36)}
      {/* pages seen from the side */}
      <path d={`M34 18 L${34 + thick} 12 L${34 + thick} 102 L34 108 Z`} fill="#f8f1e4" stroke="#c9b99a" strokeWidth="0.6" />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={36 + i * (thick / 6)} y1={17 - i} x2={36 + i * (thick / 6)} y2={107 - i} stroke="#e2d6bd" strokeWidth="0.5" />
      ))}
      {/* front cover */}
      <path d={`M${34 + thick} 12 L92 16 L92 106 L${34 + thick} 102 Z`} fill={`url(#${id}-c)`} stroke="#00000055" strokeWidth="0.8" />
      <rect x={38 + thick} y="34" width={50 - thick} height="22" fill={band} opacity="0.95" transform={`skewY(${4 / (58 - thick) * 10})`} />
      <text x={(34 + thick + 92) / 2} y="49" textAnchor="middle" fontSize="7" fontWeight="800" fill={ink} fontFamily="Georgia, serif">
        {title}
      </text>
      <line x1={40 + thick} y1="80" x2="86" y2="82" stroke="#ffffff" strokeWidth="1.2" opacity="0.5" />
      <line x1={40 + thick} y1="86" x2="80" y2="88" stroke="#ffffff" strokeWidth="1.2" opacity="0.35" />
      {/* spine edge */}
      <path d={`M${34 + thick} 12 L${36 + thick} 12 L${36 + thick} 102 L${34 + thick} 102 Z`} fill="#00000040" />
    </svg>
  );
}

const Novel = ({ id }: P) => <Book id={id} cover="#2b8a3e" band="#ffd43b" title="NOVEL" thick={12} />;
const BusinessBook = ({ id }: P) => <Book id={id} cover="#1c3d5a" band="#f59f00" title="BOSS" thick={14} />;
const Textbook = ({ id }: P) => <Book id={id} cover="#c92a2a" band="#ffffff" title="MATHS" thick={20} ink="#c92a2a" />;

/** Smartphone: dark glass, a bright home screen of app tiles, the camera bump peeking out. */
function Smartphone({ id }: P) {
  const apps = ["#ff6b6b", "#51cf66", "#339af0", "#fcc419", "#845ef7", "#20c997", "#f06595", "#ff922b", "#4dabf7", "#94d82d", "#e64980", "#748ffc"];
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5f3dc4" />
          <stop offset="1" stopColor="#1c7ed6" />
        </linearGradient>
      </defs>
      {shadow(60, 110, 26)}
      <rect x="34" y="6" width="52" height="104" rx="9" fill="#212529" stroke="#495057" strokeWidth="1" />
      <rect x="37.5" y="10" width="45" height="96" rx="6.5" fill={`url(#${id}-s)`} />
      <rect x="52" y="13" width="16" height="4.5" rx="2.25" fill="#0b0c0e" />
      <text x="60" y="34" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ffffff" fontFamily="Arial, sans-serif">
        10:10
      </text>
      {apps.map((c, i) => (
        <rect key={i} x={41.5 + (i % 4) * 9.6} y={44 + Math.floor(i / 4) * 11} width="7.6" height="7.6" rx="2" fill={c} />
      ))}
      <rect x="41.5" y="94" width="37" height="8" rx="4" fill="#ffffff" opacity="0.25" />
      <path d="M40 14 L58 14 L40 60 Z" fill="#ffffff" opacity="0.08" />
    </svg>
  );
}

/** Laptop: open, a little turned, the screen glowing with a spreadsheet. */
function Laptop({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-al`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f3f5" />
          <stop offset="1" stopColor="#adb5bd" />
        </linearGradient>
      </defs>
      {shadow(60, 100, 50)}
      <rect x="20" y="16" width="80" height="56" rx="4" fill="#343a40" />
      <rect x="23.5" y="19.5" width="73" height="49" rx="1.5" fill="#e7f5ff" />
      <rect x="23.5" y="19.5" width="73" height="7" fill="#1c7ed6" />
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 4 }, (_, c) => <rect key={`${r}${c}`} x={26 + c * 17.5} y={30 + r * 7} width="16" height="5.5" fill={r === 0 ? "#a5d8ff" : "#ffffff"} stroke="#d0ebff" strokeWidth="0.4" />),
      )}
      <polyline points="62,64 70,56 77,59 86,48 92,50" fill="none" stroke="#2f9e44" strokeWidth="1.6" />
      {/* base */}
      <path d="M12 74 L108 74 L114 86 Q114 90 110 90 L10 90 Q6 90 6 86 Z" fill={`url(#${id}-al)`} stroke="#868e96" strokeWidth="0.8" />
      <rect x="22" y="77" width="76" height="6" rx="1.5" fill="#495057" opacity="0.55" />
      <rect x="48" y="85" width="24" height="3" rx="1.5" fill="#868e96" opacity="0.6" />
    </svg>
  );
}

/** Generator: the red petrol "I better pass my neighbour", on its frame, with the pull cord. */
function Generator({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8787" />
          <stop offset="0.5" stopColor="#e03131" />
          <stop offset="1" stopColor="#a61e1e" />
        </linearGradient>
      </defs>
      {shadow(60, 104, 46)}
      {/* frame */}
      <path d="M16 100 L16 36 Q16 30 22 30 L98 30 Q104 30 104 36 L104 100" fill="none" stroke="#343a40" strokeWidth="4" strokeLinecap="round" />
      {/* tank and engine */}
      <rect x="22" y="34" width="76" height="26" rx="10" fill={`url(#${id}-r)`} stroke="#7a1414" strokeWidth="0.8" />
      <rect x="54" y="28" width="12" height="7" rx="2" fill="#343a40" />
      <rect x="24" y="62" width="44" height="34" rx="4" fill="#495057" />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1="28" y1={67 + i * 6} x2="64" y2={67 + i * 6} stroke="#212529" strokeWidth="2" />
      ))}
      {/* control panel: sockets, switch */}
      <rect x="70" y="62" width="28" height="34" rx="3" fill="#212529" />
      <circle cx="78" cy="72" r="4" fill="#f8f9fa" />
      <circle cx="90" cy="72" r="4" fill="#f8f9fa" />
      {[76.6, 79.4, 88.6, 91.4].map((x) => (
        <rect key={x} x={x - 0.5} y="70" width="1" height="3.4" fill="#212529" />
      ))}
      <rect x="76" y="82" width="16" height="7" rx="1.5" fill="#fab005" />
      <path d="M30 46 Q34 36 44 42" fill="none" stroke="#fff" strokeWidth="2" opacity="0.4" />
      {/* wheels */}
      <circle cx="22" cy="100" r="6" fill="#212529" />
      <circle cx="98" cy="100" r="6" fill="#212529" />
    </svg>
  );
}

/** Flat-screen TV on its stand, showing a football match. */
function TV({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-pitch`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b8a3e" />
          <stop offset="1" stopColor="#5c940d" />
        </linearGradient>
      </defs>
      {shadow(60, 100, 34)}
      <rect x="6" y="18" width="108" height="66" rx="3" fill="#111" />
      <rect x="9" y="21" width="102" height="60" fill={`url(#${id}-pitch)`} />
      {/* stripes, lines, players, the ball */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={9 + i * 17} y="21" width="8.5" height="60" fill="#ffffff" opacity="0.05" />
      ))}
      <line x1="60" y1="21" x2="60" y2="81" stroke="#ffffff" strokeWidth="0.8" opacity="0.8" />
      <circle cx="60" cy="51" r="10" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.8" />
      {[
        [40, 46, "#e03131"],
        [50, 62, "#e03131"],
        [72, 42, "#1c7ed6"],
        [80, 58, "#1c7ed6"],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <circle cx={x as number} cy={(y as number) - 3} r="1.6" fill="#7a4a2a" />
          <rect x={(x as number) - 1.8} y={(y as number) - 1.4} width="3.6" height="5" rx="1" fill={c as string} />
        </g>
      ))}
      <circle cx="64" cy="54" r="1.4" fill="#fff" />
      <rect x="13" y="24" width="30" height="7" rx="1" fill="#000" opacity="0.55" />
      <text x="28" y="29.5" textAnchor="middle" fontSize="4.8" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
        NGA 2 - 1 GHA
      </text>
      <path d="M9 21 L40 21 L9 60 Z" fill="#ffffff" opacity="0.06" />
      {/* stand */}
      <path d="M52 84 L68 84 L72 98 L48 98 Z" fill="#343a40" />
      <rect x="38" y="96" width="44" height="4" rx="2" fill="#212529" />
    </svg>
  );
}

/** Games console: the box standing up and a controller in front. */
function Console({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ced4da" />
        </linearGradient>
      </defs>
      {shadow(60, 106, 44)}
      {/* the console */}
      <path d="M30 8 Q42 6 46 10 L46 98 Q38 102 30 98 Z" fill={`url(#${id}-w)`} stroke="#adb5bd" strokeWidth="0.8" />
      <rect x="44" y="12" width="10" height="84" rx="2" fill="#212529" />
      <path d="M52 10 Q62 6 70 10 L70 98 Q62 102 52 98 Z" fill={`url(#${id}-w)`} stroke="#adb5bd" strokeWidth="0.8" />
      <rect x="47" y="16" width="4" height="1.6" rx="0.8" fill="#4dabf7" />
      {/* the controller */}
      <path d="M58 78 Q66 70 82 72 L98 72 Q114 70 116 92 Q118 106 108 106 Q100 106 96 96 L84 96 Q80 106 72 106 Q62 106 62 94 Z" fill="#212529" stroke="#000" strokeWidth="0.8" />
      <circle cx="76" cy="86" r="4.5" fill="#343a40" stroke="#495057" strokeWidth="0.8" />
      <circle cx="98" cy="90" r="4.5" fill="#343a40" stroke="#495057" strokeWidth="0.8" />
      {[
        [104, 80, "#40c057"],
        [109, 84, "#fa5252"],
        [99, 84, "#4dabf7"],
        [104, 88, "#fcc419"],
      ].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r="1.8" fill={c as string} />
      ))}
      <path d="M68 80 h3 v-3 h2.4 v3 h3 v2.4 h-3 v3 h-2.4 v-3 h-3 Z" fill="#868e96" />
    </svg>
  );
}

/** Standing fan: the round guard, three blades, the pole and the base. */
function Fan({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <radialGradient id={`${id}-b`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#a5d8ff" />
          <stop offset="1" stopColor="#1971c2" />
        </radialGradient>
      </defs>
      {shadow(60, 112, 26)}
      <rect x="57.5" y="62" width="5" height="44" rx="2" fill="#adb5bd" />
      <ellipse cx="60" cy="108" rx="24" ry="5" fill="#495057" />
      <rect x="54" y="58" width="12" height="10" rx="3" fill="#343a40" />
      {/* blades */}
      {[0, 120, 240].map((a) => (
        <ellipse key={a} cx="60" cy="18" rx="8" ry="15" fill={`url(#${id}-b)`} opacity="0.95" transform={`rotate(${a + 20} 60 34)`} />
      ))}
      <circle cx="60" cy="34" r="5" fill="#212529" />
      {/* the guard */}
      <circle cx="60" cy="34" r="30" fill="none" stroke="#868e96" strokeWidth="1.6" />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI) / 8;
        return <line key={i} x1="60" y1="34" x2={60 + Math.cos(a) * 30} y2={34 + Math.sin(a) * 30} stroke="#adb5bd" strokeWidth="0.5" />;
      })}
      <circle cx="60" cy="34" r="18" fill="none" stroke="#ced4da" strokeWidth="0.6" />
      <rect x="52" y="74" width="16" height="6" rx="1.5" fill="#343a40" />
      {[54.5, 58.7, 62.9].map((x) => (
        <rect key={x} x={x} y="75.5" width="2.8" height="3" rx="0.6" fill="#ced4da" />
      ))}
    </svg>
  );
}

/** Orthopaedic bed: thick mattress, two pillows, a folded throw. */
function Bed({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9714b" />
          <stop offset="1" stopColor="#6d3f22" />
        </linearGradient>
      </defs>
      {shadow(60, 104, 52)}
      {/* headboard */}
      <rect x="10" y="22" width="100" height="44" rx="6" fill={`url(#${id}-wood)`} />
      <rect x="16" y="28" width="88" height="30" rx="4" fill="#d9b48f" opacity="0.5" />
      {/* mattress (top face, then the side) */}
      <path d="M8 62 L112 62 L116 80 L4 80 Z" fill="#f8f9fa" stroke="#ced4da" strokeWidth="0.8" />
      <rect x="4" y="80" width="112" height="12" rx="2" fill="#e9ecef" stroke="#ced4da" strokeWidth="0.8" />
      <line x1="6" y1="86" x2="114" y2="86" stroke="#ced4da" strokeWidth="0.8" strokeDasharray="3 2" />
      {/* pillows and the throw */}
      <rect x="18" y="52" width="34" height="14" rx="6" fill="#ffffff" stroke="#dee2e6" strokeWidth="0.8" />
      <rect x="68" y="52" width="34" height="14" rx="6" fill="#ffffff" stroke="#dee2e6" strokeWidth="0.8" />
      <path d="M8 72 L112 72 L114 78 L6 78 Z" fill="#0c8599" />
      <rect x="4" y="92" width="6" height="12" fill="#6d3f22" />
      <rect x="110" y="92" width="6" height="12" fill="#6d3f22" />
    </svg>
  );
}

/** Fridge: two doors, handles, a fruit magnet. */
function Fridge({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-st`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#dee2e6" />
          <stop offset="0.4" stopColor="#ffffff" />
          <stop offset="1" stopColor="#adb5bd" />
        </linearGradient>
      </defs>
      {shadow(60, 112, 30)}
      <rect x="32" y="6" width="56" height="104" rx="6" fill={`url(#${id}-st)`} stroke="#868e96" strokeWidth="1" />
      <line x1="32" y1="40" x2="88" y2="40" stroke="#868e96" strokeWidth="1" />
      <rect x="78" y="16" width="4" height="18" rx="2" fill="#868e96" />
      <rect x="78" y="48" width="4" height="30" rx="2" fill="#868e96" />
      <rect x="40" y="52" width="16" height="10" rx="2" fill="#4dabf7" opacity="0.85" />
      <text x="48" y="59" textAnchor="middle" fontSize="5" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
        4°C
      </text>
      <circle cx="46" cy="24" r="4" fill="#fa5252" />
      <path d="M46 20 q1 -3 3 -3" stroke="#2f9e44" strokeWidth="1" fill="none" />
      <rect x="36" y="106" width="8" height="5" rx="1" fill="#495057" />
      <rect x="76" y="106" width="8" height="5" rx="1" fill="#495057" />
    </svg>
  );
}

/** Solar panel kit: a tilted panel catching the sun, its battery and inverter. */
function Solar({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-cell`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4c6ef5" />
          <stop offset="1" stopColor="#1c2b6b" />
        </linearGradient>
      </defs>
      {shadow(60, 108, 50)}
      <circle cx="98" cy="18" r="10" fill="#fcc419" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={98 + Math.cos(a) * 13} y1={18 + Math.sin(a) * 13} x2={98 + Math.cos(a) * 17} y2={18 + Math.sin(a) * 17} stroke="#fcc419" strokeWidth="2" strokeLinecap="round" />;
      })}
      {/* the panel in perspective, with its cells */}
      <path d="M10 76 L28 30 L96 30 L84 76 Z" fill="#ced4da" stroke="#868e96" strokeWidth="1" />
      {Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) => {
          const y0 = 32 + r * 10.8;
          const shift = (76 - y0) * (18 / 46);
          const x0 = 12 + shift + c * 11.6 - (r * 0.2);
          return <path key={`${r}${c}`} d={`M${x0} ${y0 + 10} L${x0 + 4} ${y0} L${x0 + 14.5} ${y0} L${x0 + 10.6} ${y0 + 10} Z`} fill={`url(#${id}-cell)`} stroke="#dee2e6" strokeWidth="0.5" transform="translate(-2 0)" />;
        }),
      )}
      <path d="M30 32 L52 32 L22 74 Z" fill="#ffffff" opacity="0.12" />
      <line x1="46" y1="76" x2="46" y2="96" stroke="#868e96" strokeWidth="3" />
      {/* battery and inverter */}
      <rect x="66" y="82" width="22" height="22" rx="3" fill="#2b8a3e" />
      <rect x="72" y="79" width="4" height="4" fill="#495057" />
      <rect x="78" y="79" width="4" height="4" fill="#495057" />
      <rect x="92" y="84" width="20" height="20" rx="3" fill="#f1f3f5" stroke="#adb5bd" strokeWidth="0.8" />
      <rect x="95" y="88" width="14" height="6" rx="1" fill="#212529" />
      <text x="102" y="92.8" textAnchor="middle" fontSize="4.4" fill="#69db7c" fontFamily="Arial, sans-serif">
        98%
      </text>
    </svg>
  );
}

/** A framed painting: gold frame, a Lagos street at sunset with the yellow danfos. */
function Painting({ id, grand = false }: P & { grand?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3bf" />
          <stop offset="0.5" stopColor="#d9a632" />
          <stop offset="1" stopColor="#7a5208" />
        </linearGradient>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={grand ? "#2b1d3a" : "#ff8787"} />
          <stop offset="1" stopColor={grand ? "#a8743b" : "#ffd43b"} />
        </linearGradient>
      </defs>
      {shadow(60, 108, 40)}
      <rect x="10" y="14" width="100" height="84" fill={`url(#${id}-f)`} stroke="#5c3d05" strokeWidth="1" />
      {grand && <rect x="13" y="17" width="94" height="78" fill="none" stroke="#5c3d05" strokeWidth="1.2" />}
      <rect x="18" y="22" width="84" height="68" fill={`url(#${id}-sky)`} />
      {grand ? (
        // A dancer in the Nigerian-modernist style: tall and elongated, arms raised, skirt swirling.
        <g>
          <path d="M18 82 Q40 76 60 84 Q80 90 102 80 L102 90 L18 90 Z" fill="#5c3d1f" opacity="0.6" />
          <circle cx="60" cy="31" r="4.6" fill="#2a1c10" />
          <path d="M58 34 Q56 40 58 44" fill="none" stroke="#2a1c10" strokeWidth="2.6" />
          {/* arms up and out, like a gele dance */}
          <path d="M56 46 Q46 40 42 28 M64 46 Q74 40 80 30" fill="none" stroke="#2a1c10" strokeWidth="2.6" strokeLinecap="round" />
          {/* torso and the swirling skirt */}
          <path d="M55 44 Q60 42 65 44 L64 58 Q60 60 56 58 Z" fill="#2a1c10" />
          <path d="M56 58 Q42 72 38 86 Q50 82 60 86 Q70 82 82 86 Q76 70 64 58 Z" fill="#7a2e1c" />
          <path d="M56 62 Q48 74 46 84 M64 62 Q72 74 74 84" fill="none" stroke="#e8b46b" strokeWidth="1.2" opacity="0.8" />
          <path d="M42 28 l-3 -3 M80 30 l3 -3" stroke="#2a1c10" strokeWidth="2" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <circle cx="78" cy="44" r="9" fill="#fff3bf" opacity="0.9" />
          {[
            [20, 46, 10, 44],
            [32, 52, 12, 38],
            [46, 40, 9, 50],
            [86, 50, 14, 40],
          ].map(([x, y, w, hgt], i) => (
            <rect key={i} x={x} y={y} width={w} height={hgt} fill={i % 2 ? "#5f3dc4" : "#862e9c"} opacity="0.85" />
          ))}
          <rect x="18" y="76" width="84" height="14" fill="#495057" />
          <rect x="30" y="72" width="22" height="10" rx="2" fill="#fcc419" />
          <rect x="62" y="74" width="20" height="9" rx="2" fill="#fab005" />
          <circle cx="34" cy="83" r="2" fill="#212529" />
          <circle cx="48" cy="83" r="2" fill="#212529" />
          <circle cx="66" cy="84" r="2" fill="#212529" />
          <circle cx="78" cy="84" r="2" fill="#212529" />
        </g>
      )}
    </svg>
  );
}
const PlainPainting = ({ id }: P) => <Painting id={id} />;
const MasterPainting = ({ id }: P) => <Painting id={id} grand />;

/** Bronze sculpture: a Benin-style head on a plinth, in polished bronze. */
function Sculpture({ id }: P) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-br`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0c08a" />
          <stop offset="0.45" stopColor="#a8642a" />
          <stop offset="1" stopColor="#4a2a10" />
        </linearGradient>
      </defs>
      {shadow(60, 112, 30)}
      <rect x="36" y="92" width="48" height="18" rx="2" fill="#343a40" />
      <rect x="32" y="88" width="56" height="6" rx="1.5" fill="#495057" />
      {/* the coral-beaded collar and the head */}
      <path d="M40 88 Q40 72 46 70 L74 70 Q80 72 80 88 Z" fill={`url(#${id}-br)`} />
      {[74, 78, 82].map((y) => (
        <line key={y} x1="42" y1={y} x2="78" y2={y} stroke="#4a2a10" strokeWidth="1.4" />
      ))}
      <path d="M44 70 Q38 40 50 24 Q60 16 70 24 Q82 40 76 70 Z" fill={`url(#${id}-br)`} stroke="#4a2a10" strokeWidth="0.6" />
      {/* the tall beaded crown */}
      <path d="M46 30 Q48 6 60 6 Q72 6 74 30 Q60 24 46 30 Z" fill="#7a4419" />
      {[12, 18, 24].map((y) => (
        <path key={y} d={`M${48 + (24 - y) * 0.15} ${y + 2} Q60 ${y - 2} ${72 - (24 - y) * 0.15} ${y + 2}`} fill="none" stroke="#c78a4b" strokeWidth="1.2" strokeDasharray="1.5 1.2" />
      ))}
      {/* features */}
      <path d="M50 44 Q54 41 57 44 M63 44 Q66 41 70 44" fill="none" stroke="#3b200b" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M60 46 L58 56 Q60 58 62 56 Z" fill="#6b3a17" />
      <path d="M54 62 Q60 65 66 62" fill="none" stroke="#3b200b" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M50 30 Q46 46 50 64" fill="none" stroke="#ffe0b5" strokeWidth="1.4" opacity="0.45" />
    </svg>
  );
}

/** Bicycle: side on, two wheels with spokes, the frame in green. */
function Bicycle({ id }: P) {
  const wheel = (cx: number) => (
    <g key={cx}>
      <circle cx={cx} cy="78" r="22" fill="none" stroke="#212529" strokeWidth="4" />
      <circle cx={cx} cy="78" r="19.5" fill="none" stroke="#adb5bd" strokeWidth="0.8" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return <line key={i} x1={cx} y1="78" x2={cx + Math.cos(a) * 19} y2={78 + Math.sin(a) * 19} stroke="#adb5bd" strokeWidth="0.5" />;
      })}
      <circle cx={cx} cy="78" r="2.2" fill="#495057" />
    </g>
  );
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      {shadow(60, 102, 50)}
      {wheel(28)}
      {wheel(92)}
      <g stroke={`#2f9e44`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M28 78 L50 78 L42 50 L80 50 L92 78" />
        <path d="M50 78 L80 50" />
        <path d="M42 50 L28 78" />
      </g>
      <line x1="80" y1="50" x2="84" y2="38" stroke="#212529" strokeWidth="3" strokeLinecap="round" />
      <path d="M78 38 L92 36" stroke="#212529" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 42 L52 42" stroke="#212529" strokeWidth="5" strokeLinecap="round" />
      <line x1="44" y1="44" x2="42" y2="50" stroke="#212529" strokeWidth="2.4" />
      <circle cx="50" cy="78" r="5" fill="none" stroke="#495057" strokeWidth="2" />
    </svg>
  );
}

/** Dumbbells: a pair of hex dumbbells, one lying on the other. */
function Dumbbells({ id }: P) {
  const bell = (y: number, rot: number, k: string) => (
    <g key={k} transform={`rotate(${rot} 60 ${y})`}>
      <rect x="36" y={y - 3} width="48" height="6" rx="2" fill={`url(#${id}-chrome)`} />
      {[20, 84].map((x) => (
        <path key={x} d={`M${x + 4} ${y - 15} L${x + 12} ${y - 15} L${x + 16} ${y} L${x + 12} ${y + 15} L${x + 4} ${y + 15} L${x} ${y} Z`} fill="#343a40" stroke="#000" strokeWidth="0.8" />
      ))}
      {[20, 84].map((x) => (
        <path key={`h${x}`} d={`M${x + 4} ${y - 15} L${x + 12} ${y - 15} L${x + 13} ${y - 11} L${x + 3} ${y - 11} Z`} fill="#868e96" opacity="0.5" />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1={48 + i * 3} y1={y - 3} x2={48 + i * 3} y2={y + 3} stroke="#868e96" strokeWidth="0.6" />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-chrome`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#adb5bd" />
          <stop offset="1" stopColor="#495057" />
        </linearGradient>
      </defs>
      {shadow(60, 104, 50)}
      {bell(84, 0, "a")}
      {bell(56, -14, "b")}
    </svg>
  );
}

export const ART: Record<string, (p: P) => React.ReactElement> = {
  novel: Novel,
  business_book: BusinessBook,
  textbook: Textbook,
  smartphone: Smartphone,
  laptop: Laptop,
  generator: Generator,
  tv: TV,
  console: Console,
  fan: Fan,
  bed: Bed,
  fridge: Fridge,
  solar: Solar,
  painting: PlainPainting,
  sculpture: Sculpture,
  enwonwu_painting: MasterPainting,
  bicycle: Bicycle,
  dumbbells: Dumbbells,
};
