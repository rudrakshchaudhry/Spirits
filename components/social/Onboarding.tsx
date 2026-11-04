"use client";
import { useEffect, useRef, useState } from "react";
import { COMPANION_PX, drawCompanion } from "@/game/companionArt";
import { bus } from "@/lib/game/bus";
import { api } from "@/lib/game/api";
import { useGame } from "@/lib/game/store";
import { latLonToTile } from "@/lib/geo/projection";
import { COMPANIONS, type CompanionSpecies } from "@/lib/social/rules";
import type { MeView } from "@/lib/social/types";

function CompanionPreview({ species }: { species: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, COMPANION_PX, COMPANION_PX);
    drawCompanion(ctx, species, 1, [], 0);
  }, [species]);
  return <canvas ref={ref} width={COMPANION_PX} height={COMPANION_PX} style={{ width: 72, height: 72, imageRendering: "pixelated" }} aria-hidden />;
}

/** First run (spec §13.1): name → home neighbourhood (crew) → companion → spawn in a home park. */
export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [handle, setHandle] = useState("");
  const [hood, setHood] = useState("");
  const [companion, setCompanion] = useState<CompanionSpecies | "">("");
  const [hoods, setHoods] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const current = useGame((s) => s.neighborhood);

  useEffect(() => {
    fetch("/neighborhoods.json").then((r) => r.json()).then((h: { name: string }[]) => setHoods(h.map((x) => x.name).sort()));
  }, []);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<MeView & { spawn: { lat: number; lon: number } | null }>("/api/profile/onboard", {
        method: "POST",
        body: JSON.stringify({ handle, home_hood: hood, companion }),
      });
      useGame.setState({ me: r });
      if (r.spawn) {
        const t = latLonToTile(r.spawn.lat, r.spawn.lon);
        bus.emit("player:teleport", { x: t.x, y: t.y });
      }
    } catch (e) {
      setErr((e as Error).message);
      if (/name|taken|kinder|letters/.test((e as Error).message)) setStep(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-slate-900 p-5 text-slate-100 shadow-2xl">
        <div>
          <h2 className="font-pixel text-2xl">Welcome to SF Spirits</h2>
          <p className="text-sm text-slate-400">Spirits live at real trees, shops, murals and landmarks all over the city.</p>
        </div>
        {step === 0 && (
          <div className="space-y-2">
            <label className="block text-sm" htmlFor="handle">What should spirits call you?</label>
            <input
              id="handle"
              autoFocus
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="e.g. fogwalker"
              maxLength={20}
              className="w-full rounded-md border border-white/15 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-300"
            />
            <p className="text-xs text-slate-500">3–20 letters, numbers, dots, dashes or underscores. Others only see this after you unlock trading.</p>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-2">
            <label className="block text-sm" htmlFor="hood">Which neighborhood is home? That&apos;s your crew.</label>
            <select id="hood" value={hood} onChange={(e) => setHood(e.target.value)} className="w-full rounded-md border border-white/15 bg-slate-950 px-3 py-2 text-sm">
              <option value="">Pick a neighborhood…</option>
              {hoods.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            {current && !hood && (
              <button type="button" className="text-xs text-amber-200 underline" onClick={() => setHood(current)}>
                Use where I am: {current}
              </button>
            )}
            <p className="text-xs text-slate-500">You can switch crews once every 30 days. We never share where you are.</p>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-2">
            <p className="text-sm">Choose a companion. They&apos;ll grow as you explore.</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(COMPANIONS) as CompanionSpecies[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCompanion(k)}
                  className={`flex flex-col items-center rounded-lg border p-2 text-center ${companion === k ? "border-amber-300 bg-amber-200/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                >
                  <CompanionPreview species={k} />
                  <span className="font-pixel">{COMPANIONS[k].name}</span>
                  <span className="text-[11px] text-slate-400">{COMPANIONS[k].blurb}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <div className="flex justify-between">
          <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-md px-3 py-2 text-sm text-slate-400 disabled:opacity-0">
            Back
          </button>
          {step < 2 ? (
            <button
              type="button"
              disabled={(step === 0 && handle.length < 3) || (step === 1 && !hood)}
              onClick={() => setStep(step + 1)}
              className="rounded-md bg-amber-300 px-4 py-2 font-pixel text-slate-900 disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button type="button" disabled={!companion || busy} onClick={submit} className="rounded-md bg-amber-300 px-4 py-2 font-pixel text-slate-900 disabled:opacity-40">
              {busy ? "…" : "Begin"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
