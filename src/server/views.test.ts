import { createLobby, makeSeat } from "../shared/setup";
import { toView } from "./views";
import type { GameState } from "../shared/types";

function twoSeatGame(): GameState {
  const s = createLobby("ROOM", "seed1");
  s.seats.push(makeSeat(0, "You", "human"));
  s.seats.push(makeSeat(1, "Ava", "bot"));
  s.phase = "play";
  s.seats[0]!.resources = { brick: 2, wood: 1, sheep: 0, wheat: 0, ore: 0 };
  s.seats[0]!.devCards = ["knight", "vp"];
  s.seats[1]!.resources = { brick: 1, wood: 1, sheep: 1, wheat: 0, ore: 0 };
  s.seats[1]!.devCards = ["mono"];
  return s;
}

test("viewer sees their own hand but only counts for others", () => {
  const s = twoSeatGame();
  const view = toView(s, 0);
  expect(view.youSeat).toBe(0);
  expect(view.seats[0]!.resources).toEqual(s.seats[0]!.resources);
  expect(view.seats[0]!.devCards).toEqual(["knight", "vp"]);
  expect(view.seats[0]!.isYou).toBe(true);
  // opponent: hidden
  expect(view.seats[1]!.resources).toBeUndefined();
  expect(view.seats[1]!.devCards).toBeUndefined();
  expect(view.seats[1]!.handCount).toBe(3);
  expect(view.seats[1]!.devCount).toBe(1);
});

test("hidden VP cards are not leaked via publicVP", () => {
  const s = twoSeatGame();
  s.seats[1]!.buildings.settlements = [1, 2];
  s.seats[1]!.devCards = ["vp"]; // secret point
  const view = toView(s, 0);
  expect(view.seats[1]!.publicVP).toBe(2); // 2 settlements only, VP card hidden
});

test("devDeckCount replaces the deck contents", () => {
  const s = twoSeatGame();
  const view = toView(s, 0);
  expect(view.devDeckCount).toBe(s.devDeck.length);
  expect((view as unknown as { devDeck?: unknown }).devDeck).toBeUndefined();
});

test("toView exposes settings and marks seat 0 as the owner", () => {
  const s = twoSeatGame();
  s.settings = { winVP: 8, setupMode: "settlementCity" };
  expect(toView(s, 0).settings).toEqual({ winVP: 8, setupMode: "settlementCity" });
  expect(toView(s, 0).youAreOwner).toBe(true);
  expect(toView(s, 1).youAreOwner).toBe(false);
});
