// The front page's illustration: a phone walking into a 3D shop (framed
// products on the walls, a shelf, the counter at the back), a finger tapping
// a product, and the moments around it floating by: the product and its
// price, a WhatsApp chat, a welcome gift, and joining. Hand-drawn SVG with
// CSS motion, so it's crisp, light and loads instantly.

// The phone's screen, and the shop drawn inside it in one-point perspective.
const S = { x: 112, y: 27, w: 136, h: 256 };
const BACK = { x0: 152, x1: 208, y0: 92, y1: 150 };
const FLOOR_Y = 232;

/** A point on the left (side -1) or right (1) wall: u from the screen edge (0) to the back wall (1), v from top (0) to bottom (1). */
function wallPoint(side: -1 | 1, u: number, v: number): [number, number] {
  const edge = side < 0 ? S.x : S.x + S.w;
  const backX = side < 0 ? BACK.x0 : BACK.x1;
  const x = edge + (backX - edge) * u;
  const top = S.y + (BACK.y0 - S.y) * u;
  const bottom = FLOOR_Y + (BACK.y1 - FLOOR_Y) * u;
  return [x, top + (bottom - top) * v];
}
const quad = (side: -1 | 1, u0: number, u1: number, v0: number, v1: number) =>
  [wallPoint(side, u0, v0), wallPoint(side, u1, v0), wallPoint(side, u1, v1), wallPoint(side, u0, v1)].map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
/** A frame's photo: the frame's quad pulled in a little. */
const inset = (side: -1 | 1, u0: number, u1: number, v0: number, v1: number, d = 0.12) => {
  const du = (u1 - u0) * d;
  const dv = (v1 - v0) * d;
  return quad(side, u0 + du, u1 - du, v0 + dv, v1 - dv * 2.2);
};

const PHOTOS = ["url(#p-coral)", "url(#p-leaf)", "url(#p-sky)", "url(#p-gold)", "url(#p-rose)"];

export function ShopIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 300" role="img" aria-label="Walking into a shop in 3D on a phone" className={className}>
      <defs>
        <linearGradient id="p-coral" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8cdb0" />
          <stop offset="1" stopColor="#d9714a" />
        </linearGradient>
        <linearGradient id="p-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d4e8c8" />
          <stop offset="1" stopColor="#4f9150" />
        </linearGradient>
        <linearGradient id="p-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbe2f6" />
          <stop offset="1" stopColor="#5f72c2" />
        </linearGradient>
        <linearGradient id="p-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e4ad" />
          <stop offset="1" stopColor="#c48f25" />
        </linearGradient>
        <linearGradient id="p-rose" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4cfdb" />
          <stop offset="1" stopColor="#b2456f" />
        </linearGradient>
        <linearGradient id="wall-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#efe7dc" />
          <stop offset="1" stopColor="#e4dace" />
        </linearGradient>
        <linearGradient id="wall-r" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#f3ece2" />
          <stop offset="1" stopColor="#e6ddd1" />
        </linearGradient>
        <linearGradient id="floor" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#c99b6c" />
          <stop offset="1" stopColor="#e2c39f" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#fff6e2" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff6e2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="blob" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#cfe9d3" />
          <stop offset="1" stopColor="#cfe9d3" stopOpacity="0" />
        </radialGradient>
        <clipPath id="screen">
          <rect x={S.x} y={S.y} width={S.w} height={S.h} rx="20" />
        </clipPath>
      </defs>

      {/* Soft light behind it all */}
      <circle cx="180" cy="150" r="150" fill="url(#blob)" className="ill-breathe" />

      {/* The phone */}
      <g className="ill-phone ill-shadow">
        <rect x="104" y="18" width="152" height="274" rx="28" fill="#1b211e" />
        <rect x="106" y="20" width="148" height="270" rx="26" fill="#2a312d" />
        <g clipPath="url(#screen)">
          <rect x={S.x} y={S.y} width={S.w} height={S.h} fill="#e9e1d6" />
          {/* The shop, slowly walked into */}
          <g className="ill-walk">
            <polygon points={`${S.x},${S.y} ${S.x + S.w},${S.y} ${BACK.x1},${BACK.y0} ${BACK.x0},${BACK.y0}`} fill="#f4efe8" />
            <line x1="138" y1="27" x2="166" y2="92" stroke="#ffe0a3" strokeWidth="3" strokeLinecap="round" className="ill-light" />
            <line x1="222" y1="27" x2="194" y2="92" stroke="#ffe0a3" strokeWidth="3" strokeLinecap="round" className="ill-light" />
            <polygon points={`${S.x},${S.y} ${BACK.x0},${BACK.y0} ${BACK.x0},${BACK.y1} ${S.x},${FLOOR_Y}`} fill="url(#wall-l)" />
            <polygon points={`${S.x + S.w},${S.y} ${BACK.x1},${BACK.y0} ${BACK.x1},${BACK.y1} ${S.x + S.w},${FLOOR_Y}`} fill="url(#wall-r)" />
            <polygon points={`${S.x},${FLOOR_Y} ${BACK.x0},${BACK.y1} ${BACK.x1},${BACK.y1} ${S.x + S.w},${FLOOR_Y} ${S.x + S.w},${S.y + S.h} ${S.x},${S.y + S.h}`} fill="url(#floor)" />
            {/* Floor boards running to the back */}
            {[0.2, 0.4, 0.6, 0.8].map((t) => (
              <line key={t} x1={BACK.x0 + (BACK.x1 - BACK.x0) * t} y1={BACK.y1} x2={S.x - 40 + (S.w + 80) * t} y2={S.y + S.h} stroke="#b88a5e" strokeWidth="0.8" opacity="0.6" />
            ))}
            {/* Panelling along the bottom of the walls */}
            <polygon points={quad(-1, 0, 1, 0.74, 0.76)} fill="#d8cdbf" />
            <polygon points={quad(1, 0, 1, 0.74, 0.76)} fill="#d8cdbf" />

            {/* Left wall: framed products with picture lights */}
            {(
              [
                [0.05, 0.38, 0.22, 0.6],
                [0.5, 0.72, 0.25, 0.58],
                [0.8, 0.93, 0.27, 0.56],
              ] as const
            ).map(([u0, u1, v0, v1], i) => (
              <g key={i}>
                <polygon points={quad(-1, u0 + (u1 - u0) * 0.3, u1 - (u1 - u0) * 0.3, v0 - 0.06, v0 - 0.045)} fill="#c9a25a" />
                <polygon points={quad(-1, u0, u1, v0, v1)} fill="#56392a" className={i === 0 ? "ill-picked" : undefined} />
                <polygon points={quad(-1, u0 + (u1 - u0) * 0.06, u1 - (u1 - u0) * 0.06, v0 + 0.02, v1 - 0.02)} fill="#f4efe6" />
                <polygon points={inset(-1, u0, u1, v0, v1)} fill={PHOTOS[i]} />
              </g>
            ))}
            {/* Right wall: a shelving unit in the shop's green, then a wide frame */}
            <polygon points={quad(1, 0.08, 0.5, 0.18, 0.76)} fill="#244b2c" />
            <polygon points={quad(1, 0.11, 0.47, 0.21, 0.76)} fill="#f1ebe1" />
            {[0.45, 0.66].map((v) => (
              <polygon key={v} points={quad(1, 0.11, 0.47, v, v + 0.025)} fill="#c6a279" />
            ))}
            {[0.14, 0.23, 0.32, 0.41].map((u, i) =>
              [0.3, 0.51].map((v, j) => (
                <g key={`${i}${j}`}>
                  <polygon points={quad(1, u, u + 0.06, v, v + 0.14)} fill="#56392a" />
                  <polygon points={quad(1, u + 0.008, u + 0.052, v + 0.015, v + 0.105)} fill={PHOTOS[(i + j * 2) % PHOTOS.length]} />
                </g>
              )),
            )}
            <polygon points={quad(1, 0.62, 0.9, 0.25, 0.5)} fill="#56392a" />
            <polygon points={inset(1, 0.62, 0.9, 0.25, 0.5, 0.1)} fill="url(#p-sky)" />

            {/* The back wall: the shop's name over the counter */}
            <rect x={BACK.x0} y={BACK.y0} width={BACK.x1 - BACK.x0} height={BACK.y1 - BACK.y0} fill="#ece4d9" />
            <rect x={BACK.x0} y={BACK.y0} width={BACK.x1 - BACK.x0} height={BACK.y1 - BACK.y0} fill="url(#glow)" />
            <rect x="166" y="100" width="28" height="7" rx="2" fill="#1d2320" />
            <rect x="174" y="109" width="12" height="1.6" rx="0.8" fill="#2A772C" />
            <rect x="160" y="116" width="40" height="20" rx="2" fill="#2f3a34" />
            <rect x="163" y="119" width="15" height="14" rx="1" fill="url(#p-rose)" />
            <rect x="182" y="119" width="15" height="14" rx="1" fill="url(#p-gold)" />
            <rect x="156" y="138" width="48" height="12" rx="1.5" fill="#9fc79c" />
            <rect x="156" y="138" width="48" height="2.5" fill="#f4f2ee" />
          </g>

          {/* The shop's name and the Join button, on screen */}
          <rect x="120" y="37" width="64" height="15" rx="7.5" fill="#000" opacity="0.35" />
          <circle cx="128" cy="44.5" r="5" fill="#2A772C" />
          <rect x="136" y="41" width="40" height="3" rx="1.5" fill="#fff" />
          <rect x="136" y="46.5" width="26" height="2.4" rx="1.2" fill="#fff" opacity="0.7" />
          <rect x="128" y="254" width="104" height="20" rx="10" fill="#2A772C" className="ill-join" />
          <text x="180" y="267.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="inherit">
            Join the shop
          </text>

          {/* A finger taps the first frame */}
          <circle cx="126" cy="102" r="10" fill="#fff" className="ill-ripple" />
          <circle cx="126" cy="102" r="5.5" fill="#fff" opacity="0.9" stroke="#1d2320" strokeOpacity="0.15" className="ill-finger" />
        </g>
        <rect x="160" y="23" width="40" height="7" rx="3.5" fill="#1b211e" />
      </g>

      {/* Floating moments around the phone */}
      <g className="ill-float ill-float-1 ill-shadow">
        <rect x="2" y="38" width="98" height="62" rx="14" fill="#fff" />
        <rect x="9" y="46" width="30" height="46" rx="8" fill="url(#p-coral)" />
        <text x="45" y="60" fontSize="8" fontWeight="700" fill="#1c211e" fontFamily="inherit">
          Ankara dress
        </text>
        <text x="45" y="73" fontSize="8.5" fontWeight="700" fill="#2A772C" fontFamily="inherit">
          ₦28,000
        </text>
        <rect x="45" y="81" width="46" height="11" rx="5.5" fill="#eef6ee" />
        <text x="68" y="89" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#2A772C" fontFamily="inherit">
          Framed in 3D
        </text>
      </g>

      <g className="ill-float ill-float-2 ill-shadow">
        <rect x="248" y="66" width="106" height="44" rx="16" fill="#1FAF55" />
        <circle cx="266" cy="88" r="10" fill="#fff" />
        <path d="M261.5 92.5l1.2-3.2a5.6 5.6 0 1 1 2.1 2.1z" fill="#1FAF55" />
        <text x="282" y="85" fontSize="8" fontWeight="700" fill="#fff" fontFamily="inherit">
          Is it available?
        </text>
        <text x="282" y="97" fontSize="7" fill="#fff" opacity="0.85" fontFamily="inherit">
          Yes! Sizes 8–18
        </text>
      </g>

      <g className="ill-float ill-float-3 ill-shadow">
        <rect x="2" y="196" width="98" height="48" rx="14" fill="#fff" />
        <rect x="9" y="204" width="32" height="32" rx="9" fill="#fbbf24" />
        <rect x="23.5" y="207" width="3" height="26" fill="#b45309" opacity="0.6" />
        <rect x="12" y="217" width="26" height="3" fill="#b45309" opacity="0.6" />
        <text x="47" y="216" fontSize="7.5" fontWeight="700" fill="#1c211e" fontFamily="inherit">
          Welcome gift
        </text>
        <text x="47" y="229" fontSize="8" fontWeight="700" fill="#b45309" fontFamily="inherit">
          10% off
        </text>
      </g>

      <g className="ill-float ill-float-4 ill-shadow">
        <rect x="252" y="206" width="100" height="34" rx="17" fill="#fff" />
        <circle cx="270" cy="223" r="10" fill="#2A772C" />
        <path d="M265.5 223.2l3 3 6-6" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="286" y="221" fontSize="8" fontWeight="700" fill="#1c211e" fontFamily="inherit">
          You joined
        </text>
        <text x="286" y="232" fontSize="7" fill="#6b726e" fontFamily="inherit">
          Kemi Cakes
        </text>
      </g>
    </svg>
  );
}
