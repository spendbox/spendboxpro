// Every turn game (boards and cards): its rules and how it draws itself, loaded when opened.

import type { ComponentType } from "react";
import type { TurnRules, TurnViewProps } from "../types";

// (Each module's state and move types differ; the table treats them as opaque.)
/* eslint-disable @typescript-eslint/no-explicit-any */
export type TurnModule = { rules: TurnRules<any, any>; View: ComponentType<TurnViewProps<any, any>> };

export const TURN_GAMES: Record<string, () => Promise<TurnModule>> = {
  ludo: () => import("./ludo"),
  snakes: () => import("./snakes"),
  draughts: () => import("./draughts"),
  chess: () => import("./chess"),
  oware: () => import("./oware"),
  whot: () => import("./whot"),
  eights: () => import("./eights"),
  dominoes: () => import("./dominoes"),
  backgammon: () => import("./backgammon"),
  tycoon: () => import("./tycoon"),
  connect4: () => import("./connect4"),
  battleships: () => import("./battleships"),
  gofish: () => import("./gofish"),
  ttt: () => import("./ttt"),
};
