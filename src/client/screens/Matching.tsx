// src/client/screens/Matching.tsx
import { C, font } from "../theme";
import { HexLogo } from "../components/icons";
import type { Game } from "../net";
import type { GameView } from "../../server/protocol";

export function Matching({ game, view }: { game: Game; view: GameView }) {
  const humans = view.seats.filter((s) => s.kind === "human").length;
  return (
    <div style={{ minHeight: "100vh", background: C.teal, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", color: C.cream }}>
        <HexLogo size={44} />
        <h1 style={{ fontFamily: font.display, fontWeight: 700, fontSize: 34, margin: "22px 0 8px" }}>
          Finding a match…
        </h1>
        <p style={{ color: "#B9C6BC", fontWeight: 600, fontSize: 15, margin: 0 }}>
          Pairing you with settlers — bots fill any empty seats in a moment.
        </p>
        <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 56, margin: "26px 0 4px", letterSpacing: 2 }}>
          {humans} / 4
        </div>
        <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#8E937F", fontWeight: 700 }}>
          settlers ready
        </div>
        <button
          onClick={game.leave}
          style={{ marginTop: 34, background: "transparent", border: "1px solid rgba(244,236,221,.35)", color: C.cream, fontFamily: font.body, fontWeight: 600, fontSize: 14, padding: "11px 22px", borderRadius: 5, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
