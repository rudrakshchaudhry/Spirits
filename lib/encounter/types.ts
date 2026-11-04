import type { GameContent } from "./games";

export type EncounterSpirit = {
  id: string;
  name: string;
  persona: string;
  temperament: string;
  family: string;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  look: string | null;
  seed: number;
  model: string;
};
export type EncounterPlace = { id: string; name: string; kind: string; neighborhood: string | null };

export type StartResponse =
  | { mode: "meet"; spirit: EncounterSpirit; place: EncounterPlace; trust: number; riddle: string; riddlesHeard: number; game: GameContent; token: string; greeting: string }
  | { mode: "friend"; spirit: EncounterSpirit; place: EncounterPlace; trust: number; lore: string[]; greeting: string }
  | { mode: "wandering"; spirit: EncounterSpirit; place: EncounterPlace; until: string; trust: number };

export type PlayResponse = { trust: number; gained: number; befriended: boolean; lore?: string | null; wanderedUntil?: string; already?: boolean };
