import { DurableObject } from "cloudflare:workers";
import type { FinishedGame, PlayerCareer, StatsSnapshot } from "./protocol";

interface Totals {
  humansJoined: number;
  gamesStarted: number;
  gamesFinished: number;
  totalMatchMs: number;
  recent: FinishedGame[];
}

interface Presence {
  online: number;
  phase: string;
  ts: number;
}

interface PlayerStats {
  name: string;
  gamesPlayed: number;
  wins: number;
  totalVP: number;
  longestRoadHeld: number;
  largestArmyHeld: number;
}

export interface PlayerResult {
  won: boolean;
  vp: number;
  longestRoad: boolean;
  largestArmy: boolean;
}

const FRESH_MS = 30 * 60 * 1000; // presence entries older than this are ignored
const RECENT_CAP = 20;

/** Singleton (getByName "global") that aggregates site-wide play stats. Game
 *  rooms report lifecycle events to it via RPC. */
export class StatsHub extends DurableObject {
  private totals: Totals = {
    humansJoined: 0,
    gamesStarted: 0,
    gamesFinished: 0,
    totalMatchMs: 0,
    recent: [],
  };
  private presence: Record<string, Presence> = {};
  private players: Record<string, PlayerStats> = {};

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.blockConcurrencyWhile(async () => {
      this.totals = (await ctx.storage.get<Totals>("totals")) ?? this.totals;
      this.presence = (await ctx.storage.get<Record<string, Presence>>("presence")) ?? {};
      this.players = (await ctx.storage.get<Record<string, PlayerStats>>("players")) ?? {};
    });
  }

  async recordPlayerResult(pid: string, name: string, r: PlayerResult): Promise<void> {
    const p = (this.players[pid] ??= {
      name,
      gamesPlayed: 0,
      wins: 0,
      totalVP: 0,
      longestRoadHeld: 0,
      largestArmyHeld: 0,
    });
    p.name = name || p.name;
    p.gamesPlayed++;
    if (r.won) p.wins++;
    p.totalVP += r.vp;
    if (r.longestRoad) p.longestRoadHeld++;
    if (r.largestArmy) p.largestArmyHeld++;
    await this.ctx.storage.put("players", this.players);
  }

  async getPlayer(pid: string): Promise<PlayerCareer | null> {
    const p = this.players[pid];
    if (!p) return null;
    return {
      name: p.name,
      gamesPlayed: p.gamesPlayed,
      wins: p.wins,
      winRate: p.gamesPlayed ? p.wins / p.gamesPlayed : 0,
      avgVP: p.gamesPlayed ? p.totalVP / p.gamesPlayed : 0,
      longestRoadHeld: p.longestRoadHeld,
      largestArmyHeld: p.largestArmyHeld,
    };
  }

  async recordJoin(): Promise<void> {
    this.totals.humansJoined++;
    await this.ctx.storage.put("totals", this.totals);
  }

  async recordGameStart(): Promise<void> {
    this.totals.gamesStarted++;
    await this.ctx.storage.put("totals", this.totals);
  }

  async recordGameFinish(durationMs: number, players: number, winner: string): Promise<void> {
    this.totals.gamesFinished++;
    this.totals.totalMatchMs += Math.max(0, durationMs);
    this.totals.recent.unshift({ winner, durationMs, players, endedAt: Date.now() });
    this.totals.recent = this.totals.recent.slice(0, RECENT_CAP);
    await this.ctx.storage.put("totals", this.totals);
  }

  async presenceUpdate(code: string, online: number, phase: string): Promise<void> {
    if (online <= 0) delete this.presence[code];
    else this.presence[code] = { online, phase, ts: Date.now() };
    await this.ctx.storage.put("presence", this.presence);
  }

  async getStats(): Promise<StatsSnapshot> {
    const now = Date.now();
    let onlinePlayers = 0;
    let activeGames = 0;
    for (const [code, p] of Object.entries(this.presence)) {
      if (now - p.ts > FRESH_MS) {
        delete this.presence[code];
        continue;
      }
      onlinePlayers += p.online;
      if (p.phase === "setup" || p.phase === "play") activeGames++;
    }
    return {
      humansJoined: this.totals.humansJoined,
      gamesStarted: this.totals.gamesStarted,
      gamesFinished: this.totals.gamesFinished,
      avgMatchMs: this.totals.gamesFinished
        ? Math.round(this.totals.totalMatchMs / this.totals.gamesFinished)
        : 0,
      onlinePlayers,
      activeGames,
      recent: this.totals.recent,
    };
  }
}
