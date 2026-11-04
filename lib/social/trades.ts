import { KEEPSAKES } from "@/lib/keepsakes/catalog";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const TRADE_LIMITS = { perDay: 10, perItem: 5, kinds: 4 };

/** Validate an item bag like {"sea_shell": 2}. */
export function cleanBag(raw: unknown): Record<string, number> | string {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (!Object.hasOwn(KEEPSAKES, k)) return `unknown keepsake ${k}`;
    if (!Number.isInteger(n) || n < 1) return "quantities must be whole numbers";
    if (n > TRADE_LIMITS.perItem) return `at most ${TRADE_LIMITS.perItem} of one keepsake per trade`;
    out[k] = n;
  }
  if (Object.keys(out).length > TRADE_LIMITS.kinds) return `at most ${TRADE_LIMITS.kinds} kinds per side`;
  return out;
}

export async function tradesToday(playerId: string) {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabaseAdmin().from("trades").select("*", { count: "exact", head: true }).eq("from_id", playerId).gte("created_at", since);
  return count ?? 0;
}

export async function handlesFor(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await supabaseAdmin().from("profiles").select("id,handle").in("id", [...new Set(ids)]);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.handle ?? "a wanderer"]));
}
