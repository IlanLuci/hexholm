import type { Action, GameEvent } from "../shared/actions";
import type {
  Board,
  DevKind,
  Hand,
  Phase,
  Resource,
  SetupState,
  TradeState,
  TurnState,
} from "../shared/types";

/** A seat as seen by a particular viewer — opponents' private cards are hidden. */
export interface SeatView {
  id: number;
  name: string;
  color: string;
  kind: "human" | "bot";
  connected: boolean;
  ready: boolean;
  playedKnights: number;
  buildings: { settlements: number[]; cities: number[]; roads: number[] };
  publicVP: number;
  longestRoad: number;
  handCount: number;
  devCount: number;
  isYou: boolean;
  // present only for the viewer's own seat:
  resources?: Hand;
  devCards?: DevKind[];
  newDevCards?: DevKind[];
}

/** The whole game as one viewer sees it. */
export interface GameView {
  roomCode: string;
  phase: Phase;
  board: Board;
  seats: SeatView[];
  turnOrder: number[];
  activeSeat: number;
  setup: SetupState | null;
  turn: TurnState | null;
  robberHex: number;
  pendingDiscards: Record<number, number>;
  steal: { candidates: number[] } | null;
  trade: TradeState | null;
  bank: Hand;
  devDeckCount: number;
  awards: { longestRoad: number | null; largestArmy: number | null };
  winner: number | null;
  log: { t: number; text: string }[];
  youSeat: number;
  version: number;
}

// ---- wire messages ----

export type ClientMessage =
  | { t: "hello"; name: string; sessionToken?: string; playerId?: string }
  | { t: "action"; action: Action };

export type ServerMessage =
  | { t: "welcome"; seatId: number; sessionToken: string }
  | { t: "state"; view: GameView }
  | { t: "event"; events: GameEvent[] }
  | { t: "error"; message: string };

export type { Resource };

// ---- admin stats (shared with the dashboard) ----

export interface FinishedGame {
  winner: string;
  durationMs: number;
  players: number;
  endedAt: number;
}

export interface StatsSnapshot {
  uniquePlayers: number;
  gamesStarted: number;
  gamesFinished: number;
  avgMatchMs: number;
  onlinePlayers: number;
  activeGames: number;
  recent: FinishedGame[];
}

/** A player's career stats, shown in their profile tooltip. */
export interface PlayerCareer {
  name: string;
  gamesPlayed: number;
  wins: number;
  winRate: number; // 0..1
  avgVP: number;
  longestRoadHeld: number;
  largestArmyHeld: number;
}
