import "server-only";
import { createHash } from "node:crypto";

// Is a password in a known data leak? Asks Have I Been Pwned's free Pwned Passwords service the
// private way: only the first 5 characters of the password's SHA-1 leave the server, never the
// password, and we look for the rest in the list that comes back. If the service doesn't answer,
// the password isn't held up.

export async function timesLeaked(password: string): Promise<number> {
  const sha = createHash("sha1").update(password).digest("hex").toUpperCase();
  const head = sha.slice(0, 5);
  const tail = sha.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${head}`, {
      headers: { "Add-Padding": "true", "User-Agent": "Newtown" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return 0;
    for (const line of (await res.text()).split("\n")) {
      const [h, n] = line.trim().split(":");
      if (h === tail) return Number(n) || 0;
    }
  } catch {
    // Not answering: carry on.
  }
  return 0;
}
