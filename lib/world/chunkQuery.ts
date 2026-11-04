import { INDEX, es } from "@/lib/es/client";
import { CHUNK_TILES, chunkBBox, latLonToTile } from "@/lib/geo/projection";
import type { ConditionTag } from "@/lib/conditions/rules";
import { type PlaceKind, conditionSpawn, spawnFor } from "@/lib/spirits/spawn";
import type { ChunkEntities, Entity } from "./entities";

type Src = {
  id: string;
  kind: PlaceKind;
  name: string;
  location: { lat: number; lon: number };
  rank?: number;
  tags?: string[];
  keepsake_types?: string[];
  attrs?: { species_group?: string; business_category?: string; opened_at?: string };
};

/** Hard cap per chunk; the densest downtown chunk is well under this. */
const MAX_PER_CHUNK = 1500;

/** Uncached chunk query (no next/* imports, so scripts can use it). */
export async function queryChunk(key: string, date: string, condTags: ConditionTag[] = []): Promise<ChunkEntities> {
  const [cx, cy] = key.split("_").map(Number);
  const bb = chunkBBox(cx, cy);
  const res = await es().search<Src>({
    index: INDEX.places,
    size: MAX_PER_CHUNK,
    _source: ["id", "kind", "name", "location", "rank", "tags", "keepsake_types", "attrs.species_group", "attrs.business_category", "attrs.opened_at"],
    query: {
      bool: {
        filter: [
          {
            geo_bounding_box: {
              location: { top_left: { lat: bb.north, lon: bb.west }, bottom_right: { lat: bb.south, lon: bb.east } },
            },
          },
        ],
      },
    },
    // notable things first, in case we ever hit the cap
    sort: [{ rank: "desc" }],
  });

  const entities: Entity[] = [];
  for (const h of res.hits.hits) {
    const s = h._source;
    if (!s) continue;
    const t = latLonToTile(s.location.lat, s.location.lon);
    // bbox is inclusive on edges; keep only points that belong to this chunk
    if (Math.floor(t.x / CHUNK_TILES) !== cx || Math.floor(t.y / CHUNK_TILES) !== cy) continue;
    const tags = s.tags ?? [];
    const input = {
      id: s.id, kind: s.kind, rank: s.rank ?? 0, tags, openedAt: s.attrs?.opened_at,
      foggy: tags.includes("coastal") || s.location.lon < -122.465,
    };
    const spirit = spawnFor(input, date) ?? undefined;
    const cspirit = condTags.length ? conditionSpawn(input, date, condTags) ?? undefined : undefined;
    entities.push({
      id: s.id,
      kind: s.kind,
      x: Math.round(t.x * 100) / 100,
      y: Math.round(t.y * 100) / 100,
      name: s.name,
      look: s.attrs?.species_group ?? s.attrs?.business_category,
      rank: s.rank ?? 0,
      ...(s.keepsake_types?.length ? { ks: s.keepsake_types } : {}),
      ...(spirit ? { spirit } : {}),
      ...(cspirit ? { cspirit } : {}),
      ...(spirit?.rarity === "rare" && s.kind === "business" ? { fresh: 1 as const } : {}),
    });
  }
  return { key, date, entities };
}
