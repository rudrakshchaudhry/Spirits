/**
 * Runs every request in elastic/demo-queries.console against the cluster and
 * prints a one-line summary each, so the Dev Tools demo can't surprise us.
 * Run: npx tsx scripts/check-demo-queries.ts
 */
import { readFileSync } from "node:fs";
import { loadEnv } from "./lib/env";

loadEnv();
const text = readFileSync("elastic/demo-queries.console", "utf8").split("\n").filter((l) => !l.startsWith("#")).join("\n");
const re = /^(GET|POST|PUT) (\S+)\n?(\{[\s\S]*?\n\})?/gm;

async function main() {
  for (const m of text.matchAll(re)) {
    const [, method, path, body] = m;
    const res = await fetch(`${process.env.ELASTICSEARCH_URL}/${path}`, {
      method: body && method === "GET" ? "POST" : method,
      headers: { Authorization: `ApiKey ${process.env.ELASTICSEARCH_API_KEY}`, "Content-Type": "application/json" },
      body: body || undefined,
    });
    const j = await res.json();
    const hits = j.hits?.hits ?? [];
    const aggs = j.aggregations ? Object.keys(j.aggregations).map((k) => `${k}:${j.aggregations[k].buckets?.length ?? "?"}`).join(",") : "";
    const top = hits.slice(0, 3).map((h: { _source: { name?: string; kind?: string; neighborhood?: string } }) => `${h._source?.name}(${h._source?.kind ?? ""}${h._source?.neighborhood ? "," + h._source.neighborhood : ""})`).join("; ");
    console.log(`${res.ok ? "✓" : "✗"} ${method} ${path} → ${res.status} hits=${j.hits?.total?.value ?? (j._source ? 1 : 0)} ${aggs} ${top || (j.error ? JSON.stringify(j.error).slice(0, 200) : "")}`);
  }
}
main();
