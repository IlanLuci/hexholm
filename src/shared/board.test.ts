import {
  HEX_COUNT,
  VERTEX_COUNT,
  EDGE_COUNT,
  HEX_LAYOUT,
  hexVertices,
  hexNeighbors,
  vertexHexes,
  vertexAdjacent,
  vertexEdges,
  edgeVertices,
  edgeNeighbors,
  PORT_SLOTS,
} from "./board";

test("counts", () => {
  expect(HEX_COUNT).toBe(19);
  expect(VERTEX_COUNT).toBe(54);
  expect(EDGE_COUNT).toBe(72);
  expect(HEX_LAYOUT).toHaveLength(19);
});

test("every hex has 6 distinct vertices", () => {
  for (let h = 0; h < HEX_COUNT; h++) {
    const vs = hexVertices(h);
    expect(vs).toHaveLength(6);
    expect(new Set(vs).size).toBe(6);
  }
});

test("vertex->hex is the inverse of hex->vertex", () => {
  for (let h = 0; h < HEX_COUNT; h++)
    for (const v of hexVertices(h)) expect(vertexHexes(v)).toContain(h);
});

test("each vertex has 1..3 hexes and 2..3 adjacent vertices", () => {
  for (let v = 0; v < VERTEX_COUNT; v++) {
    expect(vertexHexes(v).length).toBeGreaterThanOrEqual(1);
    expect(vertexHexes(v).length).toBeLessThanOrEqual(3);
    const adj = vertexAdjacent(v);
    expect(adj.length).toBeGreaterThanOrEqual(2);
    expect(adj.length).toBeLessThanOrEqual(3);
  }
});

test("edges: adjacency symmetric, endpoints are adjacent vertices", () => {
  for (let e = 0; e < EDGE_COUNT; e++) {
    const [a, b] = edgeVertices(e);
    expect(vertexAdjacent(a)).toContain(b);
    expect(vertexAdjacent(b)).toContain(a);
    expect(vertexEdges(a)).toContain(e);
    expect(vertexEdges(b)).toContain(e);
  }
});

test("edge neighbors share a vertex and exclude self", () => {
  for (let e = 0; e < EDGE_COUNT; e++) {
    const [a, b] = edgeVertices(e);
    for (const n of edgeNeighbors(e)) {
      expect(n).not.toBe(e);
      const [na, nb] = edgeVertices(n);
      expect([a, b].some((v) => v === na || v === nb)).toBe(true);
    }
  }
});

test("hex neighbors are symmetric and share two vertices", () => {
  for (let h = 0; h < HEX_COUNT; h++) {
    for (const n of hexNeighbors(h)) {
      expect(hexNeighbors(n)).toContain(h);
      const shared = hexVertices(h).filter((v) => hexVertices(n).includes(v));
      expect(shared).toHaveLength(2);
    }
  }
});

test("9 port slots, each a real edge between two coastal vertices", () => {
  expect(PORT_SLOTS).toHaveLength(9);
  for (const slot of PORT_SLOTS) {
    const [a, b] = slot.vertices;
    expect(vertexAdjacent(a)).toContain(b);
    // coastal: at least one endpoint touches fewer than 3 hexes
    expect(Math.min(vertexHexes(a).length, vertexHexes(b).length)).toBeLessThan(3);
  }
});
