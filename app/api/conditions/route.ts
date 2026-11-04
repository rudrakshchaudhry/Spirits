import { NextResponse, type NextRequest } from "next/server";
import { activeTags, condKey } from "@/lib/conditions/rules";
import { devConditionsAllowed, tagsFor } from "@/lib/conditions/server";
import { featuredDay, featuredFor, hazeMap } from "@/lib/world/featured";

/**
 * GET /api/conditions[?cond=night.fog] → live world state (spec §12):
 * day/night phase, fog, rain, blossom, sun times, per-neighbourhood haze, and
 * today's featured-rare hint (neighbourhood only).
 */
export async function GET(req: NextRequest) {
  const { cond } = await tagsFor(req.nextUrl.searchParams.get("cond"));
  const [haze, featured] = await Promise.all([hazeMap().catch(() => ({})), featuredFor(featuredDay()).catch(() => null)]);
  return NextResponse.json(
    {
      ...cond,
      tags: activeTags(cond),
      key: condKey(activeTags(cond)),
      devAllowed: devConditionsAllowed(),
      haze,
      featured: featured ? { family: featured.family, rarity: featured.rarity, neighborhood: featured.neighborhood, date: featured.date } : null,
    },
    { headers: { "Cache-Control": "public, max-age=120, s-maxage=300" } },
  );
}
