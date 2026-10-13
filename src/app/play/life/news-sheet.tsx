"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CloudRain, Flame, Laugh, Dices, Lightbulb, MapPin, Megaphone, Music, ShoppingBasket, Star, TrafficCone, Trophy, Waves, Wrench, Zap } from "lucide-react";
import type { RegionMap } from "@/lib/world/compile";
import { cityNews, playerStory, weatherNow, type NewsItem, type NewsKind } from "@/lib/world/news";
import { ownedSpot } from "@/lib/world/owned";
import { cash } from "@/lib/world/value";
import { playerNews } from "../news-actions";
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
  fun: Laugh,
  money: Banknote,
  game: Dices,
  invention: Lightbulb,
};
/** A story: the city's news, or a player's new invention. */
type Story = Omit<NewsItem, "kind"> & { kind: NewsKind | "invention" };

const TONE: Partial<Record<NewsKind | "invention", string>> = { fire: "#e03131", flood: "#1971c2", weather: "#1c7ed6", power: "#f08c00", sport: "#2f9e44", invention: "#7048e8", star: "#d6336c", fun: "#e8590c", money: "#2b8a3e", game: "#e8590c" };

/** What's happening in the city: news every 20 minutes, the weather, and players' big moments. Share any story. */
export function NewsSheet({ region, onShow, onClose }: { region: RegionMap; onShow: (x: number, z: number) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"news" | "gossip">("news");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // Players' big moments: dear homes bought, businesses lighting up buildings, rich arrivals.
  const [people, setPeople] = useState<Story[]>([]);
  useEffect(() => {
    let alive = true;
    void playerNews(region.region.id)
      .then((events) => {
        if (!alive) return;
        setPeople(
          events.map((e) => {
            const sp = e.building ? ownedSpot(e.building) : e.x != null && e.z != null ? { x: e.x, z: e.z } : null;
            const area = sp ? region.areaAt(sp.x, sp.z) : "";
            return { id: e.id, at: e.at, kind: e.kind === "challenge" ? ("game" as const) : ("money" as const), ...playerStory(e, area, cash(e.price)), area, ...(sp ? { x: sp.x, z: sp.z } : {}) };
          }),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [region]);
  // Almost endless: more stories load as you scroll (a story every 20 minutes, going back weeks).
  const [count, setCount] = useState(30);
  const end = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const el = end.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((seen) => seen.some((e) => e.isIntersecting) && setCount((c) => Math.min(3000, c + 25)), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  });
  const list = useMemo<Story[]>(
    () => [...cityNews(region, now, count), ...people].sort((a, b) => b.at - a.at).slice(0, count + people.length),
    [region, now, people, count],
  );
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
        <li ref={end} className="py-3 text-center text-[11px] text-muted">
          {count < 3000 ? "Loading older stories…" : "That's everything from the last few weeks."}
        </li>
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
