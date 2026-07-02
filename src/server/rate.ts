import { DurableObject } from "cloudflare:workers";

/** Per-IP sliding-window rate limiter. One instance per client IP (getByName),
 *  holding independent buckets (e.g. "room", "ws"). */
export class RateLimiter extends DurableObject {
  /** Returns true if this hit is allowed; false if the window is already full. */
  async check(bucket: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const key = `b:${bucket}`;
    const hits = (await this.ctx.storage.get<number[]>(key)) ?? [];
    const fresh = hits.filter((t) => now - t < windowMs);
    if (fresh.length >= limit) {
      await this.ctx.storage.put(key, fresh);
      return false;
    }
    fresh.push(now);
    await this.ctx.storage.put(key, fresh);
    return true;
  }
}
