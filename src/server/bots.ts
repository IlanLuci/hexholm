import type { GameState, PartialHand, Resource, Seat } from "../shared/types";
import { RESOURCES, COSTS, SUPPLY, handTotal } from "../shared/types";
import type { Action, GameEvent } from "../shared/actions";
import { apply } from "../shared/engine";
import {
  VERTEX_COUNT,
  EDGE_COUNT,
  hexVertices,
  vertexHexes,
  edgeVertices,
} from "../shared/board";
import {
  canPlaceSettlement,
  canPlaceRoad,
  buildingOwnerAt,
  legalRobberHexes,
} from "../shared/legal";
import { victoryPoints } from "../shared/scoring";

export interface BotOutcome {
  state: GameState;
  events: GameEvent[];
}

const STEP_CAP = 20000;

/** Advance the game by playing out bot seats until a human must act (or nothing
 *  remains to do). Deterministic given the state; safe to call after any action. */
export function driveBots(state: GameState): BotOutcome {
  let cur = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < STEP_CAP; i++) {
    const step = botStep(cur);
    if (!step) break;
    const res = apply(cur, step.action, step.seat);
    if (res.error || !res.state) break; // defensive: never loop on a rejected move
    cur = res.state;
    if (res.events) events.push(...res.events);
    if (cur.phase === "finished") break;
  }
  return { state: cur, events };
}

/** Is there a bot move to make right now? Used to pace turns with a delay. */
export function hasBotMove(state: GameState): boolean {
  return botStep(state) !== null;
}

/** Perform exactly one bot action (or none). Lets the server broadcast each bot
 *  move separately so players can follow the game unfolding. */
export function stepBots(state: GameState): BotOutcome & { acted: boolean } {
  const step = botStep(state);
  if (!step) return { state, events: [], acted: false };
  const res = apply(state, step.action, step.seat);
  if (res.error || !res.state) return { state, events: [], acted: false };
  return { state: res.state, events: res.events ?? [], acted: true };
}

interface Step {
  seat: number;
  action: Action;
}

function isBot(state: GameState, seat: number): boolean {
  return state.seats[seat]?.kind === "bot";
}

function botStep(state: GameState): Step | null {
  // 1. bots that owe a discard
  for (const [seatStr, need] of Object.entries(state.pendingDiscards)) {
    const seat = Number(seatStr);
    if (isBot(state, seat)) return { seat, action: botDiscard(state.seats[seat]!, need) };
  }
  // 2. bots responding to an open (human) trade offer — decline in v1
  if (state.trade) {
    for (const [seatStr, resp] of Object.entries(state.trade.responses)) {
      const seat = Number(seatStr);
      if (resp === "pending" && isBot(state, seat))
        return { seat, action: { type: "respondTrade", accept: false } };
    }
  }
  // 3. active bot must choose a steal target
  const active = state.activeSeat;
  if (state.steal && isBot(state, active)) {
    const target = bestSteal(state, active, state.steal.candidates);
    return { seat: active, action: { type: "moveRobber", hex: state.robberHex, steal: target } };
  }
  // 4. active bot's turn — but wait if humans still owe discards
  if (!isBot(state, active)) return null;
  if (Object.keys(state.pendingDiscards).length > 0) return null;

  if (state.phase === "setup") return { seat: active, action: setupMove(state, active) };
  if (state.phase === "play") return { seat: active, action: playMove(state, active) };
  return null;
}

// ---- discards ----

function botDiscard(seat: Seat, need: number): Action {
  const hand: PartialHand = {};
  let left = need;
  // shed from the largest stacks first
  const order = [...RESOURCES].sort((a, b) => seat.resources[b] - seat.resources[a]);
  while (left > 0) {
    for (const r of order) {
      if (left === 0) break;
      if ((hand[r] ?? 0) < seat.resources[r]) {
        hand[r] = (hand[r] ?? 0) + 1;
        left--;
      }
    }
  }
  return { type: "discard", hand };
}

// ---- setup ----

function pipValue(num: number | null): number {
  return num == null ? 0 : 6 - Math.abs(7 - num);
}

function vertexScore(state: GameState, v: number): number {
  let score = 0;
  const seen = new Set<Resource>();
  for (const h of vertexHexes(v)) {
    const tile = state.board.tiles[h]!;
    if (tile.terrain === "desert") continue;
    score += pipValue(tile.num);
    if (!seen.has(tile.terrain as Resource)) {
      seen.add(tile.terrain as Resource);
      score += 1.5; // reward resource diversity
    }
  }
  return score;
}

function setupMove(state: GameState, seat: number): Action {
  const setup = state.setup!;
  if (setup.step === "settle") {
    let best = -1;
    let bestScore = -1;
    for (let v = 0; v < VERTEX_COUNT; v++) {
      if (!canPlaceSettlement(state, seat, v, { setup: true })) continue;
      const s = vertexScore(state, v);
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }
    return { type: "placeSettlement", vertex: best };
  }
  // road: pick a legal edge touching the just-placed settlement
  for (let e = 0; e < EDGE_COUNT; e++)
    if (canPlaceRoad(state, seat, e, { mustTouchVertex: setup.lastVertex }))
      return { type: "placeRoad", edge: e };
  return { type: "placeRoad", edge: 0 }; // unreachable in a valid setup
}

// ---- play ----

function canAfford(seat: Seat, cost: PartialHand): boolean {
  return RESOURCES.every((r) => seat.resources[r] >= (cost[r] ?? 0));
}

function playMove(state: GameState, seat: number): Action {
  const turn = state.turn!;
  if (turn.mustMoveRobber) return robberMove(state, seat);
  if (!turn.hasRolled) return { type: "rollDice" };
  const build = chooseBuild(state, seat);
  return build ?? { type: "endTurn" };
}

function chooseBuild(state: GameState, seat: number): Action | null {
  const me = state.seats[seat]!;

  // 1. upgrade the best settlement to a city
  if (me.buildings.cities.length < SUPPLY.cities && canAfford(me, COSTS.city)) {
    const target = bestBy(me.buildings.settlements, (v) => vertexScore(state, v));
    if (target != null) return { type: "buildCity", vertex: target };
  }

  // 2. build a settlement on the best legal spot
  if (me.buildings.settlements.length < SUPPLY.settlements && canAfford(me, COSTS.settle)) {
    const spots: number[] = [];
    for (let v = 0; v < VERTEX_COUNT; v++)
      if (canPlaceSettlement(state, seat, v, { setup: false })) spots.push(v);
    const target = bestBy(spots, (v) => vertexScore(state, v));
    if (target != null) return { type: "buildSettlement", vertex: target };
  }

  // 3. build a road that opens a promising new settlement frontier
  if (me.buildings.roads.length < SUPPLY.roads && canAfford(me, COSTS.road)) {
    const road = roadTowardFrontier(state, seat);
    if (road != null) return { type: "buildRoad", edge: road };
  }

  // 4. buy a development card when flush (fuels knights / VP cards)
  if (state.devDeck.length > 0 && canAfford(me, COSTS.dev) && handTotal(me.resources) >= 3)
    return { type: "buyDev" };

  // 5. play a knight if it helps (own an unplayed knight and it's worthwhile)
  if (!turnPlayedDev(state) && me.devCards.includes("knight"))
    return robberMoveAsKnight(state, seat);

  return null;
}

function turnPlayedDev(state: GameState): boolean {
  return state.turn?.devPlayedThisTurn ?? false;
}

function bestBy<T>(items: T[], score: (t: T) => number): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const it of items) {
    const s = score(it);
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }
  return best;
}

/** A legal road whose endpoints reach an unclaimed, high-value frontier vertex. */
function roadTowardFrontier(state: GameState, seat: number): number | null {
  let best: number | null = null;
  let bestScore = 0;
  for (let e = 0; e < EDGE_COUNT; e++) {
    if (!canPlaceRoad(state, seat, e, {})) continue;
    const [a, b] = edgeVertices(e);
    let score = 0;
    for (const v of [a, b]) {
      if (buildingOwnerAt(state, v) !== null) continue;
      score = Math.max(score, vertexScore(state, v));
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

// ---- robber ----

function robberMove(state: GameState, seat: number): Action {
  const hex = chooseRobberHex(state, seat);
  const candidates = robberTargetsAt(state, seat, hex);
  const steal = bestSteal(state, seat, candidates);
  return { type: "moveRobber", hex, steal };
}

function robberMoveAsKnight(state: GameState, seat: number): Action {
  const hex = chooseRobberHex(state, seat);
  const candidates = robberTargetsAt(state, seat, hex);
  const steal = bestSteal(state, seat, candidates);
  return { type: "playKnight", hex, steal };
}

function robberTargetsAt(state: GameState, seat: number, hex: number): number[] {
  const verts = new Set(hexVertices(hex));
  const out: number[] = [];
  for (const st of state.seats) {
    if (st.id === seat) continue;
    if (handTotal(st.resources) === 0) continue;
    const on =
      st.buildings.settlements.some((v) => verts.has(v)) ||
      st.buildings.cities.some((v) => verts.has(v));
    if (on) out.push(st.id);
  }
  return out;
}

/** Prefer a hex that hurts a leading opponent and doesn't block ourselves. */
function chooseRobberHex(state: GameState, seat: number): number {
  const myVerts = new Set<number>([
    ...state.seats[seat]!.buildings.settlements,
    ...state.seats[seat]!.buildings.cities,
  ]);
  let best = -1;
  let bestScore = -Infinity;
  for (const h of legalRobberHexes(state)) {
    const verts = hexVertices(h);
    if (verts.some((v) => myVerts.has(v))) continue; // never rob ourselves
    let score = 0;
    for (const st of state.seats) {
      if (st.id === seat) continue;
      const on =
        st.buildings.settlements.filter((v) => verts.includes(v)).length +
        st.buildings.cities.filter((v) => verts.includes(v)).length * 2;
      if (on > 0) score += on * (1 + victoryPoints(state, st.id));
    }
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  if (best === -1) best = legalRobberHexes(state)[0] ?? 0;
  return best;
}

function bestSteal(state: GameState, seat: number, candidates: number[]): number | null {
  void seat;
  let best: number | null = null;
  let most = -1;
  for (const c of candidates) {
    const n = handTotal(state.seats[c]!.resources);
    if (n > most) {
      most = n;
      best = c;
    }
  }
  return best;
}
