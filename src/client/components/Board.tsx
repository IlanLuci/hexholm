import {
  HEX_COUNT,
  VERTEX_COUNT,
  EDGE_COUNT,
  hexPixel,
  hexVertices,
  vertexPixel,
  edgeVertices,
} from "../../shared/board";
import type { GameView } from "../../server/protocol";
import { TILE } from "../theme";
import { TileGlyph, shade } from "./icons";

export type Mode = "road" | "settlement" | "city" | "robber" | null;

interface Props {
  view: GameView;
  mode: Mode;
  legalVertices: Set<number>;
  legalEdges: Set<number>;
  legalHexes: Set<number>;
  onVertex: (v: number) => void;
  onEdge: (e: number) => void;
  onHex: (h: number) => void;
}

// board bounds + centre, derived once from the shared projection
const VP = Array.from({ length: VERTEX_COUNT }, (_, v) => vertexPixel(v));
const CENTER = (() => {
  let x = 0,
    y = 0;
  for (let h = 0; h < HEX_COUNT; h++) {
    const p = hexPixel(h);
    x += p.x;
    y += p.y;
  }
  return { x: x / HEX_COUNT, y: y / HEX_COUNT };
})();
const BOUNDS = (() => {
  const xs = VP.map((p) => p.x),
    ys = VP.map((p) => p.y);
  const pad = 30;
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + pad * 2,
    h: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
})();

function hexPoints(h: number): string {
  return hexVertices(h)
    .map((v) => {
      const p = vertexPixel(v);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
}

export function Board({
  view,
  mode,
  legalVertices,
  legalEdges,
  legalHexes,
  onVertex,
  onEdge,
  onHex,
}: Props) {
  return (
    <svg viewBox="0 0 600 600" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id="hhwater" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#37606F" />
          <stop offset="100%" stopColor="#223f4b" />
        </linearGradient>
        <filter id="hhShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.32" />
        </filter>
      </defs>

      {/* water */}
      <rect x={BOUNDS.x} y={BOUNDS.y} width={BOUNDS.w} height={BOUNDS.h} rx={12} fill="url(#hhwater)" />

      {/* ports — one harbor badge per port with two dock lines to its entry spots */}
      {view.board.ports.map((port, pi) => {
        const a = vertexPixel(port.vertices[0]);
        const b = vertexPixel(port.vertices[1]);
        const mx = (a.x + b.x) / 2,
          my = (a.y + b.y) / 2;
        const dx = mx - CENTER.x,
          dy = my - CENTER.y;
        const L = Math.hypot(dx, dy) || 1;
        const ox = mx + (dx / L) * 26,
          oy = my + (dy / L) * 26;
        return (
          <g key={`port-${pi}`} pointerEvents="none">
            <line x1={a.x} y1={a.y} x2={ox} y2={oy} stroke="rgba(243,231,205,.5)" strokeWidth={2} strokeDasharray="2 2.5" />
            <line x1={b.x} y1={b.y} x2={ox} y2={oy} stroke="rgba(243,231,205,.5)" strokeWidth={2} strokeDasharray="2 2.5" />
            <circle cx={ox} cy={oy} r={13} fill="#1B2C34" stroke="rgba(243,231,205,.85)" strokeWidth={1.5} />
            {port.type === "any" ? (
              <text x={ox} y={oy} textAnchor="middle" dominantBaseline="central" fontFamily="Manrope" fontWeight={800} fontSize={10} fill="#F3E7CD">
                3:1
              </text>
            ) : (
              <g transform={`translate(${ox - 8} ${oy - 8}) scale(.66)`}>
                <TileGlyph name={port.type} c="#F3E7CD" c2="rgba(0,0,0,.3)" />
              </g>
            )}
          </g>
        );
      })}

      {/* hexes */}
      {Array.from({ length: HEX_COUNT }, (_, h) => {
        const tile = view.board.tiles[h]!;
        const legal = mode === "robber" && legalHexes.has(h);
        return (
          <polygon
            key={`hex-${h}`}
            points={hexPoints(h)}
            fill={TILE[tile.terrain]}
            stroke="rgba(28,20,10,.32)"
            strokeWidth={2}
            style={{ cursor: legal ? "pointer" : "default", opacity: legal ? 0.85 : 1, filter: legal ? "brightness(1.1)" : undefined }}
            onClick={legal ? () => onHex(h) : undefined}
          />
        );
      })}

      {/* embossed terrain glyph on each hex */}
      {Array.from({ length: HEX_COUNT }, (_, h) => {
        const tile = view.board.tiles[h]!;
        const p = hexPixel(h);
        const scl = 1.25;
        const gx = p.x - 12 * scl;
        const gy = p.y - 22 - 12 * scl;
        return (
          <g key={`glyph-${h}`} transform={`translate(${gx.toFixed(1)} ${gy.toFixed(1)}) scale(${scl})`} opacity={0.92} pointerEvents="none">
            <TileGlyph name={tile.terrain} c={shade(TILE[tile.terrain], -40)} c2={shade(TILE[tile.terrain], -64)} />
          </g>
        );
      })}

      {/* number tokens — number sits high, pips just below, both inside the disc */}
      {Array.from({ length: HEX_COUNT }, (_, h) => {
        const tile = view.board.tiles[h]!;
        if (tile.num == null) return null;
        const p = hexPixel(h);
        const cy = p.y;
        const hot = tile.num === 6 || tile.num === 8;
        const dots = 6 - Math.abs(7 - tile.num);
        return (
          <g key={`tok-${h}`} pointerEvents="none">
            <circle cx={p.x} cy={cy} r={16} fill="#E4D2A8" filter="url(#hhShadow)" />
            <circle cx={p.x} cy={cy} r={13.6} fill="#F6ECD4" stroke={hot ? "rgba(176,48,31,.4)" : "rgba(0,0,0,.1)"} strokeWidth={1} />
            <text x={p.x} y={cy - 4.5} textAnchor="middle" dominantBaseline="central" fontFamily="'Zilla Slab', serif" fontWeight={700} fontSize={tile.num >= 10 ? 13 : 15} fill={hot ? "#B0301F" : "#33251A"}>
              {tile.num}
            </text>
            {Array.from({ length: dots }, (_, d) => (
              <circle key={d} cx={p.x - (dots - 1) * 1.8 + d * 3.6} cy={cy + 5.5} r={1.05} fill={hot ? "#B0301F" : "#8A795E"} />
            ))}
          </g>
        );
      })}

      {/* roads */}
      {view.seats.flatMap((seat) =>
        seat.buildings.roads.map((e) => {
          const [va, vb] = edgeVertices(e);
          const a = vertexPixel(va),
            b = vertexPixel(vb);
          const mx = (a.x + b.x) / 2,
            my = (a.y + b.y) / 2;
          const ix1 = a.x + (mx - a.x) * 0.16,
            iy1 = a.y + (my - a.y) * 0.16;
          const ix2 = b.x + (mx - b.x) * 0.16,
            iy2 = b.y + (my - b.y) * 0.16;
          return (
            <g key={`road-${seat.id}-${e}`} className="hh-appear">
              <line x1={ix1} y1={iy1} x2={ix2} y2={iy2} stroke="rgba(0,0,0,.4)" strokeWidth={9} strokeLinecap="round" />
              <line x1={ix1} y1={iy1} x2={ix2} y2={iy2} stroke={seat.color} strokeWidth={5.5} strokeLinecap="round" />
            </g>
          );
        }),
      )}

      {/* legal road targets */}
      {mode === "road" &&
        Array.from({ length: EDGE_COUNT }, (_, e) => e)
          .filter((e) => legalEdges.has(e))
          .map((e) => {
            const [va, vb] = edgeVertices(e);
            const a = vertexPixel(va),
              b = vertexPixel(vb);
            return (
              <line key={`le-${e}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,.5)" strokeWidth={10} strokeLinecap="round" style={{ cursor: "pointer" }} onClick={() => onEdge(e)}>
                <animate attributeName="stroke-opacity" values="0.28;0.7;0.28" dur="1.4s" repeatCount="indefinite" />
              </line>
            );
          })}

      {/* settlements + cities */}
      {view.seats.flatMap((seat) => [
        ...seat.buildings.settlements.map((v) => {
          const p = vertexPixel(v);
          return <Settlement key={`s-${seat.id}-${v}`} x={p.x} y={p.y} color={seat.color} />;
        }),
        ...seat.buildings.cities.map((v) => {
          const p = vertexPixel(v);
          return <City key={`c-${seat.id}-${v}`} x={p.x} y={p.y} color={seat.color} />;
        }),
      ])}

      {/* legal vertex targets */}
      {(mode === "settlement" || mode === "city") &&
        Array.from({ length: VERTEX_COUNT }, (_, v) => v)
          .filter((v) => legalVertices.has(v))
          .map((v) => {
            const p = vertexPixel(v);
            return (
              <circle key={`lv-${v}`} cx={p.x} cy={p.y} r={9} fill="rgba(255,255,255,.72)" stroke="rgba(255,255,255,.95)" strokeWidth={2} style={{ cursor: "pointer" }} onClick={() => onVertex(v)}>
                <animate attributeName="r" values="7;10;7" dur="1.3s" repeatCount="indefinite" />
              </circle>
            );
          })}

      {/* robber (slides between hexes) */}
      <Robber x={hexPixel(view.robberHex).x} y={hexPixel(view.robberHex).y} />
    </svg>
  );
}

function Settlement({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g className="hh-appear" filter="url(#hhShadow)">
      <path d={`M ${x - 8} ${y + 6} L ${x - 8} ${y - 2} L ${x} ${y - 9} L ${x + 8} ${y - 2} L ${x + 8} ${y + 6} Z`} fill={color} stroke="#fff" strokeWidth={1.6} />
    </g>
  );
}

function City({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g className="hh-appear" filter="url(#hhShadow)">
      <path d={`M ${x - 11} ${y + 7} L ${x - 11} ${y - 2} L ${x - 4} ${y - 8} L ${x + 2} ${y - 2} L ${x + 2} ${y - 5} L ${x + 11} ${y - 5} L ${x + 11} ${y + 7} Z`} fill={color} stroke="#fff" strokeWidth={1.6} />
    </g>
  );
}

function Robber({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none" filter="url(#hhShadow)" style={{ transform: `translate(${x}px, ${y}px)`, transition: "transform .45s cubic-bezier(.4,1.3,.5,1)" }}>
      <ellipse cx={21} cy={-6} rx={8.5} ry={12} fill="#241B14" />
      <circle cx={21} cy={-15} r={5.5} fill="#241B14" />
    </g>
  );
}
