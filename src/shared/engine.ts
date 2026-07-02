import type { Action, ApplyResult, GameEvent } from "./actions";
import type { GameState, Seat } from "./types";
import { botName, createLobby, makeSeat } from "./setup";

const MAX_SEATS = 4;

export { createLobby };

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function log(state: GameState, text: string): void {
  state.log.push({ t: state.version, text });
  if (state.log.length > 100) state.log.shift();
}

function ok(state: GameState, events: GameEvent[] = []): ApplyResult {
  state.version++;
  return { state, events };
}

function err(message: string): ApplyResult {
  return { error: message };
}

/** Add a human seat (used on join). Returns a new state; lobby phase only. */
export function addSeat(state: GameState, name: string, kind: Seat["kind"]): GameState {
  if (state.phase !== "lobby" || state.seats.length >= MAX_SEATS) return state;
  const next = clone(state);
  next.seats.push(makeSeat(next.seats.length, name, kind));
  return next;
}

export function apply(state: GameState, action: Action, seat: number): ApplyResult {
  if (seat < 0 || seat >= state.seats.length) return err("Unknown seat");
  const s = clone(state);
  switch (state.phase) {
    case "lobby":
      return applyLobby(s, action, seat);
    case "setup":
    case "play":
      return err(`Action not available in ${state.phase} phase yet`);
    case "finished":
      return err("Game is over");
  }
}

function applyLobby(s: GameState, action: Action, seat: number): ApplyResult {
  switch (action.type) {
    case "setName": {
      const name = action.name.trim().slice(0, 20);
      if (!name) return err("Name required");
      s.seats[seat]!.name = name;
      return ok(s);
    }
    case "setColor":
      s.seats[seat]!.color = action.color;
      return ok(s);
    case "ready":
      s.seats[seat]!.ready = action.ready;
      return ok(s);
    case "addBot": {
      if (s.seats.length >= MAX_SEATS) return err("Table is full");
      s.seats.push(makeSeat(s.seats.length, botName(s.seats), "bot"));
      return ok(s);
    }
    case "removeBot": {
      const target = s.seats[action.seat];
      if (!target || target.kind !== "bot") return err("Not a bot seat");
      s.seats.splice(action.seat, 1);
      s.seats.forEach((st, i) => (st.id = i));
      return ok(s);
    }
    case "start": {
      if (s.seats.length < 2) return err("Need at least 2 players");
      if (!s.seats.every((st) => st.ready)) return err("All players must be ready");
      startSetup(s);
      log(s, "The game begins — place your first settlement.");
      return ok(s);
    }
    default:
      return err("Not a lobby action");
  }
}

function startSetup(s: GameState): void {
  s.phase = "setup";
  s.turnOrder = s.seats.map((st) => st.id);
  s.activeSeat = s.turnOrder[0]!;
  s.setup = { round: 1, step: "settle", lastVertex: null };
}
