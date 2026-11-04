import { cacheLife } from "next/cache";
import type { HazeEntry } from "@/lib/conditions/rules";
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
  // random_score keyed on the stable `id` keyword (not _seq_no, which changes on re-ingest and
  // is per-shard): same pick on every instance for the day; under-visited hoods weighted ×3.
  const r = await es().search<{ id: string; kind: PlaceKind; neighborhood: string; location: { lat: number; lon: number } }>({
    index: INDEX.places,
    size: 1,
    _source: ["id", "kind", "neighborhood", "location"],
    query: {
      function_score: {
        query: { bool: { filter: [{ terms: { kind: ["landmark", "art"] } }, { exists: { field: "neighborhood" } }] } },
        functions: [
          { random_score: { seed: hash32(`featured|${day}`), field: "id" } },
          { filter: { terms: { neighborhood: UNDER_VISITED } }, weight: 3 },
        ],
        score_mode: "multiply",
        boost_mode: "replace",
      },
    },
    sort: [{ _score: { order: "desc" } }, { id: { order: "asc" } }],
  });
  const s = r.hits.hits[0]?._source;
  if (!s) return null;
  return { date: day, placeId: s.id, family: FAMILY_OF[s.kind], rarity: s.kind === "art" ? "legendary" : "rare", neighborhood: s.neighborhood, kind: s.kind, location: s.location };
}

export type HazeMap = Record<string, HazeEntry>;

export async function hazeMap(): Promise<HazeMap> {
  "use cache";
  cacheLife("hours");
  const r = await es().search<{ name: string; haze_score?: number; haze_density?: number; haze_density_prev?: number | null }>({
    index: INDEX.neighborhoods,
    size: 100,
    _source: ["name", "haze_score", "haze_density", "haze_density_prev"],
  });
  return Object.fromEntries(
    r.hits.hits.map((h) => {
      const s = h._source!;
      // "lifting" = raw open-case density down ≥10% vs a snapshot at least a day old (not normalised noise)
      const lifting = s.haze_density != null && s.haze_density_prev != null && s.haze_density < s.haze_density_prev * 0.9;
      return [s.name, { score: s.haze_score ?? 0, lifting }];
    }),
  );
}
