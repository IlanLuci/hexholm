// src/client/offlineGame.test.ts
import { createOfflineDriver, type OfflineTimers } from "./offlineGame";
import { vertexEdges } from "../shared/board";

/** A synchronous timer queue so the bot loop can be driven without real time. */
function manualTimers() {
  const q: { id: number; fn: () => void }[] = [];
  let seq = 1;
  const timers: OfflineTimers = {
    set: (fn) => { const id = seq++; q.push({ id, fn }); return id; },
    clear: (id) => { const i = q.findIndex((t) => t.id === id); if (i >= 0) q.splice(i, 1); },
  };
  return {
    timers,
    pending: () => q.length,
    drain: (max = 5000) => { let n = 0; while (q.length && n++ < max) q.shift()!.fn(); },
  };
}

test("start(3) builds a 4-seat setup game: 1 human + 3 bots, all ready, human seat 0", () => {
  const mt = manualTimers();
  const d = createOfflineDriver({ onChange: () => {}, timers: mt.timers, seed: () => "seed-x" });
  d.start(3, "Me");
  const v = d.view()!;
  expect(v.phase).toBe("setup");
  expect(v.seats.length).toBe(4);
  expect(v.seats.filter((s) => s.kind === "human").length).toBe(1);
  expect(v.seats.filter((s) => s.kind === "bot").length).toBe(3);
  expect(v.seats.every((s) => s.ready)).toBe(true);
  expect(v.seats[0]!.kind).toBe("human");
});

test("start(2) builds a 3-seat game", () => {
  const mt = manualTimers();
  const d = createOfflineDriver({ onChange: () => {}, timers: mt.timers, seed: () => "seed-y" });
  d.start(2, "Me");
  expect(d.view()!.seats.length).toBe(3);
});

test("the human moves first; no bot timer is armed until the human has acted", () => {
  const mt = manualTimers();
  const d = createOfflineDriver({ onChange: () => {}, timers: mt.timers, seed: () => "seed-z" });
  d.start(3, "Me");
  expect(d.view()!.activeSeat).toBe(0);
  expect(mt.pending()).toBe(0);
});

test("after the human's setup placement, bots take over, advance, and pause back at the human", () => {
  const mt = manualTimers();
  const d = createOfflineDriver({ onChange: () => {}, timers: mt.timers, seed: () => "seed-w" });
  d.start(3, "Me");
  const before = d.view()!.version;
  d.send({ type: "placeSettlement", vertex: 0 });
  d.send({ type: "placeRoad", edge: vertexEdges(0)[0]! });
  expect(d.view()!.version).toBeGreaterThan(before);
  const v = d.view()!;
  expect(v.seats[v.activeSeat]!.kind).toBe("bot"); // control passed to a bot
  expect(mt.pending()).toBe(1);                     // a bot step is scheduled
  mt.drain();
  expect(mt.pending()).toBe(0);                     // loop paused for human input
});

test("leave() cancels timers and drops the game", () => {
  const mt = manualTimers();
  const d = createOfflineDriver({ onChange: () => {}, timers: mt.timers, seed: () => "s" });
  d.start(3, "Me");
  d.send({ type: "placeSettlement", vertex: 0 });
  d.send({ type: "placeRoad", edge: vertexEdges(0)[0]! });
  expect(mt.pending()).toBe(1);
  d.leave();
  expect(d.snapshot()).toBeNull();
});
