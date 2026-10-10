// All 100 minigames (docs/MINIGAMES.md). Each names an engine (./engines, ./turns) and its
// settings, the kinds of places it belongs to (so a bank offers heist games and a gym offers
// boxing pads), and bronze / silver / gold scores (mint rewards, heist pass marks).
//
// Plain data (no React), so the server can check game ids and grades too.

import type { Category, Cfg, MiniGameDef } from "./types";

type Extra = Partial<Pick<MiniGameDef, "lowerWins" | "seats" | "hidden" | "legacy">>;

function S(n: number, id: string, title: string, cat: Category, engine: string, cfg: Cfg, unit: string, grades: [number, number, number], places: string[], icon: string, colour: string, blurb: string, how: string, extra: Extra = {}): MiniGameDef {
  return { n, id, title, cat, engine, cfg, unit, grades, places, icon, colour, blurb, how, kind: "score", ...extra };
}
function T(n: number, id: string, title: string, cat: Category, engine: string, cfg: Cfg, seats: [number, number], places: string[], icon: string, colour: string, blurb: string, how: string, extra: Extra = {}): MiniGameDef {
  return { n, id, title, cat, engine, cfg, unit: "wins", grades: [1, 1, 1], seats, places, icon, colour, blurb, how, kind: "turns", ...extra };
}

const HEIST = ["bank", "museum", "mall", "megamall", "hotel", "tower", "twin", "capitol"];
const POLICE = ["police", ...HEIST];
const BAR = ["club", "restaurant", "hotel"];
const HOME = ["house", "home"];
const PARK = ["park", "bigpark", "plaza", "playground"];
const RIDES = ["train", "bus", "boat", "ride"];
const WATER = ["waterpark", "port", "pond", "spa"];
const ARCADE = ["mall", "megamall", "funfair", "club", "station", "airport", "intlairport"];

export const MINIGAMES: MiniGameDef[] = [
  // ---------------------------------------------------------------- heists
  S(1, "safe-cracker", "Safe Cracker", "heist", "meter", { style: "dial", rounds: 4, seconds: 40 }, "points", [200, 300, 380], HEIST, "Vault", "#495057",
    "Turn the dial and stop on the clicks.", "The dial spins. Tap when the needle is in the glowing notch to set each number. Faster and closer is better."),
  S(2, "laser-maze", "Laser Maze", "heist", "crossing", { theme: "lasers", rows: 9 }, "points", [150, 300, 450], HEIST, "Zap", "#e03131",
    "Slip through moving lasers to the jewel.", "Tap Up, Left or Right to move. Lasers sweep and blink: never touch a red beam. Reach the top as many times as you can."),
  S(3, "wire-cut", "Wire Cut", "heist", "wires", { seconds: 60 }, "bombs", [3, 6, 9], [...HEIST, "police"], "Scissors", "#f08c00",
    "Read the clue, cut the right wire.", "Each bomb has a rule. Cut the one wire it describes before the timer runs out. A wrong cut ends the game."),
  S(4, "getaway-driver", "Getaway Driver", "heist", "lanes", { theme: "getaway", seconds: 45 }, "metres", [500, 900, 1300], [...HEIST, "fuel", "station"], "Car", "#1c7ed6",
    "Weave through traffic to the safe house.", "Swipe or tap left and right to change lanes. Grab cash, miss the cars. Three crashes and you're caught."),
  S(5, "lock-pick", "Lock Pick", "heist", "meter", { style: "pins", rounds: 5, seconds: 35 }, "points", [250, 380, 470], [...HEIST, ...HOME], "KeyRound", "#868e96",
    "Set every pin at the line.", "Each pin bounces up and down. Tap when it lines up with the gold line. Miss three times and the lock jams."),
  S(6, "hacker-grid", "Hacker Grid", "heist", "pipes", { seconds: 75 }, "grids", [2, 4, 6], [...HEIST, "office", "spaceport"], "Cpu", "#12b886",
    "Connect the circuit to kill the cameras.", "Tap tiles to turn them until power flows from the green start to the red end. Solve as many grids as you can."),
  S(7, "guard-patrol", "Guard Patrol", "heist", "crossing", { theme: "guards", rows: 9 }, "points", [150, 300, 450], HEIST, "Flashlight", "#5f3dc4",
    "Sneak past the torch beams.", "Move when the guards look away. If a torch beam catches you, the alarm goes off."),
  S(8, "pickpocket", "Pickpocket", "heist", "targets", { theme: "pickpocket", seconds: 40 }, "wallets", [8, 14, 20], ["market", "station", "mall", "airport", "intlairport", "funfair"], "Wallet", "#2b8a3e",
    "Bump and grab in the crowd.", "Tap a person only while their wallet glints. Tap the wrong person three times and you're caught."),
  S(9, "disguise", "Disguise Match", "heist", "memory", { mode: "outfit", rounds: 8 }, "matches", [4, 6, 8], [...HEIST, "mall"], "Shirt", "#d6336c",
    "Remember the outfit, blend in.", "Study the guard's outfit, then pick the matching one from four. Each round shows it for less time."),
  S(10, "vault-code", "Vault Code", "heist", "memory", { mode: "simon" }, "levels", [5, 8, 11], ["bank", ...HEIST], "LockKeyhole", "#1971c2",
    "Repeat the flashing code.", "Watch the keypad light up, then tap the same keys in order. It grows by one each level."),
  S(11, "police-chase", "Police Chase", "heist", "lanes", { theme: "chase", seconds: 45 }, "metres", [500, 900, 1300], [...POLICE, "fuel"], "Siren", "#e03131",
    "Outrun the police.", "Change lanes to dodge roadblocks and spikes. Boost pads give you speed. Three hits and they've got you."),
  S(12, "interrogation", "Interrogation", "heist", "alibi", { rounds: 8 }, "lies found", [4, 6, 8], ["police", ...HEIST], "MessageCircleQuestion", "#364fc7",
    "Find the lie in the alibi.", "Read the suspect's three statements and the evidence. Tap the statement the evidence proves is a lie."),
  S(13, "fingerprint", "Fingerprint Match", "heist", "match", { mode: "prints", rounds: 10 }, "matches", [5, 8, 10], ["police", ...HEIST], "Fingerprint", "#495057",
    "Find the matching print.", "Look at the print from the crime scene and tap the one that matches exactly. Quick answers score more."),
  S(14, "cctv-spot", "CCTV Spot the Difference", "heist", "spot", { rounds: 6 }, "found", [10, 16, 22], ["police", ...HEIST, "office"], "Cctv", "#495057",
    "Find what changed between two camera stills.", "Tap the differences in the bottom picture. Each still has 4. Wrong taps cost time."),
  S(15, "hide-loot", "Find the Loot", "heist", "treasure", { theme: "room", size: 5, chests: 1, digs: 8, rounds: 4 }, "points", [150, 260, 340], [...HEIST, ...HOME], "Package", "#a5673f",
    "The loot is hidden in the room: find it.", "Tap a spot to search it. Each search says how close you are (hot or cold). Find it in as few searches as you can."),
  S(16, "diamond-grab", "Diamond Grab", "heist", "claw", { theme: "diamond", tries: 5 }, "carats", [6, 12, 18], ["mall", "megamall", "museum", "hotel"], "Gem", "#15aabf",
    "Lift the diamonds from the glass case.", "Tap to stop the claw over a gem, then tap again to drop. Big gems are worth more. Five tries."),

  // ---------------------------------------------------------------- sport
  S(17, "free-throws", "Free Throws", "sport", "hoops", { shots: 10 }, "points", [8, 14, 20], ["court", "arena", "stadium", "gym", "school", "campus", ...PARK], "Trophy", "#f76707",
    "Swipe up to shoot.", "Drag from the ball upwards and let go. The angle and speed of your swipe set the shot. Swishes score 3."),
  S(18, "penalty-shootout", "Penalty Shootout", "sport", "penalty", { kicks: 5 }, "goals", [3, 5, 7], ["arena", "stadium", "pitch", "school", "campus", ...PARK], "Goal", "#2f9e44",
    "Score, then save.", "Shooting: tap where to aim, then stop the power bar in the green. Saving: tap the side to dive to."),
  S(19, "keepy-uppy", "Keepy-Uppy", "sport", "keepy", { ball: "football" }, "touches", [15, 35, 60], ["pitch", "arena", "stadium", ...PARK, "anywhere"], "CircleDot", "#2f9e44",
    "Keep the ball off the ground.", "Tap the ball to kick it up. Tap off-centre to send it sideways. Don't let it touch the ground."),
  S(20, "swim-race", "Swim Race", "water", "race", { input: "rhythm", theme: "swim", length: 100 }, "seconds", [32, 26, 22], WATER, "Waves", "#1c7ed6",
    "Stroke in rhythm to win the race.", "Tap when the ring closes on the circle for a strong stroke. Mistimed strokes slow you down.", { lowerWins: true }),
  S(21, "high-dive", "High Dive", "water", "meter", { style: "spin", rounds: 5 }, "points", [250, 350, 430], WATER, "ArrowDownToLine", "#1c7ed6",
    "Flip and enter the water clean.", "Your diver spins faster each dive. Tap to straighten out when they point straight down."),
  S(22, "sprint-100m", "100m Sprint", "sport", "race", { input: "alternate", theme: "track", length: 100 }, "seconds", [14, 12, 10.5], ["stadium", "arena", "school", "campus", "gym"], "Footprints", "#e03131",
    "Tap left, right, left, right!", "Tap the two buttons one after the other as fast as you can. Tapping the same one twice trips you up.", { lowerWins: true }),
  S(23, "hurdles", "Hurdles", "sport", "race", { input: "alternate", theme: "hurdles", length: 110 }, "seconds", [18, 15, 13], ["stadium", "arena", "school", "campus"], "Fence", "#e03131",
    "Run and jump in time.", "Tap left and right to run. Hit Jump just before each hurdle. Clipping one slows you down.", { lowerWins: true }),
  S(24, "long-jump", "Long Jump", "sport", "meter", { style: "jump", rounds: 3 }, "metres", [6, 7.5, 8.5], ["stadium", "school", "campus"], "MoveRight", "#e8590c",
    "Speed, then the perfect take-off angle.", "Tap fast to build speed, then stop the angle needle near 45 degrees. Best of three jumps."),
  S(25, "javelin", "Javelin", "sport", "meter", { style: "throw", rounds: 3 }, "metres", [55, 70, 85], ["stadium", "school", "campus"], "MoveUpRight", "#e8590c",
    "Power and angle for the longest throw.", "Stop the power bar at the top, then the angle at about 40 degrees. Best of three throws."),
  S(26, "shooting-range", "Shooting Range", "shooting", "targets", { theme: "range", seconds: 40 }, "points", [150, 260, 360], ["police", "military", "funfair", "gym", "anywhere"], "Crosshair", "#e8590c",
    "Hit the targets before they drop.", "Tap the targets as they pop up. Bullseyes score more. Don't hit the hostages!"),
  S(27, "clay-pigeon", "Clay Pigeon", "shooting", "targets", { theme: "clay", seconds: 45 }, "clays", [8, 14, 19], ["park", "bigpark", "military", "anywhere"], "Disc", "#e8590c",
    "Pull! Shoot the flying clays.", "Clays fly across the sky. Tap them to break them. You have 25 shells."),
  S(28, "duck-hunt", "Duck Hunt", "shooting", "targets", { theme: "ducks", seconds: 45 }, "ducks", [10, 18, 25], ["park", "bigpark", "pond", "funfair", "anywhere"], "Bird", "#2f9e44",
    "The classic: shoot the ducks.", "Tap the ducks as they fly out of the reeds. They get faster every wave. Three shots per duck."),
  S(29, "archery", "Archery", "shooting", "legacy:archery", {}, "points", [30, 45, 55], ["gym", "park", "bigpark", "campus"], "Target", "#7048e8",
    "Six arrows at the target.", "Aim, mind the wind, and let go.", { legacy: true }),
  S(30, "darts", "Darts", "shooting", "legacy:darts", {}, "points", [120, 200, 300], BAR, "Target", "#c92a2a",
    "Throw for the treble twenty.", "Drag to aim, release to throw.", { legacy: true }),
  S(31, "mini-golf", "Mini Golf", "sport", "roll", { mode: "golf", holes: 6 }, "strokes", [24, 18, 14], [...PARK, "funfair", "hotel"], "Flag", "#2f9e44",
    "Six holes. Fewest strokes wins.", "Drag back from the ball and let go to putt (further back is harder). Bank off the walls.", { lowerWins: true }),
  S(32, "bowling", "Bowling", "sport", "roll", { mode: "bowling", frames: 5 }, "pins", [25, 35, 45], ["mall", "megamall", "funfair", "club"], "CircleDot", "#364fc7",
    "Five frames. Knock them all down.", "Drag the ball back and let go: the direction of your drag is the direction it rolls. Two balls a frame."),
  S(33, "table-tennis", "Table Tennis", "sport", "paddle", { mode: "pingpong", points: 7 }, "points", [3, 5, 7], ["gym", "office", "school", "campus", "hotel"], "Disc", "#e8590c",
    "First to 7.", "Drag your bat left and right. Hit the ball off the edge of your bat to angle it past the bot."),
  S(34, "tennis-rally", "Tennis", "sport", "paddle", { mode: "tennis", points: 7 }, "points", [3, 5, 7], [...PARK, "hotel", "campus"], "CircleDot", "#82c91e",
    "Rally on the court, first to 7.", "Drag to move your racket. Angle your shots into the corners."),
  S(35, "boxing-pads", "Boxing Pads", "sport", "targets", { theme: "pads", seconds: 30 }, "punches", [30, 50, 70], ["boxing", "gym", "wrestling"], "Hand", "#c92a2a",
    "Punch the pads as they light up.", "Tap each pad the moment it lights. Fast punches build combos. Don't hit the red ones."),
  S(36, "arm-wrestle", "Arm Wrestling", "sport", "race", { input: "mash", theme: "arm" }, "seconds", [12, 8, 5], [...BAR, "gym", "wrestling"], "BicepsFlexed", "#c92a2a",
    "Tap faster than the bot.", "Tap as fast as you can to push their hand down. Win quickly for a better score.", { lowerWins: true }),
  S(37, "tug-of-war", "Tug of War", "sport", "race", { input: "rhythm", theme: "rope" }, "seconds", [16, 11, 7], [...PARK, "school", "beach"], "Cable", "#a5673f",
    "Pull together, in time.", "Tap when the ring closes for a big heave. Pull the flag over your line.", { lowerWins: true }),
  S(38, "weightlifting", "Weightlifting", "sport", "balance", { theme: "lift", seconds: 30 }, "kilos", [120, 180, 230], ["gym", "wrestling", "boxing"], "Dumbbell", "#495057",
    "Hold the bar steady to lift it.", "Press and hold to push the marker up, let go to drop it. Keep it inside the green zone to lift. Each lift adds weight."),
  S(39, "skate-tricks", "Skate Tricks", "sport", "arrows", { theme: "skate", seconds: 40 }, "points", [800, 1500, 2200], [...PARK, "plaza"], "Zap", "#ae3ec9",
    "Hit the trick combos.", "Swipe (or tap the arrow) shown before it times out. Chains of tricks multiply your score."),
  S(40, "cycling", "Cycling Race", "sport", "lanes", { theme: "bike", seconds: 45 }, "metres", [500, 900, 1300], ["anywhere", ...PARK], "Bike", "#2f9e44",
    "Dodge the potholes, catch the slipstream.", "Switch lanes to miss potholes and parked cars. Water bottles give a burst of speed."),
  S(41, "surfing", "Surfing", "water", "balance", { theme: "surf", seconds: 35 }, "points", [150, 250, 330], ["waterpark", "port", "beach"], "Waves", "#1c7ed6",
    "Stay in the sweet spot of the wave.", "Hold to carve up, let go to drop. Stay in the green curl to score. Fall out and you wipe out."),
  S(42, "jet-ski", "Jet Ski Race", "water", "lanes", { theme: "jetski", seconds: 45 }, "metres", [500, 900, 1300], ["port", "waterpark", "pond"], "Ship", "#1c7ed6",
    "Race across the water.", "Change lanes to miss buoys and rocks. Ramps give you a jump."),
  S(43, "rowing", "Rowing Race", "water", "race", { input: "rhythm", theme: "row", length: 200 }, "seconds", [40, 32, 27], ["port", "pond", "waterpark"], "Sailboat", "#1c7ed6",
    "Row in rhythm.", "Tap as the ring closes for a strong stroke. Keep the rhythm to stay ahead.", { lowerWins: true }),
  S(44, "horse-race", "Horse Race", "sport", "race", { input: "rhythm", theme: "horse", length: 400 }, "seconds", [40, 32, 27], ["arena", "stadium", "anywhere"], "Trophy", "#a5673f",
    "Gallop in rhythm to the finish.", "Tap with the hoofbeat (when the ring closes) to gallop. Off-beat taps slow your horse.", { lowerWins: true }),
  S(45, "cricket", "Cricket Batting", "sport", "meter", { style: "bat", theme: "cricket", rounds: 12 }, "runs", [20, 36, 50], ["pitch", "stadium", "arena", "school"], "Swords", "#2f9e44",
    "Twelve balls. Hit fours and sixes.", "Tap to swing as the ball reaches the glowing zone. Perfect timing goes for six."),
  S(46, "home-run", "Home Run Derby", "sport", "meter", { style: "bat", theme: "baseball", rounds: 10 }, "home runs", [3, 6, 8], ["stadium", "arena", "pitch"], "Swords", "#1971c2",
    "Ten pitches. Knock them out of the park.", "Tap to swing as the ball crosses the plate. Only perfect hits clear the fence."),
  S(47, "field-goal", "Field Goal", "sport", "meter", { style: "kick", theme: "american", rounds: 6 }, "points", [6, 12, 16], ["stadium", "arena"], "Goal", "#a5673f",
    "Kick it through the posts.", "Stop the aim needle in the middle (mind the wind), then stop the power in the green. Each kick is further away."),
  S(48, "rugby-kick", "Rugby Kick", "sport", "meter", { style: "kick", theme: "rugby", rounds: 6 }, "points", [6, 12, 16], ["stadium", "arena", "pitch"], "Goal", "#2f9e44",
    "Convert from the touchline.", "Stop the aim needle in the middle (mind the wind), then stop the power in the green."),
  S(49, "beach-volley", "Beach Volleyball", "sport", "paddle", { mode: "volley", points: 7 }, "points", [3, 5, 7], ["waterpark", "port", ...PARK], "Volleyball", "#fab005",
    "Bump it over the net, first to 7.", "Drag to move under the ball. Where it hits you sets where it goes."),
  S(50, "climbing-wall", "Climbing Wall", "sport", "race", { input: "pick", theme: "climb", length: 30 }, "seconds", [30, 22, 17], ["gym", "funfair", "campus"], "Mountain", "#e8590c",
    "Grab the right holds to the top.", "Tap the glowing hold each time. Wrong holds make you slip back.", { lowerWins: true }),

  // ---------------------------------------------------------------- board games and cards
  T(51, "ludo", "Ludo", "board", "ludo", {}, [2, 4], [...HOME, ...PARK, "restaurant", "school", ...RIDES], "Dice5", "#e03131",
    "Race your four tokens home.", "Roll a six to bring a token out. Land on someone to send them back. First with all four home wins."),
  T(52, "snakes-ladders", "Snakes and Ladders", "board", "snakes", {}, [2, 4], [...HOME, "school", "playground", ...RIDES], "Dice3", "#2f9e44",
    "Climb the ladders, dodge the snakes.", "Roll and move. Ladders take you up, snakes take you down. First to 100 wins."),
  T(53, "draughts", "Draughts", "board", "draughts", {}, [2, 2], [...PARK, "restaurant", ...HOME, "market"], "Grid3x3", "#212529",
    "Jump and crown.", "Move diagonally forward. You must jump when you can, and keep jumping. Reach the far side to become a king."),
  T(54, "chess", "Chess Blitz", "board", "chess", {}, [2, 2], [...PARK, "campus", "school", "hotel", ...HOME], "Crown", "#212529",
    "Checkmate the king.", "Tap a piece, then where to move it. Pawns become queens on the last row."),
  T(55, "ayo", "Ayo (Oware)", "board", "oware", {}, [2, 2], [...PARK, "market", ...HOME, "restaurant"], "CircleDot", "#a5673f",
    "Sow the seeds, capture the most.", "Tap one of your pits to sow its seeds round the board. Ending in their row on 2 or 3 seeds captures them."),
  T(56, "whot", "Whot!", "cards", "whot", {}, [2, 4], [...BAR, ...HOME, ...RIDES, "market"], "Shapes", "#c2255c",
    "Nigeria's favourite card game.", "Match the shape or the number. 2: pick two. 14: general market. 1: hold on. 8: suspension. Whot (20) asks for any shape. Empty your hand first.", { hidden: true }),
  T(57, "crazy-eights", "Crazy Eights", "cards", "eights", {}, [2, 4], [...BAR, ...HOME, ...RIDES], "Club", "#c2255c",
    "Match suit or rank; eights are wild.", "Play a card that matches the suit or the number. An 8 changes the suit. Can't play? Draw. Empty your hand to win.", { hidden: true }),
  S(58, "blackjack", "Blackjack", "cards", "blackjack", { hands: 8 }, "chips", [110, 150, 200], ["hotel", "club", "spaceport", "intlairport"], "Spade", "#c2255c",
    "Get closer to 21 than the dealer.", "You start with 100 chips. Bet, then hit or stand. Dealer stands on 17. Blackjack pays 3 to 2."),
  S(59, "poker", "Texas Hold'em", "cards", "poker", { hands: 8 }, "chips", [220, 320, 450], ["hotel", "club", "intlairport"], "Diamond", "#c2255c",
    "Outplay three bots at the table.", "Two cards each, five shared. Fold, call or raise. After 8 hands, the most chips wins."),
  T(60, "dominoes", "Dominoes", "board", "dominoes", {}, [2, 4], [...PARK, "market", ...HOME, "restaurant"], "RectangleVertical", "#212529",
    "Match the ends, play out first.", "Play a domino that matches an end of the line. Can't play? Draw (or pass when the boneyard is empty).", { hidden: true }),
  T(61, "backgammon", "Backgammon", "board", "backgammon", {}, [2, 2], ["restaurant", "hotel", ...HOME, ...PARK], "Triangle", "#a5673f",
    "Race your checkers home and off.", "Roll two dice and move checkers by each number. A lone checker can be hit. Bring all fifteen home, then bear them off."),
  T(62, "town-tycoon", "Town Tycoon", "board", "tycoon", {}, [2, 4], [...HOME, "bank", "office", "tower"], "Building2", "#2f9e44",
    "Buy the streets of the town, charge rent.", "Roll and move round the town. Buy streets you land on; others pay you rent. After 12 rounds, the richest wins."),
  S(63, "word-tiles", "Word Tiles", "board", "words", { seconds: 90 }, "points", [40, 80, 120], ["school", "campus", "museum", "office", ...HOME, "restaurant"], "WholeWord", "#7048e8",
    "Make words from seven tiles.", "Tap tiles to spell a word and send it. Rare letters score more. Longer words score bonuses. Same tiles for everyone in a challenge."),
  T(64, "connect-four", "Connect Four", "board", "connect4", {}, [2, 2], [...HOME, "funfair", "mall", ...RIDES], "Grid2x2", "#fab005",
    "Four in a row wins.", "Drop a counter into a column. Line up four across, down or diagonally."),
  T(65, "battleships", "Battleships", "board", "battleships", {}, [2, 2], ["port", "military", ...HOME, ...RIDES], "Anchor", "#1971c2",
    "Sink their fleet first.", "Tap their sea to fire. A hit lets you go again. Sink all five ships to win.", { hidden: true }),
  S(66, "snap", "Snap!", "cards", "snap", { seconds: 60 }, "snaps", [4, 8, 12], [...BAR, ...HOME, ...RIDES], "Layers", "#c2255c",
    "Shout SNAP when two cards match.", "Cards land one by one. Tap SNAP when the top two have the same number. Bots are snapping too! A wrong snap costs you."),
  T(67, "go-fish", "Go Fish", "cards", "gofish", {}, [2, 4], [...HOME, "school", ...RIDES], "Fish", "#1c7ed6",
    "Collect sets of four.", "Ask a player for a number you hold. If they have it, you get them all and go again. Otherwise, go fish. Most sets wins.", { hidden: true }),
  S(68, "mahjong", "Mahjong Tiles", "board", "memory", { mode: "tiles" }, "points", [400, 700, 950], ["hotel", "restaurant", "mall", ...HOME], "LayoutGrid", "#2b8a3e",
    "Clear the board in pairs.", "Tap two matching tiles that are free (nothing on top, an open side). Clear them all before time runs out."),
  S(69, "rps", "Rock-Paper-Scissors", "party", "legacy:rps", {}, "wins", [1, 1, 1], ["anywhere"], "Hand", "#7048e8",
    "Best of three against someone here.", "Pick in secret; both picks show at once.", { legacy: true }),
  T(70, "tic-tac-toe", "Noughts and Crosses", "board", "ttt", {}, [2, 2], ["school", "restaurant", ...HOME, ...RIDES, "anywhere"], "Hash", "#495057",
    "Three in a row.", "Take turns marking a square. Three in a row wins."),
  S(71, "pool", "Pool", "board", "legacy:pool", {}, "balls", [2, 4, 6], ["club", "hotel", "restaurant"], "CircleDot", "#2b8a3e",
    "Trick shots on the green baize.", "Drag back from the cue ball and let go.", { legacy: true }),
  S(72, "air-hockey", "Air Hockey", "arcade", "paddle", { mode: "hockey", points: 7 }, "goals", [3, 5, 7], ARCADE, "Disc", "#e03131",
    "First to 7 goals.", "Drag your mallet anywhere in your half. Smash the puck into their goal."),
  S(73, "table-football", "Table Football", "arcade", "paddle", { mode: "foosball", points: 5 }, "goals", [2, 4, 5], ["club", "office", ...BAR, "campus"], "Goal", "#2f9e44",
    "Spin the rods, score five.", "Drag left and right to slide your players. The ball bounces off them towards the goal."),
  S(74, "shuffleboard", "Shuffleboard", "board", "roll", { mode: "shuffle", ends: 6 }, "points", [8, 14, 20], BAR, "MoveUp", "#a5673f",
    "Slide closest to the edge.", "Drag back and let go to slide your puck. The further up it stops, the more it scores. Over the edge scores nothing."),
  S(75, "bingo", "Bingo", "party", "bingo", { seconds: 120 }, "points", [100, 200, 300], ["worship", "hotel", "restaurant", "school", "club"], "Grid3x3", "#f08c00",
    "Eyes down for a full house.", "Mark called numbers on your card. Shout BINGO for a line (and a full house) before the bots do."),

  // ---------------------------------------------------------------- arcade and party
  S(76, "reflex", "Reflex", "arcade", "legacy:reflex", {}, "hits", [20, 32, 45], ARCADE, "Zap", "#2f6fd1",
    "Tap the ghosts, not the bombs.", "30 seconds, faster and faster.", { legacy: true }),
  S(77, "trivia", "Trivia", "party", "legacy:trivia", {}, "right", [4, 6, 7], ["anywhere"], "CircleHelp", "#7048e8",
    "Quiz night.", "Answer before the clock runs out.", { legacy: true }),
  S(78, "whack-a-mole", "Whack-a-Mole", "arcade", "targets", { theme: "moles", seconds: 30 }, "points", [25, 40, 55], ARCADE, "Hammer", "#a5673f",
    "Bonk them as they pop up.", "Tap the moles. Gold moles are worth 3. Never bonk a bomb!"),
  S(79, "claw-machine", "Claw Machine", "arcade", "claw", { theme: "toys", tries: 5 }, "prizes", [3, 6, 9], ARCADE, "Gift", "#e64980",
    "Grab a prize!", "Tap to stop the claw over a toy, then tap again to drop. Big toys are worth more but slip more."),
  S(80, "fruit-slice", "Fruit Slice", "arcade", "targets", { theme: "fruit", seconds: 45 }, "fruit", [30, 55, 80], ["market", "restaurant", ...ARCADE], "Apple", "#2f9e44",
    "Slice the fruit, never the bombs.", "Swipe through fruit as it flies up. Slice several at once for a combo. Three missed fruit or one bomb ends it."),
  S(81, "stack-tower", "Stack the Tower", "arcade", "stacker", {}, "floors", [10, 20, 30], ["office", "tower", "twin", "capitol", ...ARCADE], "Building", "#3b5bdb",
    "Build the tallest tower.", "Tap to drop the sliding floor. Anything hanging over the edge falls off. Perfect drops keep it wide."),
  S(82, "endless-runner", "Street Runner", "arcade", "lanes", { theme: "runner", seconds: 60 }, "metres", [600, 1100, 1600], ["anywhere"], "Footprints", "#f08c00",
    "Run the streets, grab the mint.", "Swipe left and right to change lanes and up to jump over barriers. Collect mint coins."),
  S(83, "snake", "Snake", "arcade", "snake", {}, "length", [12, 22, 35], [...ARCADE, ...RIDES, "anywhere"], "Spline", "#2f9e44",
    "Eat, grow, don't bite yourself.", "Swipe or tap the arrows to turn. Eat the food to grow. Don't hit the walls or your tail."),
  S(84, "brick-breaker", "Brick Breaker", "arcade", "bricks", {}, "points", [300, 600, 900], [...ARCADE, "office"], "BrickWall", "#e8590c",
    "Smash every brick.", "Drag to move the paddle. Bounce the ball into the bricks. You have three balls."),
  S(85, "alien-attack", "Alien Attack", "arcade", "invaders", {}, "points", [500, 1000, 1600], ["spaceport", ...ARCADE], "Rocket", "#7048e8",
    "Defend the town from the aliens.", "Drag to move, your ship fires by itself. Shoot every alien before they land."),
  S(86, "memory-pairs", "Memory Pairs", "party", "memory", { mode: "pairs" }, "points", [250, 400, 550], ["school", "campus", "museum", ...HOME, "anywhere"], "Copy", "#7048e8",
    "Find all the pairs.", "Turn over two cards at a time. Find every pair in as few turns as you can."),
  S(87, "charades", "Picture Charades", "party", "charades", { seconds: 60 }, "guessed", [6, 10, 14], ["club", "school", ...HOME, "anywhere"], "Drama", "#f08c00",
    "Guess the word from the picture clues.", "Clues appear one by one. Tap the right word from four. The sooner you guess, the more you score."),
  S(88, "draw-guess", "Draw and Guess", "party", "draw", { seconds: 75 }, "guessed", [4, 7, 10], ["school", "museum", "campus", "anywhere"], "Pencil", "#e64980",
    "Guess the drawing as it's drawn.", "Watch the picture appear line by line and pick what it is. Guessing before it's finished scores double."),
  S(89, "musical-chairs", "Musical Chairs", "party", "chairs", {}, "rounds", [3, 5, 7], ["club", ...HOME, "school"], "Armchair", "#ae3ec9",
    "When the music stops, grab a chair!", "Wait while the music plays. The moment it stops, tap a free chair. Tap too early and you're out."),
  S(90, "hot-potato", "Hot Potato", "party", "potato", {}, "rounds", [3, 5, 7], [...PARK, "club", "school", "anywhere"], "Flame", "#e8590c",
    "Pass it before it pops!", "When the potato is yours, tap someone to pass it. Fast passes keep you safe. Whoever holds it when it pops is out."),
  S(91, "dance-copy", "Dance Copy", "party", "memory", { mode: "moves" }, "moves", [6, 10, 14], ["club", "school"], "Music", "#e64980",
    "Copy the dance moves.", "Watch the dancer's moves, then repeat them with the arrows. One more move each round."),
  S(92, "karaoke", "Karaoke", "party", "legacy:karaoke", {}, "hype", [50, 75, 95], ["club", "restaurant"], "Mic", "#e64980",
    "Take the mic.", "The room hypes you up.", { legacy: true }),
  S(93, "talking-drums", "Talking Drums", "party", "rhythm", { song: "drums" }, "points", [1500, 2600, 3400], ["club", "market", "worship", "plaza"], "Drum", "#a5673f",
    "Play the beat on the drums.", "Notes fall down three lanes. Tap the lane as each note hits the line. Keep a streak for bonus points."),

  // ---------------------------------------------------------------- town life (job shifts)
  S(94, "order-up", "Order Up", "life", "orders", { theme: "kitchen", seconds: 90 }, "orders", [6, 10, 14], ["restaurant", "hotel", "market"], "ChefHat", "#e8590c",
    "Cook the orders before they go cold.", "Tap the ingredients each order needs, in any order, then Serve. Wrong items go in the bin. Quick service earns tips."),
  S(95, "bartender", "Bartender Mix", "life", "meter", { style: "pour", rounds: 6 }, "points", [250, 380, 480], ["club", "restaurant", "hotel"], "GlassWater", "#ae3ec9",
    "Pour each layer to the line.", "Hold to pour, let go at the line. Each mocktail has up to three layers. Overflow ruins the drink."),
  S(96, "taxi-rush", "Taxi Rush", "life", "lanes", { theme: "taxi", seconds: 60 }, "fares", [8, 14, 20], ["station", "airport", "intlairport", "fuel", "anywhere"], "CarTaxiFront", "#fab005",
    "Pick up fares, dodge the traffic.", "Switch lanes to drive past waving passengers to pick them up. Crashes cost you fares."),
  S(97, "market-haggle", "Market Haggle", "life", "haggle", { rounds: 5 }, "saved", [100, 200, 300], ["market", "mall", "megamall"], "HandCoins", "#2b8a3e",
    "Bargain the price down.", "Make an offer. The seller counters. Push too hard and they walk away. Save as much as you can on five items."),
  S(98, "fishing", "Fishing", "life", "balance", { theme: "fish", seconds: 60 }, "kilos", [10, 20, 30], ["port", "pond", "waterpark", "anywhere"], "Fish", "#1c7ed6",
    "Wait, strike, reel it in.", "When the float bobs, tap to strike. Then hold and release to keep the fish in the green zone until it's landed."),
  S(99, "delivery-dash", "Delivery Dash", "life", "lanes", { theme: "delivery", seconds: 60 }, "parcels", [8, 14, 20], ["office", "market", "mall", "station", "anywhere"], "Package", "#f08c00",
    "Deliver the parcels on your bike.", "Pick up parcels and ride past the glowing doors to deliver them. Dodge pedestrians and potholes."),
  S(100, "treasure-hunt", "Treasure Hunt", "life", "treasure", { theme: "map", size: 7, chests: 3, digs: 14, rounds: 3 }, "points", [200, 330, 420], [...PARK, "museum", "monument", "anywhere"], "Map", "#a5673f",
    "Dig for the hidden chests.", "Tap to dig. Each hole tells you how far the nearest chest is. Find all three with the fewest digs."),
];

export const MINIGAME_BY_ID = new Map(MINIGAMES.map((g) => [g.id, g]));

/** Is a score a bronze (1), silver (2) or gold (3) one (0: none)? */
export function gradeOf(def: MiniGameDef, score: number) {
  const better = (a: number, b: number) => (def.lowerWins ? a <= b : a >= b);
  if (def.lowerWins && score <= 0) return 0;
  return better(score, def.grades[2]) ? 3 : better(score, def.grades[1]) ? 2 : better(score, def.grades[0]) ? 1 : 0;
}

/** The games for a kind of place (most fitting first), or every game for "anywhere". */
export function gamesFor(placeType: string | undefined | null): MiniGameDef[] {
  if (!placeType) return MINIGAMES;
  return MINIGAMES.filter((g) => g.places.includes(placeType));
}

/** Games for a job (by skill), for job shifts. */
export const SHIFT_GAMES: Record<string, string[]> = {
  hospitality: ["order-up", "bartender", "memory-pairs"],
  retail: ["market-haggle", "stack-tower", "delivery-dash"],
  office: ["hacker-grid", "word-tiles", "stack-tower"],
  finance: ["vault-code", "blackjack", "market-haggle"],
  health: ["memory-pairs", "fingerprint", "wire-cut"],
  safety: ["interrogation", "fingerprint", "police-chase"],
  transport: ["taxi-rush", "delivery-dash", "getaway-driver"],
  entertainment: ["talking-drums", "dance-copy", "bartender"],
  tech: ["hacker-grid", "alien-attack", "wire-cut"],
  tourism: ["treasure-hunt", "word-tiles", "charades"],
  fitness: ["boxing-pads", "weightlifting", "swim-race"],
  education: ["word-tiles", "memory-pairs", "charades"],
  industry: ["stack-tower", "weightlifting", "hacker-grid"],
};

/** The heist games, for pulling a job: a chain of three, all to be passed. */
export const HEIST_GAMES = MINIGAMES.filter((g) => g.cat === "heist").map((g) => g.id);
