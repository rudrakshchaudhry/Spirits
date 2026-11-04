"use client";
import { create } from "zustand";
import type { ConditionsView } from "@/lib/conditions/rules";
import type { MeView } from "@/lib/social/types";

/** A spirit the player can interact with (from the world layer). */
export type SpiritRef = {
  spiritId: string;
  placeId: string;
  kind: string;
  family: string;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  look?: string;
  seed: number;
  /** condition spirit variant */
  variant?: "night" | "fog" | "rain" | "blossom";
};

/** Shared Phaser ↔ React state (spec §3: event bus + Zustand store). */
export type GameState = {
  ready: boolean;
  /** Touch joystick vector, each axis in [-1, 1]. Phaser reads this every frame. */
  joystick: { x: number; y: number };
  /** Player position in fractional world tiles (throttled ~10 Hz). */
  player: { x: number; y: number; lat: number; lon: number };
  neighborhood: string | null;
  /** Bumps each time a title card should show. */
  titleCard: { name: string; tagline: string; at: number } | null;
  devMode: boolean;
  /** spirits currently loaded around the player (dev readout) */
  spiritsNearby: number;
  /** closest spirit within reach (drives the "Press E" prompt) */
  nearby: SpiritRef | null;
  /** spirit currently in an encounter dialog */
  encounter: SpiritRef | null;
  atlasOpen: boolean;
  /** spirit ids befriended this session (world shows a heart) */
  friends: Record<string, true>;
  toast: { text: string; at: number } | null;
  /** live world conditions (spec §12) */
  conditions: ConditionsView | null;
  /** dev panel override, e.g. "fog.night" ("" = force clear); null = live */
  forcedCond: string | null;
  /** player profile, stats, unlocks, companion (GET /api/profile/me) */
  me: MeView | null;
  townOpen: boolean;
  setJoystick: (x: number, y: number) => void;
};

export const useGame = create<GameState>((set) => ({
  ready: false,
  joystick: { x: 0, y: 0 },
  player: { x: 0, y: 0, lat: 0, lon: 0 },
  neighborhood: null,
  titleCard: null,
  devMode: false,
  spiritsNearby: 0,
  nearby: null,
  encounter: null,
  atlasOpen: false,
  friends: {},
  toast: null,
  conditions: null,
  forcedCond: null,
  me: null,
  townOpen: false,
  setJoystick: (x, y) => set({ joystick: { x, y } }),
}));
