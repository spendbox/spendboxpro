/** Only allow redirects to paths on this site (never to another website). */
export function safeNext(value: string | string[] | undefined | null) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
