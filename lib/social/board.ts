import { cacheLife } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type CrewRow = { hood: string; members: number; chunks: number; friends: number; wishes: number; score: number };

/** Weekly crew scores (spec §14.1), cached 10 min per week. */
export async function crewBoard(weekStartIso: string): Promise<CrewRow[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 600, expire: 3600 });
  const { data, error } = await supabaseAdmin().rpc("crew_scores", { p_since: weekStartIso });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CrewRow[]).map((r) => ({ ...r, score: Math.round(r.score * 10) / 10 })).sort((a, b) => b.score - a.score);
}
