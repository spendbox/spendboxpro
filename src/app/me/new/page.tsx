import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getMyMemberships, getMyProfile, getMyRequests } from "@/lib/customer";
import { Composer, type ComposerDefaults } from "./composer";

export const metadata: Metadata = { title: "New request" };

export default async function NewRequestPage({ searchParams }: PageProps<"/me/new">) {
  const { from } = await searchParams;
  const user = await requireUser("/me/new");
  const [profile, memberships, requests] = await Promise.all([getMyProfile(user.id), getMyMemberships(user.id), getMyRequests(user.id)]);
  const source = typeof from === "string" ? requests.find((r) => r.id === from) : undefined;
  const defaults: ComposerDefaults = source
    ? {
        body: source.body,
        category: source.category,
        area: source.area,
        budgetMin: source.budget_min,
        budgetMax: source.budget_max,
        images: source.images,
        whatsapp: source.contact_whatsapp,
        call: source.contact_call,
        email: source.contact_email,
        repostOf: source.id,
      }
    : { body: "", category: null, area: null, budgetMin: null, budgetMax: null, images: [], whatsapp: true, call: false, email: false, repostOf: null };

  const names = memberships.map((m) => m.business.name);
  const audience =
    names.length === 0
      ? "Join a business first: requests go to the businesses you've joined."
      : `Seen for 24 hours by ${names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`}${
          names.length ? ", and their partners" : ""
        }.`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        back={{ href: "/me", label: "My Spendbox" }}
        title={source ? "Post it again" : "New request"}
        description="Say what you need and your budget. Plugs who can help will reach out."
      />
      <Composer defaults={defaults} phone={profile?.phone ?? null} email={profile?.email ?? null} audience={audience} />
    </div>
  );
}
