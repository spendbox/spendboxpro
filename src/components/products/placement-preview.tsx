import { cn } from "@/lib/cn";
import type { Placement } from "@/lib/product-categories";

// A little picture of how a category looks in the 3D shop: framed on the
// wall under picture lights, leaning on walnut-and-oak shelves, or standing
// on a marble table. It uses the category's own product photos when it has
// some, and soft colour tiles when it doesn't.

const TILES = ["linear-gradient(135deg,#f3d9c4,#d9a27b)", "linear-gradient(135deg,#d7e6d2,#8fb487)", "linear-gradient(135deg,#dde3f1,#97a6cf)", "linear-gradient(135deg,#f2e2b8,#cfa64e)"];

function Photo({ src, i, className }: { src?: string; i: number; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- small thumbnails from storage
    <img src={src} alt="" className={cn("size-full object-cover", className)} loading="lazy" />
  ) : (
    <span className={cn("block size-full", className)} style={{ background: TILES[i % TILES.length] }} />
  );
}

/** A walnut frame with an ivory mat round the photo. */
function Frame({ src, i, className }: { src?: string; i: number; className?: string }) {
  return (
    <span className={cn("block rounded-[2px] bg-[#56392a] p-[3px] shadow-[0_2px_4px_rgba(0,0,0,0.25)]", className)}>
      <span className="flex size-full flex-col bg-[#f3eee5] p-[3px] pb-[6px]">
        <span className="block min-h-0 flex-1 overflow-hidden">
          <Photo src={src} i={i} />
        </span>
      </span>
    </span>
  );
}

export function PlacementPreview({ placement, images = [], accent, className }: { placement: Placement; images?: string[]; accent?: string; className?: string }) {
  // Shelves and tables in the shop's colour (a deep shade of it), or walnut and green.
  const carcass = accent ? `color-mix(in oklab, ${accent} 65%, #141414)` : "#56392a";
  const plinth = accent ? `color-mix(in oklab, ${accent} 45%, #23211f)` : "#2f4a3c";
  const img = (i: number) => images[i % Math.max(1, images.length)];
  return (
    <span aria-hidden className={cn("relative block aspect-[16/10] w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#efe9e0] to-[#e4ddd2]", className)}>
      {/* Panelled lower wall and floor */}
      <span className="absolute inset-x-0 bottom-[18%] h-[22%] border-t-2 border-[#d9d0c3] bg-[#e8e1d6]" />
      <span className="absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-b from-[#c9a27a] to-[#b48b62]" />

      {placement === "wall" && (
        <span className="absolute inset-x-0 top-[12%] flex justify-center gap-[7%]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex w-[22%] flex-col items-center">
              {/* Picture light */}
              <span className="mb-[6%] h-[3px] w-[60%] rounded-full bg-gradient-to-r from-[#b8893f] via-[#e4c27a] to-[#b8893f]" />
              <Frame src={img(i)} i={i} className="aspect-[4/5] w-full" />
            </span>
          ))}
        </span>
      )}

      {placement === "shelf" && (
        <span className="absolute top-[6%] bottom-[18%] left-1/2 flex w-[62%] -translate-x-1/2 flex-col justify-end rounded-t-[3px] border-x-[5px] border-t-[5px] bg-[#f1ebe1] px-[4%]" style={{ borderColor: carcass }}>
          {[0, 1].map((row) => (
            <span key={row} className="flex flex-col">
              <span className="flex justify-center gap-[6%] px-[2%]">
                {[0, 1, 2, 3].map((c) => (
                  <Frame key={c} src={img(row * 4 + c)} i={row * 4 + c} className="aspect-[4/5] w-[15%] origin-bottom [transform:perspective(60px)_rotateX(6deg)]" />
                ))}
              </span>
              <span className="mb-[9%] h-[5px] rounded-[1px] border-b-2 border-[#c9a25a] bg-[#c6a279]" />
            </span>
          ))}
        </span>
      )}

      {placement === "table" && (
        <>
          <span className="absolute bottom-[30%] left-1/2 flex w-[70%] -translate-x-1/2 justify-center gap-[6%]">
            {[0, 1, 2].map((i) => (
              <Frame key={i} src={img(i)} i={i} className="aspect-[4/5] w-[20%] origin-bottom [transform:perspective(80px)_rotateX(8deg)]" />
            ))}
          </span>
          {/* Marble top with a brass edge, on a deep plinth */}
          <span className="absolute bottom-[25%] left-1/2 h-[6%] w-[78%] -translate-x-1/2 rounded-[2px] border-b-2 border-[#c9a25a] bg-gradient-to-b from-white to-[#e9e6e1]" />
          <span className="absolute bottom-[6%] left-1/2 h-[19%] w-[70%] -translate-x-1/2" style={{ background: plinth }} />
        </>
      )}
    </span>
  );
}
