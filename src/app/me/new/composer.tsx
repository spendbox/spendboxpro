"use client";

import { Camera, Check, LoaderCircle, Mail, Phone, X } from "lucide-react";
import { useActionState, useRef, useState, useTransition, type ReactNode } from "react";
import { postRequest, type RequestResult } from "@/app/me/request-actions";
import { shrinkImage } from "@/components/requests/shrink-image";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { PhoneInput } from "@/components/ui/phone-input";
import { WhatsAppIcon } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";
import { CATEGORIES } from "@/lib/constants";
import { formatPhone } from "@/lib/format";
import { MAX_REQUEST_IMAGES, REQUEST_IDEAS } from "@/lib/requests";

export interface ComposerDefaults {
  body: string;
  category: string | null;
  area: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  images: string[];
  whatsapp: boolean;
  call: boolean;
  email: boolean;
  repostOf: string | null;
}

function Toggle({ on, onClick, icon, label, sub }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; sub?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-1 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left ring-1 transition",
        on ? "bg-brand-50 text-brand-900 ring-2 ring-brand-600" : "bg-white text-ink-2 ring-line-strong hover:bg-canvas",
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", on ? "bg-brand-600 text-white" : "bg-canvas text-muted")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </button>
  );
}

const withCommas = (digits: string) => (digits ? Number(digits).toLocaleString("en-NG") : "");

/** "What do you need?": text, photos, budget and how businesses can reach you. */
export function Composer({ defaults, phone, email, audience }: { defaults: ComposerDefaults; phone: string | null; email: string | null; audience: string }) {
  const [state, dispatch] = useActionState<RequestResult, FormData>(postRequest, {});
  const [pending, start] = useTransition();
  const [body, setBody] = useState(defaults.body);
  const [category, setCategory] = useState<string | null>(defaults.category);
  const [range, setRange] = useState(Boolean(defaults.budgetMin));
  const [min, setMin] = useState(defaults.budgetMin ? String(defaults.budgetMin) : "");
  const [max, setMax] = useState(defaults.budgetMax ? String(defaults.budgetMax) : "");
  const [kept, setKept] = useState<string[]>(defaults.images);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [contact, setContact] = useState({ whatsapp: defaults.whatsapp, call: defaults.call, email: defaults.email && Boolean(email) });
  const [country, setCountry] = useState("234");
  const [newPhone, setNewPhone] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [shrinking, setShrinking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const room = MAX_REQUEST_IMAGES - kept.length - photos.length;
  const needsPhone = (contact.whatsapp || contact.call) && !phone;
  const busy = pending || shrinking;

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setLocalError(null);
    setShrinking(true);
    const next: { file: File; url: string }[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const small = await shrinkImage(f);
        next.push({ file: small, url: URL.createObjectURL(small) });
      } catch {
        setLocalError("We couldn't read one of those photos. Try a different one.");
      }
    }
    setPhotos((p) => [...p, ...next].slice(0, MAX_REQUEST_IMAGES - kept.length));
    setShrinking(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.delete("images");
        for (const p of photos) fd.append("images", p.file);
        start(() => dispatch(fd));
      }}
    >
      {defaults.repostOf && <input type="hidden" name="reposted_from" value={defaults.repostOf} />}
      {kept.map((u) => (
        <input key={u} type="hidden" name="keep_image" value={u} />
      ))}
      {contact.whatsapp && <input type="hidden" name="contact_whatsapp" value="on" />}
      {contact.call && <input type="hidden" name="contact_call" value="on" />}
      {contact.email && <input type="hidden" name="contact_email" value="on" />}
      <input type="hidden" name="budget_max" value={max} />
      <input type="hidden" name="budget_min" value={range ? min : ""} />

      {/* What */}
      <section className="flex flex-col gap-3">
        <label htmlFor="request-body" className="font-display text-xl font-bold">
          What do you need?
        </label>
        {!body && !defaults.repostOf && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {REQUEST_IDEAS.map((idea) => (
              <button
                key={idea.label}
                type="button"
                onClick={() => {
                  setBody(idea.text);
                  setCategory(idea.category);
                }}
                className="shrink-0 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-ink-2 ring-1 ring-line transition hover:ring-brand-300"
              >
                {idea.label}
              </button>
            ))}
          </div>
        )}
        <Textarea
          id="request-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={4}
          placeholder="e.g. A red velvet cake for Saturday, about 8 inches, delivered to Yaba."
          className="min-h-32 text-[16px] leading-relaxed"
        />
        <p className="-mt-1 text-right text-xs text-muted tabular">{body.length}/500</p>
      </section>

      {/* Photos */}
      <section className="flex flex-col gap-3">
        <div>
          <p className="font-semibold">Photos</p>
          <p className="text-sm text-muted">Optional. A picture of what you want helps businesses quote quickly.</p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {kept.map((u) => (
            <div key={u} className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="size-full object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => setKept((k) => k.filter((x) => x !== u))} className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {photos.map((p) => (
            <div key={p.url} className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="size-full object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => setPhotos((all) => all.filter((x) => x !== p))} className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {room > 0 && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={shrinking}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line-strong text-muted transition hover:border-brand-400 hover:text-brand-700"
            >
              {shrinking ? <LoaderCircle className="size-6 animate-spin" aria-hidden /> : <Camera className="size-6" aria-hidden />}
              <span className="text-xs font-semibold">{shrinking ? "Adding…" : "Add"}</span>
            </button>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" aria-label="Add photos" onChange={(e) => void addPhotos(e.target.files)} />
      </section>

      {/* Budget */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">Your budget</p>
          <div className="flex rounded-full bg-canvas p-1 ring-1 ring-line" role="radiogroup" aria-label="Budget type">
            {[
              { v: false, l: "Up to" },
              { v: true, l: "Range" },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                role="radio"
                aria-checked={range === o.v}
                onClick={() => setRange(o.v)}
                className="rounded-full px-3 py-1 text-xs font-semibold text-muted aria-checked:bg-white aria-checked:text-ink aria-checked:shadow-card"
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {range && (
            <>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted">₦</span>
                <Input id="budget-min" inputMode="numeric" aria-label="Lowest amount" placeholder="From" value={withCommas(min)} onChange={(e) => setMin(e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-13 pl-8 text-lg font-semibold tabular" />
              </div>
              <span className="text-muted">–</span>
            </>
          )}
          <div className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted">₦</span>
            <Input id="budget-max" inputMode="numeric" aria-label={range ? "Highest amount" : "Budget"} placeholder={range ? "To" : "e.g. 30,000"} value={withCommas(max)} onChange={(e) => setMax(e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-13 pl-8 text-lg font-semibold tabular" />
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="request-category" optional>
          <Combobox id="request-category" name="category" options={CATEGORIES.map((c) => ({ value: c, label: c }))} value={category} onChange={setCategory} searchable placeholder="Pick one" searchPlaceholder="Search categories" />
        </Field>
        <Field label="Area" htmlFor="request-area" optional>
          <Input id="request-area" name="area" defaultValue={defaults.area ?? ""} maxLength={80} placeholder="e.g. Yaba, Lagos" />
        </Field>
      </section>

      {/* Contact */}
      <section className="flex flex-col gap-3">
        <div>
          <p className="font-semibold">How can businesses reach you?</p>
          <p className="text-sm text-muted">Only the businesses that see your request get these.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Toggle on={contact.whatsapp} onClick={() => setContact((c) => ({ ...c, whatsapp: !c.whatsapp }))} icon={<WhatsAppIcon className="size-4" />} label="WhatsApp" sub={phone ? formatPhone(phone) : "Add your number"} />
          <Toggle on={contact.call} onClick={() => setContact((c) => ({ ...c, call: !c.call }))} icon={<Phone className="size-4" aria-hidden />} label="Call" sub={phone ? formatPhone(phone) : "Add your number"} />
          {email && <Toggle on={contact.email} onClick={() => setContact((c) => ({ ...c, email: !c.email }))} icon={<Mail className="size-4" aria-hidden />} label="Email" sub={email} />}
        </div>
        {needsPhone && (
          <Field label="Your phone number" htmlFor="request-phone" hint="Saved to your profile. Only businesses that see your requests get it.">
            <PhoneInput id="request-phone" label="Your phone number" country={country} onCountry={setCountry} value={newPhone} onChange={setNewPhone} />
            <input type="hidden" name="phone" value={newPhone} />
            <input type="hidden" name="phone_country" value={country} />
          </Field>
        )}
      </section>

      <FormMessage>{localError ?? state.error}</FormMessage>

      {/* Post */}
      <div>
        <div className="flex flex-col gap-1.5">
          <Button type="submit" size="lg" block disabled={busy || body.trim().length < 5 || !max}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            {defaults.repostOf ? "Post again" : "Post request"}
          </Button>
          <p className="text-center text-xs text-muted">{audience}</p>
        </div>
      </div>
    </form>
  );
}
