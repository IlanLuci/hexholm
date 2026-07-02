import type { GameState, PartialHand, Resource, Seat } from "../shared/types";
import { RESOURCES, COSTS, SUPPLY, handTotal } from "../shared/types";
import type { Action, GameEvent } from "../shared/actions";
import { apply } from "../shared/engine";
import {
  VERTEX_COUNT,
  EDGE_COUNT,
  hexVertices,
  vertexHexes,
  vertexAdjacent,
  edgeVertices,
} from "../shared/board";
import {
  canPlaceSettlement,
  canPlaceRoad,
  buildingOwnerAt,
  legalRobberHexes,
  tradeRatio,
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
    const done = performStep(cur, step);
    if (!done) break;
    cur = done.state;
    events.push(...done.events);
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
  const done = performStep(state, step);
  if (!done) return { state, events: [], acted: false };
  return { state: done.state, events: done.events, acted: true };
}

/** Apply one bot step; if it's somehow rejected on a bot's play turn, fall back
 *  to ending the turn so the game can never stall on a bad heuristic. */
function performStep(state: GameState, step: Step): BotOutcome | null {
  const res = apply(state, step.action, step.seat);
  if (!res.error && res.state) return { state: res.state, events: res.events ?? [] };
  if (
    state.phase === "play" &&
    isBot(state, state.activeSeat) &&
    step.action.type !== "endTurn"
  ) {
    const end = apply(state, { type: "endTurn" }, state.activeSeat);
    if (!end.error && end.state) return { state: end.state, events: end.events ?? [] };
  }
  return null;
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
  // 2. bots responding to an open trade offer — accept only if clearly good
  if (state.trade) {
    for (const [seatStr, resp] of Object.entries(state.trade.responses)) {
      const seat = Number(seatStr);
      if (resp === "pending" && isBot(state, seat))
        return { seat, action: { type: "respondTrade", accept: acceptsTrade(state, seat) } };
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

// ---- shared valuation ----

function pipValue(num: number | null): number {
  return num == null ? 0 : 6 - Math.abs(7 - num);
}

/** Expected value of a settlement spot: pip strength + resource diversity. */
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

function resourcesOwned(state: GameState, seat: number): Set<Resource> {
  const owned = new Set<Resource>();
  const me = state.seats[seat]!;
  for (const v of [...me.buildings.settlements, ...me.buildings.cities])
    for (const h of vertexHexes(v)) {
      const t = state.board.tiles[h]!;
      if (t.terrain !== "desert") owned.add(t.terrain as Resource);
    }
  return owned;
}

function touchesPort(state: GameState, vertex: number): boolean {
  return state.board.ports.some((p) => p.vertices.includes(vertex));
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

// ---- setup ----

function setupMove(state: GameState, seat: number): Action {
  const setup = state.setup!;
  if (setup.step === "settle") {
    const owned = resourcesOwned(state, seat);
    let best = -1;
    let bestScore = -Infinity;
    for (let v = 0; v < VERTEX_COUNT; v++) {
      if (!canPlaceSettlement(state, seat, v, { setup: true })) continue;
      let s = vertexScore(state, v);
      // value covering resources we don't yet produce (round-2 complementarity)
      for (const h of vertexHexes(v)) {
        const t = state.board.tiles[h]!;
        if (t.terrain !== "desert" && !owned.has(t.terrain as Resource)) s += 2;
      }
      if (touchesPort(state, v)) s += 1;
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }
    return { type: "placeSettlement", vertex: best };
  }
  // road: head toward the best nearby empty frontier from the new settlement
  let best = -1;
  let bestScore = -Infinity;
  for (let e = 0; e < EDGE_COUNT; e++) {
    if (!canPlaceRoad(state, seat, e, { mustTouchVertex: setup.lastVertex })) continue;
    const [a, b] = edgeVertices(e);
    const far = a === setup.lastVertex ? b : a;
    let s = 0;
    for (const nv of vertexAdjacent(far))
      if (buildingOwnerAt(state, nv) === null) s = Math.max(s, vertexScore(state, nv));
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return { type: "placeRoad", edge: best >= 0 ? best : 0 };
}

// ---- play ----

function canAfford(seat: Seat, cost: PartialHand): boolean {
  return RESOURCES.every((r) => seat.resources[r] >= (cost[r] ?? 0));
}

function turnPlayedDev(state: GameState): boolean {
  return state.turn?.devPlayedThisTurn ?? false;
}

function playMove(state: GameState, seat: number): Action {
  const turn = state.turn!;
  if (turn.mustMoveRobber) return robberMove(state, seat);
  if (!turn.hasRolled) return { type: "rollDice" };
  return turnAction(state, seat) ?? { type: "endTurn" };
}

function bestSettlementSpot(state: GameState, seat: number): number | null {
  if (state.seats[seat]!.buildings.settlements.length >= SUPPLY.settlements) return null;
  const spots: number[] = [];
  for (let v = 0; v < VERTEX_COUNT; v++)
    if (canPlaceSettlement(state, seat, v, { setup: false })) spots.push(v);
  return bestBy(spots, (v) => vertexScore(state, v));
}

function bestCitySpot(state: GameState, seat: number): number | null {
  if (state.seats[seat]!.buildings.cities.length >= SUPPLY.cities) return null;
  return bestBy(state.seats[seat]!.buildings.settlements, (v) => vertexScore(state, v));
}

/** One bot action for the current (post-roll) turn, or null to end the turn. */
function turnAction(state: GameState, seat: number): Action | null {
  const me = state.seats[seat]!;
  const settleSpot = bestSettlementSpot(state, seat);
  const citySpot = bestCitySpot(state, seat);

  // 1. build now if we can afford it — expansion first, then cities
  if (settleSpot != null && canAfford(me, COSTS.settle))
    return { type: "buildSettlement", vertex: settleSpot };
  if (citySpot != null && canAfford(me, COSTS.city))
    return { type: "buildCity", vertex: citySpot };

  // 2. bank/harbor-trade our surplus toward the best reachable build
  if (settleSpot != null) {
    const t = planTradeToward(state, seat, COSTS.settle);
    if (t) return t;
  }
  if (citySpot != null) {
    const t = planTradeToward(state, seat, COSTS.city);
    if (t) return t;
  }

  // 3. buy a development card when hoarding or with nothing better to build
  const flush = handTotal(me.resources) >= 7;
  if (state.devDeck.length > 0 && canAfford(me, COSTS.dev) && (flush || (settleSpot == null && citySpot == null)))
    return { type: "buyDev" };

  // 4. build a road toward new land when we can expand but have no open spot yet
  if (
    settleSpot == null &&
    me.buildings.settlements.length < SUPPLY.settlements &&
    me.buildings.roads.length < SUPPLY.roads &&
    canAfford(me, COSTS.road)
  ) {
    const road = roadTowardFrontier(state, seat);
    if (road != null) return { type: "buildRoad", edge: road };
  }

  // 5. play a knight when it's genuinely worthwhile
  if (!turnPlayedDev(state) && me.devCards.includes("knight") && knightWorthwhile(state, seat))
    return robberMoveAsKnight(state, seat);

  return null;
}

/** Resources still needed to afford `cost`. */
function deficitFor(seat: Seat, cost: PartialHand): PartialHand {
  const d: PartialHand = {};
  for (const r of RESOURCES) {
    const n = (cost[r] ?? 0) - seat.resources[r];
    if (n > 0) d[r] = n;
  }
  return d;
}

/** If bank/harbor-trading surplus can reach `cost`, return the next such trade. */
function planTradeToward(state: GameState, seat: number, cost: PartialHand): Action | null {
  const me = state.seats[seat]!;
  if (canAfford(me, cost)) return null;
  const need = deficitFor(me, cost);
  const totalNeed = RESOURCES.reduce((s, r) => s + (need[r] ?? 0), 0);

  let potential = 0;
  const givers: { r: Resource; ratio: number; capacity: number }[] = [];
  for (const r of RESOURCES) {
    const spare = me.resources[r] - (cost[r] ?? 0);
    if (spare <= 0) continue;
    const ratio = tradeRatio(state, seat, r);
    const capacity = Math.floor(spare / ratio);
    if (capacity > 0) {
      potential += capacity;
      givers.push({ r, ratio, capacity });
    }
  }
  if (potential < totalNeed) return null; // can't complete the build — don't waste a trade

  const give = bestBy(givers, (g) => g.capacity);
  // only ask for a needed resource the bank can actually supply
  const get = RESOURCES.filter((r) => need[r] && state.bank[r] > 0).sort(
    (a, b) => (need[b] ?? 0) - (need[a] ?? 0),
  )[0];
  if (!give || !get || give.r === get) return null;
  return { type: "bankTrade", give: give.r, get };
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

function knightWorthwhile(state: GameState, seat: number): boolean {
  const me = state.seats[seat]!;
  // chasing / holding largest army
  const knights = me.playedKnights + 1;
  const holder = state.awards.largestArmy;
  const holderKnights = holder == null ? 0 : state.seats[holder]!.playedKnights;
  if (knights >= 3 && (holder === seat || knights > holderKnights)) return true;
  // robber squatting on our own hex — dislodge it
  const myVerts = new Set<number>([...me.buildings.settlements, ...me.buildings.cities]);
  if (hexVertices(state.robberHex).some((v) => myVerts.has(v))) return true;
  return false;
}

// ---- responding to player trade offers ----

/** Accept only fair offers that fill a real need with genuine surplus, and never
 *  hand resources to a player who is about to win. */
function acceptsTrade(state: GameState, seat: number): boolean {
  const trade = state.trade!;
  const me = state.seats[seat]!;
  const giveOut = trade.get; // what the responder gives up
  const getIn = trade.give; // what the responder receives

  if (!RESOURCES.every((r) => me.resources[r] >= (giveOut[r] ?? 0))) return false; // can't fulfil
  if (victoryPoints(state, trade.from) >= 8) return false; // don't fuel a near-winner

  const outTotal = RESOURCES.reduce((s, r) => s + (giveOut[r] ?? 0), 0);
  const inTotal = RESOURCES.reduce((s, r) => s + (getIn[r] ?? 0), 0);
  if (outTotal > inTotal) return false; // never come out behind on card count

  // pick the build we're pursuing and judge usefulness against it
  const target =
    bestSettlementSpot(state, seat) != null
      ? COSTS.settle
      : bestCitySpot(state, seat) != null
        ? COSTS.city
        : COSTS.city;
  const need = deficitFor(me, target);
  const usefulIn = RESOURCES.some((r) => (getIn[r] ?? 0) > 0 && (need[r] ?? 0) > 0);
  const safeOut = RESOURCES.every(
    (r) => (giveOut[r] ?? 0) <= Math.max(0, me.resources[r] - (target[r] ?? 0)),
  );
  return usefulIn && safeOut;
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
