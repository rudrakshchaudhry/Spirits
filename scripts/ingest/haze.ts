/**
 * ingest-311 (spec §5, §12): aggregation only. Open 311 cases (last 90 days) per
 * km² per neighbourhood, normalised p10–p90 to 0..1; cases closed in the last
 * 7 days pull the score down ("the haze is lifting"). Writes
 * neighborhoods.haze_score / haze_density(+snapshots) / open_311_count. Individual cases are
 * never stored or shown — the haze is purely visual (spec §11.2).
 */
import { INDEX, es } from "../../lib/es/client";
import { runner, soda } from "./lib";

type Row = { analysis_neighborhood?: string; count: string };

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 19);

export async function computeHaze() {
  const open: Record<string, number> = {};
  const closed: Record<string, number> = {};
  for await (const page of soda<Row>("vw6y-z8j6", {
    select: "analysis_neighborhood,count(*)",
    where: `status_description='Open' AND requested_datetime > '${iso(90)}'`,
    order: "analysis_neighborhood",
    group: "analysis_neighborhood",
  })) for (const r of page) if (r.analysis_neighborhood) open[r.analysis_neighborhood] = Number(r.count);
  for await (const page of soda<Row>("vw6y-z8j6", {
    select: "analysis_neighborhood,count(*)",
    where: `status_description='Closed' AND closed_date > '${iso(7)}'`,
    order: "analysis_neighborhood",
    group: "analysis_neighborhood",
  })) for (const r of page) if (r.analysis_neighborhood) closed[r.analysis_neighborhood] = Number(r.count);

  const hoods = await es().search<{ name: string; area_km2: number; haze_score?: number; haze_density_snap?: number; haze_prev_at?: string }>({
    index: INDEX.neighborhoods, size: 100, _source: ["name", "area_km2", "haze_density_snap", "haze_prev_at"],
  });
  const rows = hoods.hits.hits.map((h) => ({ ...h._source!, _id: h._id! }));
  if (!rows.length) throw new Error("neighborhoods index is empty — run `npm run ingest -- neighborhoods` first");
  // density, softened by recent progress
  const density = rows.map((r) => {
    const o = open[r.name] ?? 0;
    const c = closed[r.name] ?? 0;
    return Math.max(0, o - 0.5 * c) / Math.max(0.3, r.area_km2);
  });
  const sorted = [...density].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)], p90 = sorted[Math.floor(sorted.length * 0.9)];
  const DAY = 86_400_000;
  const ops = rows.flatMap((r, i) => {
    // Two slots: once a day the snapshot taken a day ago becomes the baseline (`_prev`) and a
    // fresh snapshot is taken, so "lifting" always compares against a density 24–48 h old.
    const roll = !r.haze_prev_at || Date.now() - Date.parse(r.haze_prev_at) >= DAY;
    const d = Math.round(density[i] * 100) / 100;
    return [
    { update: { _index: INDEX.neighborhoods, _id: r._id } },
    {
      doc: {
        haze_density: d,
        ...(roll ? { haze_density_prev: r.haze_density_snap ?? null, haze_density_snap: d, haze_prev_at: new Date().toISOString() } : {}),
        haze_score: Math.round(Math.max(0, Math.min(1, (density[i] - p10) / Math.max(1e-6, p90 - p10))) * 100) / 100,
        open_311_count: open[r.name] ?? 0,
        haze_updated_at: new Date().toISOString(),
      },
    },
  ];
  });
  const res = await es().bulk({ operations: ops, refresh: true });
  if (res.errors) {
    const bad = res.items.filter((it) => it.update?.error);
    throw new Error(`haze: ${bad.length} neighbourhood updates failed, e.g. ${JSON.stringify(bad[0]?.update?.error).slice(0, 200)}`);
  }
  return rows.length;
}

export default runner("haze (311)", computeHaze);
