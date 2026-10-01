"use client";

import { ArrowLeft, LoaderCircle, Minus, Pencil, Plus, Trash } from "lucide-react";
import { useState, useTransition } from "react";
import { deletePerk, savePerk, setPerkActive } from "@/app/dashboard/[bizId]/actions";
import { PerkCard, PerkIcon } from "@/components/perks/perk-card";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ActionSwitch } from "@/components/ui/switch";
import { PERK_KIND_ORDER, PERK_KINDS, SUGGESTED_PERKS } from "@/lib/perks";
import type { Perk, PerkKind } from "@/lib/types";

interface Draft {
  id?: string;
  kind: PerkKind;
  title: string;
  details: string;
  threshold: string;
}

const DEFAULT_THRESHOLD: Partial<Record<PerkKind, string>> = { visits: "5", spend: "50000" };

export function PerkBoard({ bizId, perks, currency }: { bizId: string; perks: Perk[]; currency: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState<Perk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startNew(kind?: PerkKind) {
    setError(null);
    if (!kind) {
      setPicking(true);
      return;
    }
    setPicking(false);
    setDraft({ kind, title: "", details: "", threshold: DEFAULT_THRESHOLD[kind] ?? "" });
  }

  function edit(perk: Perk) {
    setError(null);
    setDraft({
      id: perk.id,
      kind: perk.kind,
      title: perk.title,
      details: perk.details ?? "",
      threshold: perk.threshold ? String(perk.threshold) : "",
    });
  }

  function save() {
    if (!draft) return;
    startTransition(async () => {
      const result = await savePerk(bizId, {
        id: draft.id,
        kind: draft.kind,
        title: draft.title,
        details: draft.details,
        threshold: draft.threshold ? Number(draft.threshold.replace(/[^\d.]/g, "")) : null,
      });
      if (result.error) setError(result.error);
      else setDraft(null);
    });
  }

  function addSuggestion(s: (typeof SUGGESTED_PERKS)[number]) {
    startTransition(async () => {
      const result = await savePerk(bizId, { kind: s.kind, title: s.title, threshold: s.threshold });
      if (result.error) setError(result.error);
    });
  }

  const suggestions = SUGGESTED_PERKS.filter((s) => !perks.some((p) => p.kind === s.kind));
  const info = draft ? PERK_KINDS[draft.kind] : null;
  const thresholdNumber = Number(draft?.threshold.replace(/[^\d.]/g, "") || 0);

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {perks.map((perk) => (
          <div key={perk.id} className="flex flex-col gap-3">
            <PerkCard
              kind={perk.kind}
              title={perk.title}
              threshold={perk.threshold}
              details={perk.details}
              currency={currency}
              paused={!perk.is_active}
            />
            <div className="flex items-center justify-between gap-2 px-1">
              <label className="flex items-center gap-2.5 text-sm font-semibold text-ink-2">
                <ActionSwitch
                  initial={perk.is_active}
                  label={`${perk.title} is on`}
                  action={(on) => setPerkActive(bizId, perk.id, on)}
                />
                {perk.is_active ? "On" : "Paused"}
              </label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => edit(perk)} aria-label={`Edit ${perk.title}`}>
                  <Pencil className="size-4" aria-hidden /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(perk)} aria-label={`Delete ${perk.title}`} className="text-red-700">
                  <Trash className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => startNew()}
          className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line-strong bg-white/50 p-6 text-center transition hover:border-brand-600 hover:bg-brand-50 sm:min-h-52"
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
            <Plus className="size-6" aria-hidden />
          </span>
          <span className="font-display text-lg font-bold">Add a perk</span>
          <span className="text-sm text-muted">Welcome, loyalty, invites, big spenders or birthdays</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <section className="mt-10 flex flex-col gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Popular perks</h2>
            <p className="text-sm text-muted">Tap to add one. You can change the wording any time.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {suggestions.map((s) => (
              <button
                key={s.kind}
                type="button"
                disabled={pending}
                onClick={() => addSuggestion(s)}
                className="flex items-center gap-3 rounded-2xl bg-white p-3.5 text-left shadow-card ring-1 ring-line transition hover:ring-brand-300 disabled:opacity-60"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: PERK_KINDS[s.kind].color }}
                >
                  <PerkIcon kind={s.kind} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-muted">{PERK_KINDS[s.kind].label}</span>
                  <span className="block text-sm font-semibold">{s.title}</span>
                </span>
                <Plus className="ml-auto size-4 shrink-0 text-muted" aria-hidden />
              </button>
            ))}
          </div>
          <FormMessage>{error}</FormMessage>
        </section>
      )}

      {/* Step 1: choose the kind of perk */}
      <Modal open={picking} onClose={() => setPicking(false)} title="What kind of perk?" description="Pick a card. You'll name the reward next.">
        <div className="grid gap-2">
          {PERK_KIND_ORDER.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => startNew(kind)}
              className="flex items-center gap-4 rounded-2xl p-3 text-left ring-1 ring-line transition hover:bg-canvas hover:ring-line-strong"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: PERK_KINDS[kind].color }}>
                <PerkIcon kind={kind} className="size-6" />
              </span>
              <span>
                <span className="block font-bold">{PERK_KINDS[kind].label}</span>
                <span className="block text-sm text-muted">{PERK_KINDS[kind].pickerHint}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Step 2: describe the reward, with a live preview */}
      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit perk" : `New ${info?.label.toLowerCase() ?? "perk"}`}
      >
        {draft && info && (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <PerkCard
              kind={draft.kind}
              title={draft.title || info.example}
              threshold={info.needsThreshold ? thresholdNumber || null : null}
              details={draft.details || null}
              currency={currency}
              size="sm"
            />

            <Field label="What do they get?" htmlFor="perk-title">
              <Input
                id="perk-title"
                autoFocus
                maxLength={80}
                placeholder={info.example}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>

            {draft.kind === "visits" && (
              <Field label="After how many purchases?" htmlFor="perk-threshold" hint="It repeats: every time they reach this number, they earn it again.">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    aria-label="Fewer"
                    className="w-12 px-0"
                    onClick={() => setDraft({ ...draft, threshold: String(Math.max(1, thresholdNumber - 1)) })}
                  >
                    <Minus className="size-4" aria-hidden />
                  </Button>
                  <Input
                    id="perk-threshold"
                    inputMode="numeric"
                    className="w-20 text-center text-lg font-bold"
                    value={draft.threshold}
                    onChange={(e) => setDraft({ ...draft, threshold: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                  />
                  <Button
                    variant="secondary"
                    aria-label="More"
                    className="w-12 px-0"
                    onClick={() => setDraft({ ...draft, threshold: String(Math.min(100, thresholdNumber + 1)) })}
                  >
                    <Plus className="size-4" aria-hidden />
                  </Button>
                  <span className="text-sm text-muted">purchases</span>
                </div>
              </Field>
            )}

            {draft.kind === "spend" && (
              <Field label={`After spending how much? (${currency})`} htmlFor="perk-threshold" hint="It repeats every time they spend this much again.">
                <Input
                  id="perk-threshold"
                  inputMode="numeric"
                  value={draft.threshold}
                  onChange={(e) => setDraft({ ...draft, threshold: e.target.value.replace(/[^\d]/g, "").slice(0, 10) })}
                />
              </Field>
            )}

            <Field label="Conditions" htmlFor="perk-details" optional hint="e.g. “Dine-in only” or “Not with other offers”.">
              <Input
                id="perk-details"
                maxLength={200}
                value={draft.details}
                onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              />
            </Field>

            <FormMessage>{error}</FormMessage>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {!draft.id ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(null);
                    setPicking(true);
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden /> Change type
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" size="lg" disabled={pending}>
                {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                {draft.id ? "Save changes" : "Add perk"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this perk?"
        description="Customers can't earn it any more. Perks they've already earned stay valid until used. To stop it for a while instead, switch it off."
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (deleting) await deletePerk(bizId, deleting.id);
                setDeleting(null);
              })
            }
          >
            Delete perk
          </Button>
        </div>
      </Modal>
    </>
  );
}
