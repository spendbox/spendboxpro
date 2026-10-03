import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Card } from "@/components/ui/card";
import { adminLoginConfigured, getAdmin, MIN_ADMIN_PASSWORD } from "@/lib/admin/session";
import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  if (await getAdmin()) redirect("/admin");
  const configured = adminLoginConfigured();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo />
        <Card className="flex flex-col gap-5 p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold">Admin</h1>
              <p className="text-sm text-muted">Spendbox control room</p>
            </div>
          </div>
          {configured ? (
            <AdminLoginForm />
          ) : (
            <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              The admin login isn&apos;t set up yet. In Vercel → Settings → Environment Variables, add <b>ADMIN_EMAIL</b> and{" "}
              <b>ADMIN_PASSWORD</b> (at least {MIN_ADMIN_PASSWORD} characters), then redeploy.
            </p>
          )}
        </Card>
        <p className="text-center text-sm text-muted">
          On the admin team?{" "}
          <Link href="/login?next=/admin" className="font-semibold text-brand-700 underline underline-offset-2">
            Log in with your Spendbox phone number
          </Link>
        </p>
      </div>
    </div>
  );
}
