import { generateBoard } from "./setup";

test("board has 19 tiles with correct terrain multiset", () => {
  const b = generateBoard("seed1");
  expect(b.tiles).toHaveLength(19);
  const count = (t: string) => b.tiles.filter((x) => x.terrain === t).length;
  expect(count("wood")).toBe(4);
  expect(count("sheep")).toBe(4);
  expect(count("wheat")).toBe(4);
  expect(count("brick")).toBe(3);
  expect(count("ore")).toBe(3);
  expect(count("desert")).toBe(1);
});

test("desert has no number, others do; token multiset correct", () => {
  const b = generateBoard("seed1");
  const desert = b.tiles.filter((t) => t.terrain === "desert");
  expect(desert[0]!.num).toBeNull();
  const nums = b.tiles.filter((t) => t.terrain !== "desert").map((t) => t.num!);
  expect(nums).toHaveLength(18);
  expect(nums.filter((n) => n === 6)).toHaveLength(2);
  expect(nums.filter((n) => n === 2)).toHaveLength(1);
  expect(nums.filter((n) => n === 7)).toHaveLength(0);
});

test("9 ports: 4 any + one of each resource", () => {
  const b = generateBoard("seed1");
  expect(b.ports).toHaveLength(9);
  expect(b.ports.filter((p) => p.type === "any")).toHaveLength(4);
  for (const r of ["brick", "wood", "sheep", "wheat", "ore"])
    expect(b.ports.filter((p) => p.type === r)).toHaveLength(1);
});

test("deterministic per seed", () => {
  expect(generateBoard("s")).toEqual(generateBoard("s"));
});
