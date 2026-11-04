import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { getOrCreateCard } from "@/lib/spirits/card";
import { featuredDay, featuredFor } from "@/lib/world/featured";

export const maxDuration = 60;

/** Daily 06:00 PT: pick today's featured rare and pre-generate its card so nobody waits. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const f = await featuredFor(featuredDay());
  if (!f) return NextResponse.json({ ok: true, featured: null });
  const card = await getOrCreateCard(f.placeId);
  return NextResponse.json({ ok: true, featured: { neighborhood: f.neighborhood, name: card.name, model: card.model } });
}
