import { HEX_COUNT, PORT_SLOTS } from "./board";
import { makeRng, shuffle } from "./rng";
import type { Board, DevKind, GameState, HexTile, Port, Resource, Seat } from "./types";
import { emptyHand } from "./types";

const TERRAIN_BAG: HexTile["terrain"][] = [
  ...Array<HexTile["terrain"]>(4).fill("wood"),
  ...Array<HexTile["terrain"]>(4).fill("sheep"),
  ...Array<HexTile["terrain"]>(4).fill("wheat"),
  ...Array<HexTile["terrain"]>(3).fill("brick"),
  ...Array<HexTile["terrain"]>(3).fill("ore"),
  "desert",
];

const TOKEN_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

const PORT_BAG: (Resource | "any")[] = [
  "any",
  "any",
  "any",
  "any",
  "brick",
  "wood",
  "sheep",
  "wheat",
  "ore",
];

/** Deterministic standard dev-card deck: 14 knight, 5 vp, 2 each of road/plenty/mono. */
export function makeDevDeck(seed: string): DevKind[] {
  const deck: DevKind[] = [
    ...Array<DevKind>(14).fill("knight"),
    ...Array<DevKind>(5).fill("vp"),
    ...Array<DevKind>(2).fill("road"),
    ...Array<DevKind>(2).fill("plenty"),
    ...Array<DevKind>(2).fill("mono"),
  ];
  return shuffle(makeRng(seed + ":devdeck"), deck);
}

export function generateBoard(seed: string): Board {
  const rng = makeRng(seed + ":board");
  const terrains = shuffle(rng, TERRAIN_BAG);
  const tokens = shuffle(rng, TOKEN_BAG);
  const portTypes = shuffle(rng, PORT_BAG);

  const tiles: HexTile[] = [];
  let ti = 0;
  for (let h = 0; h < HEX_COUNT; h++) {
    const terrain = terrains[h]!;
    tiles.push({ terrain, num: terrain === "desert" ? null : tokens[ti++]! });
  }

  const ports: Port[] = PORT_SLOTS.map((slot, i) => ({
    type: portTypes[i]!,
    vertices: slot.vertices,
  }));

  return { tiles, ports };
}

export function desertHex(board: Board): number {
  return board.tiles.findIndex((t) => t.terrain === "desert");
}

export function createLobby(roomCode: string, seed: string): GameState {
  const board = generateBoard(seed);
  return {
    roomCode,
    phase: "lobby",
    board,
    seats: [],
    turnOrder: [],
    activeSeat: 0,
    setup: null,
    turn: null,
    robberHex: desertHex(board),
    pendingDiscards: {},
    steal: null,
    trade: null,
    bank: {
      brick: 19,
      wood: 19,
      sheep: 19,
      wheat: 19,
      ore: 19,
    },
    devDeck: makeDevDeck(seed),
    awards: { longestRoad: null, largestArmy: null },
    winner: null,
    log: [{ t: 0, text: "A new island rises from the sea." }],
    seed,
    version: 0,
  };
}

export const SEAT_COLORS = ["#C4633B", "#3F6B4E", "#4E6E8E", "#D9A441"];
const BOT_NAMES = ["Ava", "B040", "Cyrus", "Dorn"];

export function makeSeat(id: number, name: string, kind: Seat["kind"]): Seat {
  return {
    id,
    name,
    color: SEAT_COLORS[id % SEAT_COLORS.length]!,
    kind,
    connected: kind === "bot",
    ready: kind === "bot",
    resources: emptyHand(),
    devCards: [],
    newDevCards: [],
    playedKnights: 0,
    buildings: { settlements: [], cities: [], roads: [] },
  };
}

export function botName(existing: Seat[]): string {
  const used = new Set(existing.map((s) => s.name));
  return BOT_NAMES.find((n) => !used.has(n)) ?? `Bot${existing.length}`;
}
