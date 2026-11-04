"use client";
import { useGame } from "@/lib/game/store";

/** Loading state + (dev) coordinates readout. */
export default function StatusBar() {
  const ready = useGame((s) => s.ready);
  const dev = useGame((s) => s.devMode);
  const p = useGame((s) => s.player);
  const spirits = useGame((s) => s.spiritsNearby);

  if (!ready)
    return (
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <p className="font-pixel animate-pulse text-lg text-slate-100 motion-reduce:animate-none">Waking the city…</p>
      </div>
    );

  return (
    <div className={`pointer-events-none absolute bottom-3 right-3 ${dev ? "" : "hidden sm:block"} rounded bg-slate-950/55 px-2 py-1 text-right font-mono text-[11px] leading-tight text-slate-200`}>
      {dev && (
        <div>
          {p.lat.toFixed(5)}, {p.lon.toFixed(5)} · tile {Math.floor(p.x)},{Math.floor(p.y)} · {spirits} spirits loaded
        </div>
      )}
      <div className="hidden sm:block">WASD / arrows · E meet · B atlas · T town · M map</div>
    </div>
  );
}
