import { apply } from "./engine";
import { createLobby, makeSeat } from "./setup";
import { vertexEdges, edgeVertices, vertexAdjacent } from "./board";
import type { GameState, Hand } from "./types";

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

const rich: Hand = { brick: 5, wood: 5, sheep: 5, wheat: 5, ore: 5 };

test("build road deducts cost and requires connectivity", () => {
  const s = playState();
  s.seats[0]!.resources = { ...rich };
  // isolated edge with no connection -> illegal
  const isolated = 40;
  expect(apply(s, { type: "buildRoad", edge: isolated }, 0).error).toBeTruthy();
  // give a settlement, then a touching edge is legal
  const v = edgeVertices(isolated)[0];
  s.seats[0]!.buildings.settlements.push(v);
  const r = apply(s, { type: "buildRoad", edge: isolated }, 0);
  expect(r.state!.seats[0]!.buildings.roads).toContain(isolated);
  expect(r.state!.seats[0]!.resources.wood).toBe(4);
  expect(r.state!.seats[0]!.resources.brick).toBe(4);
});

test("free roads consume no resources", () => {
  const s = playState();
  s.seats[0]!.resources = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  s.turn!.freeRoads = 2;
  const v = 12;
  s.seats[0]!.buildings.settlements.push(v);
  const e = vertexEdges(v)[0]!;
  const r = apply(s, { type: "buildRoad", edge: e }, 0).state!;
  expect(r.seats[0]!.buildings.roads).toContain(e);
  expect(r.turn!.freeRoads).toBe(1);
  expect(r.seats[0]!.resources.wood).toBe(0);
});

test("build settlement needs a connecting road and honors distance", () => {
  const s = playState();
  s.seats[0]!.resources = { ...rich };
  const v = 20;
  const e = vertexEdges(v)[0]!;
  s.seats[0]!.buildings.roads.push(e);
  const r = apply(s, { type: "buildSettlement", vertex: v }, 0);
  expect(r.state!.seats[0]!.buildings.settlements).toContain(v);
  expect(r.state!.seats[0]!.resources.wheat).toBe(4);
  // adjacent vertex now blocked by distance rule
  const adj = vertexAdjacent(v)[0]!;
  const adjEdge = vertexEdges(adj)[0]!;
  r.state!.seats[0]!.buildings.roads.push(adjEdge);
  expect(
    apply(r.state!, { type: "buildSettlement", vertex: adj }, 0).error,
  ).toBeTruthy();
});

test("build city upgrades an owned settlement and costs 2 wheat 3 ore", () => {
  const s = playState();
  s.seats[0]!.resources = { ...rich };
  const v = 8;
  s.seats[0]!.buildings.settlements.push(v);
  const r = apply(s, { type: "buildCity", vertex: v }, 0).state!;
  expect(r.seats[0]!.buildings.settlements).not.toContain(v);
  expect(r.seats[0]!.buildings.cities).toContain(v);
  expect(r.seats[0]!.resources.wheat).toBe(3);
  expect(r.seats[0]!.resources.ore).toBe(2);
});

test("cannot afford is rejected", () => {
  const s = playState();
  s.seats[0]!.resources = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  const v = 5;
  const e = vertexEdges(v)[0]!;
  s.seats[0]!.buildings.settlements.push(v);
  expect(apply(s, { type: "buildRoad", edge: e }, 0).error).toBeTruthy();
});

test("piece supply caps builds", () => {
  const s = playState();
  s.seats[0]!.resources = { ...rich };
  s.seats[0]!.buildings.roads = Array.from({ length: 15 }, (_, i) => i);
  const v = 3;
  s.seats[0]!.buildings.settlements.push(v);
  const freeEdge = vertexEdges(v).find((e) => !s.seats[0]!.buildings.roads.includes(e))!;
  expect(apply(s, { type: "buildRoad", edge: freeEdge }, 0).error).toBeTruthy();
});
