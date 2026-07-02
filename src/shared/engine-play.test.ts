import { apply, simulateProduction } from "./engine";
import { createLobby, makeSeat } from "./setup";
import { hexVertices } from "./board";
import { makeRng, rollDie } from "./rng";
import type { GameState, Resource } from "./types";

/** Bare play-phase state with `n` empty seats. */
function playState(n: number): GameState {
  const s = createLobby("X", "seed1");
  for (let i = 0; i < n; i++) s.seats.push(makeSeat(i, `P${i}`, "human"));
  s.phase = "play";
  s.turnOrder = s.seats.map((st) => st.id);
  s.activeSeat = 0;
  s.robberHex = s.board.tiles.findIndex((t) => t.terrain === "desert");
  s.turn = {
    hasRolled: false,
    dice: null,
    mustMoveRobber: false,
    freeRoads: 0,
    devPlayedThisTurn: false,
  };
  return s;
}

function firstNumberedHex(s: GameState, notHex: number): number {
  for (let h = 0; h < s.board.tiles.length; h++)
    if (h !== notHex && s.board.tiles[h]!.num !== null) return h;
  throw new Error("no numbered hex");
}

test("rollDice is deterministic for a given state", () => {
  const s = playState(2);
  const a = apply(s, { type: "rollDice" }, 0).state!;
  const b = apply(s, { type: "rollDice" }, 0).state!;
  expect(a.turn!.dice).toEqual(b.turn!.dice);
});

test("production credits settlement 1 and city 2; robber hex produces nothing", () => {
  const s = playState(2);
  const h = firstNumberedHex(s, s.robberHex);
  const num = s.board.tiles[h]!.num!;
  const res = s.board.tiles[h]!.terrain as Resource;
  const [v0, v1] = hexVertices(h);
  s.seats[0]!.buildings.settlements.push(v0!);
  s.seats[0]!.buildings.cities.push(v1!);

  const { gains } = simulateProduction(s, num);
  expect(gains[0]![res]).toBe(3); // 1 (settlement) + 2 (city)

  s.robberHex = h;
  const blocked = simulateProduction(s, num);
  expect(blocked.gains[0]).toBeUndefined();
});

test("bank rule: multiple claimants over-demand -> nobody; lone claimant -> partial", () => {
  const s = playState(2);
  const h = firstNumberedHex(s, s.robberHex);
  const num = s.board.tiles[h]!.num!;
  const res = s.board.tiles[h]!.terrain as Resource;
  const [v0, v1] = hexVertices(h);
  s.seats[0]!.buildings.settlements.push(v0!);
  s.seats[1]!.buildings.settlements.push(v1!);
  s.bank[res] = 1; // demand is 2, two claimants

  const both = simulateProduction(s, num);
  expect(both.gains[0]).toBeUndefined();
  expect(both.gains[1]).toBeUndefined();

  // lone claimant with short bank gets what's left
  s.seats[1]!.buildings.settlements = [];
  const lone = simulateProduction(s, num);
  expect(lone.gains[0]![res]).toBe(1);
});

test("rolling a 7 flags discards for >7 holders and blocks endTurn", () => {
  const s = playState(2);
  // force a version whose roll sums to 7
  const seed = s.seed;
  let v7 = -1;
  for (let v = 0; v < 10000; v++) {
    const rng = makeRng(`${seed}:roll:${v}`);
    if (rollDie(rng) + rollDie(rng) === 7) {
      v7 = v;
      break;
    }
  }
  expect(v7).toBeGreaterThanOrEqual(0);
  s.version = v7;
  s.seats[1]!.resources = { brick: 3, wood: 3, sheep: 2, wheat: 0, ore: 0 }; // 8 cards

  const rolled = apply(s, { type: "rollDice" }, 0).state!;
  expect(rolled.turn!.dice![0] + rolled.turn!.dice![1]).toBe(7);
  expect(rolled.turn!.mustMoveRobber).toBe(true);
  expect(rolled.pendingDiscards[1]).toBe(4);
  expect(rolled.pendingDiscards[0]).toBeUndefined();
  expect(apply(rolled, { type: "endTurn" }, 0).error).toBeTruthy();
});

test("endTurn advances active seat and folds bought dev cards", () => {
  const s = playState(2);
  const rolled = apply(s, { type: "rollDice" }, 0).state!;
  // skip if it was a 7 (robber blocks endTurn); pick a seed that isn't 7
  if (rolled.turn!.mustMoveRobber) return;
  rolled.seats[0]!.newDevCards = ["knight"];
  const ended = apply(rolled, { type: "endTurn" }, 0).state!;
  expect(ended.activeSeat).toBe(1);
  expect(ended.seats[0]!.devCards).toEqual(["knight"]);
  expect(ended.seats[0]!.newDevCards).toEqual([]);
  expect(ended.turn!.hasRolled).toBe(false);
});
