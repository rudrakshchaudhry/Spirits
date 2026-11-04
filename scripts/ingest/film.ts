/**
 * Film Locations (yitu-d5am) → places(kind=film).
 * The dataset now ships coordinates for ~96% of rows; rows without them are
 * skipped (spec planned geocoding, no longer needed).
 */
import { createHash } from "node:crypto";
import { KIND_KEEPSAKES } from "../../lib/places/catalog";
import { type PlaceDoc, bulkUpsert, clean, inSF, neighborhoodOf, pruneStale, runner, soda, year } from "./lib";

type Row = Record<string, string>;

export default runner("film", async (startedAt) => {
  const docs = new Map<string, PlaceDoc>();
  for await (const page of soda<Row>("yitu-d5am", { where: "latitude IS NOT NULL" })) {
    for (const r of page) {
      const lat = +r.latitude, lon = +r.longitude;
      if (!inSF(lat, lon)) continue;
      const title = clean(r.title);
      const loc = clean(r.locations);
      if (!title) continue;
      const sid = createHash("sha1").update(`${title}|${r.release_year}|${loc}`).digest("hex").slice(0, 12);
      const y = year(r.release_year);
      const actors = [r.actor_1, r.actor_2, r.actor_3].map(clean).filter(Boolean);
      const funFacts = clean(r.fun_facts);
      docs.set(sid, {
        id: `film:${sid}`,
        kind: "film",
        source_id: sid,
        name: y ? `${title} (${y})` : title,
        description: [title, y && `(${y})`, loc && `filmed at ${loc}`, funFacts].filter(Boolean).join(". "),
        location: { lat, lon },
        neighborhood: neighborhoodOf(lat, lon),
        attrs: {
          film_title: title,
          film_year: y,
          director: clean(r.director) || undefined,
          writer: clean(r.writer) || undefined,
          actors,
          production_company: clean(r.production_company) || undefined,
          location_text: loc || undefined,
          fun_facts: funFacts || undefined,
        },
        tags: ["film", y && y < 1970 ? "classic" : "modern"].filter(Boolean) as string[],
        keepsake_types: KIND_KEEPSAKES.film,
        rank: y ? Math.max(0, Math.min(1, (2030 - y) / 100)) : 0.3,
        updated_at: new Date().toISOString(),
      });
    }
  }
  const n = await bulkUpsert([...docs.values()]);
  await pruneStale("film", startedAt);
  return n;
});
