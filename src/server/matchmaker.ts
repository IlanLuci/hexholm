import { DurableObject } from "cloudflare:workers";
import { nextForming, type Forming } from "./quickmatch";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** Global router for Quick Play. Groups players who claim within the same short
 *  window into one shared room code (capped at a full table), then rolls over. */
export class Matchmaker extends DurableObject {
  private forming: Forming | null = null;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.blockConcurrencyWhile(async () => {
      this.forming = (await ctx.storage.get<Forming>("forming")) ?? null;
    });
  }

  /** Assign the caller to a forming match and return its room code. `now` is
   *  passed in so the routing decision is deterministic and unit-testable. */
  async claim(now: number): Promise<string> {
    this.forming = nextForming(this.forming, now, randomCode);
    await this.ctx.storage.put("forming", this.forming);
    return this.forming.code;
  }
}
