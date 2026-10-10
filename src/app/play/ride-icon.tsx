import { Bus, CarTaxiFront, FerrisWheel, Helicopter, Sailboat, TrainFront, WavesLadder } from "lucide-react";
import { HotAirBalloon } from "@/components/icons";

/** Everything you can ride in the city. */
export type RideKindName = "balloon" | "train" | "bus" | "car" | "boat" | "ferris" | "slide" | "heli";

/** How each ride looks in menus, and how long a trip lasts (null: until you get off). */
export const RIDE_INFO: Record<RideKindName, { label: string; plural: string; colour: string; minutes: number | null; blurb: string }> = {
  balloon: { label: "Hot-air balloon", plural: "Hot-air balloons", colour: "#e64980", minutes: 10, blurb: "Float over the whole city for 10 minutes." },
  train: { label: "Train", plural: "Trains", colour: "#2f6fd1", minutes: 8, blurb: "Sit by the window as it glides along the line." },
  bus: { label: "Bus", plural: "Buses", colour: "#f08c00", minutes: 8, blurb: "Front seat on the top deck, round the city." },
  car: { label: "Car", plural: "Cars", colour: "#12a37a", minutes: 6, blurb: "It drives itself round the city: just sit back and look around." },
  boat: { label: "Boat", plural: "Boats", colour: "#1c7ed6", minutes: 6, blurb: "A gentle cruise on the water." },
  ferris: { label: "Ferris wheel", plural: "Ferris wheels", colour: "#7048e8", minutes: 3, blurb: "A cabin for eight, slowly up over the rooftops." },
  slide: { label: "Water slide", plural: "Water slides", colour: "#15aabf", minutes: null, blurb: "Whoosh down, twist, splash. Over in seconds." },
  heli: { label: "Helicopter", plural: "Helicopters", colour: "#e8590c", minutes: 6, blurb: "A sightseeing flight over the town's landmarks, high above the towers." },
};

type IconLike = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean }>;
/** Each ride's line icon. */
export const RIDE_ICONS: Record<RideKindName, IconLike> = {
  balloon: HotAirBalloon,
  train: TrainFront,
  bus: Bus,
  car: CarTaxiFront,
  boat: Sailboat,
  ferris: FerrisWheel,
  slide: WavesLadder,
  heli: Helicopter,
};

/** The icon for a ride (a hot-air balloon if we don't know which). */
export function RideIcon({ kind, className, style }: { kind?: RideKindName | null; className?: string; style?: React.CSSProperties }) {
  const Icon = RIDE_ICONS[kind ?? "balloon"] ?? HotAirBalloon;
  return <Icon className={className} style={style} aria-hidden />;
}
