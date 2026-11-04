"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import type { ConditionsView } from "@/lib/conditions/rules";
import { FAMILY_LABEL } from "@/lib/spirits/labels";

const REFRESH_MS = 5 * 60_000;

/**
 * Keeps `conditions` fresh in the store and shows a small weather chip plus the
 * daily featured-rare banner (neighbourhood hint only, spec §12).
 */
export default function WorldConditions() {
  const forced = useGame((s) => s.forcedCond);
  const c = useGame((s) => s.conditions);
  const ready = useGame((s) => s.ready);
  const [bannerHidden, setBannerHidden] = useState(true);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/conditions${forced !== null ? `?cond=${encodeURIComponent(forced)}` : ""}`)
        .then((r) => r.json() as Promise<ConditionsView>)
        .then((v) => live && useGame.setState({ conditions: v }), () => {});
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [forced]);

  // featured banner once per day per device
  useEffect(() => {
    if (!c?.featured) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem("sfs-featured-seen");
    } catch {}
    const t = setTimeout(() => setBannerHidden(seen === c.featured!.date), 0);
    return () => clearTimeout(t);
  }, [c?.featured]);

  if (!c || !ready) return null;
  const bits = [c.phase, c.fog && "fog", c.rain && "rain", c.blossom && "blossom season"].filter(Boolean).join(" · ");
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-14 rounded-md bg-slate-950/60 px-2 py-1 text-[11px] text-slate-200">
        {bits}
        {c.tempC !== null && <> · {Math.round(c.tempC)}°C</>}
        {c.source === "forced" && <span className="ml-1 text-amber-300">(dev)</span>}
      </div>
      {c.featured && !bannerHidden && (
        <div className="absolute inset-x-0 top-3 flex justify-center px-16">
          <button
            type="button"
            onClick={() => {
              setBannerHidden(true);
              try {
                localStorage.setItem("sfs-featured-seen", c.featured!.date);
              } catch {}
            }}
            className="rounded-full border border-fuchsia-200/30 bg-slate-950/80 px-4 py-1.5 text-xs text-fuchsia-100 shadow-lg"
          >
            ★ Today’s featured spirit: a {c.featured.rarity} {FAMILY_LABEL[c.featured.family] ?? "spirit"} somewhere in {c.featured.neighborhood} <span className="ml-1 text-slate-400">✕</span>
          </button>
        </div>
      )}
    </>
  );
}
