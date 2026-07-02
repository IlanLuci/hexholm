import { createLobby, addSeat, apply } from "./engine";
import { VERTEX_COUNT, EDGE_COUNT, vertexHexes } from "./board";
import { canPlaceSettlement, canPlaceRoad } from "./legal";
import type { GameState, Resource } from "./types";

export function readyLobby(names: string[]): GameState {
  let s = createLobby("ABCD", "seed1");
  for (const n of names) s = addSeat(s, n, "human");
  s.seats.forEach((_, i) => {
    s = apply(s, { type: "ready", ready: true }, i).state!;
  });
  return s;
}

function firstLegalSettlement(s: GameState, seat: number): number {
  for (let v = 0; v < VERTEX_COUNT; v++)
    if (canPlaceSettlement(s, seat, v, { setup: true })) return v;
  throw new Error("no legal settlement");
}

function firstLegalRoad(s: GameState, seat: number, touch: number): number {
  for (let e = 0; e < EDGE_COUNT; e++)
    if (canPlaceRoad(s, seat, e, { mustTouchVertex: touch })) return e;
  throw new Error("no legal road");
}

/** Drive the snake-order setup to completion; return final state + 2nd settlements. */
export function runSetup(names: string[]): {
  s: GameState;
  secondVerts: Record<number, number>;
} {
  let s = apply(readyLobby(names), { type: "start" }, 0).state!;
  const secondVerts: Record<number, number> = {};
  const n = names.length;
  for (let k = 0; k < 2 * n; k++) {
    const seat = s.activeSeat;
    const round = s.setup!.round;
    const v = firstLegalSettlement(s, seat);
    s = apply(s, { type: "placeSettlement", vertex: v }, seat).state!;
    if (round === 2) secondVerts[seat] = v;
    const e = firstLegalRoad(s, seat, s.setup!.lastVertex!);
    s = apply(s, { type: "placeRoad", edge: e }, seat).state!;
  }
  return { s, secondVerts };
}

test("addSeat then start enters setup with snake order", () => {
  const s = readyLobby(["You", "Ava"]);
  const r = apply(s, { type: "start" }, 0);
  expect(r.state!.phase).toBe("setup");
  expect(r.state!.setup).toEqual({ round: 1, step: "settle", lastVertex: null });
  expect(r.state!.activeSeat).toBe(r.state!.turnOrder[0]);
});

test("cannot start with <2 seats", () => {
  let s = addSeat(createLobby("X", "s"), "Solo", "human");
  s = apply(s, { type: "ready", ready: true }, 0).state!;
  expect(apply(s, { type: "start" }, 0).error).toBeTruthy();
});

test("cannot start unless all ready", () => {
  let s = createLobby("X", "s");
  s = addSeat(s, "A", "human");
  s = addSeat(s, "B", "human");
  s = apply(s, { type: "ready", ready: true }, 0).state!;
  expect(apply(s, { type: "start" }, 0).error).toBeTruthy();
});

test("addBot fills a ready seat", () => {
  let s = addSeat(createLobby("X", "s"), "A", "human");
  s = apply(s, { type: "addBot" }, 0).state!;
  expect(s.seats).toHaveLength(2);
  expect(s.seats[1]!.kind).toBe("bot");
  expect(s.seats[1]!.ready).toBe(true);
});

test("apply never mutates input", () => {
  const s = addSeat(createLobby("X", "s"), "A", "human");
  const before = JSON.stringify(s);
  apply(s, { type: "setName", name: "B" }, 0);
  expect(JSON.stringify(s)).toBe(before);
});

test("not-your-turn is rejected in setup", () => {
  const s = apply(readyLobby(["A", "B"]), { type: "start" }, 0).state!;
  const notActive = s.turnOrder[1]!;
  expect(
    apply(s, { type: "placeSettlement", vertex: 0 }, notActive).error,
  ).toBeTruthy();
});

test("setup completes -> play phase, first player to roll, each has 2 settlements + 2 roads", () => {
  const { s } = runSetup(["A", "B", "C"]);
  expect(s.phase).toBe("play");
  expect(s.activeSeat).toBe(s.turnOrder[0]);
  expect(s.turn).toEqual({
    hasRolled: false,
    dice: null,
    mustMoveRobber: false,
    freeRoads: 0,
    devPlayedThisTurn: false,
  });
  for (const seat of s.seats) {
    expect(seat.buildings.settlements).toHaveLength(2);
    expect(seat.buildings.roads).toHaveLength(2);
  }
});

test("second settlement grants adjacent resources", () => {
  const { s, secondVerts } = runSetup(["A", "B"]);
  for (const seat of s.seats) {
    const v = secondVerts[seat.id]!;
    const expected: Record<Resource, number> = {
      brick: 0,
      wood: 0,
      sheep: 0,
      wheat: 0,
      ore: 0,
    };
    for (const h of vertexHexes(v)) {
      const t = s.board.tiles[h]!;
      if (t.terrain !== "desert") expected[t.terrain] += 1;
    }
    expect(seat.resources).toEqual(expected);
  }
});
