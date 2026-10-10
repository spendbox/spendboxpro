"use client";

import { defaultAvatar } from "@/lib/avatar";
import { AvatarStudio } from "../play/avatar-studio";

/** The avatar studio on its own, for checking it without signing in (saving needs a signed-in player). */
export function StudioPreview() {
  return <AvatarStudio initial={defaultAvatar("studio preview")} onClose={() => {}} onSaved={() => {}} />;
}
