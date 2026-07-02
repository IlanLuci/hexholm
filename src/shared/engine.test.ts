import { createLobby, addSeat, apply } from "./engine";
import { vertexHexes } from "./board";
import { readyLobby, runSetup } from "./testutil";
import type { Resource } from "./types";

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
