"use client";

import { createElement } from "react";
import { useTopLayer } from "./layers";

// A full-screen pop-up (a photo, a purchase, a gift, a game table...) that goes over everything
// opened before it: it takes the next place in the stack as it appears (./layers).

type Props = React.HTMLAttributes<HTMLElement> & { as?: "div" | "button"; role?: string; "aria-label"?: string; "aria-modal"?: boolean | "true" | "false"; "aria-labelledby"?: string };

export function OnTop({ as = "div", style, ...rest }: Props) {
  const z = useTopLayer();
  return createElement(as, { ...rest, style: { ...style, zIndex: z } });
}
