import { twMerge } from "tailwind-merge";

/** Joins class names, skipping empty values. Later classes win over earlier conflicting ones. */
export function cn(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(" "));
}
