import type { Stats, Unlocks } from "./rules";

/** Client view of GET /api/profile/me. */
export type MeView = {
  profile: { id: string; handle: string | null; home_hood: string | null; companion_species: string | null; demo_mode: boolean; onboarded_at: string | null; favorite_spirits: string[] } | null;
  stats: Stats;
  unlocks: Unlocks;
  demo: boolean;
  companion: { species: string; form: 1 | 2 | 3; xp: number; traits: string[] } | null;
  nextGoal: string | null;
};
