import { RESOURCES, emptyHand, handTotal } from "./types";

test("hand + resources", () => {
  expect(RESOURCES).toHaveLength(5);
  expect(emptyHand()).toEqual({ brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 });
});

test("handTotal sums", () => {
  expect(handTotal({ brick: 1, wood: 2, sheep: 0, wheat: 3, ore: 1 })).toBe(7);
});
