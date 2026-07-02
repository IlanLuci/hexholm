// Static Catan board geometry. Independent of any game: which hexes, vertices,
// and edges exist and how they connect. Derived deterministically at module load
// by projecting each hex's 6 corners to pixel points, deduping coincident points
// into vertices, and deriving edges from adjacent corner pairs. Ids are stable.

export const HEX_COUNT = 19;

const ROWS = [3, 4, 5, 4, 3] as const;
const SIZE = 1; // hex center-to-corner, abstract units
const DX = Math.sqrt(3) * SIZE; // horizontal center spacing (pointy-top width)
const DY = 1.5 * SIZE; // vertical row spacing

interface Pt {
  x: number;
  y: number;
}

// Hex centers, rows 3-4-5-4-3, each row centered on x=0.
export const HEX_LAYOUT: { q: number; r: number }[] = [];
const hexCenters: Pt[] = [];
{
  for (let r = 0; r < ROWS.length; r++) {
    const n = ROWS[r]!;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * DX;
      const y = (r - 2) * DY;
      hexCenters.push({ x, y });
      HEX_LAYOUT.push({ q: i, r });
    }
  }
}

// Pointy-top corner offsets, angles 60*k - 30 degrees.
function cornerOffset(k: number): Pt {
  const ang = ((60 * k - 30) * Math.PI) / 180;
  return { x: SIZE * Math.cos(ang), y: SIZE * Math.sin(ang) };
}

const key = (p: Pt) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

// Dedupe corners into vertices.
const vertexKeyToId = new Map<string, number>();
const vertexPt: Pt[] = [];
function internVertex(p: Pt): number {
  const k = key(p);
  let id = vertexKeyToId.get(k);
  if (id === undefined) {
    id = vertexPt.length;
    vertexKeyToId.set(k, id);
    vertexPt.push(p);
  }
  return id;
}

const _hexVertices: number[][] = [];
for (let h = 0; h < HEX_COUNT; h++) {
  const c = hexCenters[h]!;
  const verts: number[] = [];
  for (let k = 0; k < 6; k++) {
    const off = cornerOffset(k);
    verts.push(internVertex({ x: c.x + off.x, y: c.y + off.y }));
  }
  _hexVertices.push(verts);
}

export const VERTEX_COUNT = vertexPt.length;

// vertex -> hexes
const _vertexHexes: number[][] = Array.from({ length: VERTEX_COUNT }, () => []);
for (let h = 0; h < HEX_COUNT; h++)
  for (const v of _hexVertices[h]!) _vertexHexes[v]!.push(h);

// Edges from adjacent corner pairs within each hex, deduped by sorted vertex pair.
const edgeKeyToId = new Map<string, number>();
const _edgeVertices: [number, number][] = [];
function internEdge(a: number, b: number): number {
  const lo = Math.min(a, b),
    hi = Math.max(a, b);
  const k = `${lo}-${hi}`;
  let id = edgeKeyToId.get(k);
  if (id === undefined) {
    id = _edgeVertices.length;
    edgeKeyToId.set(k, id);
    _edgeVertices.push([lo, hi]);
  }
  return id;
}

const _hexEdges: number[][] = [];
for (let h = 0; h < HEX_COUNT; h++) {
  const verts = _hexVertices[h]!;
  const edges: number[] = [];
  for (let k = 0; k < 6; k++) edges.push(internEdge(verts[k]!, verts[(k + 1) % 6]!));
  _hexEdges.push(edges);
}

export const EDGE_COUNT = _edgeVertices.length;

// vertex -> incident edges, vertex -> adjacent vertices
const _vertexEdges: number[][] = Array.from({ length: VERTEX_COUNT }, () => []);
const _vertexAdjacent: number[][] = Array.from({ length: VERTEX_COUNT }, () => []);
for (let e = 0; e < EDGE_COUNT; e++) {
  const [a, b] = _edgeVertices[e]!;
  _vertexEdges[a]!.push(e);
  _vertexEdges[b]!.push(e);
  _vertexAdjacent[a]!.push(b);
  _vertexAdjacent[b]!.push(a);
}

// edge -> neighboring edges (sharing a vertex)
const _edgeNeighbors: number[][] = [];
for (let e = 0; e < EDGE_COUNT; e++) {
  const [a, b] = _edgeVertices[e]!;
  const set = new Set<number>([..._vertexEdges[a]!, ..._vertexEdges[b]!]);
  set.delete(e);
  _edgeNeighbors.push([...set]);
}

// hex -> neighboring hexes (sharing an edge = two vertices)
const _hexNeighbors: number[][] = [];
for (let h = 0; h < HEX_COUNT; h++) {
  const neighbors = new Set<number>();
  for (const e of _hexEdges[h]!)
    for (let g = 0; g < HEX_COUNT; g++)
      if (g !== h && _hexEdges[g]!.includes(e)) neighbors.add(g);
  _hexNeighbors.push([...neighbors]);
}

// ---- Ports: pick 9 coastal edges spread evenly around the perimeter ----
// Perimeter vertices touch < 3 hexes; the board is convex so they sort cleanly
// by angle around the centroid, forming the coast cycle.
const centroid: Pt = {
  x: vertexPt.reduce((s, p) => s + p.x, 0) / VERTEX_COUNT,
  y: vertexPt.reduce((s, p) => s + p.y, 0) / VERTEX_COUNT,
};
const perimeter = Array.from({ length: VERTEX_COUNT }, (_, v) => v)
  .filter((v) => _vertexHexes[v]!.length < 3)
  .sort((a, b) => {
    const pa = vertexPt[a]!,
      pb = vertexPt[b]!;
    return (
      Math.atan2(pa.y - centroid.y, pa.x - centroid.x) -
      Math.atan2(pb.y - centroid.y, pb.x - centroid.x)
    );
  });

// Consecutive perimeter vertices connected by an edge form the coast. Choose 9
// port slots at stepped positions (gaps of 2,2,3 repeating = official cadence).
const PORT_STEP_INDICES = [0, 3, 6, 10, 13, 16, 20, 23, 26];
export const PORT_SLOTS: { vertices: [number, number] }[] = [];
for (const i of PORT_STEP_INDICES) {
  const a = perimeter[i % perimeter.length]!;
  const b = perimeter[(i + 1) % perimeter.length]!;
  PORT_SLOTS.push({ vertices: [a, b] });
}

// ---- Pixel projection into a 600x600 board (padding 40) for rendering ----
const PAD = 40;
const VIEW = 600;
const xs = vertexPt.map((p) => p.x),
  ys = vertexPt.map((p) => p.y);
const minX = Math.min(...xs),
  maxX = Math.max(...xs),
  minY = Math.min(...ys),
  maxY = Math.max(...ys);
const scale = Math.min(
  (VIEW - 2 * PAD) / (maxX - minX),
  (VIEW - 2 * PAD) / (maxY - minY),
);
function project(p: Pt): Pt {
  return {
    x: PAD + (p.x - minX) * scale,
    y: PAD + (p.y - minY) * scale,
  };
}

const _vertexPixel = vertexPt.map(project);
const _hexPixel = hexCenters.map(project);

// ---- Public accessors (return copies to keep tables immutable) ----
export const hexVertices = (h: number): number[] => _hexVertices[h]!.slice();
export const hexEdges = (h: number): number[] => _hexEdges[h]!.slice();
export const hexNeighbors = (h: number): number[] => _hexNeighbors[h]!.slice();
export const vertexHexes = (v: number): number[] => _vertexHexes[v]!.slice();
export const vertexAdjacent = (v: number): number[] => _vertexAdjacent[v]!.slice();
export const vertexEdges = (v: number): number[] => _vertexEdges[v]!.slice();
export const edgeVertices = (e: number): [number, number] => [..._edgeVertices[e]!];
export const edgeNeighbors = (e: number): number[] => _edgeNeighbors[e]!.slice();

export const hexPixel = (h: number): Pt => ({ ..._hexPixel[h]! });
export const vertexPixel = (v: number): Pt => ({ ..._vertexPixel[v]! });
export const edgePixel = (e: number): Pt => {
  const [a, b] = _edgeVertices[e]!;
  const pa = _vertexPixel[a]!,
    pb = _vertexPixel[b]!;
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
};
