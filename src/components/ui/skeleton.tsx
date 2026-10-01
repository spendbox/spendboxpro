import { cn } from "@/lib/cn";

/** A grey placeholder block shown while a page is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-2xl bg-black/[0.06]", className)} />;
}

/** Generic page placeholder: a heading, a row of tiles and a list. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24 rounded-lg" />
        <Skeleton className="h-9 w-64 max-w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-3xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
