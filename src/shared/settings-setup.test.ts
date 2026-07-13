import { createLobby, addSeat, apply } from "./engine";
import { stepBots, driveBots } from "./bots";
import { victoryPoints } from "./scoring";
import type { GameState } from "./types";

/** Drive the (all-bot) setup to completion, one bot action at a time. */
function runSetupBots(mode: "settlements" | "settlementCity"): GameState {
  let g = createLobby("R", "seed-" + mode);
  for (const n of ["Ava", "B040", "Cyrus"]) g = addSeat(g, n, "bot");
  g.settings.setupMode = mode;
  g = apply(g, { type: "start" }, 0).state!;
  let guard = 0;
  while (g.phase === "setup" && guard++ < 300) {
    const r = stepBots(g);
    if (!r.acted) break;
    g = r.state;
  }
  return g;
}

test("settlementCity: each seat ends setup with 1 settlement + 1 city (3 VP)", () => {
  const g = runSetupBots("settlementCity");
  expect(g.phase).not.toBe("setup"); // setup completed
  for (const s of g.seats) {
    expect(s.buildings.settlements.length).toBe(1);
    expect(s.buildings.cities.length).toBe(1);
  }
  expect(victoryPoints(g, 0)).toBe(3);
});

test("default settlements mode: each seat ends setup with 2 settlements (2 VP)", () => {
  const g = runSetupBots("settlements");
  for (const s of g.seats) {
    expect(s.buildings.settlements.length).toBe(2);
    expect(s.buildings.cities.length).toBe(0);
  }
  expect(victoryPoints(g, 0)).toBe(2);
});

test("settlementCity full bot game still reaches a winner", () => {
  let g = createLobby("R", "seed-city-full");
  for (const n of ["Ava", "B040", "Cyrus", "Dorn"]) g = addSeat(g, n, "bot");
  g.settings.setupMode = "settlementCity";
  g = apply(g, { type: "start" }, 0).state!;
  const { state } = driveBots(g);
  expect(state.phase).toBe("finished");
  expect(state.winner).not.toBeNull();
});
