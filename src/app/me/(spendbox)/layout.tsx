import { SubTabs } from "@/components/shell/sub-tabs";
import { requireUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/customer";

/** My Spendbox: a hello, then Explore · My box · Ask. (The page title is for screen readers only.) */
export default async function MySpendboxLayout({ children }: LayoutProps<"/me">) {
  const user = await requireUser("/me");
  const profile = await getMyProfile(user.id);
  const firstName = profile?.full_name?.split(/\s+/)[0];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header>
        <h1 className="sr-only">My Spendbox</h1>
        <p className="font-display text-lg font-bold tracking-tight text-ink-2">{firstName ? `Hi ${firstName}` : "Hi there"}</p>
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
