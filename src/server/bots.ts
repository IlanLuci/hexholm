import type { GameState } from "../shared/types";
import type { GameEvent } from "../shared/actions";

export interface BotOutcome {
  state: GameState;
  events: GameEvent[];
}

/**
 * Advance the game by playing out any bot seats that currently owe a move
 * (their turn, a discard, or a robber steal). Returns the same state reference
 * when no bot acted. Implemented in Phase 4; a no-op stub for now.
 */
export function driveBots(state: GameState): BotOutcome {
  return { state, events: [] };
}
