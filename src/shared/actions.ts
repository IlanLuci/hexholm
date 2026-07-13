import type { Resource, DevKind, PartialHand, SetupMode } from "./types";

export type Action =
  // lobby
  | { type: "setName"; name: string }
  | { type: "setColor"; color: string }
  | { type: "ready"; ready: boolean }
  | { type: "addBot" }
  | { type: "removeBot"; seat: number }
  | { type: "setSettings"; winVP?: number; setupMode?: SetupMode }
  | { type: "start" }
  // setup
  | { type: "placeSettlement"; vertex: number }
  | { type: "placeRoad"; edge: number }
  // play
  | { type: "rollDice" }
  | { type: "buildRoad"; edge: number }
  | { type: "buildSettlement"; vertex: number }
  | { type: "buildCity"; vertex: number }
  | { type: "buyDev" }
  | { type: "playKnight"; hex: number; steal: number | null }
  | { type: "playRoadBuilding" }
  | { type: "playYearOfPlenty"; picks: [Resource, Resource] }
  | { type: "playMonopoly"; resource: Resource }
  | { type: "moveRobber"; hex: number; steal: number | null }
  | { type: "discard"; hand: PartialHand }
  | { type: "bankTrade"; give: Resource; get: Resource }
  | { type: "proposeTrade"; give: PartialHand; get: PartialHand }
  | { type: "respondTrade"; accept: boolean }
  | { type: "confirmTrade"; withSeat: number }
  | { type: "cancelTrade" }
  | { type: "endTurn" };

export type GameEvent =
  | { type: "rolled"; dice: [number, number]; by: number }
  | { type: "produced"; gains: Record<number, PartialHand> }
  | { type: "robber"; hex: number }
  | { type: "stole"; from: number; to: number }
  | { type: "built"; kind: "road" | "settlement" | "city"; by: number }
  | { type: "boughtDev"; by: number }
  | { type: "played"; kind: DevKind; by: number }
  | { type: "trade"; from: number; to: number }
  | { type: "award"; kind: "longestRoad" | "largestArmy"; seat: number }
  | { type: "win"; seat: number };

export type ApplyResult =
  | { state: import("./types").GameState; events: GameEvent[]; error?: undefined }
  | { error: string; state?: undefined; events?: undefined };
