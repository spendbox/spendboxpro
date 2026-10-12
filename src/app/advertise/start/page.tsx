import { redirect } from "next/navigation";

/**
 * Advertising is set up on the map itself now (src/app/play/life/advertise-panel.tsx): the city
 * opens with the advertising panel, on the building asked for if there is one.
 */
export default async function AdStartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const building = (Array.isArray(sp.building) ? sp.building[0] : sp.building) ?? "";
  redirect(`/?advertise=1${/^[a-z0-9-]+:-?\d+,-?\d+$/.test(building) ? `&building=${encodeURIComponent(building)}` : ""}`);
}
