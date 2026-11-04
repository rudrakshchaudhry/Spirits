/** Analysis Neighborhoods (j2bu-swwd) → neighborhoods index (spec §6.1). */
import { INDEX, es } from "../../lib/es/client";
import { EXCLUSIVE_KEEPSAKES } from "../../lib/places/catalog";
import { runner, soda } from "./lib";

type Row = { nhood: string; the_geom: { type: "MultiPolygon"; coordinates: number[][][][] } };

/** Spherical-excess-free planar area, fine at city scale. */
function areaKm2(g: Row["the_geom"]) {
  const mLat = 111_132.954, mLon = 111_319.488 * Math.cos((37.77 * Math.PI) / 180);
  let a = 0;
  for (const poly of g.coordinates)
    poly.forEach((ring, i) => {
      let s = 0;
      for (let k = 0, j = ring.length - 1; k < ring.length; j = k++)
        s += ring[j][0] * mLon * ring[k][1] * mLat - ring[k][0] * mLon * ring[j][1] * mLat;
      a += (i === 0 ? 1 : -1) * Math.abs(s / 2);
    });
  return a / 1e6;
}

export default runner("neighborhoods", async () => {
  const rows: Row[] = [];
  for await (const page of soda<Row>("j2bu-swwd")) rows.push(...page);
  const res = await es().bulk({
    refresh: true,
    operations: rows.flatMap((r) => [
      { index: { _index: INDEX.neighborhoods, _id: r.nhood } },
      {
        name: r.nhood,
        shape: r.the_geom,
        area_km2: Math.round(areaKm2(r.the_geom) * 100) / 100,
        exclusive_keepsakes: EXCLUSIVE_KEEPSAKES[r.nhood] ?? [],
        haze_score: 0,
        open_311_count: 0,
      },
    ]),
  });
  if (res.errors) console.warn("  some neighborhood docs failed", JSON.stringify(res.items.find((i) => i.index?.error)).slice(0, 300));
  return rows.length;
});
