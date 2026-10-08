// A small "story grammar" (in the spirit of Tracery) that writes the NPCs' lines.
//
// A rule is a list of ways to say something. Inside a line:
//   #name#        → one of the ways from rule "name" (which can contain more rules, and so on)
//   #name.cap#    → the same, with a capital first letter (also .lower, .a for "a/an …")
//   [one|two|]    → one of these right here (an empty choice means "say nothing")
//   {first}       → a fact about the speaker or the moment (their name, the place, a number…);
//                   {place.cap} etc. take the same modifiers as rules
// Each character can bring their own versions of any rule (a clown's "greet", a rude
// person's "react_ok"…), and each mood a few of its own, so the same rule sounds different
// in every mouth. Choices are seeded, so a conversation can be replayed exactly.

import { pick, type Rand } from "./rng";

export type Rules = Record<string, readonly string[]>;

export type Voice = {
  rand: Rand;
  /** Everyone's rules. */
  base: Rules;
  /** This character's own rules (used most of the time when they have one). */
  own?: Rules;
  /** Rules for their current mood (used now and then). */
  mood?: Rules;
  /** Facts for {placeholders}. */
  vars: Record<string, string | number | undefined>;
};

function lookup(name: string, v: Voice): readonly string[] | undefined {
  const own = v.own?.[name];
  const mood = v.mood?.[name];
  const base = v.base[name];
  if (own?.length && (!base?.length || v.rand() < 0.72)) return own;
  if (mood?.length && (!base?.length || v.rand() < 0.35)) return mood;
  if (base?.length) return base;
  return own?.length ? own : mood;
}

function modify(text: string, mod: string | undefined) {
  if (!mod || !text) return text;
  if (mod === "cap") return text.charAt(0).toUpperCase() + text.slice(1);
  if (mod === "lower") return text.charAt(0).toLowerCase() + text.slice(1);
  if (mod === "a") return `${/^[aeiou]/i.test(text) && !/^(uni|eu|one)/i.test(text) ? "an" : "a"} ${text}`;
  return text;
}

/** Expand one line of the grammar. */
export function expand(text: string, v: Voice, depth = 0): string {
  if (depth > 9) return text.replace(/#[\w.]+#|\[|\]/g, "");
  let s = text;
  // Inline choices, innermost first.
  for (let guard = 0; guard < 40 && s.includes("["); guard++) {
    const next = s.replace(/\[([^[\]]*)\]/, (_, body: string) => pick(v.rand, body.split("|")));
    if (next === s) break;
    s = next;
  }
  s = s.replace(/#([a-zA-Z_][\w]*)(?:\.(\w+))?#/g, (_, name: string, mod: string | undefined) => {
    const options = lookup(name, v);
    if (!options?.length) return "";
    return modify(expand(pick(v.rand, options), v, depth + 1), mod);
  });
  if (depth === 0) {
    s = s.replace(/\{(\w+)(?:\.(\w+))?\}/g, (_, key: string, mod: string | undefined) => {
      const val = v.vars[key];
      return val === undefined || val === null ? "" : modify(String(val), mod);
    });
  }
  return s;
}

/** Expand a rule by name and tidy the result into a clean sentence or two. */
export function say(rule: string, v: Voice): string {
  return tidy(expand(`#${rule}#`, v));
}

/** Clean up spacing and punctuation after all the pieces are glued together. */
export function tidy(text: string): string {
  let s = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:…])/g, "$1")
    .replace(/([,;:])(?=[^\s\d"'’)])/g, "$1 ")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/([.!?])\s*,/g, "$1")
    .replace(/\.{4,}/g, "…")
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\(\s*\)/g, "")
    .trim();
  s = s.replace(/^[,.;:\s]+/, "");
  if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s && !/[.!?…"”),:;]$/.test(s)) s += ".";
  return s;
}
