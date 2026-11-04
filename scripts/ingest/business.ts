/**
 * Registered Business Locations (g8m3-pdis) → places(kind=business).
 * Only open, located, consumer-facing businesses (spec §5 "Business filtering").
 */
import { BUSINESS_CATEGORIES, businessCategory } from "../../lib/places/catalog";
import { type PlaceDoc, bulkUpsert, clean, inSF, neighborhoodOf, pruneStale, runner, soda, titleCase } from "./lib";

type Row = Record<string, string> & { location?: { coordinates: [number, number] } };

const DAY = 86_400_000;

export default runner("business", async (startedAt) => {
  const docs: PlaceDoc[] = [];
  let scanned = 0;
  for await (const page of soda<Row>("g8m3-pdis", {
    select: "uniqueid,dba_name,full_business_address,self_reported_naics_code,location_start_date,location",
    where: "location_end_date IS NULL AND dba_end_date IS NULL AND city='San Francisco' AND location IS NOT NULL",
    pageSize: 50_000,
  })) {
    scanned += page.length;
    for (const r of page) {
      const [lon, lat] = r.location?.coordinates ?? [NaN, NaN];
      if (!inSF(lat, lon)) continue;
      const raw = clean(r.dba_name);
      if (!raw) continue;
      const name = raw === raw.toUpperCase() ? titleCase(raw) : raw;
      const cat = businessCategory(r.self_reported_naics_code, name);
      if (!cat) continue;
      const c = BUSINESS_CATEGORIES[cat];
      const opened = r.location_start_date ? Date.parse(r.location_start_date) : NaN;
      const tags = [cat];
      if (Number.isFinite(opened) && Date.now() - opened < 30 * DAY) tags.push("new_opening");
      const address = clean(r.full_business_address);
      docs.push({
        id: `business:${r.uniqueid}`,
        kind: "business",
        source_id: r.uniqueid,
        name,
        description: `${name}, a ${c.label}${address ? ` at ${titleCase(address)}` : ""}`,
        location: { lat, lon },
        neighborhood: neighborhoodOf(lat, lon),
        attrs: {
          business_category: cat,
          naics: r.self_reported_naics_code,
          opened_at: Number.isFinite(opened) ? new Date(opened).toISOString().slice(0, 10) : undefined,
          address: address || undefined,
        },
        tags,
        keepsake_types: [c.keepsake],
        // Long-standing shops rank higher (legacy businesses are neighbourhood anchors).
        rank: Number.isFinite(opened) ? Math.min(1, (Date.now() - opened) / (40 * 365 * DAY)) : 0.2,
        updated_at: new Date().toISOString(),
      });
    }
    process.stdout.write(`\r  scanned ${scanned}, kept ${docs.length}`);
  }
  console.log();
  const n = await bulkUpsert(docs);
  const pruned = await pruneStale("business", startedAt);
  if (pruned) console.log(`  pruned ${pruned} closed businesses`);
  return n;
});
