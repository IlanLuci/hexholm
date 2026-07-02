import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, GameEvent } from "../shared/actions";
import type { ClientMessage, GameView, ServerMessage } from "../server/protocol";

export type Status = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface Game {
  view: GameView | null;
  status: Status;
  error: string | null;
  seatId: number | null;
  lastEvents: GameEvent[];
  connect: (code: string, name: string) => void;
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

  const ws = useRef<WebSocket | null>(null);
  const params = useRef<{ code: string; name: string } | null>(null);
  const alive = useRef(false);
  const retry = useRef<number | null>(null);

  const open = useCallback(() => {
    const p = params.current;
    if (!p) return;
    setStatus((s) => (s === "open" ? s : ws.current ? "reconnecting" : "connecting"));
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${proto}://${location.host}/api/room/${p.code}/ws`);
    ws.current = sock;

    sock.onopen = () => {
      const token = localStorage.getItem(tokenKey(p.code)) ?? undefined;
      const hello: ClientMessage = { t: "hello", name: p.name, sessionToken: token };
      sock.send(JSON.stringify(hello));
    };
    sock.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as ServerMessage;
      if (msg.t === "welcome") {
        localStorage.setItem(tokenKey(p.code), msg.sessionToken);
        setSeatId(msg.seatId);
        setStatus("open");
      } else if (msg.t === "state") {
        setView(msg.view);
      } else if (msg.t === "event") {
        setLastEvents(msg.events);
      } else if (msg.t === "error") {
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
    (code: string, name: string) => {
      const upper = code.toUpperCase();
      params.current = { code: upper, name };
      alive.current = true;
      // remember the active room so a page reload rejoins automatically
      localStorage.setItem("hexholm:room", upper);
      localStorage.setItem("hexholm:name", name);
      open();
    },
    [open],
  );

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
    setView(null);
    setSeatId(null);
    setStatus("idle");
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
    connect,
    send,
    leave,
    clearError: () => setError(null),
  };
}
