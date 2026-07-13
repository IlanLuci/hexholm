# Configurable Room Settings — Design

**Date:** 2026-07-13
**Status:** Approved

## Goal

Let the room owner change two game settings before the game starts, for **custom
(code-shared) rooms** and **offline** games only — never for matchmaking:

- **Victory points to win:** an integer 7–13 (default 10).
- **Placement mode:** during the setup phase each player either places **two
  settlements** (default, today's behavior) or a **settlement and a city**.

## Settings model

Add a `settings` object to `GameState`:

```ts
settings: { winVP: number; setupMode: "settlements" | "settlementCity" }
```

- `createLobby` defaults it to `{ winVP: 10, setupMode: "settlements" }`.
- **Defensive defaulting on load:** games persisted before this field exists
  (production Durable Objects, offline `localStorage` saves) must not crash. Both
  load paths — the `GameRoom` DO constructor and the client's offline
  resume — coerce a missing/partial `settings` to the defaults before use.

## Owner and edit permissions

- The **owner is seat 0**. The room creator always joins first (in offline the
  human is the only human, at seat 0).
- `toView(state, viewer)` exposes `settings` and `youAreOwner: viewer === 0`.
- Only the owner is shown editable controls; other seats see the values
  read-only. The server enforces owner-only regardless of the client.

## Engine changes (`src/shared`)

### New lobby action

```ts
{ type: "setSettings"; winVP?: number; setupMode?: "settlements" | "settlementCity" }
```

Handled in `applyLobby`:
- Rejected unless `phase === "lobby"`.
- Rejected unless `seat === 0` (owner).
- `winVP`, if present, must be an integer in `[7, 13]` — else error.
- `setupMode`, if present, must be one of the two literals — else error.
- Applies the provided fields to `state.settings`. **Does not** reset ready flags
  (explicit product decision).

### Win condition

`hasWon(state, seat)` compares against `state.settings.winVP` instead of the
module constant `WIN_VP`. (`WIN_VP` is removed or kept only as the default value
used by `createLobby`.)

### Setup "settlement + city"

In `applySetup`, when `state.settings.setupMode === "settlementCity"` and the
setup is in **round 2**, the placement pushes a **city** to `buildings.cities`
instead of a settlement to `buildings.settlements`:

- Same vertex legality via `canPlaceSettlement(..., { setup: true })` (distance
  rule unchanged).
- Same round-2 resource grant (one of each adjacent hex's resource).
- The snake-order progression and the "setup complete" check must count **total
  buildings placed** (settlements + cities), not settlements alone, so both modes
  terminate correctly. (`totalSettlements` generalizes to count both.)

Round 1 always places a settlement in both modes. Bots place via the same
`placeSettlement` action, so no bot logic changes — the engine routes the round-2
placement to a city based on `setupMode`. Result: each player starts with 1
settlement + 1 city = 3 VP in `settlementCity` mode (vs 2 VP with two
settlements). `victoryPoints` already scores cities at 2 VP — no scoring change.

## Wire/view changes

- `GameView` gains `settings: { winVP: number; setupMode: "settlements" | "settlementCity" }`
  and `youAreOwner: boolean`.
- The `hello`/protocol `Action` union gains the `setSettings` variant (it lives in
  `src/shared/actions.ts` with the other actions).

## Server (`GameRoom`)

- Constructor defensively defaults `this.game.settings` if a loaded game lacks it.
- `handleAction` rejects `setSettings` when `this.quickMatch` is true (defense —
  matchmaking rooms never surface the UI, but the server refuses it anyway).
  Owner and validation checks live in the engine and apply to all rooms.

## Online lobby UI (`Lobby.tsx`)

The existing **"Table settings"** panel becomes live. The Lobby renders only for
custom rooms (matchmaking uses the Matching screen), so its mere presence implies
a custom room.

- **Victory points** row: for the owner, a stepper (− / value / +) clamped to
  7–13 that sends `{ type: "setSettings", winVP }`. Non-owner: read-only number.
- **Placement** row (new): for the owner, a two-option toggle "Two settlements" /
  "Settlement + city" sending `{ type: "setSettings", setupMode }`. Non-owner:
  read-only label.
- **Board** and **Robber** rows stay static.
- Values are driven by `view.settings`; the owner gate is `view.youAreOwner`.

## Offline UI (`Landing.tsx`) + driver

Offline has no lobby, so the offline Landing block gains the same two choices
next to the existing 3/4-player selector:

- A VP stepper (7–13, default 10) and a placement toggle (default two
  settlements), held in Landing state.
- `playOffline` signature extends to carry the chosen settings; the offline
  driver, in `start`, applies `{ type: "setSettings", winVP, setupMode }` at seat
  0 (owner) **before** `apply(start)`, reusing the engine path so offline and
  online behave identically.

## Testing

- **`setSettings` action** (engine unit tests):
  - Owner (seat 0) sets `winVP` in range and `setupMode` — state updates.
  - Non-owner (seat 1) is rejected.
  - `winVP` of 6, 14, or non-integer is rejected; unknown `setupMode` is rejected.
  - `setSettings` outside the lobby phase is rejected.
  - Ready flags are unchanged after a settings change.
- **Win condition:** with `winVP = 7`, a seat reaching 7 VP wins and one at 6 does
  not; the default (10) is unchanged.
- **Setup city mode:** in `settlementCity`, round-2 placement creates a city, the
  player is granted resources, setup completes for all seats, and each starts at 3
  VP; a full bot game in this mode still reaches a winner.
- **Defensive default:** a `GameState` object without `settings` is coerced to the
  defaults by the load paths (test the coercion helper directly).
- **Regression:** the existing 86-test suite stays green (setup/scoring tests that
  assumed a 2-settlement start or `WIN_VP = 10` are updated to the new model where
  they assert defaults).

## Out of scope

- Matchmaking rooms (unchanged; always defaults).
- Board layout and robber rules (stay fixed).
- In-game copy that hardcodes "ten victory points" beyond the Lobby panel — a
  possible follow-up.
