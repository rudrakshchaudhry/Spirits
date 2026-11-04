import { flagged } from "@/lib/mistral/client";
import { devConditionsAllowed } from "@/lib/conditions/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { type Stats, companionForm, companionXp, nextGoal, traitsFor, unlocksFor } from "./rules";

/** A neighbourhood counts as explored after walking 3 of its chunks. */
const EXPLORED_CHUNKS = 3;

export async function statsFor(playerId: string): Promise<Stats> {
  const sb = supabaseAdmin();
  const [{ data: chunks }, { count: friends }, { count: wishes }, { data: bonus }] = await Promise.all([
    sb.from("explored_chunks").select("neighborhood").eq("player_id", playerId),
    sb.from("friendships").select("*", { count: "exact", head: true }).eq("player_id", playerId).neq("status", "met"),
    sb.from("friendships").select("*", { count: "exact", head: true }).eq("player_id", playerId).not("wish_fulfilled_at", "is", null),
    sb.from("friendships").select("bonus_wishes_granted").eq("player_id", playerId).gt("bonus_wishes_granted", 0),
  ]);
  const bonusWishes = (bonus ?? []).reduce((a, r) => a + (r.bonus_wishes_granted ?? 0), 0);
  const per: Record<string, number> = {};
  for (const c of chunks ?? []) if (c.neighborhood) per[c.neighborhood] = (per[c.neighborhood] ?? 0) + 1;
  const ranked = Object.entries(per).sort((a, b) => b[1] - a[1]);
  return {
    friends: friends ?? 0,
    wishes: (wishes ?? 0) + bonusWishes, // revisit wishes count as Atlas stars + companion XP
    hoods: ranked.filter(([, n]) => n >= EXPLORED_CHUNKS).length,
    topHoods: ranked.slice(0, 2).map(([h]) => h),
  };
}

export type Profile = {
  id: string;
  handle: string | null;
  home_hood: string | null;
  companion_species: string | null;
  demo_mode: boolean;
  onboarded_at: string | null;
  crew_changed_at: string | null;
  favorite_spirits: string[];
};

export async function profileOf(playerId: string): Promise<Profile | null> {
  const { data } = await supabaseAdmin()
    .from("profiles")
    .select("id,handle,home_hood,companion_species,demo_mode,onboarded_at,crew_changed_at,favorite_spirits")
    .eq("id", playerId)
    .maybeSingle();
  return data as Profile | null;
}

export async function meFor(playerId: string) {
  const [profile, stats] = await Promise.all([profileOf(playerId), statsFor(playerId)]);
  // demo mode unlocks everything (spec §13.3) — only where the server allows demo features
  const demo = !!profile?.demo_mode && devConditionsAllowed();
  const unlocks = unlocksFor(stats, demo);
  return {
    profile,
    stats,
    unlocks,
    demo,
    companion: profile?.companion_species
      ? { species: profile.companion_species, form: companionForm(stats), xp: companionXp(stats), traits: traitsFor(stats.topHoods) }
      : null,
    nextGoal: nextGoal(stats, unlocks),
  };
}
export type Me = Awaited<ReturnType<typeof meFor>>;

/** Handles: 3–20 chars [a-z0-9_.-], a small blocklist, then Mistral moderation (spec §14.5). */
const BLOCK = /(admin|moderator|official|staff|sfgov|mayor)/i;
export async function checkHandle(raw: string, selfId?: string): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  const handle = raw.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,20}$/.test(handle)) return { ok: false, error: "3–20 letters, numbers, dots, dashes or underscores" };
  if (BLOCK.test(handle)) return { ok: false, error: "please pick a different name" };
  if (await flagged([handle.replace(/[_.-]/g, " ")]).catch(() => false)) return { ok: false, error: "please pick a kinder name" };
  const { data } = await supabaseAdmin().from("profiles").select("id").eq("handle", handle).maybeSingle();
  if (data && data.id !== selfId) return { ok: false, error: "that name is taken" };
  return { ok: true, handle };
}

/**
 * Monday 00:00 America/Los_Angeles for the current week (spec §14.1), using the
 * UTC offset of that Monday itself — not of `now` — so DST weeks are exact.
 */
export function weekStart(now = new Date()): Date {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  const mondayUtcNoon = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - dow, 12);
  // PT is UTC-7 or UTC-8: pick the candidate whose PT wall-clock reads 00:00 on that Monday
  for (const off of [7, 8]) {
    const cand = new Date(mondayUtcNoon - 12 * 3600_000 + off * 3600_000);
    const h = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" }).format(cand);
    if (Number(h) === 0) return cand;
  }
  return new Date(mondayUtcNoon - 12 * 3600_000 + 8 * 3600_000);
}

/**
 * Cheap unlock check for hot paths that only need the friend-based unlocks
 * (trading, gatherings): one profile read + one count, not the full meFor().
 */
export async function friendUnlocks(playerId: string): Promise<{ trading: boolean; gatherings: boolean; demo: boolean }> {
  const sb = supabaseAdmin();
  const [{ data: p }, { count }] = await Promise.all([
    sb.from("profiles").select("demo_mode").eq("id", playerId).maybeSingle(),
    sb.from("friendships").select("*", { count: "exact", head: true }).eq("player_id", playerId).neq("status", "met"),
  ]);
  const demo = !!p?.demo_mode && devConditionsAllowed();
  const f = count ?? 0;
  return { trading: demo || f >= 5, gatherings: demo || f >= 10, demo };
}
