"use client";

import dynamic from "next/dynamic";

// The game's screens only ever draw in the browser (they open after a tap), so the lab does too.
export const CopsLabLoader = dynamic(() => import("./cops-lab").then((m) => m.CopsLab), { ssr: false });
