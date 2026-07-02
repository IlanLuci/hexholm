import { DurableObject } from "cloudflare:workers";
import type { GameState } from "../shared/types";
import type { GameEvent } from "../shared/actions";
import { apply, addSeat, createLobby } from "../shared/engine";
import { toView } from "./views";
import { driveBots } from "./bots";
import type { ClientMessage, ServerMessage } from "./protocol";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
}

interface Attachment {
  seatId: number;
  token: string;
}

/** One live game room: authoritative state + connected players over WebSockets. */
export class GameRoom extends DurableObject<Env> {
  private game: GameState | null = null;
  private tokens: Record<string, number> = {};

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.game = (await ctx.storage.get<GameState>("game")) ?? null;
      this.tokens = (await ctx.storage.get<Record<string, number>>("tokens")) ?? {};
    });
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
    if (att && this.game && this.game.seats[att.seatId]) {
      this.game.seats[att.seatId]!.connected = false;
      await this.persist();
      this.broadcastState();
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
    }

    const token = msg.sessionToken && known != null ? msg.sessionToken : crypto.randomUUID();
    this.tokens[token] = seatId;
    ws.serializeAttachment({ seatId, token } satisfies Attachment);
    await this.persist();
    this.send(ws, { t: "welcome", seatId, sessionToken: token });
    this.broadcastState();
  }

  private async handleAction(
    ws: WebSocket,
    msg: Extract<ClientMessage, { t: "action" }>,
  ): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att == null) return this.send(ws, { t: "error", message: "Say hello first" });
    const result = apply(this.game!, msg.action, att.seatId);
    if (result.error || !result.state)
      return this.send(ws, { t: "error", message: result.error ?? "Illegal move" });
    this.game = result.state;
    await this.persist();
    this.broadcastState();
    if (result.events && result.events.length) this.broadcastEvents(result.events);
    await this.runBots();
  }

  /** Let bots take their turns/obligations until it's a human's move again. */
  private async runBots(): Promise<void> {
    const outcome = driveBots(this.game!);
    if (outcome.state === this.game && outcome.events.length === 0) return;
    this.game = outcome.state;
    await this.persist();
    this.broadcastState();
    if (outcome.events.length) this.broadcastEvents(outcome.events);
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
  }
}
