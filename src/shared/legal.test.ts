import { createLobby } from "./setup";
import { vertexAdjacent, vertexEdges, edgeVertices } from "./board";
import {
  canPlaceSettlement,
  canPlaceRoad,
  canPlaceCity,
  tradeRatio,
} from "./legal";
import type { GameState } from "./types";

function twoSeatState(): GameState {
  const s = createLobby("X", "seed1");
  s.seats.push({
    id: 0,
    name: "A",
    color: "#000",
    kind: "human",
    connected: true,
    ready: true,
    resources: { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 },
    devCards: [],
    newDevCards: [],
    playedKnights: 0,
    buildings: { settlements: [], cities: [], roads: [] },
  });
  s.phase = "play";
  s.turnOrder = [0];
  return s;
}

test("distance rule blocks adjacent settlements", () => {
  const s = twoSeatState();
  s.seats[0]!.buildings.settlements.push(0);
  const adj = vertexAdjacent(0)[0]!;
  expect(canPlaceSettlement(s, 0, adj, { setup: true })).toBe(false);
});

test("settlement in play requires a connecting road", () => {
  const s = twoSeatState();
  // an isolated empty vertex far from anything
  const far = 30;
  expect(canPlaceSettlement(s, 0, far, { setup: false })).toBe(false);
  // add a road touching it, then it's allowed
  const e = vertexEdges(far)[0]!;
  s.seats[0]!.buildings.roads.push(e);
  expect(canPlaceSettlement(s, 0, far, { setup: false })).toBe(true);
});

test("occupied vertex cannot be settled", () => {
  const s = twoSeatState();
  s.seats[0]!.buildings.settlements.push(5);
  expect(canPlaceSettlement(s, 0, 5, { setup: true })).toBe(false);
});

test("road in setup must touch the given vertex", () => {
  const s = twoSeatState();
  const v = 10;
  const good = vertexEdges(v)[0]!;
  const [a, b] = edgeVertices(good);
  const other = a === v ? b : a;
  const bad = vertexEdges(other).find((e) => !edgeVertices(e).includes(v))!;
  expect(canPlaceRoad(s, 0, good, { mustTouchVertex: v })).toBe(true);
  expect(canPlaceRoad(s, 0, bad, { mustTouchVertex: v })).toBe(false);
});

test("canPlaceCity requires the seat's own settlement", () => {
  const s = twoSeatState();
  expect(canPlaceCity(s, 0, 7)).toBe(false);
  s.seats[0]!.buildings.settlements.push(7);
  expect(canPlaceCity(s, 0, 7)).toBe(true);
});

test("tradeRatio uses ports the seat touches", () => {
  const s = twoSeatState();
  const port = s.board.ports.find((p) => p.type === "wheat")!;
  s.seats[0]!.buildings.settlements.push(port.vertices[0]);
  expect(tradeRatio(s, 0, "wheat")).toBe(2);
  // a resource with no owned matching port defaults to 4 (unless generic port)
  const anyPort = s.board.ports.find((p) => p.type === "any")!;
  s.seats[0]!.buildings.settlements.push(anyPort.vertices[0]);
  expect(tradeRatio(s, 0, "ore")).toBe(3);
});
