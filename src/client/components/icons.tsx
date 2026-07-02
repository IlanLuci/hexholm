import type { Resource } from "../../shared/types";

/** Small glyphs for each resource, drawn on a light card face. */
export function ResIcon({ res, size = 16 }: { res: Resource; size?: number }) {
  const s = size;
  const stroke = "rgba(255,255,255,.92)";
  const common = { fill: "none", stroke, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (res) {
    case "brick":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <rect x="3" y="7" width="18" height="11" rx="1.5" {...common} />
          <path d="M3 12.5h18M12 7v5.5M8 12.5V18M16 12.5V18" {...common} />
        </svg>
      );
    case "wood":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <path d="M12 3c3 4 3 6 0 9-3-3-3-5 0-9Z" {...common} />
          <path d="M12 12c3 3 3 5 0 9-3-4-3-6 0-9ZM12 21V3" {...common} />
        </svg>
      );
    case "sheep":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <path d="M7 13a5 5 0 0 1 10 0 3 3 0 0 1-1 5H8a3 3 0 0 1-1-5Z" {...common} />
          <path d="M9 18v2M15 18v2M12 8v0" {...common} />
        </svg>
      );
    case "wheat":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <path d="M12 3v18M12 7c-2-1-3-2-3-4M12 7c2-1 3-2 3-4M12 12c-2-1-3-2-3-4M12 12c2-1 3-2 3-4M12 17c-2-1-3-2-3-4M12 17c2-1 3-2 3-4" {...common} />
        </svg>
      );
    case "ore":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24">
          <path d="M5 14l4-7 6 0 4 7-7 5-7-5Z" {...common} />
          <path d="M9 7l3 7 3-7M5 14h14" {...common} />
        </svg>
      );
  }
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
