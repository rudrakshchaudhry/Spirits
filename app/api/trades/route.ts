import { NextResponse } from "next/server";
import { inventoryOf } from "@/lib/keepsakes/server";
import { friendUnlocks } from "@/lib/social/server";
import { TRADE_LIMITS, cleanBag, handlesFor, tradesToday } from "@/lib/social/trades";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

/** GET /api/trades → incoming (pending) + recent outgoing, with handles. */
export async function GET(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const sb = supabaseAdmin();
  const [{ data: incoming }, { data: outgoing }] = await Promise.all([
    sb.from("trades").select("*").eq("to_id", player.id).eq("status", "pending").order("created_at", { ascending: false }).limit(20),
    sb.from("trades").select("*").eq("from_id", player.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const handles = await handlesFor([...(incoming ?? []).map((t) => t.from_id), ...(outgoing ?? []).map((t) => t.to_id)]);
  const view = (t: Record<string, unknown>, other: string) => ({ ...t, from_id: undefined, to_id: undefined, with: handles[other] ?? "a wanderer" });
  return NextResponse.json({
    incoming: (incoming ?? []).map((t) => view(t, t.from_id)),
    outgoing: (outgoing ?? []).map((t) => view(t, t.to_id)),
    limits: { ...TRADE_LIMITS, usedToday: await tradesToday(player.id) },
  });
}

/** POST /api/trades { to, offer, request } — propose a keepsake trade by handle. */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { to?: string; offer?: unknown; request?: unknown };
  if (!(await friendUnlocks(player.id)).trading) return NextResponse.json({ error: "befriend 5 spirits to unlock trading" }, { status: 403 });
  const offer = cleanBag(body.offer), request = cleanBag(body.request);
  if (typeof offer === "string") return NextResponse.json({ error: offer }, { status: 400 });
  if (typeof request === "string") return NextResponse.json({ error: request }, { status: 400 });
  if (!Object.keys(offer).length && !Object.keys(request).length) return NextResponse.json({ error: "add something to the trade" }, { status: 400 });
  if ((await tradesToday(player.id)) >= TRADE_LIMITS.perDay) return NextResponse.json({ error: `that's ${TRADE_LIMITS.perDay} trades today — try tomorrow` }, { status: 429 });

  const sb = supabaseAdmin();
  const { data: target } = await sb.from("profiles").select("id").eq("handle", String(body.to ?? "").trim().toLowerCase()).maybeSingle();
  if (!target || target.id === player.id) return NextResponse.json({ error: "no wanderer by that name" }, { status: 404 });
  if (!(await friendUnlocks(target.id)).trading) return NextResponse.json({ error: "they haven't unlocked trading yet" }, { status: 403 });
  const inv = await inventoryOf(player.id).catch(() => ({}) as Record<string, number>);
  for (const [k, n] of Object.entries(offer)) if ((inv[k] ?? 0) < n) return NextResponse.json({ error: "you don't have all of that" }, { status: 400 });

  const { data, error } = await sb.from("trades").insert({ from_id: player.id, to_id: target.id, offer, request }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
