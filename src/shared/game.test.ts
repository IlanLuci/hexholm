import { apply } from "./engine";
import { createLobby, makeSeat } from "./setup";
import { vertexEdges, edgeVertices } from "./board";
import { victoryPoints } from "./scoring";
import { runSetup } from "./testutil";
import type { GameState } from "./types";

const other = (e: number, v: number) => {
  const [a, b] = edgeVertices(e);
  return a === v ? b : a;
};

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

function playState(): GameState {
  const s = createLobby("X", "seed1");
  s.seats.push(makeSeat(0, "P0", "human"));
  s.seats.push(makeSeat(1, "P1", "human"));
  s.phase = "play";
  s.turnOrder = [0, 1];
  s.activeSeat = 0;
  s.robberHex = s.board.tiles.findIndex((t) => t.terrain === "desert");
  s.turn = {
    hasRolled: true,
    dice: [3, 4],
    mustMoveRobber: false,
    freeRoads: 0,
    devPlayedThisTurn: false,
  };
  return s;
}

test("setup drives a real snake-order start into the play phase", () => {
  const { s } = runSetup(["A", "B", "C", "D"]);
  expect(s.phase).toBe("play");
  const placed = s.seats.reduce((n, st) => n + st.buildings.settlements.length, 0);
  expect(placed).toBe(8); // 4 players x 2 settlements
});

test("building a winning road triggers longest-road award, victory and finish", () => {
  const s = playState();
  // seat 0 sits at 8 VP: 3 cities (6) + 2 settlements (2), on far vertices
  s.seats[0]!.buildings.cities = [1, 2, 3];
  s.seats[0]!.buildings.settlements = [5, 7];
  // a 4-edge road path (below the longest-road threshold of 5)
  const { edges } = buildPath(20, 5);
  s.seats[0]!.buildings.roads = edges.slice(0, 4);
  s.seats[0]!.resources = { brick: 1, wood: 1, sheep: 0, wheat: 0, ore: 0 };
  expect(victoryPoints(s, 0)).toBe(8);

  const fifth = edges[4]!;
  const r = apply(s, { type: "buildRoad", edge: fifth }, 0);
  expect(r.events!.some((e) => e.type === "award")).toBe(true);
  expect(r.events!.some((e) => e.type === "win" && e.seat === 0)).toBe(true);
  expect(r.state!.phase).toBe("finished");
  expect(r.state!.winner).toBe(0);
});

test("apply does not mutate a deeply frozen input state", () => {
  const s = playState();
  s.seats[0]!.resources = { brick: 5, wood: 5, sheep: 5, wheat: 5, ore: 5 };
  s.seats[0]!.buildings.settlements.push(20);
  const e = vertexEdges(20)[0]!;
  deepFreeze(s);
  const r = apply(s, { type: "buildRoad", edge: e }, 0);
  expect(r.state).toBeTruthy();
  expect(r.state!.seats[0]!.buildings.roads).toContain(e);
});

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) deepFreeze(v);
    Object.freeze(obj);
  }
  return obj;
}
