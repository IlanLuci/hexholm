import { useState } from "react";
import { C, font } from "../theme";
import { HexLogo } from "../components/icons";
import type { Status } from "../net";

export function Landing({
  connect,
  status,
}: {
  connect: (code: string, name: string) => void;
  status: Status;
}) {
  const [name, setName] = useState(localStorage.getItem("hexholm:name") ?? "");
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "",
  );
  const [busy, setBusy] = useState(false);
  const invited = !!new URLSearchParams(location.search).get("room");

  const remember = () => localStorage.setItem("hexholm:name", name.trim());

  const create = async () => {
    if (!name.trim()) return;
    remember();
    setBusy(true);
    const res = await fetch("/api/room", { method: "POST" });
    const { code: newCode } = (await res.json()) as { code: string };
    connect(newCode, name.trim());
  };
  const join = () => {
    if (!name.trim() || !code.trim()) return;
    remember();
    connect(code.trim(), name.trim());
  };

  const connecting = busy || status === "connecting";

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: C.teal }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 80% at 80% -10%, rgba(217,164,65,.18), transparent 55%), linear-gradient(180deg, rgba(32,50,60,.4) 0%, #1A2A32 100%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1120, margin: "0 auto", padding: "26px 34px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(244,236,221,.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <HexLogo size={30} />
          <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 22, color: C.cream, letterSpacing: ".5px" }}>HEXHOLM</span>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, color: "#B9C6BC", fontWeight: 700, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>
          <span style={{ width: 8, height: 8, background: "#8FBF6A", borderRadius: 2 }} /> 2–4 settlers
        </span>
      </div>

      <div style={{ position: "relative", zIndex: 2, maxWidth: 1120, margin: "0 auto", padding: "9vh 34px 8vh" }}>
        <h1 style={{ fontFamily: font.display, fontWeight: 700, fontSize: "min(108px, 13vw)", lineHeight: 0.92, color: "#F7EFDE", margin: 0, letterSpacing: "-2px", maxWidth: 900 }}>
          Build. Trade.<br />Outwit the island.
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.6, color: "#CBBEA4", maxWidth: 520, margin: "30px 0 0", fontWeight: 500 }}>
          Gather brick, grain and ore. Cut shrewd trades, block your rivals, and race to ten victory points — one hex at a time.
        </p>

        {invited && (
          <div style={{ marginTop: 28, display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(196,99,59,.18)", border: "1px solid rgba(196,99,59,.5)", borderRadius: 8, padding: "12px 18px" }}>
            <span style={{ color: "#EBC97A", fontWeight: 800, letterSpacing: 1, fontSize: 12, textTransform: "uppercase" }}>Invited to room {code}</span>
            <span style={{ color: "#CBBEA4", fontWeight: 600, fontSize: 13 }}>— enter your name and join below</span>
          </div>
        )}
        <div style={{ marginTop: invited ? 16 : 40, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            style={inputStyle}
          />
          <button onClick={create} disabled={connecting} style={primaryBtn}>
            {connecting ? "Connecting…" : "Create table"}
          </button>
        </div>
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={6}
            style={{ ...inputStyle, width: 160, letterSpacing: 3, fontWeight: 700 }}
          />
          <button onClick={join} disabled={connecting} style={ghostBtn}>
            Join table →
          </button>
        </div>

        <div style={{ display: "flex", gap: 0, marginTop: 70, borderTop: "1px solid rgba(244,236,221,.14)", maxWidth: 640 }}>
          {[
            ["10", "Points to win"],
            ["2–4", "Per table"],
            ["~30m", "Avg. match"],
          ].map(([n, l]) => (
            <div key={l} style={{ flex: 1, padding: "24px 0" }}>
              <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 34, color: C.cream }}>{n}</div>
              <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#8E937F", fontWeight: 700, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(244,236,221,.1)",
  border: "1px solid rgba(244,236,221,.3)",
  color: C.cream,
  fontFamily: font.body,
  fontWeight: 600,
  fontSize: 16,
  padding: "15px 18px",
  borderRadius: 5,
  outline: "none",
  width: 240,
};

const primaryBtn: React.CSSProperties = {
  background: C.terracotta,
  border: "none",
  color: "#FBF3E4",
  fontFamily: font.body,
  fontWeight: 700,
  fontSize: 16,
  padding: "16px 30px",
  borderRadius: 5,
  cursor: "pointer",
  letterSpacing: ".3px",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(244,236,221,.35)",
  color: C.cream,
  fontFamily: font.body,
  fontWeight: 600,
  fontSize: 16,
  padding: "15px 24px",
  borderRadius: 5,
  cursor: "pointer",
};
