"use client";
import { useEffect, useRef, useState } from "react";
import { bus } from "@/lib/game/bus";
import { useGame } from "@/lib/game/store";

/** Baked minimap scale: 1 image px = 4 tiles (see scripts/bake-tiles.ts). */
const TILES_PER_PX = 4;
const ZOOM = 2; // css px per minimap px in the corner view

export default function Minimap() {
  const player = useGame((s) => s.player);
  const hood = useGame((s) => s.neighborhood);
  const dev = useGame((s) => s.devMode);
  const ready = useGame((s) => s.ready);
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const bigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg({ w: i.naturalWidth, h: i.naturalHeight });
    i.src = "/minimap.png";
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "m" || e.key === "M") setExpanded((v) => !v);
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!img || !ready) return null;
  const mx = player.x / TILES_PER_PX, my = player.y / TILES_PER_PX;

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Open city map (M)"
        className="absolute right-3 top-3 h-28 w-28 overflow-hidden rounded-lg border-2 border-slate-900/60 bg-[#2e5c8a] shadow-lg sm:h-42 sm:w-42"
      >
        <div
          className="absolute"
          style={{
            width: img.w * ZOOM,
            height: img.h * ZOOM,
            left: `calc(50% - ${mx * ZOOM}px)`,
            top: `calc(50% - ${my * ZOOM}px)`,
            backgroundImage: "url(/minimap.png)",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        />
        <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow" />
        <span className="absolute inset-x-0 bottom-0 truncate bg-slate-950/65 px-2 py-0.5 text-left text-[11px] text-slate-100">
          {hood ?? "The Bay"}
        </span>
      </button>

      {expanded && (
        <div
          className="absolute inset-0 z-20 grid place-items-center bg-slate-950/70 p-4"
          onClick={() => setExpanded(false)}
        >
          <div className="flex max-h-full w-full max-w-[min(90vh,720px)] flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-slate-100">
              <span className="font-pixel text-lg">San Francisco</span>
              <button type="button" className="rounded px-2 py-1 text-sm hover:bg-white/10" onClick={() => setExpanded(false)}>
                Close
              </button>
            </div>
            <div
              ref={bigRef}
              className={`relative w-full overflow-hidden rounded-lg border-2 border-slate-900 ${dev ? "cursor-crosshair" : ""}`}
              style={{ aspectRatio: `${img.w} / ${img.h}` }}
              onClick={(e) => {
                if (!dev || !bigRef.current) return;
                const r = bigRef.current.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * img.w * TILES_PER_PX;
                const y = ((e.clientY - r.top) / r.height) * img.h * TILES_PER_PX;
                bus.emit("player:teleport", { x, y });
                setExpanded(false);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/minimap.png" alt="Map of San Francisco" className="h-full w-full" style={{ imageRendering: "pixelated" }} />
              <span
                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-400 shadow"
                style={{ left: `${(mx / img.w) * 100}%`, top: `${(my / img.h) * 100}%` }}
              />
            </div>
            <p className="text-center text-xs text-slate-300">
              {dev ? "Dev: click anywhere to teleport." : "Press M to toggle the map."}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
