"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordInput } from "@/components/password-input";
import { cn } from "@/lib/cn";
import { passwordProblem, passwordScore } from "@/lib/password";
import { checkPassword, saveBirthDateOnly, saveName, savePassword, signOutNow } from "../login/actions";
import { BirthDateInput, birthComplete, emptyBirth } from "./birth-date-input";
import { setGender, type Gender } from "../play/people-actions";

const input = "w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink outline-none focus:border-gold";
const button = "w-full rounded-xl bg-gold px-4 py-3 font-semibold text-ink disabled:opacity-50";

/**
 * What the player is here to do:
 * - setup: a new player signing up;
 * - upgrade: a player from before passwords, to make one;
 * - reset: forgot password, or Change password from the menu;
 * - birth: only the date of birth (players from before the 18+ rule).
 */
export type WelcomeMode = "setup" | "upgrade" | "reset" | "birth";
type Step = "name" | "gender" | "birth" | "password" | "again" | "save" | "done";

function stepsFor(mode: WelcomeMode, askBirth: boolean): Step[] {
  if (mode === "birth") return ["birth"];
  // The date of birth comes before the password: under-18s stop there, and the password needs it.
  const birth: Step[] = askBirth ? ["birth"] : [];
  const pw: Step[] = ["password", "again", "save", "done"];
  return mode === "setup" ? ["name", "gender", ...birth, ...pw] : [...birth, ...pw];
}

/**
 * Signing up (and new passwords), one question a screen, with Back. Each answer is checked (and,
 * for the name and date of birth, kept) before the next screen; the password is saved on the last.
 */
export function WelcomeForm({
  mode,
  email,
  initialName,
  askBirth,
  onDone,
}: {
  mode: WelcomeMode;
  email: string;
  initialName: string;
  askBirth: boolean;
  /** The sign-in pop-up over the town: called instead of going to the game page. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const steps = stepsFor(mode, askBirth);
  const [k, setK] = useState(0);
  const step = steps[k];
  const [name, setName] = useState(initialName);
  const [gender, setGenderNow] = useState<Gender | null>(null);
  const [birth, setBirth] = useState(emptyBirth);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const about = { email, name };

  const next = () => {
    setError(null);
    setK((n) => Math.min(n + 1, steps.length - 1));
  };
  const leave = () => {
    if (onDone) return onDone();
    router.push("/play");
    router.refresh();
  };
  async function run(fn: () => Promise<{ ok: boolean; error?: string; underage?: boolean }>) {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) return next();
    setError(res.error ?? "Something went wrong. Please try again.");
    // Under 18: reload, which shows the "adults only" note instead.
    if (res.underage) router.refresh();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step === "name") return run(() => saveName(name));
    if (step === "gender") return gender && run(() => setGender(gender));
    if (step === "birth") {
      if (!birthComplete(birth)) return setError("Please choose your date of birth.");
      return run(async () => {
        const res = await saveBirthDateOnly(birth);
        // Just the date of birth to add: that's everything.
        if (res.ok && mode === "birth") leave();
        return res;
      });
    }
    if (step === "password") {
      const problem = passwordProblem(password, about);
      if (problem) return setError(problem);
      return run(() => checkPassword(password));
    }
    if (step === "again") return again === password ? next() : setError("That's not the same. Check the eye to see what you typed.");
    if (step === "save") return saved && run(() => savePassword(password, again));
    if (step === "done") return leave();
  }

  const ready =
    step === "name"
      ? /^[A-Za-z0-9_]{3,16}$/.test(name)
      : step === "gender"
        ? !!gender
        : step === "birth"
          ? birthComplete(birth)
          : step === "password"
            ? passwordScore(password, about) >= 2
            : step === "again"
              ? again.length > 0
              : step === "save"
                ? saved
                : true;
  const label =
    step === "save" ? (busy ? "Saving…" : "Save my password") : step === "done" ? "Enter the city" : step === "birth" && mode === "birth" ? "Continue" : busy ? "One moment…" : "Next";
  // The dots: every step but the celebration.
  const shown = steps.filter((s) => s !== "done");

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {shown.length > 1 && step !== "done" && (
        <div className="flex items-center gap-2">
          {k > 0 ? (
            <button type="button" onClick={() => { setError(null); setK(k - 1); }} className="grid size-8 place-items-center rounded-full hover:bg-panel-2" aria-label="Back">
              <ArrowLeft className="size-4" />
            </button>
          ) : (
            <span className="size-8" />
          )}
          <div className="flex flex-1 gap-1" aria-label={`Step ${k + 1} of ${shown.length}`}>
            {shown.map((s, i) => (
              <span key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= k ? "bg-gold" : "bg-ink/10")} />
            ))}
          </div>
        </div>
      )}
      {/* For password managers: the account the new password belongs to. */}
      {(step === "password" || step === "again") && <input type="email" autoComplete="username" value={email} readOnly hidden />}

      <div key={step} className="start-pop flex flex-col gap-3">
        {step === "name" && (
          <>
            <Question title="What should people call you?" hint="The name everyone in the city sees. 3 to 16 letters, numbers or _." />
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 16))}
              placeholder="e.g. NightOwl"
              autoComplete="nickname"
              aria-label="Name"
              autoFocus
              required
            />
          </>
        )}
        {step === "gender" && (
          <>
            <Question title={`Nice to meet you, ${name}! You are a…`} hint="Shown on your card." />
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Man or woman">
              {(
                [
                  ["male", "Man", "🙋🏾‍♂️"],
                  ["female", "Woman", "🙋🏾‍♀️"],
                ] as const
              ).map(([g, text, icon]) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={gender === g}
                  onClick={() => setGenderNow(g)}
                  className={`flex h-20 flex-col items-center justify-center rounded-xl border font-semibold ${gender === g ? "border-gold bg-gold/20" : "border-line bg-panel"}`}
                >
                  <span className="text-2xl">{icon}</span>
                  {text}
                </button>
              ))}
            </div>
          </>
        )}
        {step === "birth" && (
          <>
            <Question title="When were you born?" hint="Newtown is for adults 18+. We only ask once, and it stays private." />
            <BirthDateInput value={birth} onChange={setBirth} />
          </>
        )}
        {step === "password" && (
          <>
            <Question
              title={mode === "upgrade" ? "Time for a proper password 🔐" : mode === "reset" ? "Make a new password" : "Now, a password"}
              hint={
                mode === "upgrade"
                  ? "Newtown now uses passwords instead of PINs, to keep your money and home safe. Make one; your PIN stops working after this."
                  : "At least 8 characters. A few random words together is long, strong and easy to remember."
              }
            />
            <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="new-password" meter about={about} autoFocus />
          </>
        )}
        {step === "again" && (
          <>
            <Question title="Type it once more" hint="Just to be sure there's no typo." />
            <PasswordInput
              label="Password again"
              value={again}
              onChange={setAgain}
              autoComplete="new-password"
              autoFocus
              onPaste={(e) => {
                e.preventDefault();
                setError("Type it rather than paste it: that's how we catch a typo.");
              }}
            />
            {again.length >= password.length && again !== password && <p className="text-sm text-hit">Not the same yet.</p>}
            {again === password && <p className="start-pop text-sm font-semibold text-me">They match ✅</p>}
          </>
        )}
        {step === "save" && (
          <>
            <Question title="Keep your login somewhere safe 🗝️" hint="You'll need these to get back into the city, on any phone." />
            <div className="rounded-xl border border-line bg-panel-2/60 p-3 text-sm">
              <p>
                Email: <b>{email}</b>
              </p>
              <p className="mt-1">
                Password: <b>{"•".repeat(Math.min(password.length, 16))}</b>
              </p>
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              <li>📱 Let your phone or browser save it when it asks (Google Password Manager, iCloud Keychain).</li>
              <li>📝 Or write it down and keep it somewhere private.</li>
              <li>🤫 Never share it. Newtown will never ask you for your password.</li>
            </ul>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line px-3 py-3 text-sm font-semibold">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-5 accent-[#d4a017]" />
              I&apos;ve saved my email and password somewhere safe
            </label>
          </>
        )}
        {step === "done" && (
          <div className="py-2 text-center">
            <p className="text-5xl">{mode === "setup" ? "🎉" : "🔒"}</p>
            <p className="mt-3 font-display text-2xl font-extrabold">{mode === "setup" ? `Welcome to Newtown, ${name}!` : "Password saved!"}</p>
            <p className="mt-1 text-sm text-muted">
              {mode === "setup" ? "₦2,000,000 and a free home are waiting for you. Let's go!" : "Next time, sign in with your email and this password."}
            </p>
          </div>
        )}
      </div>

      <button className={button} disabled={busy || !ready}>
        {label}
      </button>
      {error && <p className="text-sm text-hit">{error}</p>}
    </form>
  );
}

function Question({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <p className="font-display text-xl font-bold leading-tight">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Shown instead of the form to anyone who told us they are under 18. */
export function AdultsOnly() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border border-line bg-panel p-4 text-sm">
        Sorry, Newtown is only for adults 18 and over, so this account can&apos;t play. Thanks for being honest with us.
      </p>
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOutNow();
          router.push("/");
          router.refresh();
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
