import { createLobby, addSeat, apply } from "../shared/engine";
import { driveBots } from "./bots";
import { victoryPoints } from "../shared/scoring";

function allBotGame(seed: string, names = ["Ava", "B040", "Cyrus", "Dorn"]) {
  let s = createLobby("BOTS", seed);
  for (const n of names) s = addSeat(s, n, "bot");
  s = apply(s, { type: "start" }, 0).state!;
  return s;
}

test("a table of bots completes setup and plays real turns", () => {
  const started = allBotGame("seed-a");
  const { state } = driveBots(started);
  // setup produced 2 settlements + 2 roads per bot
  for (const seat of state.seats) {
    expect(seat.buildings.settlements.length + seat.buildings.cities.length).toBeGreaterThanOrEqual(2);
  }
  // the game advanced well beyond setup
  expect(state.version).toBeGreaterThan(50);
});

test("a table of bots drives the game to a winner", () => {
  const started = allBotGame("seed-b");
  const { state } = driveBots(started);
  expect(state.phase).toBe("finished");
  expect(state.winner).not.toBeNull();
  expect(victoryPoints(state, state.winner!)).toBeGreaterThanOrEqual(10);
});

test("bots never leave the game in a stuck play state within the step budget", () => {
  for (const seed of ["s1", "s2", "s3"]) {
    const { state } = driveBots(allBotGame(seed));
    expect(state.phase).toBe("finished");
  }
});
