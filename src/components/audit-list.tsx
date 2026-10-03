import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDate, formatTime } from "@/lib/format";

export interface AuditItem {
  id: string;
  sentence: string;
  created_at: string;
  tone: "good" | "warn" | "neutral";
}

/** A timeline of activity, grouped by day. */
export function AuditList({ items, empty }: { items: AuditItem[]; empty: string }) {
  if (items.length === 0) return <Card className="p-5 text-muted">{empty}</Card>;
  const days = new Map<string, AuditItem[]>();
  for (const item of items) {
    const key = formatDate(item.created_at, { withYear: true });
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  return (
    <div className="flex flex-col gap-5">
      {[...days.entries()].map(([day, list]) => (
        <section key={day} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">{day}</h2>
          <Card className="divide-y divide-line px-5">
            {list.map((item) => (
              <div key={item.id} className="flex items-start gap-3 py-3.5">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    item.tone === "good" ? "bg-brand-600" : item.tone === "warn" ? "bg-accent-600" : "bg-line-strong",
                  )}
                />
                <p className="min-w-0 flex-1 text-[15px] break-words text-ink">{item.sentence}</p>
                <span className="shrink-0 text-xs text-muted tabular">{formatTime(item.created_at)}</span>
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
