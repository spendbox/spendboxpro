import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div>
        <h1 className="font-display text-3xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-muted">The link may be mistyped, or the business may have removed it.</p>
      </div>
      <ButtonLink href="/">Go to the home page</ButtonLink>
    </div>
  );
}
