# Offline PWA + Local Bot Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hexholm an installable, offline-capable PWA whose landing page, when the browser is offline, offers a single "Play offline vs bots" game that runs entirely in the browser (1 human + 2 or 3 bots).

**Architecture:** Reuse the pure shared engine and bot AI in the browser. Move `bots.ts` (and bot pacing) into `src/shared` so the client can import it, add a client-side game driver that mirrors the server room's bot loop without a network, gate the landing UI on connectivity, and add a `vite-plugin-pwa` service worker that precaches the app shell.

**Tech Stack:** TypeScript, React 18 + Vite 5, Vitest (node env), Cloudflare Workers (assets binding — no Worker code changes), `vite-plugin-pwa` (Workbox), `sharp` (dev-only icon generation).

## Global Constraints

- Offline game is reachable **only when offline**; online behavior is unchanged.
- Offline table size: 1 human + **2 or 3 bots** (3- or 4-player); default 4 (3 bots).
- Human seat id is always `0`; offline room code sentinel is `"SOLO"`.
- Bot pacing constants live in `src/shared/bots.ts` and are shared by server and offline driver: `BOT_DELAY_MS = 1700`, `TRADE_WAIT_MS = 9_000`, `delayAfter(events)`. `IDLE_MS` stays server-only in `room.ts`.
- Manifest: `name`/`short_name` "Hexholm", `theme_color` `#20323C`, `background_color` `#1A2A32`, `display: "standalone"`, `start_url: "/"`.
- Tests are node-env Vitest (`src/**/*.test.ts`); do NOT add jsdom/testing-library. Pure logic is unit-tested; React glue is verified via `npm run typecheck` + `npm run build` + manual.
- `verbatimModuleSyntax` is on — type-only imports must use `import type`.
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Move bots + pacing into `src/shared`

**Files:**
- Rename: `src/server/bots.ts` → `src/shared/bots.ts` (via `git mv`)
- Rename: `src/server/bots.test.ts` → `src/shared/bots.test.ts` (via `git mv`)
- Modify: `src/shared/bots.ts` (fix relative imports; add pacing exports)
- Modify: `src/shared/bots.test.ts` (fix relative imports)
- Modify: `src/server/room.ts` (import bots + pacing from `../shared/bots`; drop local pacing)
- Modify: `src/shared/index.ts` (re-export bots)

**Interfaces:**
- Produces: `src/shared/bots.ts` exporting the existing `driveBots`, `hasBotMove`, `stepBots`, `BotOutcome`, plus new `BOT_DELAY_MS: number`, `TRADE_WAIT_MS: number`, `delayAfter(events: GameEvent[]): number`.

- [ ] **Step 1: Move the two files with git**

```bash
cd /Users/ilan/Documents/GitHub/hexholm
git mv src/server/bots.ts src/shared/bots.ts
git mv src/server/bots.test.ts src/shared/bots.test.ts
```

- [ ] **Step 2: Fix imports inside `src/shared/bots.ts`**

Every import in `src/shared/bots.ts` currently starts with `../shared/`. Since the file now lives in `src/shared/`, change each `../shared/` prefix to `./`. The import block becomes:

```ts
import type { GameState, PartialHand, Resource, Seat } from "./types";
import { RESOURCES, COSTS, SUPPLY, handTotal } from "./types";
import type { Action, GameEvent } from "./actions";
import { apply } from "./engine";
import {
  VERTEX_COUNT,
  EDGE_COUNT,
  hexVertices,
  vertexHexes,
  vertexAdjacent,
  vertexEdges,
  edgeVertices,
} from "./board";
import {
  canPlaceSettlement,
  canPlaceRoad,
  buildingOwnerAt,
  roadOwnerAt,
  legalRobberHexes,
  tradeRatio,
} from "./legal";
import { victoryPoints, longestRoadLength } from "./scoring";
```

- [ ] **Step 3: Add the pacing exports to `src/shared/bots.ts`**

Append these exports at the end of `src/shared/bots.ts` (moved verbatim from `room.ts`, now `export`ed):

```ts
/** Pacing between bot actions so players can follow the game and the bots feel
 *  a touch more human. A bigger beat follows the moments that matter most, and a
 *  little random jitter keeps the rhythm from feeling robotic. */
export const BOT_DELAY_MS = 1700;

/** How long a bot waits for humans to answer its trade offer before withdrawing it. */
export const TRADE_WAIT_MS = 9_000;

export function delayAfter(events: GameEvent[]): number {
  let base = BOT_DELAY_MS;
  if (events.some((e) => e.type === "rolled")) base = 2600; // let production register
  else if (events.some((e) => ["built", "stole", "played", "boughtDev", "trade"].includes(e.type)))
    base = 2200;
  return base + Math.floor(Math.random() * 500); // human-like jitter
}
```

- [ ] **Step 4: Fix imports inside `src/shared/bots.test.ts`**

Change the two `../shared/` imports to `./`:

```ts
import { createLobby, addSeat, apply } from "./engine";
import { driveBots } from "./bots";
import { victoryPoints } from "./scoring";
```

- [ ] **Step 5: Update `src/server/room.ts` imports and drop its local pacing**

In `src/server/room.ts`, replace the bots import line:

```ts
import { hasBotMove, stepBots } from "./bots";
```

with an import from shared that also pulls the pacing helpers:

```ts
import { hasBotMove, stepBots, BOT_DELAY_MS, TRADE_WAIT_MS, delayAfter } from "../shared/bots";
```

Then DELETE the now-duplicated local declarations in `room.ts` — the `const BOT_DELAY_MS = 1700;` line, the `const TRADE_WAIT_MS = 9_000;` line, and the entire `function delayAfter(events: GameEvent[]) { ... }` block. **Keep** `const IDLE_MS = 75_000;` (server-only). Keep the explanatory comment above `IDLE_MS` if it applies; the pacing comment moved to `bots.ts`.

- [ ] **Step 6: Re-export bots from the shared barrel**

In `src/shared/index.ts`, add after the other `export *` lines:

```ts
export * from "./bots";
```

- [ ] **Step 7: Verify no behavior changed**

Run: `npm run typecheck && npm test`
Expected: typecheck passes; all 79 tests pass (the moved `bots.test.ts` runs from its new path). This is a pure refactor — no test count change.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move bots + pacing into src/shared for client reuse

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Offline game driver

**Files:**
- Create: `src/client/offlineGame.ts`
- Test: `src/client/offlineGame.test.ts`
- Modify: `tsconfig.client.json` (add `src/server/views.ts` to `include`)

**Interfaces:**
- Consumes: `createLobby`, `addSeat`, `apply` from `../shared/engine`; `hasBotMove`, `stepBots`, `delayAfter`, `TRADE_WAIT_MS` from `../shared/bots`; `toView` from `../server/views`; `GameView` type from `../server/protocol`; `GameState` type from `../shared/types`; `Action`, `GameEvent` types from `../shared/actions`.
- Produces:
  - `interface OfflineTimers { set: (fn: () => void, ms: number) => number; clear: (id: number) => void }`
  - `interface OfflineDriver { start(bots: 2 | 3, name: string): void; resume(game: GameState): void; send(action: Action): void; leave(): void; snapshot(): GameState | null; view(): GameView | null; events(): GameEvent[] }`
  - `createOfflineDriver(opts: { onChange: () => void; timers?: OfflineTimers; seed?: () => string }): OfflineDriver`

- [ ] **Step 1: Allow the client tsconfig to see `views.ts`**

In `tsconfig.client.json`, change the `include` array from:

```json
"include": ["src/client", "src/shared", "src/server/protocol.ts"],
```

to:

```json
"include": ["src/client", "src/shared", "src/server/protocol.ts", "src/server/views.ts"],
```

- [ ] **Step 2: Write the failing tests**

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/client/offlineGame.test.ts`
Expected: FAIL — cannot resolve `./offlineGame`.

- [ ] **Step 4: Implement the driver**

```ts
// src/client/offlineGame.ts
import type { Action, GameEvent } from "../shared/actions";
import type { GameState } from "../shared/types";
import type { GameView } from "../server/protocol";
import { createLobby, addSeat, apply } from "../shared/engine";
import { hasBotMove, stepBots, delayAfter, TRADE_WAIT_MS } from "../shared/bots";
import { toView } from "../server/views";

const HUMAN_SEAT = 0;
const OFFLINE_CODE = "SOLO";

export interface OfflineTimers {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

const realTimers: OfflineTimers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
};

export interface OfflineDriver {
  start(bots: 2 | 3, name: string): void;
  resume(game: GameState): void;
  send(action: Action): void;
  leave(): void;
  snapshot(): GameState | null;
  view(): GameView | null;
  events(): GameEvent[];
}

/** Runs a full solo game (1 human + bots) in the browser, mirroring the server
 *  room's bot loop without any network. Timers are injectable for testing. */
export function createOfflineDriver(opts: {
  onChange: () => void;
  timers?: OfflineTimers;
  seed?: () => string;
}): OfflineDriver {
  const timers = opts.timers ?? realTimers;
  const seed = opts.seed ?? (() => crypto.randomUUID());
  let game: GameState | null = null;
  let lastEvents: GameEvent[] = [];
  let timer: number | null = null;

  function cancel(): void {
    if (timer != null) { timers.clear(timer); timer = null; }
  }

  /** A bot's own trade offer is on the table, waiting on the human to respond. */
  function botTradeAwaitingHuman(g: GameState): boolean {
    if (!g.trade || g.seats[g.trade.from]?.kind !== "bot") return false;
    return Object.entries(g.trade.responses).some(
      ([id, r]) => r === "pending" && g.seats[+id]?.kind === "human",
    );
  }

  function schedule(): void {
    cancel();
    if (!game) return;
    if (hasBotMove(game)) timer = timers.set(stepOnce, delayAfter(lastEvents));
    else if (botTradeAwaitingHuman(game)) timer = timers.set(withdraw, TRADE_WAIT_MS);
  }

  function stepOnce(): void {
    timer = null;
    if (!game) return;
    const out = stepBots(game);
    if (out.acted) {
      game = out.state;
      lastEvents = out.events;
      opts.onChange();
    }
    schedule();
  }

  function withdraw(): void {
    timer = null;
    if (!game || !game.trade) return;
    const res = apply(game, { type: "cancelTrade" }, game.trade.from);
    if (res.state) { game = res.state; opts.onChange(); }
    schedule();
  }

  return {
    start(bots, name) {
      let s = createLobby(OFFLINE_CODE, seed());
      s = addSeat(s, name.trim().slice(0, 20) || "You", "human");
      for (let i = 0; i < bots; i++) s = apply(s, { type: "addBot" }, HUMAN_SEAT).state ?? s;
      for (const seat of s.seats) seat.ready = true;
      s = apply(s, { type: "start" }, HUMAN_SEAT).state ?? s;
      game = s;
      lastEvents = [];
      opts.onChange();
      schedule();
    },
    resume(saved) {
      game = saved;
      lastEvents = [];
      opts.onChange();
      schedule();
    },
    send(action) {
      if (!game) return;
      const res = apply(game, action, HUMAN_SEAT);
      if (res.error || !res.state) return;
      game = res.state;
      lastEvents = res.events ?? [];
      opts.onChange();
      schedule();
    },
    leave() { cancel(); game = null; lastEvents = []; },
    snapshot() { return game; },
    view() { return game ? toView(game, HUMAN_SEAT) : null; },
    events() { return lastEvents; },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/client/offlineGame.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (confirms the `views.ts` tsconfig include and the driver types line up).

- [ ] **Step 7: Commit**

```bash
git add src/client/offlineGame.ts src/client/offlineGame.test.ts tsconfig.client.json
git commit -m "feat: offline solo game driver (engine + bots in the browser)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `useGame` offline integration

**Files:**
- Modify: `src/client/net.ts`

**Interfaces:**
- Consumes: `createOfflineDriver`, `OfflineDriver` (Task 2); `GameState` type from `../shared/types`.
- Produces: `Game.offline: boolean`, `Game.playOffline: (bots: 2 | 3, name: string) => void`, `Game.resumeOffline: () => boolean`. Existing `send`/`leave`/`view`/`lastEvents`/`seatId` route to the offline driver when it is active.

- [ ] **Step 1: Add offline fields to the `Game` interface**

In `src/client/net.ts`, add to the `Game` interface (after `quickPlay`):

```ts
  offline: boolean;
  playOffline: (bots: 2 | 3, name: string) => void;
  resumeOffline: () => boolean;
```

- [ ] **Step 2: Add imports and offline state**

At the top of `net.ts`, add:

```ts
import { createOfflineDriver, type OfflineDriver } from "./offlineGame";
import type { GameState } from "../shared/types";
```

Inside `useGame`, near the other `useState`/`useRef` declarations, add:

```ts
  const [offline, setOffline] = useState(false);
  const driver = useRef<OfflineDriver | null>(null);
```

Add a constant near `tokenKey` (module scope, top of file):

```ts
const OFFLINE_KEY = "hexholm:offline";
```

- [ ] **Step 3: Add the offline driver factory helper inside `useGame`**

Add this callback (it wires a driver whose changes push into React state and persist):

```ts
  const makeDriver = useCallback((): OfflineDriver => {
    const d = createOfflineDriver({
      onChange: () => {
        const v = d.view();
        setView(v);
        setLastEvents(d.events());
        const snap = d.snapshot();
        if (snap && v && v.phase !== "finished")
          localStorage.setItem(OFFLINE_KEY, JSON.stringify(snap));
        else localStorage.removeItem(OFFLINE_KEY); // game over — nothing to resume
      },
    });
    return d;
  }, []);
```

- [ ] **Step 4: Add `playOffline` and `resumeOffline`**

Add after `quickPlay` (and keep them before the returned object):

```ts
  const playOffline = useCallback(
    (bots: 2 | 3, name: string) => {
      alive.current = false;
      ws.current?.close();
      ws.current = null;
      localStorage.setItem("hexholm:name", name);
      const d = makeDriver();
      driver.current = d;
      setOffline(true);
      setSeatId(0);
      setStatus("open");
      d.start(bots, name);
    },
    [makeDriver],
  );

  const resumeOffline = useCallback((): boolean => {
    const raw = localStorage.getItem(OFFLINE_KEY);
    if (!raw) return false;
    let saved: GameState;
    try { saved = JSON.parse(raw) as GameState; } catch { localStorage.removeItem(OFFLINE_KEY); return false; }
    const d = makeDriver();
    driver.current = d;
    setOffline(true);
    setSeatId(0);
    setStatus("open");
    d.resume(saved);
    return true;
  }, [makeDriver]);
```

- [ ] **Step 5: Route `send` and `leave` through the driver when active**

Replace the existing `send` callback body so it prefers the driver:

```ts
  const send = useCallback((action: Action) => {
    if (driver.current) { driver.current.send(action); return; }
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN)
      sock.send(JSON.stringify({ t: "action", action } satisfies ClientMessage));
  }, []);
```

In the existing `leave` callback, add offline teardown at the top of the function body (before the WS teardown lines):

```ts
    if (driver.current) { driver.current.leave(); driver.current = null; }
    localStorage.removeItem(OFFLINE_KEY);
    setOffline(false);
```

- [ ] **Step 6: Expose the new API in the returned object**

In the object returned by `useGame`, add:

```ts
    offline,
    playOffline,
    resumeOffline,
```

- [ ] **Step 7: Verify typecheck and existing tests**

Run: `npm run typecheck && npm test`
Expected: typecheck passes; 84 tests pass (79 existing + 5 offline driver tests from Task 2).

- [ ] **Step 8: Commit**

```bash
git add src/client/net.ts
git commit -m "feat: route useGame through the offline driver when playing solo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `useOnline` hook

**Files:**
- Create: `src/client/useOnline.ts`

**Interfaces:**
- Produces: `useOnline(): boolean` — reactive to `window` `online`/`offline` events, seeded from `navigator.onLine`.

- [ ] **Step 1: Implement the hook**

```ts
// src/client/useOnline.ts
import { useEffect, useState } from "react";

/** Tracks browser connectivity, re-rendering on online/offline transitions. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (This is a thin DOM wrapper; it is exercised via the Landing UI and manual verification, per the test-strategy constraint — no unit test.)

- [ ] **Step 3: Commit**

```bash
git add src/client/useOnline.ts
git commit -m "feat: useOnline connectivity hook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Landing offline UX + App resume wiring

**Files:**
- Modify: `src/client/screens/Landing.tsx`
- Modify: `src/client/App.tsx`

**Interfaces:**
- Consumes: `useOnline` (Task 4); `Game.playOffline`, `Game.resumeOffline` (Task 3).
- Produces: offline landing (single "Play offline vs bots" button + 3/4 selector + offline indicator, no Create/Join); App resumes a saved offline game on load.

- [ ] **Step 1: Extend Landing props and add offline state**

In `src/client/screens/Landing.tsx`, add the import:

```tsx
import { useOnline } from "../useOnline";
```

Change the props type and destructuring to add `playOffline`:

```tsx
export function Landing({
  connect,
  quickPlay,
  playOffline,
  status,
}: {
  connect: (code: string, name: string) => void;
  quickPlay: (name: string) => void;
  playOffline: (bots: 2 | 3, name: string) => void;
  status: Status;
}) {
```

Inside the component, add:

```tsx
  const online = useOnline();
  const [botCount, setBotCount] = useState<2 | 3>(3); // default 4-player table (3 bots)
```

Add the offline handler next to `quick`:

```tsx
  const playOff = () => {
    remember();
    playOffline(botCount, name.trim());
  };
```

- [ ] **Step 2: Replace the status chip with an offline indicator when offline**

In the header, replace the existing status `<span>` content (the line rendering the settlers count / "Play free") so it shows an offline indicator when offline. Change the chip's inner expression to:

```tsx
          {!online ? (
            <>
              <span style={{ width: 8, height: 8, background: "#D9A441", borderRadius: 2 }} />
              Offline — play the bots
            </>
          ) : players != null ? (
            <>
              <span style={{ width: 8, height: 8, background: "#8FBF6A", borderRadius: 2 }} />
              {`${players.toLocaleString()} settler${players === 1 ? "" : "s"}`}
            </>
          ) : (
            "Play free"
          )}
```

Note: the existing chip already renders a green dot `<span>` before the text. Fold that dot into the branches above (each branch now renders its own dot) and remove the standalone green-dot `<span>` that preceded the text, so offline shows an amber dot and online shows the green one.

- [ ] **Step 3: Swap the CTA block based on connectivity**

Wrap the existing CTA rows (the name-input + Quick Play row, the Create-private-table row, and the room-code + Join row) so they render only when `online`. When offline, render the offline block instead. Replace the CTA `<div>` group (from the name-input row through the Join row) with:

```tsx
        {online ? (
          <>
            <div style={{ marginTop: invited ? 16 : 40, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={20}
                style={inputStyle}
              />
              <button onClick={quick} disabled={connecting} style={quickBtn}>
                {connecting ? "Finding a match…" : "⚡ Quick Play"}
              </button>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <button onClick={create} disabled={connecting} style={ghostBtn}>
                Create private table
              </button>
              <span style={{ color: "#8E937F", fontWeight: 600, fontSize: 13 }}>or join with a code below</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Room code"
                maxLength={6}
                style={{ ...inputStyle, width: 160, letterSpacing: 3, fontWeight: 700 }}
              />
              <button onClick={join} disabled={connecting} style={ghostBtn}>
                Join table →
              </button>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 40 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={20}
                style={inputStyle}
              />
              <button onClick={playOff} style={quickBtn}>▶ Play offline vs bots</button>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "#8E937F", fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>Players</span>
              {([3, 4] as const).map((n) => {
                const selected = (n === 4 ? 3 : 2) === botCount;
                return (
                  <button
                    key={n}
                    onClick={() => setBotCount(n === 4 ? 3 : 2)}
                    style={{ ...ghostBtn, padding: "10px 18px", background: selected ? C.terracotta : "transparent", color: selected ? "#FBF3E4" : C.cream, borderColor: selected ? C.terracotta : "rgba(244,236,221,.35)" }}
                  >
                    {n}
                  </button>
                );
              })}
              <span style={{ color: "#8E937F", fontWeight: 600, fontSize: 13 }}>you + {botCount} bot{botCount === 1 ? "" : "s"}</span>
            </div>
            <p style={{ marginTop: 18, color: "#CBBEA4", fontWeight: 500, fontSize: 14, maxWidth: 460 }}>
              You're offline. Online matches and private tables need a connection — but you can still play a full game against the bots right here.
            </p>
          </div>
        )}
```

Ensure `C` is imported in `Landing.tsx` (it already is — used by existing styles).

- [ ] **Step 4: Pass `playOffline` from App and resume offline games on load**

In `src/client/App.tsx`, update the Landing render to pass `playOffline`:

```tsx
    screen = <Landing connect={game.connect} quickPlay={game.quickPlay} playOffline={game.playOffline} status={status} />;
```

Update the auto-rejoin effect to try an offline resume first:

```tsx
  useEffect(() => {
    if (reconnected.current) return;
    reconnected.current = true;
    if (game.resumeOffline()) return; // a saved offline game takes precedence
    const room = localStorage.getItem("hexholm:room");
    const name = localStorage.getItem("hexholm:name");
    const wasQuick = localStorage.getItem("hexholm:quick") === "1";
    if (room && name) game.connect(room, name, wasQuick);
  }, [game]);
```

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/client/screens/Landing.tsx src/client/App.tsx
git commit -m "feat: offline landing (play vs bots, indicator) + resume on load

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Service worker, manifest, and installable icons

**Files:**
- Modify: `package.json` (add `vite-plugin-pwa` and `sharp` dev deps)
- Create: `scripts/gen-icons.mjs`
- Create: `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon-180x180.png` (generated)
- Modify: `vite.config.ts` (register `VitePWA`)
- Modify: `index.html` (apple-touch-icon link to the PNG)

**Interfaces:**
- Produces: a Workbox service worker + web manifest emitted to `dist/client/` at build; PNG icons in `public/`.

- [ ] **Step 1: Install the dependencies**

```bash
npm install -D vite-plugin-pwa@^0.20.5 sharp@^0.33.5
```

Expected: both added under `devDependencies`.

- [ ] **Step 2: Write the icon generator**

```js
// scripts/gen-icons.mjs
// Rasterize the hex logo (public/favicon.svg) into the PWA icon set.
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/favicon.svg", import.meta.url));
const bg = { r: 0x1a, g: 0x2a, b: 0x32, alpha: 1 }; // #1A2A32 to match background_color

const targets = [
  { file: "pwa-192x192.png", size: 192, pad: 24 },
  { file: "pwa-512x512.png", size: 512, pad: 64 },
  { file: "maskable-icon-512x512.png", size: 512, pad: 110 }, // extra safe-zone padding
  { file: "apple-touch-icon-180x180.png", size: 180, pad: 22 },
];

for (const { file, size, pad } of targets) {
  const inner = size - pad * 2;
  const logo = await sharp(svg, { density: 384 }).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(new URL(`../public/${file}`, import.meta.url).pathname);
  console.log("wrote public/" + file);
}
```

- [ ] **Step 3: Generate the icons**

```bash
node scripts/gen-icons.mjs
```

Expected: prints four `wrote public/...` lines. Verify with `ls -la public/*.png` that four non-empty PNG files exist.

- [ ] **Step 4: Register `VitePWA` in `vite.config.ts`**

Replace `src`'s `vite.config.ts` contents with (keeps the existing react plugin, build outDir, and dev proxy):

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon-180x180.png",
        "og-image.svg",
        "robots.txt",
      ],
      manifest: {
        name: "Hexholm",
        short_name: "Hexholm",
        description: "Build, trade, and outwit the island — a Catan-style strategy game. Play online or offline vs bots.",
        theme_color: "#20323C",
        background_color: "#1A2A32",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//], // never serve the SPA shell for API/WS paths
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-stylesheets", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-webfonts", cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false }, // no service worker during `vite`/`wrangler dev`
    }),
  ],
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true, ws: true },
    },
  },
});
```

- [ ] **Step 5: Point the apple-touch-icon at the PNG**

In `index.html`, change the apple-touch-icon line from the SVG to the generated PNG:

```html
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

(Leave the `<link rel="icon" href="/favicon.svg" ...>` line as-is.)

- [ ] **Step 6: Build and verify the SW + manifest are emitted**

Run: `npm run build`
Then verify artifacts exist:

```bash
ls dist/client/sw.js dist/client/manifest.webmanifest dist/client/workbox-*.js
grep -c "manifest.webmanifest" dist/client/index.html   # expect >= 1 (manifest link injected)
grep -c "registerSW" dist/client/index.html             # expect >= 1 (SW registration injected)
```

Expected: `sw.js`, `manifest.webmanifest`, and a `workbox-*.js` exist; the greps return ≥ 1.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts index.html scripts/gen-icons.mjs public/pwa-192x192.png public/pwa-512x512.png public/maskable-icon-512x512.png public/apple-touch-icon-180x180.png
git commit -m "feat: PWA — service worker, manifest, and installable icons

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end offline verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: 84 tests pass; typecheck clean; build emits `dist/client/sw.js` + `dist/client/manifest.webmanifest`.

- [ ] **Step 2: Serve the built app and exercise offline**

Run: `npm run dev` (wrangler dev serves `dist/client` assets + the Worker). In Chrome:
- Load the site once online (lets the service worker install and precache).
- Open DevTools → Application → Service Workers: confirm `sw.js` is activated. Application → Manifest: confirm name "Hexholm" and the 192/512 icons resolve, and the install ("Add to home screen") affordance is available.
- Switch DevTools → Network → **Offline** (or toggle the OS network). Reload: the app shell must load from cache.
- On the offline landing: confirm the header shows "Offline — play the bots" (amber dot), Create/Join are hidden, and the "▶ Play offline vs bots" button + 3/4 selector are shown.
- Click **Play offline vs bots**: confirm a game starts immediately (setup phase), you can place your settlement/road, and the bots take their turns and continue the game.
- Reload while still offline: confirm the in-progress game resumes (Task 5 resume path).
- Go back **online** and reload: confirm the normal online landing returns (Quick Play + Create/Join + settlers count).

- [ ] **Step 3: Commit any fixes**

If verification surfaced issues, fix them, re-run Step 1, and commit with a descriptive message and the co-author trailer.
