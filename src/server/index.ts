import { GameRoom, type Env } from "./room";
import { StatsHub } from "./stats";
import { RateLimiter } from "./rate";

export { GameRoom, StatsHub, RateLimiter };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}

/** Per-IP rate limit; true if allowed. */
async function allow(
  env: Env,
  ip: string,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip));
  return stub.check(bucket, limit, windowMs);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const ip = clientIp(request);

    // Create a room: returns a fresh code (the DO is created lazily on connect).
    if (request.method === "POST" && url.pathname === "/api/room") {
      if (!(await allow(env, ip, "room", 20, 60_000)))
        return new Response("Too many rooms, slow down", { status: 429 });
      return Response.json({ code: randomCode() });
    }

    // Public headline numbers for the landing page (safe subset, no auth).
    if (url.pathname === "/api/public-stats") {
      const stub = env.STATS.get(env.STATS.idFromName("global"));
      const s = await stub.getStats();
      return Response.json({
        uniquePlayers: s.uniquePlayers,
        gamesPlayed: s.gamesFinished,
        onlinePlayers: s.onlinePlayers,
      });
    }

    // A player's own career stats (keyed by their unguessable guest id).
    if (url.pathname === "/api/player") {
      const pid = url.searchParams.get("pid");
      if (!pid) return new Response("Missing pid", { status: 400 });
      const stub = env.STATS.get(env.STATS.idFromName("global"));
      return Response.json(await stub.getPlayer(pid));
    }

    // Admin stats (gated by ADMIN_KEY via header or ?key=).
    if (url.pathname === "/api/stats") {
      const key = request.headers.get("x-admin-key") ?? url.searchParams.get("key");
      if (!env.ADMIN_KEY || key !== env.ADMIN_KEY)
        return new Response("Unauthorized", { status: 401 });
      const stub = env.STATS.get(env.STATS.idFromName("global"));
      const snapshot = await stub.getStats();
      return Response.json(snapshot);
    }

    // WebSocket into a room: /api/room/:code/ws
    const wsMatch = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]+)\/ws$/);
    if (wsMatch) {
      if (!(await allow(env, ip, "ws", 60, 60_000)))
        return new Response("Too many connections, slow down", { status: 429 });
      const code = wsMatch[1]!.toUpperCase();
      const id = env.GAME_ROOM.idFromName(code);
      const stub = env.GAME_ROOM.get(id);
      // Forward the original request untouched so the WebSocket upgrade survives.
      return stub.fetch(request);
    }

    // Everything else: static SPA assets.
    return env.ASSETS.fetch(request);
  },
};
