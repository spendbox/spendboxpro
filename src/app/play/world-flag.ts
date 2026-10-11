// The game is a life on the real map now: everyone plays in Lagos (the hourly made-up towns with
// their countdown are switched off). Only the region to show is decided here.

import { REGIONS } from "@/lib/world";

export function worldPreview(): string | null {
  return REGIONS.lagos ? "lagos" : null;
}
