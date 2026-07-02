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

  const builds: { m: Mode; label: string; cost: PartialHand }[] = [
    { m: "road", label: "Road", cost: COSTS.road },
    { m: "settlement", label: "Settle", cost: COSTS.settle },
    { m: "city", label: "City", cost: COSTS.city },
  ];

  return (
    <div style={{ background: C.tealDark, borderTop: "1px solid rgba(255,255,255,.07)", padding: "13px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
      {/* hand */}
      <div style={{ display: "flex", gap: 7 }}>
        {RES_ORDER.map((r) => (
          <div key={r} style={{ position: "relative", width: 52, height: 72, borderRadius: 6, background: CARD[r], boxShadow: "0 3px 9px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.16)", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 8, border: "1px solid rgba(255,255,255,.14)", opacity: hand[r] === 0 ? 0.42 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <ResIcon res={r} size={15} />
              <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 22, color: "#fff", lineHeight: 0.85, textShadow: "0 1px 3px rgba(0,0,0,.4)" }}>{hand[r]}</span>
            </div>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: "rgba(255,255,255,.9)", letterSpacing: ".4px", textTransform: "uppercase" }}>{RES_NAME[r]}</span>
          </div>
        ))}
      </div>

      <div style={{ width: 1, height: 52, background: "rgba(255,255,255,.1)" }} />

      {/* dice */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Die value={view.turn?.dice?.[0] ?? 1} />
        <Die value={view.turn?.dice?.[1] ?? 1} />
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
