/**
 * Pre-warm the demo (spec §7.3 "Pre-warm for the demo"): generate + cache the
 * spirit cards nearest each stop on the demo route, so the stage demo never
 * waits on a cold Mistral generation. Prints a cheat-sheet of the easiest
 * spirits to befriend (highest starting trust, lowest difficulty).
 *
 * Run: npx tsx scripts/prewarm.ts [perStop=10]
 */
import { latLonToTile, tileToChunk, chunkKey } from "../lib/geo/projection";
import { DIFFICULTY } from "../lib/encounter/games";
import { INDEX, es } from "../lib/es/client";
import { START_TRUST, getOrCreateCard } from "../lib/spirits/card";
import { sfDate } from "../lib/spirits/spawn";
import { queryChunk } from "../lib/world/chunkQuery";
import { loadEnv } from "./lib/env";

loadEnv();

export const DEMO_STOPS = [
  { name: "Dolores Park (spawn)", lat: 37.7596, lon: -122.4269 },
  { name: "Valencia St", lat: 37.759, lon: -122.4212 },
  { name: "Civic Center", lat: 37.7793, lon: -122.4176 },
  { name: "Tenderloin", lat: 37.784, lon: -122.414 },
  { name: "Ocean Beach / GG Park", lat: 37.7705, lon: -122.5095 },
];

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function main() {
  const perStop = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 10);
  const fresh = process.argv.includes("--fresh"); // regenerate every card on the route (new prompt)
  const date = sfDate();
  const jobs: { stop: string; placeId: string; dist: number }[] = [];
  for (const stop of DEMO_STOPS) {
    const t = latLonToTile(stop.lat, stop.lon);
    const keys = new Set<string>();
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      const c = tileToChunk(t.x + dx * 32, t.y + dy * 32);
      keys.add(chunkKey(c.cx, c.cy));
    }
    const ents = (await Promise.all([...keys].map((k) => queryChunk(k, date)))).flatMap((c) => c.entities).filter((e) => e.spirit);
    ents.sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y));
    const seenKinds = new Map<string, number>();
    // nearest spirits, but make sure every family near the stop is represented
    for (const e of ents) {
      const n = seenKinds.get(e.kind) ?? 0;
      if (jobs.filter((j) => j.stop === stop.name).length >= perStop) break;
      if (n >= Math.ceil(perStop / 2)) continue;
      seenKinds.set(e.kind, n + 1);
      jobs.push({ stop: stop.name, placeId: e.id, dist: Math.round(Math.hypot(e.x - t.x, e.y - t.y) * 4) });
    }
  }
  if (fresh) {
    await es().deleteByQuery({ index: INDEX.spirits, query: { terms: { place_id: jobs.map((j) => j.placeId) } }, refresh: true, conflicts: "proceed" });
  }
  console.log(`pre-warming ${jobs.length} spirits for ${date}…`);
  const rows: string[] = [];
  let done = 0;
  await pool(jobs, 2, async (j) => {
    const t0 = Date.now();
    try {
      const c = await getOrCreateCard(j.placeId, date, { redoTemplates: true });
      const easy = START_TRUST[c.temperament] + 60 * 0.9 >= 100;
      rows.push(
        [j.stop, `${j.dist}m`, c.name, c.family, c.rarity, c.temperament, `start ${START_TRUST[c.temperament]}`, `d=${DIFFICULTY[c.rarity]}`, easy ? "★ one-visit friend" : "", c.model, c.place_name].join(" | "),
      );
    } catch (e) {
      rows.push(`${j.stop} | ${j.placeId} | FAILED ${(e as Error).message}`);
    }
    done++;
    process.stdout.write(`\r  ${done}/${jobs.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)   `);
  });
  console.log("\n\nstop | distance | name | family | rarity | temperament | trust | difficulty | demo | model | place");
  console.log(rows.sort().join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
