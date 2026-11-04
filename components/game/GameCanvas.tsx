"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/game/store";

/** Dolores Park — a friendly first step in the Mission. */
const DEFAULT_SPAWN = { lat: 37.7596, lon: -122.4269 };

function readSpawn(params: URLSearchParams) {
  const at = params.get("at")?.split(",").map(Number);
  if (at && at.length === 2 && at.every(Number.isFinite)) return { lat: at[0], lon: at[1] };
  return DEFAULT_SPAWN;
}

export default function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let game: import("phaser").Game | null = null;
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    useGame.setState({ devMode: params.get("dev") === "1" });
    // dev-only test hook: lets scripts open a specific encounter (?dev=1)
    if (params.get("dev") === "1") (window as unknown as { __game?: typeof useGame }).__game = useGame;

    (async () => {
      try {
        const [{ default: Phaser }, { WorldScene }, { ChunkStore }, { loadNeighborhoods }] = await Promise.all([
          import("phaser"),
          import("@/game/WorldScene"),
          import("@/lib/world/chunks"),
          import("@/lib/world/neighborhoods"),
        ]);
        const [chunks, hoods] = await Promise.all([ChunkStore.load(), loadNeighborhoods()]);
        if (cancelled || !host.current) return;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: host.current,
          pixelArt: true,
          roundPixels: true,
          backgroundColor: "#2e5c8a",
          scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
          input: { keyboard: true, touch: true },
          banner: false,
        });
        game.scene.add("world", WorldScene, true, {
          chunks,
          hoods,
          spawn: readSpawn(params),
          noclip: params.get("noclip") === "1",
        });
      } catch (e) {
        setError((e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
      game?.destroy(true);
      useGame.setState({ ready: false });
    };
  }, []);

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-slate-900 p-6 text-center text-slate-100">
          <p className="max-w-sm font-mono text-sm">{error}</p>
        </div>
      )}
    </>
  );
}
