"use client";

import { ArrowRight, Check, ChevronDown, Handshake, LoaderCircle, Search, Settings2, UserPlus, Users, X, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  endPartner,
  requestPartner,
  respondPartner,
  searchPartners,
  setPartnersAutoApprove,
  setPartnersEnabled,
  type PartnerResult,
} from "@/app/dashboard/[bizId]/partner-actions";
import { BusinessAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { ShareLinkBar } from "@/components/ui/share-actions";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { businessTagline, plural } from "@/lib/format";
import type { PartnerListing } from "@/lib/types";

const LIMIT = 2;

function MemberCount({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Users className="size-3.5" aria-hidden /> {plural(n, "customer")}
    </span>
  );
}

function ApprovalBadge({ auto }: { auto: boolean }) {
  return auto ? (
    <Badge tone="green">
      <Zap className="size-3" aria-hidden /> Approves instantly
    </Badge>
  ) : (
    <Badge>Approves each request</Badge>
  );
}

/** One business, with a switch to partner (or Accept / Decline when they asked you). */
function PartnerRow({
  biz,
  canAdd,
  enabled,
  busy,
  onToggle,
  onRespond,
}: {
  biz: PartnerListing;
  /** You still have a free place. */
  canAdd: boolean;
  enabled: boolean;
  busy: boolean;
  onToggle: (biz: PartnerListing, on: boolean) => void;
  onRespond: (biz: PartnerListing, accept: boolean) => void;
}) {
  const on = biz.relation === "active" || biz.relation === "sent";
  const blocked = !on && biz.relation === "none" && (!enabled || !canAdd || biz.is_full);
  const status =
    biz.relation === "active"
      ? { text: "Partner", tone: "text-brand-700" }
      : biz.relation === "sent"
        ? { text: "Waiting for them to approve", tone: "text-amber-900" }
        : biz.relation === "received"
          ? { text: "Wants to partner with you", tone: "text-amber-900" }
          : biz.is_full
            ? { text: `Already has ${LIMIT} partners`, tone: "text-muted" }
            : { text: "Add as partner", tone: blocked ? "text-subtle" : "text-ink-2" };

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <BusinessAvatar name={biz.name} color={biz.brand_color} logoUrl={biz.logo_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{biz.name}</p>
          <p className="truncate text-sm text-muted">{businessTagline(biz) || "On Spendbox"}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            <MemberCount n={Number(biz.members)} />
            {biz.relation !== "active" && <ApprovalBadge auto={biz.auto_approve} />}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {status && <span className={cn("text-sm font-semibold", status.tone)}>{status.text}</span>}
        {biz.relation === "received" ? (
          <div className="flex gap-2">
            <Button size="sm" loading={busy} disabled={busy || !canAdd} onClick={() => onRespond(biz, true)}>
              {!busy && <Check className="size-4" aria-hidden />} Accept
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRespond(biz, false)}>
              <X className="size-4" aria-hidden /> Decline
            </Button>
          </div>
        ) : (
          <span className="flex items-center gap-2">
            {busy && <LoaderCircle className="size-4 animate-spin text-brand-600" aria-hidden />}
            <Switch
              checked={on}
              disabled={busy || blocked}
              label={on ? `Stop partnering with ${biz.name}` : `Partner with ${biz.name}`}
              onChange={(next) => onToggle(biz, next)}
            />
          </span>
        )}
      </div>
    </li>
  );
}

const STEPS = [
  { title: "Switch it on", body: "So other businesses can find you." },
  { title: "Pick up to 2 partners", body: "Businesses whose customers would love yours." },
  { title: "Share customers", body: "You're recommended to each other's customers. On Plus, you see their requests too." },
];

export function PartnersBoard({
  bizId,
  view,
  enabled: initialEnabled,
  autoApprove: initialAuto,
  initial,
  categories,
  invite,
}: {
  bizId: string;
  /** "mine": your partners, settings and the way in to finding more. "find": search for partners. */
  view: "mine" | "find";
  enabled: boolean;
  autoApprove: boolean;
  /** The directory as first loaded (partners and requests first). */
  initial: PartnerListing[];
  /** Categories that businesses taking partners have, most common first. */
  categories: string[];
  /** Link that signs a new business up as your partner. */
  invite: { url: string; message: string };
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [auto, setAuto] = useState(initialAuto);
  const [list, setList] = useState(initial);
  const [results, setResults] = useState<PartnerListing[] | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [, startTransition] = useTransition();
  const searchId = useRef(0);

  const mine = list.filter((b) => b.relation !== "none");
  const used = mine.filter((b) => b.relation === "active" || b.relation === "sent").length;
  const canAdd = used < LIMIT;
  const shown = (results ?? list).filter((b) => b.relation === "none");

  // Search as you type (or pick a category); the first screen comes from the server.
  useEffect(() => {
    if (!query.trim() && !category) return;
    const id = ++searchId.current;
    const timer = setTimeout(() => {
      void searchPartners(bizId, query, category).then((rows) => {
        if (id === searchId.current) {
          setResults(rows);
          setSearching(false);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [bizId, query, category]);

  const startSearch = (nextQuery: string, nextCategory: string | null) => {
    setQuery(nextQuery);
    setCategory(nextCategory);
    if (!nextQuery.trim() && !nextCategory) {
      searchId.current++;
      setResults(null);
      setSearching(false);
    } else {
      setSearching(true);
    }
  };

  /** Reload everything after a change, so places and statuses stay right. */
  const reload = async () => {
    const [all, filtered] = await Promise.all([
      searchPartners(bizId, "", null),
      query.trim() || category ? searchPartners(bizId, query, category) : Promise.resolve(null),
    ]);
    setList(all);
    setResults(filtered);
  };

  const run = (id: string, work: () => Promise<PartnerResult>, success?: (r: PartnerResult) => string | null) => {
    setBusyId(id);
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (result.error) setMessage({ tone: "error", text: result.error });
      else {
        const text = success?.(result);
        if (text) setMessage({ tone: "success", text });
      }
      await reload();
      setBusyId(null);
    });
  };

  const toggle = (biz: PartnerListing, on: boolean) => {
    if (on) {
      run(biz.id, () => requestPartner(bizId, biz.id), (r) =>
        r.status === "active"
          ? `You're now partners with ${biz.name}. You're now recommended to each other's customers.`
          : `Request sent. Once ${biz.name} approves, you'll be recommended to each other's customers.`,
      );
      return;
    }
    if (!biz.partnership_id) return;
    if (biz.relation === "active" && !confirm(`End your partnership with ${biz.name}? You stop being recommended to each other's customers.`)) {
      return;
    }
    run(biz.id, () => endPartner(bizId, biz.partnership_id!), () =>
      biz.relation === "active" ? `You're no longer partners with ${biz.name}.` : "Request cancelled.",
    );
  };

  const respond = (biz: PartnerListing, accept: boolean) => {
    if (!biz.partnership_id) return;
    run(biz.id, () => respondPartner(bizId, biz.partnership_id!, biz.id, accept), () =>
      accept ? `You're now partners with ${biz.name}.` : "Request declined.",
    );
  };

  const saveSetting = (which: "enabled" | "auto", next: boolean) => {
    if (which === "enabled") setEnabled(next);
    else setAuto(next);
    startTransition(async () => {
      const r = which === "enabled" ? await setPartnersEnabled(bizId, next) : await setPartnersAutoApprove(bizId, next);
      if (r.error) {
        setMessage({ tone: "error", text: r.error });
        if (which === "enabled") setEnabled(!next);
        else setAuto(!next);
      }
    });
  };

  const rowProps = { canAdd, enabled, onToggle: toggle, onRespond: respond };
  const base = `/dashboard/${bizId}/partners`;
  const available = list.filter((b) => b.relation === "none").length;

  const onSwitch = (
    <Card className="flex items-start justify-between gap-4 p-5">
      <div>
        <p className="font-semibold text-ink">Cross-promotion</p>
        <p className="text-sm text-muted">Let other businesses on Spendbox find you, so you can share customers.</p>
      </div>
      <Switch checked={enabled} label="Cross-promotion" onChange={(v) => saveSetting("enabled", v)} />
    </Card>
  );

  const inviteCard = (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-700">
          <UserPlus className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">Invite a business</p>
          <p className="text-sm text-muted">Know a business your customers love? When they sign up from your link, you&apos;re partners straight away.</p>
        </div>
      </div>
      <ShareLinkBar url={invite.url} message={invite.message} />
    </Card>
  );

  if (view === "find") {
    return (
      <div className="flex flex-col gap-4">
        {!enabled && (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
            Cross-promotion is off, so you can look but not partner yet.{" "}
            <Link href={base} className="font-semibold underline underline-offset-2">
              Switch it on
            </Link>
          </p>
        )}
        {enabled && !canAdd && <p className="text-sm text-muted">You&apos;re using both places. End a partnership or cancel a request to add someone else.</p>}
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => startSearch(e.target.value, category)}
            placeholder="Search by name, category or area"
            aria-label="Search businesses"
            className="h-12 w-full rounded-xl border border-line-strong bg-white pr-10 pl-10 text-[15px] outline-none transition placeholder:text-subtle focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
          />
          {searching && <LoaderCircle className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-brand-600" aria-hidden />}
        </div>
        {categories.length > 0 && (
          <div role="group" aria-label="Filter by category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {[null, ...categories].map((c) => {
              const active = category === c;
              return (
                <button
                  key={c ?? "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => startSearch(query, c)}
                  className={cn(
                    "flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold ring-1 transition",
                    active ? "bg-ink text-white ring-ink" : "bg-white text-ink-2 ring-line hover:bg-canvas",
                  )}
                >
                  {c ?? "All"}
                </button>
              );
            })}
          </div>
        )}
        <section aria-labelledby="find-partners">
          <h2 id="find-partners" className="sr-only">
            Businesses taking partners
          </h2>
          {shown.length === 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title={query || category ? "No businesses match" : "No other businesses are taking partners yet"}
              description={query || category ? "Try another name or category, or invite them." : "Invite a business you know, and you'll be partners as soon as they sign up."}
            />
          ) : (
            <Card className="px-5">
              <ul className="divide-y divide-line">
                {shown.map((b) => (
                  <PartnerRow key={b.id} biz={b} busy={busyId === b.id} {...rowProps} />
                ))}
              </ul>
            </Card>
          )}
        </section>
        {inviteCard}
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-4">
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-line">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{i + 1}</span>
              <div>
                <p className="text-sm font-semibold text-ink">{step.title}</p>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        {onSwitch}
        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href={`${base}/find`}
          className="group flex items-center gap-4 rounded-3xl bg-brand-700 p-5 text-white shadow-lift transition hover:bg-brand-800"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Search className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-bold">Find partners</span>
            <span className="block text-sm text-white/85">
              {available ? `${plural(available, "business", "businesses")} taking partners` : "Search by name, category or area"}
            </span>
          </span>
          <ArrowRight className="size-5 transition group-hover:translate-x-0.5" aria-hidden />
        </Link>
        {inviteCard}
      </div>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      <section className="flex flex-col gap-3" aria-labelledby="my-partners">
        <SectionTitle
          title={<span id="my-partners">Your partners</span>}
          description={`${used} of ${LIMIT} places used${mine.some((b) => b.relation === "received") ? " · requests waiting for you are below" : ""}`}
        />
        {mine.length === 0 ? (
          <EmptyState
            icon={<Handshake className="size-5" />}
            title="No partners yet"
            description="Find businesses whose customers would love yours, like a barber and a spa, or a baker and a decorator."
          />
        ) : (
          <Card className="px-5">
            <ul className="divide-y divide-line">
              {mine.map((b) => (
                <PartnerRow key={b.id} biz={b} busy={busyId === b.id} {...rowProps} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      <details className="group rounded-2xl bg-white ring-1 ring-line">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-semibold text-ink-2 [&::-webkit-details-marker]:hidden">
          <Settings2 className="size-4 text-muted" aria-hidden />
          <span className="flex-1">Partner settings</span>
          <span className="font-normal text-muted">{auto ? "Approve automatically" : "Approve each request"}</span>
          <ChevronDown className="size-4 text-muted transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="flex flex-col divide-y divide-line border-t border-line px-4">
          <div className="flex items-start justify-between gap-4 py-4">
            <div>
              <p className="font-semibold text-ink">Approve requests automatically</p>
              <p className="text-sm text-muted">
                {auto ? "Businesses that ask become partners straight away (while you have a free place)." : "You approve each request yourself."}
              </p>
            </div>
            <Switch checked={auto} label="Approve partner requests automatically" onChange={(v) => saveSetting("auto", v)} />
          </div>
          <div className="flex items-start justify-between gap-4 py-4">
            <div>
              <p className="font-semibold text-ink">Cross-promotion</p>
              <p className="text-sm text-muted">Switching it off hides you from other businesses and pauses partner perks.</p>
            </div>
            <Switch checked={enabled} label="Cross-promotion" onChange={(v) => saveSetting("enabled", v)} />
          </div>
        </div>
      </details>
    </div>
  );
}
