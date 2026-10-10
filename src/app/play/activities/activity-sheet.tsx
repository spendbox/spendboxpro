"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { RoomMember } from "../rooms";
import { Sheet } from "../sheet";
import { Archery } from "./archery";
import { Cards } from "./cards";
import { DanceFloor } from "./dance";
import { Darts } from "./darts";
import { DuelLobby } from "./duels";
import { GAME_TITLE, GAMES_FOR, type ActivityItem, type GameId } from "./games";
import { Heist } from "./heist";
import type { ActivityPlayer } from "./hub";
import { Jukebox } from "./jukebox";
import { Karaoke } from "./karaoke";
import { Order } from "./order";
import { PhotoSpot } from "./photo";
import { Piano } from "./piano";
import { Pool } from "./pool";
import { Reflex } from "./reflex";
import { SeatCard, type Seating } from "./seat";
import { Slots } from "./slots";
import { Stairs } from "./stairs";
import { Trivia } from "./trivia";
import { ActivityStyles, type GameProps } from "./ui";

/**
 * Opens the right mini game (or seat, menu, jukebox…) for something tapped inside a place.
 * Things with several games (a card table: Higher or Lower, Rock-Paper-Scissors, dice) get
 * tabs. Pass `seating` (the rooms hook: seats, mySeat, seatEndsAt, sit, stand) so seats work,
 * and `onUseStairs` to let the stairs also take people to another floor.
 */
export function ActivitySheet({
  item,
  roomId,
  me,
  members,
  roundId,
  onClose,
  seating,
  onUseStairs,
}: {
  item: ActivityItem;
  roomId: string;
  me: ActivityPlayer | null;
  members: RoomMember[];
  roundId: number | null;
  onClose: () => void;
  seating?: Seating;
  onUseStairs?: () => void;
}) {
  const games = GAMES_FOR[item.kind] ?? [];
  const [game, setGame] = useState<GameId>(games[0] ?? "seat");
  const props: GameProps = { roundId, roomId, me, members, label: item.label, onClose };

  return (
    <Sheet onClose={onClose} wide>
      <ActivityStyles />
      {games.length > 1 && (
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {games.map((g) => (
            <button
              key={g}
              onClick={() => setGame(g)}
              className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold", g === game ? "bg-ink text-white" : "bg-panel-2 text-muted")}
            >
              {GAME_TITLE[g]}
            </button>
          ))}
        </div>
      )}
      <Game key={game} game={game} props={props} item={item} seating={seating} onUseStairs={onUseStairs} />
    </Sheet>
  );
}

function Game({ game, props, item, seating, onUseStairs }: { game: GameId; props: GameProps; item: ActivityItem; seating?: Seating; onUseStairs?: () => void }) {
  switch (game) {
    case "seat":
      return <SeatCard {...props} seatId={item.id} seating={seating} />;
    case "darts":
      return <Darts {...props} />;
    case "archery":
      return <Archery {...props} />;
    case "reflex":
      return <Reflex {...props} />;
    case "trivia":
      return <Trivia {...props} />;
    case "pool":
      return <Pool {...props} />;
    case "cards":
      return <Cards {...props} />;
    case "rps":
      return <DuelLobby {...props} game="rps" />;
    case "dice":
      return <DuelLobby {...props} game="dice" />;
    case "dance":
      return <DanceFloor {...props} />;
    case "dj":
      return <Jukebox {...props} dj />;
    case "jukebox":
      return <Jukebox {...props} />;
    case "bar":
      return <Order {...props} where="bar" />;
    case "menu":
      return <Order {...props} where="restaurant" />;
    case "stairs":
      return <Stairs {...props} onUseStairs={onUseStairs} />;
    case "window":
      return <PhotoSpot {...props} />;
    case "photo":
      return <PhotoSpot {...props} booth />;
    case "piano":
      return <Piano {...props} />;
    case "karaoke":
      return <Karaoke {...props} />;
    case "slots":
      return <Slots {...props} />;
    case "heist":
      return <Heist {...props} />;
  }
}
