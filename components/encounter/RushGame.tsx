"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RushGame as RushContent } from "@/lib/encounter/games";

/**
 * "Rush Hour" (spec §9.2): the shopkeeper shows an order, then you serve the
 * items in order before each one cools. Score = items served correctly.
 */
type Phase = "show" | "serve" | "between";

export default function RushGame({ game, onDone }: { game: RushContent; onDone: (score: number, durationMs: number) => void }) {
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>("show");
  const [served, setServed] = useState<("ok" | "miss")[]>([]);
  const [timeLeft, setTimeLeft] = useState(1);
  const correct = useRef(0); // for the final score (read in a timeout)
  const [correctN, setCorrectN] = useState(0); // for display
  const start = useRef(0);
  const total = game.orders.reduce((a, o) => a + o.length, 0);
  const order = game.orders[round];
  // shelf order is shuffled per round so position memory doesn't help
  const shelf = useMemo(() => {
    const idx = game.items.map((_, i) => i);
    let s = (game.orders[round]?.length ?? 1) * 7919 + round;
    for (let i = idx.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }, [game, round]);

  useEffect(() => {
    start.current = performance.now();
  }, []);

  // show → serve
  useEffect(() => {
    if (phase !== "show") return;
    const t = setTimeout(() => {
      setPhase("serve");
      setServed([]);
    }, game.showMs + order.length * 250);
    return () => clearTimeout(t);
  }, [phase, game.showMs, order]);

  const finishRound = (marks: ("ok" | "miss")[]) => {
    if (marks.length < order.length) return;
    setPhase("between");
    setTimeout(() => {
      if (round + 1 >= game.orders.length) onDone(correct.current / total, Math.round(performance.now() - start.current));
      else {
        setRound(round + 1);
        setPhase("show");
      }
    }, 700);
  };

  // side effects stay outside the state updater (StrictMode runs updaters twice)
  const mark = (m: "ok" | "miss") => {
    if (served.length >= order.length) return;
    const next = [...served, m];
    setServed(next);
    if (m === "ok") {
      correct.current++;
      setCorrectN((n) => n + 1);
    }
    finishRound(next);
  };

  // per-item cooling timer
  useEffect(() => {
    if (phase !== "serve") return;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const left = 1 - (performance.now() - t0) / game.coolMs;
      setTimeLeft(Math.max(0, left));
      if (left <= 0) {
        mark("miss");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // restart the timer for each item served
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, served.length, round]);

  const serve = (itemIdx: number) => {
    if (phase !== "serve") return;
    mark(itemIdx === order[served.length] ? "ok" : "miss");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= shelf.length) serve(shelf[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Order {round + 1} / {game.orders.length} · a {game.shop} rush
        </span>
        <span className="font-mono">
          {correctN} / {total} served
        </span>
      </div>
      <div className="min-h-16 rounded-md bg-white/5 p-3">
        {phase === "show" ? (
          <>
            <p className="mb-2 text-xs text-slate-400">Remember this order:</p>
            <ol className="flex flex-wrap gap-1.5">
              {order.map((i, k) => (
                <li key={k} className="rounded bg-amber-200/90 px-2 py-1 text-sm font-medium text-slate-900">
                  {k + 1}. {game.items[i]}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-400">
              {phase === "serve" ? `Serve item ${served.length + 1} of ${order.length} before it cools` : "Order up!"}
            </p>
            <div className="flex gap-1.5">
              {order.map((_, k) => (
                <span
                  key={k}
                  className={`grid h-7 w-7 place-items-center rounded text-xs font-bold ${
                    served[k] === "ok" ? "bg-emerald-400 text-slate-900" : served[k] === "miss" ? "bg-rose-400 text-slate-900" : "bg-white/10 text-slate-400"
                  }`}
                >
                  {served[k] === "ok" ? "✓" : served[k] === "miss" ? "✗" : k + 1}
                </span>
              ))}
            </div>
            {phase === "serve" && (
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-white/10">
                <div className={`h-full ${timeLeft < 0.3 ? "bg-rose-400" : "bg-amber-300"}`} style={{ width: `${timeLeft * 100}%` }} />
              </div>
            )}
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {shelf.map((itemIdx, k) => (
          <button
            key={itemIdx}
            type="button"
            disabled={phase !== "serve"}
            onClick={() => serve(itemIdx)}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-2 text-left text-sm text-slate-100 hover:bg-white/10 disabled:opacity-40"
          >
            <span className="mr-1 font-mono text-xs text-slate-400">{k + 1}</span>
            {game.items[itemIdx]}
          </button>
        ))}
      </div>
    </div>
  );
}
