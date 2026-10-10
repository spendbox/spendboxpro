/** 950 → "950", 1,100 → "1.1k", 12,400 → "12.4k", 2,100,000 → "2.1M". Small amounts keep their pennies. */
export const short = (n: number) =>
  Math.abs(n) >= 1_000
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n).replace("K", "k")
    : Number.isInteger(n)
      ? n.toLocaleString("en")
      : n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** An amount of mint with the mint sign: 50 → "₥50", 0.5 → "₥0.50", 12,400 → "₥12.4k". */
export const mint = (n: number) => `₥${short(n)}`;
