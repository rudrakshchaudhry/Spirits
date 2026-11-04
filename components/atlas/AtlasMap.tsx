"use client";
import { useEffect, useState } from "react";
import type { HazeEntry } from "@/lib/conditions/rules";
import { type Hood, loadNeighborhoods } from "@/lib/world/neighborhoods";

const MAP_W = 3520, MAP_H = 3529; // world tiles (matches public/minimap.png extent)

/**
 * Atlas map (spec §13.4): neighbourhood fog-of-war by explored %, and a soft
 * glow on neighbourhoods where an open wish can be granted. Never shows the
 * exact position of anything undiscovered.
 */
export default function AtlasMap({ explored, glow, featured, haze }: {
  explored: Record<string, number>; glow: string[]; featured?: string | null; haze?: Record<string, HazeEntry>;
}) {
  const [hoods, setHoods] = useState<Hood[] | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    loadNeighborhoods().then(setHoods, () => setHoods([]));
  }, []);
  const glowSet = new Set(glow);
  const label = hover ?? (glow.length ? `Wish glow: ${glow.join(", ")}` : "Walk somewhere new to clear the fog");

  return (
    <div className="space-y-2">
      <div className="relative w-full overflow-hidden rounded-lg border border-white/10" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/minimap.png" alt="Map of San Francisco" className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
        {hoods && (
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="absolute inset-0 h-full w-full">
            {hoods.map((h) => {
              const pct = explored[h.name] ?? 0;
              const fog = pct >= 60 ? 0 : 0.62 - pct / 100;
              const d = h.rings.map((r) => "M" + r.reduce<string[]>((a, v, i) => (i % 2 ? a : [...a, `${v},${r[i + 1]}`]), []).join("L") + "Z").join("");
              return (
                <path
                  key={h.name}
                  d={d}
                  fillRule="evenodd"
                  fill={`rgba(10,16,30,${fog})`}
                  stroke={glowSet.has(h.name) ? "#fcd34d" : featured === h.name ? "#f0abfc" : "rgba(255,255,255,0.25)"}
                  strokeWidth={glowSet.has(h.name) || featured === h.name ? 18 : 5}
                  className={glowSet.has(h.name) || featured === h.name ? "animate-pulse motion-reduce:animate-none" : ""}
                  onMouseEnter={() => {
                    const hz = haze?.[h.name];
                    const lifting = !!hz?.lifting;
                    setHover(
                      `${h.name} · ${pct}% explored` +
                        (glowSet.has(h.name) ? " · a wish glows here" : "") +
                        (featured === h.name ? " · ★ today's featured spirit is here" : "") +
                        (lifting ? " · the haze is lifting" : ""),
                    );
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })}
          </svg>
        )}
      </div>
      <p className="min-h-4 text-xs text-slate-400">{label}</p>
    </div>
  );
}
