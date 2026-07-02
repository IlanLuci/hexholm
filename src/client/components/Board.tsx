import {
  HEX_COUNT,
  hexPixel,
  hexVertices,
  vertexPixel,
  edgeVertices,
  EDGE_COUNT,
  VERTEX_COUNT,
} from "../../shared/board";
import type { GameView } from "../../server/protocol";
import { TILE } from "../theme";

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

const CENTER = 300;

function hexPolygon(h: number): string {
  return hexVertices(h)
    .map((v) => {
      const p = vertexPixel(v);
      return `${p.x},${p.y}`;
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
  const seatColor = (id: number) => view.seats[id]?.color ?? "#888";

  return (
    <svg viewBox="0 0 600 600" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <filter id="hhShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* hexes */}
      {Array.from({ length: HEX_COUNT }, (_, h) => {
        const tile = view.board.tiles[h]!;
        const legal = mode === "robber" && legalHexes.has(h);
        return (
          <polygon
            key={`hex-${h}`}
            points={hexPolygon(h)}
            fill={TILE[tile.terrain]}
            stroke="rgba(20,32,38,.25)"
            strokeWidth={2}
            style={{ cursor: legal ? "pointer" : "default", opacity: legal ? 0.9 : 1 }}
            onClick={legal ? () => onHex(h) : undefined}
          />
        );
      })}

      {/* number tokens */}
      {Array.from({ length: HEX_COUNT }, (_, h) => {
        const tile = view.board.tiles[h]!;
        if (tile.num == null) return null;
        const p = hexPixel(h);
        const hot = tile.num === 6 || tile.num === 8;
        const pips = 6 - Math.abs(7 - tile.num);
        return (
          <g key={`tok-${h}`} filter="url(#hhShadow)" pointerEvents="none">
            <circle cx={p.x} cy={p.y} r={17} fill="#F1E7CE" stroke="rgba(0,0,0,.15)" />
            <text
              x={p.x}
              y={p.y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="'Zilla Slab', serif"
              fontWeight={700}
              fontSize={17}
              fill={hot ? "#B4402B" : "#3A2E1E"}
            >
              {tile.num}
            </text>
            <g>
              {Array.from({ length: pips }, (_, i) => (
                <circle
                  key={i}
                  cx={p.x - (pips - 1) * 2 + i * 4}
                  cy={p.y + 11}
                  r={1.3}
                  fill={hot ? "#B4402B" : "#7A6A50"}
                />
              ))}
            </g>
          </g>
        );
      })}

      {/* ports */}
      {view.board.ports.map((port, i) => {
        const a = vertexPixel(port.vertices[0]);
        const b = vertexPixel(port.vertices[1]);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = mx - CENTER;
        const dy = my - CENTER;
        const len = Math.hypot(dx, dy) || 1;
        const px = mx + (dx / len) * 22;
        const py = my + (dy / len) * 22;
        const label = port.type === "any" ? "3:1" : "2:1";
        return (
          <g key={`port-${i}`} pointerEvents="none">
            <line x1={a.x} y1={a.y} x2={px} y2={py} stroke="rgba(32,50,60,.4)" strokeWidth={2} strokeDasharray="3 3" />
            <line x1={b.x} y1={b.y} x2={px} y2={py} stroke="rgba(32,50,60,.4)" strokeWidth={2} strokeDasharray="3 3" />
            <rect x={px - 15} y={py - 10} width={30} height={20} rx={5} fill="#1A2A32" opacity={0.92} />
            <text x={px} y={py + 1} textAnchor="middle" dominantBaseline="central" fontSize={9.5} fontWeight={800} fill={port.type === "any" ? "#F4ECDD" : TILE[port.type]}>
              {label}
            </text>
          </g>
        );
      })}

      {/* roads */}
      {view.seats.flatMap((seat) =>
        seat.buildings.roads.map((e) => {
          const [va, vb] = edgeVertices(e);
          const a = vertexPixel(va);
          const b = vertexPixel(vb);
          return (
            <line
              key={`road-${seat.id}-${e}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={seat.color}
              strokeWidth={8}
              strokeLinecap="round"
              filter="url(#hhShadow)"
            />
          );
        }),
      )}

      {/* legal edge targets */}
      {mode === "road" &&
        Array.from({ length: EDGE_COUNT }, (_, e) => e)
          .filter((e) => legalEdges.has(e))
          .map((e) => {
            const [va, vb] = edgeVertices(e);
            const a = vertexPixel(va);
            const b = vertexPixel(vb);
            return (
              <line
                key={`le-${e}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(255,255,255,.55)"
                strokeWidth={10}
                strokeLinecap="round"
                style={{ cursor: "pointer" }}
                onClick={() => onEdge(e)}
              >
                <animate attributeName="stroke-opacity" values="0.3;0.7;0.3" dur="1.4s" repeatCount="indefinite" />
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
              <circle
                key={`lv-${v}`}
                cx={p.x}
                cy={p.y}
                r={9}
                fill="rgba(255,255,255,.72)"
                stroke="rgba(255,255,255,.95)"
                strokeWidth={2}
                style={{ cursor: "pointer" }}
                onClick={() => onVertex(v)}
              >
                <animate attributeName="r" values="7;10;7" dur="1.3s" repeatCount="indefinite" />
              </circle>
            );
          })}

      {/* robber */}
      <Robber x={hexPixel(view.robberHex).x} y={hexPixel(view.robberHex).y} />
    </svg>
  );
}

function Settlement({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <path
      d={`M ${x - 8} ${y + 6} L ${x - 8} ${y - 2} L ${x} ${y - 9} L ${x + 8} ${y - 2} L ${x + 8} ${y + 6} Z`}
      fill={color}
      stroke="#fff"
      strokeWidth={1.6}
      filter="url(#hhShadow)"
    />
  );
}

function City({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <path
      d={`M ${x - 11} ${y + 7} L ${x - 11} ${y - 2} L ${x - 4} ${y - 8} L ${x + 2} ${y - 2} L ${x + 2} ${y - 5} L ${x + 11} ${y - 5} L ${x + 11} ${y + 7} Z`}
      fill={color}
      stroke="#fff"
      strokeWidth={1.6}
      filter="url(#hhShadow)"
    />
  );
}

function Robber({ x, y }: { x: number; y: number }) {
  return (
    <g pointerEvents="none" filter="url(#hhShadow)">
      <ellipse cx={x} cy={y + 7} rx={9} ry={6} fill="#20323C" />
      <circle cx={x} cy={y - 3} r={6} fill="#20323C" />
      <path d={`M ${x - 8} ${y + 8} Q ${x} ${y - 6} ${x + 8} ${y + 8}`} fill="#20323C" />
    </g>
  );
}
