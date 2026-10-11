"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Flag, Handshake, HeartPulse, House, MapPin, Search, Sparkles, Wallet, X } from "@/components/icons";
import { addressOf, makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { BUILDING_LABEL } from "@/lib/world/buildings";
import type { RegionMap } from "@/lib/world/compile";
import { regionMap } from "@/lib/world";
import { ownedSpot } from "@/lib/world/owned";
import { propertyInfo, type PropertyInfo } from "@/lib/world/property";
import { homesByArea, type HomeFind } from "@/lib/world/homes";
import type { BuildingOwner, InterviewStart, LifeStatus, Neighbour, PaySettled, PropertyApi, PropertyResult, WorkStatus } from "@/lib/world/property-api";
import { COMMUTE_LABEL, dayNet, fareMint, needsInterview, payDay, tripKmBetween, type Commute } from "@/lib/world/work";
import { dayOf, EXERCISE } from "@/lib/world/day";
import type { Workplace } from "@/lib/world/workplace";
import { PropertyCard } from "../property-card";
import { Sheet } from "../sheet";
import { LifeSheet } from "./life-sheet";
import { MoneySheet } from "./money-sheet";
import { HomeCard } from "./home-card";
import { JobsHere, type JobsContext } from "./jobs-here";
import { MapSearch, type SearchHit } from "./map-search";
import { HomeFinder } from "./home-finder";
import { StartLife } from "./start-life";
import { useLife } from "./use-life";
import { WorkSheet } from "./work-sheet";
import { BusinessSheet } from "./business-sheet";
import { ServicesSheet } from "./services-sheet";
import { ReportSheet } from "./report-sheet";
import type { MapBusiness } from "@/lib/world/business";
import type { OwnedProperty } from "@/lib/world/owned";
import { InterviewSheet, MomentSheet } from "./moments";
import { AmountSheet, LoanSheet } from "./amount-sheet";
import { buyerPays, sellerGets, OFFER_HOURS, type Listing, type MarketBoard } from "@/lib/world/market";
import { BUY_TAX } from "@/lib/world/property-api";

/** Each region's plan for finding jobs near home, worked out once (only when Work is opened). */
const plans = new Map<string, CityPlan>();
function planOf(region: RegionMap) {
  let p = plans.get(region.region.id);
  if (!p) {
    p = makePlan(region.region.seed, region);
    plans.set(region.region.id, p);
  }
  return p;
}

const GUIDE_KEY = "newtown.guide";
type GuideStep = "home" | "job" | "budget" | "life" | "chat";
const GUIDE: Record<GuideStep, { n: number; text: string }> = {
  home: { n: 1, text: "Find a home you can afford. Tap Find a home." },
  job: { n: 2, text: "Get a job near home. Tap Work, then Jobs near me." },
  budget: { n: 3, text: "Set your budget: how your pay is shared out. Tap Money." },
  life: { n: 4, text: "Look after your body and mind. Tap Life." },
  chat: { n: 0, text: "All set! Tap Chat at the bottom to talk to people around you." },
};
/** The glow on the button for the guide's next step: a gold ring, and a ripple round it (see Ripple). */
const GLOW = "outline outline-2 outline-offset-2 outline-gold";

/** A gold ripple round a button the guide points at (the button must be relative). */
export function Ripple() {
  return <span aria-hidden className="pointer-events-none absolute -inset-1 animate-ping rounded-full ring-4 ring-gold/60" />;
}

/** One of your life's buttons under the place's name: an icon and its name. */
function LifeButton({
  icon: Icon,
  label,
  onClick,
  glow,
  dot,
  warn,
}: {
  icon: typeof House;
  label: string;
  onClick: () => void;
  glow?: boolean;
  dot?: boolean;
  warn?: boolean;
}) {
  return (
    <button onClick={onClick} className={`glass pointer-events-auto relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${glow ? GLOW : ""}`}>
      <Icon className={`size-4 ${warn ? "text-hit" : ""}`} />
      {label}
      {dot && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-hit" />}
      {glow && <Ripple />}
    </button>
  );
}

const money = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const paid = (p: PaySettled | undefined) =>
  p && p.gross > 0 ? ` Collected ₥${money(p.net)} pay (after ₥${money(p.tax)} tax and ₥${money(p.fares)} fares).` : "";

/**
 * A life on a real map (docs/PROPERTY.md): the search box, your assets, the welcome (start with a
 * budget, buy a home first), and buying from a property's card. Gives the city view what it needs
 * (owned buildings, where to fly, what to do when a property is tapped) and the screens to show.
 */
export function useWorldLife({
  api,
  regionId,
  signedIn,
  budget,
  pretend,
  onChanged,
}: {
  api: PropertyApi;
  regionId: string | null;
  signedIn: boolean;
  budget: number;
  /** The world lab: payments are pretend. */
  pretend?: boolean;
  onChanged?: () => void;
}) {
  const region = useMemo(() => regionMap(regionId), [regionId]);
  const { assets, owned, loaded, refresh } = useLife(api, signedIn ? regionId : null);
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [owners, setOwners] = useState<BuildingOwner[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [flyTo, setFlyTo] = useState<{ tile: number; at: number } | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [welcomeShut, setWelcomeShut] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  /** The first-day guide: which steps are done (kept in this browser). */
  const [guide, setGuide] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(GUIDE_KEY) ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const markGuide = (k: string) =>
    setGuide((g) => {
      const next = { ...g, [k]: true };
      try {
        localStorage.setItem(GUIDE_KEY, JSON.stringify(next));
      } catch {
        // Not kept: the guide just shows again next time.
      }
      return next;
    });
  const [work, setWork] = useState<WorkStatus | null>(null);
  const [workOpen, setWorkOpen] = useState(false);
  const [place, setPlace] = useState<Workplace | null>(null);
  const [homeOpen, setHomeOpen] = useState(false);
  const [neighbours, setNeighbours] = useState<Neighbour[] | null>(null);
  const [status, setStatus] = useState<LifeStatus | null>(null);
  const [lifeOpen, setLifeOpen] = useState(false);
  const [interview, setInterview] = useState<{ start: Extract<InterviewStart, { ok: true }>; hire: (ticket: string) => void } | null>(null);
  const [moment, setMoment] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [report, setReport] = useState<{ x: number; z: number; where: string } | null>(null);
  const centerRef = useRef<(() => { x: number; z: number }) | null>(null);
  const loadServices = useCallback(() => api.serviceBoard(), [api]);
  const [businesses, setBusinesses] = useState<MapBusiness[]>([]);
  const [business, setBusiness] = useState<MapBusiness | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; yes: string; run: () => void } | null>(null);
  const [board, setBoard] = useState<MarketBoard | null>(null);
  /** Asking for an amount: a sale price, an offer, a counter-offer, a loan payment. */
  const [ask, setAsk] = useState<{
    title: string;
    text: string;
    initial: number;
    max?: number;
    note?: (n: number) => string;
    cta: (n: number) => string;
    run: (n: number) => Promise<PropertyResult>;
    done: (n: number) => string;
  } | null>(null);
  const [loanOpen, setLoanOpen] = useState(false);
  const [listings, setListings] = useState<Listing[] | null>(null);

  useEffect(() => {
    if (!signedIn || !regionId) return;
    const t = setTimeout(() => {
      void api.workStatus().then(setWork);
      void api.lifeStatus().then(setStatus);
      void api.marketBoard().then(setBoard);
    }, 0);
    // Bills, health, school and offers move on with time: look again now and then.
    const every = setInterval(() => {
      void api.lifeStatus().then(setStatus);
      void api.marketBoard().then(setBoard);
    }, 120_000);
    return () => {
      clearTimeout(t);
      clearInterval(every);
    };
  }, [api, signedIn, regionId]);

  // Real businesses on the map (everyone sees them, signed in or not).
  useEffect(() => {
    if (!regionId) return;
    let alive = true;
    const load = () => void api.mapBusinesses(regionId).then((list) => alive && setBusinesses(list)).catch(() => {});
    const first = setTimeout(load, 0);
    const every = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [api, regionId]);

  // A link to a spot (?at=x,z, from the map reports page): fly there.
  useEffect(() => {
    if (!regionId) return;
    const m = /^(-?\d+),(-?\d+)$/.exec(new URLSearchParams(window.location.search).get("at") ?? "");
    if (!m) return;
    const t = setTimeout(() => setFlyTo({ tile: spiralIndex(Number(m[1]), Number(m[2])), at: Date.now() }), 1500);
    return () => clearTimeout(t);
  }, [regionId]);

  // Back from paying for a pack: check it with Paystack, then tidy the address.
  useEffect(() => {
    if (!signedIn) return;
    const ref = new URLSearchParams(window.location.search).get("pack");
    if (!ref) return;
    void api.confirmPack(ref).then(async (r) => {
      setMessage(r.ok ? { text: `Your pack is in: ₥${(r.mint ?? 0).toLocaleString("en-GB")} to start with.`, good: true } : { text: r.error ?? "That payment hasn't gone through.", good: false });
      const url = new URL(window.location.href);
      url.searchParams.delete("pack");
      window.history.replaceState(null, "", url);
      await refresh();
    });
  }, [api, signedIn, refresh]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(t);
  }, [message]);

  const onProperty = useCallback(
    (info: PropertyInfo) => {
      setProperty(info);
      setOwners(null);
      if (signedIn) void api.buildingOwners(info.id).then(setOwners);
    },
    [api, signedIn],
  );

  const askSell = (unitId: string, label: string, worth: number, now?: number | null) =>
    setAsk({
      title: `Sell ${label}`,
      text: `It's worth about ₥${money(Math.round(worth))}. Anyone can buy it at your price, or make you an offer. A tenant living there stays.`,
      initial: Math.round(now ?? worth),
      note: (n) => `You get ₥${money(sellerGets(n))} after the 2% tax (a loan on it is paid off first).`,
      cta: (n) => `Put it up for ₥${money(n)}`,
      run: (n) => api.listUnit(unitId, n),
      done: (n) => `${label} is up for sale at ₥${money(n)}.`,
    });

  const fly = (x: number, z: number) => setFlyTo({ tile: spiralIndex(Math.round(x), Math.round(z)), at: Date.now() });

  async function act(run: () => Promise<PropertyResult>, done: (r: PropertyResult & { ok: true }) => string | null): Promise<PropertyResult> {
    setBusy(true);
    const r = await run();
    setBusy(false);
    if (!r.ok) setMessage({ text: r.error, good: false });
    else {
      const text = done(r);
      if (text) setMessage({ text, good: true });
    }
    await refresh();
    const [w, st, bd] = await Promise.all([api.workStatus(), api.lifeStatus(), api.marketBoard()]);
    setWork(w);
    setStatus(st);
    setBoard(bd);
    if (property) void api.buildingOwners(property.id).then(setOwners);
    onChanged?.();
    return r;
  }

  const life = assets?.life ?? null;
  const homeUnit = life?.home_unit ?? null;
  const letting = useMemo(() => new Set((assets?.units ?? []).filter((u) => u.let).map((u) => u.unit)), [assets]);
  const coins = assets?.coins ?? 0;
  const showWelcome = signedIn && loaded && !homeUnit && !welcomeShut && !property && !place && !finderOpen;
  // First only a home search; once you have a home, all of Home, Work, Money, Life and Services.
  // The guide's next step: a home, a job, a budget, body and mind, then where to chat.
  const step: GuideStep | null =
    !signedIn || !loaded || !life || guide.done
      ? null
      : !homeUnit
        ? "home"
        : !work?.job && !status?.hustle
          ? "job"
          : !guide.budget
            ? "budget"
            : !guide.life
              ? "life"
              : !guide.chat && !pretend
                ? "chat"
                : null;
  const finds = useMemo(() => (finderOpen && region ? homesByArea(region, planOf(region)) : []), [finderOpen, region]);
  const openFinder = () => {
    setWelcomeShut(true);
    setFinderOpen(true);
    setListings(null);
    if (region) void api.marketListings(region.region.id).then(setListings);
  };
  /** Open a building's card by its id: as bought if someone owns it, else as the map has it. */
  const showBuilding = (id: string) => {
    const sp = ownedSpot(id);
    if (!region || !sp) return;
    fly(sp.x, sp.z);
    const plan = planOf(region);
    const t = tileAt(plan, spiralIndex(sp.x, sp.z));
    const b = owned.find((o) => o.id === id)?.building ?? t.building;
    if (b) onProperty(propertyInfo(b, sp.x, sp.z, addressOf(plan, t), region));
  };
  const pickHome = (h: HomeFind) => {
    if (!region) return;
    setFinderOpen(false);
    fly(h.x, h.z);
    const plan = planOf(region);
    const t = tileAt(plan, spiralIndex(h.x, h.z));
    if (t.building) onProperty(propertyInfo(t.building, h.x, h.z, addressOf(plan, t), region));
  };
  const plan = useMemo(() => (workOpen && region ? planOf(region) : null), [workOpen, region]);

  const jobs: JobsContext | undefined =
    signedIn && region
      ? {
          prices: region.region.prices,
          homeUnit,
          skills: work?.skills ?? {},
          certs: (status?.courses ?? []).filter((c) => c.done && c.cert).map((c) => c.cert!),
          current: work?.job ? { place: work.job.place, job: work.job.job } : null,
          busy,
          onTake: (wp, job, mode) => {
            const hire = (ticket?: string) =>
              act(
                () => api.takeJob(wp.id, job.job, mode, ticket),
                (r) => `You're a ${job.title} now. Pay builds up every game day (2 hours).${paid(r.pay)}`,
              );
            // Skilled jobs: an interview first, then the job with the pass it hands back.
            const take = async () => {
              if (!needsInterview(job)) return void hire();
              setBusy(true);
              const start = await api.interviewStart(wp.id, job.job).catch(() => ({ ok: false as const, error: "Couldn't start the interview. Try again." }));
              setBusy(false);
              if (!start.ok) return setMessage({ text: start.error, good: false });
              setInterview({ start, hire });
            };
            // Running at a loss: fares there and back cost more than the pay after tax.
            const km = homeUnit ? tripKmBetween(homeUnit, wp.id) : null;
            const fare = km === null ? 0 : (fareMint(mode, km, region.region.prices) ?? 0);
            const net = dayNet(payDay(job, region.region.prices), work?.skills[job.skill] ?? 0, fare);
            const loss = net < 0 ? `Heads up: you'd run at a loss. After income tax, ${job.title} pays less than your fares there and back, so you'd lose about ₥${money(-net)} every game day.` : "";
            const now = work?.job;
            if (!now && !loss) return void take();
            // One main job at a time: say so before swapping.
            setConfirm({
              title: now ? "Switch jobs?" : "Work at a loss?",
              text: [now ? `You're a ${now.title} at ${now.placeName}. You can have one main job, so becoming a ${job.title} means leaving it. The pay you've earned there is collected first.` : "", loss]
                .filter(Boolean)
                .join(" "),
              yes: now ? `Switch to ${job.title}` : "Take it anyway",
              run: () => void take(),
            });
          },
        }
      : undefined;

  const day = dayOf({
    homeUnit,
    job: work?.job ? { place: work.job.place, mode: work.job.mode as Commute } : null,
    hustleHours: status?.hustle?.hours ?? 0,
    course: status?.courses.find((c) => !c.done)?.course ?? null,
    exercise: status?.exercise ?? "none",
  });

  const home = homeUnit ? (assets?.units ?? []).find((u) => u.unit === homeUnit) : undefined;
  const homeSpot = homeUnit ? ownedSpot(homeUnit.split("/")[0]) : null;
  const homeBuilding = home ? owned.find((o) => o.id === home.building) : undefined;
  const homeLabel = home ? [home.label, home.name ?? (homeBuilding ? BUILDING_LABEL[homeBuilding.building.kind] : null)].filter(Boolean).join(", ") : "";

  const goHome = () => {
    if (!homeSpot) return;
    fly(homeSpot.x, homeSpot.z);
    setHomeOpen(true);
    setNeighbours(null);
    void api.neighbours().then(setNeighbours);
  };

  const overlay = region ? (
    <>
      {/* Your life, under the place's name card: Home, Work, Money, Life, Services (first only Find a home). */}
      <div className="pointer-events-none absolute left-2.5 top-14 z-10 flex max-w-[calc(100vw-4.5rem)] flex-col items-start gap-2 sm:left-4 sm:top-16 sm:max-w-md">
        <div className="flex flex-wrap gap-1.5">
          {signedIn && loaded && !homeUnit && (
            <button
              onClick={() => (life ? openFinder() : setWelcomeShut(false))}
              className={`pointer-events-auto relative flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gold px-3.5 text-sm font-semibold text-ink shadow-lg ${step === "home" ? GLOW : ""}`}
            >
              <Search className="size-4" />
              Find a home
              {step === "home" && <Ripple />}
            </button>
          )}
          {signedIn && homeUnit && (
            <>
              <LifeButton icon={House} label="Home" onClick={goHome} />
              <LifeButton icon={Briefcase} label="Work" glow={step === "job"} onClick={() => setWorkOpen(true)} />
              <LifeButton
                icon={Wallet}
                label="Money"
                glow={step === "budget"}
                dot={!!(status?.powerCut || board?.received.some((o) => o.status === "open"))}
                onClick={() => {
                  setAssetsOpen(true);
                  void api.lifeStatus().then(setStatus);
                }}
              />
              <LifeButton
                icon={HeartPulse}
                label="Life"
                glow={step === "life"}
                warn={!!status && status.health < 30}
                onClick={() => {
                  setLifeOpen(true);
                  if (step === "life") markGuide("life");
                }}
              />
              <LifeButton icon={Handshake} label="Services" onClick={() => setServicesOpen(true)} />
            </>
          )}
        </div>
        {step && GUIDE[step] && (
          <div className="pointer-events-auto flex max-w-xs items-start gap-2 rounded-2xl bg-ink px-3 py-2 text-white shadow-lg">
            <p className="min-w-0 flex-1 text-xs leading-snug">
              <b className="text-gold">{GUIDE[step].n ? `Step ${GUIDE[step].n} of 4 · ` : ""}</b>
              {GUIDE[step].text}
            </p>
            <button onClick={() => markGuide(step === "chat" ? "chat" : "done")} className="shrink-0 text-[11px] font-semibold text-white/70 hover:text-white">
              {step === "chat" ? "Got it" : "Skip"}
            </button>
          </div>
        )}
      </div>
      {/* Search the map: top right, under your mint and the menu. */}
      <div className="pointer-events-none absolute right-2.5 top-14 z-10 flex justify-end sm:right-4 sm:top-16">
        <MapSearch region={region} mine={assets?.units ?? []} onPick={(h: SearchHit) => fly(h.x, h.z)} compact />
      </div>
      {status?.event && !moment && (
        <div className="pointer-events-none absolute inset-x-0 top-40 z-10 flex justify-center px-3 sm:top-32">
          <button onClick={() => setMoment(true)} className="pointer-events-auto flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink shadow-lg ring-4 ring-gold/30">
            <Sparkles className="size-4" /> Breakthrough {status.event.source === "job" ? "at work" : "in your hustle"}: {status.event.title}
          </button>
        </div>
      )}
      {message && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-24 z-50 flex justify-center px-3">
          <p className={`flex max-w-sm items-center gap-2 rounded-2xl px-4 py-2.5 text-sm shadow-lg ${message.good ? "bg-ink text-white" : "bg-hit text-white"}`}>
            {message.text}
            <button onClick={() => setMessage(null)} aria-label="Close">
              <X className="size-4" />
            </button>
          </p>
        </div>
      )}
      {showWelcome && (
        <StartLife
          place={region.region.name}
          budget={life ? coins : budget}
          prices={region.region.prices}
          started={!!life}
          busy={busy}
          granted={life?.granted ?? 0}
          pretend={pretend}
          onStart={() =>
            act(
              () => api.startLife(region.region.id),
              () => {
                openFinder();
                return null;
              },
            )
          }
          onPack={async (id) => {
            setBusy(true);
            const r = await api.startPack(id, region.region.id);
            setBusy(false);
            if (!r.ok) return setMessage({ text: r.error, good: false });
            if (r.url) return void window.location.assign(r.url);
            setMessage({ text: "Your pack is in. Now find your first home!", good: true });
            await refresh();
            openFinder();
          }}
          onClose={() => setWelcomeShut(true)}
          onFind={openFinder}
        />
      )}
      {finderOpen && region && (
        <HomeFinder
          areas={finds}
          listings={
            listings?.map((l) => {
              const sp = ownedSpot(l.building);
              return { ...l, area: sp ? region.areaAt(sp.x, sp.z) : "" };
            }) ?? null
          }
          coins={coins}
          prices={region.region.prices}
          onPick={pickHome}
          onListing={(l) => {
            setFinderOpen(false);
            showBuilding(l.building);
          }}
          onClose={() => setFinderOpen(false)}
        />
      )}
      {homeOpen && homeSpot && <HomeCard label={homeLabel} area={region.areaAt(homeSpot.x, homeSpot.z)} neighbours={neighbours} onClose={() => setHomeOpen(false)} />}
      {place && (
        <Sheet onClose={() => setPlace(null)} wide>
          <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 bg-panel/95 px-5 pb-2 pt-5 backdrop-blur">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold leading-tight">{place.name}</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{region.areaAt(place.x, place.z)}</span>
              </p>
            </div>
            <button onClick={() => setPlace(null)} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-4">
            {jobs ? <JobsHere place={place} ctx={jobs} /> : <p className="text-sm text-muted">Sign in to work here.</p>}
          </div>
          {signedIn && (
            <button onClick={() => setReport({ x: place.x, z: place.z, where: place.name })} className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
              <Flag className="size-3.5" /> Report a problem with this place
            </button>
          )}
        </Sheet>
      )}
      {workOpen && jobs && (
        <WorkSheet
          glow={step === "job"}
          status={work}
          life={status}
          day={day}
          onStartHustle={(id) => {
            const run = () => act(() => api.startHustle(id), () => "Your side hustle has started. It earns by the game day.");
            if (!status?.hustle) return void run();
            setConfirm({ title: "Change side hustle?", text: `You can have one side hustle. Starting this one stops ${status.hustle.title} (what it made is collected first).`, yes: "Change", run });
          }}
          onStopHustle={() =>
            setConfirm({ title: "Stop your side hustle?", text: "What it made so far is collected first. Its start-up cost doesn't come back.", yes: "Stop it", run: () => act(() => api.stopHustle(), () => "Side hustle stopped.") })
          }
          region={region}
          plan={plan}
          ctx={jobs}
          onCollect={() =>
            act(
              () => api.collectPay(),
              (r) =>
                `+₥${money((r.pay?.net ?? 0) + (r.pay?.hustle?.net ?? 0))} after tax and fares${r.pay?.hustle?.gross ? ` (₥${money(r.pay.hustle.net)} from your side hustle)` : ""}.`,
            )
          }
          onMode={(mode, perDay) =>
            setConfirm({
              title: mode === "walk" ? "Walk to work from now on?" : `Go by ${COMMUTE_LABEL[mode].toLowerCase()} from now on?`,
              text: `${perDay ? `It costs ₥${money(perDay)} a game day, there and back.` : "It's free."}${
                work?.job && dayNet(work.job.payDay, work.skills[work.job.skill] ?? 0, perDay / 2) < 0
                  ? ` Heads up: this way you'd run at a loss, about ₥${money(-dayNet(work.job.payDay, work.skills[work.job.skill] ?? 0, perDay / 2))} every game day after tax.`
                  : ""
              }`,
              yes: mode === "walk" ? "Walk from now on" : `Go by ${COMMUTE_LABEL[mode].toLowerCase()}`,
              run: () => act(() => api.setCommute(mode), (r) => `${mode === "walk" ? "You'll walk to work" : `You'll go by ${COMMUTE_LABEL[mode].toLowerCase()}`} from now on.${paid(r.pay)}`),
            })
          }
          onQuit={() => act(() => api.quitJob(), (r) => `You've left your job.${paid(r.pay)}`)}
          onShow={(id) => {
            const s = ownedSpot(id);
            if (s) fly(s.x, s.z);
            setWorkOpen(false);
          }}
          onClose={() => setWorkOpen(false)}
        />
      )}
      {property && (
        <PropertyCard
          key={property.id}
          jobs={jobs}
          onReport={
            signedIn
              ? () => {
                  const sp = ownedSpot(property.id);
                  if (sp) setReport({ x: sp.x, z: sp.z, where: `${property.title}, ${property.address}` });
                }
              : undefined
          }
          info={property}
          onClose={() => setProperty(null)}
          market={
            signedIn
              ? {
                  owners,
                  coins,
                  started: !!life,
                  homeUnit,
                  letting,
                  busy,
                  onBuy: (u) =>
                    act(
                      () => api.buyUnit(u.id),
                      (r) => (r.home ? `${u.label} is yours, and your home. Welcome!` : `${u.label} is yours.`),
                    ),
                  onHome: (u) => act(() => api.setHome(u.id), () => `You live at ${u.label} now.`),
                  onLet: (u, on) => act(() => api.letUnit(u.id, on), () => (on ? `${u.label} is up for rent.` : `${u.label} isn't let any more.`)),
                  onRename: (name) => act(() => api.renameBuilding(property.id, name), () => (name.trim() ? `Renamed ${name.trim()}.` : "Name cleared.")),
                  onBuyListed: (u, price) =>
                    setConfirm({
                      title: `Buy ${u.label}?`,
                      text: `₥${money(price)} to its owner, plus ${Math.round(BUY_TAX * 100)}% tax: ₥${money(buyerPays(price, BUY_TAX))} in all. A tenant living there stays.`,
                      yes: `Buy for ₥${money(buyerPays(price, BUY_TAX))}`,
                      run: () => void act(() => api.buyListed(u.id, price), (r) => (r.home ? `${u.label} is yours, and your home. Welcome!` : `${u.label} is yours.`)),
                    }),
                  onOffer: (u) =>
                    setAsk({
                      title: `Offer for ${u.label}`,
                      text: `It's worth about ₥${money(u.mint)}. What you offer (and the ${Math.round(BUY_TAX * 100)}% tax) is held from your wallet until the owner answers, for up to ${OFFER_HOURS} hours.`,
                      initial: Math.round(u.mint),
                      note: (n) => `₥${money(buyerPays(n, BUY_TAX))} held with the tax. You get it back if they say no.`,
                      cta: (n) => `Offer ₥${money(n)}`,
                      run: (n) => api.makeOffer(u.id, n),
                      done: () => "Offer sent. You'll see the answer under Money → Property.",
                    }),
                  onSell: (u) => askSell(u.id, u.label, u.mint),
                  onUnsell: (u) => act(() => api.unlistUnit(u.id), () => `${u.label} is off the market.`),
                }
              : undefined
          }
        />
      )}
      {assetsOpen && assets && (
        <MoneySheet
          status={status}
          assets={assets}
          owned={owned}
          region={region}
          busy={busy}
          loadMoney={api.money}
          loadTime={api.lifeTime}
          onBudget={(b) =>
            act(
              () => api.setBudget(b),
              () => {
                markGuide("budget");
                return "Budget saved. Everything you earn is shared out by it now.";
              },
            )
          }
          onMove={(from, to, amount) => act(() => api.movePot(from, to, amount), () => `Moved ₥${money(amount)}.`)}
          onClose={() => setAssetsOpen(false)}
          onCollect={() => act(() => api.collectRent(), (r) => `+₥${(r.rent ?? 0).toFixed(2)} rent (after tax), shared into your pots.`)}
          onShow={(u) => {
            const s = ownedSpot(u.building);
            if (s) fly(s.x, s.z);
            setAssetsOpen(false);
          }}
          startTab={step === "budget" ? "budget" : board?.received.some((o) => o.status === "open") ? "property" : undefined}
          glowBudget={step === "budget"}
          owning={{
            board,
            onLet: (u, on) => act(() => api.letUnit(u.unit, on), () => (on ? `${u.label} is up for rent. Rent starts when a tenant moves in.` : `${u.label} isn't let any more.`)),
            onLevel: (u, level) => act(() => api.setRentLevel(u.unit, level), () => (u.let ? "Rent changed. Finding a tenant at the new rent." : "Rent changed.")),
            onSell: (u, worth) => askSell(u.unit, u.label, worth, u.forSale),
            onUnsell: (u) => act(() => api.unlistUnit(u.unit), () => `${u.label} is off the market.`),
            onAnswer: (o, action) =>
              action === "accept"
                ? setConfirm({
                    title: `Sell to ${o.who}?`,
                    text: `${o.label ?? "It"} goes to them for ₥${money(o.price)}. You get ₥${money(sellerGets(o.price))} after the 2% tax (a loan on it is paid off first).`,
                    yes: `Sell for ₥${money(o.price)}`,
                    run: () => void act(() => api.answerOffer(o.id, "accept"), () => `Sold to ${o.who}.`),
                  })
                : act(() => api.answerOffer(o.id, "refuse"), () => "Offer turned down."),
            onCounter: (o) =>
              setAsk({
                title: "Ask for more",
                text: `${o.who} offered ₥${money(o.price)}. Ask for a higher price: they can take it or leave it.`,
                initial: Math.round(o.price * 1.1),
                note: (n) => `You'd get ₥${money(sellerGets(n))} after the 2% tax.`,
                cta: (n) => `Ask ₥${money(n)}`,
                run: (n) => api.answerOffer(o.id, "counter", n),
                done: () => "Sent. You'll see their answer here.",
              }),
            onReply: (o, action) =>
              action === "accept"
                ? setConfirm({
                    title: `Pay ₥${money(o.counter ?? 0)}?`,
                    text: `${o.label ?? "It"} becomes yours. What your offer held counts towards it; the rest (with the 3% tax) comes from your wallet.`,
                    yes: `Pay ₥${money(o.counter ?? 0)}`,
                    run: () => void act(() => api.replyOffer(o.id, "accept"), () => `${o.label ?? "It"} is yours.`),
                  })
                : act(() => api.replyOffer(o.id, "withdraw"), () => "Offer withdrawn. Your mint is back."),
            onBorrow: () => setLoanOpen(true),
            onFind: () => {
              setAssetsOpen(false);
              openFinder();
            },
            onRepay: () =>
              board?.loan &&
              setAsk({
                title: "Pay off your loan",
                text: `You owe ₥${money(board.loan.balance)}. Paying early saves interest. It comes from Savings, then your wallet.`,
                initial: board.loan.balance,
                max: board.loan.balance,
                cta: (n) => `Pay ₥${money(n)}`,
                run: (n) => api.repayLoan(n),
                done: (n) => (n >= (board.loan?.balance ?? 0) ? "Loan paid off. Your property is free." : `Paid ₥${money(n)}.`),
              }),
          }}
        />
      )}
      {servicesOpen && (
        <ServicesSheet
          load={loadServices}
          busy={busy}
          onBook={(id, title, cost) =>
            setConfirm({
              title: `Book ${title}?`,
              text: `₥${money(cost)} is held from your Savings (then wallet) and goes to them when you confirm it's done. You can cancel until they start.`,
              yes: `Book for ₥${money(cost)}`,
              run: () => act(() => api.serviceBook(id), () => "Booked. You'll see it under Services → Yours."),
            })
          }
          onTake={(id, title) =>
            setConfirm({
              title: `Take on "${title}"?`,
              text: "Their money is held now and paid to you when they confirm it's done (or 6 hours after you mark it done), less VAT.",
              yes: "Take it on",
              run: () => act(() => api.serviceTake(id), () => "It's yours to do. Mark it done under Services → Yours."),
            })
          }
          onJob={(id, action) =>
            act(
              () => api.serviceJob(id, action),
              () => ({ done: "Marked done. They'll confirm and pay.", confirm: "Paid. Thanks for using a local service!", decline: "Declined; they get their money back.", cancel: "Cancelled; your money's back." })[action],
            )
          }
          onPost={async (what, f) => {
            const r = what === "offer" ? await api.serviceOffer(f) : await api.serviceRequest(f);
            if (r.ok) setMessage({ text: what === "offer" ? "Your service is up." : "Your request is up.", good: true });
            return r;
          }}
          onCloseItem={(id) => act(() => api.serviceClose(id), () => "Closed.")}
          onClose={() => setServicesOpen(false)}
        />
      )}
      {report && (
        <ReportSheet
          where={report.where}
          pretend={pretend}
          onSend={async (kind, note) => {
            const r = await api.reportMap({ region: region.region.id, x: report.x, z: report.z, kind, note });
            if (r.ok) setMessage({ text: pretend ? "Report noted (test page: not sent)." : "Thanks! We'll look at it and let you know when it's fixed.", good: true });
            return r;
          }}
          onClose={() => setReport(null)}
        />
      )}
      {signedIn && homeUnit && (
        <button
          onClick={() => {
            const c = centerRef.current?.();
            if (c) setReport({ x: c.x, z: c.z, where: `${region.areaAt(c.x, c.z)}: the middle of your screen` });
          }}
          className="glass pointer-events-auto absolute bottom-7 left-2.5 z-10 flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold sm:left-4"
          aria-label="Report a problem with the map"
        >
          <Flag className="size-3.5" /> <span className="max-sm:hidden">Report a problem</span>
        </button>
      )}
      {business && (
        <BusinessSheet b={business} onHit={(kind) => void api.hitBusiness(business.id, kind)} onClose={() => setBusiness(null)} />
      )}
      {ask && (
        <AmountSheet
          key={ask.title}
          title={ask.title}
          text={ask.text}
          initial={ask.initial}
          max={ask.max}
          busy={busy}
          note={ask.note}
          cta={ask.cta}
          onSubmit={async (n) => {
            const r = await act(() => ask.run(n), () => ask.done(n));
            if (r.ok) setAsk(null);
          }}
          onClose={() => setAsk(null)}
        />
      )}
      {loanOpen && board && (
        <LoanSheet
          max={board.canBorrow}
          rate={board.rate}
          misses={board.misses}
          busy={busy}
          onSubmit={async (amount, months) => {
            const r = await act(() => api.takeLoan(amount, months), () => `₥${money(amount)} from the World Bank is in your wallet.`);
            if (r.ok) setLoanOpen(false);
          }}
          onClose={() => setLoanOpen(false)}
        />
      )}
      {confirm && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-xs rounded-3xl bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-extrabold">{confirm.title}</h3>
            <p className="mt-2 text-sm text-muted">{confirm.text}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setConfirm(null)} className="h-10 flex-1 rounded-full bg-ink/5 text-sm font-semibold">
                Not now
              </button>
              <button
                onClick={() => {
                  const run = confirm.run;
                  setConfirm(null);
                  run();
                }}
                className="h-10 flex-1 rounded-full bg-ink px-3 text-sm font-semibold text-white"
              >
                {confirm.yes}
              </button>
            </div>
          </div>
        </div>
      )}
      {lifeOpen && (
        <LifeSheet
          status={status}
          day={day}
          onExercise={(e) => act(() => api.setExercise(e), () => (e === "none" ? "No exercise for now." : `${EXERCISE[e].label} it is.`))}
          skills={work?.skills ?? {}}
          prices={region.region.prices}
          busy={busy}
          onCare={(id) => act(() => api.care(id), () => "Feeling better already.")}
          onEnrol={(id) => act(() => api.enrol(id), () => "Enrolled. It finishes by itself; you can keep working meanwhile.")}
          onProcedure={(id) => act(() => api.procedure(id), () => "Booked and done. Take it easy while you recover.")}
          onClose={() => setLifeOpen(false)}
        />
      )}
      {moment && status?.event && (
        <MomentSheet
          event={status.event}
          onAnswer={async (choice) => {
            const r = await api.answerEvent(choice);
            await refresh();
            return r;
          }}
          onClose={() => {
            setMoment(false);
            void api.lifeStatus().then(setStatus);
          }}
        />
      )}
      {interview && (
        <InterviewSheet
          start={interview.start}
          onSubmit={(answers) => api.interviewSubmit(interview.start.token, answers)}
          onPassed={(ticket) => {
            const hire = interview.hire;
            setInterview(null);
            hire(ticket);
          }}
          onClose={() => setInterview(null)}
        />
      )}
    </>
  ) : null;

  // Leased buildings stand as their business made them (a refit, more storeys), with its name.
  const shown = useMemo<OwnedProperty[]>(() => {
    if (!region || !businesses.length) return owned;
    const plan = planOf(region);
    const extra: OwnedProperty[] = [];
    for (const b of businesses) {
      const s = ownedSpot(b.building);
      const base = s ? tileAt(plan, spiralIndex(s.x, s.z)).building : undefined;
      if (!base || owned.some((o) => o.id === b.building)) continue;
      extra.push({ id: b.building, building: { ...base, kind: b.kind ?? base.kind, storeys: b.storeys ?? base.storeys, state: "built" } as typeof base, name: b.name });
    }
    return extra.length ? [...owned, ...extra] : owned;
  }, [owned, businesses, region]);

  // Upgraded businesses (with a logo) go on the billboards.
  const billboardAds = useMemo(
    () => businesses.filter((b) => b.billboard && b.logo).map((b) => ({ id: `bz:${b.id}`, image: b.logo!, headline: b.about.slice(0, 60), brand: b.name, link: b.website })),
    [businesses],
  );
  const openBusiness = useCallback(
    (b: MapBusiness | string) => {
      const found = typeof b === "string" ? businesses.find((x) => x.id === b) : b;
      if (!found) return;
      setBusiness(found);
      void api.hitBusiness(found.id, "view");
    },
    [api, businesses],
  );
  const businessViews = useCallback(
    (views: Record<string, number>) => {
      for (const id of Object.keys(views)) if (id.startsWith("bz:")) void api.hitBusiness(id.slice(3), "billboard");
    },
    [api],
  );

  return { centerRef, owned: shown, flyTo, onProperty, onWorkplace: setPlace, businesses, onBusiness: openBusiness, billboardAds, businessViews, overlay };
}
