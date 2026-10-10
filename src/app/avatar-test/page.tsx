import type { Metadata } from "next";
import { AvatarTest } from "./avatar-test";

// A test page for 3D avatars: loads one placeholder avatar file and shows the frame rate.
// Not linked from anywhere, and kept out of search results.

export const metadata: Metadata = {
  title: "Avatar test",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AvatarTest />;
}
