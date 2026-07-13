import type { GameState } from "../shared/types";
import { handTotal } from "../shared/types";
import { longestRoadLength } from "../shared/scoring";
import type { GameView, SeatView } from "./protocol";

/** Public victory points — buildings + awards, excluding hidden VP dev cards. */
export function publicVP(state: GameState, seat: number): number {
  const s = state.seats[seat]!;
  let vp = s.buildings.settlements.length + s.buildings.cities.length * 2;
  if (state.awards.longestRoad === seat) vp += 2;
  if (state.awards.largestArmy === seat) vp += 2;
  return vp;
}

function seatView(state: GameState, seat: number, viewer: number): SeatView {
  const s = state.seats[seat]!;
  const isYou = seat === viewer;
  const base: SeatView = {
    id: s.id,
    name: s.name,
    color: s.color,
    kind: s.kind,
    connected: s.connected,
    ready: s.ready,
    playedKnights: s.playedKnights,
    buildings: s.buildings,
    publicVP: publicVP(state, seat),
    longestRoad: longestRoadLength(state, seat),
    handCount: handTotal(s.resources),
    devCount: s.devCards.length + s.newDevCards.length,
    isYou,
  };
  if (isYou) {
    base.resources = s.resources;
    base.devCards = s.devCards;
    base.newDevCards = s.newDevCards;
  }
  return base;
}

/** Project the full authoritative state into what `viewer` is allowed to see. */
export function toView(state: GameState, viewer: number): GameView {
  return {
    roomCode: state.roomCode,
    phase: state.phase,
    board: state.board,
    seats: state.seats.map((s) => seatView(state, s.id, viewer)),
    turnOrder: state.turnOrder,
    activeSeat: state.activeSeat,
    setup: state.setup,
    turn: state.turn,
    robberHex: state.robberHex,
    pendingDiscards: state.pendingDiscards,
    steal: state.steal,
    trade: state.trade,
    bank: state.bank,
    devDeckCount: state.devDeck.length,
    awards: state.awards,
    winner: state.winner,
    log: state.log,
    youSeat: viewer,
    version: state.version,
    settings: state.settings,
    youAreOwner: viewer === 0,
  };
}
