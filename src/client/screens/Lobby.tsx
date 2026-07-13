import { useState } from "react";
import { C, font } from "../theme";
import { HexLogo } from "../components/icons";
import { useCareer, ProfileTooltip } from "../components/Profile";
import type { Game } from "../net";
import type { GameView } from "../../server/protocol";

export function Lobby({ game, view }: { game: Game; view: GameView }) {
  const me = view.seats[view.youSeat];
  const owner = view.youAreOwner;
  const settings = view.settings;
  const modeLabel = settings.setupMode === "settlementCity" ? "Settlement + city" : "Two settlements";
  const setWinVP = (v: number) =>
    game.send({ type: "setSettings", winVP: Math.max(7, Math.min(13, v)) });
  const setMode = (m: "settlements" | "settlementCity") =>
    game.send({ type: "setSettings", setupMode: m });
  const allReady = view.seats.length >= 2 && view.seats.every((s) => s.ready);
  const career = useCareer("lobby");
  const [hoverSeat, setHoverSeat] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const inviteLink = `${location.origin}/?room=${view.roomCode}`;
  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.parchment, padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32, paddingBottom: 20, borderBottom: `1px solid #D8C8A6` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <HexLogo size={26} color={C.terracotta} />
            <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 20, color: C.ink, letterSpacing: ".5px" }}>HEXHOLM</span>
          </div>
          <button onClick={game.leave} style={outlineBtn}>Leave lobby</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", background: C.tealDark, borderRadius: 10, padding: "20px 26px", marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "#7E9099", marginBottom: 4 }}>Invite players — room code</div>
            <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 40, letterSpacing: 6, color: C.cream, lineHeight: 1 }}>{view.roomCode}</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => copy(view.roomCode, "code")} style={inviteBtn}>{copied === "code" ? "Copied ✓" : "Copy code"}</button>
            <button onClick={() => copy(inviteLink, "link")} style={{ ...inviteBtn, background: C.terracotta, color: "#FBF3E4", border: "none" }}>{copied === "link" ? "Link copied ✓" : "Copy invite link"}</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 340, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 26 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ fontFamily: font.display, fontWeight: 700, fontSize: 24, margin: 0, color: C.ink }}>Harbor Table</h2>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: C.gold }}>ROOM {view.roomCode}</span>
            </div>
            <p style={{ margin: "0 0 22px", color: C.muted, fontWeight: 500, fontSize: 13.5 }}>
              Share the room code. Toggle ready when you're set — start once everyone's in.
            </p>

            {view.seats.map((seat) => (
              <div key={seat.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
                <div
                  onMouseEnter={seat.isYou ? () => setHoverSeat(seat.id) : undefined}
                  onMouseLeave={seat.isYou ? () => setHoverSeat(null) : undefined}
                  style={{ position: "relative", width: 38, height: 38, borderRadius: 5, background: seat.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 15, fontFamily: font.display, flexShrink: 0, cursor: seat.isYou ? "pointer" : "default" }}
                >
                  {seat.name.slice(0, 1).toUpperCase()}
                  {seat.isYou && hoverSeat === seat.id && <ProfileTooltip career={career} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>
                    {seat.name}
                    {seat.isYou && <span style={youTag}>YOU</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#98866B", fontWeight: 600 }}>
                    {seat.kind === "bot" ? "AI opponent" : seat.connected ? "Connected" : "Away"}
                  </div>
                </div>
                {seat.kind === "bot" ? (
                  <button onClick={() => game.send({ type: "removeBot", seat: seat.id })} style={miniBtn}>Remove</button>
                ) : (
                  <span style={{ ...pill, background: seat.ready ? "#DCEBD3" : "#F0E4C8", color: seat.ready ? "#3F6B4E" : C.gold }}>
                    {seat.ready ? "Ready" : "Not ready"}
                  </span>
                )}
              </div>
            ))}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => game.send({ type: "ready", ready: !me?.ready })}
                style={{ ...bigBtn, background: me?.ready ? C.green : C.panelAlt, color: me?.ready ? C.cream : C.ink }}
              >
                {me?.ready ? "Ready ✓" : "I'm ready"}
              </button>
              {view.seats.length < 4 && (
                <button onClick={() => game.send({ type: "addBot" })} style={{ ...bigBtn, background: C.panelAlt, color: C.ink, flex: "0 0 auto" }}>
                  + Add bot
                </button>
              )}
            </div>
          </div>

          <div style={{ width: 320, flexGrow: 1, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 26, alignSelf: "flex-start" }}>
            <h3 style={{ fontFamily: font.display, fontWeight: 600, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", margin: "0 0 14px", color: C.gold }}>Table settings</h3>
            <div style={settingRow}>
              <span style={settingLabel}>Victory points</span>
              {owner ? (
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button style={stepBtn} onClick={() => setWinVP(settings.winVP - 1)} disabled={settings.winVP <= 7}>−</button>
                  <span style={{ ...settingValue, minWidth: 20, textAlign: "center" }}>{settings.winVP}</span>
                  <button style={stepBtn} onClick={() => setWinVP(settings.winVP + 1)} disabled={settings.winVP >= 13}>+</button>
                </span>
              ) : (
                <span style={settingValue}>{settings.winVP}</span>
              )}
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>Placement</span>
              {owner ? (
                <span style={{ display: "flex", gap: 6 }}>
                  {(["settlements", "settlementCity"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      style={{ ...toggleBtn, background: settings.setupMode === m ? C.terracotta : "transparent", color: settings.setupMode === m ? "#FBF3E4" : C.ink, borderColor: settings.setupMode === m ? C.terracotta : "#CBB98F" }}
                    >
                      {m === "settlements" ? "2 settlements" : "Settle + city"}
                    </button>
                  ))}
                </span>
              ) : (
                <span style={settingValue}>{modeLabel}</span>
              )}
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>Players</span>
              <span style={settingValue}>{view.seats.length} / 4</span>
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>Board</span>
              <span style={settingValue}>Classic island</span>
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>Robber</span>
              <span style={settingValue}>Standard (7s)</span>
            </div>
            <button
              onClick={() => game.send({ type: "start" })}
              disabled={!allReady}
              style={{ ...bigBtn, width: "100%", marginTop: 22, background: allReady ? C.terracotta : "#D8C4A0", color: "#FBF3E4", cursor: allReady ? "pointer" : "not-allowed" }}
            >
              Start match →
            </button>
            {!allReady && (
              <p style={{ margin: "10px 0 0", fontSize: 12, color: C.muted, fontWeight: 600, textAlign: "center" }}>
                Need 2+ players, all ready.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const outlineBtn: React.CSSProperties = { background: "transparent", border: "1px solid #CBB98F", color: "#6B5A42", fontFamily: font.body, fontWeight: 600, fontSize: 13, padding: "9px 16px", borderRadius: 4, cursor: "pointer" };
const inviteBtn: React.CSSProperties = { background: "rgba(244,236,221,.1)", border: "1px solid rgba(244,236,221,.3)", color: C.cream, fontFamily: font.body, fontWeight: 700, fontSize: 13.5, padding: "12px 18px", borderRadius: 5, cursor: "pointer" };
const bigBtn: React.CSSProperties = { border: "none", fontFamily: font.body, fontWeight: 700, fontSize: 15, padding: "14px 18px", borderRadius: 5, cursor: "pointer", letterSpacing: ".3px", flex: 1 };
const miniBtn: React.CSSProperties = { background: "transparent", border: "1px solid #CBB98F", color: "#6B5A42", fontWeight: 600, fontSize: 12, padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontFamily: font.body };
const pill: React.CSSProperties = { fontSize: 12, fontWeight: 800, padding: "5px 10px", borderRadius: 20 };
const youTag: React.CSSProperties = { fontSize: 8.5, fontWeight: 800, letterSpacing: ".5px", color: C.teal, background: C.accentGold, padding: "2px 4px", borderRadius: 3, marginLeft: 6 };
const settingRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${C.borderSoft}` };
const settingLabel: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: "#6B5A42" };
const settingValue: React.CSSProperties = { fontSize: 13.5, fontWeight: 700, color: C.ink };
const stepBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 5, border: "1px solid #CBB98F", background: C.panelAlt, color: C.ink, fontWeight: 800, fontSize: 15, cursor: "pointer", lineHeight: 1, padding: 0 };
const toggleBtn: React.CSSProperties = { border: "1px solid #CBB98F", borderRadius: 5, padding: "6px 10px", fontFamily: font.body, fontWeight: 700, fontSize: 12, cursor: "pointer" };
