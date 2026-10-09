import { cn } from "@/lib/cn";

// Grey stand-ins shaped like what's coming, shown for the moment a sheet's code or numbers
// are on their way, so nothing jumps when they land.

export function Bone({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-lg bg-panel-2", className)} style={style} />;
}

export function BadgesSkeleton() {
  return (
    <div role="status" aria-label="Loading your badges">
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-[3.25rem] rounded-xl" />
        ))}
      </div>
      <Bone className="mt-4 h-3.5 w-36" />
      <Bone className="mt-1.5 h-1.5 w-full rounded-full" />
      {[8, 8, 4].map((n, g) => (
        <div key={g} className="mt-5">
          <Bone className="h-3 w-20" />
          <div className="mt-2 grid grid-cols-4 gap-1">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 p-1.5">
                <Bone className="size-11 rounded-full" />
                <Bone className="h-2.5 w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadersSkeleton() {
  return (
    <div role="status" aria-label="Loading the leaderboard">
      <Bone className="h-3.5 w-48" />
      <div className="mt-4 flex items-end gap-2">
        {[3, 4, 2.25].map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center">
            <Bone className={cn("rounded-full", i === 1 ? "size-14" : "size-[2.875rem]")} />
            <Bone className="mt-1.5 h-3 w-14" />
            <Bone className="mt-1 h-3 w-10" />
            <Bone className="mt-1.5 w-full rounded-b-none rounded-t-xl" style={{ height: `${h}rem` }} />
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1">
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} className="h-[2.625rem] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function LevelSkeleton() {
  return (
    <div role="status" aria-label="Loading your level" className="animate-pulse rounded-2xl bg-gradient-to-br from-[#18202b] to-[#3b2f6b] p-3">
      <div className="flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-white/15" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-20 rounded bg-white/15" />
          <div className="h-3 w-28 rounded bg-white/10" />
        </div>
      </div>
      <div className="mt-3 h-9 rounded-xl bg-white/10" />
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[3.75rem] rounded-xl bg-white/5" />
        ))}
      </div>
      <div className="mt-2 h-7 rounded bg-white/5" />
    </div>
  );
}

/** When the numbers couldn't be fetched (a dropped connection, usually). */
export function LoadFailed({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="grid place-items-center gap-3 px-2 py-12 text-center">
      <p className="text-sm text-muted">{text}</p>
      <button onClick={onRetry} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
        Try again
      </button>
    </div>
  );
}
