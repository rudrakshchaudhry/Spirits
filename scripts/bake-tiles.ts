/**
 * Terrain bake (spec §4.2, layer 1). Rasterises OSM + DataSF neighbourhood
 * polygons into a citywide terrain grid, auto-tiles edges, and writes:
 *
 *   public/chunks/{cx}_{cy}.bin   64×64 bytes, tile = terrain*16 + variant
 *   public/chunks/manifest.json   world size + list of non-empty chunks
 *   public/minimap.png            1 px = 4×4 tiles (16 m)
 *   public/neighborhoods.json     simplified polygons in tile coords
 *
 * Idempotent: a chunk file is only rewritten if its bytes changed.
 * Run: npx tsx scripts/bake-tiles.ts   (after scripts/fetch-terrain-sources.ts)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  CHUNK_TILES,
  WORLD_CHUNKS_H,
  WORLD_CHUNKS_W,
  WORLD_TILES_H,
  WORLD_TILES_W,
  latLonToTile,
} from "../lib/geo/projection";
import { EDGE_MASKED, T, TERRAIN_COLORS } from "../lib/world/terrain";

const RAW = join(process.cwd(), "data/raw");
const PUB = join(process.cwd(), "public");
const CHUNK_DIR = join(PUB, "chunks");
mkdirSync(CHUNK_DIR, { recursive: true });

const W = WORLD_TILES_W;
const H = WORLD_TILES_H;
const grid = new Uint8Array(W * H).fill(T.DEEP);
console.log(`world ${W}×${H} tiles, ${WORLD_CHUNKS_W}×${WORLD_CHUNKS_H} chunks`);

// ───────────────────────── geometry helpers ─────────────────────────
type Pt = [number, number];
type Ring = Pt[];
type LatLon = { lat: number; lon: number };

const proj = (g: LatLon[]): Ring => g.map((p) => {
  const t = latLonToTile(p.lat, p.lon);
  return [t.x, t.y];
});

/** Even-odd scanline fill of one or more rings, sampling tile centres. */
function fillRings(rings: Ring[], value: number, canPaint?: (cur: number) => boolean) {
  let minY = Infinity, maxY = -Infinity;
  for (const r of rings) for (const [, y] of r) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    const sy = ty + 0.5;
    xs.length = 0;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i];
        const [xj, yj] = r[j];
        if (yi > sy !== yj > sy) xs.push(xi + ((sy - yi) * (xj - xi)) / (yj - yi));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      const row = ty * W;
      for (let tx = xa; tx <= xb; tx++) {
        if (!canPaint || canPaint(grid[row + tx])) grid[row + tx] = value;
      }
    }
  }
}

/** Thick polyline: every tile whose centre is within `r` tiles of the line. */
function strokeLine(line: Ring, r: number, value: number, canPaint?: (cur: number) => boolean) {
  const r2 = r * r;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-9;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const px = tx + 0.5, py = ty + 0.5;
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + t * dx - px, ey = ay + t * dy - py;
        if (ex * ex + ey * ey <= r2) {
          const idx = ty * W + tx;
          if (!canPaint || canPaint(grid[idx])) grid[idx] = value;
        }
      }
    }
  }
}

/** Join open member ways of a multipolygon into rings by matching endpoints. */
function stitchRings(parts: Ring[]): Ring[] {
  const key = (p: Pt) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const rings: Ring[] = [];
  const open = parts.filter((p) => p.length > 1).map((p) => p.slice());
  while (open.length) {
    let cur = open.pop()!;
    let grew = true;
    while (key(cur[0]) !== key(cur[cur.length - 1]) && grew) {
      grew = false;
      const end = key(cur[cur.length - 1]);
      for (let i = 0; i < open.length; i++) {
        const o = open[i];
        if (key(o[0]) === end) cur = cur.concat(o.slice(1));
        else if (key(o[o.length - 1]) === end) cur = cur.concat(o.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    rings.push(cur); // unclosed leftovers are implicitly closed by the fill
  }
  return rings;
}

// ───────────────────────── OSM loading ─────────────────────────
type OsmEl = {
  type: "way" | "relation" | "node";
  id: number;
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: { type: string; role: string; geometry?: LatLon[] }[];
};
function loadOsm(name: string): OsmEl[] {
  const file = join(RAW, `osm-${name}.json`);
  if (!existsSync(file)) {
    console.warn(`! ${file} missing — skipping ${name}. Run scripts/fetch-terrain-sources.ts`);
    return [];
  }
  return JSON.parse(readFileSync(file, "utf8")).elements;
}

const isClosed = (g: LatLon[]) =>
  g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;

/** Returns polygon rings for an element, or null if it's a line. */
function areaRings(el: OsmEl): Ring[] | null {
  if (el.type === "way" && el.geometry && isClosed(el.geometry)) return [proj(el.geometry)];
  if (el.type === "relation" && el.members) {
    const parts = el.members
      .filter((m) => m.type === "way" && m.geometry && (m.role === "outer" || m.role === "inner" || m.role === ""))
      .map((m) => proj(m.geometry!));
    return stitchRings(parts);
  }
  return null;
}

// ───────────────────────── 1. land mask (neighbourhoods) ─────────────────────────
type HoodRow = { nhood: string; the_geom: { type: "MultiPolygon"; coordinates: number[][][][] } };
const hoods: HoodRow[] = JSON.parse(readFileSync(join(RAW, "neighborhoods.json"), "utf8"));
const hoodRings = hoods.map((h) => ({
  name: h.nhood,
  polys: h.the_geom.coordinates.map((poly) =>
    poly.map((ring) => ring.map(([lon, lat]) => {
      const t = latLonToTile(lat, lon);
      return [t.x, t.y] as Pt;
    })),
  ),
}));
for (const h of hoodRings) for (const poly of h.polys) fillRings(poly, T.LAND);
console.log("✓ land mask");

// ───────────────────────── 1b. reconcile mask with the OSM coastline ─────────────────────────
// Neighbourhood polygons overshoot the real waterline in places (Ocean Beach) and
// fall short in others (Marina, piers). Flood the sea from the world border:
// open water spreads for free, plain LAND costs 1 step (capped), coastline strokes
// block. Then sea-side LAND -> DEEP, and enclosed land-side DEEP -> LAND.
{
  const coast = loadOsm("coastline");
  if (coast.length) {
    const barrier = new Uint8Array(W * H);
    const saved = grid.slice();
    for (const el of coast) {
      const lines = el.geometry ? [el.geometry] : (el.members ?? []).flatMap((m) => (m.geometry ? [m.geometry] : []));
      for (const g of lines) strokeLine(proj(g), 0.9, 255);
    }
    for (let i = 0; i < grid.length; i++) if (grid[i] === 255) { barrier[i] = 1; grid[i] = saved[i]; }

    // Daly City / Brisbane sit south of the county line inside our bbox — not sea.
    const southY = Math.floor(latLonToTile(37.7095, -122.45).y);
    const westX = latLonToTile(37.7, -122.5).x;
    const eastX = latLonToTile(37.7, -122.385).x;
    const MAX_LAND_STEPS = 60; // 240 m
    const N = W * H;
    const dist = new Int16Array(N).fill(-1);
    // 0-1 BFS deque: water steps push front (cost 0), land steps push back (cost 1).
    const dq = new Int32Array(N * 2);
    let head = N, tail = N;
    const seed = (x: number, y: number) => {
      const i = y * W + x;
      if (dist[i] !== -1 || barrier[i] || grid[i] !== T.DEEP) return;
      if (y >= southY && x > westX && x < eastX) return;
      dist[i] = 0;
      dq[tail++] = i;
    };
    for (let x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
    for (let y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }

    while (head < tail) {
      const i = dq[head++];
      const d = dist[i];
      const x = i % W;
      for (const j of [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) {
        if (j < 0 || j >= N || barrier[j]) continue;
        const c = grid[j];
        if (c === T.DEEP) {
          if (dist[j] !== -1 && dist[j] <= d) continue;
          dist[j] = d;
          dq[--head] = j;
        } else if (c === T.LAND && d < MAX_LAND_STEPS) {
          if (dist[j] !== -1 && dist[j] <= d + 1) continue;
          dist[j] = d + 1;
          dq[tail++] = j;
        }
      }
    }
    let toSea = 0, toLand = 0;
    for (let i = 0; i < N; i++) {
      if (grid[i] === T.LAND && dist[i] > 0) { grid[i] = T.DEEP; toSea++; }
      else if (grid[i] === T.DEEP && dist[i] === -1 && Math.floor(i / W) < southY) { grid[i] = T.LAND; toLand++; }
    }
    console.log(`✓ coastline reconcile (${toSea} tiles → sea, ${toLand} tiles → land)`);
  }
}

// ───────────────────────── 2. land cover ─────────────────────────
function landcoverClass(t: Record<string, string>): number | null {
  const { leisure, landuse, natural, golf, man_made, waterway } = t;
  if (man_made === "pier" || man_made === "breakwater") return T.PIER;
  if (natural === "water" || landuse === "reservoir" || landuse === "basin" || waterway === "riverbank") return T.WATER;
  if (natural === "beach" || natural === "sand" || golf === "bunker") return T.SAND;
  if (natural === "wood" || natural === "scrub" || landuse === "forest") return T.FOREST;
  if (natural === "bare_rock" || natural === "cliff") return T.LAND;
  if (
    leisure || golf || natural === "grassland" || natural === "heath" || natural === "wetland" ||
    ["grass", "meadow", "cemetery", "recreation_ground", "village_green", "allotments"].includes(landuse ?? "")
  ) return T.GRASS;
  return null;
}
// Paint order matters: broad greens first, then woods, sand, water, piers on top.
const LC_ORDER = [T.GRASS, T.FOREST, T.SAND, T.WATER, T.PIER];
const landcover = loadOsm("landcover");
const byClass = new Map<number, OsmEl[]>();
for (const el of landcover) {
  const c = el.tags ? landcoverClass(el.tags) : null;
  if (c === null) continue;
  // nature_reserve often spans open water; leave it out
  if (el.tags?.leisure === "nature_reserve") continue;
  if (!byClass.has(c)) byClass.set(c, []);
  byClass.get(c)!.push(el);
}
const onLand = (cur: number) => cur !== T.DEEP;
/** Marin headlands sit inside the bbox north of the Golden Gate; keep them out. */
function inMarin(el: OsmEl) {
  const g = el.geometry?.[0] ?? el.members?.find((m) => m.geometry?.length)?.geometry?.[0];
  return !!g && g.lat > 37.812 && g.lon < -122.43;
}
for (const c of LC_ORDER) {
  for (const el of byClass.get(c) ?? []) {
    if (inMarin(el)) continue;
    const rings = areaRings(el);
    if (rings) {
      // Grass/forest/water only on land; beaches and piers may extend past the mask.
      fillRings(rings, c, c === T.SAND || c === T.PIER ? undefined : onLand);
    } else if (el.geometry && c === T.PIER) {
      strokeLine(proj(el.geometry), 1.2, T.PIER);
    }
  }
}
console.log(`✓ landcover (${landcover.length} elements)`);

// ───────────────────────── 3. buildings ─────────────────────────
const buildings = loadOsm("buildings");
let nb = 0;
for (const el of buildings) {
  const t = el.tags ?? {};
  if (t.building === "roof" || t.building === "no" || t.location === "underground") continue;
  const rings = areaRings(el);
  if (!rings) continue;
  fillRings(rings, T.BUILDING, (cur) => cur !== T.WATER && cur !== T.DEEP);
  nb++;
}
console.log(`✓ buildings (${nb})`);

// ───────────────────────── 4. roads & paths ─────────────────────────
const ROAD_HALF_WIDTH: Record<string, number> = {
  motorway: 2.6, trunk: 2.6, primary: 2.3, secondary: 2.1, tertiary: 1.9,
  motorway_link: 1.4, trunk_link: 1.4, primary_link: 1.4, secondary_link: 1.3, tertiary_link: 1.3,
  residential: 1.6, unclassified: 1.6, living_street: 1.4, road: 1.4, busway: 1.2,
  service: 0.9,
};
const PATH_HALF_WIDTH: Record<string, number> = {
  footway: 0.6, path: 0.6, cycleway: 0.7, track: 0.8, bridleway: 0.6, steps: 0.6, pedestrian: 1.4,
};
const roads = loadOsm("roads");
let nr = 0;
// Paths first so roads win at crossings.
for (const pass of ["path", "road"] as const) {
  for (const el of roads) {
    const t = el.tags ?? {};
    const hw = t.highway;
    if (!hw || !el.geometry) continue;
    if (t.tunnel && t.tunnel !== "no") continue;
    if (t.covered === "yes" || (t.layer && Number(t.layer) < 0)) continue;
    if (t.access === "private" && hw === "service") continue;
    if (t.footway === "sidewalk" || t.footway === "crossing") continue; // we synthesise sidewalks

    if (pass === "path" && PATH_HALF_WIDTH[hw] !== undefined) {
      if (t.area === "yes" && isClosed(el.geometry)) {
        fillRings([proj(el.geometry)], T.PLAZA);
      } else {
        const v = hw === "pedestrian" ? T.PLAZA : T.PATH;
        const bridge = !!t.bridge && t.bridge !== "no";
        strokeLine(proj(el.geometry), PATH_HALF_WIDTH[hw], v, (cur) => (cur !== T.BUILDING && cur !== T.DEEP) || bridge);
      }
      nr++;
    } else if (pass === "road" && ROAD_HALF_WIDTH[hw] !== undefined) {
      if (t.area === "yes") continue;
      // Off-shore (Marin, Daly City edge) only bridges may cross open water.
      const bridge = !!t.bridge && t.bridge !== "no";
      strokeLine(proj(el.geometry), ROAD_HALF_WIDTH[hw], T.ROAD, bridge ? undefined : (cur) => cur !== T.DEEP);
      nr++;
    }
  }
}
console.log(`✓ roads/paths (${nr})`);

// ───────────────────────── 5. sidewalks ─────────────────────────
// Any LAND/PATH tile 4-adjacent (or diagonal) to ROAD becomes SIDEWALK.
{
  const next = grid.slice();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const c = grid[i];
      if (c !== T.LAND && c !== T.PATH && c !== T.GRASS) continue;
      let nearRoad = false;
      for (let dy = -1; dy <= 1 && !nearRoad; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (grid[i + dy * W + dx] === T.ROAD) { nearRoad = true; break; }
      // Grass verges along park edges stay grass unless directly touching the road
      if (nearRoad && c === T.GRASS) {
        nearRoad = grid[i - 1] === T.ROAD || grid[i + 1] === T.ROAD || grid[i - W] === T.ROAD || grid[i + W] === T.ROAD;
        if (nearRoad) next[i] = T.SIDEWALK;
        continue;
      }
      if (nearRoad) next[i] = T.SIDEWALK;
    }
  }
  grid.set(next);
  console.log("✓ sidewalks");
}

// ───────────────────────── 6. auto-tile variants ─────────────────────────
function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const at = (x: number, y: number) =>
  x < 0 || y < 0 || x >= W || y >= H ? T.DEEP : grid[y * W + x];
const isWaterish = (c: number) => c === T.DEEP || c === T.WATER;

const tiles = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const c = grid[y * W + x];
    let v: number;
    if (EDGE_MASKED.has(c)) {
      const same = c === T.BUILDING ? (n: number) => n === T.BUILDING : isWaterish;
      v =
        (same(at(x, y - 1)) ? 0 : 1) |
        (same(at(x + 1, y)) ? 0 : 2) |
        (same(at(x, y + 1)) ? 0 : 4) |
        (same(at(x - 1, y)) ? 0 : 8);
    } else {
      v = hash2(x, y) & 3;
    }
    tiles[y * W + x] = c * 16 + v;
  }
}
console.log("✓ auto-tile");

// ───────────────────────── 7. write chunks ─────────────────────────
const existing = new Set(readdirSync(CHUNK_DIR).filter((f) => f.endsWith(".bin")));
const chunkList: string[] = [];
let written = 0, unchanged = 0;
const hashAll = createHash("sha1");
for (let cy = 0; cy < WORLD_CHUNKS_H; cy++) {
  for (let cx = 0; cx < WORLD_CHUNKS_W; cx++) {
    const buf = Buffer.alloc(CHUNK_TILES * CHUNK_TILES, T.DEEP * 16);
    let allDeep = true;
    for (let y = 0; y < CHUNK_TILES; y++) {
      const wy = cy * CHUNK_TILES + y;
      if (wy >= H) break;
      for (let x = 0; x < CHUNK_TILES; x++) {
        const wx = cx * CHUNK_TILES + x;
        if (wx >= W) break;
        const t = tiles[wy * W + wx];
        buf[y * CHUNK_TILES + x] = t;
        if (t !== T.DEEP * 16) allDeep = false;
      }
    }
    if (allDeep) continue; // open water: client fills missing chunks with DEEP
    const name = `${cx}_${cy}.bin`;
    chunkList.push(`${cx}_${cy}`);
    existing.delete(name);
    hashAll.update(buf);
    const path = join(CHUNK_DIR, name);
    if (existsSync(path) && readFileSync(path).equals(buf)) { unchanged++; continue; }
    writeFileSync(path, buf);
    written++;
  }
}
for (const stale of existing) unlinkSync(join(CHUNK_DIR, stale));
const version = hashAll.digest("hex").slice(0, 10);
writeFileSync(
  join(CHUNK_DIR, "manifest.json"),
  JSON.stringify({ version, chunkTiles: CHUNK_TILES, tilesW: W, tilesH: H, chunksW: WORLD_CHUNKS_W, chunksH: WORLD_CHUNKS_H, chunks: chunkList }),
);
console.log(`✓ chunks: ${chunkList.length} non-empty (${written} written, ${unchanged} unchanged, ${existing.size} removed) v${version}`);

// ───────────────────────── 8. minimap ─────────────────────────
{
  const S = 4;
  const mw = Math.ceil(W / S), mh = Math.ceil(H / S);
  const png = new PNG({ width: mw, height: mh });
  const counts = new Uint16Array(16);
  // Draw-priority so thin roads survive downsampling.
  const PRIORITY = [T.ROAD, T.BUILDING];
  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      counts.fill(0);
      for (let y = my * S; y < Math.min(H, my * S + S); y++)
        for (let x = mx * S; x < Math.min(W, mx * S + S); x++) counts[grid[y * W + x]]++;
      let best = 0;
      for (let c = 1; c < 16; c++) if (counts[c] > counts[best]) best = c;
      for (const p of PRIORITY) if (counts[p] >= (S * S) / 3) { best = p; break; }
      const [r, g, b] = TERRAIN_COLORS[best] ?? [0, 0, 0];
      const o = (my * mw + mx) * 4;
      png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
    }
  }
  writeFileSync(join(PUB, "minimap.png"), PNG.sync.write(png));
  console.log(`✓ minimap ${mw}×${mh}`);
}

// ───────────────────────── 9. neighbourhood polygons ─────────────────────────
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-9;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > t2 && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
{
  const out = hoodRings.map((h) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let area = 0, cxs = 0, cys = 0;
    const rings: number[][] = [];
    for (const poly of h.polys) {
      poly.forEach((ring, ri) => {
        const s = simplify(ring, 2);
        rings.push(s.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
        for (const [x, y] of s) {
          if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
        }
        if (ri === 0) {
          for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
            const f = s[j][0] * s[i][1] - s[i][0] * s[j][1];
            area += f; cxs += (s[j][0] + s[i][0]) * f; cys += (s[j][1] + s[i][1]) * f;
          }
        }
      });
    }
    return {
      name: h.name,
      bbox: [minX, minY, maxX, maxY].map(Math.round),
      label: [Math.round(cxs / (3 * area)), Math.round(cys / (3 * area))],
      rings,
    };
  });
  writeFileSync(join(PUB, "neighborhoods.json"), JSON.stringify(out));
  console.log(`✓ neighborhoods.json (${out.length})`);
}
