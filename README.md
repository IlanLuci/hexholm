# Hexholm

A real-time, multiplayer implementation of base-game Catan for 2–4 players, built
from the [Hexholm design prototype](https://claude.ai/design). Gather brick, grain
and ore, cut shrewd trades, block your rivals with the robber, and race to ten
victory points.

- **Frontend:** React + Vite, reproducing the Hexholm visual design (SVG hex board).
- **Backend:** Cloudflare Worker + one `GameRoom` Durable Object per room,
  coordinating players over WebSockets with an authoritative, server-side rules
  engine.
- **Opponents:** other humans (join by room code) and/or AI bots.

## Architecture

```
Browser (React SPA) ──HTTP──▶ Worker (serves SPA, routes /api)
      │                            │
      └──── WebSocket ───▶  GameRoom Durable Object (one per room code)
                                • authoritative GameState (persisted)
                                • per-seat hidden-info views
                                • drives AI bot turns
```

| Path | Responsibility |
|------|----------------|
| `src/shared/` | Pure, deterministic rules engine + types. No I/O. Fully unit-tested. |
| `src/server/` | Worker entry, `GameRoom` Durable Object, WS protocol, hidden-info views, bots. |
| `src/client/` | React SPA: landing, lobby, game board, and all modals. |
| `docs/superpowers/` | Design spec and implementation plan. |

The rules engine (`src/shared/engine.ts`) is a pure reducer
`apply(state, action, seat) → { state, events } | { error }`. All randomness flows
through a seeded RNG, so games are deterministic and reproducible in tests.

## Develop

```bash
npm install
npm test           # rules engine + server unit/integration tests (Vitest)
npm run typecheck  # server + client type-checking

# Run the full app (Worker + Durable Object + built client) via Miniflare:
npm run build      # build the client into dist/client
npm run dev        # wrangler dev  → http://localhost:8787

# Or iterate on the client with hot reload (proxies /api to `wrangler dev`):
npm run dev        # terminal 1
npm run dev:client # terminal 2 → http://localhost:5173
```

Open two browser tabs (or share the room code) to play against another human; use
**+ Add bot** in the lobby to fill seats with AI opponents.

## Deploy

```bash
wrangler login                       # first time only
wrangler secret put ADMIN_KEY        # set the admin dashboard key (required for /admin)
npm run deploy                       # builds the client, then `wrangler deploy`
```

Requires a Cloudflare account. Durable Objects with SQLite storage are configured in
`wrangler.jsonc`. The admin key is **not** committed: locally it comes from `.dev.vars`
(git-ignored), and in production from the `ADMIN_KEY` secret. If no key is set, `/admin`
stays locked (401).

## Rules implemented

Full base game: snake-order setup placement, dice production (with bank limits),
build road/settlement/city, robber on a 7 (discard, move, steal), all five
development cards (knight, road building, year of plenty, monopoly, victory point),
longest road, largest army, 4:1 / 3:1 / 2:1 bank and harbor trades, player-to-player
trading, and victory at 10 points.
