import { SubTabs } from "@/components/shell/sub-tabs";
import { requireUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/customer";

/** My Spendbox: a hello, then Explore · My box · Ask. */
export default async function MySpendboxLayout({ children }: LayoutProps<"/me">) {
  const user = await requireUser("/me");
  const profile = await getMyProfile(user.id);
  const firstName = profile?.full_name?.split(/\s+/)[0];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header>
        <p className="text-sm font-semibold text-muted">{firstName ? `Hi ${firstName}` : "Hi there"}</p>
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">My Spendbox</h1>
      </header>
      <SubTabs
        label="My Spendbox"
        tabs={[
          { href: "/me", label: "Explore" },
          { href: "/me/box", label: "My box" },
          { href: "/me/ask", label: "Ask" },
        ]}
      />
      {children}
    </div>
  );
}
