// Shared helpers for tests (not a *.test.ts file, so not collected as a suite).
import { apply, createLobby, addSeat } from "./engine";
import { VERTEX_COUNT, EDGE_COUNT } from "./board";
import { canPlaceSettlement, canPlaceRoad } from "./legal";
import type { GameState } from "./types";

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
