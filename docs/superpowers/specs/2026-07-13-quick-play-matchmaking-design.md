# Quick Play Matchmaking — Design

**Date:** 2026-07-13
**Status:** Approved

## Goal

Add a **Quick Play** button to the landing page that drops a player straight
into a match with other real players, backfilling with bots so that **no player
waits more than ~3 seconds** for the game to start.

Scope is Quick Play only — no browsable public-lobby list.

## Table sizing

Target a 4-seat table, but allow a 3-player all-human table at the deadline:

- 4 humans connected → start immediately (all human).
- At the deadline with 3 humans → start a 3-player, all-human table.
- At the deadline with 1–2 humans → backfill with bots up to 4 seats, then start.
- At the deadline with 0 humans (nobody actually connected) → stay idle.

## Architecture

Reuses the existing Room DO machinery (bots, alarms, `startSetup`, presence).
The only genuinely new piece is a lightweight router.

### 1. `Matchmaker` Durable Object (router)

A single global DO (`idFromName("global")`). Registered in `wrangler.jsonc`
with a `v4` migration (`new_sqlite_classes: ["Matchmaker"]`). Exposes one RPC:

```ts
claim(now: number): string {
  if (!this.forming || this.forming.size >= TARGET || now >= this.forming.expires) {
    this.forming = { code: randomCode(), size: 0, expires: now + FORMING_MS };
  }
  this.forming.size++;
  // persist this.forming
  return this.forming.code;
}
```

- `TARGET = 4`, `FORMING_MS = 2500`.
- Every player who claims within the same window (and before the 4-cap) gets the
  **same room code**. The returned code is only a routing hint; the room is the
  source of truth for who actually connects.
- `now` is passed in (from the Worker) so the DO is deterministically testable,
  following the seam style already used in `rate.ts`.
- State persisted to `ctx.storage` so an eviction mid-forming doesn't double-book.

### 2. Worker endpoint

`POST /api/quickplay`:

- Per-IP rate limited via the existing `RateLimiter` with a new `quickplay`
  bucket (~20 / 60s), mirroring the `room` bucket.
- Calls `Matchmaker.claim(Date.now())` and returns `{ code }`.
- The client then connects to that room over the existing
  `/api/room/:code/ws` WebSocket path.

### 3. Room DO — the 3-second guarantee

The `hello` client message gains an optional `quick?: boolean`. Room additions:

- New persisted fields: `quickMatch: boolean`, `quickDeadline: number` (ms epoch).
- First quick hello: set `quickMatch = true`, `quickDeadline = Date.now() + MATCH_DEADLINE_MS`
  (`3000`), and arm the alarm for that time.
- Every quick seat is **auto-readied** on join (Quick Play has no ready/start UI).
- **Instant start:** after a quick hello, if 4 humans are connected, start now.
- **Deadline alarm** (fired while still in `lobby` and `quickMatch`):
  - 3 humans → start as-is (all human, 3 seats).
  - 1–2 humans → `addBot` until `seats.length === 4`, then start.
  - 0 humans → do nothing (idle).
  - Starting reuses the engine's existing start logic (`startSetup`) followed by
    `trackTransition` so stats/presence stay correct.

The alarm handler must interleave this with the existing bot-move / idle-takeover
/ trade-timeout logic: when `quickMatch && phase === "lobby"`, the alarm is the
auto-start deadline; otherwise the current behavior is unchanged.

**Timing invariant:** `FORMING_MS (2500) < MATCH_DEADLINE_MS (3000)`, so the
last-routed player always connects before the room fires. Room deadline is
measured from the first arrival; with sub-500ms connect latency, click-to-start
stays within ~3s. Both values are named constants.

### 4. Client

- `net.ts`: `connect(code, name, quick?)`. Send `quick` in the hello. Expose
  `game.quick`. Persist a `hexholm:quick` flag alongside `hexholm:room` so a
  reload mid-matching still renders the matching screen. If a quick connect is
  rejected with an "in progress" / "full" error before entering a game (a rare
  late-route race), auto re-queue once via `/api/quickplay`.
- **Landing**: add a prominent **Quick Play** primary button above the existing
  Create / Join rows. Uses the existing name field; a blank name falls through to
  the server's existing "Settler" default.
- New **`Matching.tsx`** screen: rendered while a quick room is in `lobby` phase.
  Shows "Finding a match…" with a live "N / 4 settlers" count from `view.seats`,
  and auto-advances to the game screen when the phase changes.
- **App routing:** when `view.phase === "lobby"`, render `Matching` if
  `game.quick` else the existing `Lobby`.

## Testing

- **Matchmaker** (unit, injected clock):
  - Two claims within the window return the same code.
  - The 5th claim (after the 4-cap) rolls to a new code.
  - A claim after `expires` rolls to a new code.
- **Room quick-match** (drive the DO directly):
  - Quick hellos auto-ready seats.
  - 4 humans → instant start (phase becomes `setup`).
  - Deadline fill branches: 3 humans → 3-seat start; 2 → +2 bots; 1 → +3 bots;
    0 → stays in lobby.

## Known limits (acceptable for now)

- The single global Matchmaker serializes all claims. Fine at current scale;
  shardable later by hashing the caller into N matchmaker instances.
- The forming/deadline split assumes sub-500ms connect latency. If that breaks,
  the affected late player simply re-queues (client auto-retry).
