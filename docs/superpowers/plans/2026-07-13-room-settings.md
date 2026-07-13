# Configurable Room Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the room owner set victory points (7–13) and placement mode (two settlements vs settlement + city) before the game starts, for custom code-shared rooms and offline games — never for matchmaking.

**Architecture:** Add a `settings` object to the shared `GameState` (defaulted by `createLobby`, defensively coerced on load), a validated owner-only `setSettings` lobby action, make the win condition and setup round-2 placement read from `settings`, expose settings + ownership on the view, and add owner-editable controls to the online Lobby and the offline Landing.

**Tech Stack:** TypeScript, shared pure engine (`src/shared`), Cloudflare Workers Durable Object (`src/server`), React client, Vitest (node).

## Global Constraints

- Settings shape: `{ winVP: number; setupMode: "settlements" | "settlementCity" }`. Defaults `{ winVP: 10, setupMode: "settlements" }`.
- `winVP` valid range: integer **7–13** inclusive.
- Owner = **seat 0**. `setSettings` is owner-only and lobby-phase-only. It does **NOT** reset ready flags.
- Matchmaking (`quickMatch`) rooms never allow `setSettings` (server rejects; UI never shown).
- `settlementCity`: round-2 setup placement is a **city** (2 VP) instead of a second settlement; round 1 is always a settlement. Bots are unchanged (they use the same `placeSettlement` action).
- Defensive defaulting: the DO constructor and the client offline-resume path coerce a missing/partial `settings` to defaults.
- `verbatimModuleSyntax` is on — type-only imports use `import type`.
- Tests are node-env Vitest; existing suite is 86 tests and must stay green (default behavior is unchanged).
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Shared settings model + action type

**Files:**
- Modify: `src/shared/types.ts` (add `SetupMode`, `RoomSettings`, `DEFAULT_SETTINGS`; add `settings` to `GameState`)
- Modify: `src/shared/setup.ts` (default `settings` in `createLobby`; add `ensureSettings`)
- Modify: `src/shared/actions.ts` (add `setSettings` to the `Action` union)
- Test: `src/shared/settings.test.ts`

**Interfaces:**
- Produces:
  - `type SetupMode = "settlements" | "settlementCity"`
  - `interface RoomSettings { winVP: number; setupMode: SetupMode }`
  - `const DEFAULT_SETTINGS: RoomSettings = { winVP: 10, setupMode: "settlements" }`
  - `GameState.settings: RoomSettings`
  - `ensureSettings(game: GameState): GameState` — coerces missing/partial settings to defaults, in place, returns the same object.
  - `Action` union gains `{ type: "setSettings"; winVP?: number; setupMode?: SetupMode }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/settings.test.ts
import { createLobby, ensureSettings } from "./setup";
import { DEFAULT_SETTINGS } from "./types";

test("createLobby starts with default settings", () => {
  const g = createLobby("ROOM", "seed");
  expect(g.settings).toEqual({ winVP: 10, setupMode: "settlements" });
});

test("ensureSettings fills entirely-missing settings with defaults", () => {
  const g = createLobby("ROOM", "seed");
  delete (g as { settings?: unknown }).settings;
  ensureSettings(g);
  expect(g.settings).toEqual(DEFAULT_SETTINGS);
});

test("ensureSettings coerces a partial/invalid settings object", () => {
  const g = createLobby("ROOM", "seed");
  (g as { settings: unknown }).settings = { winVP: 12 }; // missing setupMode
  ensureSettings(g);
  expect(g.settings).toEqual({ winVP: 12, setupMode: "settlements" });
});

test("ensureSettings rejects a bogus setupMode back to default", () => {
  const g = createLobby("ROOM", "seed");
  (g as { settings: unknown }).settings = { winVP: 9, setupMode: "bogus" };
  ensureSettings(g);
  expect(g.settings).toEqual({ winVP: 9, setupMode: "settlements" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/settings.test.ts`
Expected: FAIL — `ensureSettings` not exported / `settings` undefined.

- [ ] **Step 3: Add the types**

In `src/shared/types.ts`, add near the top-level type exports (e.g., after the `LogEntry` interface, before `GameState`):

```ts
export type SetupMode = "settlements" | "settlementCity";

export interface RoomSettings {
  winVP: number;
  setupMode: SetupMode;
}

export const DEFAULT_SETTINGS: RoomSettings = { winVP: 10, setupMode: "settlements" };
```

Add the field to the `GameState` interface (next to `seed`/`version`):

```ts
  settings: RoomSettings;
```

- [ ] **Step 4: Default it in `createLobby` and add `ensureSettings`**

In `src/shared/setup.ts`, import the new symbols (extend the existing type import from `./types`):

```ts
import { DEFAULT_SETTINGS, type RoomSettings } from "./types";
```

Add `settings` to the object returned by `createLobby` (next to `seed`/`version`):

```ts
    settings: { ...DEFAULT_SETTINGS },
```

Add the coercion helper at the end of the file:

```ts
/** Coerce a missing or partial `settings` object (e.g. from a game persisted
 *  before settings existed) to a complete, valid RoomSettings. Mutates in place. */
export function ensureSettings(game: GameState): GameState {
  const raw = (game as { settings?: Partial<RoomSettings> }).settings;
  const winVP = typeof raw?.winVP === "number" ? raw.winVP : DEFAULT_SETTINGS.winVP;
  const setupMode = raw?.setupMode === "settlementCity" ? "settlementCity" : DEFAULT_SETTINGS.setupMode;
  game.settings = { winVP, setupMode };
  return game;
}
```

Ensure `GameState` is imported in `setup.ts` (it already imports types from `./types`; add `GameState` if not present).

- [ ] **Step 5: Add the action variant**

In `src/shared/actions.ts`, extend the import and add the lobby action:

```ts
import type { Resource, DevKind, PartialHand, SetupMode } from "./types";
```

In the `// lobby` section of the `Action` union (after `removeBot`):

```ts
  | { type: "setSettings"; winVP?: number; setupMode?: SetupMode }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/shared/settings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Verify the whole suite still passes**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all existing tests + the 4 new ones pass (default behavior unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/setup.ts src/shared/actions.ts src/shared/settings.test.ts
git commit -m "feat: shared room settings model + setSettings action type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `setSettings` engine action + win condition

**Files:**
- Modify: `src/shared/engine.ts` (handle `setSettings` in `applyLobby`)
- Modify: `src/shared/scoring.ts` (`hasWon` reads `settings.winVP`)
- Test: `src/shared/settings-engine.test.ts`

**Interfaces:**
- Consumes: the `setSettings` action + `GameState.settings` (Task 1).
- Produces: owner-gated, range-validated settings mutation; `hasWon(state, seat)` compares against `state.settings.winVP` (defaulting to `DEFAULT_SETTINGS.winVP` when absent).

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/settings-engine.test.ts
import { createLobby, addSeat, apply } from "./engine";
import { hasWon } from "./scoring";

function lobby() {
  let g = createLobby("ROOM", "seed");
  g = addSeat(g, "Host", "human"); // seat 0 = owner
  g = addSeat(g, "Two", "human");  // seat 1
  return g;
}

test("owner sets winVP within range", () => {
  const r = apply(lobby(), { type: "setSettings", winVP: 7 }, 0);
  expect(r.state?.settings.winVP).toBe(7);
});

test("owner sets setupMode", () => {
  const r = apply(lobby(), { type: "setSettings", setupMode: "settlementCity" }, 0);
  expect(r.state?.settings.setupMode).toBe("settlementCity");
});

test("non-owner cannot change settings", () => {
  expect(apply(lobby(), { type: "setSettings", winVP: 8 }, 1).error).toBeTruthy();
});

test("winVP out of range or non-integer is rejected", () => {
  expect(apply(lobby(), { type: "setSettings", winVP: 6 }, 0).error).toBeTruthy();
  expect(apply(lobby(), { type: "setSettings", winVP: 14 }, 0).error).toBeTruthy();
  expect(apply(lobby(), { type: "setSettings", winVP: 9.5 }, 0).error).toBeTruthy();
});

test("invalid setupMode is rejected", () => {
  expect(apply(lobby(), { type: "setSettings", setupMode: "bogus" as never }, 0).error).toBeTruthy();
});

test("setSettings is rejected outside the lobby", () => {
  let g = lobby();
  g.seats.forEach((s) => (s.ready = true));
  g = apply(g, { type: "start" }, 0).state!;
  expect(apply(g, { type: "setSettings", winVP: 8 }, 0).error).toBeTruthy();
});

test("changing settings does not reset ready flags", () => {
  let g = lobby();
  g = apply(g, { type: "ready", ready: true }, 1).state!;
  g = apply(g, { type: "setSettings", winVP: 12 }, 0).state!;
  expect(g.seats[1]!.ready).toBe(true);
});

test("hasWon respects a custom winVP", () => {
  let g = createLobby("R", "s");
  g = addSeat(g, "A", "human");
  g.seats[0]!.buildings.settlements = [0, 2, 4, 6, 8, 10, 12]; // 7 VP
  g.settings.winVP = 7;
  expect(hasWon(g, 0)).toBe(true);
  g.settings.winVP = 8;
  expect(hasWon(g, 0)).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/settings-engine.test.ts`
Expected: FAIL — `setSettings` returns "Not a lobby action" / owner+range not enforced.

- [ ] **Step 3: Handle `setSettings` in `applyLobby`**

In `src/shared/engine.ts`, inside `applyLobby`'s `switch (action.type)`, add a case (place it after the `removeBot` case, before `start`):

```ts
    case "setSettings": {
      if (seat !== 0) return err("Only the room owner can change settings");
      if (action.winVP !== undefined) {
        if (!Number.isInteger(action.winVP) || action.winVP < 7 || action.winVP > 13)
          return err("Victory points must be a whole number from 7 to 13");
        s.settings.winVP = action.winVP;
      }
      if (action.setupMode !== undefined) {
        if (action.setupMode !== "settlements" && action.setupMode !== "settlementCity")
          return err("Invalid placement mode");
        s.settings.setupMode = action.setupMode;
      }
      return ok(s);
    }
```

- [ ] **Step 4: Make `hasWon` read the setting**

In `src/shared/scoring.ts`, remove the `const WIN_VP = 10;` line and import the default:

```ts
import { DEFAULT_SETTINGS } from "./types";
```

Replace the `hasWon` body:

```ts
export function hasWon(state: GameState, seat: number): boolean {
  return victoryPoints(state, seat) >= (state.settings?.winVP ?? DEFAULT_SETTINGS.winVP);
}
```

(`state.settings?.winVP ?? …` keeps it safe if a caller ever passes a settings-less state.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/shared/settings-engine.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Verify the whole suite**

Run: `npm run typecheck && npm test`
Expected: all green — default `winVP` is still 10, so existing win/scoring tests are unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/shared/engine.ts src/shared/scoring.ts src/shared/settings-engine.test.ts
git commit -m "feat: owner-only setSettings action + win condition from settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `settlementCity` setup placement

**Files:**
- Modify: `src/shared/engine.ts` (`applySetup` round-2 city; `totalSettlements` → count all buildings)
- Test: `src/shared/settings-setup.test.ts`

**Interfaces:**
- Consumes: `GameState.settings.setupMode` (Task 1).
- Produces: in `settlementCity` mode, round-2 setup placement creates a city; setup progression/termination counts settlements + cities.

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/settings-setup.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/settings-setup.test.ts`
Expected: FAIL — round-2 placement still pushes a settlement, so cities stay 0.

- [ ] **Step 3: Route round-2 placement to a city**

In `src/shared/engine.ts` `applySetup`, in the `placeSettlement` branch, replace the single push line:

```ts
    s.seats[seat]!.buildings.settlements.push(action.vertex);
```

with a mode-aware placement (leave the surrounding legality check, `setup.lastVertex`, `setup.step`, and the round-2 resource grant unchanged):

```ts
    if (setup.round === 2 && s.settings.setupMode === "settlementCity")
      s.seats[seat]!.buildings.cities.push(action.vertex);
    else
      s.seats[seat]!.buildings.settlements.push(action.vertex);
```

- [ ] **Step 4: Count all buildings for setup progression**

Still in `src/shared/engine.ts`, generalize the setup counter so both modes terminate. Replace:

```ts
function totalSettlements(s: GameState): number {
  return s.seats.reduce((sum, st) => sum + st.buildings.settlements.length, 0);
}
```

with:

```ts
function totalPlacements(s: GameState): number {
  return s.seats.reduce(
    (sum, st) => sum + st.buildings.settlements.length + st.buildings.cities.length,
    0,
  );
}
```

Then update the one caller in `advanceSetup` — change `const placed = totalSettlements(s);` to `const placed = totalPlacements(s);`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/shared/settings-setup.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the whole suite**

Run: `npm run typecheck && npm test`
Expected: all green — default mode is `settlements`, so existing setup/scoring tests are unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/shared/engine.ts src/shared/settings-setup.test.ts
git commit -m "feat: settlement+city setup placement mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Expose settings + ownership on the view

**Files:**
- Modify: `src/server/protocol.ts` (`GameView` gains `settings` + `youAreOwner`)
- Modify: `src/server/views.ts` (`toView` populates them)
- Test: `src/server/views.test.ts` (add a case)

**Interfaces:**
- Consumes: `GameState.settings` (Task 1), `RoomSettings` type.
- Produces: `GameView.settings: RoomSettings` and `GameView.youAreOwner: boolean` (`viewer === 0`).

- [ ] **Step 1: Write the failing test**

Append to `src/server/views.test.ts`:

```ts
test("toView exposes settings and marks seat 0 as the owner", () => {
  const s = twoSeatGame();
  s.settings = { winVP: 8, setupMode: "settlementCity" };
  expect(toView(s, 0).settings).toEqual({ winVP: 8, setupMode: "settlementCity" });
  expect(toView(s, 0).youAreOwner).toBe(true);
  expect(toView(s, 1).youAreOwner).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/views.test.ts`
Expected: FAIL — `settings`/`youAreOwner` missing on the view.

- [ ] **Step 3: Add the fields to the `GameView` type**

In `src/server/protocol.ts`, extend the type import from `../shared/types` to include `RoomSettings`, then add to the `GameView` interface (next to `youSeat`/`version`):

```ts
  settings: RoomSettings;
  youAreOwner: boolean;
```

- [ ] **Step 4: Populate them in `toView`**

In `src/server/views.ts`, add to the object returned by `toView` (next to `youSeat: viewer`):

```ts
    settings: state.settings,
    youAreOwner: viewer === 0,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/server/views.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify typecheck + suite**

Run: `npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/server/protocol.ts src/server/views.ts src/server/views.test.ts
git commit -m "feat: expose settings + ownership on the game view

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Server room — defensive default + matchmaking guard

**Files:**
- Modify: `src/server/room.ts` (coerce settings on load; reject `setSettings` in quick-match rooms)

**Interfaces:**
- Consumes: `ensureSettings` (Task 1); `this.quickMatch` (existing).
- Produces: loaded games always have valid `settings`; `setSettings` is refused on matchmaking rooms.

- [ ] **Step 1: Import `ensureSettings`**

In `src/server/room.ts`, add to the imports:

```ts
import { ensureSettings } from "../shared/setup";
```

- [ ] **Step 2: Coerce settings after loading the game**

In the constructor's `blockConcurrencyWhile` block, right after the `this.game = (await ctx.storage.get<GameState>("game")) ?? null;` line, add:

```ts
      if (this.game) ensureSettings(this.game);
```

- [ ] **Step 3: Reject `setSettings` on matchmaking rooms**

In `handleAction`, immediately after the `att == null` guard and before `const prevPhase = ...`, add:

```ts
    if (msg.action.type === "setSettings" && this.quickMatch)
      return this.send(ws, { t: "error", message: "Settings are fixed for matchmaking games" });
```

- [ ] **Step 4: Verify typecheck + suite**

Run: `npm run typecheck && npm test`
Expected: all green (no test count change; this is server wiring).

- [ ] **Step 5: Commit**

```bash
git add src/server/room.ts
git commit -m "feat: room defaults settings on load and blocks setSettings in matchmaking

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Online Lobby — owner-editable settings

**Files:**
- Modify: `src/client/screens/Lobby.tsx`

**Interfaces:**
- Consumes: `view.settings`, `view.youAreOwner` (Task 4); `game.send` with the `setSettings` action.
- Produces: the "Table settings" panel shows a VP stepper + placement toggle for the owner, read-only values for others.

- [ ] **Step 1: Add settings helpers in the component**

In `src/client/screens/Lobby.tsx`, near the top of the `Lobby` component body (after `const me = view.seats[view.youSeat];`), add:

```tsx
  const owner = view.youAreOwner;
  const settings = view.settings;
  const modeLabel = settings.setupMode === "settlementCity" ? "Settlement + city" : "Two settlements";
  const setWinVP = (v: number) =>
    game.send({ type: "setSettings", winVP: Math.max(7, Math.min(13, v)) });
  const setMode = (m: "settlements" | "settlementCity") =>
    game.send({ type: "setSettings", setupMode: m });
```

- [ ] **Step 2: Replace the static settings rows**

In the "Table settings" panel, replace the static `{[ ["Victory points","10"], ... ].map(...)}` block with explicit rows (Victory points + Placement are dynamic; Players/Board/Robber stay static). Replace the whole `{[ ... ].map((...) => ( ... ))}` expression with:

```tsx
            <div style={settingRow}>
              <span style={settingLabel}>Victory points</span>
              {owner ? (
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button style={stepBtn} onClick={() => setWinVP(settings.winVP - 1)} disabled={settings.winVP <= 7}>−</button>
                  <span style={{ ...settingValue, minWidth: 20, textAlign: "center" }}>{settings.winVP}</span>
                  <button style={stepBtn} onClick={() => setWinVP(settings.winVP + 1)} disabled={settings.winVP >= 13}>+</button>
                </span>
              ) : (
                <span style={settingValue}>{settings.winVP}</span>
              )}
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>Placement</span>
              {owner ? (
                <span style={{ display: "flex", gap: 6 }}>
                  {(["settlements", "settlementCity"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{ ...toggleBtn, background: settings.setupMode === m ? C.terracotta : "transparent", color: settings.setupMode === m ? "#FBF3E4" : C.ink, borderColor: settings.setupMode === m ? C.terracotta : "#CBB98F" }}
                    >
                      {m === "settlements" ? "2 settlements" : "Settle + city"}
                    </button>
                  ))}
                </span>
              ) : (
                <span style={settingValue}>{modeLabel}</span>
              )}
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>Players</span>
              <span style={settingValue}>{view.seats.length} / 4</span>
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>Board</span>
              <span style={settingValue}>Classic island</span>
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>Robber</span>
              <span style={settingValue}>Standard (7s)</span>
            </div>
```

- [ ] **Step 3: Add the style consts**

At the bottom of `src/client/screens/Lobby.tsx` (next to the other `const … : React.CSSProperties` styles), add:

```tsx
const settingRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${C.borderSoft}` };
const settingLabel: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: "#6B5A42" };
const settingValue: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: C.ink };
const stepBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 5, border: "1px solid #CBB98F", background: C.panelAlt, color: C.ink, fontWeight: 800, fontSize: 15, cursor: "pointer", lineHeight: 1, padding: 0 };
const toggleBtn: React.CSSProperties = { border: "1px solid #CBB98F", borderRadius: 5, padding: "6px 10px", fontFamily: font.body, fontWeight: 700, fontSize: 12, cursor: "pointer" };
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/client/screens/Lobby.tsx
git commit -m "feat: owner-editable victory points + placement in the lobby

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Offline settings — driver, hook, Landing

**Files:**
- Modify: `src/client/offlineGame.ts` (`start` accepts settings; applies `setSettings` before start)
- Modify: `src/client/net.ts` (`playOffline` carries settings; `resumeOffline` coerces settings)
- Modify: `src/client/screens/Landing.tsx` (offline VP stepper + placement toggle)

**Interfaces:**
- Consumes: `RoomSettings` (Task 1); `ensureSettings` (Task 1); the `setSettings` action.
- Produces: `OfflineDriver.start(bots: 2 | 3, name: string, settings?: RoomSettings)`; `Game.playOffline(bots: 2 | 3, name: string, settings: RoomSettings)`.

- [ ] **Step 1: Driver applies settings before start**

In `src/client/offlineGame.ts`, add the type import:

```ts
import type { RoomSettings } from "../shared/types";
```

Change the `OfflineDriver` interface's `start` signature to:

```ts
  start(bots: 2 | 3, name: string, settings?: RoomSettings): void;
```

In the `start` implementation, accept the param and apply `setSettings` after adding seats and before `apply(start)`:

```ts
    start(bots, name, settings) {
      let s = createLobby(OFFLINE_CODE, seed());
      s = addSeat(s, name.trim().slice(0, 20) || "You", "human");
      for (let i = 0; i < bots; i++) s = apply(s, { type: "addBot" }, HUMAN_SEAT).state ?? s;
      if (settings) {
        const r = apply(s, { type: "setSettings", winVP: settings.winVP, setupMode: settings.setupMode }, HUMAN_SEAT);
        if (r.state) s = r.state;
      }
      for (const seat of s.seats) seat.ready = true;
      s = apply(s, { type: "start" }, HUMAN_SEAT).state ?? s;
      game = s;
      lastEvents = [];
      opts.onChange();
      schedule();
    },
```

- [ ] **Step 2: Thread settings through `useGame`**

In `src/client/net.ts`, add the import:

```ts
import { ensureSettings } from "../shared/setup";
import type { RoomSettings } from "../shared/types";
```

Change the `Game` interface's `playOffline` type:

```ts
  playOffline: (bots: 2 | 3, name: string, settings: RoomSettings) => void;
```

Update the `playOffline` callback signature and the `d.start` call:

```ts
  const playOffline = useCallback(
    (bots: 2 | 3, name: string, settings: RoomSettings) => {
      alive.current = false;
      ws.current?.close();
      ws.current = null;
      localStorage.setItem("hexholm:name", name);
      const d = makeDriver();
      driver.current = d;
      setOffline(true);
      setSeatId(0);
      setStatus("open");
      d.start(bots, name, settings);
    },
    [makeDriver],
  );
```

In `resumeOffline`, coerce settings on the parsed save (right after the successful `JSON.parse`, before `const d = makeDriver();`):

```ts
    ensureSettings(saved);
```

- [ ] **Step 3: Offline settings UI in Landing**

In `src/client/screens/Landing.tsx`, add settings state next to `botCount`:

```tsx
  const [winVP, setWinVP] = useState(10);
  const [setupMode, setSetupMode] = useState<"settlements" | "settlementCity">("settlements");
```

Update the `playOff` handler to pass settings:

```tsx
  const playOff = () => {
    remember();
    playOffline(botCount, name.trim(), { winVP, setupMode });
  };
```

Update the `playOffline` prop type in the component's props:

```tsx
  playOffline: (bots: 2 | 3, name: string, settings: { winVP: number; setupMode: "settlements" | "settlementCity" }) => void;
```

In the offline block, add two rows below the existing "Players" selector row (before the closing explanatory `<p>`):

```tsx
            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: "#8E937F", fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>Win at</span>
              <button style={offStepBtn} onClick={() => setWinVP((v) => Math.max(7, v - 1))} disabled={winVP <= 7}>−</button>
              <span style={{ color: C.cream, fontWeight: 800, fontSize: 16, minWidth: 22, textAlign: "center" }}>{winVP}</span>
              <button style={offStepBtn} onClick={() => setWinVP((v) => Math.min(13, v + 1))} disabled={winVP >= 13}>+</button>
              <span style={{ color: "#8E937F", fontWeight: 600, fontSize: 13 }}>victory points</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: "#8E937F", fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>Placement</span>
              {(["settlements", "settlementCity"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSetupMode(m)}
                  style={{ ...ghostBtn, padding: "9px 14px", fontSize: 13, background: setupMode === m ? C.terracotta : "transparent", color: setupMode === m ? "#FBF3E4" : C.cream, borderColor: setupMode === m ? C.terracotta : "rgba(244,236,221,.35)" }}
                >
                  {m === "settlements" ? "2 settlements" : "Settlement + city"}
                </button>
              ))}
            </div>
```

Add the offline stepper style at the bottom of `Landing.tsx`:

```tsx
const offStepBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 5, border: "1px solid rgba(244,236,221,.35)", background: "transparent", color: C.cream, fontWeight: 800, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 0 };
```

- [ ] **Step 4: Verify typecheck + build + suite**

Run: `npm run typecheck && npm run build && npm test`
Expected: all pass (86 + the tasks' new engine tests; the client changes add no unit tests).

- [ ] **Step 5: Commit**

```bash
git add src/client/offlineGame.ts src/client/net.ts src/client/screens/Landing.tsx
git commit -m "feat: choose victory points + placement mode for offline games

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green; build emits assets.

- [ ] **Step 2: Offline flow in a browser**

Run `npm run dev`, open the app, and simulate offline (DevTools Offline, or dispatch the `offline` event). On the offline landing:
- Set **Win at** to 7 and **Placement** to "Settlement + city", pick 4 players, click **Play offline vs bots**.
- Confirm via the page/console that the started game's state has `settings.winVP === 7` and `settings.setupMode === "settlementCity"`, that after setup you (seat 0) hold 1 settlement + 1 city (3 VP), and that the game ends when someone reaches 7 VP (bots should finish quickly at 7).

- [ ] **Step 3: Online custom-room lobby**

Online, click **Create private table** to reach the Lobby. Confirm the **Table settings** panel shows a working Victory points stepper (clamped 7–13) and a Placement toggle, and that changing them updates the displayed values (owner is seat 0). Add a bot and start; confirm the game respects the chosen VP target.

- [ ] **Step 4: Commit any fixes**

If verification surfaces issues, fix them, re-run Step 1, and commit with a descriptive message + the co-author trailer.
