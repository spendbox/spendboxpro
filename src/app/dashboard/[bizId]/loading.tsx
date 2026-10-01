import { PageSkeleton } from "@/components/ui/skeleton";

// Shown instantly while the next page loads, so taps feel immediate.
export default function Loading() {
  return <PageSkeleton />;
}
