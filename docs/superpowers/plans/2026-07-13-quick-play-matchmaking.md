# Quick Play Matchmaking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Quick Play button that drops a player into a match with other real players, backfilling with bots so nobody waits more than ~3 seconds to start.

**Architecture:** A new global `Matchmaker` Durable Object routes players who click Quick Play into a shared "forming" room code (grouping arrivals within a 2.5s window, cap 4). The existing `GameRoom` DO runs the 3-second countdown: quick seats auto-ready, 4 humans start instantly, and on a deadline alarm the room backfills bots and starts. The forming/decision logic lives in pure, unit-tested helpers.

**Tech Stack:** TypeScript, Cloudflare Workers + Durable Objects (SQLite storage), React 18 + Vite, Vitest.

## Global Constraints

- Target table size: **4 seats** (`TARGET_SEATS = 4`).
- Forming window: **2500 ms** (`FORMING_MS`); room start deadline: **3000 ms** (`MATCH_DEADLINE_MS`), measured from first arrival. Invariant: `FORMING_MS < MATCH_DEADLINE_MS`.
- Deadline fill rule: 3 humans → start all-human (3 seats); 1–2 humans → add bots up to 4; 0 humans → do not start.
- DO storage uses `ctx.storage.get/put` (SQLite-backed via `new_sqlite_classes`), matching existing DOs.
- Tests are pure-function Vitest specs (no DO harness in this repo). DO wiring is verified via `npm run typecheck` + `npm run build`.
- Commit message trailer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Quick-match pure helpers + constants

**Files:**
- Create: `src/server/quickmatch.ts`
- Test: `src/server/quickmatch.test.ts`

**Interfaces:**
- Produces:
  - `TARGET_SEATS = 4`, `FORMING_MS = 2500`, `MATCH_DEADLINE_MS = 3000` (exported consts)
  - `interface Forming { code: string; size: number; expires: number }`
  - `nextForming(current: Forming | null, now: number, mint: () => string): Forming` — returns the forming match a new claimant joins, minting a fresh one when none exists, the current one is full (`size >= TARGET_SEATS`), or it has expired (`now >= expires`); otherwise returns the current one with `size` incremented.
  - `deadlineBots(humans: number): number | null` — bots to add at the deadline: `null` if `humans <= 0` (don't start), `0` if `humans >= 3`, else `TARGET_SEATS - humans`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/quickmatch.test.ts
import { nextForming, deadlineBots, TARGET_SEATS, FORMING_MS, MATCH_DEADLINE_MS } from "./quickmatch";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/quickmatch.test.ts`
Expected: FAIL — cannot resolve `./quickmatch`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/quickmatch.ts

/** Quick Play tuning. FORMING_MS must stay below MATCH_DEADLINE_MS so the
 *  last-routed player always connects before the room fires its start alarm. */
export const TARGET_SEATS = 4;
export const FORMING_MS = 2500;
export const MATCH_DEADLINE_MS = 3000;

/** One in-progress matchmaking group inside the Matchmaker DO. */
export interface Forming {
  code: string;
  size: number;
  expires: number;
}

/** The forming match a new claimant should join. Starts a fresh group when
 *  there is none, the current one is full, or it has expired. */
export function nextForming(
  current: Forming | null,
  now: number,
  mint: () => string,
): Forming {
  if (!current || current.size >= TARGET_SEATS || now >= current.expires) {
    return { code: mint(), size: 1, expires: now + FORMING_MS };
  }
  return { ...current, size: current.size + 1 };
}

/** Bots to add when the start deadline fires. null → do not start (no humans). */
export function deadlineBots(humans: number): number | null {
  if (humans <= 0) return null;
  if (humans >= 3) return 0;
  return TARGET_SEATS - humans;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server/quickmatch.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/quickmatch.ts src/server/quickmatch.test.ts
git commit -m "feat: quick-match forming + deadline-fill helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `Matchmaker` Durable Object + registration

**Files:**
- Create: `src/server/matchmaker.ts`
- Modify: `src/server/index.ts` (export the class; add `MATCHMAKER` to `Env` is done in room.ts — see below)
- Modify: `src/server/room.ts:30-36` (add `MATCHMAKER` binding to the shared `Env` interface)
- Modify: `wrangler.jsonc` (binding + `v4` migration)

**Interfaces:**
- Consumes: `nextForming`, `Forming`, `TARGET_SEATS` from Task 1.
- Produces: `class Matchmaker` with `async claim(now: number): Promise<string>` returning a room code. `Env.MATCHMAKER: DurableObjectNamespace<Matchmaker>`.

- [ ] **Step 1: Write the class**

```ts
// src/server/matchmaker.ts
import { DurableObject } from "cloudflare:workers";
import { nextForming, type Forming } from "./quickmatch";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** Global router for Quick Play. Groups players who claim within the same short
 *  window into one shared room code (capped at a full table), then rolls over. */
export class Matchmaker extends DurableObject {
  private forming: Forming | null = null;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.blockConcurrencyWhile(async () => {
      this.forming = (await ctx.storage.get<Forming>("forming")) ?? null;
    });
  }

  /** Assign the caller to a forming match and return its room code. `now` is
   *  passed in so the routing decision is deterministic and unit-testable. */
  async claim(now: number): Promise<string> {
    this.forming = nextForming(this.forming, now, randomCode);
    await this.ctx.storage.put("forming", this.forming);
    return this.forming.code;
  }
}
```

- [ ] **Step 2: Add the binding to the shared `Env` interface**

In `src/server/room.ts`, extend the `Env` interface (currently lines 30-36):

```ts
export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  STATS: DurableObjectNamespace<StatsHub>;
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  ASSETS: Fetcher;
  ADMIN_KEY: string;
}
```

Add the import near the other type imports at the top of `room.ts`:

```ts
import type { Matchmaker } from "./matchmaker";
```

- [ ] **Step 3: Export the class from the Worker entry**

In `src/server/index.ts`, update the imports/exports (lines 1-5):

```ts
import { GameRoom, type Env } from "./room";
import { StatsHub } from "./stats";
import { RateLimiter } from "./rate";
import { Matchmaker } from "./matchmaker";

export { GameRoom, StatsHub, RateLimiter, Matchmaker };
```

- [ ] **Step 4: Register the DO in `wrangler.jsonc`**

Add the binding to `durable_objects.bindings`:

```jsonc
{ "name": "MATCHMAKER", "class_name": "Matchmaker" }
```

Add the migration to the `migrations` array:

```jsonc
{ "tag": "v4", "new_sqlite_classes": ["Matchmaker"] }
```

- [ ] **Step 5: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS (no errors). Confirms the new binding, class export, and imports line up.

- [ ] **Step 6: Commit**

```bash
git add src/server/matchmaker.ts src/server/index.ts src/server/room.ts wrangler.jsonc
git commit -m "feat: Matchmaker durable object routes Quick Play claims

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `POST /api/quickplay` endpoint

**Files:**
- Modify: `src/server/index.ts` (add the route + rate-limit bucket)

**Interfaces:**
- Consumes: `Env.MATCHMAKER` (Task 2), `allow()` helper (existing in `index.ts`).
- Produces: `POST /api/quickplay` → `{ code: string }`.

- [ ] **Step 1: Add the route**

In `src/server/index.ts`, add this block immediately after the existing `POST /api/room` handler (after line 41, before the `/api/public-stats` block):

```ts
    // Quick Play: route the caller to a shared match code (bots fill later).
    if (request.method === "POST" && url.pathname === "/api/quickplay") {
      if (!(await allow(env, ip, "quickplay", 20, 60_000)))
        return new Response("Too many quick-play requests, slow down", { status: 429 });
      const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("global"));
      const code = await mm.claim(Date.now());
      return Response.json({ code });
    }
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Verify the full build succeeds**

Run: `npm run build`
Expected: Vite build completes without errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: /api/quickplay endpoint backed by the Matchmaker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Room quick-match — auto-ready, instant start, deadline fill

**Files:**
- Modify: `src/server/protocol.ts` (add `quick?` to the `hello` message)
- Modify: `src/server/room.ts` (state fields, hello handling, `scheduleNext`, `alarm`)

**Interfaces:**
- Consumes: `MATCH_DEADLINE_MS`, `deadlineBots` from Task 1; existing `apply`, `addSeat`, `startSetup` path via `apply(state, {type:"start"|"addBot"}, seat)`.
- Produces: rooms entered with `quick: true` auto-ready seats, start instantly at 4 humans, and start on the deadline with bot backfill.

- [ ] **Step 1: Extend the hello wire message**

In `src/server/protocol.ts`, change the `ClientMessage` `hello` variant:

```ts
export type ClientMessage =
  | { t: "hello"; name: string; sessionToken?: string; playerId?: string; quick?: boolean }
  | { t: "action"; action: Action };
```

- [ ] **Step 2: Add quick-match state + import to `room.ts`**

Add the import near the top of `src/server/room.ts` (with the other `./` imports):

```ts
import { MATCH_DEADLINE_MS, deadlineBots } from "./quickmatch";
```

Add two fields to the `GameRoom` class (next to `gameStartMs` around line 48):

```ts
  private quickMatch = false;
  private quickDeadline = 0;
```

Hydrate them in the constructor's `blockConcurrencyWhile` block (next to the other `storage.get` calls, ~line 56):

```ts
      this.quickMatch = (await ctx.storage.get<boolean>("quickMatch")) ?? false;
      this.quickDeadline = (await ctx.storage.get<number>("quickDeadline")) ?? 0;
```

Persist them in `persist()` (append inside the method, ~line 314):

```ts
    await this.ctx.storage.put("quickMatch", this.quickMatch);
    await this.ctx.storage.put("quickDeadline", this.quickDeadline);
```

- [ ] **Step 3: Auto-ready + arm the deadline in `handleHello`**

In `src/server/room.ts`, inside `handleHello`, after the seat is resolved and before the existing `const token = ...` line (~line 192), insert:

```ts
    if (msg.quick) {
      game.seats[seatId]!.ready = true;
      if (!this.quickMatch) {
        this.quickMatch = true;
        this.quickDeadline = Date.now() + MATCH_DEADLINE_MS;
      }
    }
```

Then, still in `handleHello`, replace the trailing `await this.scheduleNext();` (last line of the method) with a call that first tries an instant start:

```ts
    await this.maybeStartQuick();
    await this.scheduleNext(); // resume bots, arm idle timer, or hold the quick deadline
```

- [ ] **Step 4: Add the quick start/fill helpers**

Add these private methods to `GameRoom` (place them just above `scheduleNext`, ~line 220):

```ts
  /** Count connected human seats — the players a quick match will start with. */
  private humanCount(): number {
    return this.game!.seats.filter((s) => s.kind === "human").length;
  }

  /** Start a quick match immediately once the table is full of humans. */
  private async maybeStartQuick(): Promise<void> {
    if (!this.quickMatch || this.game!.phase !== "lobby") return;
    if (this.humanCount() < 4) return;
    await this.startQuick(0);
  }

  /** Fire at the deadline: back-fill bots per the rule, then start. */
  private async quickDeadlineStart(): Promise<void> {
    const bots = deadlineBots(this.humanCount());
    if (bots == null) return; // nobody connected — stay idle
    await this.startQuick(bots);
  }

  /** Add `bots` bot seats (all auto-ready), then run the engine's start. */
  private async startQuick(bots: number): Promise<void> {
    const prevPhase = this.game!.phase;
    for (let i = 0; i < bots; i++) {
      const res = apply(this.game!, { type: "addBot" }, 0);
      if (res.state) this.game = res.state;
    }
    const res = apply(this.game!, { type: "start" }, 0);
    if (res.error || !res.state) return;
    this.game = res.state;
    this.quickMatch = false; // the match has begun; drop the deadline
    this.quickDeadline = 0;
    await this.persist();
    this.broadcastState();
    await this.trackTransition(prevPhase);
  }
```

- [ ] **Step 5: Hold the deadline in `scheduleNext`**

In `src/server/room.ts`, add a lobby branch at the very top of `scheduleNext` (before the existing `if (hasBotMove...)`, ~line 224):

```ts
    if (this.game.phase === "lobby") {
      if (this.quickMatch && this.quickDeadline)
        await this.ctx.storage.setAlarm(this.quickDeadline);
      else await this.ctx.storage.deleteAlarm();
      return;
    }
```

- [ ] **Step 6: Handle the deadline in `alarm`**

In `src/server/room.ts`, at the very top of `alarm()` (after `if (!this.game) return;`, ~line 256), insert:

```ts
    if (this.quickMatch && this.game.phase === "lobby") {
      await this.quickDeadlineStart();
      await this.scheduleNext();
      return;
    }
```

- [ ] **Step 7: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS — confirms the new fields, helpers, and message field are consistent.

- [ ] **Step 8: Verify the existing suite still passes**

Run: `npm test`
Expected: PASS — no regressions in engine/bot/view tests.

- [ ] **Step 9: Commit**

```bash
git add src/server/protocol.ts src/server/room.ts
git commit -m "feat: rooms auto-start quick matches with bot backfill on a 3s deadline

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Client networking — quick connect + auto-requeue

**Files:**
- Modify: `src/client/net.ts`

**Interfaces:**
- Consumes: `POST /api/quickplay` (Task 3); existing WS flow.
- Produces: `Game.quick: boolean`, `Game.quickPlay: (name: string) => void`; `connect(code, name, quick?)`; the `quick` flag is sent in `hello`.

- [ ] **Step 1: Add the `quick` field to the `Game` interface**

In `src/client/net.ts`, extend the `Game` interface (lines 8-18):

```ts
export interface Game {
  view: GameView | null;
  status: Status;
  error: string | null;
  seatId: number | null;
  lastEvents: GameEvent[];
  quick: boolean;
  connect: (code: string, name: string, quick?: boolean) => void;
  quickPlay: (name: string) => void;
  send: (action: Action) => void;
  leave: () => void;
  clearError: () => void;
}
```

- [ ] **Step 2: Track quick state and send it in `hello`**

Add state near the other `useState` calls (~line 27):

```ts
  const [quick, setQuick] = useState(false);
```

Add a requeue guard ref and an "entered a game" ref near the other refs (~line 32). The `entered` ref is used instead of the `view` state because `open()`'s closure has empty deps and would capture a stale `view`:

```ts
  const requeued = useRef(false);
  const entered = useRef(false); // flips true once we're actually in a game
```

In `open()`'s `sock.onopen`, include `quick` in the hello (replace the `hello` construction, ~line 44):

```ts
      const hello: ClientMessage = {
        t: "hello", name: p.name, sessionToken: token, playerId: getPlayerId(), quick: p.quick,
      };
```

Update the `params` ref type to carry `quick` (line 30):

```ts
  const params = useRef<{ code: string; name: string; quick: boolean } | null>(null);
```

- [ ] **Step 3: Update `connect` to accept and persist the quick flag**

Replace the `connect` callback (lines 68-79):

```ts
  const connect = useCallback(
    (code: string, name: string, quickMode = false) => {
      const upper = code.toUpperCase();
      params.current = { code: upper, name, quick: quickMode };
      alive.current = true;
      entered.current = false;
      setQuick(quickMode);
      localStorage.setItem("hexholm:room", upper);
      localStorage.setItem("hexholm:name", name);
      if (quickMode) localStorage.setItem("hexholm:quick", "1");
      else localStorage.removeItem("hexholm:quick");
      open();
    },
    [open],
  );
```

- [ ] **Step 4: Add `quickPlay` and auto-requeue on rejection**

Add the `quickPlay` callback after `connect` (~line 80):

```ts
  const quickPlay = useCallback(
    (name: string) => {
      requeued.current = false;
      fetch("/api/quickplay", { method: "POST" })
        .then((r) => r.json())
        .then(({ code }: { code: string }) => connect(code, name, true))
        .catch(() => setError("Couldn't find a match — try again."));
    },
    [connect],
  );
```

In `open()`'s `sock.onmessage`, mark `entered` true on `welcome`, and extend the `error` branch so a quick player rejected *before* entering a game re-queues once (~line 49-59):

```ts
      if (msg.t === "welcome") {
        entered.current = true;
        localStorage.setItem(tokenKey(p.code), msg.sessionToken);
        setSeatId(msg.seatId);
        setStatus("open");
      } else if (msg.t === "state") {
        setView(msg.view);
      } else if (msg.t === "event") {
        setLastEvents(msg.events);
      } else if (msg.t === "error") {
        const p2 = params.current;
        if (p2?.quick && !entered.current && !requeued.current) {
          requeued.current = true;
          alive.current = false;
          ws.current?.close();
          quickPlayRef.current?.(p2.name);
          return;
        }
        setError(msg.message);
      }
```

Because `open` is declared before `quickPlay`, call the requeue through a ref. Declare it near the other refs: `const quickPlayRef = useRef<(name: string) => void>(() => {});` and, after `quickPlay` is defined, keep it current with `quickPlayRef.current = quickPlay;` (either directly or in a `useEffect`). Confirm `npm run typecheck` stays clean.

Also reset `entered.current = false` at the start of `connect` (so a fresh connection can requeue again).

- [ ] **Step 5: Reset quick state in `leave` and expose new API**

In `leave` (lines 87-97), add:

```ts
    localStorage.removeItem("hexholm:quick");
    setQuick(false);
```

In the returned object (lines 107-117), add `quick` and `quickPlay`:

```ts
    quick,
    connect,
    quickPlay,
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/client/net.ts
git commit -m "feat: client quickPlay flow with auto-requeue on rejection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Landing — Quick Play button

**Files:**
- Modify: `src/client/screens/Landing.tsx`

**Interfaces:**
- Consumes: `Game.quickPlay` (Task 5).
- Produces: a prominent Quick Play button that calls `quickPlay(name)`.

- [ ] **Step 1: Thread `quickPlay` into the component**

In `src/client/screens/Landing.tsx`, extend the props (lines 6-12) and destructure:

```tsx
export function Landing({
  connect,
  quickPlay,
  status,
}: {
  connect: (code: string, name: string) => void;
  quickPlay: (name: string) => void;
  status: Status;
}) {
```

- [ ] **Step 2: Add the Quick Play handler**

Add near the existing `create`/`join` handlers (~line 42):

```tsx
  const quick = () => {
    remember();
    quickPlay(name.trim());
  };
```

(Blank names are fine — the server defaults an empty name to "Settler".)

- [ ] **Step 3: Add the Quick Play button above the Create/Join rows**

In the CTA area, insert a new row directly before the existing "Create table" row (before line 81's `<div>` that holds the name input). Replace the name-input row block so Quick Play sits on top:

```tsx
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
```

- [ ] **Step 4: Add the `quickBtn` style**

Add next to the other style consts at the bottom of the file (~line 148). Reuse the terracotta hero look, a touch larger:

```tsx
const quickBtn: React.CSSProperties = {
  background: C.terracotta,
  border: "none",
  color: "#FBF3E4",
  fontFamily: font.body,
  fontWeight: 800,
  fontSize: 17,
  padding: "17px 34px",
  borderRadius: 5,
  cursor: "pointer",
  letterSpacing: ".3px",
};
```

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/client/screens/Landing.tsx
git commit -m "feat: Quick Play button on the landing page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Matching screen + App routing

**Files:**
- Create: `src/client/screens/Matching.tsx`
- Modify: `src/client/App.tsx`

**Interfaces:**
- Consumes: `Game.quick` (Task 5), `Game.quickPlay` (Task 5), `GameView.seats`.
- Produces: a `Matching` screen shown while a quick room is in `lobby` phase; App routes lobby → `Matching` when `game.quick`, else `Lobby`.

- [ ] **Step 1: Create the Matching screen**

```tsx
// src/client/screens/Matching.tsx
import { C, font } from "../theme";
import { HexLogo } from "../components/icons";
import type { Game } from "../net";
import type { GameView } from "../../server/protocol";

export function Matching({ game, view }: { game: Game; view: GameView }) {
  const humans = view.seats.filter((s) => s.kind === "human").length;
  return (
    <div style={{ minHeight: "100vh", background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", color: C.cream }}>
        <HexLogo size={44} />
        <h1 style={{ fontFamily: font.display, fontWeight: 700, fontSize: 34, margin: "22px 0 8px" }}>
          Finding a match…
        </h1>
        <p style={{ color: "#B9C6BC", fontWeight: 600, fontSize: 15, margin: 0 }}>
          Pairing you with settlers — bots fill any empty seats in a moment.
        </p>
        <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 56, margin: "26px 0 4px", letterSpacing: 2 }}>
          {humans} / 4
        </div>
        <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#8E937F", fontWeight: 700 }}>
          settlers ready
        </div>
        <button
          onClick={game.leave}
          style={{ marginTop: 34, background: "transparent", border: "1px solid rgba(244,236,221,.35)", color: C.cream, fontFamily: font.body, fontWeight: 600, fontSize: 14, padding: "11px 22px", borderRadius: 5, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Route to Matching in App**

In `src/client/App.tsx`, add the import (after the `Lobby` import, line 4):

```tsx
import { Matching } from "./screens/Matching";
```

Update the screen selection (lines 30-36):

```tsx
  let screen;
  if (!view || status === "idle") {
    screen = <Landing connect={game.connect} quickPlay={game.quickPlay} status={status} />;
  } else if (view.phase === "lobby") {
    screen = game.quick ? <Matching game={game} view={view} /> : <Lobby game={game} view={view} />;
  } else {
    screen = <GameScreen game={game} view={view} />;
  }
```

- [ ] **Step 3: Preserve quick mode across a page reload**

In `src/client/App.tsx`, update the auto-rejoin effect (lines 15-21) to pass the persisted quick flag:

```tsx
  useEffect(() => {
    if (reconnected.current) return;
    reconnected.current = true;
    const room = localStorage.getItem("hexholm:room");
    const name = localStorage.getItem("hexholm:name");
    const wasQuick = localStorage.getItem("hexholm:quick") === "1";
    if (room && name) game.connect(room, name, wasQuick);
  }, [game]);
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client/screens/Matching.tsx src/client/App.tsx
git commit -m "feat: matching screen and quick-play routing

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full suite and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 2: Local smoke test with `wrangler dev`**

Run: `npm run dev` and open the local URL in two browser windows.
- In window A, enter a name and click **⚡ Quick Play**. Confirm the Matching screen shows "1 / 4".
- Within 3 seconds (before the deadline), in window B click **Quick Play**. Confirm both windows show a rising human count and then transition into the same game within ~3s.
- In a single window, click **Quick Play** and wait: confirm the game starts within ~3s backfilled with bots (3 bots for a lone human).
- Confirm **Create private table** + **Join table** still work (non-quick rooms show the normal Lobby with ready/start).

- [ ] **Step 3: Commit any fixes**

If the smoke test surfaced issues, fix them, re-run Step 1, and commit with a descriptive message and the co-author trailer.
```
