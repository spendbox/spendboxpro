import { QrCode as QrCodeIcon } from "lucide-react";
import { SubTabs } from "@/components/shell/sub-tabs";
import { ShareLinkBar } from "@/components/ui/share-actions";
import { requireOwnedBusiness } from "@/lib/auth";
import { getPerks, getRequests } from "@/lib/business";
import { siteUrl } from "@/lib/env";

/** The business home: name, the three tabs, and the join link on every tab. */
export default async function BusinessHomeLayout({ children, params }: LayoutProps<"/dashboard/[bizId]">) {
  const { bizId } = await params;
  const [{ business }, perks, requests] = await Promise.all([requireOwnedBusiness(bizId), getPerks(bizId), getRequests(bizId)]);
  const base = `/dashboard/${bizId}`;
  // The 3D shop link: people walk in, look around and join from there.
  const joinUrl = `${siteUrl()}/s/${business.slug}`;
  const welcomePerk = perks.find((p) => p.kind === "welcome" && p.is_active);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-sm font-semibold text-muted">{business.categories?.length ? business.categories.join(", ") : (business.category ?? "Your business")}</p>
        <h1 className="font-display text-[30px] leading-tight font-bold tracking-tight sm:text-4xl">{business.name}</h1>
      </header>
      <SubTabs
        label="Home"
        tabs={[
          { href: base, label: "Products & services" },
          { href: `${base}/requests`, label: "Requests", count: requests.length },
          { href: `${base}/stats`, label: "Stats" },
        ]}
      />
      <ShareLinkBar
        url={joinUrl}
        message={welcomePerk ? `Walk into ${business.name}'s 3D shop on Spendbox, and join to get ${welcomePerk.title.toLowerCase()}:` : `Walk into ${business.name}'s 3D shop on Spendbox. See what's new and tell us what you need:`}
        extra={
          <a href={`${base}/qr`} aria-label="Download QR code" title="Download QR code" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-black/5">
            <QrCodeIcon className="size-4" aria-hidden />
          </a>
        }
      />
      {children}
    </div>
  );
}
