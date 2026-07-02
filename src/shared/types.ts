export type Resource = "brick" | "wood" | "sheep" | "wheat" | "ore";
export type Terrain = Resource | "desert";
export type DevKind = "knight" | "road" | "plenty" | "mono" | "vp";

export type Hand = Record<Resource, number>;
export type PartialHand = Partial<Record<Resource, number>>;

export interface HexTile {
  terrain: Terrain;
  num: number | null;
}

export interface Port {
  type: Resource | "any";
  vertices: [number, number];
}

export interface Board {
  tiles: HexTile[];
  ports: Port[];
}

export type SeatKind = "human" | "bot";

export interface Seat {
  id: number;
  name: string;
  color: string;
  kind: SeatKind;
  connected: boolean;
  ready: boolean;
  resources: Hand;
  devCards: DevKind[]; // playable dev cards
  newDevCards: DevKind[]; // bought this turn, not yet playable
  playedKnights: number;
  buildings: { settlements: number[]; cities: number[]; roads: number[] };
}

export type Phase = "lobby" | "setup" | "play" | "finished";

export interface SetupState {
  round: 1 | 2;
  step: "settle" | "road";
  lastVertex: number | null;
}

export interface TurnState {
  hasRolled: boolean;
  dice: [number, number] | null;
  mustMoveRobber: boolean;
  freeRoads: number;
  devPlayedThisTurn: boolean;
}

export interface TradeState {
  from: number;
  give: PartialHand;
  get: PartialHand;
  responses: Record<number, "pending" | "accept" | "reject">;
}

export interface LogEntry {
  t: number;
  text: string;
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  board: Board;
  seats: Seat[];
  turnOrder: number[];
  activeSeat: number;
  setup: SetupState | null;
  turn: TurnState | null;
  robberHex: number;
  pendingDiscards: Record<number, number>;
  steal: { candidates: number[] } | null;
  trade: TradeState | null;
  bank: Hand;
  devDeck: DevKind[];
  awards: { longestRoad: number | null; largestArmy: number | null };
  winner: number | null;
  log: LogEntry[];
  seed: string;
  version: number;
}

export const RESOURCES: Resource[] = ["brick", "wood", "sheep", "wheat", "ore"];

export const emptyHand = (): Hand => ({
  brick: 0,
  wood: 0,
  sheep: 0,
  wheat: 0,
  ore: 0,
});

export const RESOURCE_NAMES: Record<Terrain, string> = {
  brick: "Brick",
  wood: "Lumber",
  sheep: "Wool",
  wheat: "Grain",
  ore: "Ore",
  desert: "Desert",
};

// Piece supply per player
export const SUPPLY = { settlements: 5, cities: 4, roads: 15 } as const;

// Build costs
export const COSTS: Record<"road" | "settle" | "city" | "dev", PartialHand> = {
  road: { wood: 1, brick: 1 },
  settle: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  dev: { sheep: 1, wheat: 1, ore: 1 },
};

export function handTotal(hand: Hand): number {
  return RESOURCES.reduce((s, r) => s + hand[r], 0);
}
