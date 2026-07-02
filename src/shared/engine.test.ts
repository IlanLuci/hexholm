import { createLobby, addSeat, apply } from "./engine";
import type { GameState } from "./types";

function readyLobby(names: string[]): GameState {
  let s = createLobby("ABCD", "seed1");
  for (const n of names) s = addSeat(s, n, "human");
  s.seats.forEach((_, i) => {
    s = apply(s, { type: "ready", ready: true }, i).state!;
  });
  return s;
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
