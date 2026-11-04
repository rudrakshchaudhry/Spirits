"use client";
import { useEffect } from "react";
import { api } from "@/lib/game/api";
import { useGame } from "@/lib/game/store";
import type { MeView } from "@/lib/social/types";
import Onboarding from "./Onboarding";

export const refreshMe = () => api<MeView>("/api/profile/me").then((me) => useGame.setState({ me }), () => {});

/** Keeps `me` fresh (after encounters, every 2 min) and shows the one next goal (spec §13.3). */
export default function MeSync() {
  const ready = useGame((s) => s.ready);
  const me = useGame((s) => s.me);
  useEffect(() => {
    if (!ready) return;
    refreshMe();
    const t = setInterval(refreshMe, 120_000);
    const unsub = useGame.subscribe((st, prev) => {
      if ((prev.encounter && !st.encounter) || st.friends !== prev.friends) refreshMe();
    });
    return () => {
      clearInterval(t);
      unsub();
    };
  }, [ready]);

  if (!ready || !me) return null;
  if (!me.profile?.onboarded_at) return <Onboarding />;
  return me.nextGoal ? (
    <div className="pointer-events-none absolute left-3 top-[5.25rem] max-w-[60vw] rounded-md bg-slate-950/60 px-2 py-1 text-[11px] text-amber-100">
      → {me.nextGoal}
    </div>
  ) : null;
}
