/** 950 → "950", 12,400 → "12.4k", 2,100,000 → "2.1M". Small amounts keep their pennies. */
export const short = (n: number) =>
  Math.abs(n) >= 10_000
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : Number.isInteger(n)
      ? n.toLocaleString("en")
      : n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
