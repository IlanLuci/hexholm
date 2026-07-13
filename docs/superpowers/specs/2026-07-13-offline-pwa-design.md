# Offline PWA + Local Bot Game — Design

**Date:** 2026-07-13
**Status:** Approved

## Goal

Make Hexholm work offline as an installable PWA. When the browser is offline, the
landing page shows a single **Play offline vs bots** entry (reachable through the
same Quick Play affordance) that runs a complete game entirely in the browser
against bots. The online experience is unchanged.

## Scope decisions

- **Offline-only trigger:** the local bot game is reachable only when the browser
  is offline. Online, Quick Play does normal matchmaking. (No online "practice"
  entry point.)
- **Full installable PWA:** web manifest + generated PNG icons, add-to-home-screen.
- **Table size:** offline supports 1 human + **2 or 3 bots** (a 3- or 4-player
  table). Default is 4 players (3 bots); the offline entry lets the player pick 3
  or 4 before starting.

## Architecture

The game engine (`src/shared/`) and the bot AI are pure and already partly
consumed by the client, so the offline game reuses them directly — no second
implementation. The only genuinely new runtime pieces are a service worker
(app-shell caching) and a client-side game loop that replaces the server room.

### 1. Service worker & PWA shell (`vite-plugin-pwa`)

Add **`vite-plugin-pwa`** (Workbox) to `vite.config.ts`:

- **Precache** the hashed app shell — `index.html`, JS/CSS bundles, `favicon.svg`,
  generated icons — with `registerType: "autoUpdate"` and a SPA `navigateFallback`
  to `index.html`, so a cold reload while offline still loads the app.
- **Runtime-cache Google Fonts:** a `CacheFirst` runtime route for
  `https://fonts.googleapis.com` (stylesheet) and `https://fonts.gstatic.com`
  (woff2 files), so returning offline users keep the real fonts. `system-ui` in the
  body `font-family` remains the fallback on a cold offline load.
- **Web manifest:** `name` "Hexholm", `short_name` "Hexholm", `theme_color`
  `#20323C`, `background_color` `#1A2A32`, `display: "standalone"`, `start_url: "/"`.
- **Icons:** generate `pwa-192x192.png`, `pwa-512x512.png`, a maskable 512, and an
  apple-touch icon from the existing hex logo (`public/favicon.svg`) via
  `@vite-pwa/assets-generator` (run as a build/prep step; committed to `public/`).
- Output (`sw.js`, `manifest.webmanifest`, icons) lands in `dist/client/` and is
  served by the existing Cloudflare `ASSETS` binding. **No Worker code changes.**
- SW registration + manifest `<link>` are injected by the plugin. Development uses
  the plugin's `devOptions` so `vite` still runs normally.

### 2. Portability refactor (small, targeted)

- **Move `src/server/bots.ts` → `src/shared/bots.ts`.** It imports only `shared/*`.
  Update the two importers (`src/server/room.ts`, `src/server/bots.test.ts` → moves
  to `src/shared/bots.test.ts`) and re-export from `src/shared/index.ts`.
- **Move the bot pacing helper into shared** alongside bots: `BOT_DELAY_MS`,
  `TRADE_WAIT_MS`, and `delayAfter(events)` (currently local to `room.ts`). Both the
  server room and the offline driver import them, so bot timing is identical online
  and offline. `room.ts` keeps `IDLE_MS` (server-only).
- The offline driver imports the pure `toView` from `src/server/views.ts`. The
  client already imports view *types* from `src/server/protocol`, so this keeps the
  existing (already-crossed) boundary rather than forcing a larger type move.

### 3. Offline game driver (`src/client/offlineGame.ts`)

A framework-agnostic controller mirroring `room.ts` minus the network. It owns a
`GameState`, applies actions, and paces bots on timers.

```ts
interface OfflineDriver {
  start(bots: 2 | 3, name: string): void;   // build lobby → add human + bots → start
  send(action: Action): void;                 // apply a human action, then step bots
  leave(): void;                              // stop timers, clear saved game
  view(): GameView | null;                    // toView(game, humanSeat)
}
```

- **Start:** `createLobby(localCode, randomSeed)` → `addSeat(human)` → `addBot`×N →
  force all seats ready → `apply(start)`. `localCode` is a fixed sentinel (e.g.
  `"SOLO"`); `randomSeed` from `crypto.randomUUID()`.
- **Human action:** `apply(game, action, humanSeat)`; on success update state, emit
  events, then `scheduleBots()`.
- **Bot loop (`scheduleBots`):** if `hasBotMove(game)`, `setTimeout(step,
  delayAfter(lastEvents))`; `step` runs `stepBots`, updates state, emits events, and
  re-schedules. If a bot's trade offer is awaiting the human, arm a `TRADE_WAIT_MS`
  timer that cancels the offer (mirrors the room's trade-timeout). No idle-takeover
  (the human is always present).
- **State surface:** a change callback lets the React hook re-render from
  `toView(game, humanSeat)`; `apply`'s `events` feed the existing `ActionToast`.
- **Resume:** persist `{ game, humanSeat }` to `localStorage["hexholm:offline"]` on
  every change; `leave()` and reaching `finished` clear it. A saved game can be
  rehydrated by the hook on load.

Timers are injected (a `setTimer`/`clearTimer` pair defaulting to
`window.setTimeout`/`clearTimeout`) so unit tests drive the loop synchronously.

### 4. Connectivity + Landing UX

- **`useOnline()` hook** (`src/client/useOnline.ts`): returns `navigator.onLine`,
  subscribed to `window` `online`/`offline` events.
- **Offline Landing:** hide **Create table** and **Join table** (both need the
  server); show a single **Play offline vs bots** button plus a small **3 / 4
  players** selector (default 4 → 3 bots; 3 → 2 bots). Replace the "N settlers"
  status chip with an **offline indicator**: a muted dot + "Offline — play the bots".
- **Online Landing:** unchanged (matchmaking Quick Play + Create/Join, settlers
  count).

### 5. `useGame` integration

- `quickPlay(name)` branches on `navigator.onLine`: **online** → existing
  `/api/quickplay` + WebSocket flow; **offline** → start the local driver.
- A new `playOffline(bots, name)` entry (called by the offline button) boots the
  driver. `send`, `leave`, `view`, `lastEvents`, and `seatId` route to whichever
  backend is active (WebSocket or offline driver), so `App`, `Game`, and the toasts
  render unchanged. Offline **skips the Matching screen** and goes straight into the
  game (there is nothing to wait for).
- On load, the existing auto-rejoin effect is extended: if offline and a saved
  offline game exists, resume it via the driver instead of attempting a WS rejoin.

## Testing

- **Offline driver (unit, injected timers):**
  - `start(3, name)` yields a 4-seat game in `setup` (1 human + 3 bots), all bots
    ready; `start(2, name)` yields 3 seats.
  - A human setup placement advances `game.version`.
  - Draining the injected timer queue drives the game to `finished` with a winner
    (mirrors the existing `driveBots` test).
  - Reaching `finished` clears the saved-game key; `leave()` clears it.
- **`useOnline`:** reflects `navigator.onLine` and flips on `online`/`offline`
  events.
- **Landing split:** renders the offline button + indicator (no Create/Join) when
  offline; the normal CTAs when online.
- **Regression:** full existing suite (79 tests) stays green after the `bots.ts`
  move (the moved test runs from its new path).

## Known trade-offs (acceptable)

- A first-ever visit must be online to install the SW and populate the cache
  (unavoidable for any PWA).
- On a truly cold offline load, Google Fonts fall back to `system-ui` until a
  future online visit caches them.
- The offline game is single-human vs 2–3 bots; no offline multiplayer (no
  transport).
