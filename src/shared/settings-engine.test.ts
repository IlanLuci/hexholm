// src/shared/settings-engine.test.ts
import { createLobby, addSeat, apply } from "./engine";
import { hasWon } from "./scoring";

function lobby() {
  let g = createLobby("ROOM", "seed");
  g = addSeat(g, "Host", "human"); // seat 0 = owner
  g = addSeat(g, "Two", "human");  // seat 1
  return g;
}

test("owner sets winVP within range", () => {
  const r = apply(lobby(), { type: "setSettings", winVP: 7 }, 0);
  expect(r.state?.settings.winVP).toBe(7);
});

test("owner sets setupMode", () => {
  const r = apply(lobby(), { type: "setSettings", setupMode: "settlementCity" }, 0);
  expect(r.state?.settings.setupMode).toBe("settlementCity");
});

test("non-owner cannot change settings", () => {
  expect(apply(lobby(), { type: "setSettings", winVP: 8 }, 1).error).toBeTruthy();
});

test("winVP out of range or non-integer is rejected", () => {
  expect(apply(lobby(), { type: "setSettings", winVP: 6 }, 0).error).toBeTruthy();
  expect(apply(lobby(), { type: "setSettings", winVP: 14 }, 0).error).toBeTruthy();
  expect(apply(lobby(), { type: "setSettings", winVP: 9.5 }, 0).error).toBeTruthy();
});

test("invalid setupMode is rejected", () => {
  expect(apply(lobby(), { type: "setSettings", setupMode: "bogus" as never }, 0).error).toBeTruthy();
});

test("setSettings is rejected outside the lobby", () => {
  let g = lobby();
  g.seats.forEach((s) => (s.ready = true));
  g = apply(g, { type: "start" }, 0).state!;
  expect(apply(g, { type: "setSettings", winVP: 8 }, 0).error).toBeTruthy();
});

test("changing settings does not reset ready flags", () => {
  let g = lobby();
  g = apply(g, { type: "ready", ready: true }, 1).state!;
  g = apply(g, { type: "setSettings", winVP: 12 }, 0).state!;
  expect(g.seats[1]!.ready).toBe(true);
});

test("hasWon respects a custom winVP", () => {
  let g = createLobby("R", "s");
  g = addSeat(g, "A", "human");
  g.seats[0]!.buildings.settlements = [0, 2, 4, 6, 8, 10, 12]; // 7 VP
  g.settings.winVP = 7;
  expect(hasWon(g, 0)).toBe(true);
  g.settings.winVP = 8;
  expect(hasWon(g, 0)).toBe(false);
});
