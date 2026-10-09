import { cn } from "@/lib/cn";

/** The Newtown mark: an "N" made of two towers, a mint moon and a mint street. */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <rect width="64" height="64" rx="15" fill="#18202b" />
      <circle cx="19" cy="13.5" r="4.5" fill="#63e6be" />
      <rect x="41.25" y="7" width="1.5" height="8" rx=".75" fill="#ffd65c" />
      <path d="M13 50 V22 h10 l14 17 V14 h10 v36 h-10 L23 33 v17 z" fill="#ffc53d" />
      <g fill="#18202b" opacity=".45">
        <rect x="16" y="26" width="4" height="3" rx=".6" />
        <rect x="16" y="33" width="4" height="3" rx=".6" />
        <rect x="16" y="40" width="4" height="3" rx=".6" />
        <rect x="40" y="18" width="4" height="3" rx=".6" />
        <rect x="40" y="25" width="4" height="3" rx=".6" />
        <rect x="40" y="43" width="4" height="3" rx=".6" />
      </g>
      <rect x="9" y="50" width="46" height="3" rx="1.5" fill="#63e6be" />
    </svg>
  );
}

/** The mark with the name next to it. */
export function Logo({ size = 32, className, textClassName }: { size?: number; className?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span className={cn("font-display font-extrabold tracking-tight text-ink", textClassName)} style={{ fontSize: size * 0.62 }}>
        Newtown
      </span>
    </span>
  );
}
