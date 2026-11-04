/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON in a dev-only e2e script */
/**
 * Checkpoint G end-to-end against a running dev server (needs ALLOW_DEV_CONDITIONS=1
 * and an active gathering: `npx tsx scripts/seed-gatherings.ts 3 --now`):
 * 3 guests onboard → demo mode → trade → crew board → profile → gathering co-op.
 */
import { loadEnv } from "./lib/env";
loadEnv();
const B = process.env.E2E_BASE ?? "http://localhost:3000";

async function call<T = any>(token: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(B + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}
async function guest(): Promise<string> {
  const creds = await (await fetch(B + "/api/guest", { method: "POST" })).json();
  const auth = await (await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "Content-Type": "application/json" }, body: JSON.stringify(creds),
  })).json();
  return auth.access_token;
}

async function main() {
  const tag = Date.now().toString(36).slice(-4);
  const [a, b, c] = await Promise.all([guest(), guest(), guest()]);
  const names = [`ana_${tag}`, `bo_${tag}`, `cy_${tag}`];
  for (const [i, t] of [a, b, c].entries()) {
    const r = await call(t, "/api/profile/onboard", { handle: names[i], home_hood: i === 2 ? "Sunset/Parkside" : "Mission", companion: ["mote", "sprig", "tidepip"][i] });
    console.log("onboard", names[i], r.status, r.body.error ?? `spawn ${JSON.stringify(r.body.spawn)}`);
    await call(t, "/api/profile/me", { demo: true });
  }
  const bad = await call(a, "/api/profile/onboard", { handle: "admin" });
  console.log("bad handle", bad.status, bad.body.error);

  // trade: a gives 2 sea shells for 1 coffee bean from b
  await call(a, "/api/dev/grant", { type: "sea_shell" }); await call(a, "/api/dev/grant", { type: "sea_shell" });
  await call(b, "/api/dev/grant", { type: "coffee_bean" });
  const t = await call(a, "/api/trades", { to: names[1], offer: { sea_shell: 2 }, request: { coffee_bean: 1 } });
  console.log("propose", t.status, JSON.stringify(t.body));
  const tooMany = await call(a, "/api/trades", { to: names[1], offer: { sea_shell: 6 }, request: {} });
  console.log("too many", tooMany.status, tooMany.body.error);
  const acc = await call(b, `/api/trades/${t.body.id}`, { action: "accept" });
  console.log("accept", acc.status, JSON.stringify(acc.body));
  const again = await call(b, `/api/trades/${t.body.id}`, { action: "accept" });
  console.log("accept again", again.status, again.body.error);
  console.log("inv a", JSON.stringify((await call(a, "/api/inventory")).body.items), "inv b", JSON.stringify((await call(b, "/api/inventory")).body.items));

  // exploration + crew board + profile
  await call(a, "/api/explore", { chunks: ["32_32", "32_33", "31_32"] });
  const board = await call(a, "/api/crews/board");
  console.log("board", board.status, JSON.stringify(board.body.top?.slice(0, 3)), "mine", JSON.stringify(board.body.mine), JSON.stringify(board.body.contribution));
  const prof = await call(c, `/api/profile/${names[0]}`);
  console.log("profile", prof.status, JSON.stringify(prof.body).slice(0, 200));

  // gathering co-op
  const act = await call(a, "/api/gatherings/active");
  const g = act.body.gatherings?.[0];
  console.log("active", act.status, g?.name, g?.id);
  for (const tok of [a, b, c]) console.log("checkin", (await call(tok, `/api/gatherings/${g.id}/checkin`, { demo: true })).status);
  const far = await call(a, `/api/gatherings/${g.id}/checkin`, { lat: 37.8, lon: -122.4, accuracy: 20 });
  console.log("far real checkin", far.status, far.body.error);
  const room = await call(a, `/api/gatherings/${g.id}`);
  const minMs = Math.round((room.body.game.notes * 60000) / room.body.game.bpm) + 300;
  await new Promise((r) => setTimeout(r, 100));
  for (const [i, tok] of [a, b, c].entries()) {
    const r = await call(tok, `/api/gatherings/${g.id}/play`, { score: [0.8, 0.7, 0.6][i], durationMs: minMs });
    console.log("play", i, r.status, JSON.stringify(r.body).slice(0, 220));
  }
  const atlas = await call(c, "/api/atlas");
  console.log("c atlas friends:", atlas.body.friends?.map((f: any) => `${f.spirit_name} (${f.status})`).join(", "));
}
main().catch((e) => { console.error(e); process.exit(1); });
