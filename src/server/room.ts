import { DurableObject } from "cloudflare:workers";
import type { GameState } from "../shared/types";
import type { GameEvent } from "../shared/actions";
import { apply, addSeat, createLobby } from "../shared/engine";
import { victoryPoints } from "../shared/scoring";
import { toView } from "./views";
import { hasBotMove, stepBots } from "./bots";
import type { StatsHub } from "./stats";
import type { ClientMessage, ServerMessage } from "./protocol";

/** Pacing between bot actions so players can follow the game in real time.
 *  A bigger beat follows the moments that matter most (rolls, builds, steals). */
const BOT_DELAY_MS = 1300;
function delayAfter(events: GameEvent[]): number {
  if (events.some((e) => e.type === "rolled")) return 2100; // let production register
  if (events.some((e) => ["built", "stole", "played", "boughtDev", "trade"].includes(e.type)))
    return 1700;
  return BOT_DELAY_MS;
}

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  STATS: DurableObjectNamespace<StatsHub>;
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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.game = (await ctx.storage.get<GameState>("game")) ?? null;
      this.tokens = (await ctx.storage.get<Record<string, number>>("tokens")) ?? {};
      this.seatPlayers = (await ctx.storage.get<Record<number, string>>("seatPlayers")) ?? {};
      this.gameStartMs = (await ctx.storage.get<number>("gameStartMs")) ?? 0;
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
      this.report((s) => s.recordJoin());
    }

    const token = msg.sessionToken && known != null ? msg.sessionToken : crypto.randomUUID();
    this.tokens[token] = seatId;
    if (msg.playerId) this.seatPlayers[seatId] = msg.playerId;
    ws.serializeAttachment({ seatId, token } satisfies Attachment);
    await this.persist();
    this.send(ws, { t: "welcome", seatId, sessionToken: token });
    this.broadcastState();
    this.reportPresence();
    await this.scheduleBots(); // in case we reconnected on a bot's turn
  }

  private async handleAction(
    ws: WebSocket,
    msg: Extract<ClientMessage, { t: "action" }>,
  ): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att == null) return this.send(ws, { t: "error", message: "Say hello first" });
    const prevPhase = this.game!.phase;
    const result = apply(this.game!, msg.action, att.seatId);
    if (result.error || !result.state)
      return this.send(ws, { t: "error", message: result.error ?? "Illegal move" });
    this.game = result.state;
    await this.persist();
    this.broadcastState();
    if (result.events && result.events.length) this.broadcastEvents(result.events);
    await this.trackTransition(prevPhase);
    await this.scheduleBots();
  }

  /** Schedule the next bot move after `delay` ms if one is pending. */
  private async scheduleBots(delay = BOT_DELAY_MS): Promise<void> {
    if (this.game && hasBotMove(this.game))
      await this.ctx.storage.setAlarm(Date.now() + delay);
  }

  /** Fired by the scheduled alarm: play one bot action, broadcast, reschedule. */
  async alarm(): Promise<void> {
    if (!this.game) return;
    const prevPhase = this.game.phase;
    const outcome = stepBots(this.game);
    if (!outcome.acted) return;
    this.game = outcome.state;
    await this.persist();
    this.broadcastState();
    if (outcome.events.length) this.broadcastEvents(outcome.events);
    await this.trackTransition(prevPhase);
    await this.scheduleBots(delayAfter(outcome.events));
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
  }
}
