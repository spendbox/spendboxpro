"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudRain, Flame, Lightbulb, MapPin, Megaphone, Music, ShoppingBasket, Star, TrafficCone, Trophy, Waves, Wrench, Zap } from "lucide-react";
import type { RegionMap } from "@/lib/world/compile";
import { cityNews, weatherNow, type NewsItem, type NewsKind } from "@/lib/world/news";
import { inventions } from "../item-actions";
import { gossip, type Gossip } from "../street-actions";
import { Sheet } from "../sheet";

const ICON: Record<NewsKind | "invention", typeof Flame> = {
  weather: CloudRain,
  fire: Flame,
  traffic: TrafficCone,
  power: Zap,
  market: ShoppingBasket,
  star: Star,
  sport: Trophy,
  flood: Waves,
  roads: Wrench,
  festival: Music,
  city: Megaphone,
  invention: Lightbulb,
};
/** A story: the city's news, or a player's new invention. */
type Story = Omit<NewsItem, "kind"> & { kind: NewsKind | "invention" };

const TONE: Partial<Record<NewsKind | "invention", string>> = { fire: "#e03131", flood: "#1971c2", weather: "#1c7ed6", power: "#f08c00", sport: "#2f9e44", invention: "#7048e8", star: "#d6336c" };

/** What's happening in the city: news every 20 minutes, the weather, and players' new inventions. Share any story. */
export function NewsSheet({ region, onShow, onClose }: { region: RegionMap; onShow: (x: number, z: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"news" | "gossip">("news");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [made, setMade] = useState<Story[] | null>(null);
  useEffect(() => {
    void inventions()
      .then((list) =>
        setMade(
          list.map((k) => ({ id: `inv-${k.id}`, at: Date.parse(k.at), kind: "invention" as const, title: `New invention: ${k.name}`, text: `${k.maker} made it${k.sold ? `, and ${k.sold} sold so far` : ""}. Find it on the Market.` })),
        ),
      )
      .catch(() => setMade([]));
  }, []);
  const list = useMemo<Story[]>(() => [...cityNews(region, now), ...(made ?? [])].sort((a, b) => b.at - a.at).slice(0, 30), [region, now, made]);
  const w = weatherNow(now);
  const [shared, setShared] = useState<string | null>(null);
  const share = async (n: Story) => {
    const text = `${n.title}. ${n.text}`;
    try {
      if (navigator.share) await navigator.share({ title: n.title, text, url: `${location.origin}/play` });
      else {
        await navigator.clipboard.writeText(`${text} ${location.origin}/play`);
        setShared(n.id);
      }
    } catch {
      // Closed the share sheet: nothing to do.
    }
  };
  return (
    <Sheet onClose={onClose} wide title="Lagos news">
      <div className="mb-3 flex gap-1 rounded-full bg-ink/5 p-1">
        {(
          [
            ["news", "News"],
            ["gossip", "Gossip"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-8 flex-1 rounded-full text-xs font-semibold ${tab === id ? "bg-panel shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "gossip" ? (
        <GossipColumn region={region.region.id} now={now} />
      ) : (
        <>
      <p className="flex items-center gap-1.5 rounded-2xl bg-[#1c7ed6]/10 px-3 py-2 text-sm">
        <CloudRain className="size-4 text-[#1c7ed6]" /> Now: <b>{w.label}</b>
      </p>
      <ul className="mt-3 space-y-2">
        {list.map((n) => {
          const Icon = ICON[n.kind] ?? Megaphone;
          return (
            <li key={n.id} className="rounded-2xl bg-ink/[0.04] p-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-panel" style={{ color: TONE[n.kind] ?? "inherit" }}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{n.text}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    <span>{ago(now - n.at)}</span>
                    {n.x !== undefined && n.z !== undefined && (
                      <button onClick={() => onShow(n.x!, n.z!)} className="flex items-center gap-1 font-semibold text-gold-dark">
                        <MapPin className="size-3" /> Show me
                      </button>
                    )}
                    <button onClick={() => void share(n)} className="font-semibold text-gold-dark">
                      {shared === n.id ? "Copied!" : "Share"}
                    </button>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
        </>
      )}
    </Sheet>
  );
}

const GOSSIP_EMOJI: Record<string, string> = { caught: "🚨", jail: "🚔", bribe: "🤫", prank: "🥚", rivals: "⚔️", couple: "💘", breakup: "💔", car: "🚗", mark: "🖌️" };

/** The gossip column: who got caught, who pranked whom, new rivals, new couples (the last week). */
function GossipColumn({ region, now }: { region: string; now: number }) {
  const [list, setList] = useState<Gossip[] | null>(null);
  useEffect(() => {
    let alive = true;
    void gossip(region)
      .then((g) => alive && setList(g))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [region]);
  if (!list) return <div className="h-32 animate-pulse rounded-2xl bg-ink/5" />;
  if (list.length === 0) return <p className="py-6 text-center text-sm text-muted">Quiet week. Nobody&apos;s been caught at anything... yet.</p>;
  return (
    <ul className="space-y-2">
      {list.map((g) => (
        <li key={g.id} className="flex items-start gap-2.5 rounded-2xl bg-[#d6336c]/[0.06] p-3">
          <span className="text-xl leading-none" aria-hidden>
            {GOSSIP_EMOJI[g.kind] ?? "👀"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">{g.body}</p>
            <p className="mt-0.5 text-[11px] text-muted">{ago(now - Date.parse(g.at))}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ago(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
