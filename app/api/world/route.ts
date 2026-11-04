import { NextResponse, type NextRequest } from "next/server";
import { condKey, conditionKeepsakes } from "@/lib/conditions/rules";
import { tagsFor } from "@/lib/conditions/server";
import { glintsForChunk, windowIndex } from "@/lib/keepsakes/glints";
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
    // Glints change every 2-hour window: the client puts `w` in the URL so caches key on it.
    const w = Number(sp.get("w"));
    const win = Number.isFinite(w) && Math.abs(w - windowIndex()) <= 1 ? w : windowIndex();
    // Live conditions (or the dev panel's forced ones, when the server allows it).
    const { tags, cond } = await tagsFor(sp.get("cond"));
    const ck = condKey(tags);
    const extra = conditionKeepsakes(tags, cond.phase);
    const chunks = await Promise.all(
      keys.map(async (k) => {
        const c = await chunkEntities(k, date, ck);
        return { ...c, glints: glintsForChunk(k, c.entities, win, { extra }) };
      }),
    );
    const body: WorldResponse = { date, window: win, cond: ck, chunks };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (e) {
    console.error("world query failed", e);
    return NextResponse.json({ error: "world unavailable" }, { status: 503 });
  }
}
