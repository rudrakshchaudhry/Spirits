import { NextResponse } from "next/server";
import { devConditionsAllowed } from "@/lib/conditions/server";
import { featuredDay, featuredFor } from "@/lib/world/featured";

/**
 * GET /api/featured → today's featured rare: neighbourhood hint only (spec §16).
 * `?reveal=1` adds the exact place for the dev panel's "jump to featured",
 * honoured only when dev conditions are allowed on this server.
 */
export async function GET(req: Request) {
  const f = await featuredFor(featuredDay());
  if (!f) return NextResponse.json({ featured: null });
  const reveal = new URL(req.url).searchParams.get("reveal") === "1" && devConditionsAllowed();
  return NextResponse.json({
    featured: { family: f.family, rarity: f.rarity, neighborhood: f.neighborhood, date: f.date, ...(reveal ? { placeId: f.placeId, location: f.location } : {}) },
  });
}
