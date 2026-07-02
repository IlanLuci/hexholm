import type { Resource, Terrain } from "../shared/types";

export const C = {
  parchment: "#EDE3CF",
  panel: "#FBF5E7",
  panelAlt: "#F0E4C8",
  border: "#E1D0AB",
  borderSoft: "#EEE1C4",
  ink: "#241B10",
  muted: "#8A755A",
  gold: "#A2854F",
  teal: "#20323C",
  tealDark: "#1A2A32",
  cream: "#F4ECDD",
  terracotta: "#C4633B",
  terracottaDark: "#B0542F",
  green: "#3F6B4E",
  greenLight: "#487A58",
  accentGold: "#D9A441",
};

export const TILE: Record<Terrain, string> = {
  brick: "#B85C38",
  wood: "#3F6B4E",
  sheep: "#9CAF5A",
  wheat: "#E0A73A",
  ore: "#75828E",
  desert: "#D8C4A0",
};

export const CARD: Record<Resource, string> = {
  brick: "#B0563A",
  wood: "#3C6349",
  sheep: "#889B47",
  wheat: "#CE9128",
  ore: "#5E6B78",
};

export const RES_NAME: Record<Terrain, string> = {
  brick: "Brick",
  wood: "Lumber",
  sheep: "Wool",
  wheat: "Grain",
  ore: "Ore",
  desert: "Desert",
};

export const RES_ORDER: Resource[] = ["brick", "wood", "sheep", "wheat", "ore"];

export const font = {
  display: "'Zilla Slab', serif",
  body: "'Manrope', system-ui, sans-serif",
};
