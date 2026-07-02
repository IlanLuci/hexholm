import type { Action, ApplyResult, GameEvent } from "./actions";
import type { GameState, PartialHand, Resource, Seat } from "./types";
import { RESOURCES } from "./types";
import { botName, createLobby, makeSeat } from "./setup";
import { vertexHexes } from "./board";
import { canPlaceRoad, canPlaceSettlement } from "./legal";

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

// ---- resource helpers ----

/** Give resources to a seat from the bank, capped by bank stock. Returns actual gains. */
function bankGive(state: GameState, seat: number, gains: PartialHand): PartialHand {
  const actual: PartialHand = {};
  for (const r of RESOURCES) {
    const want = gains[r] ?? 0;
    if (want <= 0) continue;
    const take = Math.min(want, state.bank[r]);
    if (take <= 0) continue;
    state.bank[r] -= take;
    state.seats[seat]!.resources[r] += take;
    actual[r] = take;
  }
  return actual;
}

/** Pay resources from a seat to the bank. Assumes affordability already checked. */
function payToBank(state: GameState, seat: number, cost: PartialHand): void {
  for (const r of RESOURCES) {
    const amt = cost[r] ?? 0;
    if (amt <= 0) continue;
    state.seats[seat]!.resources[r] -= amt;
    state.bank[r] += amt;
  }
}

function canAfford(seat: Seat, cost: PartialHand): boolean {
  return RESOURCES.every((r) => seat.resources[r] >= (cost[r] ?? 0));
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
      return applySetup(s, action, seat);
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

// ---- setup phase ----

/** Active seat for the k-th placement in the snake order [0, 2N). */
function setupSeatAt(s: GameState, k: number): number {
  const n = s.turnOrder.length;
  return k < n ? s.turnOrder[k]! : s.turnOrder[2 * n - 1 - k]!;
}

function totalSettlements(s: GameState): number {
  return s.seats.reduce((sum, st) => sum + st.buildings.settlements.length, 0);
}

function applySetup(s: GameState, action: Action, seat: number): ApplyResult {
  if (seat !== s.activeSeat) return err("Not your turn");
  const setup = s.setup!;
  if (action.type === "placeSettlement") {
    if (setup.step !== "settle") return err("Place a road, not a settlement");
    if (!canPlaceSettlement(s, seat, action.vertex, { setup: true }))
      return err("Cannot place a settlement there");
    s.seats[seat]!.buildings.settlements.push(action.vertex);
    setup.lastVertex = action.vertex;
    setup.step = "road";
    if (setup.round === 2) {
      // second settlement grants one of each adjacent hex's resource
      const gains: PartialHand = {};
      for (const h of vertexHexes(action.vertex)) {
        const t = s.board.tiles[h]!;
        if (t.terrain !== "desert")
          gains[t.terrain as Resource] = (gains[t.terrain as Resource] ?? 0) + 1;
      }
      bankGive(s, seat, gains);
    }
    log(s, `${s.seats[seat]!.name} settled the land.`);
    return ok(s);
  }
  if (action.type === "placeRoad") {
    if (setup.step !== "road") return err("Place a settlement first");
    if (!canPlaceRoad(s, seat, action.edge, { mustTouchVertex: setup.lastVertex }))
      return err("Road must connect to your new settlement");
    s.seats[seat]!.buildings.roads.push(action.edge);
    advanceSetup(s);
    return ok(s);
  }
  return err("Only placement actions are allowed during setup");
}

function advanceSetup(s: GameState): void {
  const n = s.turnOrder.length;
  const placed = totalSettlements(s); // completed placements so far
  if (placed >= 2 * n) {
    startPlay(s, s.turnOrder[0]!);
    return;
  }
  s.activeSeat = setupSeatAt(s, placed);
  s.setup = {
    round: placed < n ? 1 : 2,
    step: "settle",
    lastVertex: null,
  };
}

function startPlay(s: GameState, firstSeat: number): void {
  s.phase = "play";
  s.setup = null;
  s.activeSeat = firstSeat;
  s.turn = {
    hasRolled: false,
    dice: null,
    mustMoveRobber: false,
    freeRoads: 0,
    devPlayedThisTurn: false,
  };
  log(s, `${s.seats[firstSeat]!.name} to roll.`);
}
