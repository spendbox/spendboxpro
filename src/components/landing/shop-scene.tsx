import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

// A little 3D shop, drawn with CSS: a hall with framed products on the walls,
// a shelf of small frames and a table at the far end, slowly walked into.
// Pure markup (no WebGL), so it loads instantly on the front page.

const W = 340; // hall width (px)
const H = 220; // wall height
const D = 560; // hall depth

const PHOTOS = [
  "linear-gradient(160deg,#f6c6a8,#d9784f)",
  "linear-gradient(160deg,#cfe3c4,#5f9a58)",
  "linear-gradient(160deg,#d9dff4,#6a7cc4)",
  "linear-gradient(160deg,#f5e2a6,#c8962c)",
  "linear-gradient(160deg,#f2c9d7,#b44f78)",
  "linear-gradient(160deg,#c9e6ec,#3f8fa2)",
];

/** A walnut frame with an ivory mat, a photo and a little caption. */
function Frame({ i, w, h, style }: { i: number; w: number; h: number; style: CSSProperties }) {
  return (
    <span className="absolute flex flex-col bg-[#56392a] p-[3px] shadow-[0_3px_8px_rgba(0,0,0,0.25)]" style={{ width: w, height: h, ...style }}>
      <span className="flex size-full flex-col bg-[#f3eee5] p-[4px] pb-[3px]">
        <span className="min-h-0 flex-1" style={{ background: PHOTOS[i % PHOTOS.length] }} />
        <span className="mx-auto mt-[3px] h-[3px] w-3/5 rounded-full bg-[#1c211e]/70" />
        <span className="mx-auto mt-[2px] h-[2px] w-2/5 rounded-full bg-[#2A772C]/80" />
      </span>
    </span>
  );
}

function Plane({ className, style, children }: { className?: string; style: CSSProperties; children?: ReactNode }) {
  return (
    <div className={cn("absolute top-0 left-0", className)} style={{ transformStyle: "preserve-3d", ...style }}>
      {children}
    </div>
  );
}

export function ShopScene({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative mx-auto overflow-hidden rounded-[2rem] bg-[#e9e2d8] shadow-[0_40px_80px_-30px_rgb(20_57_22/0.45)] ring-1 ring-black/5", className)} style={{ width: W, height: 260 }}>
      <div className="absolute inset-0" style={{ perspective: 420, perspectiveOrigin: "50% 42%" }}>
        <div className="shop-walk absolute top-[20px] left-0" style={{ width: W, height: H, transformStyle: "preserve-3d" }}>
          {/* Floor: warm oak boards */}
          <Plane
            style={{
              width: W,
              height: D,
              top: H,
              transformOrigin: "top center",
              transform: "rotateX(90deg)",
              background: "repeating-linear-gradient(90deg,#c9a27a 0 40px,#bf9670 40px 41px,#cda882 41px 84px,#bf9670 84px 85px)",
            }}
          />
          {/* Ceiling with two light strips */}
          <Plane style={{ width: W, height: D, transformOrigin: "top center", transform: "rotateX(-90deg)", background: "#efe9e0" }}>
            <span className="absolute top-0 left-[70px] h-full w-[8px] bg-[#ffe9c2] shadow-[0_0_14px_#ffd99a]" />
            <span className="absolute top-0 right-[70px] h-full w-[8px] bg-[#ffe9c2] shadow-[0_0_14px_#ffd99a]" />
          </Plane>
          {/* Left wall: a row of framed products with picture lights */}
          <Plane style={{ width: D, height: H, transformOrigin: "left center", transform: "rotateY(90deg)", background: "linear-gradient(#f4eee6,#ece5da)" }}>
            <span className="absolute inset-x-0 bottom-0 h-[70px] border-t-2 border-[#dcd3c6] bg-[#e7e0d4]" />
            {[0, 1, 2, 3].map((n) => (
              <span key={n}>
                <span className="absolute h-[4px] w-[34px] rounded-full bg-gradient-to-r from-[#b8893f] via-[#e4c27a] to-[#b8893f]" style={{ right: 60 + n * 120 + 15, top: 38 }} />
                <Frame i={n} w={64} h={84} style={{ right: 60 + n * 120, top: 48 }} />
              </span>
            ))}
          </Plane>
          {/* Right wall: a shelving unit of small frames, then a wide frame */}
          <Plane style={{ width: D, height: H, left: W, transformOrigin: "left center", transform: "rotateY(90deg)", background: "linear-gradient(#f4eee6,#ece5da)" }}>
            <span className="absolute inset-x-0 bottom-0 h-[70px] border-t-2 border-[#dcd3c6] bg-[#e7e0d4]" />
            <span className="absolute flex flex-col justify-end gap-[14px] border-x-[6px] border-t-[6px] border-[#244b2c] bg-[#f1ebe1] px-3 pb-3" style={{ left: 70, top: 40, width: 200, height: 180 }}>
              {[0, 1].map((row) => (
                <span key={row} className="flex flex-col">
                  <span className="relative flex h-[46px] justify-around">
                    {[0, 1, 2, 3].map((c) => (
                      <Frame key={c} i={row * 4 + c + 2} w={30} h={40} style={{ position: "relative" }} />
                    ))}
                  </span>
                  <span className="h-[6px] border-b-2 border-[#c9a25a] bg-[#c6a279]" />
                </span>
              ))}
            </span>
            <Frame i={5} w={110} h={76} style={{ left: 330, top: 54 }} />
          </Plane>
          {/* Back wall: the shop's name over a console with flowers */}
          <Plane style={{ width: W, height: H, transform: `translateZ(-${D}px)`, background: "linear-gradient(#f2ece3,#e9e2d7)" }}>
            <span className="absolute top-[34px] left-1/2 -translate-x-1/2 font-display text-[22px] font-extrabold tracking-tight text-[#1d2320]">Your shop</span>
            <span className="absolute top-[68px] left-1/2 h-[3px] w-[30px] -translate-x-1/2 rounded-full bg-[#2A772C]" />
            <span className="absolute top-[100px] left-1/2 h-[62px] w-[44px] -translate-x-1/2 rounded-t-full border-[3px] border-[#c9a25a] bg-gradient-to-br from-[#eef2f3] to-[#aab6ba]" />
            <span className="absolute bottom-[38px] left-1/2 h-[6px] w-[110px] -translate-x-1/2 bg-[#56392a]" />
            <span className="absolute bottom-[44px] left-1/2 size-[18px] -translate-x-1/2 rounded-full bg-[#f2c4c0] shadow-[8px_-4px_0_#f6e7c8,-8px_-3px_0_#fff]" />
          </Plane>
        </div>
      </div>
      <span className="absolute right-3 bottom-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-ink shadow-card">3D</span>
    </div>
  );
}
