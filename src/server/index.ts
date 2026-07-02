import { GameRoom, type Env } from "./room";

export { GameRoom };

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Create a room: returns a fresh code (the DO is created lazily on connect).
    if (request.method === "POST" && url.pathname === "/api/room") {
      return Response.json({ code: randomCode() });
    }

    // WebSocket into a room: /api/room/:code/ws
    const wsMatch = url.pathname.match(/^\/api\/room\/([A-Za-z0-9]+)\/ws$/);
    if (wsMatch) {
      const code = wsMatch[1]!.toUpperCase();
      const stub = env.GAME_ROOM.getByName(code);
      const fwd = new URL(request.url);
      fwd.searchParams.set("code", code);
      return stub.fetch(new Request(fwd, request));
    }

    // Everything else: static SPA assets.
    return env.ASSETS.fetch(request);
  },
};
