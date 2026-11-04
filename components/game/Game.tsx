"use client";
import dynamic from "next/dynamic";
import Atlas from "@/components/atlas/Atlas";
import DevPanel from "@/components/hud/DevPanel";
import WorldConditions from "@/components/hud/WorldConditions";
import MeSync from "@/components/social/MeSync";
import TownPanel from "@/components/social/TownPanel";
import EncounterDialog from "@/components/encounter/EncounterDialog";
import InteractPrompt from "@/components/hud/InteractPrompt";
import Joystick from "@/components/hud/Joystick";
import Minimap from "@/components/hud/Minimap";
import StatusBar from "@/components/hud/StatusBar";
import TitleCard from "@/components/hud/TitleCard";

// Phaser touches `window` at import time — client only.
const GameCanvas = dynamic(() => import("./GameCanvas"), { ssr: false });

export default function Game() {
  return (
    <main className="relative h-dvh w-full touch-none select-none overflow-hidden bg-[#2e5c8a]">
      <GameCanvas />
      <WorldConditions />
      <TitleCard />
      <Minimap />
      <StatusBar />
      <Joystick />
      <InteractPrompt />
      <Atlas />
      <TownPanel />
      <MeSync />
      <DevPanel />
      <EncounterDialog />
    </main>
  );
}
