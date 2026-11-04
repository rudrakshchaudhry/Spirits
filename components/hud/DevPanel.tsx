"use client";
import { useState } from "react";
import { bus } from "@/lib/game/bus";
import { api } from "@/lib/game/api";
import { useGame } from "@/lib/game/store";
import { latLonToTile } from "@/lib/geo/projection";
import { KEEPSAKES } from "@/lib/keepsakes/catalog";
import type { ConditionTag } from "@/lib/conditions/rules";

const TAGS: ConditionTag[] = ["night", "fog", "rain", "blossom"];
const PLACES: [string, number, number][] = [
  ["Valencia St", 37.759, -122.4216],
  ["Tenderloin", 37.7834, -122.416],
  ["Ocean Beach", 37.7596, -122.5105],
  ["GG Park", 37.7694, -122.4862],
  ["Chinatown", 37.7941, -122.4078],
  ["Twin Peaks", 37.7544, -122.4477],
];

/**
 * Dev conditions panel (spec §12): force conditions, jump to the featured rare,
 * grant keepsakes, teleport between showcase neighbourhoods. Shown with ?dev=1
 * when the server allows it (ALLOW_DEV_CONDITIONS=1).
 */
export default function DevPanel() {
  const dev = useGame((s) => s.devMode);
  const conditions = useGame((s) => s.conditions); // select the stable object, derive below (no new [] per render)
  const allowed = conditions?.devAllowed;
  const forced = useGame((s) => s.forcedCond);
  const live = conditions?.tags ?? [];
  const [open, setOpen] = useState(false);
  const [grant, setGrant] = useState("sea_shell");
  if (!dev || !allowed) return null;

  const active = forced !== null ? (forced.split(".").filter(Boolean) as ConditionTag[]) : live;
  const toggle = (t: ConditionTag) => {
    const next = active.includes(t) ? active.filter((x) => x !== t) : [...active, t];
    useGame.setState({ forcedCond: [...next].sort().join(".") });
  };
  const teleport = (lat: number, lon: number) => {
    const t = latLonToTile(lat, lon);
    bus.emit("player:teleport", { x: t.x, y: t.y });
  };
  const toast = (text: string) => useGame.setState({ toast: { text, at: Date.now() } });

  return (
    <div className="absolute bottom-3 left-3 z-10 hidden text-xs sm:block">
      {open ? (
        <div className="w-64 space-y-2 rounded-lg border border-amber-300/30 bg-slate-950/90 p-3 text-slate-200 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-sm text-amber-200">Dev conditions</span>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">✕</button>
          </div>
          <div className="flex flex-wrap gap-1">
            {TAGS.map((t) => (
              <button key={t} type="button" onClick={() => toggle(t)} className={`rounded px-2 py-1 ${active.includes(t) ? "bg-amber-300 text-slate-900" : "bg-white/10"}`}>
                {t}
              </button>
            ))}
            <button type="button" onClick={() => useGame.setState({ forcedCond: null })} className={`rounded px-2 py-1 ${forced === null ? "bg-emerald-300 text-slate-900" : "bg-white/10"}`}>
              live
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {PLACES.map(([n, la, lo]) => (
              <button key={n} type="button" onClick={() => teleport(la, lo)} className="rounded bg-white/10 px-2 py-1 hover:bg-white/20">
                {n}
              </button>
            ))}
            <button
              type="button"
              className="rounded bg-fuchsia-400/30 px-2 py-1 hover:bg-fuchsia-400/50"
              onClick={async () => {
                const r = await fetch("/api/featured?reveal=1").then((x) => x.json());
                if (r.featured?.location) teleport(r.featured.location.lat, r.featured.location.lon);
                else toast("No featured spirit today.");
              }}
            >
              ★ featured
            </button>
          </div>
          <div className="flex gap-1">
            <select value={grant} onChange={(e) => setGrant(e.target.value)} className="min-w-0 flex-1 rounded bg-white/10 px-1 py-1">
              {Object.values(KEEPSAKES).map((k) => (
                <option key={k.type} value={k.type} className="bg-slate-900">
                  {k.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
              onClick={() =>
                api<{ qty: number }>("/api/dev/grant", { method: "POST", body: JSON.stringify({ type: grant }) }).then(
                  (r) => toast(`Granted ${KEEPSAKES[grant].label} (×${r.qty})`),
                  (e: Error) => toast(e.message),
                )
              }
            >
              grant
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-amber-300/40 bg-slate-950/80 px-2 py-1 text-amber-200">
          dev
        </button>
      )}
    </div>
  );
}
