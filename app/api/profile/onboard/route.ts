import { NextResponse } from "next/server";
import { INDEX, es } from "@/lib/es/client";
import { COMPANIONS } from "@/lib/social/rules";
import { checkHandle, meFor, profileOf } from "@/lib/social/server";
import { playerFrom, supabaseAdmin } from "@/lib/supabase/admin";
import { CHUNKS_PER_HOOD } from "@/lib/keepsakes/glints";

const DAY = 86_400_000;

/**
 * POST /api/profile/onboard { handle, home_hood, companion } (spec §13.1)
 * Sets the handle (moderated), home neighbourhood (= crew; changeable once per
 * 30 days) and starter companion. Returns a park in the home hood to spawn at.
 */
export async function POST(req: Request) {
  const player = await playerFrom(req);
  if (!player) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { handle?: string; home_hood?: string; companion?: string };
  const current = await profileOf(player.id);

  const patch: Record<string, unknown> = {};
  if (body.handle !== undefined && body.handle !== current?.handle) {
    const h = await checkHandle(String(body.handle));
    if (!h.ok) return NextResponse.json({ error: h.error, field: "handle" }, { status: 400 });
    patch.handle = h.handle;
  }
  if (body.home_hood !== undefined && body.home_hood !== current?.home_hood) {
    if (!(body.home_hood in CHUNKS_PER_HOOD)) return NextResponse.json({ error: "unknown neighborhood", field: "home_hood" }, { status: 400 });
    if (current?.home_hood && current.crew_changed_at && Date.now() - Date.parse(current.crew_changed_at) < 30 * DAY) {
      return NextResponse.json({ error: "you can change crews once every 30 days", field: "home_hood" }, { status: 400 });
    }
    patch.home_hood = body.home_hood;
    if (current?.home_hood) patch.crew_changed_at = new Date().toISOString();
  }
  if (body.companion !== undefined) {
    if (!(body.companion in COMPANIONS)) return NextResponse.json({ error: "pick Mote, Sprig or Tidepip", field: "companion" }, { status: 400 });
    if (current?.companion_species && current.companion_species !== body.companion) {
      return NextResponse.json({ error: "your companion has already chosen you", field: "companion" }, { status: 400 });
    }
    patch.companion_species = body.companion;
  }
  if (!current?.onboarded_at) patch.onboarded_at = new Date().toISOString();
  const { error } = await supabaseAdmin().from("profiles").upsert({ id: player.id, ...patch });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // spawn at the largest park in the home neighbourhood (spec §13.1 step 4)
  let spawn: { lat: number; lon: number } | null = null;
  const hood = (patch.home_hood as string | undefined) ?? current?.home_hood;
  if (hood) {
    const r = await es().search<{ location: { lat: number; lon: number } }>({
      index: INDEX.places, size: 1, _source: ["location"],
      query: { bool: { filter: [{ term: { kind: "park" } }, { term: { neighborhood: hood } }] } },
      sort: [{ "attrs.acres": { order: "desc", unmapped_type: "float" } }],
    });
    spawn = r.hits.hits[0]?._source?.location ?? null;
  }
  return NextResponse.json({ ...(await meFor(player.id)), spawn });
}
