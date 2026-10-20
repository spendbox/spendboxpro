// The masquerade mask (docs/MASQUERADE.md), on its own so the map's button can show it without
// loading Masquerade itself. Yours gold, theirs pink.

export function Mask({ colour = "#ffc53d", eyes = "#17112b", className }: { colour?: string; eyes?: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 60" className={className} aria-hidden>
      <path d="M8 14C28 3 50 8 60 18C70 8 92 3 112 14C114 36 101 51 82 49C70 48 64 39 60 34C56 39 50 48 38 49C19 51 6 36 8 14Z" fill={colour} />
      <ellipse cx="37" cy="28" rx="12" ry="7" fill={eyes} />
      <ellipse cx="83" cy="28" rx="12" ry="7" fill={eyes} />
    </svg>
  );
}
