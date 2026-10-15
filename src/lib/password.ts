// Password rules, the same on the phone (the strength meter as you type) and on the server (the
// final say). A password has to be long enough, not a well-known one, not your email or name, and
// strong enough to score 2 of 4; the server also checks it isn't in a known data leak
// (src/lib/pwned.ts). No imports, so it runs anywhere.

export const PASSWORD_MIN = 8;
/** Supabase keeps passwords with bcrypt, which only reads the first 72 bytes. */
export const PASSWORD_MAX = 72;

/** Passwords everyone tries first (and the lazy ones lists of leaks are full of). */
const COMMON = new Set(
  (
    "password password1 password12 password123 passw0rd p@ssw0rd p@ssword 12345678 123456789 1234567890 " +
    "12345678910 87654321 11111111 00000000 qwertyuiop qwerty123 qwerty12 1q2w3e4r 1q2w3e4r5t 1qaz2wsx " +
    "zaq12wsx asdfghjkl asdf1234 iloveyou iloveyou1 sunshine princess football baseball welcome welcome1 " +
    "letmein1 monkey123 dragon12 superman batman123 trustno1 abc12345 abcd1234 abcdefgh aa123456 " +
    "computer internet starwars whatever master123 michael1 jordan23 shadow12 freedom1 football1 " +
    "chelsea1 arsenal1 liverpool manchester naija123 nigeria1 nigeria123 lagos123 jesus123 godisgood " +
    "blessing blessed1 newtown1 newtown123 changeme secret12 admin123 administrator letmein123 " +
    "q1w2e3r4 q1w2e3r4t5 987654321 123123123 696969696 qazwsxedc 1234qwer qwer1234 asdfasdf zxcvbnm1"
  ).split(" "),
);

/** Runs of the keyboard or the alphabet, which add almost nothing. */
const RUNS = ["abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm", "01234567890", "09876543210"];

function hasRun(pw: string, n = 4) {
  const s = pw.toLowerCase();
  for (const r of RUNS) for (let i = 0; i + n <= r.length; i++) if (s.includes(r.slice(i, i + n))) return true;
  return false;
}

/**
 * How strong, 0 to 4: 0 too weak to use, 1 weak, 2 fair (just enough), 3 strong, 4 very strong.
 * Worked out from how many guesses it would take (length, the kinds of characters), with
 * repeats, keyboard runs and well-known words taken off.
 */
export function passwordScore(pw: string, about: { email?: string; name?: string } = {}) {
  if (!pw || pw.length < PASSWORD_MIN) return 0;
  const low = pw.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(pw)) return 0;
  const local = (about.email ?? "").toLowerCase().split("@")[0];
  if (local.length >= 4 && low.includes(local)) return 0;
  const name = (about.name ?? "").toLowerCase();
  if (name.length >= 4 && low.includes(name)) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33;
  // Characters that repeat count once.
  const unique = new Set(pw).size;
  let bits = Math.log2(Math.max(pool, 2)) * Math.min(pw.length, unique + (pw.length - unique) / 3);
  if (hasRun(pw)) bits -= 12;
  // A well-known word or password with a bit added ("Password1!") is still easy.
  if ([...COMMON].some((c) => c.length >= 6 && low.includes(c))) bits -= 20;
  // A word and a year or a few digits ("Lagos2024"), or "ilove..." anything.
  if (/^[A-Za-z]+\d{1,4}[^A-Za-z0-9]?$/.test(pw)) bits -= 14;
  if (/^i ?love/i.test(pw)) bits -= 10;
  if (bits < 40) return 1;
  if (bits < 50) return 2;
  if (bits < 70) return 3;
  return 4;
}

/** What's wrong with a password, said simply, or null when it will do. */
export function passwordProblem(pw: string, about: { email?: string; name?: string } = {}): string | null {
  if (pw.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters, please.`;
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX) return `That's too long: ${PASSWORD_MAX} characters at most.`;
  if (/^\s|\s$/.test(pw)) return "No spaces at the start or end, please.";
  const low = pw.toLowerCase();
  if (COMMON.has(low)) return "That's one of the first passwords anyone would try. Pick another.";
  const local = (about.email ?? "").toLowerCase().split("@")[0];
  if (local.length >= 4 && low.includes(local)) return "Don't use your email in your password.";
  const name = (about.name ?? "").toLowerCase();
  if (name.length >= 4 && low.includes(name)) return "Don't use your name in your password.";
  if (passwordScore(pw, about) < 2) return "Too easy to guess. Make it longer, or mix in capitals, numbers and symbols.";
  return null;
}

/** What the meter says at each score, with a little hype at the top. */
export const STRENGTH = [
  { label: "Too weak", emoji: "😬", color: "#e03131" },
  { label: "Weak", emoji: "😐", color: "#f08c00" },
  { label: "Good enough", emoji: "🙂", color: "#d4a017" },
  { label: "Strong!", emoji: "💪", color: "#2f9e44" },
  { label: "Unbreakable!", emoji: "🔥", color: "#7048e8" },
] as const;
