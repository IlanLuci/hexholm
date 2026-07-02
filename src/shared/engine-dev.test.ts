import { apply } from "./engine";
import { createLobby, makeSeat } from "./setup";
import { hexVertices } from "./board";
import type { GameState, Hand } from "./types";

function playState(n = 3): GameState {
  const s = createLobby("X", "seed1");
  for (let i = 0; i < n; i++) s.seats.push(makeSeat(i, `P${i}`, "human"));
  s.phase = "play";
  s.turnOrder = s.seats.map((st) => st.id);
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

function numberedHex(s: GameState): number {
  for (let h = 0; h < s.board.tiles.length; h++)
    if (h !== s.robberHex && s.board.tiles[h]!.num !== null) return h;
  throw new Error("none");
}

const rich: Hand = { brick: 3, wood: 3, sheep: 3, wheat: 3, ore: 3 };

test("buyDev draws a card that is not playable the same turn", () => {
  const s = playState();
  s.seats[0]!.resources = { ...rich };
  const r = apply(s, { type: "buyDev" }, 0).state!;
  expect(r.seats[0]!.newDevCards).toHaveLength(1);
  expect(r.seats[0]!.devCards).toHaveLength(0);
  expect(r.devDeck.length).toBe(24);
});

test("only one dev card may be played per turn", () => {
  const s = playState();
  s.seats[0]!.devCards = ["plenty", "mono"];
  const after = apply(
    s,
    { type: "playYearOfPlenty", picks: ["wheat", "ore"] },
    0,
  ).state!;
  expect(after.turn!.devPlayedThisTurn).toBe(true);
  expect(
    apply(after, { type: "playMonopoly", resource: "brick" }, 0).error,
  ).toBeTruthy();
});

test("monopoly takes the named resource from every rival", () => {
  const s = playState();
  s.seats[0]!.devCards = ["mono"];
  s.seats[1]!.resources = { ...rich, wheat: 4 };
  s.seats[2]!.resources = { ...rich, wheat: 2 };
  const r = apply(s, { type: "playMonopoly", resource: "wheat" }, 0).state!;
  expect(r.seats[0]!.resources.wheat).toBe(6);
  expect(r.seats[1]!.resources.wheat).toBe(0);
  expect(r.seats[2]!.resources.wheat).toBe(0);
});

test("year of plenty respects bank stock", () => {
  const s = playState();
  s.seats[0]!.devCards = ["plenty"];
  s.bank.ore = 1;
  const r = apply(
    s,
    { type: "playYearOfPlenty", picks: ["ore", "ore"] },
    0,
  ).state!;
  expect(r.seats[0]!.resources.ore).toBe(1); // only 1 left in bank
  expect(r.bank.ore).toBe(0);
});

test("road building grants two free roads", () => {
  const s = playState();
  s.seats[0]!.devCards = ["road"];
  const r = apply(s, { type: "playRoadBuilding" }, 0).state!;
  expect(r.turn!.freeRoads).toBe(2);
});

test("knight moves the robber, steals, and counts toward the army", () => {
  const s = playState();
  s.seats[0]!.devCards = ["knight"];
  const h = numberedHex(s);
  s.seats[1]!.buildings.settlements.push(hexVertices(h)[0]!);
  s.seats[1]!.resources = { brick: 2, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  const r = apply(s, { type: "playKnight", hex: h, steal: null }, 0).state!;
  expect(r.robberHex).toBe(h);
  expect(r.seats[0]!.playedKnights).toBe(1);
  expect(r.seats[0]!.resources.brick).toBe(1);
  expect(r.seats[1]!.resources.brick).toBe(1);
});

test("bank trade uses the best available ratio", () => {
  const s = playState();
  s.seats[0]!.resources = { brick: 4, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  // no ports -> 4:1
  const r4 = apply(s, { type: "bankTrade", give: "brick", get: "wheat" }, 0).state!;
  expect(r4.seats[0]!.resources.brick).toBe(0);
  expect(r4.seats[0]!.resources.wheat).toBe(1);
  // with a wheat 2:1 port, 2 wheat -> 1 anything
  const wheatPort = s.board.ports.find((p) => p.type === "wheat")!;
  s.seats[0]!.buildings.settlements.push(wheatPort.vertices[0]);
  s.seats[0]!.resources = { brick: 0, wood: 0, sheep: 0, wheat: 2, ore: 0 };
  const r2 = apply(s, { type: "bankTrade", give: "wheat", get: "ore" }, 0).state!;
  expect(r2.seats[0]!.resources.wheat).toBe(0);
  expect(r2.seats[0]!.resources.ore).toBe(1);
});

test("player trade: propose, accept, confirm swaps resources", () => {
  const s = playState();
  s.seats[0]!.resources = { brick: 2, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  s.seats[1]!.resources = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 2 };
  let g = apply(
    s,
    { type: "proposeTrade", give: { brick: 1 }, get: { ore: 1 } },
    0,
  ).state!;
  expect(g.trade!.responses).toEqual({ 1: "pending", 2: "pending" });
  g = apply(g, { type: "respondTrade", accept: true }, 1).state!;
  // proposer cannot confirm with a non-accepting seat
  expect(apply(g, { type: "confirmTrade", withSeat: 2 }, 0).error).toBeTruthy();
  const done = apply(g, { type: "confirmTrade", withSeat: 1 }, 0).state!;
  expect(done.trade).toBeNull();
  expect(done.seats[0]!.resources.brick).toBe(1);
  expect(done.seats[0]!.resources.ore).toBe(1);
  expect(done.seats[1]!.resources.brick).toBe(1);
  expect(done.seats[1]!.resources.ore).toBe(1);
});

test("cannot confirm a trade with a seat that no longer holds the goods", () => {
  const s = playState();
  s.seats[0]!.resources = { brick: 1, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  s.seats[1]!.resources = { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  let g = apply(
    s,
    { type: "proposeTrade", give: { brick: 1 }, get: { ore: 1 } },
    0,
  ).state!;
  g = apply(g, { type: "respondTrade", accept: true }, 1).state!;
  expect(apply(g, { type: "confirmTrade", withSeat: 1 }, 0).error).toBeTruthy();
});
