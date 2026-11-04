/** Pre-demo health check: Mistral JSON chat, streaming, moderation, embeddings. Run: npx tsx scripts/smoke-mistral.ts */
import { Mistral } from "@mistralai/mistralai";
import { loadEnv } from "./lib/env";
loadEnv();
(async () => {
const m = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });
let t = Date.now();
const j = await m.chat.complete({ model: "mistral-large-latest", messages: [{ role: "user", content: 'Return JSON {"name": string} for a tree spirit.' }], responseFormat: { type: "json_object" } });
console.log("json", Date.now() - t, "ms", j.choices?.[0]?.message?.content);
t = Date.now();
const s = await m.chat.stream({ model: "mistral-small-latest", messages: [{ role: "user", content: "Say hi in 5 words." }] });
let first = 0, out = "";
for await (const ev of s) { if (!first) first = Date.now() - t; out += ev.data.choices[0]?.delta.content ?? ""; }
console.log("stream first", first, "ms:", out);
const mod = await m.classifiers.moderate({ model: "mistral-moderation-2603", inputs: ["I love this little tree."] });
console.log("mod", JSON.stringify(mod.results[0]).slice(0, 200));
const e = await m.embeddings.create({ model: "mistral-embed", inputs: ["sea shell by the ocean"] });
console.log("embed dims", e.data[0].embedding?.length);

})();
