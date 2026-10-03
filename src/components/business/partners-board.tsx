"use client";

import { Check, Handshake, LoaderCircle, Search, Users, X, Zap } from "lucide-react";
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

export function PartnersBoard({
  bizId,
  enabled: initialEnabled,
  autoApprove: initialAuto,
  initial,
  categories,
}: {
  bizId: string;
  enabled: boolean;
  autoApprove: boolean;
  /** The directory as first loaded (partners and requests first). */
  initial: PartnerListing[];
  /** Categories that businesses taking partners have, most common first. */
  categories: string[];
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
          ? `You're now partners with ${biz.name}. Your perks show to each other's customers.`
          : `Request sent. Once ${biz.name} approves, your perks show to each other's customers.`,
      );
      return;
    }
    if (!biz.partnership_id) return;
    if (biz.relation === "active" && !confirm(`End your partnership with ${biz.name}? Your perks stop showing to each other's customers.`)) {
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

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Switch it on */}
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-ink">Cross-promotion</p>
            <p className="text-sm text-muted">
              Let other businesses on Spendbox find you, and show your perks to their customers.
            </p>
          </div>
          <Switch checked={enabled} label="Cross-promotion" onChange={(v) => saveSetting("enabled", v)} />
        </div>
        {enabled && (
          <div className="flex items-start justify-between gap-4 border-t border-line pt-5">
            <div>
              <p className="font-semibold text-ink">Approve requests automatically</p>
              <p className="text-sm text-muted">
                {auto
                  ? "Businesses that ask become partners straight away (while you have a free place)."
                  : "You'll approve each request yourself. Requests wait for you here."}
              </p>
            </div>
            <Switch checked={auto} label="Approve partner requests automatically" onChange={(v) => saveSetting("auto", v)} />
          </div>
        )}
      </Card>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      {/* 2. Your partners and requests */}
      <section className="flex flex-col gap-3" aria-labelledby="my-partners">
        <SectionTitle
          title={<span id="my-partners">Your partners</span>}
          description={`${used} of ${LIMIT} places used${mine.some((b) => b.relation === "received") ? " · requests waiting for you are below" : ""}`}
        />
        {mine.length === 0 ? (
          <EmptyState
            icon={<Handshake className="size-5" />}
            title="No partners yet"
            description={
              enabled
                ? "Pick businesses below whose customers would love your perks, like a barber and a spa, or a gym and a juice bar."
                : "Switch on cross-promotion above to find partners."
            }
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

      {/* 3. Find partners */}
      <section className="flex flex-col gap-3" aria-labelledby="find-partners">
        <SectionTitle
          title={<span id="find-partners">Find partners</span>}
          description="Businesses on Spendbox that are taking partners. Switch one on to partner with them."
        />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
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

        {!enabled && (
          <p className="text-sm text-muted">Switch on cross-promotion above to partner with these businesses.</p>
        )}
        {enabled && !canAdd && (
          <p className="text-sm text-muted">You&apos;re using both places. End a partnership or cancel a request to add someone else.</p>
        )}

        {shown.length === 0 ? (
          <EmptyState
            icon={<Search className="size-5" />}
            title={query || category ? "No businesses match" : "No other businesses are taking partners yet"}
            description={query || category ? "Try another name or category." : "As more businesses switch on cross-promotion, they'll show up here."}
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
    </div>
  );
}
