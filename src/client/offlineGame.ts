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
