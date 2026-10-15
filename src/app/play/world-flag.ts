// The game is a life on the real map now: everyone plays in Lagos (the hourly made-up towns with
// their countdown are switched off). Only the region to show is decided here (not by loading the
// map data, which would put it in the first download).

export function worldPreview(): string | null {
  return "lagos";
}
