import { SubTabs } from "@/components/shell/sub-tabs";
import { Checklist } from "@/components/ui/checklist";
import { requireUser } from "@/lib/auth";
import { getMyProfile } from "@/lib/customer";
import { createClient } from "@/lib/supabase/server";
import { BirthdayStep } from "./birthday-step";

/** My Spendbox: a hello, the "Get started" steps until they're done, then Explore · My box · Ask. (The page title is for screen readers only.) */
export default async function MySpendboxLayout({ children }: LayoutProps<"/me">) {
  const user = await requireUser("/me");
  const supabase = await createClient();
  const [profile, { count: plugs }] = await Promise.all([
    getMyProfile(user.id),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("customer_id", user.id),
  ]);
  const birthday = { label: "Add your birthday", note: "For birthday treats from your plugs" };
  const firstName = profile?.full_name?.split(/\s+/)[0];
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header>
        <h1 className="sr-only">My Spendbox</h1>
        <p className="font-display text-lg font-bold tracking-tight text-ink-2">{firstName ? `Hi ${firstName}` : "Hi there"}</p>
      </header>
      <Checklist
        title="Get started"
        steps={[
          { done: (plugs ?? 0) > 0, label: "Add a plug", note: "Join a business you buy from, or invite one", href: "/me/plugs" },
          { done: Boolean(profile?.birth_month), ...birthday, action: <BirthdayStep profile={profile} {...birthday} /> },
        ]}
      />
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
