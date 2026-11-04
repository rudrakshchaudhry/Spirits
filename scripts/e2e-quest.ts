/**
 * API end-to-end check of Checkpoint D against a running dev server:
 * guest → meet the quest spirit → play → pick up a sea shell at Ocean Beach →
 * gift it → rare friendship + secret chapter → Atlas shows it.
 * Run (dev server on :3000): npx tsx scripts/e2e-quest.ts
 */
import { loadEnv } from "./lib/env";
loadEnv();
const B = process.env.E2E_BASE ?? "http://localhost:3000";

async function j<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(B + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

async function main() {
  const creds = (await j<{ email: string; password: string }>("/api/guest", { method: "POST" })).body;
  const auth = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  }).then((r) => r.json());
  const token: string = auth.access_token;

  // 1. meet the quest spirit
  const placeId = process.argv[2] ?? "";
  const start = await j<any>("/api/encounter/start", { method: "POST", token, body: JSON.stringify({ placeId }) });
  console.log("start", start.status, start.body.spirit?.name, "trust", start.body.trust, "riddle:", start.body.riddle);
  // 2. play (wait out the min duration, mediocre score → not befriended)
  const minMs = Math.round((start.body.game.notes * 60000) / start.body.game.bpm) + 200;
  await new Promise((r) => setTimeout(r, minMs));
  const play = await j<any>("/api/encounter/play", { method: "POST", token, body: JSON.stringify({ token: start.body.token, score: 0.3, durationMs: minMs, demo: true }) });
  console.log("play", play.status, JSON.stringify(play.body));
  // 3. find + pick up a sea shell on the coast
  const coast = ["1_30", "1_31", "1_32", "1_33", "1_34", "2_36", "2_37", "2_38", "0_24", "1_25", "1_26"];
  const world = await j<any>(`/api/world?chunks=${coast.join(",")}`);
  const shell = world.body.chunks.flatMap((c: any) => c.glints).find((g: any) => g.type === "sea_shell");
  console.log("shell glint", shell?.id);
  const pick = await j<any>("/api/pickup", { method: "POST", token, body: JSON.stringify({ glintId: shell.id }) });
  console.log("pickup", pick.status, JSON.stringify(pick.body));
  const again = await j<any>("/api/pickup", { method: "POST", token, body: JSON.stringify({ glintId: shell.id }) });
  console.log("pickup again", again.status, JSON.stringify(again.body));
  // 4. wrong gift is declined and kept; then the wished gift
  const inv = await j<any>("/api/inventory", { token });
  console.log("inventory", JSON.stringify(inv.body.items));
  const gift = await j<any>("/api/encounter/gift", { method: "POST", token, body: JSON.stringify({ token: start.body.token, keepsake: "sea_shell" }) });
  console.log("gift", gift.status, JSON.stringify(gift.body));
  // 5. explore + atlas
  await j("/api/explore", { method: "POST", token, body: JSON.stringify({ chunks: ["34_21", "1_31", "1_32"] }) });
  const atlas = await j<any>("/api/atlas", { token });
  const f = atlas.body.friends?.[0];
  console.log("atlas", JSON.stringify(atlas.body.stats), "friend:", f?.spirit_name, f?.status, "lore:", f?.lore.length, "explored:", JSON.stringify(atlas.body.explored));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
