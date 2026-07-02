import type { Resource, Terrain } from "../../shared/types";
import { CARD } from "../theme";

/** Additively lighten/darken a #rrggbb colour by `amt` per channel (clamped). */
export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, v));
  const r = cl(((n >> 16) & 255) + amt);
  const g = cl(((n >> 8) & 255) + amt);
  const b = cl((n & 255) + amt);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Filled resource/terrain glyph on a 24×24 grid, matching the design prototype.
 *  Rendered as the tile's embossed icon and inside harbor badges. */
export function TileGlyph({ name, c, c2 }: { name: Terrain; c: string; c2: string }) {
  switch (name) {
    case "brick":
      return (
        <>
          <rect x={2.5} y={13} width={8.5} height={6} rx={1} fill={c} />
          <rect x={13} y={13} width={8.5} height={6} rx={1} fill={c} />
          <rect x={7.75} y={5.5} width={8.5} height={6} rx={1} fill={c} />
          <rect x={7.75} y={5.5} width={8.5} height={1.6} rx={0.8} fill={c2} />
        </>
      );
    case "wood":
      return (
        <>
          <path d="M12 3 L18 12 H6 Z" fill={c} />
          <path d="M12 8 L20 19 H4 Z" fill={c} />
          <rect x={10.4} y={18.5} width={3.2} height={3.5} fill={c2} />
        </>
      );
    case "sheep":
      return (
        <>
          <circle cx={9} cy={12.5} r={4.2} fill={c} />
          <circle cx={13.5} cy={9.8} r={4.7} fill={c} />
          <circle cx={16.6} cy={13} r={3.8} fill={c} />
          <circle cx={11.3} cy={14.4} r={4.2} fill={c} />
          <rect x={8.4} y={16.6} width={2} height={3.6} rx={1} fill={c2} />
          <rect x={14} y={16.6} width={2} height={3.6} rx={1} fill={c2} />
          <circle cx={18.8} cy={14.6} r={2.3} fill={c2} />
        </>
      );
    case "wheat":
      return (
        <>
          <path d="M12 21 V8" stroke={c2} strokeWidth={1.7} fill="none" strokeLinecap="round" />
          <path d="M12 3 q-2.2 2.6 0 5.2 q2.2 -2.6 0 -5.2" fill={c} />
          <path d="M12 8 q-4.6 .4 -5.5 4.7 q4.4 -.5 5.5 -4.7" fill={c} />
          <path d="M12 8 q4.6 .4 5.5 4.7 q-4.4 -.5 -5.5 -4.7" fill={c} />
          <path d="M12 13 q-4.6 .4 -5.5 4.7 q4.4 -.5 5.5 -4.7" fill={c} />
          <path d="M12 13 q4.6 .4 5.5 4.7 q-4.4 -.5 -5.5 -4.7" fill={c} />
        </>
      );
    case "ore":
      return (
        <>
          <path d="M12 3 L19 9.5 L12 21 L5 9.5 Z" fill={c} />
          <path d="M5 9.5 H19 M12 3 V21 M8 9.5 L12 3 L16 9.5" stroke={c2} strokeWidth={1} fill="none" opacity={0.7} />
        </>
      );
    case "desert":
      return (
        <>
          <circle cx={16.5} cy={8} r={3.3} fill={c} />
          <path d="M3 19 Q8 12.5 12 16.5 Q16 20.5 21 15.5 V20 H3 Z" fill={c} />
        </>
      );
  }
}

/** Resource icon matching the design's filled glyphs (uiIcon/smallIcon).
 *  `onCard` renders white-on-colour for the hand cards; otherwise it renders in
 *  the resource's own colour for light menu backgrounds. */
export function ResIcon({
  res,
  size = 16,
  onCard = false,
}: {
  res: Resource;
  size?: number;
  onCard?: boolean;
}) {
  const c = onCard ? "#fff" : CARD[res];
  const c2 = onCard ? "rgba(0,0,0,.22)" : "rgba(0,0,0,.2)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
      <TileGlyph name={res} c={c} c2={c2} />
    </svg>
  );
}

export function HexLogo({ size = 30, color = "#D9A441" }: { size?: number; color?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size * 1.13,
        background: color,
        clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)",
      }}
    />
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]],
};

export function Die({ value, size = 42 }: { value: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <rect x="4" y="4" width="92" height="92" rx="18" fill="#F4ECDD" stroke="#20323C" strokeWidth="4" />
      {(PIPS[value] ?? []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="9" fill="#20323C" />
      ))}
    </svg>
  );
}
