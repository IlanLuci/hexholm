import { useState } from "react";
import { C, font } from "../theme";
import { HexLogo } from "../components/icons";
import { Board, type Mode } from "../components/Board";
import { PlayerRail } from "../components/PlayerRail";
import { ActionBar } from "../components/ActionBar";
import {
  DiscardModal,
  StealModal,
  TradeModal,
  DevModal,
  PlentyModal,
  MonoModal,
  WinModal,
  RulesModal,
  TradeOfferPrompt,
} from "../components/Modals";
import {
  canPlaceSettlement,
  canPlaceRoad,
  canPlaceCity,
  legalRobberHexes,
} from "../../shared/legal";
import { VERTEX_COUNT, EDGE_COUNT } from "../../shared/board";
import type { Game } from "../net";
import type { GameView } from "../../server/protocol";

type ModalKind = "trade" | "dev" | "plenty" | "mono" | "rules" | null;

export function GameScreen({ game, view }: { game: Game; view: GameView }) {
  const { send } = game;
  const [buildMode, setBuildMode] = useState<Mode>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [pendingKnight, setPendingKnight] = useState(false);

  const isMyTurn = view.activeSeat === view.youSeat;
  const inSetup = view.phase === "setup";
  const rolled = view.turn?.hasRolled ?? false;
  const mustRobber = (view.turn?.mustMoveRobber ?? false) || pendingKnight;
  const owesDiscard = view.pendingDiscards[view.youSeat] != null;

  let mode: Mode = null;
  if (inSetup && isMyTurn) mode = view.setup!.step === "settle" ? "settlement" : "road";
  else if (view.phase === "play" && isMyTurn && mustRobber) mode = "robber";
  else if (isMyTurn && rolled) mode = buildMode;

  // legal targets for the active mode
  const legalVertices = new Set<number>();
  const legalEdges = new Set<number>();
  const legalHexes = new Set<number>();
  if (mode === "settlement")
    for (let v = 0; v < VERTEX_COUNT; v++)
      if (canPlaceSettlement(view, view.youSeat, v, { setup: inSetup })) legalVertices.add(v);
  if (mode === "city")
    for (let v = 0; v < VERTEX_COUNT; v++)
      if (canPlaceCity(view, view.youSeat, v)) legalVertices.add(v);
  if (mode === "road")
    for (let e = 0; e < EDGE_COUNT; e++)
      if (canPlaceRoad(view, view.youSeat, e, inSetup ? { mustTouchVertex: view.setup!.lastVertex } : {}))
        legalEdges.add(e);
  if (mode === "robber") for (const h of legalRobberHexes(view)) legalHexes.add(h);

  const onVertex = (v: number) => {
    if (mode === "settlement") send(inSetup ? { type: "placeSettlement", vertex: v } : { type: "buildSettlement", vertex: v });
    else if (mode === "city") send({ type: "buildCity", vertex: v });
    setBuildMode(null);
  };
  const onEdge = (e: number) => {
    if (mode === "road") send(inSetup ? { type: "placeRoad", edge: e } : { type: "buildRoad", edge: e });
    setBuildMode(null);
  };
  const onHex = (h: number) => {
    if (mode !== "robber") return;
    if (pendingKnight) {
      send({ type: "playKnight", hex: h, steal: null });
      setPendingKnight(false);
    } else {
      send({ type: "moveRobber", hex: h, steal: null });
    }
  };

  const active = view.seats[view.activeSeat]!;
  const phaseLabel = inSetup ? "Setup" : view.phase === "finished" ? "Finished" : rolled ? "Build & trade" : "Roll";
  const showTradePrompt =
    view.trade && view.trade.from !== view.youSeat && view.trade.responses[view.youSeat] === "pending";

  return (
    <div style={{ minHeight: "100vh", background: C.teal, display: "flex", flexDirection: "column" }}>
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 22px", background: C.tealDark, borderBottom: "1px solid rgba(255,255,255,.07)", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <HexLogo size={24} />
          <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 17, color: C.cream, letterSpacing: ".5px" }}>HEXHOLM</span>
          <span style={{ fontSize: 11, color: "#7E8F97", fontWeight: 700, letterSpacing: 1 }}>· {view.roomCode}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(0,0,0,.24)", padding: "8px 16px", borderRadius: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: active.color, boxShadow: `0 0 8px ${active.color}` }} />
          <span style={{ color: C.cream, fontWeight: 700, fontSize: 14 }}>{isMyTurn ? "Your turn" : `${active.name}'s turn`}</span>
          <span style={{ color: "#93A2AA", fontWeight: 600, fontSize: 12.5 }}>· {phaseLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setModal("rules")} style={topBtn}>How to play</button>
          <button onClick={game.leave} style={topBtn}>Exit</button>
        </div>
      </div>

      {/* board + rail */}
      <div style={{ flex: 1, display: "flex", gap: 14, padding: 14, alignItems: "stretch", flexWrap: "wrap" }}>
        <PlayerRail view={view} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 300 }}>
          <div style={{ width: "100%", maxWidth: 600, aspectRatio: "1 / 1" }}>
            <Board view={view} mode={mode} legalVertices={legalVertices} legalEdges={legalEdges} legalHexes={legalHexes} onVertex={onVertex} onEdge={onEdge} onHex={onHex} />
          </div>
        </div>
      </div>

      {/* bottom bar */}
      {inSetup ? (
        <div style={{ background: C.tealDark, borderTop: "1px solid rgba(255,255,255,.07)", padding: "16px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "#7E9099" }}>Setup · Round {view.setup!.round}</div>
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 20, color: C.cream, marginTop: 3 }}>
            {isMyTurn ? (view.setup!.step === "settle" ? "Place a settlement" : "Place a connecting road") : `Waiting for ${active.name}`}
          </div>
        </div>
      ) : view.phase === "play" ? (
        <>
          {mode === "robber" && (
            <div style={{ background: "#7A2E1E", color: "#FBEEE4", textAlign: "center", padding: "8px", fontWeight: 700, fontSize: 13 }}>
              {pendingKnight ? "Knight — click a hex to move the robber" : "Move the robber — click a hex"}
            </div>
          )}
          <ActionBar
            view={view}
            isMyTurn={isMyTurn && !mustRobber && !owesDiscard}
            buildMode={buildMode}
            onPickBuild={setBuildMode}
            onRoll={() => send({ type: "rollDice" })}
            onTrade={() => setModal("trade")}
            onDev={() => setModal("dev")}
            onEndTurn={() => { setBuildMode(null); send({ type: "endTurn" }); }}
          />
        </>
      ) : null}

      {/* modals */}
      {owesDiscard && <DiscardModal view={view} send={send} />}
      {view.steal && isMyTurn && <StealModal view={view} send={send} />}
      {modal === "trade" && (
        <TradeModal
          view={view}
          send={send}
          onClose={() => {
            // closing with your own offer still on the table withdraws it
            if (view.trade && view.trade.from === view.youSeat) send({ type: "cancelTrade" });
            setModal(null);
          }}
        />
      )}
      {modal === "dev" && (
        <DevModal
          view={view}
          send={send}
          onClose={() => setModal(null)}
          onKnight={() => setPendingKnight(true)}
          onPlenty={() => setModal("plenty")}
          onMono={() => setModal("mono")}
        />
      )}
      {modal === "plenty" && <PlentyModal view={view} send={send} onClose={() => setModal(null)} />}
      {modal === "mono" && <MonoModal send={send} onClose={() => setModal(null)} />}
      {modal === "rules" && <RulesModal onClose={() => setModal(null)} />}
      {showTradePrompt && <TradeOfferPrompt view={view} send={send} />}
      {view.phase === "finished" && view.winner != null && <WinModal view={view} onPlayAgain={game.leave} />}
    </div>
  );
}

const topBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,.16)",
  color: "#CFDADF",
  fontFamily: font.body,
  fontWeight: 600,
  fontSize: 12.5,
  padding: "8px 15px",
  borderRadius: 4,
  cursor: "pointer",
};
