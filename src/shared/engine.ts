import type { Action, ApplyResult, GameEvent } from "./actions";
import type { GameState, PartialHand, Resource, Seat } from "./types";
import { RESOURCES, COSTS, SUPPLY, handTotal } from "./types";
import { botName, createLobby, makeSeat } from "./setup";
import { hexVertices, vertexHexes } from "./board";
import {
  buildingOwnerAt,
  canPlaceCity,
  canPlaceRoad,
  canPlaceSettlement,
  tradeRatio,
} from "./legal";
import { makeRng, rollDie } from "./rng";
import type { DevKind } from "./types";
import { hasWon, recomputeAwards } from "./scoring";

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

function hasHand(seat: Seat, hand: PartialHand): boolean {
  return RESOURCES.every((r) => seat.resources[r] >= (hand[r] ?? 0));
}

function moveHand(from: Seat, to: Seat, hand: PartialHand): void {
  for (const r of RESOURCES) {
    const amt = hand[r] ?? 0;
    if (amt <= 0) continue;
    from.resources[r] -= amt;
    to.resources[r] += amt;
  }
}

function partialTotal(hand: PartialHand): number {
  return RESOURCES.reduce((sum, r) => sum + (hand[r] ?? 0), 0);
}

function removeDev(seat: Seat, kind: DevKind): void {
  const i = seat.devCards.indexOf(kind);
  if (i >= 0) seat.devCards.splice(i, 1);
}

/** Guard for playing a development card. */
function requireDev(s: GameState, seat: number, kind: DevKind): ApplyResult | null {
  if (seat !== s.activeSeat) return err("Not your turn");
  if (s.turn!.devPlayedThisTurn) return err("Only one card per turn");
  if (s.steal) return err("Resolve the robber steal first");
  if (Object.keys(s.pendingDiscards).length > 0) return err("Resolve discards first");
  if (!s.seats[seat]!.devCards.includes(kind)) return err("You cannot play that card");
  return null;
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
      return applyPlay(s, action, seat);
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

// ---- play phase ----

function applyPlay(s: GameState, action: Action, seat: number): ApplyResult {
  const turn = s.turn!;
  switch (action.type) {
    case "rollDice": {
      if (seat !== s.activeSeat) return err("Not your turn");
      if (turn.hasRolled) return err("Already rolled this turn");
      const rng = makeRng(`${s.seed}:roll:${s.version}`);
      const dice: [number, number] = [rollDie(rng), rollDie(rng)];
      turn.dice = dice;
      turn.hasRolled = true;
      const sum = dice[0] + dice[1];
      const events: GameEvent[] = [{ type: "rolled", dice, by: seat }];
      log(s, `${s.seats[seat]!.name} rolled ${sum}.`);
      if (sum === 7) {
        turn.mustMoveRobber = true;
        s.pendingDiscards = {};
        for (const st of s.seats) {
          const total = handTotal(st.resources);
          if (total > 7) s.pendingDiscards[st.id] = Math.floor(total / 2);
        }
        if (Object.keys(s.pendingDiscards).length > 0)
          log(s, "The robber stirs — overstocked players must discard.");
      } else {
        const gains = produce(s, sum);
        events.push({ type: "produced", gains });
      }
      return ok(s, events);
    }
    case "buildRoad": {
      const guard = requireActive(s, seat);
      if (guard) return guard;
      if (s.seats[seat]!.buildings.roads.length >= SUPPLY.roads)
        return err("No roads left");
      if (!canPlaceRoad(s, seat, action.edge)) return err("Cannot place a road there");
      if (turn.freeRoads > 0) {
        turn.freeRoads--;
      } else {
        if (!canAfford(s.seats[seat]!, COSTS.road)) return err("Cannot afford a road");
        payToBank(s, seat, COSTS.road);
      }
      s.seats[seat]!.buildings.roads.push(action.edge);
      log(s, `${s.seats[seat]!.name} built a road.`);
      return finishBuild(s, seat, { type: "built", kind: "road", by: seat });
    }
    case "buildSettlement": {
      const guard = requireActive(s, seat);
      if (guard) return guard;
      if (s.seats[seat]!.buildings.settlements.length >= SUPPLY.settlements)
        return err("No settlements left");
      if (!canPlaceSettlement(s, seat, action.vertex, { setup: false }))
        return err("Cannot place a settlement there");
      if (!canAfford(s.seats[seat]!, COSTS.settle))
        return err("Cannot afford a settlement");
      payToBank(s, seat, COSTS.settle);
      s.seats[seat]!.buildings.settlements.push(action.vertex);
      log(s, `${s.seats[seat]!.name} built a settlement.`);
      return finishBuild(s, seat, { type: "built", kind: "settlement", by: seat });
    }
    case "buildCity": {
      const guard = requireActive(s, seat);
      if (guard) return guard;
      if (s.seats[seat]!.buildings.cities.length >= SUPPLY.cities)
        return err("No cities left");
      if (!canPlaceCity(s, seat, action.vertex))
        return err("You need a settlement there first");
      if (!canAfford(s.seats[seat]!, COSTS.city)) return err("Cannot afford a city");
      payToBank(s, seat, COSTS.city);
      const st = s.seats[seat]!;
      st.buildings.settlements = st.buildings.settlements.filter(
        (v) => v !== action.vertex,
      );
      st.buildings.cities.push(action.vertex);
      log(s, `${s.seats[seat]!.name} upgraded to a city.`);
      return finishBuild(s, seat, { type: "built", kind: "city", by: seat });
    }
    case "buyDev": {
      const guard = requireActive(s, seat);
      if (guard) return guard;
      if (s.devDeck.length === 0) return err("No development cards left");
      if (!canAfford(s.seats[seat]!, COSTS.dev)) return err("Cannot afford a card");
      payToBank(s, seat, COSTS.dev);
      const card = s.devDeck.shift()!;
      s.seats[seat]!.newDevCards.push(card);
      log(s, `${s.seats[seat]!.name} bought a development card.`);
      return ok(s, [{ type: "boughtDev", by: seat }]);
    }
    case "playKnight": {
      const guard = requireDev(s, seat, "knight");
      if (guard) return guard;
      if (action.hex === s.robberHex) return err("Move the robber somewhere new");
      if (action.hex < 0 || action.hex >= s.board.tiles.length)
        return err("No such hex");
      removeDev(s.seats[seat]!, "knight");
      s.seats[seat]!.playedKnights++;
      turn.devPlayedThisTurn = true;
      const events: GameEvent[] = [{ type: "played", kind: "knight", by: seat }];
      s.robberHex = action.hex;
      events.push({ type: "robber", hex: action.hex });
      turn.mustMoveRobber = true; // so resolveRobberSteal clears it uniformly
      resolveRobberSteal(s, seat, action.steal, events);
      log(s, `${s.seats[seat]!.name} played a Knight.`);
      refreshAwards(s, events);
      const win = checkVictory(s, seat);
      if (win) events.push(win);
      return ok(s, events);
    }
    case "playRoadBuilding": {
      const guard = requireDev(s, seat, "road");
      if (guard) return guard;
      removeDev(s.seats[seat]!, "road");
      turn.devPlayedThisTurn = true;
      const left = SUPPLY.roads - s.seats[seat]!.buildings.roads.length;
      turn.freeRoads += Math.min(2, Math.max(0, left));
      log(s, `${s.seats[seat]!.name} played Road Building.`);
      return ok(s, [{ type: "played", kind: "road", by: seat }]);
    }
    case "playYearOfPlenty": {
      const guard = requireDev(s, seat, "plenty");
      if (guard) return guard;
      removeDev(s.seats[seat]!, "plenty");
      turn.devPlayedThisTurn = true;
      const want: PartialHand = {};
      for (const r of action.picks) want[r] = (want[r] ?? 0) + 1;
      bankGive(s, seat, want);
      log(s, `${s.seats[seat]!.name} played Year of Plenty.`);
      return ok(s, [{ type: "played", kind: "plenty", by: seat }]);
    }
    case "playMonopoly": {
      const guard = requireDev(s, seat, "mono");
      if (guard) return guard;
      removeDev(s.seats[seat]!, "mono");
      turn.devPlayedThisTurn = true;
      let taken = 0;
      for (const st of s.seats) {
        if (st.id === seat) continue;
        taken += st.resources[action.resource];
        st.resources[action.resource] = 0;
      }
      s.seats[seat]!.resources[action.resource] += taken;
      log(s, `${s.seats[seat]!.name} monopolized ${action.resource} (${taken}).`);
      return ok(s, [{ type: "played", kind: "mono", by: seat }]);
    }
    case "bankTrade": {
      const guard = requireActive(s, seat);
      if (guard) return guard;
      const ratio = tradeRatio(s, seat, action.give);
      if (s.seats[seat]!.resources[action.give] < ratio)
        return err(`Need ${ratio} ${action.give}`);
      if (s.bank[action.get] < 1) return err("Bank is out of that resource");
      s.seats[seat]!.resources[action.give] -= ratio;
      s.bank[action.give] += ratio;
      s.seats[seat]!.resources[action.get] += 1;
      s.bank[action.get] -= 1;
      log(s, `${s.seats[seat]!.name} traded ${ratio} ${action.give} for ${action.get}.`);
      return ok(s, [{ type: "trade", from: seat, to: -1 }]);
    }
    case "proposeTrade": {
      const guard = requireActive(s, seat);
      if (guard) return guard;
      if (!hasHand(s.seats[seat]!, action.give))
        return err("You do not hold what you offer");
      if (partialTotal(action.give) === 0 && partialTotal(action.get) === 0)
        return err("Empty trade");
      const responses: Record<number, "pending" | "accept" | "reject"> = {};
      for (const st of s.seats) if (st.id !== seat) responses[st.id] = "pending";
      s.trade = { from: seat, give: action.give, get: action.get, responses };
      log(s, `${s.seats[seat]!.name} proposed a trade.`);
      return ok(s);
    }
    case "respondTrade": {
      if (!s.trade) return err("No open trade");
      if (seat === s.trade.from) return err("You proposed this trade");
      if (!(seat in s.trade.responses)) return err("Not part of this trade");
      s.trade.responses[seat] = action.accept ? "accept" : "reject";
      return ok(s);
    }
    case "confirmTrade": {
      if (!s.trade) return err("No open trade");
      if (seat !== s.trade.from) return err("Only the proposer can confirm");
      if (s.trade.responses[action.withSeat] !== "accept")
        return err("That player has not accepted");
      const proposer = s.seats[seat]!;
      const other = s.seats[action.withSeat]!;
      if (!hasHand(proposer, s.trade.give)) return err("You no longer hold the offer");
      if (!hasHand(other, s.trade.get)) return err("They no longer hold their side");
      moveHand(proposer, other, s.trade.give);
      moveHand(other, proposer, s.trade.get);
      log(s, `${proposer.name} traded with ${other.name}.`);
      s.trade = null;
      return ok(s, [{ type: "trade", from: seat, to: action.withSeat }]);
    }
    case "cancelTrade": {
      if (!s.trade) return err("No open trade");
      if (seat !== s.trade.from) return err("Only the proposer can cancel");
      s.trade = null;
      return ok(s);
    }
    case "discard": {
      const need = s.pendingDiscards[seat];
      if (need == null) return err("You have nothing to discard");
      const chosen = action.hand;
      let total = 0;
      for (const r of RESOURCES) {
        const amt = chosen[r] ?? 0;
        if (amt < 0) return err("Invalid discard");
        if (amt > s.seats[seat]!.resources[r]) return err("You do not hold that many");
        total += amt;
      }
      if (total !== need) return err(`You must discard exactly ${need}`);
      payToBank(s, seat, chosen);
      delete s.pendingDiscards[seat];
      log(s, `${s.seats[seat]!.name} discarded ${need}.`);
      return ok(s);
    }
    case "moveRobber": {
      if (seat !== s.activeSeat) return err("Not your turn");
      if (Object.keys(s.pendingDiscards).length > 0)
        return err("Waiting on discards");
      const events: GameEvent[] = [];
      if (turn.mustMoveRobber) {
        if (action.hex === s.robberHex) return err("Move the robber somewhere new");
        if (action.hex < 0 || action.hex >= s.board.tiles.length)
          return err("No such hex");
        s.robberHex = action.hex;
        events.push({ type: "robber", hex: action.hex });
        log(s, `${s.seats[seat]!.name} moved the robber.`);
        resolveRobberSteal(s, seat, action.steal, events);
      } else if (s.steal) {
        if (action.steal == null || !s.steal.candidates.includes(action.steal))
          return err("Pick a valid target to steal from");
        stealCard(s, seat, action.steal, events);
        s.steal = null;
      } else {
        return err("The robber does not need moving");
      }
      return ok(s, events);
    }
    case "endTurn": {
      if (seat !== s.activeSeat) return err("Not your turn");
      if (!turn.hasRolled) return err("Roll before ending your turn");
      if (turn.mustMoveRobber) return err("Move the robber first");
      if (s.steal) return err("Choose who to steal from first");
      if (Object.keys(s.pendingDiscards).length > 0) return err("Discards pending");
      if (s.trade) return err("Resolve the open trade first");
      endTurn(s);
      return ok(s);
    }
    default:
      return err(`Action '${action.type}' not available yet`);
  }
}

/** Guard for actions that require it to be the seat's active, post-roll turn. */
function requireActive(s: GameState, seat: number): ApplyResult | null {
  if (seat !== s.activeSeat) return err("Not your turn");
  if (!s.turn!.hasRolled) return err("Roll first");
  if (s.turn!.mustMoveRobber) return err("Move the robber first");
  if (s.steal) return err("Resolve the robber steal first");
  if (Object.keys(s.pendingDiscards).length > 0) return err("Resolve discards first");
  return null;
}

/** Seats (other than `active`) with a building on the robber hex and ≥1 card. */
function robberTargets(s: GameState, active: number): number[] {
  const verts = new Set(hexVertices(s.robberHex));
  const out: number[] = [];
  for (const st of s.seats) {
    if (st.id === active) continue;
    if (handTotal(st.resources) === 0) continue;
    const onHex =
      st.buildings.settlements.some((v) => verts.has(v)) ||
      st.buildings.cities.some((v) => verts.has(v));
    if (onHex) out.push(st.id);
  }
  return out;
}

/** Resolve stealing after the robber moves: auto/explicit/pending as needed. */
function resolveRobberSteal(
  s: GameState,
  active: number,
  choice: number | null,
  events: GameEvent[],
): void {
  s.turn!.mustMoveRobber = false;
  const candidates = robberTargets(s, active);
  if (candidates.length === 0) {
    s.steal = null;
    return;
  }
  if (choice != null && candidates.includes(choice)) {
    stealCard(s, active, choice, events);
    s.steal = null;
    return;
  }
  if (candidates.length === 1) {
    stealCard(s, active, candidates[0]!, events);
    s.steal = null;
    return;
  }
  s.steal = { candidates };
}

/** Steal one uniformly random card (by resource share) from victim to thief. */
function stealCard(
  s: GameState,
  thief: number,
  victim: number,
  events: GameEvent[],
): void {
  const hand = s.seats[victim]!.resources;
  const pool: Resource[] = [];
  for (const r of RESOURCES) for (let i = 0; i < hand[r]; i++) pool.push(r);
  if (pool.length === 0) return;
  const rng = makeRng(`${s.seed}:steal:${s.version}`);
  const res = pool[Math.floor(rng() * pool.length)]!;
  s.seats[victim]!.resources[res]--;
  s.seats[thief]!.resources[res]++;
  events.push({ type: "stole", from: victim, to: thief });
  log(s, `${s.seats[thief]!.name} stole from ${s.seats[victim]!.name}.`);
}

/** Finish a build: recompute awards, check victory, return result. */
function finishBuild(s: GameState, seat: number, event: GameEvent): ApplyResult {
  const events: GameEvent[] = [event];
  refreshAwards(s, events);
  const win = checkVictory(s, seat);
  if (win) events.push(win);
  return ok(s, events);
}

/** Recompute awards; emit an event for any holder that changed. */
function refreshAwards(s: GameState, events: GameEvent[]): void {
  const before = { ...s.awards };
  recomputeAwards(s);
  if (s.awards.longestRoad !== before.longestRoad && s.awards.longestRoad !== null)
    events.push({ type: "award", kind: "longestRoad", seat: s.awards.longestRoad });
  if (s.awards.largestArmy !== before.largestArmy && s.awards.largestArmy !== null)
    events.push({ type: "award", kind: "largestArmy", seat: s.awards.largestArmy });
}

/** End the game if the seat has reached the winning VP total. */
function checkVictory(s: GameState, seat: number): GameEvent | null {
  if (s.phase === "play" && hasWon(s, seat)) {
    s.phase = "finished";
    s.winner = seat;
    s.turn = null;
    log(s, `${s.seats[seat]!.name} wins the island!`);
    return { type: "win", seat };
  }
  return null;
}

/** Distribute resources for a non-7 roll, respecting the multi-claimant bank rule. */
function produce(s: GameState, sum: number): Record<number, PartialHand> {
  // demand[seat][res]
  const demand: Record<number, PartialHand> = {};
  const totalPerRes: Record<Resource, number> = {
    brick: 0,
    wood: 0,
    sheep: 0,
    wheat: 0,
    ore: 0,
  };
  for (let h = 0; h < s.board.tiles.length; h++) {
    if (h === s.robberHex) continue;
    const tile = s.board.tiles[h]!;
    if (tile.terrain === "desert" || tile.num !== sum) continue;
    const res = tile.terrain as Resource;
    for (const v of hexVertices(h)) {
      const owner = buildingOwnerAt(s, v);
      if (owner === null) continue;
      const isCity = s.seats[owner]!.buildings.cities.includes(v);
      const amt = isCity ? 2 : 1;
      demand[owner] ??= {};
      demand[owner]![res] = (demand[owner]![res] ?? 0) + amt;
      totalPerRes[res] += amt;
    }
  }
  // Apply bank rule: if total demand for a resource exceeds the bank and more
  // than one seat claims it, nobody gets it; a lone claimant gets what's left.
  const gains: Record<number, PartialHand> = {};
  for (const res of RESOURCES) {
    if (totalPerRes[res] === 0) continue;
    const claimants = Object.keys(demand).filter((k) => (demand[+k]![res] ?? 0) > 0);
    if (totalPerRes[res] > s.bank[res]) {
      if (claimants.length !== 1) continue; // nobody gets it
    }
    for (const k of claimants) {
      const seat = +k;
      const got = bankGive(s, seat, { [res]: demand[seat]![res]! });
      if (got[res]) {
        gains[seat] ??= {};
        gains[seat]![res] = got[res];
      }
    }
  }
  return gains;
}

/** Test/AI seam: production for a given roll sum on a copy of state. */
export function simulateProduction(
  state: GameState,
  sum: number,
): { state: GameState; gains: Record<number, PartialHand> } {
  const s = clone(state);
  const gains = produce(s, sum);
  return { state: s, gains };
}

function endTurn(s: GameState): void {
  const st = s.seats[s.activeSeat]!;
  if (st.newDevCards.length) {
    st.devCards.push(...st.newDevCards);
    st.newDevCards = [];
  }
  const idx = s.turnOrder.indexOf(s.activeSeat);
  s.activeSeat = s.turnOrder[(idx + 1) % s.turnOrder.length]!;
  s.turn = {
    hasRolled: false,
    dice: null,
    mustMoveRobber: false,
    freeRoads: 0,
    devPlayedThisTurn: false,
  };
  log(s, `${s.seats[s.activeSeat]!.name} to roll.`);
}
