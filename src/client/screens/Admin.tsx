import { useEffect, useState } from "react";
import { C, font } from "../theme";
import { HexLogo } from "../components/icons";
import type { StatsSnapshot } from "../../server/protocol";

function fmtDuration(ms: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function fmtAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function AdminDashboard() {
  const REFRESH_S = 8;
  const [key, setKey] = useState(localStorage.getItem("hexholm:adminkey") ?? "");
  const [input, setInput] = useState("");
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_S);

  useEffect(() => {
    if (!key) return;
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats", { headers: { "x-admin-key": key } });
        if (res.status === 401) {
          if (live) {
            setError("Invalid admin key");
            setKey("");
            localStorage.removeItem("hexholm:adminkey");
          }
          return;
        }
        const data = (await res.json()) as StatsSnapshot;
        if (live) {
          setStats(data);
          setError(null);
        }
      } catch {
        if (live) setError("Could not reach the server");
      }
    };
    load();
    setSecondsLeft(REFRESH_S);
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          load();
          return REFRESH_S;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [key]);

  if (!key) {
    return (
      <div style={{ minHeight: "100vh", background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: C.panel, borderRadius: 10, padding: 34, width: 380, maxWidth: "100%", boxShadow: "0 30px 80px rgba(0,0,0,.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <HexLogo size={26} color={C.terracotta} />
            <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 20, color: C.ink }}>Hexholm admin</span>
          </div>
          <p style={{ color: C.muted, fontWeight: 600, fontSize: 13, margin: "0 0 16px" }}>Enter the admin key to view site stats.</p>
          <input
            value={input}
            type="password"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && input && (localStorage.setItem("hexholm:adminkey", input), setKey(input))}
            placeholder="Admin key"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 6, border: `1px solid ${C.border}`, fontFamily: font.body, fontSize: 15, outline: "none" }}
          />
          {error && <p style={{ color: "#B0503C", fontWeight: 700, fontSize: 12.5, margin: "10px 0 0" }}>{error}</p>}
          <button
            onClick={() => input && (localStorage.setItem("hexholm:adminkey", input), setKey(input))}
            style={{ width: "100%", marginTop: 14, background: C.terracotta, border: "none", color: "#FBF3E4", fontFamily: font.body, fontWeight: 700, fontSize: 15, padding: 13, borderRadius: 6, cursor: "pointer" }}
          >
            View dashboard
          </button>
        </div>
      </div>
    );
  }

  const cards: { label: string; value: string; hint?: string }[] = stats
    ? [
        { label: "Players online", value: String(stats.onlinePlayers) },
        { label: "Active games", value: String(stats.activeGames) },
        { label: "Players joined", value: String(stats.humansJoined), hint: "all-time" },
        { label: "Games started", value: String(stats.gamesStarted) },
        { label: "Games completed", value: String(stats.gamesFinished) },
        { label: "Avg. match time", value: fmtDuration(stats.avgMatchMs) },
      ]
    : [];

  return (
    <div style={{ minHeight: "100vh", background: C.parchment, padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26, paddingBottom: 18, borderBottom: "1px solid #D8C8A6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <HexLogo size={26} color={C.terracotta} />
            <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 20, color: C.ink }}>Hexholm admin</span>
          </div>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>
            {error ? error : `Refreshes in ${secondsLeft}s`}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 26 }}>
          {cards.map((c) => (
            <div key={c.label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: C.gold }}>{c.label}</div>
              <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 34, color: C.ink, lineHeight: 1.1, marginTop: 6 }}>{c.value}</div>
              {c.hint && <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{c.hint}</div>}
            </div>
          ))}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24 }}>
          <h3 style={{ fontFamily: font.display, fontWeight: 700, fontSize: 17, margin: "0 0 14px", color: C.ink }}>Recent games</h3>
          {stats && stats.recent.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.gold, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                  <th style={{ padding: "6px 8px" }}>Winner</th>
                  <th style={{ padding: "6px 8px" }}>Players</th>
                  <th style={{ padding: "6px 8px" }}>Duration</th>
                  <th style={{ padding: "6px 8px" }}>Ended</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((g, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                    <td style={{ padding: "9px 8px", fontWeight: 700, color: C.ink }}>{g.winner}</td>
                    <td style={{ padding: "9px 8px", color: "#5B4A34" }}>{g.players}</td>
                    <td style={{ padding: "9px 8px", color: "#5B4A34" }}>{fmtDuration(g.durationMs)}</td>
                    <td style={{ padding: "9px 8px", color: C.muted }}>{fmtAgo(g.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: C.muted, fontWeight: 600, fontSize: 13 }}>No completed games yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
