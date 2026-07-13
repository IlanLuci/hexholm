import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, GameEvent } from "../shared/actions";
import type { ClientMessage, GameView, ServerMessage } from "../server/protocol";
import { getPlayerId } from "./identity";

export type Status = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface Game {
  view: GameView | null;
  status: Status;
  error: string | null;
  seatId: number | null;
  lastEvents: GameEvent[];
  quick: boolean;
  connect: (code: string, name: string, quick?: boolean) => void;
  quickPlay: (name: string) => void;
  send: (action: Action) => void;
  leave: () => void;
  clearError: () => void;
}

const tokenKey = (code: string) => `hexholm:token:${code}`;

export function useGame(): Game {
  const [view, setView] = useState<GameView | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seatId, setSeatId] = useState<number | null>(null);
  const [lastEvents, setLastEvents] = useState<GameEvent[]>([]);
  const [quick, setQuick] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const params = useRef<{ code: string; name: string; quick: boolean } | null>(null);
  const alive = useRef(false);
  const retry = useRef<number | null>(null);
  const requeued = useRef(false);
  const entered = useRef(false); // flips true once we're actually in a game
  const quickPlayRef = useRef<(name: string) => void>(() => {});

  const open = useCallback(() => {
    const p = params.current;
    if (!p) return;
    setStatus((s) => (s === "open" ? s : ws.current ? "reconnecting" : "connecting"));
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${proto}://${location.host}/api/room/${p.code}/ws`);
    ws.current = sock;

    sock.onopen = () => {
      const token = localStorage.getItem(tokenKey(p.code)) ?? undefined;
      const hello: ClientMessage = {
        t: "hello", name: p.name, sessionToken: token, playerId: getPlayerId(), quick: p.quick,
      };
      sock.send(JSON.stringify(hello));
    };
    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.t === "welcome") {
        entered.current = true;
        localStorage.setItem(tokenKey(p.code), msg.sessionToken);
        setSeatId(msg.seatId);
        setStatus("open");
      } else if (msg.t === "state") {
        setView(msg.view);
      } else if (msg.t === "event") {
        setLastEvents(msg.events);
      } else if (msg.t === "error") {
        const p2 = params.current;
        if (p2?.quick && !entered.current && !requeued.current) {
          requeued.current = true;
          alive.current = false;
          ws.current?.close();
          quickPlayRef.current?.(p2.name);
          return;
        }
        setError(msg.message);
      }
    };
    sock.onclose = () => {
      if (!alive.current) return;
      setStatus("reconnecting");
      retry.current = window.setTimeout(open, 1000);
    };
  }, []);

  const connect = useCallback(
    (code: string, name: string, quickMode = false) => {
      const upper = code.toUpperCase();
      params.current = { code: upper, name, quick: quickMode };
      alive.current = true;
      entered.current = false;
      setQuick(quickMode);
      // remember the active room so a page reload rejoins automatically
      localStorage.setItem("hexholm:room", upper);
      localStorage.setItem("hexholm:name", name);
      if (quickMode) localStorage.setItem("hexholm:quick", "1");
      else localStorage.removeItem("hexholm:quick");
      open();
    },
    [open],
  );

  const quickPlay = useCallback(
    (name: string) => {
      requeued.current = false;
      fetch("/api/quickplay", { method: "POST" })
        .then((r) => r.json())
        .then(({ code }: { code: string }) => connect(code, name, true))
        .catch(() => setError("Couldn't find a match — try again."));
    },
    [connect],
  );

  quickPlayRef.current = quickPlay;

  const send = useCallback((action: Action) => {
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN)
      sock.send(JSON.stringify({ t: "action", action } satisfies ClientMessage));
  }, []);

  const leave = useCallback(() => {
    alive.current = false;
    if (retry.current) window.clearTimeout(retry.current);
    ws.current?.close();
    ws.current = null;
    params.current = null;
    localStorage.removeItem("hexholm:room");
    localStorage.removeItem("hexholm:quick");
    setView(null);
    setSeatId(null);
    setStatus("idle");
    setQuick(false);
  }, []);

  useEffect(() => {
    return () => {
      alive.current = false;
      if (retry.current) window.clearTimeout(retry.current);
      ws.current?.close();
    };
  }, []);

  return {
    view,
    status,
    error,
    seatId,
    lastEvents,
    quick,
    connect,
    quickPlay,
    send,
    leave,
    clearError: () => setError(null),
  };
}
