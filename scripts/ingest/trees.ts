/** Street Tree Inventory (tkzw-k3nq) → places(kind=tree). */
import { COASTAL_HOODS, SPECIES_GROUPS, parseSpecies } from "../../lib/places/catalog";
import { type PlaceDoc, bulkUpsert, clean, inSF, neighborhoodOf, num, pruneStale, runner, soda, titleCase } from "./lib";

type Row = Record<string, string>;

export default runner("trees", async (startedAt) => {
  const rows: Row[] = [];
  for await (const page of soda<Row>("tkzw-k3nq", {
    select: "treeid,species,legalstatus,planttype,planteddate,mapdbh,latitude,longitude,onstreet,crossstreet,description,siteinfo",
    where: "latitude IS NOT NULL AND planttype='Tree'",
    pageSize: 50_000,
  })) {
    rows.push(...page);
    process.stdout.write(`\r  fetched ${rows.length}`);
  }
  console.log();

  const usable = rows.filter((r) => {
    const s = r.species ?? "";
    return inSF(+r.latitude, +r.longitude) && s.includes("::") && !/^Tree\(s\)|Planting site|^::/i.test(s);
  });

  // Rank = how notable: trunk size percentile, plus age and legal status.
  const dbhs = usable.map((r) => Math.min(num(r.mapdbh) ?? 0, 120)).sort((a, b) => a - b);
  const pct = (d: number) => {
    let lo = 0, hi = dbhs.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (dbhs[m] < d) lo = m + 1; else hi = m; }
    return lo / dbhs.length;
  };
  const now = Date.now();

  const docs: PlaceDoc[] = usable.map((r) => {
    const lat = +r.latitude, lon = +r.longitude;
    const sp = parseSpecies(r.species);
    const group = SPECIES_GROUPS[sp.group];
    const dbh = Math.min(num(r.mapdbh) ?? 0, 120);
    const planted = r.planteddate ? Date.parse(r.planteddate) : NaN;
    const ageYears = Number.isFinite(planted) ? (now - planted) / 3.156e10 : undefined;
    const status = clean(r.legalstatus);
    const notable = /landmark|significant/i.test(status);
    let rank = pct(dbh) * 0.85 + (ageYears ? Math.min(ageYears / 100, 1) * 0.15 : 0);
    if (/landmark/i.test(status)) rank = Math.max(rank, 0.995);
    else if (notable) rank = Math.max(rank, 0.9);
    const hood = neighborhoodOf(lat, lon);
    const street = r.onstreet ? titleCase(clean(r.onstreet)) : "";
    const tags = [group.key];
    if (group.flowering) tags.push("flowering");
    if (notable) tags.push("notable");
    if (/landmark/i.test(status)) tags.push("landmark_tree");
    if (hood && COASTAL_HOODS.has(hood)) tags.push("coastal");
    return {
      id: `tree:${r.treeid}`,
      kind: "tree",
      source_id: r.treeid,
      name: street ? `${sp.common} on ${street}` : sp.common,
      description: [sp.common, sp.scientific && `(${sp.scientific})`, street && `on ${street}`, r.crossstreet && `near ${titleCase(clean(r.crossstreet))}`]
        .filter(Boolean).join(" "),
      location: { lat, lon },
      neighborhood: hood,
      attrs: {
        species: sp.common,
        scientific: sp.scientific,
        species_key: sp.key,
        species_group: sp.group,
        dbh: dbh || undefined,
        plant_date: Number.isFinite(planted) ? new Date(planted).toISOString().slice(0, 10) : undefined,
        legal_status: status || undefined,
      },
      tags,
      keepsake_types: [group.keepsake, ...(group.flowering ? ["petal"] : [])].filter((v, i, a) => a.indexOf(v) === i),
      rank: Math.round(rank * 1000) / 1000,
      updated_at: new Date().toISOString(),
    };
  });

  // Top 1% by rank are "ancient" — they always host a spirit (spec §7.2).
  const cutoff = [...docs].map((d) => d.rank).sort((a, b) => b - a)[Math.floor(docs.length * 0.01)];
  for (const d of docs) if (d.rank >= cutoff) d.tags.push("ancient");

  const n = await bulkUpsert(docs);
  const pruned = await pruneStale("tree", startedAt);
  if (pruned) console.log(`  pruned ${pruned} removed trees`);
  return n;
});
