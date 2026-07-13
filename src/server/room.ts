import { DurableObject } from "cloudflare:workers";
import type { GameState } from "../shared/types";
import type { GameEvent } from "../shared/actions";
import { apply, addSeat, createLobby } from "../shared/engine";
import { victoryPoints } from "../shared/scoring";
import { ensureSettings } from "../shared/setup";
import { toView } from "./views";
import { hasBotMove, stepBots, BOT_DELAY_MS, TRADE_WAIT_MS, delayAfter } from "../shared/bots";
import { MATCH_DEADLINE_MS, deadlineBots } from "./quickmatch";
import type { StatsHub } from "./stats";
import type { RateLimiter } from "./rate";
import type { Matchmaker } from "./matchmaker";
import type { ClientMessage, ServerMessage } from "./protocol";

/** How long the active seat may stay a disconnected human before a bot takes over. */
const IDLE_MS = 75_000;

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  STATS: DurableObjectNamespace<StatsHub>;
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
  MATCHMAKER: DurableObjectNamespace<Matchmaker>;
  ASSETS: Fetcher;
  ADMIN_KEY: string;
}

interface Attachment {
  seatId: number;
  token: string;
}

/** One live game room: authoritative state + connected players over WebSockets. */
export class GameRoom extends DurableObject<Env> {
  private game: GameState | null = null;
  private tokens: Record<string, number> = {};
  private seatPlayers: Record<number, string> = {}; // seatId -> persistent player id
  private gameStartMs = 0;
  private quickMatch = false;
  private quickDeadline = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.game = (await ctx.storage.get<GameState>("game")) ?? null;
      if (this.game) ensureSettings(this.game);
      this.tokens = (await ctx.storage.get<Record<string, number>>("tokens")) ?? {};
      this.seatPlayers = (await ctx.storage.get<Record<number, string>>("seatPlayers")) ?? {};
      this.gameStartMs = (await ctx.storage.get<number>("gameStartMs")) ?? 0;
      this.quickMatch = (await ctx.storage.get<boolean>("quickMatch")) ?? false;
      this.quickDeadline = (await ctx.storage.get<number>("quickDeadline")) ?? 0;
    });
  }

  private stats(): DurableObjectStub<StatsHub> {
    return this.env.STATS.get(this.env.STATS.idFromName("global"));
  }

  /** Best-effort report to the stats hub — never let it break gameplay. */
  private report(fn: (s: DurableObjectStub<StatsHub>) => Promise<unknown>): void {
    try {
      this.ctx.waitUntil(fn(this.stats()).catch(() => {}));
    } catch {
      /* stats are non-critical */
    }
  }

  private reportPresence(): void {
    if (!this.game) return;
    const online = this.game.seats.filter((s) => s.kind === "human" && s.connected).length;
    const code = this.game.roomCode;
    const phase = this.game.phase;
    this.report((s) => s.presenceUpdate(code, online, phase));
  }

  /** Detect lobby→setup (start) and →finished (end) transitions for stats. */
  private async trackTransition(prev: string): Promise<void> {
    if (!this.game) return;
    const next = this.game.phase;
    if (next === prev) return;
    if (prev === "lobby" && next === "setup") {
      this.gameStartMs = Date.now();
      await this.ctx.storage.put("gameStartMs", this.gameStartMs);
      this.report((s) => s.recordGameStart());
    }
    if (next === "finished") {
      const g = this.game;
      const dur = this.gameStartMs ? Date.now() - this.gameStartMs : 0;
      const winner = g.winner != null ? g.seats[g.winner]!.name : "—";
      this.report((s) => s.recordGameFinish(dur, g.seats.length, winner));
      // per-player career stats for humans with a persistent id
      for (const seat of g.seats) {
        if (seat.kind !== "human") continue;
        const pid = this.seatPlayers[seat.id];
        if (!pid) continue;
        const result = {
          won: g.winner === seat.id,
          vp: victoryPoints(g, seat.id),
          longestRoad: g.awards.longestRoad === seat.id,
          largestArmy: g.awards.largestArmy === seat.id,
        };
        this.report((s) => s.recordPlayerResult(pid, seat.name, result));
      }
    }
    this.reportPresence();
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (request.headers.get("Upgrade") !== "websocket")
        return new Response("Expected WebSocket", { status: 426 });

      const url = new URL(request.url);
      const m = url.pathname.match(/\/api\/room\/([A-Za-z0-9]+)\/ws/);
      const code = (m?.[1] ?? url.searchParams.get("code") ?? "ROOM").toUpperCase();
      if (!this.game) {
        this.game = createLobby(code, crypto.randomUUID());
        await this.persist();
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    } catch (e) {
      console.error("GameRoom.fetch failed:", (e as Error).stack ?? e);
      return new Response("Room error", { status: 500 });
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof message === "string" ? message : "") as ClientMessage;
    } catch {
      return this.send(ws, { t: "error", message: "Bad message" });
    }
    if (msg.t === "hello") return this.handleHello(ws, msg);
    if (msg.t === "action") return this.handleAction(ws, msg);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || !this.game || !this.game.seats[att.seatId]) return;
    // Only mark the seat away if no other live socket still holds it (e.g. a
    // second tab, or a fast reload that reconnected before this close fired).
    const stillConnected = this.ctx.getWebSockets().some((other) => {
      if (other === ws) return false;
      const a = other.deserializeAttachment() as Attachment | null;
      return a?.seatId === att.seatId;
    });
    if (!stillConnected) {
      this.game.seats[att.seatId]!.connected = false;
      await this.persist();
      this.broadcastState();
      this.reportPresence();
      await this.scheduleNext(); // arm the idle-takeover timer if it's their turn
    }
  }

  private async handleHello(
    ws: WebSocket,
    msg: Extract<ClientMessage, { t: "hello" }>,
  ): Promise<void> {
    const game = this.game!;
    let seatId: number;

    const known = msg.sessionToken ? this.tokens[msg.sessionToken] : undefined;
    if (known != null && game.seats[known]) {
      seatId = known;
      game.seats[seatId]!.connected = true;
      game.seats[seatId]!.kind = "human"; // reclaim the seat if a bot took over while away
    } else {
      if (game.phase !== "lobby")
        return this.send(ws, { t: "error", message: "Game already in progress" });
      const name = (msg.name || "Settler").trim().slice(0, 20) || "Settler";
      const next = addSeat(game, name, "human");
      if (next === game)
        return this.send(ws, { t: "error", message: "Table is full" });
      this.game = next;
      seatId = next.seats.length - 1;
      this.game.seats[seatId]!.connected = true;
      const pid = msg.playerId;
      this.report((s) => s.recordJoin(pid));
    }

    if (msg.quick) {
      this.game!.seats[seatId]!.ready = true;
      if (!this.quickMatch) {
        this.quickMatch = true;
        this.quickDeadline = Date.now() + MATCH_DEADLINE_MS;
      }
    }

    const token = msg.sessionToken && known != null ? msg.sessionToken : crypto.randomUUID();
    this.tokens[token] = seatId;
    if (msg.playerId) this.seatPlayers[seatId] = msg.playerId;
    ws.serializeAttachment({ seatId, token } satisfies Attachment);
    await this.persist();
    this.send(ws, { t: "welcome", seatId, sessionToken: token });
    this.broadcastState();
    this.reportPresence();
    await this.maybeStartQuick();
    await this.scheduleNext(); // resume bots, arm idle timer, or hold the quick deadline
  }

  private async handleAction(
    ws: WebSocket,
    msg: Extract<ClientMessage, { t: "action" }>,
  ): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att == null) return this.send(ws, { t: "error", message: "Say hello first" });
    if (msg.action.type === "setSettings" && this.quickMatch)
      return this.send(ws, { t: "error", message: "Settings are fixed for matchmaking games" });
    const prevPhase = this.game!.phase;
    const result = apply(this.game!, msg.action, att.seatId);
    if (result.error || !result.state)
      return this.send(ws, { t: "error", message: result.error ?? "Illegal move" });
    this.game = result.state;
    await this.persist();
    this.broadcastState();
    if (result.events && result.events.length) this.broadcastEvents(result.events);
    await this.trackTransition(prevPhase);
    await this.scheduleNext();
  }

  /** Count connected human seats — the players a quick match will start with. */
  private humanCount(): number {
    return this.game!.seats.filter((s) => s.kind === "human" && s.connected).length;
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

  /** Add `bots` bot seats, force every seat ready, then run the engine's start. */
  private async startQuick(bots: number): Promise<void> {
    const prevPhase = this.game!.phase;
    for (let i = 0; i < bots; i++) {
      const res = apply(this.game!, { type: "addBot" }, 0);
      if (res.state) this.game = res.state;
    }
    // A quick match commits everyone at the table — force-ready every seat so a
    // stray unready join can't block the engine's start.
    for (const seat of this.game!.seats) seat.ready = true;
    const res = apply(this.game!, { type: "start" }, 0);
    // Drop the deadline unconditionally: on success the match has begun; on
    // failure we must still clear it so the alarm cannot busy-loop on a past time.
    this.quickMatch = false;
    this.quickDeadline = 0;
    if (res.error || !res.state) {
      await this.persist();
      return;
    }
    this.game = res.state;
    await this.persist();
    this.broadcastState();
    await this.trackTransition(prevPhase);
  }

  /** Arm the next alarm: a bot move if one is pending, else an idle-takeover
   *  timer if the active human has gone and someone is still watching. */
  private async scheduleNext(delay = BOT_DELAY_MS): Promise<void> {
    if (!this.game) return;
    if (this.game.phase === "lobby") {
      if (this.quickMatch && this.quickDeadline)
        await this.ctx.storage.setAlarm(this.quickDeadline);
      else await this.ctx.storage.deleteAlarm();
      return;
    }
    if (hasBotMove(this.game)) {
      await this.ctx.storage.setAlarm(Date.now() + delay);
    } else if (this.botTradeAwaitingHumans()) {
      await this.ctx.storage.setAlarm(Date.now() + TRADE_WAIT_MS);
    } else if (this.awaitingIdleTakeover()) {
      await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  /** A bot's own trade offer is on the table, waiting on a human to respond. */
  private botTradeAwaitingHumans(): boolean {
    const g = this.game;
    if (!g || !g.trade || g.seats[g.trade.from]?.kind !== "bot") return false;
    return Object.entries(g.trade.responses).some(
      ([id, r]) => r === "pending" && g.seats[+id]?.kind === "human",
    );
  }

  /** True when the seat to move is a disconnected human and a human still watches. */
  private awaitingIdleTakeover(): boolean {
    const g = this.game;
    if (!g || (g.phase !== "setup" && g.phase !== "play")) return false;
    const active = g.seats[g.activeSeat];
    if (!active || active.kind !== "human" || active.connected) return false;
    return g.seats.some((s) => s.kind === "human" && s.connected);
  }

  /** Fired by the scheduled alarm: play one bot action, or take over an idle seat. */
  async alarm(): Promise<void> {
    if (!this.game) return;
    if (this.quickMatch && this.game.phase === "lobby") {
      await this.quickDeadlineStart();
      await this.scheduleNext();
      return;
    }
    const prevPhase = this.game.phase;
    if (hasBotMove(this.game)) {
      const outcome = stepBots(this.game);
      if (outcome.acted) {
        this.game = outcome.state;
        await this.persist();
        this.broadcastState();
        if (outcome.events.length) this.broadcastEvents(outcome.events);
        await this.trackTransition(prevPhase);
      }
      await this.scheduleNext(delayAfter(outcome.events));
      return;
    }
    // a bot's trade offer timed out waiting on a human — withdraw it and move on
    if (this.botTradeAwaitingHumans()) {
      const from = this.game.trade!.from;
      const res = apply(this.game, { type: "cancelTrade" }, from);
      if (res.state) {
        this.game = res.state;
        await this.persist();
        this.broadcastState();
      }
      await this.scheduleNext();
      return;
    }
    if (this.awaitingIdleTakeover()) {
      const active = this.game.seats[this.game.activeSeat]!;
      active.kind = "bot";
      active.connected = true;
      this.game.log.push({ t: this.game.version, text: `${active.name} went idle — a bot took over.` });
      if (this.game.log.length > 100) this.game.log.shift();
      await this.persist();
      this.broadcastState();
    }
    await this.scheduleNext();
  }

  private broadcastState(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att == null) continue;
      this.send(ws, { t: "state", view: toView(this.game!, att.seatId) });
    }
  }

  private broadcastEvents(events: GameEvent[]): void {
    for (const ws of this.ctx.getWebSockets()) this.send(ws, { t: "event", events });
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket closing */
    }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("game", this.game);
    await this.ctx.storage.put("tokens", this.tokens);
    await this.ctx.storage.put("seatPlayers", this.seatPlayers);
    await this.ctx.storage.put("quickMatch", this.quickMatch);
    await this.ctx.storage.put("quickDeadline", this.quickDeadline);
  }
}
