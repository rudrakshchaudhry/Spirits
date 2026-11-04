/**
 * Create ES indices with the spec §6.1 mappings. Idempotent: existing indices
 * get any new fields added (put_mapping); `--recreate <name>` drops and rebuilds one.
 * Run: npm run es:setup [-- --recreate places]
 */
import { INDEX, es } from "../lib/es/client";
import { MAPPINGS } from "../lib/es/mappings";
import { loadEnv } from "./lib/env";

loadEnv();

async function main() {
  const client = es();
  const ri = process.argv.indexOf("--recreate");
  const recreate = ri > 0 ? process.argv[ri + 1] : null;
  for (const name of Object.values(INDEX)) {
    const exists = await client.indices.exists({ index: name });
    if (exists && recreate === name) {
      await client.indices.delete({ index: name });
      console.log(`✗ dropped ${name}`);
    }
    if (!exists || recreate === name) {
      await client.indices.create({
        index: name,
        mappings: MAPPINGS[name],
        settings: { number_of_shards: 1, number_of_replicas: name === "places" ? 1 : 0 },
      });
      console.log(`✓ created ${name}`);
    } else {
      await client.indices.putMapping({ index: name, ...MAPPINGS[name] });
      console.log(`✓ ${name} exists (mapping updated)`);
    }
  }
}

main().catch((e) => {
  console.error(e.meta?.body ?? e);
  process.exit(1);
});
