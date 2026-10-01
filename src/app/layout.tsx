import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { NavProgress } from "@/components/nav-progress";
import { siteUrl } from "@/lib/env";
import "./globals.css";

// Fonts are bundled with the app (open-source, SIL Open Font License; see ./fonts).
const body = localFont({
  src: "./fonts/dm-sans.woff2",
  variable: "--font-body",
  weight: "100 1000",
  display: "swap",
});

const display = localFont({
  src: "./fonts/bricolage-grotesque.woff2",
  variable: "--font-display-face",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Spendbox — turn customers into regulars",
    template: "%s · Spendbox",
  },
  description:
    "Spendbox helps small businesses keep their customer list, track purchases from receipts and reward customers with perks.",
};

export const viewport: Viewport = {
  themeColor: "#2a772c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
