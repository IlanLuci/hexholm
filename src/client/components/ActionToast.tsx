import { useEffect, useRef, useState } from "react";
import { C, font } from "../theme";
import type { GameEvent } from "../../shared/actions";
import type { GameView } from "../../server/protocol";

const DEV_NAME: Record<string, string> = {
  knight: "a Knight",
  road: "Road Building",
  plenty: "Year of Plenty",
  mono: "Monopoly",
  vp: "a Victory Point",
};

/** Pick the most narratable event in a batch and phrase it for the viewer. */
function describe(events: GameEvent[], view: GameView): string | null {
  const name = (seat: number) => (seat === view.youSeat ? "You" : view.seats[seat]?.name ?? "Someone");
  const priority = ["win", "award", "built", "played", "boughtDev", "stole", "trade", "robber", "rolled"];
  const pick = [...events].sort(
    (a, b) => priority.indexOf(a.type) - priority.indexOf(b.type),
  )[0];
  if (!pick) return null;
  switch (pick.type) {
    case "rolled":
      return `${name(pick.by)} rolled ${pick.dice[0] + pick.dice[1]}`;
    case "built":
      return `${name(pick.by)} built a ${pick.kind}`;
    case "boughtDev":
      return `${name(pick.by)} bought a development card`;
    case "played":
      return `${name(pick.by)} played ${DEV_NAME[pick.kind] ?? "a card"}`;
    case "stole":
      return `${name(pick.to)} stole from ${name(pick.from)}`;
    case "robber":
      return `The robber moved`;
    case "trade":
      return pick.to === -1 ? `${name(pick.from)} traded with the bank` : `${name(pick.from)} traded with ${name(pick.to)}`;
    case "award":
      return `${name(pick.seat)} took ${pick.kind === "longestRoad" ? "the longest road" : "the largest army"}`;
    case "win":
      return `${name(pick.seat)} wins!`;
    default:
      return null;
  }
}

export function ActionToast({ events, view }: { events: GameEvent[]; view: GameView }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [id, setId] = useState(0);
  const lastRef = useRef<GameEvent[] | null>(null);

  useEffect(() => {
    if (events === lastRef.current || events.length === 0) return;
    lastRef.current = events;
    const text = describe(events, view);
    if (!text) return;
    setMsg(text);
    setId((n) => n + 1);
  }, [events, view]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1900);
    return () => clearTimeout(t);
  }, [msg, id]);

  if (!msg) return null;
  return (
    <div
      key={id}
      style={{
        position: "fixed",
        top: 66,
        left: "50%",
        zIndex: 120,
        background: C.tealDark,
        color: C.cream,
        padding: "10px 20px",
        borderRadius: 8,
        fontFamily: font.display,
        fontWeight: 700,
        fontSize: 15,
        boxShadow: "0 12px 30px rgba(0,0,0,.35)",
        border: "1px solid rgba(255,255,255,.1)",
        animation: "hhtoast 1.9s ease forwards",
        pointerEvents: "none",
      }}
    >
      {msg}
    </div>
  );
}
