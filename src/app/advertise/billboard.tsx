/** A preview of an ad as a billboard on a city street (used on /advertise and /advertiser). */
export function Billboard({ image, brand, headline }: { image: string | null; brand: string; headline: string }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-sky-300 via-sky-100 to-[#cfe3c4] px-4 pt-5">
      <div className="mx-auto max-w-md">
        <div className="rounded-lg border-4 border-slate-700 bg-slate-800 p-1 shadow-xl">
          <div className="relative aspect-[2/1] overflow-hidden rounded bg-slate-600">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local preview, or the advertiser's own picture
              <img src={image} alt="Your billboard" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-slate-300">
                <span className="text-2xl">🖼️</span>
                Your picture shows here
              </div>
            )}
            {(brand || headline) && (
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1.5 text-white">
                <div className="truncate text-sm font-bold">{headline || " "}</div>
                {brand && <div className="truncate text-[11px] opacity-80">{brand}</div>}
              </div>
            )}
          </div>
        </div>
        <div className="mx-auto flex w-2/3 justify-between">
          <div className="h-10 w-2 bg-slate-700" />
          <div className="h-10 w-2 bg-slate-700" />
        </div>
      </div>
    </div>
  );
}
