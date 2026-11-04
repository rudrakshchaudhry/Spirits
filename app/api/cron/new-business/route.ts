import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import ingestBusinesses from "@/scripts/ingest/business";

export const maxDuration = 300;

/** Daily: re-ingest businesses → new openings become "grand opening" spirits; closed shops are pruned. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const n = await ingestBusinesses();
  return NextResponse.json({ ok: true, businesses: n });
}
