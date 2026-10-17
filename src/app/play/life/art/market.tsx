// Drawings for the market's goods and the museum's art (../item-art.tsx): a bag of rice, a keg of
// palm oil, yams, a basket of tomatoes and pepper, stockfish, cooking pots, a mortar and pestle,
// lace, okrika jeans, a phone charger; and the masters' works in their frames (Onabolu, Okeke,
// Twins Seven-Seven, Emokpae, Grillo, Enwonwu's Tutu) and a cast of an Ife bronze head.

type P = { id: string };

const shadow = (cx = 60, cy = 106, rx = 44) => <ellipse cx={cx} cy={cy} rx={rx} ry="4.5" fill="#00000018" />;
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 120 120" className="size-full" aria-hidden>
    {children}
  </svg>
);

/** A 50 kg bag of rice: woven white sack, a printed label, tied at the top. */
function RiceBag({ id }: P) {
  return (
    <Svg>
      <defs>
        <linearGradient id={`${id}-sack`} x1="0" x2="1">
          <stop offset="0" stopColor="#e9e4d8" />
          <stop offset="0.5" stopColor="#fbf8f1" />
          <stop offset="1" stopColor="#d6cfbf" />
        </linearGradient>
      </defs>
      {shadow()}
      <path d="M28 30 Q60 20 92 30 L98 100 Q60 110 22 100 Z" fill={`url(#${id}-sack)`} stroke="#b9b09b" strokeWidth="1.5" />
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} d={`M${26 + i * 0.5} ${38 + i * 7} Q60 ${32 + i * 7} ${94 - i * 0.5} ${38 + i * 7}`} fill="none" stroke="#d9d2c2" strokeWidth="0.8" />
      ))}
      <path d="M44 22 Q60 12 76 22 L72 30 Q60 26 48 30 Z" fill="#e3dccb" stroke="#b9b09b" />
      <rect x="54" y="18" width="12" height="6" rx="2" fill="#c92a2a" />
      <rect x="34" y="50" width="52" height="34" rx="4" fill="#2b8a3e" />
      <rect x="38" y="54" width="44" height="26" rx="3" fill="#fff" />
      <text x="60" y="66" textAnchor="middle" fontSize="10" fontWeight="900" fill="#c92a2a">RICE</text>
      <text x="60" y="76" textAnchor="middle" fontSize="7" fontWeight="700" fill="#2b8a3e">50 KG</text>
    </Svg>
  );
}

/** A 25-litre keg of palm oil: a yellow jerrycan, the deep red oil showing through. */
function PalmOil({ id }: P) {
  return (
    <Svg>
      <defs>
        <linearGradient id={`${id}-oil`} x1="0" x2="1">
          <stop offset="0" stopColor="#8f1d05" />
          <stop offset="0.45" stopColor="#e8590c" />
          <stop offset="1" stopColor="#9c2a07" />
        </linearGradient>
      </defs>
      {shadow()}
      <rect x="26" y="28" width="68" height="76" rx="8" fill="#f5d36b" opacity="0.55" />
      <rect x="28" y="46" width="64" height="56" rx="6" fill={`url(#${id}-oil)`} />
      <rect x="26" y="28" width="68" height="76" rx="8" fill="none" stroke="#c59a16" strokeWidth="3" />
      <path d="M40 28 V16 H66 V28" fill="none" stroke="#c59a16" strokeWidth="5" strokeLinejoin="round" />
      <rect x="74" y="16" width="12" height="12" rx="2" fill="#c92a2a" />
      <path d="M36 54 V94" stroke="#ffffff66" strokeWidth="4" strokeLinecap="round" />
    </Svg>
  );
}

/** Ten yam tubers, long and rough-skinned, piled up. */
function Yams() {
  const tuber = (x: number, y: number, r: number, k: number) => (
    <g key={k} transform={`rotate(${r} ${x} ${y})`}>
      <path d={`M${x - 34} ${y} Q${x - 30} ${y - 11} ${x} ${y - 10} Q${x + 32} ${y - 8} ${x + 36} ${y} Q${x + 30} ${y + 10} ${x} ${y + 10} Q${x - 30} ${y + 9} ${x - 34} ${y} Z`} fill="#7a5230" stroke="#4e321b" strokeWidth="1.2" />
      {[-20, -6, 8, 22].map((d) => (
        <path key={d} d={`M${x + d} ${y - 6} q2 3 0 7`} stroke="#4e321b" strokeWidth="0.9" fill="none" />
      ))}
      <ellipse cx={x - 33} cy={y} rx="3" ry="5" fill="#f1e3c3" />
    </g>
  );
  return (
    <Svg>
      {shadow()}
      {tuber(54, 94, 4, 0)}
      {tuber(70, 90, -6, 1)}
      {tuber(48, 80, -8, 2)}
      {tuber(68, 74, 6, 3)}
      {tuber(58, 60, -3, 4)}
    </Svg>
  );
}

/** A woven basket heaped with tomatoes and scotch bonnet peppers. */
function TomatoBasket() {
  return (
    <Svg>
      {shadow()}
      {[
        [40, 52, 11, "#e03131"], [58, 46, 12, "#f03e3e"], [76, 52, 11, "#c92a2a"], [50, 40, 10, "#fa5252"], [68, 38, 9, "#e03131"],
      ].map(([x, y, r, c], i) => (
        <g key={i}>
          <circle cx={x as number} cy={y as number} r={r as number} fill={c as string} />
          <circle cx={(x as number) - 3} cy={(y as number) - 4} r="2.5" fill="#fff" opacity="0.45" />
          <path d={`M${(x as number) - 3} ${(y as number) - (r as number) + 1} l3 2 l3 -2`} stroke="#2f9e44" strokeWidth="1.6" fill="none" />
        </g>
      ))}
      {[[32, 44, "#fab005"], [86, 44, "#f76707"], [60, 32, "#e8590c"]].map(([x, y, c], i) => (
        <path key={i} d={`M${x} ${y} q6 -7 10 0 q-2 8 -5 8 q-3 0 -5 -8`} fill={c as string} />
      ))}
      <path d="M22 56 H98 L88 100 H32 Z" fill="#c8913f" stroke="#7d5420" strokeWidth="1.5" />
      {[64, 74, 84, 94].map((y) => (
        <path key={y} d={`M${22 + (y - 56) * 0.13} ${y} H${98 - (y - 56) * 0.13}`} stroke="#7d5420" strokeWidth="1" />
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <path key={i} d={`M${30 + i * 7.5} 56 L${34 + i * 6.5} 100`} stroke="#9a6a2c" strokeWidth="1" />
      ))}
    </Svg>
  );
}

/** Stockfish (a dried fish, stiff and pale) beside a little heap of red crayfish. */
function Stockfish() {
  return (
    <Svg>
      {shadow()}
      <g transform="rotate(-24 60 60)">
        <path d="M18 60 Q40 44 80 52 L98 40 L96 60 L98 80 L80 68 Q40 76 18 60 Z" fill="#d9cbb0" stroke="#8a7a5c" strokeWidth="1.5" />
        <circle cx="28" cy="58" r="2.5" fill="#3b3226" />
        {[40, 50, 60, 70].map((x) => (
          <path key={x} d={`M${x} 52 Q${x + 3} 60 ${x} 68`} stroke="#b3a17c" fill="none" />
        ))}
      </g>
      {Array.from({ length: 14 }, (_, i) => {
        const x = 64 + (i % 5) * 7 + (Math.floor(i / 5) % 2) * 3;
        const y = 98 - Math.floor(i / 5) * 6;
        return <path key={i} d={`M${x} ${y} q4 -6 8 -2 q-2 4 -8 2`} fill={i % 3 ? "#e8590c" : "#c2410c"} />;
      })}
    </Svg>
  );
}

/** A set of cooking pots: three shiny aluminium pots with lids, big to small. */
function Pots({ id }: P) {
  const pot = (x: number, y: number, w: number, h: number, k: number) => (
    <g key={k}>
      <rect x={x - w / 2} y={y - h} width={w} height={h} rx="4" fill={`url(#${id}-al)`} stroke="#868e96" />
      <ellipse cx={x} cy={y - h} rx={w / 2 + 2} ry="4" fill="#dee2e6" stroke="#868e96" />
      <rect x={x - 4} y={y - h - 7} width="8" height="4" rx="2" fill="#343a40" />
      {[-1, 1].map((s) => (
        <rect key={s} x={x + s * (w / 2 + 1) - (s < 0 ? 7 : 0)} y={y - h + 4} width="7" height="4" rx="2" fill="#343a40" />
      ))}
    </g>
  );
  return (
    <Svg>
      <defs>
        <linearGradient id={`${id}-al`} x1="0" x2="1">
          <stop offset="0" stopColor="#adb5bd" />
          <stop offset="0.4" stopColor="#f8f9fa" />
          <stop offset="1" stopColor="#868e96" />
        </linearGradient>
      </defs>
      {shadow()}
      {pot(36, 104, 40, 34, 0)}
      {pot(80, 104, 32, 28, 1)}
      {pot(58, 64, 26, 20, 2)}
    </Svg>
  );
}

/** A wooden mortar and pestle, for pounding yam. */
function Mortar() {
  return (
    <Svg>
      {shadow()}
      <path d="M28 46 H92 L86 70 Q60 80 34 70 Z" fill="#8a5a2b" stroke="#5c3a17" strokeWidth="1.5" />
      <path d="M44 74 H76 L80 102 H40 Z" fill="#7a4e24" stroke="#5c3a17" strokeWidth="1.5" />
      <ellipse cx="60" cy="46" rx="32" ry="6" fill="#5c3a17" />
      <ellipse cx="60" cy="46" rx="26" ry="4" fill="#f1e8d2" />
      <rect x="72" y="4" width="9" height="56" rx="4.5" fill="#a87442" stroke="#5c3a17" transform="rotate(14 76 30)" />
      {[56, 62].map((y) => (
        <path key={y} d={`M32 ${y} Q60 ${y + 6} 88 ${y}`} stroke="#5c3a17" strokeWidth="1" fill="none" />
      ))}
    </Svg>
  );
}

/** Five yards of lace, folded, a scalloped edge and a flower pattern. */
function Lace() {
  return (
    <Svg>
      {shadow()}
      {[0, 1, 2].map((k) => (
        <g key={k} transform={`translate(0 ${k * -14})`}>
          <rect x="18" y="72" width="84" height="22" rx="3" fill={["#c2255c", "#d6336c", "#e64980"][k]} />
          {Array.from({ length: 10 }, (_, i) => (
            <circle key={i} cx={24 + i * 8.2} cy={94} r="3.4" fill={["#c2255c", "#d6336c", "#e64980"][k]} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i} transform={`translate(${28 + i * 16} 82)`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx="0" cy="-3" rx="1.8" ry="3" fill="#ffffffaa" transform={`rotate(${a})`} />
              ))}
              <circle r="1.6" fill="#fcc419" />
            </g>
          ))}
        </g>
      ))}
    </Svg>
  );
}

/** Okrika (second-hand) jeans, folded, a little faded, with a paper price tag. */
function Okrika() {
  return (
    <Svg>
      {shadow()}
      <path d="M30 20 H90 L96 100 H66 L60 48 L54 100 H24 Z" fill="#3b5b8c" stroke="#243a5e" strokeWidth="1.5" />
      <path d="M30 20 H90 V30 H30 Z" fill="#2f4a73" />
      <circle cx="60" cy="25" r="2.2" fill="#c9a227" />
      <path d="M36 34 Q44 42 54 36 M84 34 Q76 42 66 36" stroke="#e9c46a" strokeWidth="1" fill="none" />
      <path d="M38 60 Q42 70 36 84 M82 60 Q78 70 84 84" stroke="#6b8cc2" strokeWidth="5" opacity="0.6" fill="none" />
      <path d="M92 26 L104 36" stroke="#495057" />
      <rect x="98" y="34" width="14" height="18" rx="2" fill="#fff3bf" stroke="#c9a227" transform="rotate(20 105 43)" />
    </Svg>
  );
}

/** A phone charger: the white plug (three square pins) and a coiled cable. */
function Charger() {
  return (
    <Svg>
      {shadow()}
      <rect x="20" y="40" width="40" height="44" rx="6" fill="#f8f9fa" stroke="#adb5bd" strokeWidth="1.5" />
      {[[30, 34], [46, 34], [38, 30]].map(([x, y], i) => (
        <rect key={i} x={x - 2.5} y={y - 6} width="5" height="12" fill="#adb5bd" />
      ))}
      <rect x="34" y="84" width="12" height="6" rx="2" fill="#dee2e6" />
      <path d="M40 90 Q40 104 56 100 Q72 96 66 82 Q60 70 76 68 Q92 66 88 82 Q86 92 98 92" stroke="#f1f3f5" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M40 90 Q40 104 56 100 Q72 96 66 82 Q60 70 76 68 Q92 66 88 82 Q86 92 98 92" stroke="#adb5bd" strokeWidth="0.8" fill="none" />
      <rect x="96" y="86" width="12" height="12" rx="2" fill="#e9ecef" stroke="#adb5bd" />
    </Svg>
  );
}

/** A painting in a gold frame on its little easel; `art` is what's painted (in 0..100 inside the frame). */
function Framed({ id, art, wide }: { id: string; art: React.ReactNode; wide?: boolean }) {
  const w = wide ? 92 : 72;
  const x = 60 - w / 2;
  return (
    <Svg>
      <defs>
        <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.4" stopColor="#c99a2e" />
          <stop offset="1" stopColor="#7a5a10" />
        </linearGradient>
        <clipPath id={`${id}-canvas`}>
          <rect x={x + 7} y="17" width={w - 14} height="72" />
        </clipPath>
      </defs>
      {shadow(60, 108, 36)}
      <path d="M44 96 L36 108 M76 96 L84 108" stroke="#6b4a2b" strokeWidth="3" />
      <rect x={x} y="10" width={w} height="86" rx="2" fill={`url(#${id}-frame)`} />
      <g clipPath={`url(#${id}-canvas)`}>
        <g transform={`translate(${x + 7} 17) scale(${(w - 14) / 100} 0.72)`}>{art}</g>
      </g>
      <rect x={x + 7} y="17" width={w - 14} height="72" fill="none" stroke="#5c4410" strokeWidth="1" />
    </Svg>
  );
}

/** Onabolu: a formal portrait, a woman in a blue gown and gele, a dark brown background. */
function Onabolu({ id }: P) {
  return (
    <Framed
      id={id}
      art={
        <>
          <rect width="100" height="100" fill="#4a3424" />
          <path d="M14 100 Q20 66 50 62 Q80 66 86 100 Z" fill="#1c5d99" />
          <path d="M42 62 L50 76 L58 62" fill="#f1e3c8" />
          <ellipse cx="50" cy="42" rx="14" ry="17" fill="#7a4a2a" />
          <path d="M32 34 Q50 4 70 32 Q74 22 62 18 Q50 10 36 20 Q28 26 32 34 Z" fill="#e8b04a" />
          <path d="M44 40 h4 M54 40 h4" stroke="#2b1a10" strokeWidth="1.6" />
          <path d="M46 52 q4 3 8 0" stroke="#4a1d10" strokeWidth="1.4" fill="none" />
        </>
      }
    />
  );
}

/** Uche Okeke: black ink on white, flowing uli lines and spirals. */
function Okeke({ id }: P) {
  return (
    <Framed
      id={id}
      art={
        <>
          <rect width="100" height="100" fill="#f8f5ec" />
          <g stroke="#1a1b1e" strokeWidth="2" fill="none" strokeLinecap="round">
            <path d="M10 80 Q30 20 50 50 T90 20" />
            <path d="M20 90 Q40 60 60 75 T95 60" />
            <circle cx="30" cy="30" r="10" />
            <path d="M30 30 m-5 0 a5 5 0 1 1 5 5" />
            <path d="M65 85 l5 -10 l5 10 l5 -10" />
            <path d="M70 30 q8 -10 16 0 q-8 10 -16 0" />
          </g>
          <circle cx="50" cy="50" r="3" fill="#1a1b1e" />
        </>
      }
    />
  );
}

/** Twins Seven-Seven: a crowded, bright, patterned dream of spirits and animals. */
function Twins({ id }: P) {
  const cols = ["#e03131", "#fab005", "#2f9e44", "#1c7ed6", "#7048e8", "#f76707"];
  return (
    <Framed
      id={id}
      wide
      art={
        <>
          <rect width="100" height="100" fill="#f3d9a4" />
          {Array.from({ length: 6 }, (_, i) => (
            <g key={i} transform={`translate(${10 + (i % 3) * 32} ${18 + Math.floor(i / 3) * 46})`}>
              <ellipse rx="13" ry="18" fill={cols[i]} />
              <ellipse rx="8" ry="12" fill={cols[(i + 2) % 6]} />
              <circle cy="-6" r="4" fill="#fff" />
              <circle cy="-6" r="2" fill="#1a1b1e" />
              {Array.from({ length: 6 }, (_, j) => (
                <circle key={j} cx={Math.cos(j) * 10} cy={Math.sin(j) * 14} r="1.6" fill="#1a1b1e" />
              ))}
            </g>
          ))}
          <path d="M0 50 Q25 40 50 50 T100 50" stroke="#1a1b1e" strokeWidth="1.5" fill="none" strokeDasharray="3 2" />
        </>
      }
    />
  );
}

/** Emokpae: bold, flat black and white, two faces become one, a red sun. */
function Emokpae({ id }: P) {
  return (
    <Framed
      id={id}
      art={
        <>
          <rect width="50" height="100" fill="#1a1b1e" />
          <rect x="50" width="50" height="100" fill="#f8f9fa" />
          <path d="M50 20 Q30 30 34 50 Q26 56 34 60 Q30 78 50 84 Z" fill="#f8f9fa" />
          <path d="M50 20 Q70 30 66 50 Q74 56 66 60 Q70 78 50 84 Z" fill="#1a1b1e" />
          <circle cx="42" cy="44" r="3" fill="#1a1b1e" />
          <circle cx="58" cy="44" r="3" fill="#f8f9fa" />
          <circle cx="80" cy="16" r="9" fill="#e03131" />
        </>
      }
    />
  );
}

/** Grillo: a cool blue, geometric figure in stained-glass shapes. */
function Grillo({ id }: P) {
  return (
    <Framed
      id={id}
      art={
        <>
          <rect width="100" height="100" fill="#d0ebff" />
          <path d="M50 8 L72 34 L50 60 L28 34 Z" fill="#1864ab" />
          <path d="M50 22 L62 34 L50 48 L38 34 Z" fill="#74c0fc" />
          <path d="M28 34 L50 60 L18 100 H0 V60 Z" fill="#339af0" />
          <path d="M72 34 L50 60 L82 100 H100 V60 Z" fill="#1971c2" />
          <path d="M50 60 L18 100 H82 Z" fill="#a5d8ff" />
          <g stroke="#0b2e4f" strokeWidth="1.5" fill="none">
            <path d="M50 8 L72 34 L50 60 L28 34 Z M28 34 L50 60 L18 100 M72 34 L82 100 M50 60 V100" />
          </g>
          <circle cx="44" cy="32" r="2" fill="#0b2e4f" />
          <circle cx="56" cy="32" r="2" fill="#0b2e4f" />
        </>
      }
    />
  );
}

/** Enwonwu's Tutu: the princess, three-quarter view, a green-gold background, a gele and earrings. */
function Tutu({ id }: P) {
  return (
    <Framed
      id={id}
      art={
        <>
          <rect width="100" height="100" fill="#7c8f4a" />
          <rect width="100" height="100" fill="#c9a227" opacity="0.25" />
          <path d="M20 100 Q26 70 52 66 Q78 70 82 100 Z" fill="#d9480f" />
          <ellipse cx="52" cy="44" rx="14" ry="18" fill="#8a5130" transform="rotate(-8 52 44)" />
          <path d="M34 34 Q46 8 70 26 Q72 34 66 30 Q52 22 38 36 Z" fill="#f08c00" />
          <circle cx="40" cy="52" r="2.4" fill="#ffd43b" />
          <path d="M48 42 h4 M58 41 h4" stroke="#2b1a10" strokeWidth="1.6" />
          <path d="M50 54 q4 2 8 0" stroke="#4a1d10" strokeWidth="1.4" fill="none" />
        </>
      }
    />
  );
}

/** A cast of an Ife bronze head: the calm face, fine vertical lines, a crown, on a stand. */
function IfeHead({ id }: P) {
  return (
    <Svg>
      <defs>
        <linearGradient id={`${id}-br`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3b26b" />
          <stop offset="0.45" stopColor="#a8692c" />
          <stop offset="1" stopColor="#5a3412" />
        </linearGradient>
      </defs>
      {shadow(60, 108, 30)}
      <rect x="40" y="92" width="40" height="14" rx="2" fill="#343a40" />
      <path d="M50 92 L52 80 H68 L70 92 Z" fill={`url(#${id}-br)`} />
      <path d="M38 40 Q38 18 60 16 Q82 18 82 40 Q82 70 60 82 Q38 70 38 40 Z" fill={`url(#${id}-br)`} />
      <path d="M36 30 Q60 4 84 30 L82 22 Q60 0 38 22 Z" fill="#7a4a1a" />
      {Array.from({ length: 5 }, (_, i) => (
        <circle key={i} cx={44 + i * 8} cy="20" r="2.4" fill="#e3b26b" />
      ))}
      {Array.from({ length: 11 }, (_, i) => (
        <path key={i} d={`M${44 + i * 3.2} 36 V${70 - Math.abs(i - 5) * 2.5}`} stroke="#5a3412" strokeWidth="0.8" opacity="0.7" />
      ))}
      <path d="M48 46 q4 -2 8 0 M64 46 q4 -2 8 0" stroke="#3b2208" strokeWidth="1.8" fill="none" />
      <path d="M60 48 V58 q-3 2 0 3" stroke="#3b2208" strokeWidth="1.2" fill="none" />
      <path d="M53 66 q7 3 14 0" stroke="#3b2208" strokeWidth="1.8" fill="none" />
    </Svg>
  );
}

export const ART: Record<string, (p: P) => React.ReactElement> = {
  rice_bag: RiceBag,
  palm_oil: PalmOil,
  yam_tubers: Yams,
  tomato_basket: TomatoBasket,
  stockfish: Stockfish,
  pot_set: Pots,
  mortar: Mortar,
  lace_fabric: Lace,
  okrika: Okrika,
  phone_charger: Charger,
  art_onabolu: Onabolu,
  art_okeke: Okeke,
  art_twins: Twins,
  art_emokpae: Emokpae,
  art_grillo: Grillo,
  art_ife_cast: IfeHead,
  art_enwonwu_tutu: Tutu,
};
