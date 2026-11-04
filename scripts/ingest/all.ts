/**
 * Run ingest jobs. Each is idempotent (upsert by source id, prune what vanished).
 *   npm run ingest                 # everything
 *   npm run ingest -- trees film   # selected
 * Hackathon: run locally. Later: Vercel Cron (spec §5).
 */
import { es, INDEX } from "../../lib/es/client";
import art from "./art";
import business from "./business";
import film from "./film";
import landmarks from "./landmarks";
import neighborhoods from "./neighborhoods";
import parks from "./parks";
import trees from "./trees";

const JOBS: Record<string, () => Promise<number>> = { neighborhoods, landmarks, art, film, parks, business, trees };

async function main() {
  const picked = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const names = picked.length ? picked : Object.keys(JOBS);
  for (const n of names) {
    if (!JOBS[n]) throw new Error(`unknown job ${n}; choose from ${Object.keys(JOBS).join(", ")}`);
    await JOBS[n]();
  }
  await es().indices.refresh({ index: INDEX.places });
  const agg = await es().search({
    index: INDEX.places,
    size: 0,
    aggs: { kinds: { terms: { field: "kind" } } },
  });
  const buckets = (agg.aggregations?.kinds as { buckets: { key: string; doc_count: number }[] }).buckets;
  console.log("places:", buckets.map((b) => `${b.key}=${b.doc_count}`).join(" "));
}

main().catch((e) => {
  console.error(e.meta?.body ?? e);
  process.exit(1);
});
