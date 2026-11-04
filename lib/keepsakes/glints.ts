/**
 * Keepsake glints (spec §10): deterministic per (chunk, 2-hour window), 1–3 per
 * chunk, typed by the real places in that chunk; neighbourhood exclusives
 * (sea shells on the coast, paper lanterns in Chinatown…) appear on top.
 * The server recomputes these to validate a pickup, so nothing is stored.
 */
import { EXCLUSIVE_KEEPSAKES } from "@/lib/places/catalog";
import { roll } from "@/lib/spirits/spawn";
import type { Entity } from "@/lib/world/entities";
import meta from "@/lib/world/chunk-meta.json";

export const WINDOW_MS = 2 * 60 * 60 * 1000;
export const windowIndex = (t = Date.now()) => Math.floor(t / WINDOW_MS);
export const windowStart = (idx: number) => new Date(idx * WINDOW_MS).toISOString();

export type Glint = {
  id: string;
  type: string;
  x: number;
  y: number;
  /** client snaps the glint to the nearest tile of this terrain (e.g. sand for shells) */
  snap?: "sand";
};

type Meta = { hoods: string[]; chunks: Record<string, [number, number, number, number]> };
const M = meta as unknown as Meta;

export function chunkHood(key: string): string | null {
  const m = M.chunks[key];
  return m && m[0] >= 0 ? M.hoods[m[0]] : null;
}

/** Total land chunks per neighbourhood (denominator for explored %). */
export const CHUNKS_PER_HOOD: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  for (const [, v] of Object.entries(M.chunks)) if (v[0] >= 0) out[M.hoods[v[0]]] = (out[M.hoods[v[0]]] ?? 0) + 1;
  return out;
})();

/** Extra keepsake types that only exist under some conditions (Checkpoint F fills this in). */
export type GlintConditions = { extra?: string[] };

export function glintsForChunk(key: string, entities: Pick<Entity, "x" | "y" | "ks">[], win: number, cond: GlintConditions = {}): Glint[] {
  const m = M.chunks[key];
  if (!m) return [];
  const [, sand] = m;
  const hood = chunkHood(key);
  const r = (salt: string) => roll(`glint|${key}|${win}|${salt}`);
  const out: Glint[] = [];
  // Group by keepsake set so 200 street trees don't drown out the one bakery.
  const groups = new Map<string, Pick<Entity, "x" | "y" | "ks">[]>();
  for (const e of entities) {
    if (!e.ks?.length) continue;
    const k = e.ks.join(",");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  const sets = [...groups.values()];

  if (sets.length) {
    const n = 1 + Math.floor(r("n") * 3);
    for (let i = 0; i < n; i++) {
      const set = sets[Math.floor(r(`s${i}`) * sets.length)];
      const e = set[Math.floor(r(`e${i}`) * set.length)];
      const type = e.ks![Math.floor(r(`t${i}`) * e.ks!.length)];
      out.push({
        id: `g:${key}:${win}:${i}`,
        type,
        x: Math.round((e.x + (r(`x${i}`) - 0.5) * 6) * 10) / 10,
        y: Math.round((e.y + (r(`y${i}`) - 0.5) * 6) * 10) / 10,
      });
    }
  }
  // Neighbourhood exclusives: sea shells need real sand; others appear anywhere in the hood.
  for (const ex of (hood && EXCLUSIVE_KEEPSAKES[hood]) || []) {
    const isShell = ex === "sea_shell";
    const [cx, cy] = key.split("_").map(Number);
    // shells: real beach sand on the Pacific edge only (not Lake Merced golf bunkers)
    if (isShell ? sand < 150 || cx > 5 : r(`ex-${ex}`) > 0.35) continue;
    out.push({
      id: `g:${key}:${win}:x-${ex}`,
      type: ex,
      x: cx * 64 + 8 + Math.floor(r(`exx-${ex}`) * 48),
      y: cy * 64 + 8 + Math.floor(r(`exy-${ex}`) * 48),
      ...(isShell ? { snap: "sand" as const } : {}),
    });
  }
  // Condition-gated keepsakes (fog scrap at dawn, rain drops, moon dust…)
  for (const extra of cond.extra ?? []) {
    if (r(`cond-${extra}`) > 0.5) continue;
    const [cx, cy] = key.split("_").map(Number);
    out.push({ id: `g:${key}:${win}:c-${extra}`, type: extra, x: cx * 64 + 8 + Math.floor(r(`cx-${extra}`) * 48), y: cy * 64 + 8 + Math.floor(r(`cy-${extra}`) * 48) });
  }
  return out;
}

/** "g:31_32:245010:2" → { key, win } */
export function parseGlintId(id: string): { key: string; win: number } | null {
  const m = id.match(/^g:(\d{1,3}_\d{1,3}):(\d+):[\w-]+$/);
  return m ? { key: m[1], win: Number(m[2]) } : null;
}
