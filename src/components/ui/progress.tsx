import { cn } from "@/lib/cn";

/** Stamp-card style dots for small targets, a bar for anything bigger. */
export function Progress({
  current,
  target,
  color = "#0B6E4F",
  label,
  className,
}: {
  current: number;
  target: number;
  color?: string;
  label: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (current / target) * 100));
  if (Number.isInteger(target) && target <= 10) {
    return (
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={current}
        className={cn("flex gap-1.5", className)}
      >
        {Array.from({ length: target }, (_, i) => (
          <span
            key={i}
            className="h-2.5 flex-1 rounded-full"
            style={{ background: i < current ? color : "#E4E8E3" }}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-2.5 overflow-hidden rounded-full bg-line", className)}
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
