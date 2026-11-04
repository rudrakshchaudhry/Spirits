/**
 * Live check that wish riddles point at their keepsake: generates revisit
 * wishes for one spirit with a few keepsakes (calls Mistral; writes nothing).
 * Run: npx tsx scripts/check-riddles.ts [placeId]
 */
import { getOrCreateCard, getPlace } from "../lib/spirits/card";
import { makeBonusWish } from "../lib/spirits/bonusWish";
import { loadEnv } from "./lib/env";

loadEnv();
async function main() {
  const placeId = process.argv[2] ?? "tree:260060";
  const [card, place] = await Promise.all([getOrCreateCard(placeId), getPlace(placeId)]);
  for (const k of ["palm_frond", "old_brass_key", "coffee_bean"]) {
    const w = await makeBonusWish(card, place!, k);
    console.log(`${k}: "${w.theme}"\n  1: ${w.riddles[0]}\n  2: ${w.riddles[1]}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
