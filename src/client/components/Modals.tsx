import { useState } from "react";
import { C, RES_NAME, RES_ORDER, font } from "../theme";
import { ResIcon } from "./icons";
import { tradeRatio } from "../../shared/legal";
import type { Resource, Hand } from "../../shared/types";
import type { Action } from "../../shared/actions";
import type { GameView } from "../../server/protocol";

type Send = (a: Action) => void;
const zero = (): Record<Resource, number> => ({ brick: 0, wood: 0, sheep: 0, wheat: 0, ore: 0 });

function Shell({ children, onClose, width = 460, z = 60 }: { children: React.ReactNode; onClose?: () => void; width?: number; z?: number }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: z, background: "rgba(20,32,38,.8)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, borderRadius: 10, width, maxWidth: "100%", boxShadow: "0 30px 80px rgba(0,0,0,.5)" }}>
        {children}
      </div>
    </div>
  );
}

function Title({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 26px 0" }}>
      <h2 style={{ fontFamily: font.display, fontWeight: 700, fontSize: 23, margin: 0, color: C.ink }}>{children}</h2>
      {onClose && <span onClick={onClose} style={{ cursor: "pointer", color: C.gold, fontSize: 24, lineHeight: 1 }}>×</span>}
    </div>
  );
}

function Stepper({ value, onDec, onInc }: { value: number; onDec: () => void; onInc: () => void }) {
  const btn: React.CSSProperties = { width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel, cursor: "pointer", fontWeight: 800, color: C.ink };
  return (
    <>
      <button onClick={onDec} style={btn}>−</button>
      <span style={{ width: 20, textAlign: "center", fontWeight: 800, color: C.ink }}>{value}</span>
      <button onClick={onInc} style={btn}>+</button>
    </>
  );
}

const primary: React.CSSProperties = { background: C.terracotta, border: "none", color: "#FBF3E4", fontFamily: font.body, fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 6, cursor: "pointer" };
const green: React.CSSProperties = { background: C.green, border: "none", color: C.cream, fontFamily: font.body, fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 6, cursor: "pointer" };
const outline: React.CSSProperties = { flex: 1, background: "transparent", border: `1px solid ${C.border}`, color: "#6B5A42", fontFamily: font.body, fontWeight: 700, fontSize: 14, padding: 12, borderRadius: 6, cursor: "pointer" };

export function DiscardModal({ view, send }: { view: GameView; send: Send }) {
  const need = view.pendingDiscards[view.youSeat] ?? 0;
  const have = view.seats[view.youSeat]!.resources!;
  const [sel, setSel] = useState(zero());
  const total = RES_ORDER.reduce((s, r) => s + sel[r], 0);
  return (
    <Shell z={70}>
      <Title>The robber strikes</Title>
      <div style={{ padding: "8px 26px 26px" }}>
        <p style={{ color: C.muted, fontWeight: 600, margin: "0 0 16px", fontSize: 13 }}>You hold too many cards — discard {need}.</p>
        {RES_ORDER.map((r) => (
          <div key={r} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
            <span style={{ background: C.panelAlt, borderRadius: 6, padding: 4, display: "inline-flex" }}><ResIcon res={r} size={16} /></span>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: "#3B2E1E", flex: 1 }}>{RES_NAME[r]}</span>
            <span style={{ fontSize: 11.5, color: C.gold, fontWeight: 600, marginRight: 2 }}>have {have[r]}</span>
            <Stepper value={sel[r]} onDec={() => setSel({ ...sel, [r]: Math.max(0, sel[r] - 1) })} onInc={() => total < need && sel[r] < have[r] && setSel({ ...sel, [r]: sel[r] + 1 })} />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <span style={{ fontWeight: 700, color: "#6B5A42", fontSize: 13 }}>{total} / {need} chosen</span>
          <button onClick={() => total === need && send({ type: "discard", hand: sel })} style={{ ...primary, opacity: total === need ? 1 : 0.5 }}>Discard</button>
        </div>
      </div>
    </Shell>
  );
}

export function StealModal({ view, send }: { view: GameView; send: Send }) {
  const candidates = view.steal?.candidates ?? [];
  return (
    <Shell z={70} width={400}>
      <Title>Steal a resource</Title>
      <div style={{ padding: "8px 26px 26px" }}>
        <p style={{ color: C.muted, fontWeight: 600, margin: "0 0 18px", fontSize: 13 }}>Take one hidden card from a blocked rival.</p>
        {candidates.map((id) => {
          const t = view.seats[id]!;
          return (
            <button key={id} onClick={() => send({ type: "moveRobber", hex: view.robberHex, steal: id })} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: 12, marginBottom: 9, border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, cursor: "pointer", fontFamily: font.body, textAlign: "left" }}>
              <div style={{ width: 36, height: 36, borderRadius: 6, background: t.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: font.display, fontSize: 15 }}>{t.name.slice(0, 1)}</div>
              <span style={{ fontWeight: 700, fontSize: 14.5, color: C.ink, flex: 1 }}>{t.name}</span>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{t.handCount} cards</span>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}

export function TradeModal({ view, send, onClose }: { view: GameView; send: Send; onClose: () => void }) {
  const [tab, setTab] = useState<"bank" | "players">("bank");
  const me = view.seats[view.youSeat]!;
  const hand = me.resources!;
  const [give, setGive] = useState<Resource>("brick");
  const [get, setGet] = useState<Resource>("wheat");
  const [offGive, setOffGive] = useState(zero());
  const [offGet, setOffGet] = useState(zero());
  const ratio = tradeRatio(view, view.youSeat, give);
  const proposed = view.trade && view.trade.from === view.youSeat;

  const tabBtn = (t: "bank" | "players"): React.CSSProperties => ({ flex: 1, padding: "10px", border: "none", borderRadius: 6, background: tab === t ? C.panel : "transparent", color: tab === t ? C.ink : C.muted, fontWeight: 700, fontFamily: font.body, cursor: "pointer", boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,.1)" : "none" });
  const chip = (on: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 5, padding: "8px 11px", border: `1px solid ${on ? C.terracotta : C.border}`, background: on ? "#F5E3D5" : C.panel, borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 12.5, color: C.ink });

  return (
    <Shell width={480} onClose={onClose}>
      <Title onClose={onClose}>Trade</Title>
      <div style={{ display: "flex", gap: 5, background: C.panelAlt, padding: 5, borderRadius: 8, margin: "16px 26px 0" }}>
        <button onClick={() => setTab("bank")} style={tabBtn("bank")}>Bank &amp; Harbor</button>
        <button onClick={() => setTab("players")} style={tabBtn("players")}>Offer to players</button>
      </div>

      {tab === "bank" ? (
        <div style={{ padding: "18px 26px 24px" }}>
          <Label>You give ({ratio}:1)</Label>
          <Row>{RES_ORDER.map((r) => <button key={r} onClick={() => setGive(r)} style={chip(give === r)}><ResIcon res={r} size={14} />{RES_NAME[r]}<span style={{ opacity: 0.5, fontSize: 11 }}>{hand[r]}</span></button>)}</Row>
          <div style={{ height: 22 }} />
          <Label>You receive</Label>
          <Row>{RES_ORDER.map((r) => <button key={r} onClick={() => setGet(r)} style={chip(get === r)}><ResIcon res={r} size={14} />{RES_NAME[r]}</button>)}</Row>
          <div style={{ marginTop: 18, padding: "12px 14px", background: C.panelAlt, borderRadius: 6, textAlign: "center", fontWeight: 700, fontSize: 13, color: "#6B5A42" }}>
            Give {ratio} {RES_NAME[give]} → 1 {RES_NAME[get]}
          </div>
          <button onClick={() => send({ type: "bankTrade", give, get })} style={{ ...primary, width: "100%", marginTop: 14, opacity: hand[give] >= ratio ? 1 : 0.5 }}>Confirm trade</button>
        </div>
      ) : (
        <div style={{ padding: "18px 26px 24px" }}>
          {proposed ? (
            (() => {
              const trade = view.trade!;
              const summ = (h: typeof trade.give) =>
                RES_ORDER.filter((r) => h[r]).map((r) => `${h[r]} ${RES_NAME[r]}`).join(", ") || "nothing";
              const responders = Object.entries(trade.responses);
              const anyPending = responders.some(([, r]) => r === "pending");
              const anyAccepted = responders.some(([, r]) => r === "accept");
              return (
                <>
                  <div style={{ padding: "12px 14px", background: C.panelAlt, borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#5B4A34", lineHeight: 1.5, marginBottom: 12 }}>
                    You give <b style={{ color: C.ink }}>{summ(trade.give)}</b> for <b style={{ color: C.ink }}>{summ(trade.get)}</b>.
                  </div>
                  {responders.map(([id, r]) => {
                    const seat = view.seats[+id]!;
                    return (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderSoft}` }}>
                        <div style={{ width: 26, height: 26, borderRadius: 5, background: seat.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontFamily: font.display, fontSize: 12 }}>{seat.name.slice(0, 1)}</div>
                        <span style={{ fontWeight: 700, color: C.ink, flex: 1 }}>{seat.name}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: r === "accept" ? C.green : r === "reject" ? "#A2854F" : C.muted }}>{r === "accept" ? "Accepted" : r === "reject" ? "Declined" : "Thinking…"}</span>
                        {r === "accept" && <button onClick={() => send({ type: "confirmTrade", withSeat: +id })} style={{ ...green, padding: "8px 14px", fontSize: 12.5 }}>Trade</button>}
                      </div>
                    );
                  })}
                  {!anyPending && !anyAccepted && (
                    <div style={{ textAlign: "center", color: C.muted, fontWeight: 600, fontSize: 13, margin: "16px 0 4px" }}>Everyone passed on this offer.</div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button onClick={() => send({ type: "cancelTrade" })} style={outline}>Adjust offer</button>
                    <button onClick={onClose} style={outline}>Close</button>
                  </div>
                </>
              );
            })()
          ) : (
            <>
              <Label>You give</Label>
              {RES_ORDER.map((r) => (
                <OfferRow key={r} res={r} value={offGive[r]} max={hand[r]} onDec={() => setOffGive({ ...offGive, [r]: Math.max(0, offGive[r] - 1) })} onInc={() => offGive[r] < hand[r] && setOffGive({ ...offGive, [r]: offGive[r] + 1 })} />
              ))}
              <div style={{ height: 1, background: C.borderSoft, margin: "12px 0" }} />
              <Label>You receive</Label>
              {RES_ORDER.map((r) => (
                <OfferRow key={r} res={r} value={offGet[r]} max={99} onDec={() => setOffGet({ ...offGet, [r]: Math.max(0, offGet[r] - 1) })} onInc={() => setOffGet({ ...offGet, [r]: offGet[r] + 1 })} />
              ))}
              {(() => {
                const canSend = RES_ORDER.some((r) => offGive[r]) && RES_ORDER.some((r) => offGet[r]);
                return (
                  <>
                    <button
                      onClick={() => canSend && send({ type: "proposeTrade", give: offGive, get: offGet })}
                      disabled={!canSend}
                      style={{ ...green, width: "100%", marginTop: 14, opacity: canSend ? 1 : 0.5, cursor: canSend ? "pointer" : "not-allowed" }}
                    >
                      Send offer to table
                    </button>
                    {!canSend && (
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: C.muted, fontWeight: 600, textAlign: "center" }}>
                        Pick at least one resource to give and one to receive.
                      </p>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      )}
    </Shell>
  );
}

function OfferRow({ res, value, max, onDec, onInc }: { res: Resource; value: number; max: number; onDec: () => void; onInc: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
      <span style={{ background: C.panelAlt, borderRadius: 6, padding: 4, display: "inline-flex" }}><ResIcon res={res} size={16} /></span>
      <span style={{ fontWeight: 700, fontSize: 13.5, color: "#3B2E1E", flex: 1 }}>
        {RES_NAME[res]}
        {max !== 99 && <span style={{ color: C.muted, fontSize: 11 }}> ({max})</span>}
      </span>
      <Stepper value={value} onDec={onDec} onInc={onInc} />
    </div>
  );
}

export function DevModal({ view, send, onClose, onKnight, onPlenty, onMono }: { view: GameView; send: Send; onClose: () => void; onKnight: () => void; onPlenty: () => void; onMono: () => void }) {
  const me = view.seats[view.youSeat]!;
  const playable = me.devCards ?? [];
  const pending = me.newDevCards ?? [];
  const counts: Record<string, number> = {};
  for (const c of playable) counts[c] = (counts[c] ?? 0) + 1;
  for (const c of pending) counts[c + "_new"] = (counts[c + "_new"] ?? 0) + 1;
  const meta: Record<string, { name: string; desc: string; play?: () => void }> = {
    knight: { name: "Knight", desc: "Move the robber and steal.", play: () => { onClose(); onKnight(); } },
    road: { name: "Road Building", desc: "Place 2 roads for free.", play: () => send({ type: "playRoadBuilding" }) },
    plenty: { name: "Year of Plenty", desc: "Take any 2 from the bank.", play: () => { onClose(); onPlenty(); } },
    mono: { name: "Monopoly", desc: "Name a resource; rivals hand it over.", play: () => { onClose(); onMono(); } },
    vp: { name: "Victory Point", desc: "Worth 1 point. Kept secret.", },
  };
  return (
    <Shell onClose={onClose}>
      <Title onClose={onClose}>Development cards</Title>
      <div style={{ padding: "8px 26px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "12px 0 8px", padding: 14, background: C.panelAlt, borderRadius: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>Buy a card</div>
            <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>1 Wool · 1 Grain · 1 Ore · {view.devDeckCount} left</div>
          </div>
          <button onClick={() => send({ type: "buyDev" })} style={{ ...primary, padding: "11px 18px", fontSize: 13 }}>Buy card</button>
        </div>
        {(["knight", "road", "plenty", "mono", "vp"] as const).map((k) => {
          const n = counts[k] ?? 0;
          const nNew = counts[k + "_new"] ?? 0;
          if (n + nNew === 0) return null;
          const m = meta[k]!;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: `1px solid ${C.borderSoft}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 500 }}>{m.desc}{nNew > 0 && ` · ${nNew} bought this turn`}</div>
              </div>
              <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 17, color: "#6B5A42", minWidth: 16, textAlign: "center" }}>{n + nNew}</span>
              {m.play && n > 0 && <button onClick={m.play} style={{ ...green, padding: "8px 14px", fontSize: 12.5 }}>Play</button>}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

export function PlentyModal({ view, send, onClose }: { view: GameView; send: Send; onClose: () => void }) {
  const [picks, setPicks] = useState<Resource[]>([]);
  const add = (r: Resource) => picks.length < 2 && setPicks([...picks, r]);
  return (
    <Shell width={440} onClose={onClose} z={70}>
      <Title onClose={onClose}>Year of Plenty</Title>
      <div style={{ padding: "8px 26px 26px" }}>
        <p style={{ color: C.muted, fontWeight: 600, margin: "0 0 16px", fontSize: 13 }}>Take any 2 resources from the bank.</p>
        <Row>{RES_ORDER.map((r) => <button key={r} onClick={() => add(r)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 6px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.panel, cursor: "pointer" }}><ResIcon res={r} size={18} /><span style={{ fontSize: 10.5, fontWeight: 700, color: "#4A3B29" }}>{RES_NAME[r]}</span><span style={{ fontWeight: 700, color: C.green }}>{picks.filter((p) => p === r).length}</span></button>)}</Row>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <span style={{ fontWeight: 700, color: "#6B5A42", fontSize: 13 }}>{picks.length} / 2 · <button onClick={() => setPicks([])} style={{ border: "none", background: "none", color: C.gold, cursor: "pointer", fontWeight: 700 }}>reset</button></span>
          <button onClick={() => picks.length === 2 && send({ type: "playYearOfPlenty", picks: [picks[0]!, picks[1]!] })} style={{ ...primary, opacity: picks.length === 2 ? 1 : 0.5 }}>Collect</button>
        </div>
      </div>
    </Shell>
  );
}

export function MonoModal({ send, onClose }: { send: Send; onClose: () => void }) {
  return (
    <Shell width={440} onClose={onClose} z={70}>
      <Title onClose={onClose}>Monopoly</Title>
      <div style={{ padding: "8px 26px 26px" }}>
        <p style={{ color: C.muted, fontWeight: 600, margin: "0 0 16px", fontSize: 13 }}>Choose a resource — every rival hands you all they hold.</p>
        <Row>{RES_ORDER.map((r) => <button key={r} onClick={() => send({ type: "playMonopoly", resource: r })} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 6px", border: `1px solid ${C.border}`, borderRadius: 7, background: C.panel, cursor: "pointer" }}><ResIcon res={r} size={18} /><span style={{ fontSize: 10.5, fontWeight: 700, color: "#4A3B29" }}>{RES_NAME[r]}</span></button>)}</Row>
      </div>
    </Shell>
  );
}

export function WinModal({ view, onPlayAgain }: { view: GameView; onPlayAgain: () => void }) {
  const w = view.seats[view.winner!]!;
  return (
    <Shell z={80}>
      <div style={{ padding: "42px 46px", textAlign: "center", animation: "hhpop .4s ease" }}>
        <div style={{ width: 64, height: 72, margin: "0 auto", background: w.color, clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)", display: "flex", alignItems: "center", justifyContent: "center", animation: "hhfloat 2.4s ease-in-out infinite" }}>
          <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 28, color: "#fff" }}>{w.name.slice(0, 1)}</span>
        </div>
        <h2 style={{ fontFamily: font.display, fontWeight: 700, fontSize: 30, margin: "18px 0 4px", color: C.ink }}>{w.name} wins</h2>
        <p style={{ color: C.muted, fontWeight: 600, margin: "0 0 26px" }}>Ten victory points claimed. The island is settled.</p>
        <button onClick={onPlayAgain} style={{ ...primary, padding: "14px 30px" }}>Back to lobby</button>
      </div>
    </Shell>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  const rules = [
    "On your turn, roll the dice. Every settlement or city on a hex with that number produces resources.",
    "Spend resources to build roads, settlements and cities, or to buy development cards.",
    "Roll a 7 (or play a Knight) to move the robber, block a hex and steal a card. Holding 8+ cards means discarding half.",
    "Trade with the bank (4:1, or better at harbors) or negotiate directly with other players.",
    "First to 10 victory points on their turn wins. Longest road and largest army are worth 2 each.",
  ];
  return (
    <Shell width={520} onClose={onClose} z={70}>
      <Title onClose={onClose}>How to play</Title>
      <div style={{ padding: "10px 30px 30px" }}>
        {rules.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 14, marginBottom: 15 }}>
            <div style={{ width: 26, height: 26, borderRadius: 4, background: "#EEDFBB", color: "#8A6D34", fontFamily: font.display, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
            <div style={{ fontSize: 13.5, color: "#4A3B29", fontWeight: 500, lineHeight: 1.55 }}>{t}</div>
          </div>
        ))}
        <button onClick={onClose} style={{ ...green, width: "100%", marginTop: 6 }}>Got it</button>
      </div>
    </Shell>
  );
}

export function TradeOfferPrompt({ view, send }: { view: GameView; send: Send }) {
  const trade = view.trade!;
  const from = view.seats[trade.from]!;
  const summary = (h: typeof trade.give) => RES_ORDER.filter((r) => h[r]).map((r) => `${h[r]} ${RES_NAME[r]}`).join(", ") || "nothing";
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 90, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, width: 300, boxShadow: "0 20px 50px rgba(0,0,0,.35)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 800, color: C.ink }}>{from.name} offers a trade</span>
        <span onClick={() => send({ type: "respondTrade", accept: false })} title="Dismiss (decline)" style={{ cursor: "pointer", color: C.gold, fontSize: 20, lineHeight: 1 }}>×</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, lineHeight: 1.5 }}>They give <b style={{ color: C.ink }}>{summary(trade.give)}</b> for your <b style={{ color: C.ink }}>{summary(trade.get)}</b>.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => send({ type: "respondTrade", accept: true })} style={{ ...green, flex: 1, fontSize: 13, padding: 10 }}>Accept</button>
        <button onClick={() => send({ type: "respondTrade", accept: false })} style={{ flex: 1, background: "transparent", border: `1px solid ${C.border}`, color: "#6B5A42", fontWeight: 700, borderRadius: 6, cursor: "pointer", fontFamily: font.body }}>Decline</button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: C.gold, margin: "0 0 9px" }}>{children}</div>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{children}</div>;
}

export type { Hand };
