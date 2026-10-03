import { Cake, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CustomerList, type CustomerListRow } from "@/components/business/customer-list";
import { ShareButton } from "@/components/ui/share-button";
import { Card, EmptyState, SectionTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireOwnedBusiness } from "@/lib/auth";
import { getMembers } from "@/lib/business";
import { appTimeZone, siteUrl } from "@/lib/env";
import { formatDate, formatMoney, formatMoneyShort, MONTHS, memberLabel, memberNo, plural } from "@/lib/format";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ params }: PageProps<"/dashboard/[bizId]/customers">) {
  const { bizId } = await params;
  const { business } = await requireOwnedBusiness(bizId);
  const members = await getMembers(bizId);

  const sharing = members.filter((m) => m.shares_details).length;
  const month = Number(new Intl.DateTimeFormat("en-GB", { timeZone: appTimeZone(), month: "numeric" }).format(new Date()));
  const birthdays = members
    .filter((m) => m.birth_month === month)
    .sort((a, b) => (a.birth_day ?? 0) - (b.birth_day ?? 0));

  const rows: CustomerListRow[] = members.map((m) => {
    const label = memberLabel(m.member_no, m.full_name);
    return {
      id: m.membership_id,
      label,
      initialsFrom: m.full_name,
      sub: `${m.full_name ? `${memberNo(m.member_no)} · ` : ""}joined ${formatDate(m.joined_at)}${m.shares_details ? "" : " · private"}`,
      visits: m.visits,
      spent: formatMoneyShort(m.total_spent, business.currency),
      spentFull: formatMoney(m.total_spent, business.currency),
      lastVisit: m.last_visit_at ? formatDate(m.last_visit_at) : null,
      shared: m.shares_details,
      invited: m.referred,
      perksReady: m.rewards_ready,
      search: [label, String(m.member_no), String(m.member_no).padStart(4, "0"), m.phone ?? "", m.email ?? ""].join(" ").toLowerCase(),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description={`${plural(members.length, "member")} · ${sharing} share their details with you`}
        actions={
          <ShareButton
            variant="primary"
            label="Add customers"
            icon={<UserPlus className="size-4" aria-hidden />}
            url={`${siteUrl()}/j/${business.slug}`}
            message={`Join ${business.name} on Spendbox for member perks:`}
            title="Add customers"
            description={`Customers join ${business.name} from your link. Share it on WhatsApp, or print your QR code for the counter.`}
          />
        }
      />

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No members yet"
          description="Share your join link and customers who join will appear here."
          action={
            <Link href={`/dashboard/${bizId}#share`} className="text-sm font-semibold text-brand-700 hover:underline">
              Get your link
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
          <CustomerList bizId={bizId} rows={rows} />
          <aside className="flex flex-col gap-3">
            <SectionTitle title={`Birthdays in ${MONTHS[month - 1]}`} />
            <Card className="p-5">
              {birthdays.length === 0 ? (
                <p className="text-sm text-muted">No birthdays this month among customers who share their details.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {birthdays.map((m) => (
                    <li key={m.membership_id}>
                      <Link href={`/dashboard/${bizId}/customers/${m.membership_id}`} className="flex items-center gap-3 hover:underline">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#FBE7EE] text-[#A3214E]">
                          <Cake className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{memberLabel(m.member_no, m.full_name)}</span>
                        <span className="text-sm text-muted">{m.birth_day} {MONTHS[month - 1].slice(0, 3)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
                Only customers who chose to share their details are shown. Customers who keep their birthday private
                still get your birthday treat automatically.
              </p>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
