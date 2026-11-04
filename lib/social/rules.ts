/**
 * Progression rules (spec §13): milestones, companion evolution + traits.
 * Pure and client-safe.
 */
export type Stats = { friends: number; hoods: number; wishes: number; topHoods: string[] };
export type Unlocks = { crew: boolean; trading: boolean; gatherings: boolean; profiles: boolean };

export const COMPANIONS = {
  mote: { name: "Mote", blurb: "a little fog wisp who loves the west side", color: [214, 222, 236] as const },
  sprig: { name: "Sprig", blurb: "a sapling who never stops growing", color: [126, 186, 96] as const },
  tidepip: { name: "Tidepip", blurb: "a sea sprite who collects shiny things", color: [96, 176, 214] as const },
} as const;
export type CompanionSpecies = keyof typeof COMPANIONS;

export function unlocksFor(s: Stats, demo = false): Unlocks {
  if (demo) return { crew: true, trading: true, gatherings: true, profiles: true };
  return { crew: s.hoods >= 2, trading: s.friends >= 5, gatherings: s.friends >= 10, profiles: s.friends >= 5 };
}

/** The HUD always shows exactly one next goal (spec §13.3). */
export function nextGoal(s: Stats, u: Unlocks): string | null {
  const plural = (n: number, w: string) => `${n} more ${w}${n === 1 ? "" : "s"}`;
  if (!u.crew) return `Explore ${plural(2 - s.hoods, "neighborhood")} to unlock the crew board`;
  if (!u.trading) return `Befriend ${plural(5 - s.friends, "spirit")} to unlock trading`;
  if (!u.gatherings) return `Befriend ${plural(10 - s.friends, "spirit")} to unlock gatherings`;
  const f = companionForm(s);
  if (f === 1) return `Explore ${Math.max(0, 3 - s.hoods)} more neighborhoods & befriend ${Math.max(0, 5 - s.friends)} more spirits to grow your companion`;
  if (f === 2) return `Explore ${Math.max(0, 8 - s.hoods)} more neighborhoods & befriend ${Math.max(0, 20 - s.friends)} more spirits for your companion's final form`;
  return null;
}

/** Three forms (spec §13.2): 3 hoods + 5 friends, then 8 hoods + 20 friends. */
export function companionForm(s: Pick<Stats, "friends" | "hoods">): 1 | 2 | 3 {
  if (s.hoods >= 8 && s.friends >= 20) return 3;
  if (s.hoods >= 3 && s.friends >= 5) return 2;
  return 1;
}

export const companionXp = (s: Stats) => s.hoods * 10 + s.friends * 20 + s.wishes * 40;

/** Trait absorption: the top neighbourhoods add cosmetic parts. */
export const TRAITS: Record<string, string> = {
  "Outer Richmond": "shell", "Sunset/Parkside": "shell", Lakeshore: "shell", Seacliff: "shell", "Lincoln Park": "shell",
  Mission: "mural", "Bernal Heights": "mural",
  Chinatown: "lantern", "North Beach": "lantern",
  "Golden Gate Park": "leafcrown", Presidio: "leafcrown", "McLaren Park": "leafcrown",
  "Twin Peaks": "fogscarf", "West of Twin Peaks": "fogscarf", "Inner Sunset": "fogscarf",
  "Financial District/South Beach": "tophat", "South of Market": "tophat", "Mission Bay": "tophat",
  "Haight Ashbury": "flower", "Castro/Upper Market": "flower", "Noe Valley": "flower",
};
export const traitsFor = (topHoods: string[]) => [...new Set(topHoods.map((h) => TRAITS[h]).filter(Boolean))].slice(0, 2);
