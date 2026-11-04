import { NextResponse, type NextRequest } from "next/server";
import { sfDate } from "@/lib/spirits/spawn";
import type { WorldResponse } from "@/lib/world/entities";
import { chunkEntities } from "@/lib/world/query";

/**
 * GET /api/world?chunks=30_32,31_32&date=2026-11-03
 * Entities + active spirits for each requested chunk (spec §16). The client
 * batches the chunks around the player; each chunk is cached independently.
 * (Spec sketched `?bbox=`; per-chunk keys cache far better.)
 */
const MAX_CHUNKS = 16;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const keys = (sp.get("chunks") ?? "").split(",").filter((k) => /^\d{1,3}_\d{1,3}$/.test(k));
  if (!keys.length || keys.length > MAX_CHUNKS) {
    return NextResponse.json({ error: `pass 1–${MAX_CHUNKS} chunk keys as ?chunks=cx_cy,…` }, { status: 400 });
  }
  const dateParam = sp.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : sfDate();
  try {
    const chunks = await Promise.all(keys.map((k) => chunkEntities(k, date)));
    const body: WorldResponse = { date, chunks };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    console.error("world query failed", e);
    return NextResponse.json({ error: "world unavailable" }, { status: 503 });
  }
}
