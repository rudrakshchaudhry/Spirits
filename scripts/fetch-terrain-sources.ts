/**
 * Download raw terrain sources into data/raw/ (gitignored):
 *  - OSM: BBBike's prebuilt San Francisco extract (GeoJSON, refreshed weekly),
 *    stream-filtered into osm-{roads,landcover,buildings,coastline}.json
 *  - DataSF Analysis Neighborhoods (j2bu-swwd): land mask + title cards
 *
 * Public Overpass was too overloaded to pull ~160k building polygons reliably,
 * so the bake reads a static extract instead. Output keeps Overpass's
 * `out geom` element shape, so bake-tiles.ts doesn't care where it came from.
 *
 * Idempotent: skips steps whose output exists unless --force.
 * Run: npm run fetch:terrain [-- --force]
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BOUNDS } from "../lib/geo/projection";
import { loadEnv } from "./lib/env";

loadEnv();
const RAW = join(process.cwd(), "data/raw");
mkdirSync(RAW, { recursive: true });
const force = process.argv.includes("--force");
const UA = "sf-spirits-terrain-bake/0.1";

const BBBIKE_URL = "https://download.bbbike.org/osm/bbbike/SanFrancisco/SanFrancisco.osm.geojson.xz";
const BBBIKE_FILE = join(RAW, "SanFrancisco.osm.geojson.xz");

// ───────────────────────── neighbourhoods ─────────────────────────
async function fetchNeighborhoods() {
  const file = join(RAW, "neighborhoods.json");
  if (existsSync(file) && !force) return console.log("✓ neighborhoods (cached)");
  const headers: Record<string, string> = { "User-Agent": UA };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  // NB: p5b7-5n3h (named in the spec) is a map view over j2bu-swwd and returns no geometry.
  const res = await fetch("https://data.sf.gov/resource/j2bu-swwd.json?$limit=100", { headers });
  if (!res.ok) throw new Error(`neighborhoods ${res.status}`);
  const rows = await res.json();
  writeFileSync(file, JSON.stringify(rows));
  console.log(`✓ neighborhoods: ${rows.length}`);
}

// ───────────────────────── OSM extract ─────────────────────────
async function downloadExtract() {
  if (existsSync(BBBIKE_FILE) && !force) return console.log("✓ BBBike extract (cached)");
  console.log("… downloading BBBike SF extract (~56 MB)");
  const res = await fetch(BBBIKE_URL, { headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`BBBike ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(BBBIKE_FILE));
  console.log("✓ BBBike extract downloaded");
}

type Tags = Record<string, string>;
type Bucket = "roads" | "landcover" | "buildings" | "coastline";

const LANDCOVER: [string, RegExp][] = [
  ["leisure", /^(park|garden|pitch|golf_course|playground|dog_park|recreation_ground)$/],
  ["landuse", /^(grass|forest|meadow|cemetery|recreation_ground|village_green|reservoir|basin|allotments)$/],
  ["natural", /^(water|wood|scrub|grassland|heath|beach|sand|wetland|bare_rock|cliff)$/],
  ["golf", /^(fairway|green|bunker|rough|tee)$/],
  ["man_made", /^(pier|breakwater)$/],
  ["waterway", /^riverbank$/],
];

function bucketOf(t: Tags): Bucket | null {
  if (t.natural === "coastline") return "coastline";
  if (t.building && t.building !== "no") return "buildings";
  if (t.highway) return "roads";
  for (const [k, re] of LANDCOVER) if (t[k] && re.test(t[k])) return "landcover";
  return null;
}

type Pos = number[];
const toLL = (ring: Pos[]) => ring.map(([lon, lat]) => ({ lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7 }));

function bboxHits(coords: unknown): boolean {
  // Any vertex inside the world bounds (cheap; good enough for clipping at city scale).
  const stack: unknown[] = [coords];
  while (stack.length) {
    const c = stack.pop() as unknown[];
    if (typeof c[0] === "number") {
      const [lon, lat] = c as number[];
      if (lat >= BOUNDS.south && lat <= BOUNDS.north && lon >= BOUNDS.west && lon <= BOUNDS.east) return true;
    } else for (const x of c) stack.push(x);
  }
  return false;
}

/** GeoJSON feature → Overpass-style element(s). */
function toElements(g: { type: string; coordinates: unknown }, tags: Tags, id: number) {
  switch (g.type) {
    case "LineString":
      return [{ type: "way", id, tags, geometry: toLL(g.coordinates as Pos[]) }];
    case "Polygon": {
      const rings = g.coordinates as Pos[][];
      if (rings.length === 1) return [{ type: "way", id, tags, geometry: toLL(rings[0]) }];
      return [{ type: "relation", id, tags, members: rings.map((r, i) => ({ type: "way", role: i ? "inner" : "outer", geometry: toLL(r) })) }];
    }
    case "MultiPolygon": {
      const polys = g.coordinates as Pos[][][];
      return [{
        type: "relation", id, tags,
        members: polys.flatMap((rings) => rings.map((r, i) => ({ type: "way", role: i ? "inner" : "outer", geometry: toLL(r) }))),
      }];
    }
    case "MultiLineString":
      return (g.coordinates as Pos[][]).map((l, i) => ({ type: "way", id: id * 100 + i, tags, geometry: toLL(l) }));
    default:
      return [];
  }
}

async function extractOsm() {
  const outFiles: Record<Bucket, string> = {
    roads: join(RAW, "osm-roads.json"),
    landcover: join(RAW, "osm-landcover.json"),
    buildings: join(RAW, "osm-buildings.json"),
    coastline: join(RAW, "osm-coastline.json"),
  };
  if (!force && Object.values(outFiles).every(existsSync)) return console.log("✓ OSM layers (cached)");

  const out: Record<Bucket, unknown[]> = { roads: [], landcover: [], buildings: [], coastline: [] };
  const xz = spawn("xz", ["-dc", BBBIKE_FILE], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = createInterface({ input: xz.stdout, crlfDelay: Infinity });
  let n = 0, id = 1;
  for await (let line of rl) {
    if (!line.startsWith('{"type":"Feature"')) continue;
    if (line.endsWith(",")) line = line.slice(0, -1);
    n++;
    const f = JSON.parse(line) as { geometry: { type: string; coordinates: unknown } | null; properties: Tags };
    if (!f.geometry || f.geometry.type === "Point") continue;
    const b = bucketOf(f.properties ?? {});
    if (!b || !bboxHits(f.geometry.coordinates)) continue;
    out[b].push(...toElements(f.geometry, f.properties, id++));
  }
  for (const b of Object.keys(out) as Bucket[]) {
    writeFileSync(outFiles[b], JSON.stringify({ elements: out[b] }));
    console.log(`✓ ${b}: ${out[b].length} elements`);
  }
  console.log(`  (scanned ${n} features)`);
}

async function main() {
  await fetchNeighborhoods();
  await downloadExtract();
  await extractOsm();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
