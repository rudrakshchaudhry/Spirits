import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INDEX, es } from "../../lib/es/client";
import { BOUNDS, latLonToTile } from "../../lib/geo/projection";
import { type Hood, hoodAt } from "../../lib/world/neighborhoods";
import { loadEnv } from "../lib/env";

loadEnv();

export type PlaceDoc = {
  id: string;
  kind: "tree" | "park" | "art" | "landmark" | "film" | "business";
  source_id: string;
  name: string;
  description?: string;
  location: { lat: number; lon: number };
  shape?: unknown;
  neighborhood: string | null;
  attrs: Record<string, unknown>;
  tags: string[];
  keepsake_types: string[];
  rank: number;
  updated_at: string;
};

// ───────────────────────── DataSF (SODA) ─────────────────────────
const UA = "sf-spirits-ingest/0.1";

/** Page through a SODA dataset. `where`/`select` are SoQL. */
export async function* soda<T = Record<string, string>>(
  id: string,
  opts: { where?: string; select?: string; order?: string; pageSize?: number } = {},
): AsyncGenerator<T[]> {
  const pageSize = opts.pageSize ?? 20_000;
  for (let offset = 0; ; offset += pageSize) {
    const u = new URL(`https://data.sf.gov/resource/${id}.json`);
    if (opts.where) u.searchParams.set("$where", opts.where);
    if (opts.select) u.searchParams.set("$select", opts.select);
    u.searchParams.set("$order", opts.order ?? ":id");
    u.searchParams.set("$limit", String(pageSize));
    u.searchParams.set("$offset", String(offset));
    const headers: Record<string, string> = { "User-Agent": UA };
    if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
    let rows: T[] | null = null;
    for (let attempt = 0; attempt < 4 && !rows; attempt++) {
      const res = await fetch(u, { headers });
      if (res.ok) rows = (await res.json()) as T[];
      else {
        console.warn(`  ${id} offset ${offset}: ${res.status}, retrying`);
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      }
    }
    if (!rows) throw new Error(`${id}: failed at offset ${offset}`);
    if (rows.length) yield rows;
    if (rows.length < pageSize) return;
  }
}

// ───────────────────────── geo helpers ─────────────────────────
let hoods: Hood[] | null = null;
export function neighborhoodOf(lat: number, lon: number): string | null {
  hoods ??= JSON.parse(readFileSync(join(process.cwd(), "public/neighborhoods.json"), "utf8")) as Hood[];
  const t = latLonToTile(lat, lon);
  return hoodAt(hoods, t.x, t.y)?.name ?? null;
}

export function inSF(lat: number, lon: number) {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= BOUNDS.south && lat <= BOUNDS.north && lon >= BOUNDS.west && lon <= BOUNDS.east
  );
}

export const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : undefined;
};
export const year = (v: unknown) => {
  const m = String(v ?? "").match(/\b(1[6-9]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : undefined;
};
export const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
export const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc|Dba)\b/g, (w) => w.toUpperCase());

// ───────────────────────── ES bulk ─────────────────────────
export async function bulkUpsert(docs: PlaceDoc[], index: string = INDEX.places) {
  if (!docs.length) return 0;
  const client = es();
  let ok = 0;
  for (let i = 0; i < docs.length; i += 2000) {
    const slice = docs.slice(i, i + 2000);
    const res = await client.bulk({
      refresh: false,
      operations: slice.flatMap((d) => [{ index: { _index: index, _id: d.id } }, d]),
    });
    if (res.errors) {
      const bad = res.items.filter((it) => it.index?.error);
      console.warn(`  ${bad.length} bulk errors, first:`, JSON.stringify(bad[0]?.index?.error).slice(0, 300));
      ok += slice.length - bad.length;
    } else ok += slice.length;
  }
  return ok;
}

/** Remove docs of `kind` that weren't in this run (closed shops, removed trees). */
export async function pruneStale(kind: PlaceDoc["kind"], runStartedAt: string) {
  const res = await es().deleteByQuery({
    index: INDEX.places,
    query: { bool: { filter: [{ term: { kind } }, { range: { updated_at: { lt: runStartedAt } } }] } },
    conflicts: "proceed",
    refresh: true,
  });
  return res.deleted ?? 0;
}

export function runner(name: string, fn: (startedAt: string) => Promise<number>) {
  return async () => {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const n = await fn(startedAt);
    console.log(`✓ ${name}: ${n} docs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return n;
  };
}
