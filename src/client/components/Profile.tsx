import { useEffect, useState } from "react";
import { C, font } from "../theme";
import { getPlayerId } from "../identity";
import type { PlayerCareer } from "../../server/protocol";

/** Fetch the viewer's own career stats, refreshing when `refreshKey` changes. */
export function useCareer(refreshKey: unknown): PlayerCareer | null {
  const [career, setCareer] = useState<PlayerCareer | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/player?pid=${getPlayerId()}`)
      .then((r) => r.json())
      .then((c) => live && setCareer(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);
  return career;
}

/** Career-stats popover, anchored to whatever it's rendered inside (needs a
 *  position:relative parent). `align` controls which side it opens toward. */
export function ProfileTooltip({
  career,
  align = "left",
}: {
  career: PlayerCareer | null;
  align?: "left" | "right";
}) {
  const rows: [string, string][] = career
    ? [
        ["Games played", String(career.gamesPlayed)],
        ["Wins", String(career.wins)],
        ["Win rate", career.gamesPlayed ? `${Math.round(career.winRate * 100)}%` : "—"],
        ["Avg. points", career.gamesPlayed ? career.avgVP.toFixed(1) : "—"],
        ["Longest road", String(career.longestRoadHeld)],
        ["Largest army", String(career.largestArmyHeld)],
      ]
    : [];
  return (
    <div
      style={{
        position: "absolute",
        [align]: 0,
        top: "calc(100% + 8px)",
        zIndex: 60,
        width: 220,
        background: C.panel,
        color: C.ink,
        borderRadius: 8,
        padding: "12px 14px",
        boxShadow: "0 16px 40px rgba(0,0,0,.4)",
        border: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 13, color: C.gold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Your career</div>
      {career && career.gamesPlayed > 0 ? (
        rows.map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12.5 }}>
            <span style={{ color: C.muted, fontWeight: 600 }}>{l}</span>
            <span style={{ fontWeight: 800 }}>{v}</span>
          </div>
        ))
      ) : (
        <div style={{ color: C.muted, fontWeight: 600, fontSize: 12.5 }}>No finished games yet — win one to start your record.</div>
      )}
    </div>
  );
}
