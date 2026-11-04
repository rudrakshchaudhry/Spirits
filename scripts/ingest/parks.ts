/** Recreation and Parks Properties (gtr9-ntp6) → places(kind=park). */
import { COASTAL_HOODS, KIND_KEEPSAKES } from "../../lib/places/catalog";
import { type PlaceDoc, bulkUpsert, clean, inSF, neighborhoodOf, num, pruneStale, runner, soda } from "./lib";

type Row = Record<string, string> & { shape?: { type: string; coordinates: number[][][][] } };

function centroid(shape: Row["shape"]): { lat: number; lon: number } | null {
  const ring = shape?.coordinates?.[0]?.[0];
  if (!ring?.length) return null;
  let x = 0, y = 0;
  for (const [lon, lat] of ring) { x += lon; y += lat; }
  return { lat: y / ring.length, lon: x / ring.length };
}

export default runner("parks", async (startedAt) => {
  const docs: PlaceDoc[] = [];
  for await (const page of soda<Row>("gtr9-ntp6")) {
    for (const r of page) {
      const p = r.latitude ? { lat: +r.latitude, lon: +r.longitude } : centroid(r.shape);
      if (!p || !inSF(p.lat, p.lon)) continue;
      const name = clean(r.property_name);
      if (!name) continue;
      const hood = neighborhoodOf(p.lat, p.lon);
      const acres = num(r.acres);
      const type = clean(r.propertytype);
      const tags = ["park", type.toLowerCase().replace(/\W+/g, "_")].filter(Boolean);
      if (hood && COASTAL_HOODS.has(hood)) tags.push("coastal");
      if (/playground/i.test(name)) tags.push("playground");
      if (/garden/i.test(name)) tags.push("garden");
      docs.push({
        id: `park:${r.property_id || r.objectid}`,
        kind: "park",
        source_id: r.property_id || r.objectid,
        name,
        description: [name, type && `(${type})`, acres && `${acres.toFixed(1)} acres`, r.address && `at ${clean(r.address)}`].filter(Boolean).join(" "),
        location: p,
        shape: r.shape,
        neighborhood: hood,
        attrs: { acres, property_type: type || undefined },
        tags,
        keepsake_types: KIND_KEEPSAKES.park,
        rank: Math.min(1, Math.log10(1 + (acres ?? 0)) / 3),
        updated_at: new Date().toISOString(),
      });
    }
  }
  const n = await bulkUpsert(docs);
  await pruneStale("park", startedAt);
  return n;
});
