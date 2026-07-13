import { nextForming, deadlineBots, TARGET_SEATS, FORMING_MS, MATCH_DEADLINE_MS } from "./quickmatch";
import { test, expect } from "vitest";

test("invariant: forming window shorter than start deadline", () => {
  expect(FORMING_MS).toBeLessThan(MATCH_DEADLINE_MS);
  expect(TARGET_SEATS).toBe(4);
});

test("second claim inside the window joins the same forming match", () => {
  const codes = ["AAAA", "BBBB"];
  let i = 0;
  const mint = () => codes[i++]!;
  const first = nextForming(null, 1000, mint);
  expect(first).toEqual({ code: "AAAA", size: 1, expires: 1000 + FORMING_MS });
  const second = nextForming(first, 1100, mint);
  expect(second).toEqual({ code: "AAAA", size: 2, expires: 1000 + FORMING_MS });
});

test("claim after the window expired rolls to a fresh code", () => {
  const mint = () => "CCCC";
  const cur = { code: "AAAA", size: 2, expires: 5000 };
  const next = nextForming(cur, 5000, mint);
  expect(next).toEqual({ code: "CCCC", size: 1, expires: 5000 + FORMING_MS });
});

test("claim past the 4-cap rolls to a fresh code even inside the window", () => {
  const mint = () => "DDDD";
  const cur = { code: "AAAA", size: 4, expires: 9999 };
  const next = nextForming(cur, 500, mint);
  expect(next).toEqual({ code: "DDDD", size: 1, expires: 500 + FORMING_MS });
});

test("deadlineBots fills toward four, keeps three-human tables all-human, skips empty", () => {
  expect(deadlineBots(0)).toBeNull();
  expect(deadlineBots(1)).toBe(3);
  expect(deadlineBots(2)).toBe(2);
  expect(deadlineBots(3)).toBe(0);
  expect(deadlineBots(4)).toBe(0);
});
