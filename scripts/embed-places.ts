/**
 * embed-places (spec §5): mistral-embed vectors for places with meaningful text
 * (art, landmarks, films, businesses, parks). Trees are skipped for now
 * (spec: embed per species later). Idempotent: only docs without a vector.
 * Run: npx tsx scripts/embed-places.ts
 */
import { INDEX, es } from "../lib/es/client";
import { MODELS, mistral } from "../lib/mistral/client";
import { loadEnv } from "./lib/env";

loadEnv();

type Doc = { id: string; kind: string; name: string; description?: string; tags?: string[] };

async function main() {
  const client = es();
  let after: unknown[] | undefined;
  let done = 0;
  for (;;) {
    const r = await client.search<Doc>({
      index: INDEX.places,
      size: 256,
      _source: ["id", "kind", "name", "description", "tags"],
      query: { bool: { must_not: [{ term: { kind: "tree" } }, { exists: { field: "embedding" } }] } },
      sort: [{ id: "asc" }],
      ...(after ? { search_after: after as never } : {}),
    });
    const hits = r.hits.hits;
    if (!hits.length) break;
    after = hits[hits.length - 1].sort;
    for (let i = 0; i < hits.length; i += 64) {
      const batch = hits.slice(i, i + 64);
      const inputs = batch.map((h) => {
        const s = h._source!;
        return `${s.kind}: ${s.name}. ${s.description ?? ""} ${(s.tags ?? []).join(" ")}`.slice(0, 700);
      });
      let emb;
      for (let attempt = 0; ; attempt++) {
        try {
          emb = await mistral().embeddings.create({ model: MODELS.embed, inputs });
          break;
        } catch (e) {
          if (attempt > 4) throw e;
          await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
        }
      }
      await client.bulk({
        operations: batch.flatMap((h, k) => [{ update: { _index: INDEX.places, _id: h._id } }, { doc: { embedding: emb.data[k].embedding } }]),
      });
      done += batch.length;
      process.stdout.write(`\r  embedded ${done}`);
    }
  }
  console.log(`\n✓ embedded ${done} places with ${MODELS.embed}`);
}

main().catch((e) => {
  console.error(e.meta?.body ?? e);
  process.exit(1);
});
