# Hexholm Phase 1 — Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, server-authoritative base-Catan rules engine in `src/shared/` — deterministic, fully unit-tested, with no I/O — so a complete game can be driven to a win in tests with no network.

**Architecture:** A pure reducer `apply(state, action, seat) → { state, events } | { error }`. All randomness flows through a seeded RNG carried in `GameState.seed`. Board geometry is generated deterministically; game setup randomizes tile/token/port placement via the seed. No mutation of inputs — every action returns a new state or an error.

**Tech Stack:** TypeScript, Vitest. No runtime dependencies in `src/shared/` (pure functions only). Node 20+.

## Global Constraints

- Language: TypeScript, `strict: true`. Target ES2022, module ESNext.
- `src/shared/` has **zero runtime dependencies** and performs **no I/O** (no `Date.now`, no `Math.random`, no `crypto` outside a seeded helper) — determinism is required.
- All randomness draws from `GameState.seed` via `src/shared/rng.ts`.
- Resources: `brick | wood | sheep | wheat | ore`. Terrain adds `desert`. Prototype display names: brick=Brick, wood=Lumber, sheep=Wool, wheat=Grain, ore=Ore.
- Standard board: 19 hexes (4 wood, 4 sheep, 4 wheat, 3 brick, 3 ore, 1 desert), 54 vertices, 72 edges, 18 number tokens (2×1, 3×2, 4×2, 5×2, 6×2, 8×2, 9×2, 10×2, 11×2, 12×1), 9 ports (4 generic 3:1 + one 2:1 each of the 5 resources).
- Costs: road = 1 wood + 1 brick; settlement = 1 wood + 1 brick + 1 sheep + 1 wheat; city = 2 wheat + 3 ore; dev card = 1 sheep + 1 wheat + 1 ore.
- Win at 10 VP, checked after every applied action, on the acting seat only.
- Never mutate the input state; `apply` is pure.

---

## File Structure

- `src/shared/rng.ts` — seedable deterministic RNG (mulberry32 over a hashed string seed) + `shuffle`.
- `src/shared/board.ts` — static hex/vertex/edge geometry + adjacency; `PIXEL` projection for rendering; standard port slots.
- `src/shared/types.ts` — `Resource`, `Terrain`, `DevKind`, ids, `Board`, `Seat`, `GameState`, `LogEntry`.
- `src/shared/actions.ts` — `Action` discriminated union + `GameEvent` union.
- `src/shared/setup.ts` — `generateBoard(seed)`: randomized tiles/tokens/ports on the static geometry.
- `src/shared/legal.ts` — pure predicates: `canPlaceSettlement`, `canPlaceRoad`, `canPlaceCity`, `legalRobberHexes`, `portsForSeat`, `tradeRatio`.
- `src/shared/scoring.ts` — `longestRoadLength(seat, state)`, `recomputeAwards(state)`, `victoryPoints(state, seat)`.
- `src/shared/engine.ts` — `createLobby`, `apply(state, action, seat)`; per-phase handlers.
- `src/shared/index.ts` — barrel re-exports.
- Tests mirror under `src/shared/*.test.ts`.

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/shared/index.ts`, `src/shared/smoke.test.ts`

**Interfaces:**
- Produces: an `npm test` (Vitest) command that runs `src/**/*.test.ts`; TS strict compilation.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "hexholm",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"],
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true, include: ["src/**/*.test.ts"] } });
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules
dist
.wrangler
```

- [ ] **Step 5: Create `src/shared/index.ts` and a smoke test**

`src/shared/index.ts`:
```ts
export const HEXHOLM = "hexholm";
```
`src/shared/smoke.test.ts`:
```ts
import { HEXHOLM } from "./index";
test("smoke", () => { expect(HEXHOLM).toBe("hexholm"); });
```

- [ ] **Step 6: Install + run**

Run: `npm install && npm test`
Expected: 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold hexholm TS + vitest project"
```

---

### Task 2: Seedable RNG

**Files:**
- Create: `src/shared/rng.ts`, `src/shared/rng.test.ts`

**Interfaces:**
- Produces:
  - `type Rng = () => number` (float in [0,1))
  - `makeRng(seed: string): Rng`
  - `randInt(rng: Rng, nExclusive: number): number`
  - `shuffle<T>(rng: Rng, arr: readonly T[]): T[]` (returns new array)
  - `rollDie(rng: Rng): number` (1–6)

- [ ] **Step 1: Write failing tests**

```ts
import { makeRng, shuffle, randInt, rollDie } from "./rng";
test("deterministic for same seed", () => {
  const a = makeRng("x"), b = makeRng("x");
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
    const d = rollDie(r); expect(d).toBeGreaterThanOrEqual(1); expect(d).toBeLessThanOrEqual(6);
  }
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './rng'`). Run: `npm test -- rng`

- [ ] **Step 3: Implement `src/shared/rng.ts`**

```ts
export type Rng = () => number;

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function makeRng(seed: string): Rng {
  let a = hashSeed(seed) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, nExclusive: number): number {
  return Math.floor(rng() * nExclusive);
}

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function rollDie(rng: Rng): number {
  return randInt(rng, 6) + 1;
}
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test -- rng`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: seedable deterministic RNG"`

---

### Task 3: Board geometry

Static geometry independent of any game: which hexes/vertices/edges exist and how they connect. Uses axial-style layout with explicit adjacency tables derived programmatically so ids are stable.

**Files:**
- Create: `src/shared/board.ts`, `src/shared/board.test.ts`

**Interfaces:**
- Produces:
  - `HEX_COUNT = 19`, `VERTEX_COUNT = 54`, `EDGE_COUNT = 72`
  - `HEX_LAYOUT: { q: number; r: number }[]` (19 axial coords, rows 3-4-5-4-3)
  - `hexVertices(hexId: number): number[]` (6 vertex ids)
  - `hexNeighbors(hexId: number): number[]` (adjacent hex ids)
  - `vertexHexes(vertexId: number): number[]` (1–3 hex ids)
  - `vertexAdjacent(vertexId: number): number[]` (2–3 vertex ids)
  - `vertexEdges(vertexId: number): number[]`
  - `edgeVertices(edgeId: number): [number, number]`
  - `edgeNeighbors(edgeId: number): number[]`
  - `PORT_SLOTS: { vertices: [number, number] }[]` (9 coastal slots — id positions only; resource assigned in Task 5)
  - `hexPixel(hexId): {x,y}`, `vertexPixel(vertexId): {x,y}`, `edgePixel(edgeId): {x,y}` for a 600×600 board (used by client + logs)

**Implementation approach (document in code comments):** Build corners by enumerating, for each hex, its 6 corner points at cube→pixel positions rounded to a grid; dedupe coincident corners into vertex ids; an edge is an unordered pair of adjacent corner vertices, deduped into edge ids. This yields the canonical 54/72 counts. Provide the derivation in `board.ts` so ids are reproducible.

- [ ] **Step 1: Write failing invariant tests**

```ts
import {
  HEX_COUNT, VERTEX_COUNT, EDGE_COUNT, HEX_LAYOUT,
  hexVertices, vertexHexes, edgeVertices, vertexAdjacent, vertexEdges, PORT_SLOTS,
} from "./board";

test("counts", () => {
  expect(HEX_COUNT).toBe(19);
  expect(VERTEX_COUNT).toBe(54);
  expect(EDGE_COUNT).toBe(72);
  expect(HEX_LAYOUT).toHaveLength(19);
});
test("every hex has 6 distinct vertices", () => {
  for (let h = 0; h < HEX_COUNT; h++) {
    const vs = hexVertices(h);
    expect(vs).toHaveLength(6);
    expect(new Set(vs).size).toBe(6);
  }
});
test("vertex→hex is inverse of hex→vertex", () => {
  for (let h = 0; h < HEX_COUNT; h++)
    for (const v of hexVertices(h)) expect(vertexHexes(v)).toContain(h);
});
test("each vertex has 1..3 hexes and 2..3 adjacent vertices", () => {
  for (let v = 0; v < VERTEX_COUNT; v++) {
    expect(vertexHexes(v).length).toBeGreaterThanOrEqual(1);
    expect(vertexHexes(v).length).toBeLessThanOrEqual(3);
    const adj = vertexAdjacent(v);
    expect(adj.length).toBeGreaterThanOrEqual(2);
    expect(adj.length).toBeLessThanOrEqual(3);
  }
});
test("edges: adjacency is symmetric, endpoints are adjacent vertices", () => {
  for (let e = 0; e < EDGE_COUNT; e++) {
    const [a, b] = edgeVertices(e);
    expect(vertexAdjacent(a)).toContain(b);
    expect(vertexEdges(a)).toContain(e);
    expect(vertexEdges(b)).toContain(e);
  }
});
test("9 port slots on distinct coastal vertex pairs", () => {
  expect(PORT_SLOTS).toHaveLength(9);
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npm test -- board`

- [ ] **Step 3: Implement `src/shared/board.ts`** using the corner-dedup derivation. Compute corner pixel positions per hex (pointy-top), snap to integer grid to dedupe into 54 vertices; derive 72 edges from adjacent corner pairs; build all adjacency tables at module load into frozen arrays. Define `PORT_SLOTS` as the 9 standard coastal vertex pairs (hard-code the pairs by locating outer-ring vertices in a fixed clockwise order). Export the pixel helpers from the same corner positions.

  *(Full derivation code written during implementation; it is deterministic and self-contained. Guard with the Task-3 tests — they lock every invariant.)*

- [ ] **Step 4: Run — expect PASS.** Run: `npm test -- board`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: static Catan board geometry"`

---

### Task 4: Types + Actions

**Files:**
- Create: `src/shared/types.ts`, `src/shared/actions.ts`, `src/shared/types.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type Resource = "brick"|"wood"|"sheep"|"wheat"|"ore"`
  - `type Terrain = Resource | "desert"`
  - `type DevKind = "knight"|"road"|"plenty"|"mono"|"vp"`
  - `type Hand = Record<Resource, number>`
  - `interface HexTile { terrain: Terrain; num: number | null }`
  - `interface Port { type: Resource | "any"; vertices: [number, number] }`
  - `interface Board { tiles: HexTile[]; ports: Port[] }`
  - `interface Seat { id; name; color; kind: "human"|"bot"; connected; ready; resources: Hand; devCards: DevKind[]; newDevCards: DevKind[]; playedKnights; buildings: { settlements: number[]; cities: number[]; roads: number[] } }`
  - `type Phase = "lobby"|"setup"|"play"|"finished"`
  - `interface GameState { roomCode; phase: Phase; board: Board; seats: Seat[]; turnOrder: number[]; activeSeat: number; setup: {round:1|2; step:"settle"|"road"; lastVertex:number|null} | null; turn: TurnState | null; robberHex: number; pendingDiscards: Record<number,number>; steal: {candidates:number[]} | null; trade: TradeState | null; bank: Hand; devDeck: DevKind[]; awards: {longestRoad:number|null; largestArmy:number|null}; winner: number | null; log: LogEntry[]; seed: string; version: number }`
  - `interface TurnState { hasRolled: boolean; dice: [number,number] | null; mustMoveRobber: boolean; freeRoads: number; devPlayedThisTurn: boolean }`
  - `interface TradeState { from: number; give: Partial<Hand>; get: Partial<Hand>; responses: Record<number,"pending"|"accept"|"reject"> }`
  - `interface LogEntry { t: number; text: string }`
  - `const RESOURCES: Resource[]`, `const EMPTY_HAND: () => Hand`
- Produces (`actions.ts`): discriminated `Action` union and `GameEvent` union (see below).

- [ ] **Step 1: Define the `Action` union in `actions.ts`**

```ts
import type { Resource, DevKind } from "./types";
export type Action =
  | { type: "setName"; name: string }
  | { type: "setColor"; color: string }
  | { type: "ready"; ready: boolean }
  | { type: "addBot" } | { type: "removeBot"; seat: number }
  | { type: "start" }
  | { type: "placeSettlement"; vertex: number }
  | { type: "placeRoad"; edge: number }
  | { type: "rollDice" }
  | { type: "buildRoad"; edge: number }
  | { type: "buildSettlement"; vertex: number }
  | { type: "buildCity"; vertex: number }
  | { type: "buyDev" }
  | { type: "playKnight"; hex: number; steal: number | null }
  | { type: "playRoadBuilding" }
  | { type: "playYearOfPlenty"; picks: [Resource, Resource] }
  | { type: "playMonopoly"; resource: Resource }
  | { type: "moveRobber"; hex: number; steal: number | null }
  | { type: "discard"; hand: Partial<Record<Resource, number>> }
  | { type: "bankTrade"; give: Resource; get: Resource }
  | { type: "proposeTrade"; give: Partial<Record<Resource, number>>; get: Partial<Record<Resource, number>> }
  | { type: "respondTrade"; accept: boolean }
  | { type: "confirmTrade"; withSeat: number }
  | { type: "cancelTrade" }
  | { type: "endTurn" };

export type GameEvent =
  | { type: "rolled"; dice: [number, number]; by: number }
  | { type: "produced"; gains: Record<number, Partial<Record<Resource, number>>> }
  | { type: "robber"; hex: number }
  | { type: "stole"; from: number; to: number }
  | { type: "built"; kind: "road"|"settlement"|"city"; by: number }
  | { type: "boughtDev"; by: number }
  | { type: "played"; kind: DevKind; by: number }
  | { type: "trade"; from: number; to: number }
  | { type: "award"; kind: "longestRoad"|"largestArmy"; seat: number }
  | { type: "win"; seat: number };
```

- [ ] **Step 2: Write `types.ts`** with the interfaces above and helpers:

```ts
export const RESOURCES: Resource[] = ["brick","wood","sheep","wheat","ore"];
export const emptyHand = (): Hand => ({ brick:0, wood:0, sheep:0, wheat:0, ore:0 });
```

- [ ] **Step 3: Add a compile/shape test `types.test.ts`**

```ts
import { RESOURCES, emptyHand } from "./types";
test("hand + resources", () => {
  expect(RESOURCES).toHaveLength(5);
  expect(emptyHand()).toEqual({ brick:0, wood:0, sheep:0, wheat:0, ore:0 });
});
```

- [ ] **Step 4: Run — expect PASS.** Run: `npm test -- types` and `npm run typecheck`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: game types + action/event unions"`

---

### Task 5: Board generation + lobby + `createLobby`

**Files:**
- Create: `src/shared/setup.ts`, `src/shared/setup.test.ts`
- Create: `src/shared/engine.ts` (start it here), `src/shared/engine.test.ts`

**Interfaces:**
- Consumes: `board.ts` geometry, `rng.ts`, `types.ts`.
- Produces:
  - `generateBoard(seed: string): Board` — randomized terrains, tokens (no token on desert; robber starts on desert), and the 9 ports assigned to `PORT_SLOTS` in shuffled order (4 `any` + one of each resource).
  - `createLobby(roomCode: string, seed: string): GameState` — `phase:"lobby"`, empty seats, `bank` = 19 of each resource, `devDeck` = standard 25 (14 knight, 5 vp, 2 each of road/plenty/mono) shuffled by seed, `robberHex` = desert index.
  - `addSeat(state, name, kind): GameState` and start of `apply` for lobby actions (`setName`,`setColor`,`ready`,`addBot`,`removeBot`,`start`).

- [ ] **Step 1: Write failing tests for `generateBoard`**

```ts
import { generateBoard } from "./setup";
test("board has 19 tiles with correct terrain multiset", () => {
  const b = generateBoard("seed1");
  expect(b.tiles).toHaveLength(19);
  const count = (t: string) => b.tiles.filter(x => x.terrain === t).length;
  expect(count("wood")).toBe(4); expect(count("sheep")).toBe(4); expect(count("wheat")).toBe(4);
  expect(count("brick")).toBe(3); expect(count("ore")).toBe(3); expect(count("desert")).toBe(1);
});
test("desert has no number, others do; token multiset correct", () => {
  const b = generateBoard("seed1");
  const desert = b.tiles.filter(t => t.terrain === "desert");
  expect(desert[0]!.num).toBeNull();
  const nums = b.tiles.filter(t => t.terrain !== "desert").map(t => t.num!);
  expect(nums).toHaveLength(18);
  expect(nums.filter(n => n === 6)).toHaveLength(2);
  expect(nums.filter(n => n === 2)).toHaveLength(1);
  expect(nums.filter(n => n === 7)).toHaveLength(0);
});
test("9 ports: 4 any + one of each resource", () => {
  const b = generateBoard("seed1");
  expect(b.ports).toHaveLength(9);
  expect(b.ports.filter(p => p.type === "any")).toHaveLength(4);
  for (const r of ["brick","wood","sheep","wheat","ore"])
    expect(b.ports.filter(p => p.type === r)).toHaveLength(1);
});
test("deterministic per seed", () => {
  expect(generateBoard("s")).toEqual(generateBoard("s"));
});
```

- [ ] **Step 2: Run — expect FAIL.** `npm test -- setup`

- [ ] **Step 3: Implement `generateBoard` + `createLobby` in `setup.ts`.** Shuffle the terrain multiset onto the 19 layout positions; place the 18 tokens onto non-desert tiles in shuffled order; assign shuffled port types to `PORT_SLOTS`; robber starts on the desert hex.

- [ ] **Step 4: Write failing lobby tests in `engine.test.ts`**

```ts
import { createLobby, addSeat, apply } from "./engine";
test("addSeat then start enters setup with snake order", () => {
  let s = createLobby("ABCD", "seed1");
  s = addSeat(s, "You", "human");
  s = addSeat(s, "Ava", "bot");
  s.seats.forEach((_, i) => { s = apply(s, { type: "ready", ready: true }, i).state!; });
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
test("apply never mutates input", () => {
  const s = addSeat(createLobby("X", "s"), "A", "human");
  const before = JSON.stringify(s);
  apply(s, { type: "setName", name: "B" }, 0);
  expect(JSON.stringify(s)).toBe(before);
});
```

- [ ] **Step 5: Implement lobby handlers + `apply` dispatch skeleton** returning `{ state } | { error }`, cloning state (structuredClone) before mutation. `start` requires ≥2 seats all ready; sets `turnOrder` = seat ids, `activeSeat` = first, `phase:"setup"`, `setup:{round:1,step:"settle",lastVertex:null}`.

- [ ] **Step 6: Run — expect PASS.** `npm test -- setup engine` and `npm run typecheck`

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: board generation + lobby + engine skeleton"`

---

### Task 6: Setup phase placement + starting resources

**Files:** Modify `src/shared/engine.ts`; Create `src/shared/legal.ts`, `src/shared/legal.test.ts`; extend `engine.test.ts`.

**Interfaces:**
- Produces (`legal.ts`):
  - `occupiedVertices(state): Set<number>` (settlements+cities of all seats)
  - `canPlaceSettlement(state, seat, vertex, { setup: boolean }): boolean` — vertex empty, distance rule (no adjacent vertex occupied), and in non-setup requires a connecting road owned by seat.
  - `canPlaceRoad(state, seat, edge, { free: boolean }): boolean` — edge empty, connects to seat's road/building (in setup: must touch the just-placed settlement).
  - `canPlaceCity(state, seat, vertex): boolean` — seat owns a settlement there.
- Setup rules in engine: snake order 1..N,N..1; `placeSettlement` then `placeRoad`; the **second** settlement yields 1 of each adjacent hex's resource; after the last road, transition to `play`, `activeSeat`=turnOrder[0], `turn` initialized unrolled.

- [ ] **Step 1: Write failing tests** (distance rule, road-must-touch-settlement, snake order advance, second-settlement resources, transition to play). Example core assertions:

```ts
test("distance rule blocks adjacent settlement", () => {
  // build helper places first settlement at v; adjacent vertex must be illegal
});
test("second settlement grants adjacent resources", () => {
  // after round 2 settle on a vertex touching wood+brick tiles, seat gains those
});
test("after all setup placements, phase becomes play, first player to roll", () => {});
```
*(Write concrete scenario helpers `setupGame(seeds, names)` and `place(seat, vertex, edge)` in the test file.)*

- [ ] **Step 2: Run — expect FAIL.** `npm test -- legal engine`

- [ ] **Step 3: Implement `legal.ts` predicates + setup handlers** in engine. Track `setup.step`; alternate settle→road; advance snake order; on 2nd-round settlement add resources from `vertexHexes(vertex)` (skip desert / bank-limited); when snake order exhausted set `phase:"play"`, init `turn`.

- [ ] **Step 4: Run — expect PASS.** `npm test -- legal engine`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: setup placement + starting resources"`

---

### Task 7: Roll + production (+ bank limits)

**Files:** Modify `engine.ts`; extend `engine.test.ts`.

**Interfaces:**
- `rollDice` (active seat, play phase, not yet rolled): draw two dice from seeded RNG advanced via a per-roll counter folded into `seed` (e.g. `makeRng(seed + ":" + version)`), set `turn.dice`, `turn.hasRolled`.
  - If sum 7 → set `pendingDiscards` for every seat with >7 cards (discard `floor(n/2)`), set `turn.mustMoveRobber = true` after discards resolve; emit nothing produced.
  - Else → for each non-robber hex with `num === sum`, each adjacent settlement gains 1 and city gains 2 of the hex terrain, capped by `bank`; decrement bank. Emit `produced`.

- [ ] **Step 1: Failing tests** — deterministic dice for a seed; production credits correct seats/amounts; robber hex produces nothing; city yields 2; bank cannot go negative (if bank short and multiple claimants, standard rule: if only one player claims and bank short, give what's left; if multiple claimants exceed bank for a resource, none of that resource is given — implement the "multiple claimants + insufficient = no one gets it" rule); rolling 7 sets pendingDiscards only for >7 holders.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `rollDice` + `produce()` helper** with the bank-limit rule above.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit** — `git commit -am "feat: dice roll + resource production with bank limits"`

---

### Task 8: Build actions (road / settlement / city)

**Files:** Modify `engine.ts`; extend tests.

**Interfaces:**
- `buildRoad` / `buildSettlement` / `buildCity` in play phase, active seat, after roll. Validate via `legal.ts`, deduct cost from hand to bank, add building, recompute awards (Task 11 wiring — call `recomputeAwards`), check victory.
  - `buildRoad` respects `turn.freeRoads` (from road-building card): if >0, no cost and decrement.
  - Settlement/city limited by piece supply (5 settlements, 4 cities, 15 roads per seat).
  - City upgrades an existing settlement (move vertex from settlements→cities).

- [ ] **Step 1: Failing tests** — cost deduction, illegal without connecting road, city requires own settlement, piece-supply caps, freeRoads consumes no resources, VP updates (settlement +1, city +2).

- [ ] **Step 2: Run — FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `feat: build road/settlement/city`.

---

### Task 9: Robber flow (discard → move → steal)

**Files:** Modify `engine.ts`; extend tests.

**Interfaces:**
- `discard` (only seats in `pendingDiscards`): must discard exactly the owed count of cards they hold; removes from hand to bank; clears their entry. When `pendingDiscards` empties, `turn.mustMoveRobber` stays true for active seat.
- `moveRobber` (active seat, `mustMoveRobber`): hex must differ from current `robberHex`; set robber; compute `steal.candidates` = seats (≠active) with a building on that hex and ≥1 card; if candidates and `steal` given pick that seat, else if exactly one candidate auto-steal, else set `steal` state to await a `moveRobber`/`playKnight` steal choice. Steal a uniformly random card via seeded RNG.
- Same steal resolution reused by `playKnight` (Task 10).

- [ ] **Step 1: Failing tests** — discard validation (wrong count rejected), robber can't stay, steal reduces target by 1 & increases active by 1, no candidates → no steal, discard-before-move ordering enforced (can't move robber while discards pending).

- [ ] **Step 2–5: FAIL → implement → PASS → commit** `feat: robber discard/move/steal`.

---

### Task 10: Dev cards + trading

**Files:** Modify `engine.ts`; extend tests.

**Interfaces:**
- `buyDev`: cost 1 sheep/wheat/ore, draw top of `devDeck` into `seat.newDevCards` (not playable this turn), bank gets the resources.
- Playability: one dev card per turn (`turn.devPlayedThisTurn`), not a card in `newDevCards`, not a `vp` card (passive). At `endTurn`, fold `newDevCards` into `devCards`.
- `playKnight`: move robber + steal (reuse Task 9 resolution), `playedKnights++`, recompute largest army.
- `playRoadBuilding`: `turn.freeRoads += 2` (capped by remaining road supply).
- `playYearOfPlenty`: take 2 chosen resources from bank (respect bank stock).
- `playMonopoly`: all other seats give the active seat every card of the named resource.
- `bankTrade`: ratio from `tradeRatio(state, seat, give)` = 2 if seat has that 2:1 port, else 3 if seat has an `any` port, else 4; deduct `ratio` of `give`, add 1 `get`, via bank.
- Player trade: `proposeTrade` sets `trade` with responses `pending` for others (active seat must have the offered `give`); `respondTrade` sets accept/reject; `confirmTrade{withSeat}` (only proposer, only an accepting seat that still holds the `get`) swaps resources and clears `trade`; `cancelTrade` clears.

- [ ] **Step 1: Failing tests** — buyDev draws & is unplayable same turn; one-dev-per-turn; monopoly sweeps; year-of-plenty respects bank; road-building gives 2 free roads; bank trade ratio picks best port; player trade full handshake incl. rejecting; can't confirm with non-holder.

- [ ] **Step 2–5: FAIL → implement → PASS → commit** `feat: dev cards + bank/port/player trading`.

---

### Task 11: Scoring, victory, full-game integration

**Files:** Create `src/shared/scoring.ts`, `src/shared/scoring.test.ts`; Create `src/shared/game.test.ts` (integration); wire `recomputeAwards` + victory into `engine.ts`.

**Interfaces:**
- `longestRoadLength(state, seat): number` — longest simple path over the seat's road edges, paths broken at vertices occupied by an opponent building. DFS over edge graph.
- `recomputeAwards(state): void` (mutates the cloned state inside apply) — longest road award to the unique seat with ≥5 and strictly longest (ties keep current holder); largest army to first/most with ≥3 knights (ties keep holder). Updates `state.awards`.
- `victoryPoints(state, seat): number` — settlements×1 + cities×2 + (+2 longest road) + (+2 largest army) + vp dev cards (only counted for the owner; at win they count).
- Victory: after every applied play-phase action, if active seat's `victoryPoints` ≥ 10 → `phase:"finished"`, `winner`=seat, emit `win`.

- [ ] **Step 1: Failing scoring tests** — straight 5-road = length 5; branch picks longest; opponent settlement in the middle breaks the path; longest-road award transitions and tie-keeps-holder; largest army at 3 knights and steal-back on more; VP totals with awards + hidden vp card.

- [ ] **Step 2: Run — FAIL.** `npm test -- scoring`

- [ ] **Step 3: Implement `scoring.ts`** and wire into `apply` (call `recomputeAwards` + victory check after build/knight actions).

- [ ] **Step 4: Run — expect PASS.** `npm test -- scoring`

- [ ] **Step 5: Write full-game integration test `game.test.ts`** — scripted deterministic game (fixed seed): lobby → setup → several turns of rolls/builds/trades/dev → drive a seat to 10 VP → assert `phase:"finished"` and correct winner. Assert no action ever mutated a prior state (deep-freeze inputs).

- [ ] **Step 6: Run full suite — expect PASS.** `npm test && npm run typecheck`

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: scoring, awards, victory + full-game integration test"`

---

## Self-Review Notes

- **Spec coverage:** Board (§3)→T3/T5; state (§4)→T4; every rules-engine bullet (§5)→T5–T11; scoring (§5)→T11; determinism/RNG (Global)→T2 and folded into T7. Server/client/bots (§6–§8) are out of scope for Phase 1 by design (separate plans).
- **Type consistency:** `apply` returns `{ state?: GameState; error?: string }` everywhere; `Hand` = full `Record<Resource,number>`; partial hands in trades/discards use `Partial<Record<Resource,number>>`; `newDevCards` vs `devCards` distinction used consistently in T10/T11.
- **Determinism:** all randomness via `makeRng(seed + ":" + version)` or the shuffled decks created at `createLobby`; no `Math.random`/`Date` in `src/shared`.

## Next plans (not this phase)
- Phase 2: Server (Worker + `GameRoom` DO + WS protocol + reconnection + hidden-info views).
- Phase 3: React client reusing the Hexholm design.
- Phase 4: AI bots. Phase 5: polish + deploy.
