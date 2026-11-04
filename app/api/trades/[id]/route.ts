import { NextResponse } from "next/server";
import { TRADE_LIMITS, cleanBag, tradesToday } from "@/lib/social/trades";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";

const MESSAGES: Record<string, string> = {
  not_found: "that trade is gone",
  not_pending: "that trade was already settled",
  not_yours: "only the recipient can accept",
  offer_missing: "they no longer have what they offered",
  request_missing: "you don't have what they asked for",
};

/** POST /api/trades/:id { action: accept | decline | cancel | counter, offer?, request? } */
export async function POST(req: Request, ctx: RouteContext<"/api/trades/[id]">) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; offer?: unknown; request?: unknown };
  const sb = supabaseAdmin();
  const { data: t } = await sb.from("trades").select("*").eq("id", id).maybeSingle();
  if (!t || (t.from_id !== player.id && t.to_id !== player.id)) return NextResponse.json({ error: "that trade is gone" }, { status: 404 });

  switch (body.action) {
    case "accept": {
      const { data, error } = await sb.rpc("execute_trade", { p_trade: id, p_actor: player.id });
      if (error) return NextResponse.json({ error: /pocket_full/.test(error.message) ? "someone's pocket is full for that keepsake" : error.message }, { status: 409 });
      if (data !== "ok") return NextResponse.json({ error: MESSAGES[data as string] ?? data }, { status: 409 });
      return NextResponse.json({ ok: true, status: "accepted" });
    }
    case "decline":
    case "cancel": {
      const mine = body.action === "decline" ? t.to_id === player.id : t.from_id === player.id;
      if (!mine || t.status !== "pending") return NextResponse.json({ error: "can't do that" }, { status: 400 });
      await sb.from("trades").update({ status: body.action === "decline" ? "declined" : "cancelled", resolved_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
      return NextResponse.json({ ok: true });
    }
    case "counter": {
      if (t.to_id !== player.id || t.status !== "pending") return NextResponse.json({ error: "can't counter that" }, { status: 400 });
      const offer = cleanBag(body.offer), request = cleanBag(body.request);
      if (typeof offer === "string" || typeof request === "string") return NextResponse.json({ error: typeof offer === "string" ? offer : request }, { status: 400 });
      if ((await tradesToday(player.id)) >= TRADE_LIMITS.perDay) return NextResponse.json({ error: "that's enough trades for today" }, { status: 429 });
      await sb.from("trades").update({ status: "countered", resolved_at: new Date().toISOString() }).eq("id", id).eq("status", "pending");
      const { data, error } = await sb.from("trades").insert({ from_id: player.id, to_id: t.from_id, offer, request, parent_id: id }).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: data.id });
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
