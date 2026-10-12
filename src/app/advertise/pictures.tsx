// Little pictures for advertising (the /advertise page and the wizard): a lit building with
// your name, a phone showing your card, a billboard, your numbers, a street map.

export function PicBuilding({ name = "YOU", tint = "#495057", lit = true }: { name?: string; tint?: string; lit?: boolean }) {
  return (
    <svg viewBox="0 0 96 80" className="w-full" aria-hidden>
      <rect x="0" y="66" width="96" height="14" rx="3" fill="#cfe3c4" />
      {lit && <circle cx="48" cy="30" r="30" fill="#ffd43b" opacity=".25" />}
      <rect x="26" y="18" width="44" height="50" rx="3" fill={tint} />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={31 + c * 13} y={38 + r * 9} width="8" height="5" rx="1" fill={lit ? "#ffe066" : "#868e96"} />))}
      <rect x="30" y="22" width="36" height="12" rx="2" fill={lit ? "#f59f00" : "#adb5bd"} />
      <text x="48" y="31" textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">
        {name.length > 9 ? `${name.slice(0, 8).toUpperCase()}…` : name.toUpperCase()}
      </text>
    </svg>
  );
}
export function PicCard() {
  return (
    <svg viewBox="0 0 96 80" className="w-full" aria-hidden>
      <rect x="22" y="4" width="52" height="72" rx="8" fill="#212529" />
      <rect x="26" y="10" width="44" height="60" rx="4" fill="#fff" />
      <circle cx="36" cy="20" r="6" fill="#f59f00" />
      <rect x="45" y="16" width="20" height="4" rx="2" fill="#495057" />
      <rect x="45" y="22" width="14" height="3" rx="1.5" fill="#adb5bd" />
      <rect x="30" y="32" width="36" height="3" rx="1.5" fill="#ced4da" />
      <rect x="30" y="38" width="30" height="3" rx="1.5" fill="#ced4da" />
      <rect x="30" y="50" width="16" height="9" rx="4.5" fill="#2f9e44" />
      <rect x="50" y="50" width="16" height="9" rx="4.5" fill="#1971c2" />
    </svg>
  );
}
export function PicBillboard() {
  return (
    <svg viewBox="0 0 96 80" className="w-full" aria-hidden>
      <rect x="0" y="0" width="96" height="66" fill="#d0ebff" />
      <rect x="0" y="66" width="96" height="14" fill="#cfe3c4" />
      <rect x="10" y="10" width="76" height="38" rx="3" fill="#343a40" />
      <rect x="13" y="13" width="70" height="32" rx="2" fill="#f59f00" />
      <text x="48" y="33" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff">YOUR AD</text>
      <rect x="28" y="48" width="4" height="20" fill="#343a40" />
      <rect x="64" y="48" width="4" height="20" fill="#343a40" />
    </svg>
  );
}
export function PicChart() {
  return (
    <svg viewBox="0 0 96 80" className="w-full" aria-hidden>
      <rect x="6" y="6" width="84" height="68" rx="8" fill="#f1f3f5" />
      {[18, 30, 26, 44, 52].map((h, i) => (
        <rect key={i} x={16 + i * 14} y={64 - h} width="9" height={h} rx="2" fill={i === 4 ? "#2f9e44" : "#adb5bd"} />
      ))}
      <path d="M18 44 L32 36 L46 38 L60 24 L74 14" fill="none" stroke="#f59f00" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
export function PicMap() {
  return (
    <svg viewBox="0 0 120 60" className="mx-auto mb-2 w-32" aria-hidden>
      <rect width="120" height="60" rx="8" fill="#e9ecef" />
      <path d="M0 40 H120 M40 0 V60 M84 0 V60" stroke="#fff" strokeWidth="6" />
      <rect x="10" y="8" width="22" height="24" rx="2" fill="#adb5bd" />
      <rect x="50" y="8" width="26" height="24" rx="2" fill="#f59f00" />
      <rect x="92" y="8" width="20" height="24" rx="2" fill="#adb5bd" />
      <circle cx="63" cy="20" r="5" fill="#fff" />
    </svg>
  );
}

/** The hero: a Lagos street at dusk, one building lit with your name and a billboard with your ad. */
export function PicStreet() {
  return (
    <svg viewBox="0 0 360 170" className="w-full" aria-hidden>
      <defs>
        <linearGradient id="dusk" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3b5bdb" />
          <stop offset="1" stopColor="#f08c00" />
        </linearGradient>
      </defs>
      <rect width="360" height="170" rx="18" fill="url(#dusk)" />
      <circle cx="300" cy="44" r="18" fill="#ffe066" opacity=".9" />
      {[
        [8, 70, 40, 100],
        [52, 50, 36, 120],
        [210, 64, 34, 106],
        [252, 40, 44, 130],
        [302, 76, 50, 94],
      ].map(([x, y, w, h], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} fill="#343a40" />
          {Array.from({ length: Math.floor(h / 16) }, (_, r) => (
            <rect key={r} x={x + 6} y={y + 8 + r * 16} width={w - 12} height="5" fill="#495057" />
          ))}
        </g>
      ))}
      <circle cx="140" cy="80" r="56" fill="#ffd43b" opacity=".22" />
      <rect x="106" y="56" width="68" height="114" rx="4" fill="#212529" />
      <rect x="112" y="62" width="56" height="18" rx="3" fill="#f59f00" />
      <text x="140" y="75" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff">YOUR NAME</text>
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 3 }, (_, c) => <rect key={`${r}${c}`} x={114 + c * 18} y={88 + r * 15} width="12" height="7" rx="1" fill="#ffe066" />),
      )}
      <rect x="180" y="100" width="86" height="40" rx="3" fill="#212529" />
      <rect x="183" y="103" width="80" height="34" rx="2" fill="#fff" />
      <text x="223" y="124" textAnchor="middle" fontSize="11" fontWeight="900" fill="#e8590c">YOUR AD</text>
      <rect x="196" y="140" width="4" height="30" fill="#212529" />
      <rect x="246" y="140" width="4" height="30" fill="#212529" />
      <rect y="160" width="360" height="10" fill="#495057" />
    </svg>
  );
}
