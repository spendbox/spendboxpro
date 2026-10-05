// The front page's illustration: a phone showing a shop in 3D, where a
// detailed tiered cake turns slowly on its pedestal (a short rendered loop,
// so it's smooth on any phone), a finger tapping it, and the moments around
// it floating by: the cake and its price, a WhatsApp chat, a welcome gift,
// and joining. The phone and the cards are SVG with CSS motion.

// The phone's screen.
const S = { x: 112, y: 27, w: 136, h: 256 };
/** The smaller MP4 where the browser plays it, WebM where it doesn't. */
const CAKE_VIDEOS = [
  ["/landing/cake-3d.mp4", "video/mp4"],
  ["/landing/cake-3d.webm", "video/webm"],
] as const;
const CAKE_POSTER = "/landing/cake-3d.jpg";

export function ShopIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 300" role="img" aria-label="A cake turning in 3D in a shop on a phone" className={className}>
      <defs>
        <radialGradient id="blob" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#cfe9d3" />
          <stop offset="1" stopColor="#cfe9d3" stopOpacity="0" />
        </radialGradient>
        <clipPath id="thumb">
          <rect x="9" y="46" width="30" height="46" rx="8" />
        </clipPath>
        <clipPath id="screen">
          <rect x={S.x} y={S.y} width={S.w} height={S.h} rx="20" />
        </clipPath>
      </defs>

      {/* Soft light behind it all */}
      <circle cx="180" cy="150" r="150" fill="url(#blob)" className="ill-breathe" />

      {/* The phone */}
      <g className="ill-shadow">
        <rect x="104" y="18" width="152" height="274" rx="28" fill="#1b211e" />
        <rect x="106" y="20" width="148" height="270" rx="26" fill="#2a312d" />
        <g clipPath="url(#screen)">
          <rect x={S.x} y={S.y} width={S.w} height={S.h} fill="#24502f" />
          {/* The shop in 3D: the cake turning on its pedestal */}
          <foreignObject x={S.x} y={S.y} width={S.w} height={S.h}>
            <video
              poster={CAKE_POSTER}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-hidden
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: 20 }}
            >
              {CAKE_VIDEOS.map(([src, type]) => (
                <source key={src} src={src} type={type} />
              ))}
            </video>
          </foreignObject>

          {/* The shop's name and the Join button, on screen */}
          <rect x="120" y="37" width="64" height="15" rx="7.5" fill="#000" opacity="0.35" />
          <circle cx="128" cy="44.5" r="5" fill="#2A772C" />
          <rect x="136" y="41" width="40" height="3" rx="1.5" fill="#fff" />
          <rect x="136" y="46.5" width="26" height="2.4" rx="1.2" fill="#fff" opacity="0.7" />
          <rect x="128" y="254" width="104" height="20" rx="10" fill="#2A772C" className="ill-join" />
          <text x="180" y="267.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" fontFamily="inherit">
            Join the shop
          </text>

          {/* A finger taps the cake */}
          <circle cx="196" cy="150" r="10" fill="#fff" className="ill-ripple" />
          <circle cx="196" cy="150" r="5.5" fill="#fff" opacity="0.9" stroke="#1d2320" strokeOpacity="0.15" className="ill-finger" />
        </g>
        <rect x="160" y="23" width="40" height="7" rx="3.5" fill="#1b211e" />
      </g>

      {/* Floating moments around the phone */}
      <g className="ill-float ill-float-1 ill-shadow">
        <rect x="2" y="38" width="98" height="62" rx="14" fill="#fff" />
        <image href={CAKE_POSTER} x="9" y="46" width="30" height="46" preserveAspectRatio="xMidYMid slice" clipPath="url(#thumb)" />
        <text x="45" y="60" fontSize="8" fontWeight="700" fill="#1c211e" fontFamily="inherit">
          Velvet cake
        </text>
        <text x="45" y="73" fontSize="8.5" fontWeight="700" fill="#2A772C" fontFamily="inherit">
          ₦45,000
        </text>
        <rect x="45" y="81" width="46" height="11" rx="5.5" fill="#eef6ee" />
        <text x="68" y="89" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#2A772C" fontFamily="inherit">
          Turn it in 3D
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
