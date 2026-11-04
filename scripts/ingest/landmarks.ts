/** SF Planning Landmarks (rzic-39gi, Article 10) → places(kind=landmark). */
import { KIND_KEEPSAKES } from "../../lib/places/catalog";
import { type PlaceDoc, bulkUpsert, clean, inSF, neighborhoodOf, num, pruneStale, runner, soda } from "./lib";

type Row = Record<string, string> & { the_geom?: { type: string; coordinates: number[][][][] } };

function centroid(g: Row["the_geom"]) {
  const ring = g?.coordinates?.[0]?.[0];
  if (!ring?.length) return null;
  let x = 0, y = 0;
  for (const [lon, lat] of ring) { x += lon; y += lat; }
  return { lat: y / ring.length, lon: x / ring.length };
}

export default runner("landmarks", async (startedAt) => {
  const docs: PlaceDoc[] = [];
  for await (const page of soda<Row>("rzic-39gi")) {
    for (const r of page) {
      const p = centroid(r.the_geom);
      if (!p || !inSF(p.lat, p.lon)) continue;
      const name = clean(r.name);
      if (!name) continue;
      const built = num(r.yearbuilt);
      const designated = num(r.yeardes);
      const parts = [
        name,
        built && `built ${built}`,
        clean(r.style) && `${clean(r.style)} style`,
        clean(r.archbuild) && `designed by ${clean(r.archbuild)}`,
        clean(r.sigperson) && `associated with ${clean(r.sigperson)}`,
        clean(r.context),
        designated && `designated Landmark No. ${r.landmarkno} in ${designated}`,
      ];
      docs.push({
        id: `landmark:${r.landmarkno || r.objectid}`,
        kind: "landmark",
        source_id: r.landmarkno || r.objectid,
        name,
        description: parts.filter(Boolean).join(". "),
        location: p,
        shape: r.the_geom,
        neighborhood: neighborhoodOf(p.lat, p.lon),
        attrs: {
          address: clean(r.address) || undefined,
          year: built,
          designated_year: designated,
          style: clean(r.style) || undefined,
          architect: clean(r.archbuild) || undefined,
          significant_people: clean(r.sigperson) || undefined,
          significance: clean(r.sigsum) || undefined,
          context: clean(r.context) || undefined,
          property_type: clean(r.proptype) || undefined,
          photo: r.largephoto || undefined,
          landmark_no: r.landmarkno,
        },
        tags: ["landmark", ...(built && built < 1906 ? ["pre_quake"] : [])],
        keepsake_types: KIND_KEEPSAKES.landmark,
        rank: built ? Math.min(1, (2030 - built) / 180) : 0.5,
        updated_at: new Date().toISOString(),
      });
    }
  }
  const n = await bulkUpsert(docs);
  await pruneStale("landmark", startedAt);
  return n;
});
