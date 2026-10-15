import { LogoMark } from "@/components/logo";

// The first thing anyone sees, sent the moment they ask for the page (src/app/loading.tsx and
// src/app/play/loading.tsx), while the server gets the town ready: the name, the line under it, a
// spinner. No scripts, no pictures, so it shows in a moment even on a slow connection.
export function CityLoadingScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-[#8fc17a] via-[#6f9e5f] to-[#4a5a52] px-4 text-center" aria-busy="true">
      <div className="relative flex flex-col items-center">
        <span aria-hidden className="title-halo absolute left-1/2 top-1/2 h-28 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <span className="relative flex items-center gap-2.5">
          <LogoMark size={46} className="rounded-[12px] shadow-[0_8px_20px_rgba(0,0,0,0.35)]" />
          <span className="title-3d-sm title-glow font-display text-[46px] font-black italic leading-none tracking-tight text-white">Newtown</span>
        </span>
        <span className="title-tagline relative mt-2.5 font-display text-[15px] font-bold tracking-wide text-white">Your city. Your story. Your tribe.</span>
        <span className="relative mt-6 flex items-center gap-2 text-sm font-semibold text-white/90">
          <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Opening the city…
        </span>
      </div>
    </main>
  );
}
