import { apply } from "./engine";
import { createLobby, makeSeat } from "./setup";
import { hexVertices } from "./board";
import type { GameState, Hand } from "./types";

function robberState(): GameState {
  const s = createLobby("X", "seed1");
  s.seats.push(makeSeat(0, "P0", "human"));
  s.seats.push(makeSeat(1, "P1", "human"));
  s.seats.push(makeSeat(2, "P2", "human"));
  s.phase = "play";
  s.turnOrder = [0, 1, 2];
  s.activeSeat = 0;
  s.robberHex = s.board.tiles.findIndex((t) => t.terrain === "desert");
  s.turn = {
    hasRolled: true,
    dice: [3, 4],
    mustMoveRobber: true,
    freeRoads: 0,
    devPlayedThisTurn: false,
  };
  return s;
}

function numberedHex(s: GameState): number {
  for (let h = 0; h < s.board.tiles.length; h++)
    if (h !== s.robberHex && s.board.tiles[h]!.num !== null) return h;
  throw new Error("none");
}

const some: Hand = { brick: 2, wood: 1, sheep: 0, wheat: 0, ore: 0 };

test("discard must match the required count and holdings", () => {
  const s = robberState();
  s.pendingDiscards = { 1: 2 };
  s.seats[1]!.resources = { brick: 2, wood: 2, sheep: 0, wheat: 0, ore: 0 };
  expect(
    apply(s, { type: "discard", hand: { brick: 1 } }, 1).error,
  ).toBeTruthy(); // too few
  expect(
    apply(s, { type: "discard", hand: { sheep: 2 } }, 1).error,
  ).toBeTruthy(); // not held
  const r = apply(s, { type: "discard", hand: { brick: 2 } }, 1).state!;
  expect(r.pendingDiscards[1]).toBeUndefined();
  expect(r.seats[1]!.resources.brick).toBe(0);
});

test("cannot move robber while discards pending", () => {
  const s = robberState();
  s.pendingDiscards = { 1: 2 };
  const h = numberedHex(s);
  expect(apply(s, { type: "moveRobber", hex: h, steal: null }, 0).error).toBeTruthy();
});

test("robber cannot stay on its hex", () => {
  const s = robberState();
  expect(
    apply(s, { type: "moveRobber", hex: s.robberHex, steal: null }, 0).error,
  ).toBeTruthy();
});

test("moving robber onto a lone victim auto-steals one card", () => {
  const s = robberState();
  const h = numberedHex(s);
  const v = hexVertices(h)[0]!;
  s.seats[1]!.buildings.settlements.push(v);
  s.seats[1]!.resources = { ...some }; // 3 cards
  const r = apply(s, { type: "moveRobber", hex: h, steal: null }, 0).state!;
  expect(r.robberHex).toBe(h);
  expect(r.turn!.mustMoveRobber).toBe(false);
  const stolenTotal =
    r.seats[0]!.resources.brick +
    r.seats[0]!.resources.wood +
    r.seats[0]!.resources.sheep +
    r.seats[0]!.resources.wheat +
    r.seats[0]!.resources.ore;
  expect(stolenTotal).toBe(1);
});

test("two victims require a steal choice; then resolve", () => {
  const s = robberState();
  const h = numberedHex(s);
  const [v0, v1] = hexVertices(h);
  s.seats[1]!.buildings.settlements.push(v0!);
  s.seats[1]!.resources = { ...some };
  s.seats[2]!.buildings.settlements.push(v1!);
  s.seats[2]!.resources = { ...some };
  const moved = apply(s, { type: "moveRobber", hex: h, steal: null }, 0).state!;
  expect(moved.steal!.candidates.sort()).toEqual([1, 2]);
  const done = apply(moved, { type: "moveRobber", hex: h, steal: 2 }, 0).state!;
  expect(done.steal).toBeNull();
  expect(
    done.seats[2]!.resources.brick +
      done.seats[2]!.resources.wood +
      done.seats[2]!.resources.sheep,
  ).toBe(2); // lost one of its 3
});

test("no victims -> robber moves with no steal", () => {
  const s = robberState();
  const h = numberedHex(s);
  const r = apply(s, { type: "moveRobber", hex: h, steal: null }, 0).state!;
  expect(r.robberHex).toBe(h);
  expect(r.steal).toBeNull();
  expect(r.turn!.mustMoveRobber).toBe(false);
});
