import { vertexEdges, edgeVertices } from "./board";
import { buildingOwnerAt } from "./legal";
import type { GameState } from "./types";

const WIN_VP = 10;

function otherEndpoint(edge: number, vertex: number): number {
  const [a, b] = edgeVertices(edge);
  return a === vertex ? b : a;
}

/** Longest continuous road for a seat; paths break at opponent buildings. */
export function longestRoadLength(state: GameState, seat: number): number {
  const roads = new Set(state.seats[seat]!.buildings.roads);
  if (roads.size === 0) return 0;
  const seatEdgesAt = (v: number) =>
    vertexEdges(v).filter((e) => roads.has(e));
  const blocks = (v: number) => {
    const owner = buildingOwnerAt(state, v);
    return owner !== null && owner !== seat;
  };

  let best = 0;
  const explore = (vertex: number, used: Set<number>): void => {
    if (used.size > best) best = used.size;
    // cannot continue a path through a vertex an opponent occupies
    if (used.size > 0 && blocks(vertex)) return;
    for (const e of seatEdgesAt(vertex)) {
      if (used.has(e)) continue;
      used.add(e);
      explore(otherEndpoint(e, vertex), used);
      used.delete(e);
    }
  };

  const endpoints = new Set<number>();
  for (const e of roads) {
    const [a, b] = edgeVertices(e);
    endpoints.add(a);
    endpoints.add(b);
  }
  for (const v of endpoints) explore(v, new Set());
  return best;
}

/** Reassign an award. Holder keeps on ties; transfers only to a unique leader. */
function updateAward(
  values: number[],
  holder: number | null,
  threshold: number,
): number | null {
  const maxVal = Math.max(...values);
  if (maxVal < threshold) return null;
  const leaders = values
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v === maxVal)
    .map((x) => x.i);

  if (holder !== null && values[holder]! >= threshold) {
    if (maxVal > values[holder]!) {
      // someone strictly exceeds the holder; transfer only if unique
      return leaders.length === 1 ? leaders[0]! : holder;
    }
    return holder; // holder is still tied-best
  }
  // no valid holder: assign to a unique leader, else nobody
  return leaders.length === 1 ? leaders[0]! : null;
}

/** Recompute longest-road and largest-army holders in place. */
export function recomputeAwards(state: GameState): void {
  const roadLens = state.seats.map((s) => longestRoadLength(state, s.id));
  state.awards.longestRoad = updateAward(roadLens, state.awards.longestRoad, 5);
  const armies = state.seats.map((s) => s.playedKnights);
  state.awards.largestArmy = updateAward(armies, state.awards.largestArmy, 3);
}

export function victoryPoints(state: GameState, seat: number): number {
  const s = state.seats[seat]!;
  let vp = s.buildings.settlements.length + s.buildings.cities.length * 2;
  if (state.awards.longestRoad === seat) vp += 2;
  if (state.awards.largestArmy === seat) vp += 2;
  vp += [...s.devCards, ...s.newDevCards].filter((c) => c === "vp").length;
  return vp;
}

export function hasWon(state: GameState, seat: number): boolean {
  return victoryPoints(state, seat) >= WIN_VP;
}
