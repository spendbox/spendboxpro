import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-3xl font-bold">Nothing hiding here</h1>
      <Link href="/" className="text-gold underline">
        Back home
      </Link>
    </main>
  );
}
