import { cacheLife } from "next/cache";
import { INDEX, es } from "@/lib/es/client";
import { UNDER_VISITED } from "@/lib/spirits/card";
import { FAMILY_OF, type PlaceKind, hash32, sfDate } from "@/lib/spirits/spawn";

export type Featured = {
  date: string; placeId: string; family: string; rarity: string; neighborhood: string; kind: PlaceKind;
  location: { lat: number; lon: number };
};

/** The featured day turns over at 06:00 PT (spec §12). */
export const featuredDay = (now = Date.now()) => sfDate(new Date(now - 6 * 3600_000));

/**
 * Daily featured rare: a deterministic pick among always-present rare/legendary
 * spirits (landmarks, public art), biased toward under-visited neighbourhoods.
 * Clients only ever see the neighbourhood (spec §12: "neighbourhood only").
 */
export async function featuredFor(day: string): Promise<Featured | null> {
  "use cache";
  cacheLife("hours");
  // Deterministic from stable place ids (not _seq_no, which changes on re-ingest and is per-shard).
  const r = await es().search<{ id: string; kind: PlaceKind; neighborhood: string; location: { lat: number; lon: number } }>({
    index: INDEX.places,
    size: 5000,
    _source: ["id", "kind", "neighborhood", "location"],
    query: { bool: { filter: [{ terms: { kind: ["landmark", "art"] } }, { exists: { field: "neighborhood" } }] } },
  });
  const under = new Set(UNDER_VISITED);
  let best: { id: string; kind: PlaceKind; neighborhood: string; location: { lat: number; lon: number } } | null = null;
  let bestScore = -1;
  for (const h of r.hits.hits) {
    const s = h._source!;
    const score = (hash32(`featured|${day}|${s.id}`) / 4294967296) * (under.has(s.neighborhood) ? 3 : 1);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  const s = best;
  if (!s) return null;
  return { date: day, placeId: s.id, family: FAMILY_OF[s.kind], rarity: s.kind === "art" ? "legendary" : "rare", neighborhood: s.neighborhood, kind: s.kind, location: s.location };
}

export type HazeMap = Record<string, { score: number; prev: number | null; lifting: boolean }>;

export async function hazeMap(): Promise<HazeMap> {
  "use cache";
  cacheLife("hours");
  const r = await es().search<{ name: string; haze_score?: number; haze_prev?: number | null; haze_density?: number; haze_density_prev?: number | null }>({
    index: INDEX.neighborhoods,
    size: 100,
    _source: ["name", "haze_score", "haze_prev", "haze_density", "haze_density_prev"],
  });
  return Object.fromEntries(
    r.hits.hits.map((h) => {
      const s = h._source!;
      // "lifting" = raw open-case density down ≥10% vs a snapshot at least a day old (not normalised noise)
      const lifting = s.haze_density != null && s.haze_density_prev != null && s.haze_density < s.haze_density_prev * 0.9;
      return [s.name, { score: s.haze_score ?? 0, prev: s.haze_prev ?? null, lifting }];
    }),
  );
}
