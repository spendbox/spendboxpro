"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, Flag, Handshake, HeartPulse, House, MapPin, Sparkles, Wallet, X } from "@/components/icons";
import { makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { BUILDING_LABEL } from "@/lib/world/buildings";
import type { RegionMap } from "@/lib/world/compile";
import { regionMap } from "@/lib/world";
import { ownedSpot } from "@/lib/world/owned";
import type { PropertyInfo } from "@/lib/world/property";
import type { BuildingOwner, InterviewStart, LifeStatus, Neighbour, PaySettled, PropertyApi, PropertyResult, WorkStatus } from "@/lib/world/property-api";
import { COMMUTE_LABEL, needsInterview, type Commute } from "@/lib/world/work";
import { dayOf, EXERCISE } from "@/lib/world/day";
import type { Workplace } from "@/lib/world/workplace";
import { PropertyCard } from "../property-card";
import { Sheet } from "../sheet";
import { LifeSheet } from "./life-sheet";
import { MoneySheet } from "./money-sheet";
import { HomeCard } from "./home-card";
import { JobsHere, type JobsContext } from "./jobs-here";
import { MapSearch, type SearchHit } from "./map-search";
import { StartLife } from "./start-life";
import { useLife } from "./use-life";
import { WorkSheet } from "./work-sheet";
import { BusinessSheet } from "./business-sheet";
import { ServicesSheet } from "./services-sheet";
import { ReportSheet } from "./report-sheet";
import type { MapBusiness } from "@/lib/world/business";
import type { OwnedProperty } from "@/lib/world/owned";
import { InterviewSheet, MomentSheet } from "./moments";

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

  useEffect(() => {
    if (!signedIn || !regionId) return;
    const t = setTimeout(() => {
      void api.workStatus().then(setWork);
      void api.lifeStatus().then(setStatus);
    }, 0);
    // Bills, health and school move on with time: look again now and then.
    const every = setInterval(() => void api.lifeStatus().then(setStatus), 120_000);
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

  const fly = (x: number, z: number) => setFlyTo({ tile: spiralIndex(Math.round(x), Math.round(z)), at: Date.now() });

  async function act(run: () => Promise<PropertyResult>, done: (r: PropertyResult & { ok: true }) => string | null) {
    setBusy(true);
    const r = await run();
    setBusy(false);
    if (!r.ok) setMessage({ text: r.error, good: false });
    else {
      const text = done(r);
      if (text) setMessage({ text, good: true });
    }
    await refresh();
    const [w, st] = await Promise.all([api.workStatus(), api.lifeStatus()]);
    setWork(w);
    setStatus(st);
    if (property) void api.buildingOwners(property.id).then(setOwners);
    onChanged?.();
  }

  const life = assets?.life ?? null;
  const homeUnit = life?.home_unit ?? null;
  const letting = useMemo(() => new Set((assets?.units ?? []).filter((u) => u.let).map((u) => u.unit)), [assets]);
  const coins = assets?.coins ?? 0;
  const showWelcome = signedIn && loaded && !homeUnit && !welcomeShut && !property && !place;
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
            const now = work?.job;
            if (!now) return void take();
            // One main job at a time: say so before swapping.
            setConfirm({
              title: "Switch jobs?",
              text: `You're a ${now.title} at ${now.placeName}. You can have one main job, so becoming a ${job.title} means leaving it. The pay you've earned there is collected first.`,
              yes: `Switch to ${job.title}`,
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
      <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center gap-2 px-3 sm:top-16">
        <MapSearch region={region} mine={assets?.units ?? []} onPick={(h: SearchHit) => fly(h.x, h.z)} />
        {signedIn && homeUnit && (
          <button onClick={goHome} className="glass pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold" aria-label="Go home">
            <House className="size-4" />
            <span className="max-sm:hidden">Home</span>
          </button>
        )}
        {signedIn && life && (
          <button onClick={() => setWorkOpen(true)} className="glass pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold" aria-label="Work">
            <Briefcase className="size-4" />
            <span className="max-sm:hidden">Work</span>
          </button>
        )}
        {signedIn && life && (
          <button onClick={() => setServicesOpen(true)} className="glass pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold" aria-label="Services">
            <Handshake className="size-4" />
            <span className="max-sm:hidden">Services</span>
          </button>
        )}
        {signedIn && life && (
          <button onClick={() => setLifeOpen(true)} className="glass pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold" aria-label="Life">
            <HeartPulse className={`size-4 ${status && status.health < 30 ? "text-hit" : ""}`} />
            <span className="max-sm:hidden">Life</span>
          </button>
        )}
        {signedIn && (
          <button
            onClick={() => {
              setAssetsOpen(true);
              void api.lifeStatus().then(setStatus);
            }}
            className="glass pointer-events-auto relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold"
            aria-label="Money"
          >
            <Wallet className="size-4" />
            <span className="max-sm:hidden">Money</span>
            {status?.powerCut && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-hit" />}
          </button>
        )}
      </div>
      {status?.event && !moment && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center px-3 sm:top-28">
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
          onStart={() => act(() => api.startLife(region.region.id), () => null)}
          onPack={async (id) => {
            setBusy(true);
            const r = await api.startPack(id, region.region.id);
            setBusy(false);
            if (!r.ok) return setMessage({ text: r.error, good: false });
            if (r.url) return void window.location.assign(r.url);
            setMessage({ text: "Your pack is in. Now find your first home!", good: true });
            await refresh();
          }}
          onClose={() => setWelcomeShut(true)}
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
              text: `${perDay ? `It costs ₥${money(perDay)} a game day, there and back, from your Travel pot.` : "It's free."} Pay so far is settled at your old fare first.`,
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
          onBudget={(b) => act(() => api.setBudget(b), () => "Budget saved. Everything you earn is shared out by it now.")}
          onMove={(from, to, amount) => act(() => api.movePot(from, to, amount), () => `Moved ₥${money(amount)}.`)}
          onClose={() => setAssetsOpen(false)}
          onCollect={() => act(() => api.collectRent(), (r) => `+₥${(r.rent ?? 0).toFixed(2)} rent (after tax), shared into your pots.`)}
          onShow={(u) => {
            const s = ownedSpot(u.building);
            if (s) fly(s.x, s.z);
            setAssetsOpen(false);
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
      {signedIn && (
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
