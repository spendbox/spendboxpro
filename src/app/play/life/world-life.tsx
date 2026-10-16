"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen } from "lucide-react";
import type { HomePlan } from "@/lib/home-plan";
import { playTrip, tripWanted } from "../trip/play";
import { Flag, MapPin, Pencil, Search, Star, X } from "@/components/icons";
import { addressOf, makePlan, spiralIndex, tileAt, type CityPlan } from "@/lib/city/layout";
import { WORLD_EVENT_BY_KEY, type WorldEvent } from "@/lib/world-events";
import { BUILDING_LABEL } from "@/lib/world/buildings";
import type { RegionMap } from "@/lib/world/compile";
import { regionMap } from "@/lib/world";
import { ownedSpot } from "@/lib/world/owned";
import { propertyInfo, type PropertyInfo } from "@/lib/world/property";
import { homesByArea, type AreaHomes, type HomeFind } from "@/lib/world/homes";
import type { BuildingOwner, InterviewStart, LifeStatus, Neighbour, PassportStampNews, PaySettled, PropertyApi, PropertyResult, WorkStatus } from "@/lib/world/property-api";
import { cheapestCommute, COMMUTE_LABEL, dayNet, fareMint, fareOrBus, tripFareMint, INCOME_TAX, needsInterview, payDay, tripKmBetween, tripWords, type Commute } from "@/lib/world/work";
import { ferryKmBetween } from "@/lib/world/trips";
import { dayOf, EXERCISE } from "@/lib/world/day";
import { HUSTLES, hustleDay, hustleStart } from "@/lib/world/hustles";
import { workplaceById, type Workplace } from "@/lib/world/workplace";
import { PropertyCard } from "../property-card";
import type { AdPreview } from "./advertise-panel";
import { explorePlaces, type ExplorePlace } from "@/lib/world/explore";
import type { NearRoad, SpotWords } from "../events/events";
import { areaK } from "@/lib/world/events";
import { around, cachedThings, loadThings, sharedPlayerNews } from "./things-cache";
import { isHere, whileHere } from "../activity";
import type { ThingsTab } from "./things-sheet";
import { JailBanner } from "../people/street-dating";
import { cityNews, playerStory, type NewsItem } from "@/lib/world/news";
import { playSfx } from "../sound";
import { MarkCard } from "./marks-sheet";
import type { MapMark } from "../mark-actions";
import type { CityMarkTag } from "../city-view";
import { Sheet } from "../sheet";
import { HomeCard } from "./home-card";
import { DoorBell, HomeParty } from "./door-sheet";
import { homeDoor, type Door } from "./visit-actions";
import { JobsHere, type JobsContext } from "./jobs-here";
import type { SearchHit } from "./map-search";
import { StartLife } from "./start-life";
import { growthOf, setGrowth } from "@/lib/world/growth";
import { useLife } from "./use-life";
import { confirmTopUp } from "../topup-actions";
import { moveOut, myRental, renameHome, type Rental } from "../property-actions";
import { discounted } from "@/lib/world/rep-levels";
import { StarterRoomBox } from "./starter-room";
import { restartTutorial, useTutorialPhase } from "../tutorial";
import type { MapBusiness } from "@/lib/world/business";
import type { OwnedProperty } from "@/lib/world/owned";
import { cash, cashText, playerCurrency, setRates, setShownCurrency } from "@/lib/world/value";
import { buyerPays, sellerGets, OFFER_HOURS, RENT_LEVEL, type Listing, type MarketBoard } from "@/lib/world/market";
import { BUY_TAX, INCOME_DAY } from "@/lib/world/property-api";
import { SIMPLE_LIFE } from "@/lib/world/simple-life";
import dynamic from "next/dynamic";

// Sheets and panels load when first opened, not with the map (docs/COSTS.md).
const HomePlanner = dynamic(() => import("../home/home-planner").then((m) => m.HomePlanner));
const HomeBuilder = dynamic(() => import("../home/home-builder").then((m) => m.HomeBuilder));
const AdvertisePanel = dynamic(() => import("./advertise-panel").then((m) => m.AdvertisePanel));
const ThingsSheet = dynamic(() => import("./things-sheet").then((m) => m.ThingsSheet));
const NewsSheet = dynamic(() => import("./news-sheet").then((m) => m.NewsSheet));
const ComingSoonSheet = dynamic(() => import("./reputation-sheet").then((m) => m.ComingSoonSheet));
const ReputationSheet = dynamic(() => import("./reputation-sheet").then((m) => m.ReputationSheet));
const CertificateSheet = dynamic(() => import("./certificate").then((m) => m.CertificateSheet));
const LeaveMarkSheet = dynamic(() => import("./marks-sheet").then((m) => m.LeaveMarkSheet));
const LifeSheet = dynamic(() => import("./life-sheet").then((m) => m.LifeSheet));
const MoneySheet = dynamic(() => import("./money-sheet").then((m) => m.MoneySheet));
const DoorSheet = dynamic(() => import("./door-sheet").then((m) => m.DoorSheet));
const SignGuestBook = dynamic(() => import("./door-sheet").then((m) => m.SignGuestBook));
const HomeFinder = dynamic(() => import("./home-finder").then((m) => m.HomeFinder));
const LandmarkBuy = dynamic(() => import("./landmark-buy").then((m) => m.LandmarkBuy));
const WorkSheet = dynamic(() => import("./work-sheet").then((m) => m.WorkSheet));
const BusinessSheet = dynamic(() => import("./business-sheet").then((m) => m.BusinessSheet));
const ServicesSheet = dynamic(() => import("./services-sheet").then((m) => m.ServicesSheet));
const ReportSheet = dynamic(() => import("./report-sheet").then((m) => m.ReportSheet));
const InterviewSheet = dynamic(() => import("./moments").then((m) => m.InterviewSheet));
const MomentSheet = dynamic(() => import("./moments").then((m) => m.MomentSheet));
const AmountSheet = dynamic(() => import("./amount-sheet").then((m) => m.AmountSheet));
const LoanSheet = dynamic(() => import("./amount-sheet").then((m) => m.LoanSheet));
const CurrencySheet = dynamic(() => import("./currency-pick").then((m) => m.CurrencySheet));
const PassportSheet = dynamic(() => import("./passport").then((m) => m.PassportSheet));
const StampPop = dynamic(() => import("./passport").then((m) => m.StampPop));

/** Each region's plan for finding jobs near home, worked out once (only when Work is opened). */
const plans = new Map<string, CityPlan>();
/** The kinds of building people live in (going in means knocking, unless it's yours). */
const HOME_KINDS = new Set(["rooming", "flats", "apartments", "mixed", "bungalow", "duplex", "terrace", "house", "mansion", "villa"]);

/** Each region's homes for sale by area, worked out once (the first time the budget filter is used). */
const homesCache = new Map<string, AreaHomes[]>();
function homesFor(region: RegionMap) {
  let h = homesCache.get(region.region.id);
  if (!h) {
    h = homesByArea(region, planOf(region));
    homesCache.set(region.region.id, h);
  }
  return h;
}

function planOf(region: RegionMap) {
  let p = plans.get(region.region.id);
  if (!p) {
    p = makePlan(region.region.seed, region);
    plans.set(region.region.id, p);
  }
  return p;
}

const CURRENCY_KEY = "newtown.currency";
/** The last exchange rates fetched (kept in this browser, so amounts are right from the start). */
const RATES_KEY = "newtown.rates";
/** How long kept rates do before asking again (the server's answer changes every few hours). */
const RATES_FRESH_MS = 6 * 3600_000;

const paid = (p: PaySettled | undefined) =>
  p && p.gross > 0 ? ` Collected ${cash(p.net)} pay (after ${cash(p.tax)} tax and ${cash(p.fares)} fares).` : "";

/** The area a spot is in (for the trip film's welcome arch). */
const areaOf = (region: ReturnType<typeof regionMap>, id: string) => placeName(region, id, true);

/** What to call a spot on the trip card: the landmark or named place there, or its area. */
function placeName(region: ReturnType<typeof regionMap>, id: string, areaOnly = false) {
  const m = /:(-?\d+),(-?\d+)/.exec(id);
  if (!region || !m) return "";
  const x = Number(m[1]), z = Number(m[2]);
  if (areaOnly) return region.areaAt(x, z);
  const lm = region.landmarks.find((l) => x >= l.ax && x < l.ax + l.w && z >= l.az && z < l.az + l.d);
  if (lm) return lm.name;
  const spot = region.spotAt(x, z);
  return spot ? spot.name : region.areaAt(x, z);
}

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
  onEnter,
  beforeHome,
  beforeFly,
  meId,
  onPerson,
  rowOutside,
  meName,
  onTripFailed,
  onWallet,
}: {
  api: PropertyApi;
  regionId: string | null;
  signedIn: boolean;
  budget: number;
  /** The world lab: payments are pretend. */
  pretend?: boolean;
  onChanged?: () => void;
  /** Go inside a building (the game's insides); left out where there are none (the test page). */
  onEnter?: (buildingId: string) => void;
  /** Before flying home: leave the building or ride you're in (asking first), then `go`. */
  beforeHome?: (go: () => void) => void;
  /** Before going anywhere on the map: true to go (on foot, it pays the fare there first). */
  beforeFly?: (x: number, z: number) => Promise<boolean>;
  /** Your account (to know your own marks), and opening someone's card. */
  meId?: string | null;
  onPerson?: (id: string) => void;
  /** The game draws the row of life buttons itself (with its own things on it): leave it out of the overlay. */
  rowOutside?: boolean;
  /** Your name (on certificates). */
  meName?: string;
  /** Going in straight away, the fare there couldn't be paid: back out. */
  onTripFailed?: () => void;
  /** Open the Wallet at the starter packs (to pay for one there: card or bank transfer). */
  onWallet?: () => void;
}) {
  const region = useMemo(() => regionMap(regionId), [regionId]);
  // How far the city has grown with its players (docs/GROWTH.md): buildings nobody owns are drawn
  // as tall as the server prices them. Asked when the city opens, and every ten minutes.
  const [growth, setGrowthNow] = useState(0);
  useEffect(() => {
    if (!regionId || pretend) return;
    let alive = true;
    const ask = () =>
      void fetch(`/api/city-growth?region=${regionId}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ level: number }>) : null))
        .then((g) => {
          if (!alive || !g) return;
          setGrowth(regionId, g.level);
          setGrowthNow(growthOf(regionId));
        })
        .catch(() => {});
    ask();
    const stop = whileHere(ask, 10 * 60_000);
    return () => {
      alive = false;
      stop();
    };
  }, [regionId, pretend]);
  const { assets, owned, loaded, refresh } = useLife(api, signedIn ? regionId : null, meName);
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [owners, setOwners] = useState<BuildingOwner[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [flyTo, setFlyTo] = useState<{ tile: number; at: number } | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [welcomeShut, setWelcomeShut] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  // The currency amounts show in (kept in this browser; change it any time). Mint, once a choice,
  // is naira now.
  const [currency, setCurrency] = useState<string>(() => {
    try {
      return playerCurrency(localStorage.getItem(CURRENCY_KEY));
    } catch {
      return "NGN";
    }
  });
  setShownCurrency(currency, region?.region.prices.perMint);
  const chooseCurrency = (code: string) => {
    setCurrency(code);
    try {
      localStorage.setItem(CURRENCY_KEY, code);
    } catch {
      // Not kept: back to naira next time.
    }
  };
  const [currencyOpen, setCurrencyOpen] = useState(false);
  // The passport (./passport): open, and a new stamp just collected ("nt-stamp", from any trip).
  const [passportOpen, setPassportOpen] = useState(false);
  const [stampNews, setStampNews] = useState<PassportStampNews | null>(null);
  useEffect(() => {
    const on = (e: Event) => setStampNews((e as CustomEvent<PassportStampNews>).detail);
    window.addEventListener("nt-stamp", on);
    return () => window.removeEventListener("nt-stamp", on);
  }, []);
  // Today's exchange rates, for anyone showing money in something other than naira: kept ones at
  // once, fresh ones from /api/rates when they're older than a few hours (docs/COSTS.md).
  const [ratesKept] = useState(() => {
    try {
      const kept = JSON.parse(localStorage.getItem(RATES_KEY) ?? "null") as { rates: Record<string, number>; at: number } | null;
      if (kept?.at) setRates(kept.rates, kept.at);
      return kept?.at ?? 0;
    } catch {
      return 0;
    }
  });
  const [, setRatesTick] = useState(0);
  useEffect(() => {
    if (currency === "NGN" || Date.now() - ratesKept < RATES_FRESH_MS) return;
    let live = true;
    fetch("/api/rates")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { rates?: Record<string, number>; at?: number } | null) => {
        if (!live || !j?.at || !j.rates) return;
        setRates(j.rates, j.at);
        setRatesTick((t) => t + 1);
        try {
          localStorage.setItem(RATES_KEY, JSON.stringify({ rates: j.rates, at: j.at }));
        } catch {
          // Not kept: fetched again next time.
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [currency, ratesKept]);

  /** Which Finance tab to open on next (the Income screen's "See your property" opens Property). */
  /** When this screen opened (tenants who've moved in by then count towards rent a day). */
  const [clock] = useState(() => Date.now());
  const [financeTab, setFinanceTab] = useState<"home" | "budget" | "property" | null>(null);
  const [work, setWork] = useState<WorkStatus | null>(null);
  const [workOpen, setWorkOpen] = useState(false);
  const [place, setPlace] = useState<Workplace | null>(null);
  const [homeOpen, setHomeOpen] = useState(false);
  const [neighbours, setNeighbours] = useState<Neighbour[] | null>(null);
  const [status, setStatusNow] = useState<LifeStatus | null>(null);
  /** When your life was last brought up to now (a heavy call: opening a screen skips it when it's fresh). */
  const statusAt = useRef(0);
  const setStatus = useCallback((st: LifeStatus | null) => {
    statusAt.current = Date.now();
    setStatusNow(st);
  }, []);
  /** Bring your life up to now in the background, unless that happened in the last half minute. */
  const freshenStatus = () => {
    if (Date.now() - statusAt.current < 30_000) return;
    statusAt.current = Date.now();
    void api.lifeStatus().then(setStatus);
  };
  const [lifeOpen, setLifeOpen] = useState(false);
  const [interview, setInterview] = useState<{ start: Extract<InterviewStart, { ok: true }>; hire: (ticket: string) => void } | null>(null);
  const [moment, setMoment] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [report, setReport] = useState<{ x: number; z: number; where: string } | null>(null);
  const centerRef = useRef<(() => { x: number; z: number }) | null>(null);
  const loadServices = useCallback(() => api.serviceBoard(), [api]);
  const [leased, setBusinesses] = useState<MapBusiness[]>([]);
  /** Advertising on the map: the panel open, a building tapped meanwhile, and the preview it lights up. */
  const [adOpen, setAdOpen] = useState(false);
  const [adPick, setAdPick] = useState<{ id: string; at: number } | null>(null);
  const [adPreview, setAdPreview] = useState<AdPreview | null>(null);
  const businesses = useMemo<MapBusiness[]>(() => {
    // Billboards only (no building): the preview goes on the billboards, nothing lights up.
    if (!adPreview || !adPreview.building) return leased;
    const p: MapBusiness = {
      id: "preview",
      building: adPreview.building,
      name: adPreview.name,
      category: "Your ad",
      about: adPreview.line || "Your business, as people on the map will see it.",
      address: "",
      phone: null,
      whatsapp: null,
      website: null,
      logo: adPreview.logo,
      billboardImage: adPreview.billboard,
      glow: 2,
      kind: null,
      storeys: null,
      billboard: true,
    };
    return [...leased.filter((b) => b.building !== adPreview.building), p];
  }, [leased, adPreview]);
  // Advertising opens from a billboard, a building's card or a link (?advertise=1&building=...).
  useEffect(() => {
    const open = (building: string | null) => {
      setAdOpen(true);
      setProperty(null);
      if (building) setAdPick({ id: building, at: Date.now() });
    };
    const onEvent = (e: Event) => open((e as CustomEvent<{ building: string | null }>).detail?.building ?? null);
    window.addEventListener("nt-advertise", onEvent);
    const sp = new URLSearchParams(window.location.search);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (sp.get("advertise") === "1") {
      t = setTimeout(() => open(sp.get("building")), 600);
      const url = new URL(window.location.href);
      url.searchParams.delete("advertise");
      url.searchParams.delete("building");
      window.history.replaceState(null, "", url);
    }
    return () => {
      window.removeEventListener("nt-advertise", onEvent);
      if (t) clearTimeout(t);
    };
  }, []);
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
  /** Things (items, shops, cars, market, craft) open on a tab, and the news. */
  const [things, setThings] = useState<ThingsTab | null>(null);
  const [newsOpen, setNewsOpen] = useState(false);
  /** Your reputation explained, and what's coming soon. */
  const [repOpen, setRepOpen] = useState(false);
  /** A course just finished: the certificate, shown once. */
  const [cert, setCert] = useState<{ course: string; title: string; cert: string | null; at: string } | null>(null);
  useEffect(() => {
    if (!status || cert) return;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem("nt-certs") ?? "[]") as string[];
    } catch {}
    // Finished in the last 3 days and not shown yet.
    const fresh = status.courses.find((c) => c.done && !seen.includes(c.course) && Date.now() - Date.parse(c.endsAt) < 3 * 86_400_000);
    if (!fresh) return;
    const t = setTimeout(() => setCert({ course: fresh.course, title: fresh.title, cert: fresh.cert, at: fresh.endsAt }), 0);
    return () => clearTimeout(t);
  }, [status, cert]);
  const [soonOpen, setSoonOpen] = useState(false);
  /** Breaking news: a story pops up at the top with a little bleep when it comes in (once each). */
  const [breaking, setBreaking] = useState<NewsItem | null>(null);
  useEffect(() => {
    // Signed out: no breaking news popping up.
    if (!region || pretend || !signedIn) return;
    const look = () => {
      if (document.visibilityState !== "visible") return;
      const latest = cityNews(region, Date.now(), 1)[0];
      if (!latest || Date.now() - latest.at > 25 * 60_000) return;
      let seen = "";
      try {
        seen = localStorage.getItem("nt-news-seen") ?? "";
        localStorage.setItem("nt-news-seen", latest.id);
      } catch {}
      if (seen === latest.id) return;
      setBreaking(latest);
      playSfx("chime");
    };
    // A player's big buy (or a challenge just won) that just happened breaks into the news too (checked every few minutes).
    const lookPlayers = () => {
      if (document.visibilityState !== "visible") return;
      void sharedPlayerNews(region.region.id)
        .then((events) => {
          const e = events[0];
          if (!e || Date.now() - e.at > 15 * 60_000) return;
          let seen = "";
          try {
            seen = localStorage.getItem("nt-news-player") ?? "";
            localStorage.setItem("nt-news-player", e.id);
          } catch {}
          if (seen === e.id) return;
          const sp = e.building ? ownedSpot(e.building) : e.x != null && e.z != null ? { x: e.x, z: e.z } : null;
          const area = sp ? region.areaAt(sp.x, sp.z) : "";
          setBreaking({ id: e.id, at: e.at, kind: e.kind === "challenge" ? "game" : e.kind === "party" ? "festival" : "money", ...playerStory(e, area, cash(e.price)), area, ...(sp ? { x: sp.x, z: sp.z } : {}) });
          playSfx("chime");
        })
        .catch(() => {});
    };
    const first = setTimeout(look, 15_000);
    const every = whileHere(look, 60_000);
    const firstP = setTimeout(lookPlayers, 40_000);
    const everyP = setInterval(() => isHere() && lookPlayers(), 3 * 60_000);
    return () => {
      clearTimeout(first);
      every();
      clearTimeout(firstP);
      clearInterval(everyP);
    };
  }, [region, pretend, signedIn]);
  useEffect(() => {
    if (!breaking) return;
    const t = setTimeout(() => setBreaking(null), 9000);
    return () => clearTimeout(t);
  }, [breaking]);
  /** Marks on the map round where you're looking, one open, and leaving one (where, in words). */
  const [marks, setMarks] = useState<MapMark[]>([]);
  const [markOpen, setMarkOpen] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<{ x: number; z: number; where: string; place?: string } | null>(null);
  const loadMarks = useCallback(() => {
    // Signed out: no marks on the city (and nothing to fetch).
    if (!regionId || pretend || !signedIn) return;
    const c = centerRef.current?.() ?? { x: 0, z: 0 };
    void around<MapMark[]>("marks", regionId, c.x, c.z).then((m) => m && setMarks(m)).catch(() => {});
  }, [regionId, pretend, signedIn]);
  useEffect(() => {
    if (!regionId || pretend || !signedIn) return;
    const first = setTimeout(loadMarks, 2500);
    const every = whileHere(loadMarks, 3 * 60_000);
    return () => {
      clearTimeout(first);
      every();
    };
  }, [regionId, pretend, signedIn, loadMarks]);
  /** Your reputation (shown at the top) and whether you own a car (to drive to work). */
  const [rep, setRep] = useState<{ score: number; hasCar: boolean; jail: string | null } | null>(null);
  /** Drive your own car to places (remembered on this phone), when you have one. */
  const [drive, setDrive] = useState(false);
  useEffect(() => {
    let on = false;
    try {
      on = localStorage.getItem("nt-drive") === "1";
    } catch {}
    const t = setTimeout(() => setDrive(on), 0);
    return () => clearTimeout(t);
  }, []);
  const chooseDrive = (on: boolean) => {
    setDrive(on);
    try {
      localStorage.setItem("nt-drive", on ? "1" : "0");
    } catch {}
  };
  const loadRep = useCallback(() => void loadThings().then((t) => t && setRep({ score: t.reputation.score, hasCar: t.hasCar, jail: t.jailedUntil ?? null })), []);
  useEffect(() => {
    if (!signedIn || !regionId || pretend) return;
    const seen = cachedThings();
    const shown = setTimeout(() => seen && setRep({ score: seen.reputation.score, hasCar: seen.hasCar, jail: seen.jailedUntil ?? null }), 0);
    const first = setTimeout(loadRep, 400);
    const every = whileHere(loadRep, 10 * 60_000);
    return () => {
      clearTimeout(shown);
      clearTimeout(first);
      every();
    };
  }, [signedIn, regionId, pretend, loadRep]);
  // A moment (../moments) moved your money or reputation: show it straight away.
  useEffect(() => {
    if (!signedIn) return;
    const on = () => {
      void refresh();
      loadRep();
    };
    window.addEventListener("nt-money-changed", on);
    return () => window.removeEventListener("nt-money-changed", on);
  }, [signedIn, refresh, loadRep]);

  useEffect(() => {
    if (!signedIn || !regionId) return;
    const t = setTimeout(() => {
      void api.workStatus().then(setWork);
      void api.lifeStatus().then(setStatus);
      void api.marketBoard().then(setBoard);
    }, 0);
    // Bills, health, school and offers move on with time: look again now and then.
    const every = whileHere(() => {
      void api.lifeStatus().then(setStatus);
      void api.marketBoard().then(setBoard);
    }, 120_000);
    return () => {
      clearTimeout(t);
      every();
    };
  }, [api, signedIn, regionId, setStatus]);

  // Get the heavy map work done while nothing else is happening, so screens that need it (Income's
  // jobs near you, the fares to islands) open at once instead of working it out on the tap.
  useEffect(() => {
    if (!region) return;
    const warm = () => {
      planOf(region);
      ferryKmBetween(`${region.region.id}:0,0`, `${region.region.id}:1,1`);
    };
    // Older Safari has no idle callback: a timer then.
    const idle = "requestIdleCallback" in window;
    const t = idle ? window.requestIdleCallback(warm, { timeout: 8000 }) : window.setTimeout(warm, 4000);
    return () => (idle ? window.cancelIdleCallback(t) : window.clearTimeout(t));
  }, [region]);

  // Real businesses on the map (everyone sees them, signed in or not).
  useEffect(() => {
    if (!regionId) return;
    let alive = true;
    const load = () => void api.mapBusinesses(regionId).then((list) => alive && setBusinesses(list)).catch(() => {});
    const first = setTimeout(load, 0);
    const every = whileHere(load, 5 * 60_000);
    return () => {
      alive = false;
      clearTimeout(first);
      every();
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

  // Back from paying for a top-up (docs/MONEY.md): check it with Paystack (once), say it's in, tidy the address.
  useEffect(() => {
    if (!signedIn) return;
    const ref = new URLSearchParams(window.location.search).get("topup");
    if (!ref) return;
    void confirmTopUp(ref).then(async (r) => {
      setMessage(
        r.ok
          ? { text: r.pack ? `Your starter pack is in: +${cash(r.mint ?? 0)}` : `Your top-up is in: +${cash(r.mint ?? 0)}${r.doubled ? " (your first one, doubled!)" : ""}`, good: true }
          : { text: r.error ?? "That payment hasn't gone through.", good: false },
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("topup");
      window.history.replaceState(null, "", url);
      await refresh();
    });
  }, [signedIn, refresh]);
  // Back from paying for a pack: check it with Paystack, then tidy the address. Without one in the
  // address, any pack paid for earlier that never arrived is checked again.
  useEffect(() => {
    if (!signedIn) return;
    const ref = new URLSearchParams(window.location.search).get("pack");
    if (!ref) {
      void api
        .checkMyPacks()
        .then(async (r) => {
          if (!r.ok) return;
          setMessage({ text: r.topup ? `Your payment is in: +${cash(r.mint ?? 0)}` : `Your pack is in: ${cash(r.mint ?? 0)} to start with.`, good: true });
          await refresh();
        })
        .catch(() => {});
      return;
    }
    void api.confirmPack(ref).then(async (r) => {
      setMessage(r.ok ? { text: `Your pack is in: ${cash((r.mint ?? 0))} to start with.`, good: true } : { text: r.error ?? "That payment hasn't gone through.", good: false });
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
      // Choosing a building to advertise on: a tap picks it instead of opening its card.
      if (adOpen) return setAdPick({ id: info.id, at: Date.now() });
      setProperty(info);
      setOwners(null);
      if (signedIn) void api.buildingOwners(info.id).then(setOwners);
    },
    [api, signedIn, adOpen],
  );

  const askSell = (unitId: string, label: string, worth: number, now?: number | null) =>
    setAsk({
      title: `Sell ${label}`,
      text: `It's worth about ${cash(Math.round(worth))}. Anyone can buy it at your price, or make you an offer. A tenant living there stays.`,
      initial: Math.round(now ?? worth),
      note: (n) => `You get ${cash(sellerGets(n))} after the 2% tax (a loan on it is paid off first).`,
      cta: (n) => `Put it up for ${cash(n)}`,
      run: (n) => api.listUnit(unitId, n),
      done: (n) => `${label} is up for sale at ${cash(n)}.`,
    });

  /** The trip to a building from where you last were (or home): the cheapest way, and its fare. */
  const driving = drive && !!rep?.hasCar;
  const tripTo = (id: string) => {
    const from = assets?.life?.at_place ?? homeUnit;
    const km = from && region ? tripKmBetween(from, id) : null;
    if (km === null || !region || !from) return null;
    const ferry = ferryKmBetween(from, id);
    const cheapest = cheapestCommute(km, ferry);
    // Your own car when you'd rather drive (anywhere; only the fuel to pay).
    const mode: Commute = driving && cheapest !== "walk" ? "car" : cheapest;
    return { mode, ferry, km, from, fare: tripFareMint(mode, km, region.region.prices, ferry) ?? 0 };
  };
  /** Drive or take the bus: a switch under each Go there, for car owners. */
  const driveSwitch = signedIn && rep?.hasCar ? (
    <button onClick={() => chooseDrive(!drive)} className="flex h-9 w-full items-center justify-center gap-2 rounded-full bg-ink/5 text-xs font-semibold" role="switch" aria-checked={drive}>
      <span className={`relative h-4 w-7 rounded-full transition ${drive ? "bg-me" : "bg-ink/20"}`}>
        <span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${drive ? "left-3.5" : "left-0.5"}`} />
      </span>
      Drive my car (just fuel)
    </button>
  ) : null;
  const tripLabel = (id: string) => {
    const t = signedIn ? tripTo(id) : null;
    return t && t.fare > 0 ? `Go there · ${cash(t.fare)} ${tripWords(t.mode, t.ferry)}` : "Go there";
  };
  /** Go into a building: pay the fare there (signed in), then in. */
  // Someone else's home: knock first (docs/HOME_PLANNER.md, "Visiting").
  const [door, setDoor] = useState<{ id: string; owner: string; signedIn: boolean } | null>(null);
  const [guestBook, setGuestBook] = useState<string | null>(null);
  /** Someone's home (a door to knock at), or a place anyone can walk into? Worked out from the map, no waiting. */
  const mightBeHome = (id: string) => {
    const m = /:(-?\d+),(-?\d+)$/.exec(id);
    if (!region || !m) return true;
    const t = tileAt(planOf(region), spiralIndex(Number(m[1]), Number(m[2])));
    return !!t.home || (!!t.building && HOME_KINDS.has(t.building.kind));
  };
  const goInside = async (id: string, knocked = false) => {
    // Only homes have a door to knock at: everywhere else, straight in.
    if (!knocked && mightBeHome(id)) {
      // A slow answer: show the tap did something.
      const slow = setTimeout(() => setMessage({ text: "Knocking on the door…", good: true }), 600);
      const d = await homeDoor(id).catch(() => ({ open: true }) as Door);
      clearTimeout(slow);
      if (!d.open) return setDoor({ id, owner: d.owner, signedIn: d.signedIn });
      if (d.party) setMessage({ text: `${d.party}: the door's open, come on in!`, good: true });
    }
    // The trip there (docs/TRIPS.md): a short film of you getting into the danfo (or your car)
    // and riding there while the fare is paid, then in. With the film off, in at once as before
    // (the fare paid on the way, and if it can't be, you're back out).
    const trip = signedIn ? tripTo(id) : null;
    const film = !!trip && trip.km >= 0.05 && tripWanted(trip.km);
    if (!film) onEnter?.(id);
    if (!signedIn) return;
    const paying = api.travelTo(id, driving).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    // Nothing happened on the way (no film after all): in at once, as without one.
    let shown = false;
    if (film && trip) {
      shown = await playTrip({ mode: trip.mode, from: placeName(region, trip.from), to: placeName(region, id) || "There", area: areaOf(region, id), km: trip.km, fare: trip.fare, ferry: trip.ferry });
      if (!shown) onEnter?.(id);
    }
    const r = await paying;
    if (!r.ok) {
      setMessage({ text: r.error, good: false });
      if (!shown) onTripFailed?.();
      return;
    }
    if (shown) onEnter?.(id);
    if (r.stamp) window.dispatchEvent(new CustomEvent("nt-stamp", { detail: r.stamp }));
    if (r.found) setMessage({ text: `On the way you found: ${r.found}! It's in your Items.`, good: true });
    else if (r.fare) setMessage({ text: `${cash(r.fare)} fare there.`, good: true });
    void refresh();
  };

  // Each fly is a new request, even to the same spot (a running count, not the clock).
  const flies = useRef(0);
  const fly = (x: number, z: number) => {
    const go = () => setFlyTo({ tile: spiralIndex(Math.round(x), Math.round(z)), at: ++flies.current });
    if (!beforeFly) return go();
    void beforeFly(x, z).then((ok) => ok && go());
  };

  /** A news story you tapped through to: fly there, and the story plays out on the spot (on this phone only) for a few minutes. */
  const [newsScene, setNewsScene] = useState<WorldEvent[]>([]);
  const showStory = ({ x, z, scene }: { x: number; z: number; scene?: string }) => {
    const go = () => {
      const tile = spiralIndex(Math.round(x), Math.round(z));
      setFlyTo({ tile, at: ++flies.current });
      const kind = scene ? WORLD_EVENT_BY_KEY[scene] : undefined;
      if (!kind) return setNewsScene([]);
      // It starts as the camera lands, with its arrival (fire engines racing in, the crowd gathering).
      const start = Date.now() + 1200;
      setNewsScene([{ id: -flies.current, key: kind.key, tile, startsAt: new Date(start).toISOString(), endsAt: new Date(start + kind.minutes * 60_000).toISOString(), near: true }]);
    };
    if (!beforeFly) return go();
    void beforeFly(x, z).then((ok) => ok && go());
  };
  useEffect(() => {
    const ev = newsScene[0];
    if (!ev) return;
    // Gone once it's over (its outro has played).
    const t = setTimeout(() => setNewsScene([]), Date.parse(ev.endsAt) - Date.now() + 5000);
    return () => clearTimeout(t);
  }, [newsScene]);

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
  // A free room straight away (docs/STARTER_ROOMS.md): a new life, a pack bought, back after a long
  // time away, anyone with no home gets one, and is taken there.
  const [roomFailed, setRoomFailed] = useState<string | null>(null);
  /** A home was just given: its card opens (after the walkthrough) with the name box ready. */
  const [nameNew, setNameNew] = useState(false);
  const asking = useRef(false);
  useEffect(() => {
    if (!signedIn || !loaded || !life || homeUnit || asking.current || pretend) return;
    asking.current = true;
    void fetch("/api/starter-room", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.json() as Promise<{ unit?: string; area?: string; x?: number; z?: number; already?: boolean; error?: string }>)
      .then(async (r) => {
        if (r.error || !r.unit) {
          setRoomFailed(r.error ?? "No free room just now.");
          return;
        }
        await refresh();
        if (!r.already) {
          setMessage({ text: `Welcome home! Your free room is in ${r.area ?? "Lagos"}. Tap the house icon any time.`, good: true });
          setNameNew(true);
        }
        if (r.x !== undefined && r.z !== undefined) setFlyTo({ tile: spiralIndex(Math.round(r.x), Math.round(r.z)), at: ++flies.current });
      })
      .catch(() => setRoomFailed("The connection blinked."))
      .finally(() => {
        asking.current = false;
      });
  }, [signedIn, loaded, life, homeUnit, pretend, refresh]);
  // A rented home (game-db/077): each month that's come due is paid when the game opens (or you
  // move out when you can't, and get a free room again).
  const [rental, setRental] = useState<Rental>(null);
  const lifeStarted = !!life;
  useEffect(() => {
    if (!signedIn || !lifeStarted || pretend) return;
    let alive = true;
    void myRental()
      .then(async (r) => {
        if (!alive) return;
        setRental(r.rental);
        if (r.ended) await refresh();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signedIn, lifeStarted, pretend, refresh, homeUnit]);
  // The start screen: before your life starts (or, if no free room could be given, to find one).
  // The walkthrough's opening tips (../tutorial): a just-given home's card waits for them.
  const tourOn = useTutorialPhase() === "intro";
  const showWelcome = signedIn && loaded && !homeUnit && !welcomeShut && !property && !place && !finderOpen && (!life || !!roomFailed);
  const finds = useMemo(() => (finderOpen && region ? homesByArea(region, planOf(region)) : []), [finderOpen, region]);
  const openFinder = () => {
    setWelcomeShut(true);
    setFinderOpen(true);
    setListings(null);
    if (region) void api.marketListings(region.region.id).then(setListings);
  };
  /** Open a building's card by its id: as bought if someone owns it, else as the map has it. */
  /** A building as it stands (as bought, if anyone owns part of it): for its card. */
  const buildingNow = (id: string) => {
    const sp = ownedSpot(id);
    if (!region || !sp) return null;
    const plan = planOf(region);
    const t = tileAt(plan, spiralIndex(sp.x, sp.z));
    const b = owned.find((o) => o.id === id)?.building ?? t.building;
    return b ? { b, sp, plan, t } : null;
  };
  const buildingHas = (id: string, use: string) => !!buildingNow(id)?.b.units.some((u) => u.use === use);
  /** Open a building's card where you're looking (no trip). */
  const openBuildingCard = (id: string) => {
    const n = buildingNow(id);
    if (n && region) onProperty(propertyInfo(n.b, n.sp.x, n.sp.z, addressOf(n.plan, n.t), region));
  };
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
            // Hired: the Work screen opens, so you see your pay, tax and fares straight away.
            const hire = (ticket?: string) =>
              act(
                () => api.takeJob(wp.id, job.job, mode, ticket),
                (r) => `You're a ${job.title} now. Pay builds up every 2 hours.${paid(r.pay)}`,
              ).then((r) => {
                if (!r.ok) return;
                setPlace(null);
                setProperty(null);
                setWorkOpen(true);
              });
            // Skilled jobs: an interview first, then the job with the pass it hands back.
            const take = async () => {
              if (!needsInterview(job)) return void hire();
              setBusy(true);
              // A slow server (just woken up) gets a second go before giving up.
              const ask = () => api.interviewStart(wp.id, job.job);
              const start = await ask()
                .catch(() => new Promise((ok) => setTimeout(ok, 1500)).then(ask))
                .catch(() => ({ ok: false as const, error: "Couldn't reach the interview. Check your connection and try again." }));
              setBusy(false);
              if (!start.ok) return setMessage({ text: start.error, good: false });
              setInterview({ start, hire });
            };
            // Running at a loss: fares there and back cost more than the pay after tax.
            const km = homeUnit ? tripKmBetween(homeUnit, wp.id) : null;
            const fare = km === null || !homeUnit ? 0 : (fareMint(mode, km, region.region.prices, ferryKmBetween(homeUnit, wp.id)) ?? 0);
            const net = dayNet(payDay(job, region.region.prices), work?.skills[job.skill] ?? 0, fare);
            const loss = net < 0 ? `Heads up: you'd run at a loss. After income tax, ${job.title} pays less than your fares there and back, so you'd lose about ${cash(-net)} every 2 hours.` : "";
            const now = work?.job;
            if (!now && !loss) return void take();
            // One main job at a time: say so before swapping.
            setConfirm({
              title: now ? "Switch jobs?" : "Work at a loss?",
              text: [now ? `Your job as ${now.title} at ${now.placeName} ends, and the pay you've earned there goes into your wallet now.` : "", loss]
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
    hustleHours: (status?.hustles ?? (status?.hustle ? [status.hustle] : [])).reduce((t, h) => t + h.hours, 0),
    course: status?.courses.find((c) => !c.done)?.course ?? null,
    exercise: status?.exercise ?? "none",
  });

  const home = homeUnit ? (assets?.units ?? []).find((u) => u.unit === homeUnit) : undefined;
  const homeSpot = homeUnit ? ownedSpot(homeUnit.split("/")[0]) : null;
  const homeBuilding = home ? owned.find((o) => o.id === home.building) : undefined;
  const homeLabel = home ? [home.label, home.name ?? (homeBuilding ? BUILDING_LABEL[homeBuilding.building.kind] : null)].filter(Boolean).join(", ") : "";

  // The hand-drawn planner (optionally starting from the builder's design), and the house builder.
  const [planning, setPlanning] = useState<boolean | HomePlan>(false);
  const [building, setBuilding] = useState(false);
  /** Where you are on the map: the place you went to last, or home (null: nowhere yet). */
  const whereAmI = () => {
    const at = assets?.life?.at_place ?? homeUnit;
    const id = at ? at.split("/")[0] : null;
    return id ? ownedSpot(id) : null;
  };
  /** Take the camera to where you are (just looking: free). */
  const locateMe = () => {
    const s = whereAmI();
    if (!s) return false;
    setFlyTo({ tile: spiralIndex(Math.round(s.x), Math.round(s.z)), at: ++flies.current });
    return true;
  };
  // A home just given: open its card, ready to name it (once the walkthrough is out of the way).
  useEffect(() => {
    if (!nameNew || tourOn || !homeSpot || homeOpen) return;
    const t = setTimeout(() => {
      setHomeOpen(true);
      setNeighbours(null);
      void api.neighbours().then(setNeighbours);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameNew, tourOn, !!homeSpot, homeOpen]);
  const goHome = () => {
    if (!homeSpot) return;
    const go = () => {
      fly(homeSpot.x, homeSpot.z);
      setHomeOpen(true);
      setNeighbours(null);
      void api.neighbours().then(setNeighbours);
    };
    if (beforeHome) beforeHome(go);
    else go();
  };

  /** Something in Finance wants you: the guide's budget step, a power cut, an offer. */
  const financeGlow = false;
  const financeDot = !!(status?.powerCut || board?.received.some((o) => o.status === "open"));
  /** The row of life buttons; afterIncome: something the game puts right after Income (the notifications bell). */
  const makeRow = (afterIncome?: React.ReactNode) => region ? (
    <>
          {signedIn && loaded && !homeUnit && (
            <button
              onClick={() => (life ? openFinder() : setWelcomeShut(false))}
              className={`pointer-events-auto relative flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gold px-3.5 text-sm font-semibold text-ink shadow-lg`}
            >
              <Search className="size-4" />
              Find a home
            </button>
          )}
          {!(signedIn && homeUnit) && afterIncome}
          {signedIn && homeUnit && (
            <>
              {afterIncome}
            </>
          )}
    </>
  ) : null;
  const rowButtons = makeRow();
  const rowBelow = region ? (
    <>
        {rep?.jail && Date.parse(rep.jail) > clock && (
          <JailBanner until={rep.jail} prices={region.region.prices} onDone={(text, good) => setMessage({ text, good })} onFree={() => setRep((r) => (r ? { ...r, jail: null } : r))} />
        )}
    </>
  ) : null;
  const overlay = region ? (
    <>
      {/* Your life, under the place's name card: Home, Work, Money, Life, Services (first only Find a home). */}
      {!rowOutside && (
        <div className={`pointer-events-none absolute left-2.5 top-14 z-10 flex max-w-[calc(100vw-4.5rem)] flex-col items-start gap-2 sm:left-4 sm:top-16 sm:max-w-md`}>
          <div className="flex flex-wrap gap-1.5">{rowButtons}</div>
          {rowBelow}
        </div>
      )}
      {status?.event && !moment && (
        <div className="pointer-events-none absolute inset-x-0 top-40 z-10 flex justify-center px-3 sm:top-32">
          <button onClick={() => setMoment(true)} className="pointer-events-auto flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink shadow-lg ring-4 ring-gold/30">
            <Star className="size-4" /> Breakthrough {status.event.source === "job" ? "at work" : "in your hustle"}: {status.event.title}
          </button>
        </div>
      )}
      {message && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-24 z-[65] flex justify-center px-3">
          <p className={`flex max-w-sm items-center gap-2 rounded-2xl px-4 py-2.5 text-sm shadow-lg ${message.good ? "bg-ink text-white" : "bg-hit text-white"}`}>
            {cashText(message.text)}
            <button onClick={() => setMessage(null)} aria-label="Close">
              <X className="size-4" />
            </button>
          </p>
        </div>
      )}
      {showWelcome && (
        <StartLife
          currency={currency}
          onCurrency={chooseCurrency}
          place={region.region.name}
          budget={life ? coins : budget}
          prices={region.region.prices}
          started={!!life}
          busy={busy}
          granted={life?.granted ?? 0}
          pretend={pretend}
          onStart={() =>
            // Your free room follows straight away (above).
            act(
              () => api.startLife(region.region.id),
              () => null,
            )
          }
          onPack={async (id) => {
            // In the game: start (free home, ₦2m), then pay for the pack in the Wallet.
            if (onWallet) {
              if (!life) await act(() => api.startLife(region.region.id), () => null);
              setWelcomeShut(true);
              return onWallet();
            }
            setBusy(true);
            const r = await api.startPack(id, region.region.id);
            setBusy(false);
            if (!r.ok) return setMessage({ text: r.error, good: false });
            if (r.url) return void window.location.assign(r.url);
            setMessage({ text: "Your pack is in!", good: true });
            await refresh();
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
      {homeOpen && homeSpot && (
        <HomeCard
          label={homeLabel}
          name={home?.label}
          naming={nameNew}
          ownerName={meName}
          onRename={
            signedIn && home && homeUnit
              ? async (name) => {
                  const r = await renameHome(homeUnit, name);
                  if (!r.ok) return r.error ?? "That didn't work.";
                  setNameNew(false);
                  await refresh();
                  return null;
                }
              : undefined
          }
          area={region.areaAt(homeSpot.x, homeSpot.z)}
          neighbours={neighbours}
          onClose={() => {
            setHomeOpen(false);
            setNameNew(false);
          }}
          onEnter={
            onEnter && homeUnit
              ? () => {
                  setHomeOpen(false);
                  onEnter(homeUnit.split("/")[0]);
                }
              : undefined
          }
          onUpgrade={
            signedIn && homeUnit
              ? () => {
                  setHomeOpen(false);
                  setBuilding(true);
                }
              : undefined
          }
        >
          {signedIn && rental && rental.unit === homeUnit && (
            <div className="mt-3 rounded-2xl bg-ink/5 p-3 text-sm">
              <p>
                <b>Rented: {cash(rental.rent)} a month.</b> Next month is paid from your wallet on {new Date(rental.paidUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.
              </p>
              <button
                onClick={() =>
                  setConfirm({
                    title: "Move out?",
                    text: "You go back to a free room. What you've paid this month isn't given back.",
                    yes: "Move out",
                    run: () =>
                      void act(
                        () => moveOut(),
                        () => {
                          setHomeOpen(false);
                          setRental(null);
                          return "You've moved out. A free room is on its way.";
                        },
                      ),
                  })
                }
                className="mt-2 h-9 rounded-full bg-white px-3 text-xs font-semibold shadow-sm"
              >
                Move out
              </button>
            </div>
          )}
          {signedIn && (
            <StarterRoomBox
              onFindHome={() => {
                setHomeOpen(false);
                openFinder();
              }}
            />
          )}
          {signedIn && <HomeParty />}
        </HomeCard>
      )}
      {planning && <HomePlanner start={typeof planning === "object" ? planning : undefined} onClose={() => setPlanning(false)} />}
      {building && (
        <HomeBuilder
          onClose={() => setBuilding(false)}
          onFineTune={(plan) => {
            setBuilding(false);
            setPlanning(plan);
          }}
          onAddMoney={
            onWallet
              ? () => {
                  setBuilding(false);
                  onWallet();
                }
              : undefined
          }
        />
      )}
      {door && (
        <DoorSheet
          building={door.id}
          owner={door.owner}
          signedIn={door.signedIn}
          onClose={() => setDoor(null)}
          onIn={() => {
            const id = door.id;
            setDoor(null);
            setMessage({ text: `${door.owner} let you in!`, good: true });
            void goInside(id, true);
          }}
        />
      )}
      {guestBook && <SignGuestBook building={guestBook} onClose={() => setGuestBook(null)} />}
      <DoorBell signedIn={signedIn} />
      {place && (
        <Sheet onClose={() => setPlace(null)} wide clear>
          <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 bg-panel/95 px-5 pb-2 pt-5">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold leading-tight">{place.name}</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{region.areaAt(place.x, place.z)}</span>
              </p>
            </div>
            <button onClick={() => setPlace(null)} className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/5 hover:bg-ink/10" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {onEnter && (
              <button
                onClick={() => {
                  const id = place.id;
                  setPlace(null);
                  void goInside(id);
                }}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#f08c00] px-4 py-2 text-center text-sm font-semibold leading-tight text-white"
              >
                <DoorOpen className="size-4 shrink-0" /> {tripLabel(place.id).replace(/^Go inside/, "Go there")}
              </button>
            )}
            {onEnter && driveSwitch}
            <div className="grid grid-cols-2 gap-2">
              <span className="flex min-h-11 items-center justify-center rounded-full bg-ink/[0.03] px-3 text-center text-xs text-muted">No business leases here</span>
              <span className="flex min-h-11 items-center justify-center rounded-full bg-ink/[0.03] px-3 text-center text-xs text-muted">No adverts on landmarks</span>
            </div>
          </div>
          {/* A landmark can be yours, for a crazy price (game-db/082, docs/LANDMARKS.md). */}
          <div className="mt-3">
            <LandmarkBuy
              placeId={place.id}
              coins={coins}
              repScore={rep?.score ?? null}
              signedIn={signedIn}
              onBought={(_c, name) => {
                setMessage({ text: `${name} is yours! Big money moves.`, good: true });
                void refresh();
                onChanged?.();
              }}
            />
          </div>
          {!SIMPLE_LIFE && place.jobs.length > 0 && <div className="mt-4">{jobs ? <JobsHere place={place} ctx={jobs} /> : <p className="text-sm text-muted">Sign in to work here.</p>}</div>}
          <button
            onClick={() => {
              const p = place;
              setPlace(null);
              openLeaveMark({ x: p.x, z: p.z, place: p.name });
            }}
            className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-gold-dark"
          >
            <Pencil className="size-3.5" /> Leave a mark here: write, review, plant a tree…
          </button>
          <button
            onClick={() => (signedIn ? setReport({ x: place.x, z: place.z, where: place.name }) : setMessage({ text: "Sign in to report a problem.", good: false }))}
            className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            <Flag className="size-3.5" /> Report a problem with this place
          </button>
        </Sheet>
      )}
      {workOpen && jobs && (
        <WorkSheet
          rent={{
            daily: (assets?.units ?? []).reduce((t, u) => t + (u.let && u.tenantFrom && Date.parse(u.tenantFrom) <= clock ? u.rentDay * RENT_LEVEL[u.rentLevel ?? "fair"].factor : 0), 0),
            waiting: (assets?.units ?? []).reduce((t, u) => t + u.waiting, 0),
            units: (assets?.units ?? []).filter((u) => u.unit !== homeUnit).length,
            let: (assets?.units ?? []).filter((u) => u.let).length,
          }}
          onRent={() => act(() => api.collectRent(), (r) => `+${cash(r.rent ?? 0)} rent (after tax).`)}
          onProperty={() => {
            setWorkOpen(false);
            setFinanceTab("property");
            setAssetsOpen(true);
          }}
          onGoToWork={(id) => {
            const s = ownedSpot(id);
            if (s) fly(s.x, s.z);
            setWorkOpen(false);
            void goInside(id);
          }}
          status={work}
          life={status}
          day={day}
          onStartHustle={(id) => {
            // Say what it costs before it's spent.
            const h = HUSTLES.find((x) => x.id === id);
            if (!h) return;
            const cost = hustleStart(h, region.region.prices);
            setConfirm({
              title: `Start ${h.title.toLowerCase()}?`,
              text: `It costs ${cash(cost)} to start (${h.what.toLowerCase()}), paid once from your Savings, and takes ${h.hours} of every 24 hours in your day. It earns about ${cash(hustleDay(h, region.region.prices, work?.skills[h.skill] ?? 0))} every 2 hours, paid into your wallet every 14 hours. Your other side hustles carry on.`,
              yes: `Start for ${cash(cost)}`,
              run: () => act(() => api.startHustle(id), () => `${h.title} has started. It earns every 2 hours.`),
            });
          }}
          onStopHustle={(id) => {
            const h = (status?.hustles ?? (status?.hustle ? [status.hustle] : [])).find((x) => x.hustle === id);
            setConfirm({
              title: `Stop ${h ? h.title.toLowerCase() : "this side hustle"}?`,
              text: "What it made so far goes into your wallet now. Its start-up cost doesn't come back.",
              yes: "Stop it",
              run: () => act(() => api.stopHustle(id), () => `${h?.title ?? "Side hustle"} stopped.`),
            });
          }}
          region={region}
          plan={plan}
          ctx={jobs}
          onMode={(mode, perDay) =>
            setConfirm({
              title: mode === "walk" ? "Walk to work from now on?" : `Go by ${COMMUTE_LABEL[mode].toLowerCase()} from now on?`,
              text: `${perDay ? `It costs ${cash(perDay)} every 2 hours, there and back.` : "It's free."}${
                work?.job && dayNet(work.job.payDay, work.skills[work.job.skill] ?? 0, perDay / 2) < 0
                  ? ` Heads up: this way you'd run at a loss, about ${cash(-dayNet(work.job.payDay, work.skills[work.job.skill] ?? 0, perDay / 2))} every 2 hours after tax.`
                  : ""
              }`,
              yes: mode === "walk" ? "Walk from now on" : `Go by ${COMMUTE_LABEL[mode].toLowerCase()}`,
              run: () => act(() => api.setCommute(mode), (r) => `${mode === "walk" ? "You'll walk to work" : `You'll go by ${COMMUTE_LABEL[mode].toLowerCase()}`} from now on.${paid(r.pay)}`),
            })
          }
          onQuit={() =>
            setConfirm({
              title: `Leave your job${work?.job ? ` as ${work.job.title}` : ""}?`,
              text: "Your pay so far goes into your wallet now. You can look for another job any time.",
              yes: "Leave job",
              run: () => void act(() => api.quitJob(), (r) => `You've left your job.${paid(r.pay)}`),
            })
          }
          onShow={(id) => {
            const s = ownedSpot(id);
            if (s) fly(s.x, s.z);
            setWorkOpen(false);
          }}
          onClose={() => setWorkOpen(false)}
          loadMoney={api.money}
          hasCar={!!rep?.hasCar}
        />
      )}
      {property && (
        <PropertyCard
          key={property.id}
          onEnter={
            onEnter
              ? () => {
                  const id = property.id;
                  setProperty(null);
                  void goInside(id);
                }
              : undefined
          }
          enterLabel={tripLabel(property.id)}
          enterExtra={driveSwitch}
          onMark={() => {
            const sp = ownedSpot(property.id);
            if (!sp) return;
            setProperty(null);
            openLeaveMark({ x: sp.x, z: sp.z, place: `${property.title}, ${property.address}` });
          }}
          jobs={jobs}
          onReport={() => {
            if (!signedIn) return setMessage({ text: "Sign in to report a problem.", good: false });
            const sp = ownedSpot(property.id);
            if (sp) setReport({ x: sp.x, z: sp.z, where: `${property.title}, ${property.address}` });
          }}
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
                  repScore: rep?.score ?? 0,
                  onBuy: (u) =>
                    act(
                      () => api.buyUnit(u.id),
                      (r) => {
                        const day = cash(discounted(u.mint, rep?.score ?? 0) * INCOME_DAY);
                        return r.home ? `${u.label} is yours, and your home! It earns you ${day} a day.` : `${u.label} is yours! It earns you ${day} a day, by itself.`;
                      },
                    ),
                  onHome: (u) => act(() => api.setHome(u.id), () => `You live at ${u.label} now.`),
                  onLet: (u, on) => act(() => api.letUnit(u.id, on), () => (on ? `${u.label} is up for rent.` : `${u.label} isn't let any more.`)),
                  onRename: (name) => act(() => api.renameBuilding(property.id, name), () => (name.trim() ? `Renamed ${name.trim()}.` : "Name cleared.")),
                  onBuyListed: (u, price) =>
                    setConfirm({
                      title: `Buy ${u.label}?`,
                      text: `${cash(buyerPays(price, BUY_TAX))} to its owner. It earns you money every day, by itself.`,
                      yes: `Buy for ${cash(buyerPays(price, BUY_TAX))}`,
                      run: () => void act(() => api.buyListed(u.id, price), (r) => (r.home ? `${u.label} is yours, and your home. Welcome!` : `${u.label} is yours.`)),
                    }),
                  onOffer: (u) =>
                    setAsk({
                      title: `Offer for ${u.label}`,
                      text: `It's worth about ${cash(u.mint)}. What you offer is held from your wallet until the owner answers, for up to ${OFFER_HOURS} hours.`,
                      initial: Math.round(u.mint),
                      note: (n) => `${cash(buyerPays(n, BUY_TAX))} held. You get it back if they say no.`,
                      cta: (n) => `Offer ${cash(n)}`,
                      run: (n) => api.makeOffer(u.id, n),
                      done: () => "Offer sent. You'll see the answer in Finance → Property.",
                    }),
                  onSell: (u) => askSell(u.id, u.label, u.mint),
                  onUnsell: (u) => act(() => api.unlistUnit(u.id), () => `${u.label} is off the market.`),
                }
              : undefined
          }
        />
      )}
      {assetsOpen && !assets && (
        <Sheet onClose={() => setAssetsOpen(false)} wide title="Finance">
          <div className="animate-pulse space-y-3" aria-label="Loading">
            <div className="h-8 rounded-full bg-ink/5" />
            <div className="h-28 rounded-3xl bg-ink/5" />
            <div className="h-20 rounded-2xl bg-ink/5" />
          </div>
        </Sheet>
      )}
      {assetsOpen && assets && (
        <MoneySheet
          status={status}
          assets={assets}
          owned={owned}
          region={region}
          busy={busy}
          loadMoney={api.money}
          loadDays={api.moneyDays}
          payday={(() => {
            // The next pay into your wallet: a game week (14 hours) after you were last paid, and
            // what a full week brings after tax and fares. Side hustles pay on the same cycle.
            const job = work?.job;
            const hustles = (status?.hustles ?? (status?.hustle ? [status.hustle] : [])).reduce((t, h) => t + h.payDay, 0) * (1 - INCOME_TAX) * 7;
            if (!job) return hustles > 0 ? { at: null, job: 0, hustles, title: null } : null;
            const km = homeUnit ? tripKmBetween(homeUnit, job.place) : null;
            const fare = homeUnit && km !== null ? fareOrBus(job.mode, km, region.region.prices, ferryKmBetween(homeUnit, job.place)) : 0;
            return { at: Date.parse(job.paidUntil) + 7 * 7_200_000, job: Math.max(0, dayNet(job.payDay, work.skills[job.skill] ?? 0, fare) * 7), hustles, title: `${job.title}, ${job.placeName}` };
          })()}
          currency={currency}
          onCurrency={chooseCurrency}
          onBudget={(b) =>
            act(
              () => api.setBudget(b),
              () => "Budget saved. Your next pay is shared out by it.",
            )
          }
          onClose={() => {
            setAssetsOpen(false);
            setFinanceTab(null);
          }}
          onCollect={() => act(() => api.collectRent(), (r) => `+${cash(r.rent ?? 0)} rent (after tax).`)}
          onShow={(u) => {
            const s = ownedSpot(u.building);
            if (s) fly(s.x, s.z);
            setAssetsOpen(false);
          }}
          startTab={financeTab ?? (board?.received.some((o) => o.status === "open") ? "property" : undefined)}
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
                    text: `${o.label ?? "It"} goes to them for ${cash(o.price)}. You get ${cash(sellerGets(o.price))} after the 2% tax (a loan on it is paid off first).`,
                    yes: `Sell for ${cash(o.price)}`,
                    run: () => void act(() => api.answerOffer(o.id, "accept"), () => `Sold to ${o.who}.`),
                  })
                : act(() => api.answerOffer(o.id, "refuse"), () => "Offer turned down."),
            onCounter: (o) =>
              setAsk({
                title: "Ask for more",
                text: `${o.who} offered ${cash(o.price)}. Ask for a higher price: they can take it or leave it.`,
                initial: Math.round(o.price * 1.1),
                note: (n) => `You'd get ${cash(sellerGets(n))} after the 2% tax.`,
                cta: (n) => `Ask ${cash(n)}`,
                run: (n) => api.answerOffer(o.id, "counter", n),
                done: () => "Sent. You'll see their answer here.",
              }),
            onReply: (o, action) =>
              action === "accept"
                ? setConfirm({
                    title: `Pay ${cash(o.counter ?? 0)}?`,
                    text: `${o.label ?? "It"} becomes yours. What your offer held counts towards it; the rest (with the 3% tax) comes from your wallet.`,
                    yes: `Pay ${cash(o.counter ?? 0)}`,
                    run: () => void act(() => api.replyOffer(o.id, "accept"), () => `${o.label ?? "It"} is yours.`),
                  })
                : act(() => api.replyOffer(o.id, "withdraw"), () => "Offer withdrawn. Your money is back."),
            onBorrow: () => setLoanOpen(true),
            onFind: () => {
              setAssetsOpen(false);
              openFinder();
            },
            onRepay: () =>
              board?.loan &&
              setAsk({
                title: "Pay off your loan",
                text: `You owe ${cash(board.loan.balance)}. Paying early saves interest. It comes from Savings, then your wallet.`,
                initial: board.loan.balance,
                max: board.loan.balance,
                cta: (n) => `Pay ${cash(n)}`,
                run: (n) => api.repayLoan(n),
                done: (n) => (n >= (board.loan?.balance ?? 0) ? "Loan paid off. Your property is free." : `Paid ${cash(n)}.`),
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
              text: `${cash(cost)} is held from your Savings (then wallet) and goes to them when you confirm it's done. You can cancel until they start.`,
              yes: `Book for ${cash(cost)}`,
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
      {business && (
        <BusinessSheet
          b={business}
          onHit={(kind) => void api.hitBusiness(business.id, kind)}
          onClose={() => setBusiness(null)}
          // A building with homes stays open to live in while a business leases it (game-db/094).
          onHomes={signedIn && buildingHas(business.building, "home") ? () => {
            setBusiness(null);
            openBuildingCard(business.building);
          } : undefined}
        />
      )}
      {currencyOpen && <CurrencySheet value={currency} onPick={chooseCurrency} onClose={() => setCurrencyOpen(false)} />}
      {passportOpen && region && <PassportSheet map={region} onClose={() => setPassportOpen(false)} onShow={(x, z) => fly(x, z)} />}
      {stampNews && (
        <StampPop
          news={stampNews}
          onOpen={() => {
            setStampNews(null);
            setPassportOpen(true);
          }}
          onClose={() => setStampNews(null)}
        />
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
            const r = await act(() => api.takeLoan(amount, months), () => `${cash(amount)} from the World Bank is in your wallet.`);
            if (r.ok) setLoanOpen(false);
          }}
          onClose={() => setLoanOpen(false)}
        />
      )}
      {confirm && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-extrabold">{confirm.title}</h3>
            <p className="mt-2 text-sm text-muted">{confirm.text}</p>
            {/* The main button first and full width (its words can be long), "Not now" under it. */}
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  const run = confirm.run;
                  setConfirm(null);
                  run();
                }}
                className="min-h-11 w-full rounded-full bg-ink px-4 py-2.5 text-center text-sm font-semibold leading-snug text-white"
              >
                {confirm.yes}
              </button>
              <button onClick={() => setConfirm(null)} className="min-h-11 w-full rounded-full bg-ink/5 px-4 text-sm font-semibold">
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      {things && (
        <ThingsSheet
          tab={things}
          prices={region.region.prices}
          coins={coins}
          units={assets?.units ?? []}
          whereIs={(building) => {
            const sp = ownedSpot(building);
            return sp ? region.areaAt(sp.x, sp.z) : null;
          }}
          onShow={(u) => {
            setThings(null);
            showBuilding(u.building);
          }}
          onClose={() => {
            setThings(null);
            loadRep();
          }}
          onChanged={() => {
            void refresh();
            onChanged?.();
          }}
        />
      )}
      {markOpen !== null && marks.find((m) => m.id === markOpen) && (
        <MarkCard
          key={markOpen}
          mark={marks.find((m) => m.id === markOpen)!}
          me={meId ?? null}
          prices={region.region.prices}
          onPerson={(id) => {
            setMarkOpen(null);
            onPerson?.(id);
          }}
          onClose={() => setMarkOpen(null)}
          onChanged={loadMarks}
          onDone={(text, good) => setMessage({ text, good })}
        />
      )}
      {leaving && (
        <LeaveMarkSheet
          where={leaving.where}
          region={region.region.id}
          x={leaving.x}
          z={leaving.z}
          place={leaving.place}
          prices={region.region.prices}
          reputation={rep?.score ?? null}
          adoptable={["park", "trees"].includes(tileAt(planOf(region), spiralIndex(leaving.x, leaving.z)).kind)}
          onFly={fly}
          onChanged={() => {
            loadMarks();
            loadRep();
          }}
          onClose={() => setLeaving(null)}
          onDone={(text, good) => {
            setMessage({ text, good });
            if (good) loadMarks();
          }}
        />
      )}
      {breaking && !newsOpen && (
        <div className="pointer-events-none absolute inset-x-0 top-[6.5rem] z-30 flex justify-center px-3 sm:top-20">
          <div className="pointer-events-auto flex max-w-sm animate-[newsIn_.35s_ease-out] items-start gap-2.5 rounded-2xl bg-ink px-3.5 py-2.5 text-white shadow-xl">
            <button
              onClick={() => {
                setBreaking(null);
                if (breaking.x !== undefined && breaking.z !== undefined) showStory({ x: breaking.x, z: breaking.z, scene: breaking.scene });
                else setNewsOpen(true);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block text-[10px] font-bold uppercase tracking-wider text-gold">{breaking.kind === "weather" ? "Weather" : "Breaking news"}</span>
              <span className="block text-sm font-semibold leading-snug">{breaking.title}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs text-white/70">{breaking.text}</span>
            </button>
            <button onClick={() => setBreaking(null)} aria-label="Close" className="shrink-0 text-white/60">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
      {cert && (
        <CertificateSheet
          name={meName ?? "You"}
          title={cert.title}
          cert={cert.cert}
          at={cert.at}
          onClose={() => {
            try {
              const seen = JSON.parse(localStorage.getItem("nt-certs") ?? "[]") as string[];
              localStorage.setItem("nt-certs", JSON.stringify([...seen, cert.course]));
            } catch {}
            setCert(null);
          }}
        />
      )}
      {repOpen && (
        <ReputationSheet
          onClose={() => {
            setRepOpen(false);
            loadRep();
          }}
        />
      )}
      {soonOpen && <ComingSoonSheet onClose={() => setSoonOpen(false)} />}
      {newsOpen && (
        <NewsSheet
          region={region}
          onShow={(story) => {
            setNewsOpen(false);
            showStory(story);
          }}
          onClose={() => setNewsOpen(false)}
        />
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
            statusAt.current = 0;
            freshenStatus();
          }}
        />
      )}
      {adOpen && regionId && (
        <AdvertisePanel
          regionId={regionId}
          region={region}
          centre={() => centerRef.current?.() ?? { x: 0, z: 0 }}
          fly={fly}
          picked={adPick}
          onPreview={setAdPreview}
          onClose={() => {
            setAdOpen(false);
            setAdPick(null);
            setAdPreview(null);
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
    // A new list when the city grows, so the 3D city is built again, taller (growthOf is read there).
    void growth;
    if (!region || !businesses.length) return [...owned];
    const plan = planOf(region);
    const extra: OwnedProperty[] = [];
    for (const b of businesses) {
      const s = ownedSpot(b.building);
      const base = s ? tileAt(plan, spiralIndex(s.x, s.z)).building : undefined;
      if (!base || owned.some((o) => o.id === b.building)) continue;
      extra.push({ id: b.building, building: { ...base, kind: b.kind ?? base.kind, storeys: b.storeys ?? base.storeys, state: "built" } as typeof base, name: b.name });
    }
    return [...owned, ...extra];
  }, [owned, businesses, region, growth]);

  // Every leased building's design goes on the billboards (its logo until it uploads one; with
  // neither, a billboard of its name and what it's about).
  const billboardAds = useMemo(
    () =>
      businesses
        .filter((b) => b.billboard && (b.billboardImage || b.logo || b.name))
        .map((b) => ({ id: `bz:${b.id}`, image: b.billboardImage || b.logo || "", headline: b.about.slice(0, 60), brand: b.name, link: b.website, fit: b.billboardImage ? ("cover" as const) : ("contain" as const) }))
        .concat(
          // Choosing a billboard ad: yours, on the boards round you, while you make it.
          adPreview && !adPreview.building && (adPreview.billboard || adPreview.name)
            ? [{ id: "bz:preview", image: adPreview.billboard ?? "", headline: adPreview.line.slice(0, 60), brand: adPreview.name, link: null, fit: "cover" as const }]
            : [],
        ),
    [businesses, adPreview],
  );
  const openBusiness = useCallback(
    (b: MapBusiness | string) => {
      const found = typeof b === "string" ? businesses.find((x) => x.id === b) : b;
      if (!found) return;
      if (adOpen) return setAdPick({ id: found.building, at: Date.now() });
      setBusiness(found);
      void api.hitBusiness(found.id, "view");
    },
    [api, businesses, adOpen],
  );
  const businessViews = useCallback(
    (views: Record<string, number>) => {
      // Every view counts (a batch can hold several of the same ad).
      for (const [id, n] of Object.entries(views)) if (id.startsWith("bz:") && id !== "bz:preview") void api.hitBusiness(id.slice(3), "billboard", n);
    },
    [api],
  );

  /** From the menu: How to play starts the guide again; Currency opens the picker. */
  const restartGuide = () => {
    restartTutorial();
    setWelcomeShut(false);
  };
  /** The walkthrough's first mission: your home's card, with the name box ready. */
  const nameHome = () => {
    // A rented home isn't yours to name (game-db/078): say so, rather than nothing happening.
    if (homeUnit && !home) {
      setMessage({ text: "Only a home you own can be named. Buy one (tap any building), or skip this mission.", good: false });
      return;
    }
    setNameNew(true);
    goHome();
  };
  const openCurrency = () => setCurrencyOpen(true);
  /** From the menu: report a problem with the map where you're looking. */
  const openReport = () => {
    const c = centerRef.current?.();
    if (c && region) setReport({ x: c.x, z: c.z, where: `${region.areaAt(c.x, c.z)}: the middle of your screen` });
  };
  /** Your cash at the top (beside the menu) opens Finance. */
  const openFinance = () => {
    setAssetsOpen(true);
    // Shown at once from what's here; brought up to date behind it (not on every open).
    freshenStatus();
    if (!assets) void refresh();
  };
  /** Leave a mark: at a spot, or (none given) in the middle of the screen. */
  const openLeaveMark = (at?: { x: number; z: number; place?: string }) => {
    if (!region) return;
    if (!signedIn) return setMessage({ text: "Sign in to leave a mark.", good: false });
    const c = at ?? centerRef.current?.() ?? { x: 0, z: 0 };
    const x = Math.round(c.x);
    const z = Math.round(c.z);
    setLeaving({ x, z, where: at?.place ?? region.areaAt(x, z), place: at?.place });
  };
  const markTags: CityMarkTag[] = marks.map((m) => ({ id: m.id, x: m.x, z: m.z, kind: m.kind, text: m.body, colour: m.colour, rating: m.rating, author: m.authorName, style: m.style }));
  /** Searching by kind of place ("club", "church"): where you're looking, and the city's tile at any spot. */
  const searchNear = () => {
    if (!region) return null;
    const plan = planOf(region);
    const c = centerRef.current?.() ?? { x: 0, z: 0 };
    return { x: c.x, z: c.z, tileOf: (x: number, z: number) => tileAt(plan, spiralIndex(x, z)) };
  };
  /** Explore: the places worth going to, nearest to where you're looking first. */
  const explore = () => {
    if (!region) return [];
    const plan = planOf(region);
    const c = centerRef.current?.() ?? { x: 0, z: 0 };
    return explorePlaces(region, (x, z) => tileAt(plan, spiralIndex(x, z)), c.x, c.z);
  };
  /** A spot in words, for hosting an event there: the named street nearest it (within 3 tiles) and its area. */
  const describeSpot = (x: number, z: number): SpotWords => {
    if (!region) return { street: null, area: "", areaK: 1 };
    const area = region.areaAt(x, z);
    const k = areaK(region.centres, x, z);
    for (let r = 0; r <= 3; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const road = region.roadAt(x + dx, z + dz);
          if (road?.name && !road.bridge) return { street: { name: road.name, x: x + dx, z: z + dz }, area, areaK: k };
        }
    return { street: null, area, areaK: k };
  };
  /** The named roads round a spot (within about 2 km), nearest first: the nearest stretch of each. */
  const roadsNear = (x: number, z: number): NearRoad[] => {
    if (!region) return [];
    const R = 20;
    const best = new Map<string, { x: number; z: number; dist: number }>();
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        const road = region.roadAt(x + dx, z + dz);
        if (!road?.name || road.bridge) continue;
        const had = best.get(road.name);
        if (!had || d < had.dist) best.set(road.name, { x: x + dx, z: z + dz, dist: d });
      }
    return [...best]
      .sort((a, b) => a[1].dist - b[1].dist)
      .slice(0, 25)
      .map(([name, p]) => ({ name, x: p.x, z: p.z, dist: p.dist, area: region.areaAt(p.x, p.z), areaK: areaK(region.centres, p.x, p.z) }));
  };
  /** Go to a place from Explore: fly there and open its card (Go there, and its jobs). */
  const openExplorePlace = (p: ExplorePlace) => {
    if (!region) return;
    fly(p.x, p.z);
    setPlace(workplaceById(planOf(region), p.id) ?? { id: p.id, name: p.name, x: Math.round(p.x), z: Math.round(p.z), jobs: [] });
  };
  return { explore, describeSpot, roadsNear, openExplorePlace, rowButtons, rowBelow, marks: markTags, onMark: (id: number) => setMarkOpen(id), openLeaveMark, fly, openThings: (tab: ThingsTab) => setThings(tab), openReputation: () => setRepOpen(true), openNews: () => setNewsOpen(true), reputation: rep?.score ?? null, centerRef, owned: shown, flyTo, newsScene, adOpen, search: region ? { region, mine: assets?.units ?? [], owned: shown, businesses, coins, homes: () => homesFor(region), onPick: (h: SearchHit) => fly(h.x, h.z), near: searchNear } : null, onProperty, onWorkplace: setPlace, openPlace: setPlace, businesses, onBusiness: openBusiness, billboardAds, businessViews, overlay, restartGuide, openCurrency, openPassport: () => setPassportOpen(true), openReport, openFinance, cashNow: coins, financeGlow, financeDot, hasHome: !!homeUnit, mySpot: whereAmI(), homeSpot, goHome, nameHome, homeBuilding: homeUnit ? homeUnit.split("/")[0] : null, openPlanner: () => setPlanning(true), openBuilder: () => setBuilding(true), locateMe, lookAt: (x: number, z: number) => setFlyTo({ tile: spiralIndex(Math.round(x), Math.round(z)), at: ++flies.current }), makeRow, openSoon: () => setSoonOpen(true), openGuestBook: (building: string) => setGuestBook(building),
    /** Where you are changed outside (a trip to a friend): read it again. */
    refreshLife: () => void refresh(),
    openLife: () => setLifeOpen(true),
    /** A place's card (its jobs, and what it does), from where it stands. */
    openWorkplace: (x: number, z: number, name: string) => {
      if (!region) return;
      const id = `${region.region.id}:${x},${z}`;
      setPlace(workplaceById(planOf(region), id) ?? { id, name, x, z, jobs: [] });
    },
  };
}
