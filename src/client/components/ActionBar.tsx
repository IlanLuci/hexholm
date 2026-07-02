import { useEffect, useRef, useState } from "react";
import { C, CARD, RES_NAME, RES_ORDER, font } from "../theme";
import { ResIcon, Die } from "./icons";
import { COSTS, type PartialHand, type Resource } from "../../shared/types";
import type { GameView } from "../../server/protocol";
import type { Mode } from "./Board";

interface Props {
  view: GameView;
  isMyTurn: boolean;
  buildMode: Mode;
  onPickBuild: (m: Mode) => void;
  onRoll: () => void;
  onTrade: () => void;
  onDev: () => void;
  onEndTurn: () => void;
}

function affordable(res: Record<Resource, number>, cost: PartialHand): boolean {
  return RES_ORDER.every((r) => res[r] >= (cost[r] ?? 0));
}

export function ActionBar({ view, isMyTurn, buildMode, onPickBuild, onRoll, onTrade, onDev, onEndTurn }: Props) {
  const me = view.seats[view.youSeat]!;
  const hand = me.resources ?? { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 };
  const rolled = view.turn?.hasRolled ?? false;
  const robber = view.turn?.mustMoveRobber ?? false;

  // shake the dice whenever a new roll lands
  const [rolling, setRolling] = useState(false);
  const prevDice = useRef<string>("");
  useEffect(() => {
    const key = JSON.stringify(view.turn?.dice ?? null);
    if (key === prevDice.current) return;
    prevDice.current = key;
    if (view.turn?.hasRolled && view.turn?.dice) {
      setRolling(true);
      const t = setTimeout(() => setRolling(false), 520);
      return () => clearTimeout(t);
    }
  }, [view.turn?.dice, view.turn?.hasRolled]);

  // flash cards + float a delta when your hand changes (gain / spend / steal)
  const [flash, setFlash] = useState<{ id: number; d: Record<Resource, number> }>({
    id: 0,
    d: { brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 },
  });
  const prevHand = useRef(hand);
  const handKey = RES_ORDER.map((r) => hand[r]).join(",");
  useEffect(() => {
    const d = {} as Record<Resource, number>;
    let any = false;
    for (const r of RES_ORDER) {
      d[r] = hand[r] - prevHand.current[r];
      if (d[r] !== 0) any = true;
    }
    prevHand.current = { ...hand };
    if (any) setFlash((f) => ({ id: f.id + 1, d }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey]);

  const builds: { m: Mode; label: string; cost: PartialHand }[] = [
    { m: "road", label: "Road", cost: COSTS.road },
    { m: "settlement", label: "Settle", cost: COSTS.settle },
    { m: "city", label: "City", cost: COSTS.city },
  ];

  return (
    <div style={{ background: C.tealDark, borderTop: "1px solid rgba(255,255,255,.07)", padding: "13px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
      {/* hand */}
      <div style={{ display: "flex", gap: 7 }}>
        {RES_ORDER.map((r) => {
          const delta = flash.d[r];
          const cls = delta > 0 ? "hh-gain" : delta < 0 ? "hh-loss" : undefined;
          return (
            <div key={`${r}-${flash.id}`} className={cls} style={{ position: "relative", width: 52, height: 72, borderRadius: 6, background: CARD[r], boxShadow: "0 3px 9px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.16)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 8, border: "1px solid rgba(255,255,255,.14)", opacity: hand[r] === 0 ? 0.42 : 1 }}>
              {delta !== 0 && (
                <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", fontFamily: font.display, fontWeight: 800, fontSize: 15, color: delta > 0 ? "#8FBF6A" : "#E08C74", textShadow: "0 1px 3px rgba(0,0,0,.5)", animation: "hhdelta 1.1s ease forwards", pointerEvents: "none", whiteSpace: "nowrap" }}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <ResIcon res={r} size={18} onCard />
                <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 22, color: "#fff", lineHeight: 0.85, textShadow: "0 1px 3px rgba(0,0,0,.4)" }}>{hand[r]}</span>
              </div>
              <span style={{ fontSize: 8.5, fontWeight: 800, color: "rgba(255,255,255,.9)", letterSpacing: ".4px", textTransform: "uppercase" }}>{RES_NAME[r]}</span>
            </div>
          );
        })}
      </div>

      <div style={{ width: 1, height: 52, background: "rgba(255,255,255,.1)" }} />

      {/* dice */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={rolling ? "hh-die-roll" : undefined} style={{ display: "block" }}>
          <Die value={view.turn?.dice?.[0] ?? 1} />
        </span>
        <span className={rolling ? "hh-die-roll" : undefined} style={{ display: "block" }}>
          <Die value={view.turn?.dice?.[1] ?? 1} />
        </span>
      </div>

      {/* actions */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center" }}>
        {!rolled ? (
          <button onClick={onRoll} disabled={!isMyTurn} style={{ ...rollBtn, opacity: isMyTurn ? 1 : 0.5, cursor: isMyTurn ? "pointer" : "default" }}>
            Roll dice
          </button>
        ) : (
          <>
            {builds.map((b) => {
              const can = isMyTurn && !robber && affordable(hand, b.cost);
              const active = buildMode === b.m;
              return (
                <button
                  key={b.label}
                  onClick={() => can && onPickBuild(active ? null : b.m)}
                  style={{ ...buildBtn, background: active ? C.accentGold : "rgba(255,255,255,.06)", color: active ? C.teal : C.cream, opacity: can ? 1 : 0.4, cursor: can ? "pointer" : "default" }}
                >
                  <span style={{ fontWeight: 800, fontSize: 12 }}>{b.label}</span>
                  <span style={{ fontSize: 9.5, opacity: 0.75, fontWeight: 700 }}>{costText(b.cost)}</span>
                </button>
              );
            })}
            <button onClick={onTrade} disabled={!isMyTurn || robber} style={actionBtn}>Trade</button>
            <button onClick={onDev} disabled={!isMyTurn || robber} style={actionBtn}>Cards</button>
            <button onClick={onEndTurn} disabled={!isMyTurn || robber} style={{ ...endBtn, opacity: isMyTurn && !robber ? 1 : 0.5 }}>End turn ↵</button>
          </>
        )}
      </div>
    </div>
  );
}

function costText(cost: PartialHand): string {
  return RES_ORDER.filter((r) => cost[r]).map((r) => `${cost[r]}${r[0]!.toUpperCase()}`).join(" ");
}

const rollBtn: React.CSSProperties = { background: C.terracotta, border: "none", color: "#FBF3E4", fontFamily: font.body, fontWeight: 800, fontSize: 14, padding: "0 26px", height: 54, borderRadius: 6, letterSpacing: ".3px" };
const buildBtn: React.CSSProperties = { border: "none", fontFamily: font.body, height: 54, padding: "0 14px", borderRadius: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 };
const actionBtn: React.CSSProperties = { background: "rgba(255,255,255,.06)", border: "none", color: C.cream, fontFamily: font.body, fontWeight: 800, fontSize: 12.5, height: 54, padding: "0 16px", borderRadius: 6, cursor: "pointer" };
const endBtn: React.CSSProperties = { background: C.green, border: "none", color: C.cream, fontFamily: font.body, fontWeight: 800, fontSize: 13, padding: "0 20px", height: 54, borderRadius: 6, cursor: "pointer", letterSpacing: ".3px" };
