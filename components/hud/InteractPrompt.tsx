"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/lib/game/store";
import { FAMILY_LABEL } from "@/lib/spirits/labels";

/** "Press E to meet" when a spirit is within reach; tappable on touch. Also shows toasts. */
export default function InteractPrompt() {
  const nearby = useGame((s) => s.nearby);
  const busy = useGame((s) => !!s.encounter || s.atlasOpen);
  const toast = useGame((s) => s.toast);
  const [toastVisible, setToastVisible] = useState<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    const show = setTimeout(() => setToastVisible(toast.at), 0);
    const hide = setTimeout(() => setToastVisible(null), 2200);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [toast]);

  return (
    <>
      {nearby && !busy && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4 sm:bottom-10">
          <button
            type="button"
            onClick={() => useGame.setState({ encounter: nearby })}
            className="pointer-events-auto rounded-full border border-amber-200/40 bg-slate-950/80 px-4 py-2 text-sm text-amber-100 shadow-lg backdrop-blur-sm hover:bg-slate-900"
          >
            <kbd className="mr-2 hidden rounded bg-white/15 px-1.5 font-mono text-xs sm:inline">E</kbd>
            Meet the {FAMILY_LABEL[nearby.family] ?? "spirit"}
          </button>
        </div>
      )}
      {toast && toastVisible === toast.at && (
        <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center px-4">
          <p className="rounded-md bg-slate-950/75 px-3 py-1.5 text-sm text-slate-100">{toast.text}</p>
        </div>
      )}
    </>
  );
}
