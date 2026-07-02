import { createLobby, makeSeat } from "./setup";
import { vertexEdges, edgeVertices } from "./board";
import { longestRoadLength, recomputeAwards, victoryPoints } from "./scoring";
import type { GameState } from "./types";

function baseState(n = 2): GameState {
  const s = createLobby("X", "seed1");
  for (let i = 0; i < n; i++) s.seats.push(makeSeat(i, `P${i}`, "human"));
  s.phase = "play";
  s.turnOrder = s.seats.map((st) => st.id);
  return s;
}

const other = (e: number, v: number) => {
  const [a, b] = edgeVertices(e);
  return a === v ? b : a;
};

/** A simple (non-repeating) road path of `len` edges starting at `start`. */
function buildPath(start: number, len: number): { edges: number[]; verts: number[] } {
  let v = start;
  const edges: number[] = [];
  const verts = [v];
  const visited = new Set([v]);
  while (edges.length < len) {
    const e = vertexEdges(v).find(
      (e) => !edges.includes(e) && !visited.has(other(e, v)),
    );
    if (e === undefined) break;
    const o = other(e, v);
    edges.push(e);
    verts.push(o);
    visited.add(o);
    v = o;
  }
  return { edges, verts };
}

test("straight 5-road chain has length 5", () => {
  const s = baseState();
  const { edges } = buildPath(0, 5);
  expect(edges).toHaveLength(5);
  s.seats[0]!.buildings.roads = edges;
  expect(longestRoadLength(s, 0)).toBe(5);
});

test("an opponent building breaks the road path", () => {
  const s = baseState();
  const { edges, verts } = buildPath(0, 5);
  s.seats[0]!.buildings.roads = edges;
  // opponent settlement at the middle vertex splits 5 into 3 + 2
  s.seats[1]!.buildings.settlements.push(verts[3]!);
  expect(longestRoadLength(s, 0)).toBe(3);
});

test("longest-road award: assigned at 5, transfers only when exceeded, ties keep holder", () => {
  const s = baseState(2);
  s.seats[0]!.buildings.roads = buildPath(0, 5).edges;
  recomputeAwards(s);
  expect(s.awards.longestRoad).toBe(0);
  // seat 1 also reaches 5 -> tie keeps holder 0
  s.seats[1]!.buildings.roads = buildPath(30, 5).edges;
  recomputeAwards(s);
  expect(s.awards.longestRoad).toBe(0);
  // seat 1 reaches 6 -> transfers
  s.seats[1]!.buildings.roads = buildPath(30, 6).edges;
  recomputeAwards(s);
  expect(s.awards.longestRoad).toBe(1);
});

test("largest army: at 3 knights, steal-back on more", () => {
  const s = baseState(2);
  s.seats[0]!.playedKnights = 3;
  recomputeAwards(s);
  expect(s.awards.largestArmy).toBe(0);
  s.seats[1]!.playedKnights = 4;
  recomputeAwards(s);
  expect(s.awards.largestArmy).toBe(1);
});

test("victory points sum buildings, awards and VP cards", () => {
  const s = baseState(1);
  s.seats[0]!.buildings.settlements = [1, 2];
  s.seats[0]!.buildings.cities = [3];
  s.seats[0]!.devCards = ["vp"];
  s.awards.longestRoad = 0;
  // 2 settlements + 1 city(2) + longest road(2) + vp(1) = 7
  expect(victoryPoints(s, 0)).toBe(7);
});
