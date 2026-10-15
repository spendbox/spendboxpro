import { CityLoadingScreen } from "@/components/city-loading";

// Shown at once while the town is got ready on the server (streamed: the page swaps in when it is).
export default function Loading() {
  return <CityLoadingScreen />;
}
