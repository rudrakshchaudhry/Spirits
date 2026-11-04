/**
 * The signature quest (spec §4.2): "a Tenderloin tree misses the sea, so you go
 * to Ocean Beach for a shell." Picks the Tenderloin's most notable ancient tree
 * (ancient trees host a spirit every day) and (re)generates its card with a
 * wish hint. Mistral still writes the spirit; Elastic still links the wish.
 * Run: npx tsx scripts/curate-quest.ts
 */
import { INDEX, es } from "../lib/es/client";
import { latLonToTile, tileToLatLon } from "../lib/geo/projection";
import { getOrCreateCard } from "../lib/spirits/card";
import { loadEnv } from "./lib/env";

loadEnv();

async function main() {
  const r = await es().search<{ id: string; name: string; location: { lat: number; lon: number } }>({
    index: INDEX.places,
    size: 1,
    _source: ["id", "name", "location"],
    query: { bool: { filter: [{ term: { kind: "tree" } }, { term: { tags: "ancient" } }, { term: { neighborhood: "Tenderloin" } }] } },
    sort: [{ rank: "desc" }],
  });
  const tree = r.hits.hits[0]?._source;
  if (!tree) throw new Error("no ancient tree in the Tenderloin");
  await es().delete({ index: INDEX.spirits, id: `${tree.id}:base`, refresh: true }).catch(() => {});
  const card = await getOrCreateCard(tree.id, undefined, { wishHint: { keepsake_type: "sea_shell", theme: "the sound of the sea" } });
  const t = latLonToTile(tree.location.lat, tree.location.lon);
  const spawn = tileToLatLon(t.x, t.y + 1.5);
  console.log(`✓ ${card.name} (${card.model}) — ${tree.name}`);
  console.log(`  wish: ${card.wish.keepsake_type} / "${card.wish.theme}"`);
  console.log(`  riddle 1: ${card.wish.riddle_1}`);
  console.log(`  riddle 2: ${card.wish.riddle_2}`);
  console.log(`  Elastic targets: ${card.wish.target_place_ids.join(", ")} in ${card.wish.target_hoods.join(", ")}`);
  console.log(`  start here: /?dev=1&at=${spawn.lat.toFixed(6)},${spawn.lon.toFixed(6)}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
