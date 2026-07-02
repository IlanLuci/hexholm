import { useEffect, useRef } from "react";
import { useGame } from "./net";
import { Landing } from "./screens/Landing";
import { Lobby } from "./screens/Lobby";
import { GameScreen } from "./screens/Game";
import { ActionToast } from "./components/ActionToast";
import { C } from "./theme";

export function App() {
  const game = useGame();
  const { view, status, error, clearError } = game;
  const reconnected = useRef(false);

  // Auto-rejoin the last room after a page reload so a refresh never drops you.
  useEffect(() => {
    if (reconnected.current) return;
    reconnected.current = true;
    const room = localStorage.getItem("hexholm:room");
    const name = localStorage.getItem("hexholm:name");
    if (room && name) game.connect(room, name);
  }, [game]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 3200);
    return () => clearTimeout(id);
  }, [error, clearError]);

  let screen;
  if (!view || status === "idle") {
    screen = <Landing connect={game.connect} status={status} />;
  } else if (view.phase === "lobby") {
    screen = <Lobby game={game} view={view} />;
  } else {
    screen = <GameScreen game={game} view={view} />;
  }

  return (
    <div style={{ minHeight: "100%", position: "relative" }}>
      {screen}
      {view && view.phase !== "lobby" && (
        <ActionToast events={game.lastEvents} view={view} />
      )}
      {status === "reconnecting" && (
        <div style={banner}>Reconnecting…</div>
      )}
      {error && (
        <div style={toast} onClick={clearError}>
          {error}
        </div>
      )}
    </div>
  );
}

const banner: React.CSSProperties = {
  position: "fixed",
  top: 14,
  left: "50%",
  transform: "translateX(-50%)",
  background: C.tealDark,
  color: C.cream,
  padding: "8px 16px",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 13,
  zIndex: 200,
};

const toast: React.CSSProperties = {
  position: "fixed",
  bottom: 20,
  left: "50%",
  transform: "translateX(-50%)",
  background: "#7A2E1E",
  color: "#FBEEE4",
  padding: "12px 20px",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 13.5,
  zIndex: 200,
  cursor: "pointer",
  boxShadow: "0 10px 30px rgba(0,0,0,.3)",
};
