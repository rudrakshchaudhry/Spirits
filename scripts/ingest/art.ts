/**
 * Public art → places(kind=art):
 *  - Civic Art Collection (r7bn-7v9c), publicly displayed pieces inside SF (drops SFO etc.)
 *  - StreetSmArts Murals (wg8w-68vc)
 */
import { createHash } from "node:crypto";
import { KIND_KEEPSAKES } from "../../lib/places/catalog";
import { type PlaceDoc, bulkUpsert, clean, inSF, neighborhoodOf, pruneStale, runner, soda, year } from "./lib";

type Row = Record<string, string>;

/** "Goggin, Brian and Keehn, Dorka" → "Brian Goggin and Dorka Keehn" */
function artistName(s: string) {
  return s
    .split(/\s+and\s+|;\s*/)
    .map((p) => {
      const [last, first] = p.split(",").map((x) => x.trim());
      return first ? `${first} ${last}` : last;
    })
    .filter(Boolean)
    .join(" and ");
}

export default runner("art", async (startedAt) => {
  const docs: PlaceDoc[] = [];
  for await (const page of soda<Row>("r7bn-7v9c", { where: "latitude IS NOT NULL" })) {
    for (const r of page) {
      const lat = +r.latitude, lon = +r.longitude;
      if (!inSF(lat, lon)) continue;
      const title = clean(r.display_title) || "Untitled";
      const artist = artistName(clean(r.artist));
      const y = year(r.creation_date);
      const medium = clean(r.medium || r.media_support);
      const where = [clean(r.street_address_or_intersection), clean(r.location_description), clean(r.facility)].filter(Boolean).join(", ");
      docs.push({
        id: `art:${r.accession_number || createHash("sha1").update(title + lat + lon).digest("hex").slice(0, 10)}`,
        kind: "art",
        source_id: r.accession_number,
        name: title,
        description: [`"${title}"`, artist && `by ${artist}`, y && `(${y})`, medium && `— ${medium}`, where && `at ${where}`].filter(Boolean).join(" "),
        location: { lat, lon },
        neighborhood: neighborhoodOf(lat, lon),
        attrs: { artist: artist || undefined, year: y, medium: medium || undefined, location_text: where || undefined, collection: "civic" },
        tags: ["art", "civic_art", ...(/mural/i.test(medium + title) ? ["mural"] : []), ...(/bronze|sculpture|steel|stone/i.test(medium) ? ["sculpture"] : [])],
        keepsake_types: KIND_KEEPSAKES.art,
        rank: 1,
        updated_at: new Date().toISOString(),
      });
    }
  }
  for await (const page of soda<Row & { the_geom?: { coordinates: [number, number] } }>("wg8w-68vc")) {
    for (const r of page) {
      const [lon, lat] = r.the_geom?.coordinates ?? [NaN, NaN];
      if (!inSF(lat, lon)) continue;
      const artist = clean(r.artist);
      const address = clean(r.street_address);
      const sid = createHash("sha1").update(`${artist}|${address}`).digest("hex").slice(0, 10);
      docs.push({
        id: `art:mural:${sid}`,
        kind: "art",
        source_id: sid,
        name: artist ? `Mural by ${artist}` : "Neighborhood mural",
        description: [`A StreetSmArts mural`, artist && `by ${artist}`, r.year && `(${clean(r.year)})`, address && `at ${address}`].filter(Boolean).join(" "),
        location: { lat, lon },
        neighborhood: neighborhoodOf(lat, lon),
        attrs: { artist: artist || undefined, year: year(r.year), medium: "Mural", location_text: address || undefined, collection: "streetsmarts" },
        tags: ["art", "mural"],
        keepsake_types: KIND_KEEPSAKES.art,
        rank: 1,
        updated_at: new Date().toISOString(),
      });
    }
  }
  const n = await bulkUpsert(docs);
  await pruneStale("art", startedAt);
  return n;
});
