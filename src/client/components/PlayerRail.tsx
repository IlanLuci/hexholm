import { useState } from "react";
import { C, font } from "../theme";
import { useCareer, ProfileTooltip } from "./Profile";
import type { GameView } from "../../server/protocol";

export function PlayerRail({ view }: { view: GameView }) {
  const career = useCareer(view.phase === "finished" ? `${view.roomCode}:done` : "live");
  const [showProfile, setShowProfile] = useState(false);
  return (
    <div className="hh-scroll" style={{ width: 244, display: "flex", flexDirection: "column", gap: 9, flexShrink: 0 }}>
      {view.seats.map((p) => {
        const active = view.activeSeat === p.id;
        return (
          <div
            key={p.id}
            onMouseEnter={p.isYou ? () => setShowProfile(true) : undefined}
            onMouseLeave={p.isYou ? () => setShowProfile(false) : undefined}
            style={{
              position: "relative",
              background: active ? "rgba(217,164,65,.14)" : "rgba(0,0,0,.22)",
              border: `1px solid ${active ? "rgba(217,164,65,.5)" : "rgba(255,255,255,.07)"}`,
              borderRadius: 6,
              padding: "10px 12px",
              cursor: p.isYou ? "default" : undefined,
            }}
          >
            {p.isYou && showProfile && <ProfileTooltip career={career} />}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 31, height: 31, borderRadius: 5, background: p.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: font.display, fontSize: 14, flexShrink: 0 }}>
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.cream }}>{p.name}</span>
                  {p.isYou && <span style={youTag}>YOU</span>}
                  {!p.connected && p.kind === "human" && <span style={{ fontSize: 10, color: "#93A2AA" }}>· away</span>}
                </div>
                <div style={{ fontSize: 11, color: "#93A2AA", fontWeight: 600, marginTop: 1 }}>
                  {p.handCount} cards · {p.devCount} dev · {p.playedKnights} knights
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {view.awards.longestRoad === p.id && <Chip bg="#3F6B4E" title={`Longest road (${p.longestRoad})`}>▚</Chip>}
                {view.awards.largestArmy === p.id && <Chip bg="#4E6E8E" title="Largest army">⚔</Chip>}
                <div style={{ textAlign: "right", marginLeft: 3 }}>
                  <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 21, color: C.cream, lineHeight: 0.9 }}>{p.publicVP}</div>
                  <div style={{ fontSize: 8.5, color: "#7E8F97", fontWeight: 800, letterSpacing: 1 }}>VP</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="hh-scroll" style={{ marginTop: 1, background: "rgba(0,0,0,.24)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 6, padding: "12px 14px", flex: "1 1 0", minHeight: 88, maxHeight: 240, overflowY: "auto" }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: "#6E808A", marginBottom: 9 }}>GAME LOG</div>
        {view.log.slice(-14).reverse().map((line, i) => (
          <div key={view.log.length - i} style={{ fontSize: 12, color: "#B8C4CA", fontWeight: 500, lineHeight: 1.5, marginBottom: 6 }}>{line.text}</div>
        ))}
      </div>
    </div>
  );
}

function Chip({ bg, title, children }: { bg: string; title: string; children: React.ReactNode }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 21, height: 21, borderRadius: 4, background: bg, color: "#fff", fontSize: 12 }}>
      {children}
    </span>
  );
}

const youTag: React.CSSProperties = { fontSize: 8.5, fontWeight: 800, letterSpacing: ".5px", color: C.teal, background: C.accentGold, padding: "2px 4px", borderRadius: 3 };
