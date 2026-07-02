import { useEffect } from "react";
import { useGame } from "./net";
import { Landing } from "./screens/Landing";
import { Lobby } from "./screens/Lobby";
import { GameScreen } from "./screens/Game";
import { C } from "./theme";

export function App() {
  const game = useGame();
  const { view, status, error, clearError } = game;

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
