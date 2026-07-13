/** Quick Play tuning. FORMING_MS must stay below MATCH_DEADLINE_MS so the
 *  last-routed player always connects before the room fires its start alarm. */
export const TARGET_SEATS = 4;
export const FORMING_MS = 2500;
export const MATCH_DEADLINE_MS = 3000;

/** One in-progress matchmaking group inside the Matchmaker DO. */
export interface Forming {
  code: string;
  size: number;
  expires: number;
}

/** The forming match a new claimant should join. Starts a fresh group when
 *  there is none, the current one is full, or it has expired. */
export function nextForming(
  current: Forming | null,
  now: number,
  mint: () => string,
): Forming {
  if (!current || current.size >= TARGET_SEATS || now >= current.expires) {
    return { code: mint(), size: 1, expires: now + FORMING_MS };
  }
  return { ...current, size: current.size + 1 };
}

/** Bots to add when the start deadline fires. null → do not start (no humans). */
export function deadlineBots(humans: number): number | null {
  if (humans <= 0) return null;
  if (humans >= 3) return 0;
  return TARGET_SEATS - humans;
}
