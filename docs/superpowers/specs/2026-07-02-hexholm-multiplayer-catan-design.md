# Hexholm — Multiplayer Catan: Design Spec

**Date:** 2026-07-02
**Status:** Approved (architecture), pending spec review

## 1. Overview

Hexholm is a browser-based, real-time multiplayer implementation of base-game
Catan for 2–4 players. It reuses the visual design from the Claude Design
prototype (`Hexholm.dc.html`): a warm parchment/teal palette, Zilla Slab display
type + Manrope body, and an SVG hex board.

Players join a room by short code (guest name, no accounts). The host can add AI
bots to fill empty seats. All game rules are enforced authoritatively on the
server; clients render state and send intents.

### Goals
- Full base Catan rules (see §5), enforced server-side.
- 2–4 seats, any mix of humans and AI bots.
- Real-time: every seat sees the same state within a network round-trip.
- Reconnect: refreshing or dropping and rejoining restores your seat.
- Faithful to the Hexholm visual design.

### Non-goals (YAGNI)
- Accounts / auth / persistent profiles / stats / matchmaking.
- Expansions (Seafarers, Cities & Knights), 5–6 player boards.
- Spectators, chat (beyond the game log), replays.
- Mobile-native apps (responsive web only).

## 2. Tech stack & repo layout

- **Language:** TypeScript everywhere.
- **Client:** React 18 + Vite. No component framework; styles inline/CSS matching
  the prototype. Fonts via Google Fonts (Zilla Slab, Manrope).
- **Server:** Cloudflare Worker + one Durable Object class `GameRoom`.
- **Transport:** WebSocket (DO WebSocket Hibernation API) for game traffic; plain
  HTTP for room creation and asset serving.
- **Build/deploy:** Wrangler. The Worker serves the built SPA via the assets
  binding and routes `/api/*` itself.
- **Tests:** Vitest for the rules engine (pure, heavy coverage) and
  `@cloudflare/vitest-pool-workers` for DO/integration tests.

```
src/
  shared/
    board.ts        # board geometry: hex/vertex/edge ids, adjacency, ports
    state.ts        # GameState + related types
    actions.ts      # Action union + result/event types
    engine.ts       # pure reducer: apply(state, action, seat) -> {state, events} | error
    legal.ts        # legal-move helpers (shared by engine + client hints)
    scoring.ts      # longest road, largest army, victory points
    rng.ts          # seedable RNG (deterministic dice/robber for tests)
    index.ts
  server/
    index.ts        # Worker: asset serving + /api routes + DO routing
    room.ts         # GameRoom Durable Object
    protocol.ts     # client<->server message types
    bots.ts         # AI bot decision logic
  client/
    main.tsx, App.tsx
    net.ts          # WebSocket client + reconnect
    screens/        # Landing, Lobby, Game
    components/      # Board (SVG), Hand, PlayerCard, GameLog, ...
    modals/          # Trade, Dev, Discard, Steal, YearOfPlenty, Monopoly, Rules, Win
    theme.ts         # palette, fonts, resource metadata from prototype
wrangler.jsonc
vite.config.ts
index.html
```

## 3. Board model (`shared/board.ts`)

Standard Catan board, generated once per game (with per-game randomization).

- **Hexes:** 19 tiles laid out in rows of 3-4-5-4-3. Each hex has an axial coord,
  a resource (`brick|wood|sheep|wheat|ore|desert`) and a number token (2–12, no 7;
  desert has none). Distribution: 4 wood, 4 sheep, 4 wheat, 3 brick, 3 ore, 1
  desert; the 18 tokens (2×1,3×2,4×2,5×2,6×2,8×2,9×2,10×2,11×2,12×1).
  Randomization: shuffle resources + tokens onto positions. (A "balanced" flag can
  reject adjacent 6/8 later; not required for v1.)
- **Vertices (54):** settlement/city spots. Each vertex knows its adjacent hexes
  (1–3) and adjacent vertices (2–3) and incident edges.
- **Edges (72):** road spots. Each edge knows its two endpoint vertices and its
  neighboring edges.
- **Ports (9):** 4 generic 3:1 and 5 specific 2:1 (brick, wood, sheep, wheat, ore),
  each attached to two specific coastal vertices.

Geometry is derived deterministically from the layout so vertex/edge ids are
stable; ids are integers. A pixel-projection helper maps hex/vertex/edge ids to
SVG coordinates for rendering (shared so server logs and client agree on layout).

## 4. Game state (`shared/state.ts`)

```
GameState {
  roomCode: string
  phase: 'lobby' | 'setup' | 'play' | 'finished'
  board: Board                       // hexes, ports (geometry is derivable)
  seats: Seat[]                       // 2..4, index = seat id
  turnOrder: number[]                // seat ids
  activeSeat: number
  setup: { round: 1|2, order: number[], step: 'settle'|'road', lastVertex } | null
  turn: {                            // during 'play'
    hasRolled: boolean
    dice: [number, number] | null
    mustMoveRobber: boolean
    freeRoads: number                // road-building card
    devPlayedThisTurn: boolean
    boughtDevThisTurn: string[]      // ids not yet playable
  } | null
  robberHex: number
  pendingDiscards: Record<seat, number>   // when a 7 is rolled
  steal: { candidates: seat[] } | null
  trade: TradeState | null           // active player-trade offer
  bank: ResourceBank                 // remaining resource + dev cards
  winner: number | null
  log: LogEntry[]
  seed: string                       // RNG seed for determinism
  version: number                    // increments each applied action
}

Seat {
  id: number
  name: string
  color: string
  kind: 'human' | 'bot'
  connected: boolean
  resources: Record<Resource, number>   // hidden from others (see §6)
  devCards: DevCard[]                    // hidden
  playedKnights: number
  buildings: { settlements: vertexId[], cities: vertexId[], roads: edgeId[] }
  publicVP: number                       // excludes hidden VP dev cards
  ports: Set<PortType>
  ready: boolean                         // lobby
}
```

Resource/dev-card counts of *other* players are never sent to a client in full;
each client receives its own hand plus public aggregates (hand size, played
knights, buildings, VP). See §6.

## 5. Rules engine (`shared/engine.ts`)

Pure function: `apply(state, action, seat) -> { state, events } | { error }`.
No randomness except through the seeded RNG carried in state. Every action is
fully validated; illegal actions return an error and do not mutate.

**Phases & flow**
- **lobby:** seats join, set name/color, toggle ready, host adds/removes bots,
  host starts when ≥2 seats and all ready.
- **setup:** snake order (1..N then N..1). Each seat places 1 settlement + 1
  adjacent road. Second settlement grants starting resources from adjacent hexes.
- **play:** active seat's turn = `rollDice` → (optional actions) → `endTurn`.
  - Roll 7 → robber flow: every seat with >7 cards discards half (floor), then
    active seat moves robber to a new hex and steals 1 random card from an
    adjacent opponent.
  - Non-7 → each settlement/city adjacent to a matching-number hex produces
    (settlement 1, city 2), limited by the bank.
  - Actions: build road / settlement / city (distance + connectivity rules),
    buy dev card, play dev card (once/turn, not one bought this turn; knight,
    road building, year of plenty, monopoly; VP cards are passive), bank/port
    trade (4:1, 3:1, 2:1), propose/accept/reject/confirm player trade.
- **finished:** a seat reaching 10 VP (public + hidden VP cards) on their turn ends
  the game.

**Scoring (`shared/scoring.ts`)**
- Longest road: longest continuous road path ≥5, broken by opponent buildings;
  ties keep current holder. +2 VP.
- Largest army: first to 3 played knights, then most; +2 VP.
- Victory checked after every action; hidden VP cards count only for the owner
  until reveal at win.

**Determinism:** all dice, robber-steal target card, and bot randomness draw from
`state.seed` via `shared/rng.ts`, so a game is reproducible for tests and replay.

## 6. Server: GameRoom DO + protocol (`server/`)

**Worker (`index.ts`)**
- `POST /api/room` → create a room: allocate a code, return it (idempotent-ish).
- `GET /api/room/:code/ws` → upgrade to WebSocket, forward to the DO for `:code`.
- Everything else → static SPA assets.

**GameRoom Durable Object (`room.ts`)**
- Owns one `GameState`, persisted to DO storage after every applied action
  (survives hibernation).
- Uses WebSocket Hibernation API; tracks `sessions: Map<ws, {seat, sessionToken}>`.
- On connect: client sends `hello{ roomCode, name, sessionToken? }`. New player →
  assign seat (lobby only) + issue session token. Returning token → reattach to
  existing seat, mark connected.
- On `action` message: validate it's from the seat whose turn/right it is, run
  `apply`, persist, then broadcast.
- Drives bots: when `activeSeat` is a bot (or a bot owes a discard/trade
  response), schedule bot moves via `setTimeout`/alarms with a small delay.

**Message protocol (`protocol.ts`)** — JSON.
- Client→server: `hello`, `setName`, `setColor`, `ready`, `addBot`, `removeBot`,
  `start`, `action` (the Action union from `shared/actions.ts`).
- Server→client: `welcome{ seatId, sessionToken }`, `state{ view }`,
  `event{ ... }` (for animations/log), `error{ message }`.
- **State views / hidden info:** the DO computes a per-seat *view* of `GameState`
  that includes that seat's own hand + dev cards but replaces opponents' hands
  with counts only. Clients render from their view; the engine on the server
  always operates on full state.

**Reconnection:** session token in `localStorage`; on reload the client reconnects,
sends the token, and the DO restores the seat and pushes current state.

## 7. AI bots (`server/bots.ts`)

Heuristic, runs inside the DO on the bot's turn/obligations:
- **Setup:** pick a high-pip, resource-diverse vertex; place road toward open
  expansion.
- **Turn:** roll; build cities > settlements > roads when affordable and useful;
  buy dev cards with surplus; play knight to move robber onto the strongest
  opponent hex; use year-of-plenty/monopoly opportunistically; end turn.
- **Robber:** target the leader's best-producing hex not adjacent to itself.
- **Discard:** shed lowest-value surplus.
- **Trades:** decline player offers in v1 (accept only strictly-beneficial ones if
  time permits); use bank/port trades to complete a build.

Bots are not perfect; the bar is "plausible opponent that follows the rules and
keeps the game moving."

## 8. Client (`client/`)

React SPA reproducing the prototype's three screens + modals, driven by the
per-seat state view over the socket.
- **Landing:** hero with blurred board backdrop, "Play now" → lobby.
- **Lobby:** room code, seat list with ready toggles, add-bot controls (host),
  table settings, start button.
- **Game:** left rail (player cards, VP, longest-road/largest-army chips, game
  log), center SVG board (hexes, number tokens, robber, roads, settlements,
  cities, port markers), bottom action bar (hand cards, dice, roll, build
  options, trade, dev, end turn). Board is interactive: highlight legal vertices
  in settle/city mode, legal edges in road mode, hexes in robber mode — legality
  from `shared/legal.ts`.
- **Modals:** Trade (bank/harbor + player offer + responses), Dev cards, Robber
  discard, Steal target, Year of Plenty, Monopoly, Rules, Win.
- **Net layer (`net.ts`):** connect, send actions, apply incoming state, handle
  reconnect + error toasts. Optimistic UI is avoided for v1 (authoritative state
  only) to keep correctness simple; interactions feel instant because the DO is
  local to the room.

## 9. Phasing / milestones

1. **Rules engine** (`shared/*`) — pure, TDD. Deliverable: a full game can be
   driven to a win in tests with no network. **Highest priority; everything
   depends on it.**
2. **Server** — Worker + GameRoom DO + protocol + reconnection + persistence.
   Deliverable: two browser tabs play a shared game (no bots yet).
3. **Client** — all screens + modals wired to the socket, faithful to the design.
4. **Bots** — fill seats, play a legal game.
5. **Polish + deploy** — reconnection UX, error states, responsive tweaks,
   `wrangler deploy`.

## 10. Testing strategy

- **Rules engine:** exhaustive Vitest unit tests — board generation invariants,
  each action's legality (positive + negative), setup snake order + starting
  resources, production incl. bank limits, 7/robber/discard/steal, every dev card,
  longest road (incl. break-by-building + ties), largest army, all trade paths,
  victory. Seeded RNG for determinism. Property/scenario test: play scripted full
  games to a win.
- **Server:** `vitest-pool-workers` integration — join/reconnect, seat assignment,
  hidden-info views, action authorization, bot turn progression, persistence
  across DO restart.
- **Client:** component tests for the board projection + legal-move highlighting;
  manual/e2e smoke for full-game feel.
- Verify before claiming done: engine suite green, integration suite green, a real
  two-tab game played through, `wrangler deploy` dry-run clean.
