// Line icons for the four sports (Lucide style, so they size and colour like the rest).

import { BicepsFlexed, createLucideIcon, HandFist, type LucideIcon } from "lucide-react";
import type { Sport } from "./types";

/** A football (soccer ball). */
export const FootballIcon = createLucideIcon({
  name: "sports-football",
  size: 24,
  node: [
    ["circle", { cx: "12", cy: "12", r: "10", key: "ball" }],
    ["path", { d: "m12 7.5 4.3 3.1-1.6 5h-5.4l-1.6-5z", key: "patch" }],
    ["path", { d: "M12 7.5V2.2M16.3 10.6l5-1.6M14.7 15.6l3 4.3M9.3 15.6l-3 4.3M7.7 10.6l-5-1.6", key: "seams" }],
  ],
});

/** A basketball. */
export const BasketballIcon = createLucideIcon({
  name: "sports-basketball",
  size: 24,
  node: [
    ["circle", { cx: "12", cy: "12", r: "10", key: "ball" }],
    ["path", { d: "M12 2v20M2 12h20", key: "cross" }],
    ["path", { d: "M5.6 4.3C8 6.4 9.4 9.1 9.4 12s-1.4 5.6-3.8 7.7M18.4 4.3C16 6.4 14.6 9.1 14.6 12s1.4 5.6 3.8 7.7", key: "seams" }],
  ],
});

export const SPORT_ICON: Record<Sport, LucideIcon> = {
  football: FootballIcon,
  basketball: BasketballIcon,
  boxing: HandFist,
  wrestling: BicepsFlexed,
};
