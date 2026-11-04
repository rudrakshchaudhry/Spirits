"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";

/** "Outer Sunset — fog rolling in" card on entering a neighbourhood (spec §4.3). */
export default function TitleCard() {
  const card = useGame((s) => s.titleCard);
  // The `at` of the last card whose display time has elapsed.
  const [expiredAt, setExpiredAt] = useState<number | null>(null);

  useEffect(() => {
    if (!card) return;
    const t = setTimeout(() => setExpiredAt(card.at), 3200);
    return () => clearTimeout(t);
  }, [card]);

  if (!card) return null;
  const visible = expiredAt !== card.at;
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute inset-x-0 top-[18%] flex justify-center px-4 transition-all duration-700 ease-out motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      <div className="rounded-md bg-slate-950/70 px-6 py-3 text-center text-slate-50 shadow-lg backdrop-blur-sm">
        <div className="font-pixel text-xl tracking-wide sm:text-2xl">{card.name}</div>
        <div className="mt-1 text-sm italic text-slate-300">— {card.tagline}</div>
      </div>
    </div>
  );
}
