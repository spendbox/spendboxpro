// One icon set for the whole game (Lucide line icons), so nothing relies on emoji.
// Icons inherit the text colour and scale with font size by default (size "1em"), so they
// stay sharp and line up with text on every screen.
import type { LucideProps } from "lucide-react";
import { createLucideIcon } from "lucide-react";

export {
  Ambulance,
  ArrowUpFromLine,
  Award,
  Bell,
  Bird,
  Bomb,
  Bot,
  Building,
  Building2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock,
  CloudRain,
  Coins,
  Construction,
  Crosshair,
  Crown,
  Drama,
  Eye,
  EyeOff,
  Fish,
  Flame,
  Flashlight,
  Footprints,
  Gem,
  Gift,
  Hammer,
  HeartPulse,
  House,
  Landmark,
  Layers,
  Lightbulb,
  Lock,
  LogOut,
  MapPin,
  Maximize2,
  Medal,
  Megaphone,
  Menu,
  MessageCircle,
  Minimize2,
  Moon,
  PartyPopper,
  Pencil,
  Play,
  Radar,
  RotateCcw,
  ScanSearch,
  Search,
  Share2,
  Shield,
  ShieldCheck,
  Siren,
  Sparkles,
  Star,
  Store,
  Sun,
  Target,
  Timer,
  ToyBrick,
  Trees,
  Trophy,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
  Ghost,
  // Menu, notifications, advertising pages
  ArrowLeft,
  ChartColumn,
  Check,
  CircleCheck,
  Compass,
  CreditCard,
  Dices,
  Drone,
  Gamepad2,
  Headphones,
  Hourglass,
  ImageIcon,
  ImageUp,
  Info,
  Pause,
  Plus,
  Rocket,
  Shirt,
  ShoppingBag,
  Ticket,
} from "lucide-react";
export type { LucideProps as IconProps } from "lucide-react";
export type { LucideIcon } from "lucide-react";

/** A hot-air balloon in the same line style as the rest (Lucide doesn't have one). */
export function HotAirBalloon({ size = "1em", strokeWidth = 2, className, ...rest }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...(rest as React.SVGProps<SVGSVGElement>)}
    >
      <path d="M12 2a7 7 0 0 0-7 7c0 3.5 3 6 5 8h4c2-2 5-4.5 5-8a7 7 0 0 0-7-7Z" />
      <path d="M12 2c-2 2-3 4.5-3 7s1 5.5 1 8" />
      <path d="M12 2c2 2 3 4.5 3 7s-1 5.5-1 8" />
      <path d="M10 17l.5 2.5M14 17l-.5 2.5" />
      <rect x="9.5" y="19.5" width="5" height="2.5" rx="0.5" />
    </svg>
  );
}

/** A whale in the same line style (Lucide doesn't have one): the biggest catches. A real Lucide icon, so it takes the same props. */
export const Whale = createLucideIcon({
  name: "whale",
  size: 24,
  node: [
    ["path", { d: "M7 9c-3 0-5 2.5-5 5.5S4 19 7 19h7c4 0 6.3-2.7 6.8-7.5", key: "body" }],
    ["path", { d: "M7 9c4 0 6 3.5 9.5 3.5 2 0 3.3-.4 4.3-1", key: "back" }],
    ["path", { d: "M20.8 11.5 19 7.5M20.8 11.5l1.7-4", key: "tail" }],
    ["path", { d: "M6 13.5h.01", key: "eye" }],
    ["path", { d: "M7 6.5V5M7 5c0-1.2.8-2 2-2.3M7 5c0-1.2-.8-2-2-2.3", key: "spout" }],
  ],
});
