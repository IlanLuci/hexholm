import {
  VERTEX_COUNT,
  EDGE_COUNT,
  edgeVertices,
  vertexAdjacent,
  vertexEdges,
} from "./board";
import type { Board, Resource } from "./types";

/** The read-only slice of game state needed to judge legality of moves. Both the
 *  full authoritative GameState and the redacted client GameView satisfy it. */
export interface ReadState {
  seats: {
    id: number;
    buildings: { settlements: number[]; cities: number[]; roads: number[] };
  }[];
  board: Board;
  robberHex: number;
}

/** Seat id of the building at a vertex, or null. */
export function buildingOwnerAt(state: ReadState, vertex: number): number | null {
  for (const seat of state.seats) {
    if (
      seat.buildings.settlements.includes(vertex) ||
      seat.buildings.cities.includes(vertex)
    )
      return seat.id;
  }
  return null;
}

/** Seat id owning the road on an edge, or null. */
export function roadOwnerAt(state: ReadState, edge: number): number | null {
  for (const seat of state.seats)
    if (seat.buildings.roads.includes(edge)) return seat.id;
  return null;
}

export function occupiedVertices(state: ReadState): Set<number> {
  const set = new Set<number>();
  for (const seat of state.seats) {
    for (const v of seat.buildings.settlements) set.add(v);
    for (const v of seat.buildings.cities) set.add(v);
  }
  return set;
}

export function canPlaceSettlement(
  state: ReadState,
  seat: number,
  vertex: number,
  opts: { setup: boolean },
): boolean {
  if (vertex < 0 || vertex >= VERTEX_COUNT) return false;
  if (buildingOwnerAt(state, vertex) !== null) return false;
  // distance rule: no adjacent vertex may be occupied
  for (const adj of vertexAdjacent(vertex))
    if (buildingOwnerAt(state, adj) !== null) return false;
  if (opts.setup) return true;
  // in play, must connect to one of the seat's own roads
  for (const e of vertexEdges(vertex))
    if (roadOwnerAt(state, e) === seat) return true;
  return false;
}

export function canPlaceRoad(
  state: ReadState,
  seat: number,
  edge: number,
  opts: { mustTouchVertex?: number | null } = {},
): boolean {
  if (edge < 0 || edge >= EDGE_COUNT) return false;
  if (roadOwnerAt(state, edge) !== null) return false;
  const [a, b] = edgeVertices(edge);
  if (opts.mustTouchVertex != null) return a === opts.mustTouchVertex || b === opts.mustTouchVertex;
  // connects if an endpoint has the seat's building, or a shared road at an
  // endpoint that is not blocked by an opponent building.
  for (const v of [a, b]) {
    const owner = buildingOwnerAt(state, v);
    if (owner === seat) return true;
    if (owner !== null && owner !== seat) continue; // opponent building blocks through v
    for (const e of vertexEdges(v))
      if (e !== edge && roadOwnerAt(state, e) === seat) return true;
  }
  return false;
}

export function canPlaceCity(state: ReadState, seat: number, vertex: number): boolean {
  return state.seats[seat]?.buildings.settlements.includes(vertex) ?? false;
}

/** Hexes the robber may move to (any hex other than its current one). */
export function legalRobberHexes(state: ReadState): number[] {
  const out: number[] = [];
  for (let h = 0; h < state.board.tiles.length; h++)
    if (h !== state.robberHex) out.push(h);
  return out;
}

/** Best (lowest) bank/harbor trade ratio a seat can get for giving `res`. */
export function tradeRatio(state: ReadState, seat: number, res: Resource): number {
  let ratio = 4;
  const myVerts = new Set<number>([
    ...state.seats[seat]!.buildings.settlements,
    ...state.seats[seat]!.buildings.cities,
  ]);
  for (const port of state.board.ports) {
    const touches = port.vertices.some((v) => myVerts.has(v));
    if (!touches) continue;
    if (port.type === "any") ratio = Math.min(ratio, 3);
    else if (port.type === res) ratio = Math.min(ratio, 2);
  }
  return ratio;
}
