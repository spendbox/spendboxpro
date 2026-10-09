import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { TapFeedback } from "@/components/tap-feedback";
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
  title: { default: "Newtown", template: "%s · Newtown" },
  description: "Newtown is a living 3D city game. Light up as a ghost or challenge the ghosts, ride, play and chat, and earn mint. Play at newtown.world.",
  applicationName: "Newtown",
  openGraph: { siteName: "Newtown", type: "website", url: "/" },
};

export const viewport: Viewport = {
  themeColor: "#eef2f6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: the on-screen keyboard shrinks the page, so the chat box stays above it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <TapFeedback />
      </body>
    </html>
  );
}
