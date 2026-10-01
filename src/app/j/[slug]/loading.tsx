import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-6 sm:px-8" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-36 rounded-xl" />
      <Skeleton className="h-44 rounded-4xl" />
      <Skeleton className="h-36 rounded-3xl" />
      <Skeleton className="h-64 rounded-3xl" />
    </div>
  );
}
