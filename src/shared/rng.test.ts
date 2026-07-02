import { makeRng, shuffle, randInt, rollDie } from "./rng";

test("deterministic for same seed", () => {
  const a = makeRng("x"),
    b = makeRng("x");
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});

test("differs across seeds", () => {
  expect(makeRng("a")()).not.toBe(makeRng("b")());
});

test("shuffle is a permutation and does not mutate", () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(makeRng("s"), src);
  expect(out).not.toBe(src);
  expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  expect(src).toEqual([1, 2, 3, 4, 5]);
});

test("randInt in range, rollDie 1..6", () => {
  const r = makeRng("d");
  for (let i = 0; i < 200; i++) {
    expect(randInt(r, 7)).toBeGreaterThanOrEqual(0);
    expect(randInt(r, 7)).toBeLessThan(7);
    const d = rollDie(r);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(6);
  }
});
