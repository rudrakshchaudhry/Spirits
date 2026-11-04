/**
 * Live check that wish riddles point at their keepsake: generates revisit
 * wishes for an ALREADY-CACHED spirit with a few keepsakes. Mistral calls and
 * Elasticsearch reads only; never creates or regenerates a card.
 * Run: npx tsx scripts/check-riddles.ts [placeId]
 */
import { getCachedCard, getPlace } from "../lib/spirits/card";
import { makeBonusWish } from "../lib/spirits/bonusWish";
import { loadEnv } from "./lib/env";

loadEnv();
async function main() {
  const placeId = process.argv[2] ?? "tree:260060";
  const [card, place] = await Promise.all([getCachedCard(`${placeId}:base`), getPlace(placeId)]);
  if (!card || !place) throw new Error(`no cached card for ${placeId} — meet that spirit in the game first`);
  for (const k of ["palm_frond", "old_brass_key", "coffee_bean"]) {
    const w = await makeBonusWish(card, place, k);
    console.log(`${k}: "${w.theme}"\n  1: ${w.riddles[0]}\n  2: ${w.riddles[1]}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
